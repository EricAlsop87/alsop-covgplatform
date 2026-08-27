import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimit';

/** Vercel function config — allow sufficient time for large PDF uploads */
export const maxDuration = 60; // seconds

/** Pipeline version — bump this to verify Vercel has deployed latest code */
const PIPELINE_VERSION = 'atomic-v2';

/** GET /api/upload — canary to verify deployment version */
export async function GET() {
    return NextResponse.json({ version: PIPELINE_VERSION, pipeline: 'atomic-insert' });
}

/** Maximum file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed MIME types — PDF only (image support planned for future) */
const ALLOWED_TYPES = new Set([
    'application/pdf',
]);

/** Typed API response */
interface UploadResponse {
    success: boolean;
    message: string;
    data?: {
        submissionId: string;
        storagePath: string;
        fileName: string;
        fileSize: number;
        submittedBy: string;
        submittedAt: string;
    };
    error?: string;
}

/**
 * Mark a submission row as failed with error details.
 */
async function markSubmissionFailed(
    submissionId: string,
    errorMessage: string,
    errorDetail: Record<string, unknown>
) {
    const admin = getSupabaseAdmin();
    const { error } = await admin
        .from('dec_page_submissions')
        .update({
            status: 'failed',
            error_message: errorMessage,
            error_detail: errorDetail,
            updated_at: new Date().toISOString(),
        })
        .eq('id', submissionId);

    if (error) {
        logger.error('Upload', 'Failed to mark submission as failed', {
            submissionId,
            dbError: error.message,
        });
    }
}

/**
 * POST /api/upload
 *
 * Auth-required, DB-First Submission Pipeline:
 * 1. Authenticate user via Bearer token (required)
 * 2. Parse & validate file
 * 3. Fetch user info from accounts table
 * 4. INSERT into dec_page_submissions (status='pending') → get submission_id
 * 5. Upload file to submissions/{account_id}/{submission_id}.pdf
 * 6. UPDATE row: status='uploaded', storage_path, file_path
 * 7. On error after step 4: UPDATE status='failed', error_message, error_detail
 */
