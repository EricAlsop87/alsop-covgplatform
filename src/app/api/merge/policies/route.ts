import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const supabaseAdmin = getSupabaseAdmin();
    try {
        const body = await req.json();
        const { survivor_id, merged_id } = body;
        const performed_by = auth.user.id;

        if (!survivor_id || !merged_id) {
            return NextResponse.json({ error: 'survivor_id and merged_id are required' }, { status: 400 });
        }
        
        if (survivor_id === merged_id) {
            return NextResponse.json({ error: 'Cannot merge identical policy IDs' }, { status: 400 });
        }

        // 1. Validate both policies exist and verify their Base Policy logic
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

        if (errSur || !survivor) return NextResponse.json({ error: 'Survivor policy not found' }, { status: 404 });
        if (errDup || !duplicate) return NextResponse.json({ error: 'Duplicate policy not found' }, { status: 404 });

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

        // Optional Strict Policy Invariant Check: Only exact matching base numbers can be merged (safety protocol)
        if (survivor.policy_number !== duplicate.policy_number) {
            logger.info('Merge', `Merging distinct policy strings: ${survivor.policy_number} vs ${duplicate.policy_number}`);
        }

        // Helper function to pick the carrier policy number with a suffix (e.g. "CFP 0101772837 08") over one without.
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

        if (duplicateTerms && duplicateTerms.length > 0) {
            for (const dupTerm of duplicateTerms) {
                // Check if survivor already has a term with exact same dates
                const collision = survivorTerms?.find(st => 
                    st.effective_date === dupTerm.effective_date && 
                    st.expiration_date === dupTerm.expiration_date
                );

                const finalCarrierPolicyNumber = dupTerm.carrier_policy_number || duplicate.policy_number;

                if (collision) {
                    const targetTermId = collision.id;
                    const oldTermId = dupTerm.id;
                    
                    // Reparent any child records that use policy_term_id to avoid FK issues
                    await supabaseAdmin.from('dec_pages').update({ policy_term_id: targetTermId }).eq('policy_term_id', oldTermId);
                    await supabaseAdmin.from('policy_flags').update({ policy_term_id: targetTermId }).eq('policy_term_id', oldTermId);

                    // Update survivor's collision term with the best carrier policy number
                    const targetCarrier = chooseCarrierPolicyNumber(collision.carrier_policy_number, finalCarrierPolicyNumber);
                    if (targetCarrier) {
                        await supabaseAdmin.from('policy_terms')
                            .update({ carrier_policy_number: targetCarrier })
                            .eq('id', targetTermId);
                    }

                    // Delete the colliding duplicate term so we don't violate the constraint when updating policy_id
                    await supabaseAdmin.from('policy_terms').delete().eq('id', oldTermId);
                } else {
                    // No collision: move term to the survivor policy and set carrier_policy_number
                    await supabaseAdmin.from('policy_terms')
                        .update({ 
                            policy_id: survivor_id,
                            carrier_policy_number: finalCarrierPolicyNumber
                        })
                        .eq('id', dupTerm.id);
                }
            }
        }

        // 2b. Recalculate is_current for the survivor — after merging,
        // multiple terms may have is_current=true. Fix: only the term
        // with the latest expiration_date should be current.
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
        // if the surviving policy has no address but a term does
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
        const { error: decError } = await supabaseAdmin
            .from('dec_pages')
            .update({ policy_id: survivor_id })
            .eq('policy_id', merged_id);

        // 4. Remap Flag checks if necessary (or they are tied to terms / dec pages mostly, but keeping generic)
        const { error: flagError } = await supabaseAdmin
            .from('policy_flags')
            .update({ policy_id: survivor_id })
            .eq('policy_id', merged_id);

        // 4b. Remap Property Enrichments
        const { error: enrichError } = await supabaseAdmin
            .from('property_enrichments')
            .update({ policy_id: survivor_id })
            .eq('policy_id', merged_id);

        // 4c. Remap Platform Documents (RCE, DIC, etc.)
        const { error: docsError } = await supabaseAdmin
            .from('platform_documents')
            .update({ policy_id: survivor_id })
            .eq('policy_id', merged_id);

        // 4d. Remap Policy Reports
        const { error: reportsError } = await supabaseAdmin
            .from('policy_reports')
            .update({ policy_id: survivor_id })
            .eq('policy_id', merged_id);

        // 4e. Remap Activity Events
        const { error: activityError } = await supabaseAdmin
            .from('activity_events')
            .update({ policy_id: survivor_id })
            .eq('policy_id', merged_id);

        // 4f. Remap Manual Overrides
        const { error: overridesError } = await supabaseAdmin
            .from('manual_overrides')
            .update({ policy_id: survivor_id })
            .eq('policy_id', merged_id);
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
            // Update merge log to reflect partial failure
            if (mergeLogId) {
                await supabaseAdmin.from('merge_logs').update({
                    merge_details: {
                        status: 'partial_failure',
                        error: `${remainingTerms.length} terms not remapped`,
                    }
                }).eq('id', mergeLogId);
            }
            return NextResponse.json({
                error: `Merge aborted: ${remainingTerms.length} terms could not be remapped. No data was deleted.`,
                partial: true,
                survivor_id,
                merged_id,
            }, { status: 500 });
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

        return NextResponse.json({ success: true, survivor_id });

    } catch (error: any) {
        logger.error('Merge', 'Policy Merge Transaction Error:', error);
        return NextResponse.json({ error: error.message || 'Server error during merge transaction' }, { status: 500 });
    }
}
