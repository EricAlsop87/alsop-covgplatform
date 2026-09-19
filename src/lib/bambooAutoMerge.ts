import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabaseClient';
import { logger } from './logger';

export function normalizeAddress(str: string | null | undefined): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .replace(/[.,#]/g, ' ')
        .replace(/\b(street|st)\b/g, 'st')
        .replace(/\b(avenue|ave)\b/g, 'ave')
        .replace(/\b(drive|dr)\b/g, 'dr')
        .replace(/\b(road|rd)\b/g, 'rd')
        .replace(/\b(boulevard|blvd)\b/g, 'blvd')
        .replace(/\b(lane|ln)\b/g, 'ln')
        .replace(/\b(court|ct)\b/g, 'ct')
        .replace(/\b(circle|cir)\b/g, 'cir')
        .replace(/\b(place|pl)\b/g, 'pl')
        .replace(/\b(way|wy)\b/g, 'wy')
        .replace(/\b(terrace|ter)\b/g, 'ter')
        .replace(/\b(parkway|pkwy)\b/g, 'pkwy')
        .replace(/\b(highway|hwy)\b/g, 'hwy')
        .replace(/\b(suite|ste|spc|space|unit|apt|apartment)\b/g, 'unit')
        .replace(/\s+/g, ' ')
        .trim();
}

export function extractStreetNumAndName(str: string | null | undefined): string {
    const norm = normalizeAddress(str);
    const match = norm.match(/^(\d+[\w-]*)\s+([a-z0-9\s]+?)(?:unit.*|$)/);
    if (match) {
        const num = match[1];
        const street = match[2].trim().split(' ').slice(0, 3).join(' ');
        return num + ' ' + street;
    }
    return '';
}

export function nameMatchesPrefix(prefix: string | null | undefined, fullName: string | null | undefined): boolean {
    if (!prefix || !fullName) return false;
    const p = prefix.trim().toUpperCase();
    const f = fullName.trim().toUpperCase();
    if (p.length < 2) return false;
    const words = f.split(/[\s,]+/);
    return words.some(w => w.startsWith(p)) || f.startsWith(p);
}

export interface BambooMergeResult {
    matched: boolean;
    bambooPolicyId?: string;
    bambooPolicyNumber?: string;
    targetPolicyId?: string;
    mergedClientName?: string;
    error?: string;
}

/**
 * Check if a CFP policy (or newly uploaded dec page address) matches any pending_dec Bamboo policy.
 * If matched:
 * 1. Promotes/retains full insured name on client.
 * 2. Sets manual_overrides has_bamboo_coverage = true for the target CFP policy.
 * 3. Reassigns documents, dec_pages, notes, and terms from Bamboo placeholder to target CFP policy.
 * 4. Safely deletes the placeholder pending_dec Bamboo policy and orphan client.
 * 5. Logs the merge in merge_logs.
 */
export async function reconcileAndMergeBambooForPolicy(
    targetPolicyId: string,
    providedAddress?: string | null,
    providedInsuredName?: string | null,
    supabaseClient?: SupabaseClient
): Promise<BambooMergeResult[]> {
    const admin = supabaseClient || getSupabaseAdmin();
    const results: BambooMergeResult[] = [];

    try {
        // 1. Fetch target policy details if not provided
        let targetAddr = providedAddress || '';
        let targetInsured = providedInsuredName || '';
        let targetClientId: string | null = null;
        let targetPolicyNumber = '';

        const { data: targetPolicy, error: polErr } = await admin
            .from('policies')
            .select('id, policy_number, client_id, property_address_raw, property_address_norm, clients(id, named_insured)')
            .eq('id', targetPolicyId)
            .single();

        if (!polErr && targetPolicy) {
            targetPolicyNumber = targetPolicy.policy_number || '';
            targetClientId = targetPolicy.client_id;
            const polClient = Array.isArray(targetPolicy.clients) ? targetPolicy.clients[0] : targetPolicy.clients;
            if (!targetAddr) targetAddr = targetPolicy.property_address_raw || targetPolicy.property_address_norm || '';
            if (!targetInsured && polClient?.named_insured) targetInsured = polClient.named_insured;
        }

        if (!targetAddr) {
            return [{ matched: false, error: 'No address available for target policy' }];
        }

        const normTargetAddr = normalizeAddress(targetAddr);
        const streetKey = extractStreetNumAndName(targetAddr);

        // 2. Query pending_dec Bamboo policies
        const { data: bambooCandidates, error: candErr } = await admin
            .from('policies')
            .select('id, policy_number, client_id, property_address_raw, property_address_norm, clients(id, named_insured)')
            .eq('status', 'pending_dec');

        if (candErr || !bambooCandidates || bambooCandidates.length === 0) {
            return [{ matched: false }];
        }

        for (const bp of bambooCandidates) {
            const bRaw = bp.property_address_raw || bp.property_address_norm || '';
            const bNorm = normalizeAddress(bRaw);
            const bStreetKey = extractStreetNumAndName(bRaw);
            const bClient = Array.isArray(bp.clients) ? bp.clients[0] : bp.clients;
            const bInsured = bClient?.named_insured || '';

            let isMatch = false;
            let matchReason = '';

            // Exact normalized address match
            if (bNorm && normTargetAddr && bNorm === normTargetAddr) {
                isMatch = true;
                matchReason = 'Exact normalized address match';
            } else if (bStreetKey && streetKey && bStreetKey === streetKey) {
                // Street & number match: verify name initial or zip
                if (targetInsured && bInsured && nameMatchesPrefix(bInsured, targetInsured)) {
                    isMatch = true;
                    matchReason = 'Street & number + name prefix match';
                } else {
                    const bZip = (bRaw.match(/\b\d{5}\b/) || [])[0];
                    const tZip = (targetAddr.match(/\b\d{5}\b/) || [])[0];
                    if (bZip && tZip && bZip === tZip) {
                        isMatch = true;
                        matchReason = 'Street & number + Zip match';
                    }
                }
            }

            if (isMatch) {
                logger.info('BambooAutoMerge', 'Found matching Bamboo policy to merge', {
                    bambooPolicy: bp.policy_number,
                    bambooInsured: bInsured,
                    targetPolicy: targetPolicyNumber,
                    targetInsured,
                    matchReason
                });

                // Execute merge
                const mergeRes = await executeSingleBambooMerge(admin, {
                    bambooPolicyId: bp.id,
                    bambooPolicyNumber: bp.policy_number,
                    bambooClientId: bp.client_id,
                    targetPolicyId,
                    targetPolicyNumber,
                    targetClientId,
                    fullInsuredName: targetInsured || bInsured,
                    matchReason
                });

                results.push(mergeRes);
            }
        }

        if (results.length === 0) {
            return [{ matched: false }];
        }

        return results;
    } catch (err: any) {
        logger.error('BambooAutoMerge', 'Error reconciling Bamboo policy', { error: err?.message, targetPolicyId });
        return [{ matched: false, error: err?.message }];
    }
}

interface MergeParams {
    bambooPolicyId: string;
    bambooPolicyNumber: string;
    bambooClientId: string | null;
    targetPolicyId: string;
    targetPolicyNumber: string;
    targetClientId: string | null;
    fullInsuredName: string;
    matchReason: string;
}

async function executeSingleBambooMerge(admin: SupabaseClient, params: MergeParams): Promise<BambooMergeResult> {
    const {
        bambooPolicyId,
        bambooPolicyNumber,
        bambooClientId,
        targetPolicyId,
        targetPolicyNumber,
        targetClientId,
        fullInsuredName,
        matchReason
    } = params;

    try {
        // 1. Reassign platform_documents
        await admin
            .from('platform_documents')
            .update({ policy_id: targetPolicyId })
            .eq('policy_id', bambooPolicyId);

        // 2. Reassign dec_pages
        await admin
            .from('dec_pages')
            .update({ policy_id: targetPolicyId })
            .eq('policy_id', bambooPolicyId);

        // 3. Delete dummy placeholder terms from Bamboo policy (CFP policy retains canonical terms)
        await admin
            .from('policy_terms')
            .delete()
            .eq('policy_id', bambooPolicyId);

        // 4. Reassign notes
        await admin
            .from('notes')
            .update({ policy_id: targetPolicyId })
            .eq('policy_id', bambooPolicyId);

        // 5. Update or set manual_overrides has_bamboo_coverage
        const { data: existingOverride } = await admin
            .from('manual_overrides')
            .select('id')
            .eq('policy_id', targetPolicyId)
            .eq('field_name', 'has_bamboo_coverage')
            .limit(1);

        if (existingOverride && existingOverride.length > 0) {
            await admin
                .from('manual_overrides')
                .update({ new_value: 'true', updated_at: new Date().toISOString() })
                .eq('id', existingOverride[0].id);
        } else {
            await admin
                .from('manual_overrides')
                .insert({
                    policy_id: targetPolicyId,
                    field_name: 'has_bamboo_coverage',
                    new_value: 'true',
                    created_at: new Date().toISOString()
                });
        }

        // 6. Ensure target client named_insured has full name
        if (targetClientId && fullInsuredName && fullInsuredName.length > 3) {
            await admin
                .from('clients')
                .update({ named_insured: fullInsuredName, updated_at: new Date().toISOString() })
                .eq('id', targetClientId);
        }

        // 7. Delete the duplicate Bamboo placeholder policy
        await admin
            .from('policies')
            .delete()
            .eq('id', bambooPolicyId);

        // 8. Delete the orphan Bamboo client if separate
        if (bambooClientId && bambooClientId !== targetClientId) {
            const { count: remainingPols } = await admin
                .from('policies')
                .select('id', { count: 'exact', head: true })
                .eq('client_id', bambooClientId);

            if (!remainingPols || remainingPols === 0) {
                await admin
                    .from('clients')
                    .delete()
                    .eq('id', bambooClientId);
            }
        }

        // 9. Log in merge_logs
        await admin
            .from('merge_logs')
            .insert({
                entity_type: 'policy',
                survivor_id: targetPolicyId,
                merged_id: bambooPolicyId,
                merge_details: {
                    action: 'bamboo_auto_merge_on_dec_available',
                    survivingPolicyNumber: targetPolicyNumber,
                    bambooPolicyNumber,
                    fullInsuredName,
                    matchReason
                },
                performed_by: 'system_auto_bamboo_reconciler',
                created_at: new Date().toISOString()
            });

        return {
            matched: true,
            bambooPolicyId,
            bambooPolicyNumber,
            targetPolicyId,
            mergedClientName: fullInsuredName
        };
    } catch (err: any) {
        logger.error('BambooAutoMerge', 'Error executing single Bamboo merge', { error: err?.message, bambooPolicyId, targetPolicyId });
        return { matched: false, bambooPolicyId, targetPolicyId, error: err?.message };
    }
}
