import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { normalizePolicyNumber } from '@/lib/normalization';
import { logger } from '@/lib/logger';

/** Detect hex-string placeholder names from legacy CSV imports */
function isHexPlaceholder(name: string | null): boolean {
    if (!name) return false;
    return /^[0-9A-Fa-f]{10,}$/.test(name.replace(/\s/g, ''));
}

/**
 * Selects the best survivor from a cluster of duplicate clients.
 * Priority: real name > hex placeholder, more tokens > fewer, older > newer
 */
function selectBestSurvivor(cluster: any[]): { survivor: any; duplicates: any[] } {
    const scored = cluster.map(c => {
        const name = c.named_insured || '';
        const isHex = isHexPlaceholder(name);
        const tokens = name.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter((t: string) => t.length >= 2);
        return {
            client: c,
            isHex,
            tokenCount: tokens.length,
            nameLength: name.length,
            createdAt: new Date(c.created_at).getTime(),
        };
    });
    
    scored.sort((a, b) => {
        // Real names win over hex placeholders
        if (a.isHex !== b.isHex) return a.isHex ? 1 : -1;
        // More tokens = more context = better survivor
        if (a.tokenCount !== b.tokenCount) return b.tokenCount - a.tokenCount;
        // Longer name = more detail
        if (a.nameLength !== b.nameLength) return b.nameLength - a.nameLength;
        // Tie-break: older record
        return a.createdAt - b.createdAt;
    });
    
    return {
        survivor: scored[0].client,
        duplicates: scored.slice(1).map(s => s.client),
    };
}

export interface DuplicateGroup {
    type: 'client' | 'policy';
    tier: 1 | 2 | 3;
    survivor_id: string;
    merged_ids: string[];
    confidence: number;
    reason: string;
    details: any;
}

/**
 * Service to execute sweeping database inspections to identify possible duplicate records
 * in order to surface them on the DuplicateReview operations queue.
 */
export class DuplicateEngine {

    /**
     * Finds clustered duplicate policies by enforcing the Global Policy Invariant:
     * Identifies multiple distinct `policies` rows that share the EXACT same Base Policy Normalization.
     */
    static async findPolicyDuplicates(): Promise<DuplicateGroup[]> {
        const supabaseAdmin = getSupabaseAdmin();
        let policies: any[] = [];
        let hasMore = true;
        let page = 0;
        const pageSize = 1000;

        while (hasMore) {
            try {
                const { data, error } = await supabaseAdmin
                    .from('policies')
                    .select('id, policy_number, created_at, client_id, property_address_norm')
                    .order('id', { ascending: true })
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (error) {
                    logger.error('duplicateEngine', "Error fetching policies for duplicate detection", { error: error.message })
                    return [];
                }

                if (data && data.length > 0) {
                    policies = policies.concat(data);
                    if (data.length < pageSize) hasMore = false;
                    else page++;
                } else {
                    hasMore = false;
                }
            } catch (error) {
                logger.error('duplicateEngine', "Error fetching policies for duplicate detection", { error: error instanceof Error ? error.message : String(error) })
                return [];
            }
        }

        // Group by Normalized Base Policy
        const grouped = new Map<string, typeof policies>();

        for (const pol of policies) {
            const { basePolicy } = normalizePolicyNumber(pol.policy_number);
            if (!basePolicy) continue;
            
            if (!grouped.has(basePolicy)) {
                grouped.set(basePolicy, []);
            }
            grouped.get(basePolicy)!.push(pol);
        }

        const exactDuplicates: DuplicateGroup[] = [];

        for (const [base, cluster] of grouped.entries()) {
            if (cluster.length > 1) {
                // Prioritize pure base policies (no sequence suffix). Ties broken by creation date.
                cluster.sort((a, b) => {
                    const normA = normalizePolicyNumber(a.policy_number);
                    const normB = normalizePolicyNumber(b.policy_number);
                    
                    const hasSuffixA = normA.suffix ? 1 : 0;
                    const hasSuffixB = normB.suffix ? 1 : 0;
                    
                    if (hasSuffixA !== hasSuffixB) {
                        return hasSuffixA - hasSuffixB; // 0 comes before 1
                    }
                    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                });
                
                const survivor = cluster[0];
                const merges = cluster.slice(1);

                exactDuplicates.push({
                    type: 'policy',
                    tier: 1,
                    survivor_id: survivor.id,
                    merged_ids: merges.map(m => m.id),
                    confidence: 100, // Exact Base Match is 100% confidence globally
                    reason: `Shares identical Base Policy Number: ${base}`,
                    details: {
                        survivor,
                        duplicates: merges
                    }
                });
            }
        }

        return exactDuplicates;
    }

