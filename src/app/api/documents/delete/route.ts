import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    try {

        let body: { id: string; source: 'dec_page' | 'platform' };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
        }

        const { id, source } = body;
        if (!id || !source) {
            return NextResponse.json({ success: false, message: 'Missing id or source' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();
        let bucket = '';
        let storagePath = null;

        // 1. Fetch record to get storage_path
        if (source === 'dec_page') {
            const { data, error } = await admin.from('dec_pages').select('storage_path, file_path').eq('id', id).single();
            if (error || !data) {
                return NextResponse.json({ success: false, message: 'Record not found' }, { status: 404 });
            }
            bucket = 'cfp-raw-decpage';
            storagePath = data.storage_path || data.file_path;
        } else if (source === 'platform') {
            const { data, error } = await admin.from('platform_documents').select('storage_path, doc_type, policy_id, policy_term_id, writeback_log').eq('id', id).single();
            if (error || !data) {
                return NextResponse.json({ success: false, message: 'Record not found' }, { status: 404 });
            }
            bucket = 'cfp-platform-documents';
            storagePath = data.storage_path;

            // RCE-specific cleanup before deleting the document
            if (data.doc_type === 'rce' && data.policy_id) {
                // a. Delete extracted RCE data
                const { error: rceErr } = await admin.from('doc_data_rce').delete().eq('document_id', id);
                if (rceErr) {
                    logger.warn('DocumentDelete', 'Failed to delete doc_data_rce', { id, error: rceErr });
                }

                // b. Delete RCE-sourced property enrichments
                const { error: enrichErr } = await admin.from('property_enrichments').delete().eq('policy_id', data.policy_id).eq('source_name', 'rce_360value');
                if (enrichErr) {
                    logger.warn('DocumentDelete', 'Failed to delete property_enrichments', { policyId: data.policy_id, error: enrichErr });
                }

                // c. Rollback policy_terms fields written by this document
                if (data.policy_term_id && Array.isArray(data.writeback_log)) {
                    const writeEntries = (data.writeback_log as Array<{ action?: string; target?: string; value?: unknown }>)
                        .filter((e) => e.action === 'written' && typeof e.target === 'string' && e.target.startsWith('policy_terms.'));

                    if (writeEntries.length > 0) {
                        const { data: currentTerm } = await admin.from('policy_terms').select('*').eq('id', data.policy_term_id).single();

                        if (currentTerm) {
                            const nullUpdates: Record<string, null> = {};
                            for (const entry of writeEntries) {
                                const field = (entry.target as string).replace('policy_terms.', '');
                                if (field in currentTerm && currentTerm[field] === entry.value) {
                                    nullUpdates[field] = null;
                                }
                            }
                            if (Object.keys(nullUpdates).length > 0) {
                                const { error: rollbackErr } = await admin.from('policy_terms').update(nullUpdates).eq('id', data.policy_term_id);
                                if (rollbackErr) {
                                    logger.warn('DocumentDelete', 'Failed to rollback policy_terms', { termId: data.policy_term_id, error: rollbackErr });
                                } else {
                                    logger.info('DocumentDelete', 'Rolled back policy_terms fields', { termId: data.policy_term_id, fields: Object.keys(nullUpdates) });
                                }
                            }
                        }
                    }
                }

                logger.info('DocumentDelete', 'RCE cleanup complete', { id, policyId: data.policy_id });
            }

            // DIC-specific cleanup before deleting the document
            if (data.doc_type === 'dic_dec_page') {
                // a. Delete extracted DIC data
                const { error: dicErr } = await admin.from('doc_data_dic').delete().eq('document_id', id);
                if (dicErr) {
                    logger.warn('DocumentDelete', 'Failed to delete doc_data_dic', { id, error: dicErr });
                }

                // b. Rollback dic_* fields on policy_terms
                if (data.policy_term_id) {
                    const dicNullUpdates: Record<string, null | boolean> = {
                        dic_exists: false,
                        dic_limit_dwelling: null,
                        dic_limit_other_structures: null,
                        dic_limit_personal_property: null,
                        dic_limit_loss_of_use: null,
                        dic_deductible: null,
                        dic_annual_premium_raw: null,
                        dic_policy_number: null,
                    };
                    const { error: rollbackErr } = await admin.from('policy_terms').update(dicNullUpdates).eq('id', data.policy_term_id);
                    if (rollbackErr) {
                        logger.warn('DocumentDelete', 'Failed to rollback DIC policy_terms', { termId: data.policy_term_id, error: rollbackErr });
                    } else {
                        logger.info('DocumentDelete', 'Rolled back DIC policy_terms fields', { termId: data.policy_term_id });
                    }
                }

                // c. Remove DIC-embedded enrichments
                if (data.policy_id) {
                    await admin.from('property_enrichments').delete().eq('policy_id', data.policy_id).eq('source_name', 'dic_embedded_360value');
                }

                logger.info('DocumentDelete', 'DIC cleanup complete', { id, policyId: data.policy_id });
            }

            // E&S-specific cleanup before deleting the document
            if (data.doc_type === 'es_doc' || data.doc_type === 'other') {
                const { error: esErr } = await admin.from('doc_data_es').delete().eq('document_id', id);
                if (esErr && esErr.code !== '42P01') {
                    logger.warn('DocumentDelete', 'Failed to delete doc_data_es', { id, error: esErr });
                }

                if (data.policy_term_id) {
                    const esNullUpdates = {
                        es_exists: false,
                        es_policy_number: null,
                        es_annual_premium_raw: null,
                    };
                    const { error: rollbackErr } = await admin.from('policy_terms').update(esNullUpdates).eq('id', data.policy_term_id);
                    if (rollbackErr && rollbackErr.code !== '42703') {
                        logger.warn('DocumentDelete', 'Failed to rollback E&S policy_terms', { termId: data.policy_term_id, error: rollbackErr });
                    }
                }
                logger.info('DocumentDelete', 'E&S cleanup complete', { id, policyId: data.policy_id });
            }
        } else {
            return NextResponse.json({ success: false, message: 'Invalid source' }, { status: 400 });
        }

        // 2. Delete from DB (this will automatically cascade or orphan if needed, but for files we just delete the row)
        // If it's a dec_page, deleting the dec_page will also remove it from the UI. 
        if (source === 'dec_page') {
            await admin.from('dec_pages').delete().eq('id', id);
            await admin.from('dec_page_submissions').delete().eq('duplicate_of', id); // Optionally clean up linked submissions
        } else {
            // Clean up FK references first
            await admin.from('ingestion_jobs').delete().eq('document_id', id);
            const { error: delErr } = await admin.from('platform_documents').delete().eq('id', id);
            if (delErr) {
                logger.error('DocumentDelete', 'Failed to delete platform_documents row', { id, error: delErr.message, code: delErr.code });
                return NextResponse.json({ success: false, message: `Delete failed: ${delErr.message}` }, { status: 500 });
            }
        }

        // 3. Delete from Storage
        if (storagePath) {
            const { error: storageError } = await admin.storage.from(bucket).remove([storagePath]);
            if (storageError) {
                logger.warn('DocumentDelete', 'Failed to delete from storage', { bucket, storagePath, error: storageError });
            }
        }

        logger.info('DocumentDelete', 'Document successfully deleted', { id, source });
        return NextResponse.json({ success: true, message: 'Document deleted successfully' });
    } catch (error) {
        logger.error('DocumentDelete', 'Unexpected error', { error });
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}
