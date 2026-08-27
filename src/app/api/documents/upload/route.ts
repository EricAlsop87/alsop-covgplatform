import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimit';

/** Vercel function config */
export const maxDuration = 60;

/** Maximum file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed MIME types */
const ALLOWED_TYPES = new Set(['application/pdf']);

/** Valid document types */
const VALID_DOC_TYPES = new Set([
    'rce',
    'dic_dec_page',
    'es_doc',
    'other',
    'invoice',
    'inspection',
    'endorsement',
    'questionnaire',
]);

/** Storage bucket for platform documents */
const STORAGE_BUCKET = 'cfp-platform-documents';

/** API response types */
interface DocumentUploadResponse {
    success: boolean;
    message: string;
    data?: {
        documentId?: string;
        storagePath?: string;
        fileName?: string;
        fileSize?: number;
        docType?: string;
        submittedBy?: string;
        submittedAt?: string;
        existingDocumentId?: string;
        existingStatus?: string;
        existingMatchStatus?: string;
    };
    error?: string;
    errorCode?: string;
}

/**
 * GET /api/documents/upload — canary endpoint
 */
export async function GET() {
    return NextResponse.json({
        version: 'documents-v1',
        pipeline: 'platform-documents',
        supported_types: Array.from(VALID_DOC_TYPES),
    });
}

/**
 * POST /api/documents/upload
 *
 * Auth-required document upload pipeline for RCE, DIC, and future doc types.
 * 
 * FormData fields:
 *   - file: PDF file (required)
 *   - doc_type: 'rce' | 'dic_dec_page' | ... (required)
 *   - policy_id: UUID (optional — pre-link if uploading from policy page)
 *
 * Pipeline:
 *   1. Authenticate user via Bearer token
 *   2. Validate file and doc_type
 *   3. Hash file for dedup detection
 *   4. INSERT into platform_documents (parse_status='pending')
 *   5. Upload to cfp-platform-documents storage bucket
 *   6. UPDATE platform_documents with storage_path
 *   7. Queue ingestion_jobs with document_id
 */
