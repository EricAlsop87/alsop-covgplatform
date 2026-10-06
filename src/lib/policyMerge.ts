import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

export interface PolicyMergeResult {
    success: boolean;
    survivor_id: string;
    merged_id: string;
    error?: string;
    terms_migrated?: number;
}

export async function executePolicyMerge(
    supabaseAdmin: SupabaseClient,
    survivor_id: string,
    merged_id: string,
    performed_by?: string | null
): Promise<PolicyMergeResult> {
    if (!survivor_id || !merged_id) {
        return { success: false, survivor_id, merged_id, error: 'survivor_id and merged_id are required' };
    }
    if (survivor_id === merged_id) {
        return { success: false, survivor_id, merged_id, error: 'Cannot merge identical policy IDs' };
    }

    // 1. Validate both policies exist
    const { data: survivor, error: errSur } = await supabaseAdmin
        .from('policies')
        .select('id, policy_number, client_id, property_address_norm, created_by_account_id')
        .eq('id', survivor_id)
        .single();

    const { data: duplicate, error: errDup } = await supabaseAdmin
        .from('policies')
        .select('id, policy_number, client_id, property_address_norm, created_by_account_id')
        .eq('id', merged_id)
        .single();

    if (errSur || !survivor) return { success: false, survivor_id, merged_id, error: 'Survivor policy not found' };
    if (errDup || !duplicate) return { success: false, survivor_id, merged_id, error: 'Duplicate policy not found' };

    // Pre-merge snapshot for recovery
    const { data: preSnapshotTerms } = await supabaseAdmin
        .from('policy_terms')
        .select('id')
        .eq('policy_id', merged_id);

    const { data: mergeLogEntry } = await supabaseAdmin
        .from('merge_logs')
        .insert({
            entity_type: 'policy',
            survivor_id,
            merged_id,
            performed_by: performed_by || null,
            merge_details: {
                status: 'in_progress',
                survivor_state: survivor,
                duplicate_state: duplicate,
                pre_merge_term_count: preSnapshotTerms?.length ?? 0,
            }
        })
        .select('id')
        .single();
    const mergeLogId = mergeLogEntry?.id;

    if (survivor.policy_number !== duplicate.policy_number) {
        logger.info('Merge', `Merging distinct policy strings: ${survivor.policy_number} vs ${duplicate.policy_number}`);
    }

    const chooseCarrierPolicyNumber = (
        surv: string | null | undefined,
        dup: string | null | undefined
    ): string | null => {
        if (!surv) return dup || null;
        if (!dup) return surv || null;
        const survHasSuffix = /\s\d{2}$/.test(surv);
        const dupHasSuffix = /\s\d{2}$/.test(dup);
        if (dupHasSuffix && !survHasSuffix) return dup;
        return surv;
    };

    // 2. Remap Policy Terms lineage to Survivor
    const { data: survivorTerms, error: errSurvTerms } = await supabaseAdmin
        .from('policy_terms')
        .select('id, effective_date, expiration_date, carrier_policy_number')
        .eq('policy_id', survivor_id);

    const { data: duplicateTerms, error: errDupTerms } = await supabaseAdmin
        .from('policy_terms')
        .select('id, effective_date, expiration_date, carrier_policy_number')
        .eq('policy_id', merged_id);

    if (errSurvTerms) throw errSurvTerms;
    if (errDupTerms) throw errDupTerms;

    let termsMigrated = 0;
    if (duplicateTerms && duplicateTerms.length > 0) {
        for (const dupTerm of duplicateTerms) {
            const collision = survivorTerms?.find(st => 
                st.effective_date === dupTerm.effective_date && 
                st.expiration_date === dupTerm.expiration_date
            );

            const finalCarrierPolicyNumber = dupTerm.carrier_policy_number || duplicate.policy_number;

            if (collision) {
                const targetTermId = collision.id;
                const oldTermId = dupTerm.id;
                
                await supabaseAdmin.from('dec_pages').update({ policy_term_id: targetTermId, policy_id: survivor_id }).eq('policy_term_id', oldTermId);
                await supabaseAdmin.from('policy_flags').update({ policy_term_id: targetTermId, policy_id: survivor_id }).eq('policy_term_id', oldTermId);
                await supabaseAdmin.from('platform_documents').update({ policy_term_id: targetTermId, policy_id: survivor_id }).eq('policy_term_id', oldTermId);
                await supabaseAdmin.from('policy_reports').update({ policy_term_id: targetTermId, policy_id: survivor_id }).eq('policy_term_id', oldTermId);

                const targetCarrier = chooseCarrierPolicyNumber(collision.carrier_policy_number, finalCarrierPolicyNumber);
                if (targetCarrier) {
                    await supabaseAdmin.from('policy_terms')
                        .update({ carrier_policy_number: targetCarrier })
                        .eq('id', targetTermId);
                }

                const { error: delTermErr } = await supabaseAdmin.from('policy_terms').delete().eq('id', oldTermId);
                if (delTermErr) {
                    logger.error('Merge', 'Failed to delete colliding duplicate term', { oldTermId, error: delTermErr });
                    throw delTermErr;
                }
            } else {
                const { error: updTermErr } = await supabaseAdmin.from('policy_terms')
                    .update({ 
                        policy_id: survivor_id,
                        carrier_policy_number: finalCarrierPolicyNumber
                    })
                    .eq('id', dupTerm.id);
                if (updTermErr) {
                    logger.error('Merge', 'Failed to update term to survivor policy', { oldTermId: dupTerm.id, error: updTermErr });
                    throw updTermErr;
                }
            }
            termsMigrated++;
        }
    }

    // 2b. Recalculate is_current for survivor
    const { data: allTerms } = await supabaseAdmin
        .from('policy_terms')
        .select('id, expiration_date')
        .eq('policy_id', survivor_id)
        .order('expiration_date', { ascending: false, nullsFirst: false });

    if (allTerms && allTerms.length > 1) {
        const winnerId = allTerms[0].id;
        const loserIds = allTerms.slice(1).map(t => t.id);

        await supabaseAdmin
            .from('policy_terms')
            .update({ is_current: true })
            .eq('id', winnerId);

        if (loserIds.length > 0) {
            await supabaseAdmin
                .from('policy_terms')
                .update({ is_current: false })
                .in('id', loserIds);
        }
    }

    // 2c. Propagate property address from current term to survivor policy
    if (!survivor.property_address_norm) {
        const { data: currentTerm } = await supabaseAdmin
            .from('policy_terms')
            .select('property_location')
            .eq('policy_id', survivor_id)
            .eq('is_current', true)
            .not('property_location', 'is', null)
            .single();

        if (currentTerm?.property_location) {
            const norm = currentTerm.property_location.toUpperCase().replace(/,/g, '').replace(/\s+/g, ' ').trim();
            await supabaseAdmin
                .from('policies')
                .update({
                    property_address_raw: currentTerm.property_location,
                    property_address_norm: norm,
                })
                .eq('id', survivor_id);
            logger.info('Merge', `Propagated property address "${currentTerm.property_location}" to survivor policy ${survivor_id}`);
        }
    }

    // 3. Remap Dec Pages lineage to Survivor
    await supabaseAdmin.from('dec_pages').update({ policy_id: survivor_id }).eq('policy_id', merged_id);

    // 4. Remap Flag checks, property enrichments, platform documents, reports, activities, overrides, notes
    await supabaseAdmin.from('policy_flags').update({ policy_id: survivor_id }).eq('policy_id', merged_id);
    await supabaseAdmin.from('property_enrichments').update({ policy_id: survivor_id }).eq('policy_id', merged_id);
    await supabaseAdmin.from('platform_documents').update({ policy_id: survivor_id }).eq('policy_id', merged_id);
    await supabaseAdmin.from('policy_reports').update({ policy_id: survivor_id }).eq('policy_id', merged_id);
    await supabaseAdmin.from('activity_events').update({ policy_id: survivor_id }).eq('policy_id', merged_id);
    await supabaseAdmin.from('manual_overrides').update({ policy_id: survivor_id }).eq('policy_id', merged_id);
    await supabaseAdmin.from('notes').update({ policy_id: survivor_id }).eq('policy_id', merged_id);

    // Verify all terms were remapped before deleting the duplicate
    const { data: remainingTerms } = await supabaseAdmin
        .from('policy_terms')
        .select('id')
        .eq('policy_id', merged_id);

    if (remainingTerms && remainingTerms.length > 0) {
        logger.error('Merge', 'Critical: policy_terms remain on duplicate after remap', {
            merged_id,
            remaining: remainingTerms.length,
        });
        if (mergeLogId) {
            await supabaseAdmin.from('merge_logs').update({
                merge_details: {
                    status: 'partial_failure',
                    error: `${remainingTerms.length} terms not remapped`,
                }
            }).eq('id', mergeLogId);
        }
        return {
            success: false,
            survivor_id,
            merged_id,
            error: `Merge aborted: ${remainingTerms.length} terms could not be remapped. No data was deleted.`,
        };
    }

    // 5. Delete Duplicate Policy Record
    const { error: delError } = await supabaseAdmin
        .from('policies')
        .delete()
        .eq('id', merged_id);

    if (delError) throw delError;

    // 6. Log Audit Trail natively
    if (mergeLogId) {
        await supabaseAdmin.from('merge_logs').update({
            merge_details: {
                status: 'completed',
                survivor_state: survivor,
                duplicate_state: duplicate,
            }
        }).eq('id', mergeLogId);
    }

    // 7. Activity Event for Dashboard Feed
    supabaseAdmin.from('activity_events').insert({
        event_type: 'merge.policy',
        title: `Policy term downcasted: ${survivor.policy_number}`,
        detail: `Merged policy "${duplicate.policy_number}" into root "${survivor.policy_number}". Terms, flags, and enrichments re-parented.`,
        policy_id: survivor_id,
        client_id: survivor.client_id || null,
        meta: {
            survivor_id,
            merged_id,
            survivor_policy_number: survivor.policy_number,
            duplicate_policy_number: duplicate.policy_number,
        },
    }).then(r => { if (r.error) logger.error('Merge', 'Activity event error (non-fatal):', { detail: r.error.message }); });

    return {
        success: true,
        survivor_id,
        merged_id,
        terms_migrated: termsMigrated,
    };
}
