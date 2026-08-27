import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    try {

        let body: { documentId: string; policyId: string };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
        }

        const { documentId, policyId } = body;
        if (!documentId || !policyId) {
            return NextResponse.json({ success: false, message: 'Missing documentId or policyId' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();

        // 1. Verify policy exists and get its client_id
        const { data: policy, error: policyError } = await admin
            .from('policies')
            .select('client_id')
            .eq('id', policyId)
            .single();

        if (policyError || !policy) {
            return NextResponse.json({ success: false, message: 'Selected policy not found.' }, { status: 404 });
        }

        // 1b. Look up the latest policy_term_id for DIC writeback
        const { data: latestTerm } = await admin
            .from('policy_terms')
            .select('id')
            .eq('policy_id', policyId)
            .order('effective_date', { ascending: false })
            .limit(1)
            .single();

        const policyTermId = latestTerm?.id || null;

        // 2. Clear out any existing parsed data attached to this document that might cause unique constraint conflicts
        await admin.from('doc_data_rce').delete().eq('document_id', documentId);
        await admin.from('doc_data_dic').delete().eq('document_id', documentId);

        // 3. Update platform_documents: reset tracking & set match_status = manual
        const { data: doc, error: docError } = await admin
            .from('platform_documents')
            .update({
                match_status: 'manual',
                policy_id: policyId,
                client_id: policy.client_id,
                policy_term_id: policyTermId,
                parse_status: 'pending',
                processing_step: 'queued',
                writeback_status: 'none',
                writeback_log: [],
                error_message: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', documentId)
            .select('account_id')
            .single();

        if (docError || !doc) {
            logger.error('ManualAssign', 'Failed to update platform_documents', { documentId, error: docError });
            return NextResponse.json({ success: false, message: 'Failed to update document.' }, { status: 500 });
        }

        // 4. Queue a new job for the worker
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
            logger.error('ManualAssign', 'Failed to queue re-processing job', { documentId, error: jobError });
            return NextResponse.json({ success: false, message: 'Failed to start processing job.' }, { status: 500 });
        }

        logger.info('ManualAssign', 'Document manually assigned and queued', { documentId, policyId });

        return NextResponse.json({ success: true, message: 'Document manually assigned. Processing started.' });

    } catch (error) {
        logger.error('ManualAssign', 'Unexpected error', { error });
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}