    /**
     * Finds clustered duplicate clients via Name + Linked Policy overlap.
     */
    static async findClientDuplicates(): Promise<DuplicateGroup[]> {
        const supabaseAdmin = getSupabaseAdmin();
        let clients: any[] = [];
        let hasMore = true;
        let page = 0;
        const pageSize = 1000;

        while (hasMore) {
            try {
                const { data, error } = await supabaseAdmin
                    .from('clients')
                    .select(`
                        id, named_insured, email, phone, mailing_address_raw, mailing_address_norm, created_at,
                        policies(id, policy_number, carrier_name, property_address_raw, status, created_at,
                            policy_terms(id, effective_date, expiration_date, annual_premium, is_current),
                            platform_documents(id, doc_type, file_name, created_at)),
                        dec_pages(id, policy_number, created_at, submission_id, dec_page_submissions(file_name))
                    `)
                    .order('id', { ascending: true })
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (error) {
                    logger.error('duplicateEngine', "Error fetching clients for duplicate detection", { error: error.message })
                    return [];
                }

                if (data && data.length > 0) {
                    clients = clients.concat(data);
                    if (data.length < pageSize) hasMore = false;
                    else page++;
                } else {
                    hasMore = false;
                }
            } catch (error) {
                logger.error('duplicateEngine', "Error fetching clients for duplicate detection", { error: error instanceof Error ? error.message : String(error) })
                return [];
            }
        }

        // ── Phase 1: Exact normalized name grouping ──
        // Normalize: remove spacing, punctuation, and lowercase
        const grouped = new Map<string, typeof clients>();

        for (const c of clients) {
            if (!c.named_insured) continue;
            const normName = c.named_insured.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normName.length < 4) continue;

            if (!grouped.has(normName)) {
                grouped.set(normName, []);
            }
            grouped.get(normName)!.push(c);
        }

        const candidateDuplicates: DuplicateGroup[] = [];
        const exactMatchedIds = new Set<string>();

        for (const [, cluster] of grouped.entries()) {
            if (cluster.length > 1) {
                const { survivor, duplicates: merges } = selectBestSurvivor(cluster);

                const survivorAddresses = (survivor.policies || []).map((p: any) => 
                    (p.property_address_raw || '').toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(' ').slice(0, 3).join(' ')
                ).filter((a: string) => a.length > 5);

                const dupAddresses = merges.flatMap((d: any) => 
                    (d.policies || []).map((p: any) =>
                        (p.property_address_raw || '').toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(' ').slice(0, 3).join(' ')
                    ).filter((a: string) => a.length > 5)
                );

                const sharedAddress = survivorAddresses.some((a: string) => dupAddresses.includes(a));

                const survivorBases = new Set((survivor.policies || []).map((p: any) => normalizePolicyNumber(p.policy_number).basePolicy).filter(Boolean));
                const sharedPolicy = merges.some((d: any) => 
                    (d.policies || []).some((p: any) => survivorBases.has(normalizePolicyNumber(p.policy_number).basePolicy))
                );

                let confidence = 85;
                let reason = 'Identical Normalized Name';
                let tier: 1 | 2 | 3 = 1;

                const isSingleWord = (survivor.named_insured || '').trim().split(/\s+/).length === 1;
                const survivorIsHex = isHexPlaceholder(survivor.named_insured);
                const hasHexMerge = merges.some((m: any) => isHexPlaceholder(m.named_insured));
                const isHexToReal = !survivorIsHex && hasHexMerge;
                const isHexToHex = survivorIsHex && merges.every((m: any) => isHexPlaceholder(m.named_insured));

                if (sharedPolicy) {
                    confidence = 95;
                    reason = 'Identical Normalized Name + Shared Policy Base Number';
                } else if (sharedAddress) {
                    confidence = 90;
                    reason = 'Identical Normalized Name + Shared Property Address';
                }

                if (isSingleWord) {
                    if (sharedPolicy || sharedAddress) {
                        tier = 2;
                    } else {
                        confidence = 40;
                        tier = 3;
                    }
                } else {
                    if (confidence >= 90 || isHexToReal || (!isHexToHex)) {
                        tier = 1;
                    }
                    if (isHexToHex && !sharedPolicy) {
                        tier = 3;
                    }
                }

                candidateDuplicates.push({
                    type: 'client',
                    tier,
                    survivor_id: survivor.id,
                    merged_ids: merges.map((m: any) => m.id),
                    confidence,
                    reason,
                    details: {
                        survivor,
                        duplicates: merges
                    }
                });
                for (const c of cluster) exactMatchedIds.add(c.id);
            }
        }

