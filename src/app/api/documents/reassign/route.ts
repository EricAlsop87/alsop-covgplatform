import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

function normalizeAddress(raw: string | null): string | null {
    if (!raw) return null;
    return raw.toUpperCase().replace(/,/g, '').replace(/\s+/g, ' ').trim() || null;
}

/**
 * POST /api/documents/reassign
 *
 * Mode 1 — Reassign to existing policy:
 *   Body: { documentId: string; newPolicyId: string }
 *
 * Mode 2 — Reassign to a NEW client/policy:
 *   Body: { documentId: string; createNew: true; ownerName: string; propertyAddress?: string }
 *
 * Both modes perform full cleanup of old data before reassigning:
 *   1. Deletes extracted data (doc_data_rce, doc_data_dic)
 *   2. Deletes RCE-sourced property enrichments from old policy
 *   3. Rolls back any policy_terms fields written by this document
 *   4. Reassigns the document to the new policy
 *   5. Re-queues for processing on the new policy
 */
export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    try {

        let body: {
            documentId: string;
            newPolicyId?: string;
            createNew?: boolean;
            ownerName?: string;
            propertyAddress?: string;
        };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
        }

        const { documentId, newPolicyId, createNew, ownerName, propertyAddress } = body;
        if (!documentId) {
            return NextResponse.json({ success: false, message: 'Missing documentId' }, { status: 400 });
        }
        if (!createNew && !newPolicyId) {
            return NextResponse.json({ success: false, message: 'Missing newPolicyId or createNew flag' }, { status: 400 });
        }
        if (createNew && !ownerName) {
            return NextResponse.json({ success: false, message: 'Missing ownerName for new client creation' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();

        // 1. Fetch the document to get old policy info
        const { data: doc, error: docError } = await admin
            .from('platform_documents')
            .select('id, account_id, doc_type, policy_id, client_id, policy_term_id, writeback_log')
            .eq('id', documentId)
            .single();

        if (docError || !doc) {
            return NextResponse.json({ success: false, message: 'Document not found.' }, { status: 404 });
        }

        const oldPolicyId = doc.policy_id;
        const oldTermId = doc.policy_term_id;

        // 2. Resolve or create the target policy
        let targetPolicyId: string;
        let targetClientId: string;

        if (createNew) {
            // ── Create new client + policy ──
            // Check for existing client with same name to prevent duplicates
            const { data: existingClients } = await admin
                .from('clients')
                .select('id')
                .ilike('named_insured', ownerName!.trim())
                .limit(1);

            if (existingClients && existingClients.length > 0) {
                targetClientId = existingClients[0].id;
                logger.info('DocumentReassign', 'Reusing existing client', { clientId: targetClientId, ownerName });
            } else {
                const { data: clientRow, error: clientError } = await admin
                    .from('clients')
                    .insert({
                        named_insured: ownerName!.trim(),
                        created_by_account_id: doc.account_id,
                    })
                    .select('id')
                    .single();

                if (clientError || !clientRow) {
                    logger.error('DocumentReassign', 'Failed to create client', { error: clientError?.message });
                    return NextResponse.json({ success: false, message: 'Failed to create client record' }, { status: 500 });
                }
                targetClientId = clientRow.id;
            }

            // Create policy
            const { data: policyRow, error: policyError } = await admin
                .from('policies')
                .insert({
                    client_id: targetClientId,
                    created_by_account_id: doc.account_id,
                    policy_number: 'PENDING',
                    property_address_raw: propertyAddress || null,
                    property_address_norm: normalizeAddress(propertyAddress || null),
                    carrier_name: 'California FAIR Plan',
                })
                .select('id')
                .single();

            if (policyError || !policyRow) {
                logger.error('DocumentReassign', 'Failed to create policy', { error: policyError?.message });
                return NextResponse.json({ success: false, message: 'Failed to create policy record' }, { status: 500 });
            }
            targetPolicyId = policyRow.id;
        } else {
            // ── Verify existing target policy ──
            const { data: newPolicy, error: newPolicyError } = await admin
                .from('policies')
                .select('id, client_id')
                .eq('id', newPolicyId!)
                .single();

            if (newPolicyError || !newPolicy) {
                return NextResponse.json({ success: false, message: 'Target policy not found.' }, { status: 404 });
            }
            targetPolicyId = newPolicy.id;
            targetClientId = newPolicy.client_id;
        }

        // ── CLEANUP: Remove old data from previous policy ──

        // 3a. Delete extracted data tables
        await admin.from('doc_data_rce').delete().eq('document_id', documentId);
        await admin.from('doc_data_dic').delete().eq('document_id', documentId);
        await admin.from('doc_data_es').delete().eq('document_id', documentId);

        // 3b. Delete RCE-sourced property enrichments from old policy
        if (doc.doc_type === 'rce' && oldPolicyId) {
            const { error: enrichErr } = await admin
                .from('property_enrichments')
                .delete()
                .eq('policy_id', oldPolicyId)
                .eq('source_name', 'rce_360value');
            if (enrichErr) {
                logger.warn('DocumentReassign', 'Failed to delete old property_enrichments', {
                    policyId: oldPolicyId,
                    error: enrichErr,
                });
            }
        }

        // 3c. Rollback policy_terms fields written by this document
        if (oldTermId && Array.isArray(doc.writeback_log)) {
            const writeEntries = (doc.writeback_log as Array<{ action?: string; target?: string; value?: unknown }>)
                .filter((e) => e.action === 'written' && typeof e.target === 'string' && e.target.startsWith('policy_terms.'));

            if (writeEntries.length > 0) {
                const { data: currentTerm } = await admin
                    .from('policy_terms')
                    .select('*')
                    .eq('id', oldTermId)
                    .single();

                if (currentTerm) {
                    const nullUpdates: Record<string, null> = {};
                    for (const entry of writeEntries) {
                        const field = (entry.target as string).replace('policy_terms.', '');
                        if (field in currentTerm && currentTerm[field] === entry.value) {
                            nullUpdates[field] = null;
                        }
                    }
                    if (Object.keys(nullUpdates).length > 0) {
                        const { error: rollbackErr } = await admin
                            .from('policy_terms')
                            .update(nullUpdates)
                            .eq('id', oldTermId);
                        if (rollbackErr) {
                            logger.warn('DocumentReassign', 'Failed to rollback policy_terms', {
                                termId: oldTermId,
                                error: rollbackErr,
                            });
                        } else {
                            logger.info('DocumentReassign', 'Rolled back policy_terms fields', {
                                termId: oldTermId,
                                fields: Object.keys(nullUpdates),
                            });
                        }
                    }
                }
            }
        }

        // ── REASSIGN: Move document to new policy ──

        // 4. Kill any stuck jobs for this document
        await admin
            .from('ingestion_jobs')
            .update({ status: 'failed', last_error: 'Superseded by reassignment' })
            .eq('document_id', documentId)
            .in('status', ['queued', 'processing']);

        // 5. Look up the latest policy_term_id for the target policy (needed for DIC writeback)
        const { data: latestTerm } = await admin
            .from('policy_terms')
            .select('id')
            .eq('policy_id', targetPolicyId)
            .order('effective_date', { ascending: false })
            .limit(1)
            .single();

        const newPolicyTermId = latestTerm?.id || null;

        // 6. Update document to point to new policy
        const { error: updateError } = await admin
            .from('platform_documents')
            .update({
                policy_id: targetPolicyId,
                client_id: targetClientId,
                policy_term_id: newPolicyTermId,
                match_status: 'manual',
                match_confidence: 1.0,
                parse_status: 'pending',
                processing_step: 'queued',
                writeback_status: 'none',
                writeback_log: [],
                error_message: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', documentId);

        if (updateError) {
            logger.error('DocumentReassign', 'Failed to update platform_documents', { documentId, error: updateError });
            return NextResponse.json({ success: false, message: 'Failed to reassign document.' }, { status: 500 });
        }

        // 6. Queue a fresh processing job
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
            logger.error('DocumentReassign', 'Failed to queue re-processing job', { documentId, error: jobError });
            return NextResponse.json({ success: false, message: 'Reassigned but failed to start processing.' }, { status: 500 });
        }

        // 7. Log activity event
        try {
            await admin.from('activity_events').insert({
                actor_user_id: doc.account_id,
                event_type: 'doc.reassigned',
                title: 'Document Reassigned',
                detail: createNew
                    ? `${doc.doc_type?.toUpperCase() || 'Document'} reassigned to new client: ${ownerName}`
                    : `${doc.doc_type?.toUpperCase() || 'Document'} reassigned to a different policy`,
                policy_id: targetPolicyId,
                client_id: targetClientId,
                meta: {
                    document_id: documentId,
                    doc_type: doc.doc_type,
                    old_policy_id: oldPolicyId,
                    new_policy_id: targetPolicyId,
                    created_new_client: !!createNew,
                },
            });
        } catch {
            // Non-fatal
        }

        logger.info('DocumentReassign', 'Document reassigned and re-queued', {
            documentId,
            oldPolicyId,
            newPolicyId: targetPolicyId,
            createdNew: !!createNew,
        });

        return NextResponse.json({
            success: true,
            message: createNew
                ? 'New client profile created and document reassigned. Processing will begin shortly.'
                : 'Document reassigned. Processing will begin shortly.',
            clientId: targetClientId,
            policyId: targetPolicyId,
        });

    } catch (error) {
        logger.error('DocumentReassign', 'Unexpected error', { error });
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}
