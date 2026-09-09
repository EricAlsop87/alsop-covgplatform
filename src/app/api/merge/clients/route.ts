import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const supabaseAdmin = getSupabaseAdmin();
    const policyMergeLog: string[] = [];
    try {
        const body = await req.json();
        const { survivor_id, merged_id, consolidated_fields, keep_documents = true } = body;
        const performed_by = auth.user.id;

        if (!survivor_id || !merged_id) {
            return NextResponse.json({ error: 'survivor_id and merged_id are required' }, { status: 400 });
        }
        
        if (survivor_id === merged_id) {
            return NextResponse.json({ error: 'Cannot merge identical client IDs' }, { status: 400 });
        }

        // 1. Validate both clients exist
        const { data: survivor, error: errSur } = await supabaseAdmin
            .from('clients')
            .select('*')
            .eq('id', survivor_id)
            .single();

        const { data: duplicate, error: errDup } = await supabaseAdmin
            .from('clients')
            .select('*')
            .eq('id', merged_id)
            .single();

        if (errSur || !survivor) return NextResponse.json({ error: 'Survivor client not found' }, { status: 404 });
        if (errDup || !duplicate) return NextResponse.json({ error: 'Duplicate client not found' }, { status: 404 });

        // Pre-merge snapshot for recovery
        const { data: preSnapshotPolicies } = await supabaseAdmin
            .from('policies')
            .select('id')
            .eq('client_id', merged_id);

        const { data: mergeLogEntry } = await supabaseAdmin
            .from('merge_logs')
            .insert({
                entity_type: 'client',
                survivor_id,
                merged_id,
                performed_by: performed_by || null,
                merge_details: {
                    status: 'in_progress',
                    survivor_state: survivor,
                    duplicate_state: duplicate,
                    pre_merge_policy_count: preSnapshotPolicies?.length ?? 0,
                }
            })
            .select('id')
            .single();
        const mergeLogId = mergeLogEntry?.id;

        // 2. Remap ALL associated records (only if keep_documents is true)
        if (keep_documents) {
            // 2a. Policies — primary entity
            const { error: polError } = await supabaseAdmin
                .from('policies')
                .update({ client_id: survivor_id })
                .eq('client_id', merged_id);
            if (polError) throw new Error(`Failed to remap policies: ${polError.message}`);

            // 2b. Dec pages
            const { error: decError } = await supabaseAdmin
                .from('dec_pages')
                .update({ client_id: survivor_id })
                .eq('client_id', merged_id);
            if (decError) throw new Error(`Failed to remap dec_pages: ${decError.message}`);

            // 2c. Platform documents (RCE, DIC, etc.)
            const { error: pdError } = await supabaseAdmin
                .from('platform_documents')
                .update({ client_id: survivor_id })
                .eq('client_id', merged_id);
            if (pdError) logger.error('Merge', 'Non-fatal: Failed to remap platform_documents:', { detail: pdError.message });

            // 2d. Policy flags
            const { error: flagError } = await supabaseAdmin
                .from('policy_flags')
                .update({ client_id: survivor_id })
                .eq('client_id', merged_id);
            if (flagError) logger.error('Merge', 'Non-fatal: Failed to remap policy_flags:', { detail: flagError.message });

            // 2e. Property enrichments (may reference client_id)
            const { error: enrichError } = await supabaseAdmin
                .from('property_enrichments')
                .update({ client_id: survivor_id })
                .eq('client_id', merged_id);
            if (enrichError) logger.error('Merge', 'Non-fatal: Failed to remap property_enrichments:', { detail: enrichError.message });

            // Note: Policies are NOT automatically merged here. They remain separate
            // under the survivor client for manual review via PolicyMergeModal or Identity Resolution.
        }

        // 2g. Activity events — always remap regardless of keep_documents
        // These are historical records, not documents
        const { error: actError } = await supabaseAdmin
            .from('activity_events')
            .update({ client_id: survivor_id })
            .eq('client_id', merged_id);
        if (actError) logger.error('Merge', 'Non-fatal: Failed to remap activity_events:', { detail: actError.message });

        // 2h. Notes — always remap
        const { error: noteError } = await supabaseAdmin
            .from('notes')
            .update({ client_id: survivor_id })
            .eq('client_id', merged_id);
        if (noteError) logger.error('Merge', 'Non-fatal: Failed to remap notes:', { detail: noteError.message });

        // 3. Consolidate contact data via explicit agent selection picking
        let finalConsolidatedFields: Record<string, any> = {};
        if (consolidated_fields && Object.keys(consolidated_fields).length > 0) {
            // Validate safety constraints on incoming fields
            const safeFields = ['named_insured', 'email', 'phone', 'mailing_address_raw', 'mailing_address_norm'];
            const safeUpdatePayload: Record<string, any> = {};
            for (const key of safeFields) {
                if (consolidated_fields[key] !== undefined) {
                    safeUpdatePayload[key] = consolidated_fields[key];
                }
            }
            if (Object.keys(safeUpdatePayload).length > 0) {
                await supabaseAdmin.from('clients').update(safeUpdatePayload).eq('id', survivor_id);
                finalConsolidatedFields = safeUpdatePayload;
            }
        }

        // Verify all policies were remapped before deleting the duplicate
        const { data: remainingPolicies } = await supabaseAdmin
            .from('policies')
            .select('id')
            .eq('client_id', merged_id);

        if (remainingPolicies && remainingPolicies.length > 0) {
            logger.error('Merge', 'Critical: policies remain on duplicate after remap', {
                merged_id,
                remaining: remainingPolicies.length,
            });
            // Update merge log to reflect partial failure
            if (mergeLogId) {
                await supabaseAdmin.from('merge_logs').update({
                    merge_details: {
                        status: 'partial_failure',
                        error: `${remainingPolicies.length} policies not remapped`,
                    }
                }).eq('id', mergeLogId);
            }
            return NextResponse.json({
                error: `Merge aborted: ${remainingPolicies.length} policies could not be remapped. No data was deleted.`,
                partial: true,
                survivor_id,
                merged_id,
            }, { status: 500 });
        }

        // 4. Delete Duplicate Record
        const { error: delError } = await supabaseAdmin
            .from('clients')
            .delete()
            .eq('id', merged_id);

        if (delError) {
            logger.error('Merge', 'Client delete failed after remapping:', { detail: delError.message });
            return NextResponse.json({
                error: `Merge partially completed: records were migrated to survivor, but the duplicate profile could not be deleted. Reason: ${delError.message}`,
                partial: true,
                survivor_id,
                merged_id,
            }, { status: 500 });
        }

        // 5. Log Audit Trail
        if (mergeLogId) {
            await supabaseAdmin.from('merge_logs').update({
                merge_details: {
                    status: 'completed',
                    survivor_state: survivor,
                    duplicate_state: duplicate,
                    consolidated_fields: finalConsolidatedFields,
                    auto_policy_merges: policyMergeLog,
                }
            }).eq('id', mergeLogId);
        }

        // 6. Activity Event for Dashboard Feed
        const survivorName = finalConsolidatedFields.named_insured || survivor.named_insured || 'Unknown';
        const dupName = duplicate.named_insured || 'Unknown';
        const policyMergeNote = policyMergeLog.length > 0
            ? ` Auto-merged ${policyMergeLog.length} duplicate policy/policies: ${policyMergeLog.join(', ')}.`
            : '';
        supabaseAdmin.from('activity_events').insert({
            event_type: 'merge.client',
            title: `Client records consolidated: ${survivorName}`,
            detail: `Merged "${dupName}" into "${survivorName}". ${keep_documents ? 'All policies, documents, notes, and flags migrated.' : 'Documents not migrated.'}${policyMergeNote}`,
            client_id: survivor_id,
            meta: {
                survivor_id,
                merged_id,
                survivor_name: survivorName,
                duplicate_name: dupName,
                keep_documents,
                fields_consolidated: Object.keys(finalConsolidatedFields),
                auto_policy_merges: policyMergeLog,
            },
        }).then(r => { if (r.error) logger.error('Merge', 'Activity event error (non-fatal):', { detail: r.error.message }); });

        return NextResponse.json({ success: true, survivor_id, auto_policy_merges: policyMergeLog });

    } catch (error: any) {
        logger.error('Merge', 'Client Merge Transaction Error:', error);
        return NextResponse.json({ error: error.message || 'Server error during merge transaction' }, { status: 500 });
    }
}