        // ── Phase 2: Token-subset fuzzy matching ──
        // Catches variations like "Jason Wolsefer" vs "Jason J. Wolsefer"
        // where one name's tokens are a subset of another's.
        const ungrouped = clients.filter(c =>
            c.named_insured &&
            c.named_insured.toLowerCase().replace(/[^a-z0-9]/g, '').length >= 4 &&
            !exactMatchedIds.has(c.id)
        );

        // Tokenize each ungrouped client's name
        interface TokenEntry { client: any; tokens: Set<string>; }
        const tokenEntries: TokenEntry[] = ungrouped.map(c => ({
            client: c,
            tokens: new Set(
                c.named_insured
                    .toLowerCase()
                    .replace(/[^a-z\s]/g, '')  // keep letters + spaces
                    .split(/\s+/)
                    .filter((t: string) => t.length >= 2)  // skip single-char tokens like middle initials
            ),
        }));

        const fuzzyMatchedIds = new Set<string>();

        for (let i = 0; i < tokenEntries.length; i++) {
            if (fuzzyMatchedIds.has(tokenEntries[i].client.id)) continue;

            const a = tokenEntries[i];
            const fuzzyCluster: any[] = [a.client];

            for (let j = i + 1; j < tokenEntries.length; j++) {
                if (fuzzyMatchedIds.has(tokenEntries[j].client.id)) continue;
                const b = tokenEntries[j];

                // Check if one is a subset of the other (both directions)
                // e.g. {jason, wolsefer} ⊂ {jason, wolsefer} (exact on long tokens)
                // or {jason, wolsefer} vs {jason, j, wolsefer} — after filtering short tokens
                // Require at least 2 tokens on the subset side to prevent
                // single-name over-matching (e.g. "Jason" matching all "Jason *")
                const aSubsetOfB = a.tokens.size > 1 && [...a.tokens].every(t => b.tokens.has(t));
                const bSubsetOfA = b.tokens.size > 1 && [...b.tokens].every(t => a.tokens.has(t));

                if (aSubsetOfB || bSubsetOfA) {
                    fuzzyCluster.push(b.client);
                    fuzzyMatchedIds.add(b.client.id);
                }
            }

            if (fuzzyCluster.length > 1) {
                fuzzyMatchedIds.add(a.client.id);
                const { survivor, duplicates: merges } = selectBestSurvivor(fuzzyCluster);

                let confidence = 70;
                let reason = 'Similar Name (Token Match)';
                let tier: 1 | 2 | 3 = 2; // Token-subset matching implies 2+ shared tokens

                const survivorAddresses = (survivor.policies || []).map((p: any) => 
                    (p.property_address_raw || '').toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(' ').slice(0, 3).join(' ')
                ).filter((a: string) => a.length > 5);

                const dupAddresses = merges.flatMap((d: any) => 
                    (d.policies || []).map((p: any) =>
                        (p.property_address_raw || '').toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(' ').slice(0, 3).join(' ')
                    ).filter((a: string) => a.length > 5)
                );

                const sharedAddress = survivorAddresses.some((a: string) => dupAddresses.includes(a));

                const survivorBases = new Set((survivor.policies || []).map((p: any) => normalizePolicyNumber(p.policy_number).basePolicy).filter(Boolean));
                const sharedPolicy = merges.some((d: any) => 
                    (d.policies || []).some((p: any) => survivorBases.has(normalizePolicyNumber(p.policy_number).basePolicy))
                );

                if (sharedPolicy) {
                    confidence = 95;
                    reason = 'Similar Name + Shared Policy Base Number';
                } else if (sharedAddress) {
                    confidence = 90;
                    reason = 'Similar Name + Shared Property Address';
                }

                const survivorIsHex = isHexPlaceholder(survivor.named_insured);
                const isHexToHex = survivorIsHex && merges.every((m: any) => isHexPlaceholder(m.named_insured));

                if (confidence >= 90) {
                    tier = 1;
                } else if (isHexToHex && !sharedPolicy) {
                    tier = 3;
                }

                candidateDuplicates.push({
                    type: 'client',
                    tier,
                    survivor_id: survivor.id,
                    merged_ids: merges.map((m: any) => m.id),
                    confidence,
                    reason,
                    details: {
                        survivor,
                        duplicates: merges
                    }
                });
            }
        }

        return candidateDuplicates;
    }
}
