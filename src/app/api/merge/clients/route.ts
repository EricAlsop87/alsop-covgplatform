import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { normalizePolicyNumber } from '@/lib/normalization';
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

            // ────────────────────────────────────────────────────────────
            // 2f. AUTO-DEDUPLICATE POLICIES by base policy number
            // After remapping, the survivor may now have two separate
            // policy records that share the same base policy number
            // (e.g. "CFP 0102162693 01" and "CFP 0102162693 02").
            // We auto-merge them so terms are consolidated under one policy.
            // ────────────────────────────────────────────────────────────
            try {
                const { data: allPolicies } = await supabaseAdmin
                    .from('policies')
                    .select('id, policy_number, created_at')
                    .eq('client_id', survivor_id);

                if (allPolicies && allPolicies.length > 1) {
                    // Group by normalized base policy number
                    const policyGroups = new Map<string, typeof allPolicies>();
                    for (const pol of allPolicies) {
                        const { basePolicy } = normalizePolicyNumber(pol.policy_number);
                        if (!basePolicy) continue;
                        if (!policyGroups.has(basePolicy)) policyGroups.set(basePolicy, []);
                        policyGroups.get(basePolicy)!.push(pol);
                    }

                    for (const [baseNum, cluster] of policyGroups.entries()) {
                        if (cluster.length < 2) continue;

                        // Sort: prefer pure base (no suffix) first, then oldest
                        cluster.sort((a, b) => {
                            const normA = normalizePolicyNumber(a.policy_number);
                            const normB = normalizePolicyNumber(b.policy_number);
                            const hasSuffixA = normA.suffix ? 1 : 0;
                            const hasSuffixB = normB.suffix ? 1 : 0;
                            if (hasSuffixA !== hasSuffixB) return hasSuffixA - hasSuffixB;
                            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                        });

                        const policySurvivor = cluster[0];
                        const policyDuplicates = cluster.slice(1);

                        // Helper to choose carrier policy number with a suffix
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

                        for (const polDup of policyDuplicates) {
                            logger.info('Merge', `Auto-merging policy "${polDup.policy_number}" (${polDup.id}) into "${policySurvivor.policy_number}" (${policySurvivor.id})`);

                            // Fetch terms for survivor and duplicate to detect collisions
                            const { data: survTerms, error: survTermsErr } = await supabaseAdmin
                                .from('policy_terms')
                                .select('id, effective_date, expiration_date, carrier_policy_number')
                                .eq('policy_id', policySurvivor.id);

                            const { data: dupTerms, error: dupTermsErr } = await supabaseAdmin
                                .from('policy_terms')
                                .select('id, effective_date, expiration_date, carrier_policy_number')
                                .eq('policy_id', polDup.id);

                            if (survTermsErr || dupTermsErr) {
                                logger.error('Merge', `Failed to fetch terms during auto-merge:`, { detail: survTermsErr?.message || dupTermsErr?.message || '' });
                                continue;
                            }

                            if (dupTerms && dupTerms.length > 0) {
                                for (const dupTerm of dupTerms) {
                                    // Check if survivor already has a term with exact same dates
                                    const collision = survTerms?.find(st => 
                                        st.effective_date === dupTerm.effective_date && 
                                        st.expiration_date === dupTerm.expiration_date
                                    );

                                    const finalCarrierPolicyNumber = dupTerm.carrier_policy_number || polDup.policy_number;

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
                                                policy_id: policySurvivor.id,
                                                carrier_policy_number: finalCarrierPolicyNumber
                                            })
                                            .eq('id', dupTerm.id);
                                    }
                                }
                            }

                            // Reparent dec_pages
                            await supabaseAdmin
                                .from('dec_pages')
                                .update({ policy_id: policySurvivor.id })
                                .eq('policy_id', polDup.id);

                            // Reparent policy_flags
                            await supabaseAdmin
                                .from('policy_flags')
                                .update({ policy_id: policySurvivor.id })
                                .eq('policy_id', polDup.id);

                            // Reparent property_enrichments
                            await supabaseAdmin
                                .from('property_enrichments')
                                .update({ policy_id: policySurvivor.id })
                                .eq('policy_id', polDup.id);

                            // Reparent platform_documents
                            await supabaseAdmin
                                .from('platform_documents')
                                .update({ policy_id: policySurvivor.id })
                                .eq('policy_id', polDup.id);

                            // Reparent notes
                            await supabaseAdmin
                                .from('notes')
                                .update({ policy_id: policySurvivor.id })
                                .eq('policy_id', polDup.id);

                            // Reparent activity_events
                            await supabaseAdmin
                                .from('activity_events')
                                .update({ policy_id: policySurvivor.id })
                                .eq('policy_id', polDup.id);

                            // Delete the duplicate policy record
                            const { error: polDelErr } = await supabaseAdmin
                                .from('policies')
                                .delete()
                                .eq('id', polDup.id);

                            if (polDelErr) {
                                logger.error('Merge', `Failed to delete duplicate policy ${polDup.id}:`, { detail: polDelErr.message });
                            } else {
                                policyMergeLog.push(`${polDup.policy_number} → ${policySurvivor.policy_number}`);
                            }
                        }

                        // Recalculate is_current: only the term with the latest expiration_date is current
                        const { data: allTerms } = await supabaseAdmin
                            .from('policy_terms')
                            .select('id, expiration_date')
                            .eq('policy_id', policySurvivor.id)
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

                        // Propagate property address from current term to survivor policy
                        // if the surviving policy has no address but a term does
                        const { data: polSurvivorFull } = await supabaseAdmin
                            .from('policies')
                            .select('property_address_raw')
                            .eq('id', policySurvivor.id)
                            .single();

                        if (!polSurvivorFull?.property_address_raw) {
                            const { data: currentTerm } = await supabaseAdmin
                                .from('policy_terms')
                                .select('property_location')
                                .eq('policy_id', policySurvivor.id)
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
                                    .eq('id', policySurvivor.id);
                                logger.info('Merge', `Propagated property address "${currentTerm.property_location}" to policy ${policySurvivor.id}`);
                            }
                        }

                        // Log audit for the policy merge
                        supabaseAdmin.from('merge_logs').insert({
                            entity_type: 'policy',
                            survivor_id: policySurvivor.id,
                            merged_id: policyDuplicates.map(p => p.id).join(','),
                            performed_by: performed_by || 'auto:client-merge',
                            merge_details: {
                                auto_triggered_by: 'client_merge',
                                client_survivor_id: survivor_id,
                                client_merged_id: merged_id,
                                policy_survivor: policySurvivor,
                                policy_duplicates: policyDuplicates,
                            }
                        }).then(r => { if (r.error) logger.error('Merge', 'Policy merge audit log error:', { detail: r.error.message }); });
                    }
                }
            } catch (policyDedup) {
                logger.error('Merge', 'Non-fatal: Auto policy dedup failed:', { error: policyDedup instanceof Error ? policyDedup.message : String(policyDedup) });
                // Don't fail the client merge if policy dedup has an issue
            }
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