export async function POST(request: NextRequest): Promise<NextResponse<DocumentUploadResponse> | NextResponse> {
    let documentId: string | null = null;

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

        logger.info('DocumentUpload', 'Authenticated user', { accountId });

        // ---------------------------------------------------------------
        // 2. Parse & validate form data
        // ---------------------------------------------------------------
        let formData: FormData;
        try {
            formData = await request.formData();
        } catch {
            return NextResponse.json(
                { success: false, message: 'Invalid form data', error: 'PARSE_ERROR' },
                { status: 400 }
            );
        }

        const file = formData.get('file') as File | null;
        const docType = formData.get('doc_type') as string | null;
        const policyId = formData.get('policy_id') as string | null;

        if (!file) {
            return NextResponse.json(
                { success: false, message: 'No file provided', error: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        if (!docType || !VALID_DOC_TYPES.has(docType)) {
            return NextResponse.json(
                {
                    success: false,
                    message: `Invalid document type: "${docType}". Valid types: ${Array.from(VALID_DOC_TYPES).join(', ')}`,
                    error: 'INVALID_DOC_TYPE',
                },
                { status: 400 }
            );
        }

        if (!ALLOWED_TYPES.has(file.type)) {
            return NextResponse.json(
                { success: false, message: `Unsupported file type: ${file.type}. Only PDF files are accepted.`, error: 'INVALID_FILE_TYPE' },
                { status: 400 }
            );
        }

        if (file.size === 0) {
            return NextResponse.json(
                { success: false, message: 'The uploaded file is empty (0 bytes). Please select a valid PDF.', error: 'EMPTY_FILE' },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { success: false, message: `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the 10MB limit.`, error: 'FILE_TOO_LARGE' },
                { status: 400 }
            );
        }

        // Validate PDF magic bytes (%PDF-) to reject spoofed files
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        if (fileBuffer.length < 4 || fileBuffer[0] !== 0x25 || fileBuffer[1] !== 0x50 || fileBuffer[2] !== 0x44 || fileBuffer[3] !== 0x46) {
            logger.warn('DocumentUpload', 'File does not have valid PDF magic bytes', { name: file.name });
            return NextResponse.json(
                { success: false, message: 'The uploaded file is not a valid PDF document.', error: 'CORRUPTED_FILE' },
                { status: 400 }
            );
        }

        // ---------------------------------------------------------------
        // 3. Read file and compute hash
        // ---------------------------------------------------------------
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // Check for duplicate
        const { data: existingDuplicate } = await supabaseAdmin
            .from('platform_documents')
            .select('id, parse_status, match_status')
            .eq('file_hash', fileHash)
            .eq('account_id', accountId)
            .not('parse_status', 'eq', 'failed')
            .limit(1);

        if (existingDuplicate && existingDuplicate.length > 0) {
            const existing = existingDuplicate[0];
            logger.warn('DocumentUpload', 'Duplicate file detected', {
                existingId: existing.id,
                fileHash,
            });
            return NextResponse.json(
                {
                    success: false,
                    message: 'This exact file has already been uploaded.',
                    error: 'DUPLICATE_FILE',
                    errorCode: 'DUPLICATE',
                    data: {
                        existingDocumentId: existing.id,
                        existingStatus: existing.parse_status,
                        existingMatchStatus: existing.match_status,
                    },
                },
                { status: 409 }
            );
        }

        // ---------------------------------------------------------------
        // 4. Upload to storage FIRST (before creating any DB records)
        //    This ensures we never create orphan DB rows without a file.
        // ---------------------------------------------------------------
        // If uploaded from a policy page, resolve policy_term_id for writeback
        let policyTermId: string | null = null;
        if (policyId) {
            const { data: latestTerm } = await supabaseAdmin
                .from('policy_terms')
                .select('id')
                .eq('policy_id', policyId)
                .order('effective_date', { ascending: false })
                .limit(1)
                .single();
            policyTermId = latestTerm?.id || null;
        }

        // Generate document ID upfront so storage path is deterministic
        documentId = crypto.randomUUID();
        const storagePath = `${docType}/${accountId}/${documentId}.pdf`;

        const { error: storageError } = await supabaseAdmin
            .storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, fileBuffer, {
                contentType: 'application/pdf',
                upsert: false,
            });

        if (storageError) {
            logger.error('DocumentUpload', 'Storage upload failed', {
                documentId,
                storagePath,
                error: storageError.message,
            });
            documentId = null; // No DB row to clean up
            return NextResponse.json(
                { success: false, message: 'Failed to upload file to storage. Please try again.', error: 'STORAGE_ERROR' },
                { status: 500 }
            );
        }

        // ---------------------------------------------------------------
        // 5. Single atomic INSERT with storage_path already populated
        //    Worker can safely download immediately after claiming the job.
        // ---------------------------------------------------------------
        const now = new Date().toISOString();
        const { error: insertError } = await supabaseAdmin
            .from('platform_documents')
            .insert({
                id: documentId,
                account_id: accountId,
                doc_type: docType,
                file_name: file.name,
                file_size: file.size,
                file_hash: fileHash,
                bucket: STORAGE_BUCKET,
                storage_path: storagePath,
                parse_status: 'pending',
                processing_step: 'queued',
                match_status: policyId ? 'manual' : 'pending',
                policy_id: policyId || null,
                policy_term_id: policyTermId,
                created_at: now,
                updated_at: now,
            });

        if (insertError) {
            logger.error('DocumentUpload', 'Failed to insert platform_documents', {
                documentId,
                error: insertError.message,
            });

            // Clean up the orphaned storage file
            try {
                await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([storagePath]);
                logger.info('DocumentUpload', 'Cleaned up storage after DB insert failure', { storagePath });
            } catch (cleanupErr) {
                logger.warn('DocumentUpload', `Failed to clean up storage: ${cleanupErr}`);
            }

            documentId = null; // No DB row exists
            return NextResponse.json(
                { success: false, message: 'Failed to create document record. Please try again.', error: 'DB_INSERT_FAILED' },
                { status: 500 }
            );
        }

        logger.info('DocumentUpload', 'Created document record with storage_path', {
            documentId,
            docType,
            fileName: file.name,
            fileSize: file.size,
            storagePath,
        });

        // ---------------------------------------------------------------
        // 6. Queue ingestion job
        // ---------------------------------------------------------------
        const { error: jobError } = await supabaseAdmin
            .from('ingestion_jobs')
            .insert({
                document_id: documentId,
                account_id: accountId,
                status: 'queued',
                attempts: 0,
                max_attempts: 5,
                created_at: now,
                updated_at: now,
            });

        if (jobError) {
            logger.error('DocumentUpload', 'Failed to queue ingestion job', {
                documentId,
                error: jobError.message,
            });
            // Non-fatal: document is stored, job can be manually retried
        }

        logger.info('DocumentUpload', 'Upload complete', {
            documentId,
            docType,
            storagePath,
            jobQueued: !jobError,
        });

        // Activity Event for Dashboard Feed (fire-and-forget)
        const docLabel = docType === 'rce' ? 'RCE Report' : docType === 'dic_dec_page' ? 'DIC Declaration' : docType.toUpperCase();
        Promise.resolve(
            supabaseAdmin.from('activity_events').insert({
                actor_user_id: accountId,
                event_type: `doc.uploaded.${docType}`,
                title: `${docLabel} uploaded`,
                detail: `File: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
                policy_id: policyId || null,
                meta: {
                    document_id: documentId,
                    doc_type: docType,
                    file_name: file.name,
                    file_size: file.size,
                },
            })
        ).catch(() => { /* non-fatal */ });

        return NextResponse.json(
            {
                success: true,
                message: `${docType.toUpperCase()} uploaded successfully. Processing will begin shortly.`,
                data: {
                    documentId: documentId!,
                    storagePath,
                    fileName: file.name,
                    fileSize: file.size,
                    docType,
                    submittedBy: accountId,
                    submittedAt: now,
                },
            },
            { status: 201 }
        );

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('DocumentUpload', 'Unexpected error', { error: errorMessage, documentId });

        // Try to mark document as failed
        if (documentId) {
            try {
                const admin = getSupabaseAdmin();
                await admin
                    .from('platform_documents')
                    .update({
                        parse_status: 'failed',
                        error_message: `Unexpected error: ${errorMessage.slice(0, 500)}`,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', documentId);
            } catch {
                // Best-effort
            }
        }

        return NextResponse.json(
            { success: false, message: 'An unexpected error occurred. Please try again.', error: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}