export async function POST(request: NextRequest): Promise<NextResponse<UploadResponse> | NextResponse> {
    let submissionId: string | null = null;

    try {
        const supabaseAdmin = getSupabaseAdmin();

        // ---------------------------------------------------------------
        // 1. Authenticate user (REQUIRED)
        // ---------------------------------------------------------------
        const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
        if (isAuthError(auth)) return auth;
        const accountId = auth.user.id;
        
        const rateLimitKey = `upload:${auth.user.id}`;
        const rateCheck = checkRateLimit(rateLimitKey, 20, 60_000); // 20 uploads/min
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please wait before uploading more files.' },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(rateCheck.resetMs / 1000)) } }
            );
        }

        logger.info('Upload', 'Authenticated user', { accountId });

        // ---------------------------------------------------------------
        // 2. Parse & validate file
        // ---------------------------------------------------------------
        let formData: FormData;
        try {
            formData = await request.formData();
        } catch {
            logger.error('Upload', 'Failed to parse form data');
            return NextResponse.json(
                { success: false, message: 'Invalid form data', error: 'PARSE_ERROR' },
                { status: 400 }
            );
        }

        const file = formData.get('file') as File | null;
        if (!file) {
            return NextResponse.json(
                { success: false, message: 'No file provided', error: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        if (!ALLOWED_TYPES.has(file.type)) {
            logger.warn('Upload', 'Invalid file type', { type: file.type });
            return NextResponse.json(
                { success: false, message: `Unsupported file type: ${file.type}. Only PDF files are accepted.`, error: 'INVALID_FILE_TYPE' },
                { status: 400 }
            );
        }

        if (file.size === 0) {
            logger.warn('Upload', 'Empty file submitted', { name: file.name });
            return NextResponse.json(
                { success: false, message: 'The uploaded file is empty (0 bytes). Please select a valid PDF.', error: 'EMPTY_FILE' },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            logger.warn('Upload', 'File too large', { size: file.size });
            return NextResponse.json(
                { success: false, message: `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the 10MB limit.`, error: 'FILE_TOO_LARGE' },
                { status: 400 }
            );
        }

        // Validate PDF magic bytes (%PDF-) to reject spoofed files
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        if (fileBuffer.length < 4 || fileBuffer[0] !== 0x25 || fileBuffer[1] !== 0x50 || fileBuffer[2] !== 0x44 || fileBuffer[3] !== 0x46) {
            logger.warn('Upload', 'File does not have valid PDF magic bytes', { name: file.name });
            return NextResponse.json(
                { success: false, message: 'The uploaded file is not a valid PDF document.', error: 'CORRUPTED_FILE' },
                { status: 400 }
            );
        }

        // ---------------------------------------------------------------
        // 3. Fetch user info
        // ---------------------------------------------------------------
        const { data: account, error: accountError } = await supabaseAdmin
            .from('accounts')
            .select('first_name, last_name, email, phone')
            .eq('id', accountId)
            .single();

        if (accountError || !account) {
            logger.error('Upload', 'Failed to fetch account info', {
                accountId,
                error: accountError?.message,
            });
            return NextResponse.json(
                { success: false, message: 'Could not retrieve your account information. Please contact support.', error: 'ACCOUNT_NOT_FOUND' },
                { status: 500 }
            );
        }

        // ---------------------------------------------------------------
        // 4. DB-FIRST: Insert dec_page_submissions row (status='pending')
        // ---------------------------------------------------------------
        const now = new Date().toISOString();
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // Check for existing duplicate (exact file match by same account)
        // Only block if the original was successfully processed or is actively processing.
        // Stuck/errored submissions should NOT block re-uploads (Tahseen Halool bug fix).
        const { data: existingDuplicate } = await supabaseAdmin
            .from('dec_page_submissions')
            .select('id, status, error_message, processing_step')
            .eq('file_hash', fileHash)
            .eq('account_id', accountId)
            .neq('status', 'failed')
            .neq('status', 'duplicate')
            .limit(1)
            .maybeSingle();

        if (existingDuplicate) {
            // Check if the "duplicate" is actually stuck/errored — if so, supersede it
            // rather than blocking the re-upload. This prevents dead-end loops where
            // a failed original blocks all re-uploads forever.
            const isStuck = existingDuplicate.error_message && (
                existingDuplicate.status === 'queued' ||
                existingDuplicate.status === 'pending' ||
                (existingDuplicate.status === 'uploaded' && existingDuplicate.error_message)
            );

            if (isStuck) {
                logger.info('Upload', 'Original submission is stuck/errored — superseding it', {
                    originalId: existingDuplicate.id,
                    originalStatus: existingDuplicate.status,
                    originalError: existingDuplicate.error_message?.substring(0, 100),
                });

                // Mark the stuck original as failed so it doesn't block future uploads
                await supabaseAdmin
                    .from('dec_page_submissions')
                    .update({
                        status: 'failed',
                        error_message: 'Superseded by re-upload',
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', existingDuplicate.id);

                // Also fail its stuck ingestion jobs
                await supabaseAdmin
                    .from('ingestion_jobs')
                    .update({
                        status: 'failed',
                        last_error: 'Superseded by re-upload of same file',
                        updated_at: new Date().toISOString(),
                    })
                    .eq('submission_id', existingDuplicate.id)
                    .neq('status', 'done');

                // Fall through to normal upload flow below (no return)
            } else {
                logger.info('Upload', 'Duplicate file detected, skipping upload and processing', {
                    fileHash,
                    existingId: existingDuplicate.id,
                    accountId
                });

            // Insert a tracking record for the duplicate attempt (status='duplicate')
            // This displays beautifully on the Agent Activity Feed without breaking things.
            const { data: dupRow, error: dupError } = await supabaseAdmin
                .from('dec_page_submissions')
                .insert({
                    account_id: accountId,
                    first_name: account.first_name || '',
                    last_name: account.last_name || '',
                    email: account.email || '',
                    phone: account.phone || '',
                    file_path: '',
                    file_name: file.name,
                    file_size: file.size,
                    file_type: file.type,
                    status: 'duplicate',
                    error_message: 'Duplicate matched against an existing document',
                    bucket: 'cfp-raw-decpage',
                    file_hash: fileHash,
                    duplicate_of: existingDuplicate.id,
                    created_at: now,
                    updated_at: now,
                })
                .select('id')
                .single();

            if (dupError) {
                logger.error('Upload', 'Failed to insert duplicate tracking row (non-fatal)', { error: dupError.message });
            } else if (dupRow?.id) {
                // CRITICAL FIX: The DB has an auto-trigger that queues an ingestion job for ALL inserts.
                // We must instantly delete the job that the trigger just created, or the worker will crash 
                // trying to process this dummy tracking row.
                await supabaseAdmin
                    .from('ingestion_jobs')
                    .delete()
                    .eq('submission_id', dupRow.id);

                // FEATURE REQUEST: Link this duplicate tracker to the original policy so it shows in the Activity Feed beautifully
                // 1. Find if the original `existingDuplicate.id` has a linked `dec_pages` record yet.
                const { data: originalDecPage } = await supabaseAdmin
                    .from('dec_pages')
                    .select('policy_id, client_id, insured_name, policy_number')
                    .eq('submission_id', existingDuplicate.id)
                    .maybeSingle();

                // 2. If it does, clone that mapping for our new tracking row!
                if (originalDecPage) {
                    await supabaseAdmin.from('dec_pages').insert({
                        submission_id: dupRow.id,
                        policy_id: originalDecPage.policy_id,
                        client_id: originalDecPage.client_id,
                        insured_name: originalDecPage.insured_name,
                        policy_number: originalDecPage.policy_number,
                        parse_status: 'manual' // Skips AI pipeline dependencies
                    });
                }
            }

            const submittedBy = [account.first_name, account.last_name].filter(Boolean).join(' ') || account.email || 'User';

            return NextResponse.json(
                {
                    success: true,
                    message: 'Duplicate document recognized. Linking to existing record.',
                    data: {
                        submissionId: existingDuplicate.id, // Always return the parent ID that actually gets processed!
                        storagePath: '',
                        fileName: file.name,
                        fileSize: file.size,
                        submittedBy,
                        submittedAt: now,
                    },
                },
                { status: 200 } // Send success so the UI clears the upload state smoothly
            );
            } // end else (not stuck)
        }

        // ---------------------------------------------------------------
        // 4. Generate submission ID upfront so we can build the storage path
        //    BEFORE inserting into the database. This makes the flow atomic:
        //    Upload → single INSERT (with storage_path) → INSERT job
        //    No more dangerous INSERT→UPDATE two-step.
        // ---------------------------------------------------------------
        submissionId = crypto.randomUUID();
        const storagePath = `submissions/${accountId}/${submissionId}.pdf`;

        // ---------------------------------------------------------------
        // 5. Upload file to storage FIRST
        //    If this fails, we haven't touched the DB at all — clean failure.
        // ---------------------------------------------------------------
        logger.info('Upload', 'Uploading file to storage', { submissionId, storagePath, fileSize: file.size });

        const { error: uploadError } = await supabaseAdmin.storage
            .from('cfp-raw-decpage')
            .upload(storagePath, fileBuffer, {
                contentType: file.type,
                upsert: false,
            });

        if (uploadError) {
            logger.error('Upload', 'Storage upload failed', {
                message: uploadError.message,
                storagePath,
            });

            return NextResponse.json(
                { success: false, message: 'Failed to upload file. Please try again.', error: 'STORAGE_UPLOAD_FAILED' },
                { status: 500 }
            );
        }

        // ---------------------------------------------------------------
        // 6. SINGLE atomic INSERT with storage_path already populated.
        //    No more two-step INSERT→UPDATE race condition.
        // ---------------------------------------------------------------
        const { data: insertedRow, error: insertError } = await supabaseAdmin
            .from('dec_page_submissions')
            .insert({
                id: submissionId,
                account_id: accountId,
                first_name: account.first_name || '',
                last_name: account.last_name || '',
                email: account.email || '',
                phone: account.phone || '',
                file_path: storagePath,
                storage_path: storagePath,
                file_name: file.name,
                file_size: file.size,
                file_type: file.type,
                status: 'uploaded',
                bucket: 'cfp-raw-decpage',
                file_hash: fileHash,
                created_at: now,
                updated_at: now,
            })
            .select('id, storage_path')
            .single();

        if (insertError || !insertedRow) {
            logger.error('Upload', 'Failed to insert submission row', {
                error: insertError?.message,
                code: insertError?.code,
                submissionId,
            });

            // Clean up the orphaned storage file
            try {
                await supabaseAdmin.storage.from('cfp-raw-decpage').remove([storagePath]);
                logger.info('Upload', 'Cleaned up orphan storage file after INSERT failure', { storagePath });
            } catch (cleanupErr) {
                logger.error('Upload', 'Failed to clean up orphan storage file', {
                    storagePath,
                    error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
                });
            }

            return NextResponse.json(
                { success: false, message: 'Failed to create submission record. Please try again.', error: 'DB_INSERT_FAILED' },
                { status: 500 }
            );
        }

        logger.info('Upload', 'Submission created with storage_path in single INSERT', {
            submissionId,
            storagePath,
            confirmedPath: insertedRow.storage_path,
        });

        // ---------------------------------------------------------------
        // 7. Ingestion job: handled by DB trigger on dec_page_submissions INSERT.
        //    The trigger auto-creates a queued ingestion_jobs row for every insert.
        //    We previously ALSO inserted a job here manually, which created
        //    DUPLICATE jobs — two workers would race on the same submission,
        //    causing status flicker and stuck-processing states.
        //    See line ~282 where we DELETE the trigger-created job for duplicates.
        //    The worker's claim_next_job() handles NULL run_after correctly
        //    via .or_("run_after.lte.now,run_after.is.null").
        // ---------------------------------------------------------------
        logger.info('Upload', 'Ingestion job will be created by DB trigger', { submissionId });

        // ---------------------------------------------------------------
        // 8. Activity event: dec page uploaded (fire-and-forget, non-critical)
        // ---------------------------------------------------------------
        const submittedBy = [account.first_name, account.last_name].filter(Boolean).join(' ') || account.email || 'Unknown user';

        // Don't await — this is non-critical and saves ~200ms
        Promise.resolve(
            supabaseAdmin.from('activity_events').insert({
                actor_user_id: accountId,
                event_type: 'dec.uploaded',
                title: `Declaration uploaded by ${submittedBy}`,
                detail: `File: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
                meta: { submission_id: submissionId, file_name: file.name, file_size: file.size },
            })
        ).catch((e: unknown) => {
            logger.warn('Upload', `Activity event insert failed (non-fatal): ${e}`);
        });

        // ---------------------------------------------------------------
        // 9. Return success
        // ---------------------------------------------------------------
        return NextResponse.json(
            {
                success: true,
                message: 'Declaration page submitted successfully!',
                data: {
                    submissionId: submissionId!,
                    storagePath,
                    fileName: file.name,
                    fileSize: file.size,
                    submittedBy,
                    submittedAt: now,
                },
            },
            { status: 200 }
        );
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Upload', 'Unexpected error in upload handler', {
            error: errorMessage,
            stack: err instanceof Error ? err.stack : undefined,
        });

        if (submissionId) {
            await markSubmissionFailed(submissionId, 'Unexpected server error', {
                error: errorMessage,
                stack: err instanceof Error ? err.stack : undefined,
            });
        }

        return NextResponse.json(
            { success: false, message: 'An unexpected error occurred. Please try again.', error: 'INTERNAL_SERVER_ERROR' },
            { status: 500 }
        );
    }
}
