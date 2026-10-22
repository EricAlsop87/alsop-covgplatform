import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimit';

export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const VALID_DOC_TYPES = new Set([
    'rce',
    'dic_dec_page',
    'es_doc',
    'other',
    'invoice',
    'quote',
    'dec_page',
]);

/**
 * POST /api/documents/upload-direct
 *
 * Direct-to-Storage upload orchestration:
 * Action 1: 'get-upload-url' -> Authenticates, validates file metadata, checks deduplication,
 *           and creates a Supabase Storage signed upload URL. This allows clients to upload
 *           large files (> 4.5MB up to 50MB) directly to Supabase Storage, completely
 *           bypassing Vercel's 4.5MB serverless payload limit.
 *
 * Action 2: 'confirm' -> Confirms storage upload succeeded, inserts DB record, and queues
 *           the background ingestion job.
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
        if (isAuthError(auth)) return auth;
        const accountId = auth.user.id;

        const rateLimitKey = `upload-direct:${accountId}`;
        const rateCheck = checkRateLimit(rateLimitKey, 30, 60_000);
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { success: false, message: 'Rate limit exceeded. Please wait before uploading more files.', error: 'RATE_LIMIT' },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(rateCheck.resetMs / 1000)) } }
            );
        }

        let body: any;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: false, message: 'Invalid JSON body', error: 'INVALID_JSON' }, { status: 400 });
        }

        const action = body.action as string;
        const supabaseAdmin = getSupabaseAdmin();

        // ─────────────────────────────────────────────────────────────
        // ACTION 1: Get Signed Upload URL
        // ─────────────────────────────────────────────────────────────
        if (action === 'get-upload-url') {
            const fileName = String(body.fileName || '').trim();
            const fileSize = Number(body.fileSize) || 0;
            const fileHash = String(body.fileHash || '').trim().toLowerCase();
            const rawDocType = String(body.docType || 'other').trim().toLowerCase();
            const docType = rawDocType === 'quote' ? 'dic_dec_page' : rawDocType;
            const policyId = body.policyId ? String(body.policyId) : null;

            if (!fileName) {
                return NextResponse.json({ success: false, message: 'File name is required', error: 'MISSING_PARAM' }, { status: 400 });
            }

            if (!fileName.toLowerCase().endsWith('.pdf')) {
                return NextResponse.json({ success: false, message: 'Only PDF documents are supported.', error: 'INVALID_FILE_TYPE' }, { status: 400 });
            }

            if (!VALID_DOC_TYPES.has(docType)) {
                return NextResponse.json({ success: false, message: `Invalid document type: ${docType}`, error: 'INVALID_DOC_TYPE' }, { status: 400 });
            }

            if (fileSize <= 0) {
                return NextResponse.json({ success: false, message: 'File cannot be empty (0 bytes).', error: 'EMPTY_FILE' }, { status: 400 });
            }

            if (fileSize > MAX_FILE_SIZE) {
                return NextResponse.json(
                    { success: false, message: `File size (${(fileSize / 1024 / 1024).toFixed(1)}MB) exceeds 50MB limit.`, error: 'FILE_TOO_LARGE' },
                    { status: 400 }
                );
            }

            // Global deduplication check if file hash is provided
            if (fileHash && fileHash.length === 64) {
                if (docType === 'dec_page') {
                    const { data: existingDec } = await supabaseAdmin
                        .from('dec_page_submissions')
                        .select('id, status, error_message, processing_step, file_name')
                        .eq('file_hash', fileHash)
                        .neq('status', 'failed')
                        .neq('status', 'duplicate')
                        .limit(1)
                        .maybeSingle();

                    if (existingDec) {
                        return NextResponse.json(
                            {
                                success: false,
                                message: `This exact file has already been uploaded as "${existingDec.file_name || fileName}".`,
                                error: 'DUPLICATE_FILE',
                                errorCode: 'DUPLICATE',
                                data: {
                                    existingDocumentId: existingDec.id,
                                    existingStatus: existingDec.status,
                                },
                            },
                            { status: 409 }
                        );
                    }
                } else {
                    const { data: existingDoc } = await supabaseAdmin
                        .from('platform_documents')
                        .select('id, parse_status, match_status, file_name')
                        .eq('file_hash', fileHash)
                        .not('parse_status', 'eq', 'failed')
                        .limit(1)
                        .maybeSingle();

                    if (existingDoc) {
                        return NextResponse.json(
                            {
                                success: false,
                                message: `This exact file has already been uploaded as "${existingDoc.file_name || fileName}".`,
                                error: 'DUPLICATE_FILE',
                                errorCode: 'DUPLICATE',
                                data: {
                                    existingDocumentId: existingDoc.id,
                                    existingStatus: existingDoc.parse_status,
                                    existingMatchStatus: existingDoc.match_status,
                                },
                            },
                            { status: 409 }
                        );
                    }
                }
            }

            // Generate document ID and destination path
            const documentId = crypto.randomUUID();
            const bucket = docType === 'dec_page' ? 'cfp-raw-decpage' : 'cfp-platform-documents';
            const storagePath = docType === 'dec_page'
                ? `submissions/${accountId}/${documentId}.pdf`
                : `${docType}/${accountId}/${documentId}.pdf`;

            const { data: signData, error: signError } = await supabaseAdmin.storage
                .from(bucket)
                .createSignedUploadUrl(storagePath);

            if (signError || !signData?.signedUrl) {
                logger.error('UploadDirect', 'Failed to create signed upload URL', {
                    error: signError?.message,
                    bucket,
                    storagePath,
                });
                return NextResponse.json(
                    { success: false, message: 'Failed to initiate storage upload. Please try again.', error: 'SIGNED_URL_FAILED' },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                data: {
                    documentId,
                    signedUrl: signData.signedUrl,
                    token: signData.token,
                    path: signData.path,
                    bucket,
                    storagePath,
                },
            });
        }

        // ─────────────────────────────────────────────────────────────
        // ACTION 2: Confirm Upload
        // ─────────────────────────────────────────────────────────────
        if (action === 'confirm') {
            const documentId = String(body.documentId || '').trim();
            const storagePath = String(body.storagePath || '').trim();
            const fileName = String(body.fileName || '').trim();
            const fileSize = Number(body.fileSize) || 0;
            const fileHash = String(body.fileHash || '').trim();
            const rawDocType = String(body.docType || 'other').trim().toLowerCase();
            const docType = rawDocType === 'quote' ? 'dic_dec_page' : rawDocType;
            const policyId = body.policyId ? String(body.policyId) : null;
            const now = new Date().toISOString();

            if (!documentId || !storagePath || !fileName) {
                return NextResponse.json({ success: false, message: 'Missing documentId, storagePath, or fileName', error: 'MISSING_PARAM' }, { status: 400 });
            }

            if (docType === 'dec_page') {
                const { data: account } = await supabaseAdmin
                    .from('accounts')
                    .select('first_name, last_name, email, phone')
                    .eq('id', accountId)
                    .single();

                const { data: insertedDec, error: decInsertError } = await supabaseAdmin
                    .from('dec_page_submissions')
                    .insert({
                        id: documentId,
                        account_id: accountId,
                        first_name: account?.first_name || '',
                        last_name: account?.last_name || '',
                        email: account?.email || '',
                        phone: account?.phone || '',
                        file_path: storagePath,
                        storage_path: storagePath,
                        file_name: fileName,
                        file_size: fileSize,
                        file_type: 'application/pdf',
                        status: 'uploaded',
                        bucket: 'cfp-raw-decpage',
                        file_hash: fileHash,
                        created_at: now,
                        updated_at: now,
                    })
                    .select('id, storage_path')
                    .single();

                if (decInsertError || !insertedDec) {
                    logger.error('UploadDirect', 'Failed to insert dec_page_submissions', { error: decInsertError?.message, documentId });
                    return NextResponse.json({ success: false, message: 'Failed to record dec page submission.', error: 'DB_INSERT_FAILED' }, { status: 500 });
                }

                logger.info('UploadDirect', 'Dec page upload confirmed', { submissionId: documentId, storagePath });

                return NextResponse.json({
                    success: true,
                    data: {
                        submissionId: documentId,
                        storagePath,
                        fileName,
                        fileSize,
                    },
                });
            } else {
                // Platform document pipeline
                let policyTermId: string | null = null;
                if (policyId) {
                    const { data: latestTerm } = await supabaseAdmin
                        .from('policy_terms')
                        .select('id')
                        .eq('policy_id', policyId)
                        .order('effective_date', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    policyTermId = latestTerm?.id || null;
                }

                const { error: docInsertError } = await supabaseAdmin
                    .from('platform_documents')
                    .insert({
                        id: documentId,
                        account_id: accountId,
                        doc_type: docType,
                        file_name: fileName,
                        file_size: fileSize,
                        file_hash: fileHash,
                        bucket: 'cfp-platform-documents',
                        storage_path: storagePath,
                        parse_status: 'pending',
                        processing_step: 'queued',
                        match_status: policyId ? 'manual' : 'pending',
                        policy_id: policyId || null,
                        policy_term_id: policyTermId,
                        created_at: now,
                        updated_at: now,
                    });

                if (docInsertError) {
                    logger.error('UploadDirect', 'Failed to insert platform_documents', { error: docInsertError.message, documentId });
                    return NextResponse.json({ success: false, message: 'Failed to record document.', error: 'DB_INSERT_FAILED' }, { status: 500 });
                }

                // Queue background ingestion job
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
                    logger.error('UploadDirect', 'Failed to queue ingestion job', { documentId, error: jobError.message });
                }

                // Activity Event
                const docLabel = docType === 'rce' ? 'RCE Report' : (docType === 'dic_dec_page' || docType === 'quote') ? 'DIC / Full Quote' : docType.toUpperCase();
                Promise.resolve(
                    supabaseAdmin.from('activity_events').insert({
                        actor_user_id: accountId,
                        event_type: `doc.uploaded.${docType}`,
                        title: `${docLabel} uploaded`,
                        detail: `File: ${fileName} (${(fileSize / 1024).toFixed(0)} KB)`,
                        policy_id: policyId || null,
                        meta: {
                            document_id: documentId,
                            doc_type: docType,
                            file_name: fileName,
                            file_size: fileSize,
                        },
                    })
                ).catch(() => {});

                return NextResponse.json({
                    success: true,
                    data: {
                        documentId,
                        storagePath,
                        fileName,
                        fileSize,
                        docType,
                    },
                });
            }
        }

        return NextResponse.json({ success: false, message: `Unknown action: "${action}"` }, { status: 400 });
    } catch (err: any) {
        logger.error('UploadDirect', 'Unexpected error', { error: err?.message || String(err) });
        return NextResponse.json({ success: false, message: err?.message || 'Internal server error' }, { status: 500 });
    }
}
