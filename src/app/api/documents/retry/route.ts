import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

/**
 * POST /api/documents/retry
 * Body: { documentId: string }
 * 
 * Resets a stuck/failed/stalled document and re-queues it for processing.
 */
export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    try {

        let body: { documentId: string };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
        }

        const { documentId } = body;
        if (!documentId) {
            return NextResponse.json({ success: false, message: 'Missing documentId' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();

        // 1. Fetch the document
        const { data: doc, error: docError } = await admin
            .from('platform_documents')
            .select('id, account_id, doc_type')
            .eq('id', documentId)
            .single();

        if (docError || !doc) {
            return NextResponse.json({ success: false, message: 'Document not found.' }, { status: 404 });
        }

        // 2. Clear prior parsed data to avoid unique constraint errors
        await admin.from('doc_data_rce').delete().eq('document_id', documentId);
        await admin.from('doc_data_dic').delete().eq('document_id', documentId);
        await admin.from('doc_data_es').delete().eq('document_id', documentId);

        // 3. Kill any stuck jobs for this document
        await admin
            .from('ingestion_jobs')
            .update({ status: 'failed', last_error: 'Superseded by manual retry' })
            .eq('document_id', documentId)
            .in('status', ['queued', 'processing']);

        // 4. Reset document to clean state
        await admin
            .from('platform_documents')
            .update({
                parse_status: 'pending',
                processing_step: 'queued',
                match_status: 'pending',
                match_confidence: null,
                match_log: [],
                error_message: null,
                writeback_status: 'none',
                writeback_log: [],
                raw_text: null,
                extracted_owner_name: null,
                extracted_address: null,
                extracted_address_norm: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', documentId);

        // 5. Queue fresh job
        const { error: jobError } = await admin
            .from('ingestion_jobs')
            .insert({
                document_id: documentId,
                account_id: doc.account_id,
                status: 'queued',
                attempts: 0,
                max_attempts: 5,
            });

        if (jobError) {
            logger.error('RetryDoc', 'Failed to queue retry job', { documentId, error: jobError });
            return NextResponse.json({ success: false, message: 'Failed to start processing.' }, { status: 500 });
        }

        logger.info('RetryDoc', 'Document retry queued', { documentId });
        return NextResponse.json({ success: true, message: 'Document retrying. Processing started.' });

    } catch (error) {
        logger.error('RetryDoc', 'Unexpected error', { error });
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}
