/**
 * Deep Classification Script — Categorizes duplicates into merge tiers
 * Uses address and policy data as corroborating evidence.
 * READ-ONLY — no mutations.
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function normalizePolicyNumber(raw) {
    if (!raw) return { basePolicy: null, suffix: null };
    let s = raw.toUpperCase().trim().replace(/[^A-Z0-9\s]/g, '');
    const match = s.match(/(?:CFP\s*)?(\d{10})(?:\s*(\d{2}))?\b/);
    if (match) return { basePolicy: `CFP ${match[1]}`, suffix: match[2] || null };
    return { basePolicy: s.replace(/\s+/g, ' '), suffix: null };
}

function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeAddress(addr) {
    if (!addr) return '';
    return addr.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function isHexPlaceholder(name) {
    if (!name) return false;
    return /^[0-9A-Fa-f]{10,}$/.test(name.replace(/\s/g, ''));
}

function isFirstNameOnly(name) {
    if (!name) return true;
    const tokens = normalizeName(name).split(' ').filter(t => t.length >= 2);
    return tokens.length <= 1;
}

async function fetchAll(table, select) {
    let all = [], page = 0;
    while (true) {
        const { data, error } = await sb.from(table).select(select)
            .order('id', { ascending: true }).range(page * 1000, (page + 1) * 1000 - 1);
        if (error || !data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < 1000) break;
        page++;
    }
    return all;
}

async function main() {
    const clients = await fetchAll('clients', 'id, named_insured, email, phone, mailing_address_raw, created_at, is_demo');
    const policies = await fetchAll('policies', 'id, policy_number, client_id, property_address_raw, property_address_norm, carrier_name, status, created_at');
    const terms = await fetchAll('policy_terms', 'id, policy_id, carrier_policy_number, effective_date, expiration_date, is_current, annual_premium');

    const demoIds = new Set(clients.filter(c => c.is_demo).map(c => c.id));
    const realClients = clients.filter(c => !c.is_demo);
    const realPolicies = policies.filter(p => !demoIds.has(p.client_id));

    // Build lookup maps
    const clientById = new Map(realClients.map(c => [c.id, c]));
    const policiesByClientId = new Map();
    for (const p of realPolicies) {
        if (!policiesByClientId.has(p.client_id)) policiesByClientId.set(p.client_id, []);
        policiesByClientId.get(p.client_id).push(p);
    }

    function getAddressesForClient(clientId) {
        const pols = policiesByClientId.get(clientId) || [];
        return pols.map(p => normalizeAddress(p.property_address_raw)).filter(a => a.length > 5);
    }

    function addressesOverlap(addrsA, addrsB) {
        for (const a of addrsA) {
            for (const b of addrsB) {
                // Check if addresses share the same street number and first word
                const partsA = a.split(' ').slice(0, 3).join(' ');
                const partsB = b.split(' ').slice(0, 3).join(' ');
                if (partsA.length > 5 && partsA === partsB) return true;
            }
        }
        return false;
    }

    function sharesPolicyBase(clientIdA, clientIdB) {
        const polsA = policiesByClientId.get(clientIdA) || [];
        const polsB = policiesByClientId.get(clientIdB) || [];
        const basesA = new Set(polsA.map(p => normalizePolicyNumber(p.policy_number).basePolicy).filter(Boolean));
        for (const p of polsB) {
            const base = normalizePolicyNumber(p.policy_number).basePolicy;
            if (base && basesA.has(base)) return true;
        }
        return false;
    }

    // ── TIER CLASSIFICATION ──
    const tier1_auto = [];    // Safe to auto-merge
    const tier2_review = [];  // Merge with supporting context
    const tier3_skip = [];    // Skip / can't tell

    // ── Process report ──
    const report = JSON.parse(fs.readFileSync('scripts/duplicate_analysis_report.json', 'utf-8'));

    // === EXACT CLIENT MATCHES ===
    for (const g of report.clientDuplicates.exact) {
        const survivorName = g.survivorName;
        const firstNameOnly = isFirstNameOnly(survivorName);
        const hexSurvivor = isHexPlaceholder(survivorName);
        const allDupsHex = g.duplicates.every(d => isHexPlaceholder(d.name));
        const survivorAddrs = getAddressesForClient(g.survivorId);

        for (const d of g.duplicates) {
            const dupAddrs = getAddressesForClient(d.id);
            const sharedAddr = addressesOverlap(survivorAddrs, dupAddrs);
            const sharedPolicy = sharesPolicyBase(g.survivorId, d.id);

            const entry = {
                type: 'client_exact',
                survivorId: g.survivorId,
                survivorName: g.survivorName,
                duplicateId: d.id,
                duplicateName: d.name,
                survivorPolicies: g.survivorPolicyCount,
                duplicatePolicies: d.policyCount,
                sharedAddress: sharedAddr,
                sharedPolicyBase: sharedPolicy,
                survivorAddresses: survivorAddrs.slice(0, 2),
                duplicateAddresses: dupAddrs.slice(0, 2),
            };

            if (hexSurvivor && isHexPlaceholder(d.name)) {
                // Both hex — need to check if shared policy links them
                if (sharedPolicy || sharedAddr) {
                    entry.reason = 'Both hex placeholders, but share policy base or address';
                    tier1_auto.push(entry);
                } else {
                    entry.reason = 'Both hex placeholders, no corroborating data';
                    tier3_skip.push(entry);
                }
            } else if (!firstNameOnly) {
                // Multi-word name exact match = very high confidence
                if (sharedPolicy || sharedAddr) {
                    entry.reason = `Exact full name match + ${sharedPolicy ? 'shared policy' : 'shared address'}`;
                    tier1_auto.push(entry);
                } else {
                    entry.reason = 'Exact full name match (no corroborating address/policy)';
                    tier1_auto.push(entry); // Still auto — exact full names are reliable
                }
            } else {
                // First-name-only exact match
                if (sharedPolicy) {
                    entry.reason = 'First-name-only but shares same policy base number';
                    tier2_review.push(entry);
                } else if (sharedAddr) {
                    entry.reason = 'First-name-only but shares same address';
                    tier2_review.push(entry);
                } else {
                    entry.reason = 'First-name-only, no corroborating data — could be different people';
                    tier3_skip.push(entry);
                }
            }
        }
    }

    // === FUZZY CLIENT MATCHES ===
    for (const g of report.clientDuplicates.fuzzy) {
        const survivorAddrs = getAddressesForClient(g.survivorId);

        for (const d of g.duplicates) {
            const dupAddrs = getAddressesForClient(d.id);
            const sharedAddr = addressesOverlap(survivorAddrs, dupAddrs);
            const sharedPolicy = sharesPolicyBase(g.survivorId, d.id);

            const entry = {
                type: 'client_fuzzy',
                survivorId: g.survivorId,
                survivorName: g.survivorName,
                duplicateId: d.id,
                duplicateName: d.name,
                duplicatePolicies: d.policyCount,
                sharedAddress: sharedAddr,
                sharedPolicyBase: sharedPolicy,
                survivorAddresses: survivorAddrs.slice(0, 2),
                duplicateAddresses: dupAddrs.slice(0, 2),
            };

            if (sharedPolicy) {
                entry.reason = 'Fuzzy name + shared policy base — almost certainly same person';
                tier1_auto.push(entry);
            } else if (sharedAddr) {
                entry.reason = 'Fuzzy name + shared address — very likely same person';
                tier1_auto.push(entry);
            } else {
                // No corroborating data — check name quality
                const survivorTokens = normalizeName(g.survivorName).split(' ').filter(t => t.length >= 2);
                const dupTokens = normalizeName(d.name).split(' ').filter(t => t.length >= 2);
                const overlap = survivorTokens.filter(t => dupTokens.includes(t));
                
                if (overlap.length >= 2 && (survivorTokens.length <= dupTokens.length + 1)) {
                    entry.reason = `Strong fuzzy match (${overlap.length} shared tokens) but no address/policy confirmation`;
                    tier2_review.push(entry);
                } else {
                    entry.reason = 'Weak fuzzy match, no corroborating data';
                    tier3_skip.push(entry);
                }
            }
        }
    }

    // === SAME-CLIENT POLICY DUPLICATES ===
    const policyTier1 = [];
    const policyTier2 = [];

    for (const g of report.policyDuplicates) {
        if (g.type === 'same-client') {
            policyTier1.push({
                ...g,
                tier: 1,
                reason: 'Same client, same base policy number — safe to merge terms',
            });
        } else {
            // Cross-client — check if the clients are already in our merge tiers
            const clientA = clientById.get(g.survivorClientId);
            const clientB_ids = g.duplicates.map(d => d.clientId);
            
            const clientMergeFound = [...tier1_auto, ...tier2_review].some(m => 
                (m.survivorId === g.survivorClientId && clientB_ids.includes(m.duplicateId)) ||
                (clientB_ids.includes(m.survivorId) && m.duplicateId === g.survivorClientId)
            );

            if (clientMergeFound) {
                policyTier1.push({
                    ...g,
                    tier: 1,
                    reason: 'Cross-client but clients are already identified as duplicates',
                });
            } else {
                policyTier2.push({
                    ...g,
                    tier: 2,
                    reason: 'Cross-client, clients not yet matched — needs manual review',
                });
            }
        }
    }

    // ── OUTPUT ──
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  MERGE TIER CLASSIFICATION');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`  TIER 1 — AUTO-MERGE (safe, high confidence):`);
    console.log(`    Client merges:  ${tier1_auto.length}`);
    console.log(`    Policy merges:  ${policyTier1.length}`);

    console.log(`\n  TIER 2 — REVIEW + MERGE (with confirmation):`);
    console.log(`    Client merges:  ${tier2_review.length}`);
    console.log(`    Policy merges:  ${policyTier2.length}`);

    console.log(`\n  TIER 3 — SKIP (can't confirm):`);
    console.log(`    Skipped:        ${tier3_skip.length}`);

    // Write classified report
    const classified = {
        timestamp: new Date().toISOString(),
        tier1_auto_merge: {
            clients: tier1_auto,
            policies: policyTier1,
            totalClients: tier1_auto.length,
            totalPolicies: policyTier1.length,
        },
        tier2_review_merge: {
            clients: tier2_review,
            policies: policyTier2,
            totalClients: tier2_review.length,
            totalPolicies: policyTier2.length,
        },
        tier3_skip: {
            clients: tier3_skip,
            totalSkipped: tier3_skip.length,
        },
    };

    // Print tier 1 examples
    console.log('\n─── TIER 1 AUTO-MERGE EXAMPLES ───\n');
    for (const m of tier1_auto.slice(0, 10)) {
        const addrInfo = m.sharedAddress ? `✅ shared address` : (m.sharedPolicyBase ? '✅ shared policy' : '📛 exact full name');
        console.log(`  "${m.survivorName}" ← merge ← "${m.duplicateName}"  [${m.type}] ${addrInfo}`);
        if (m.survivorAddresses?.length) console.log(`    Survivor addr: ${m.survivorAddresses[0]}`);
        if (m.duplicateAddresses?.length) console.log(`    Dup addr:      ${m.duplicateAddresses[0]}`);
        console.log(`    Reason: ${m.reason}`);
    }

    console.log('\n─── TIER 2 REVIEW EXAMPLES ───\n');
    for (const m of tier2_review.slice(0, 10)) {
        console.log(`  "${m.survivorName}" ↔ "${m.duplicateName}"  [${m.type}]`);
        if (m.survivorAddresses?.length) console.log(`    Survivor addr: ${m.survivorAddresses[0]}`);
        if (m.duplicateAddresses?.length) console.log(`    Dup addr:      ${m.duplicateAddresses[0]}`);
        console.log(`    Reason: ${m.reason}`);
    }

    console.log('\n─── TIER 3 SKIP EXAMPLES ───\n');
    for (const m of tier3_skip.slice(0, 10)) {
        console.log(`  "${m.survivorName}" ↔ "${m.duplicateName}"  [${m.type}]`);
        console.log(`    Reason: ${m.reason}`);
    }

    fs.writeFileSync('scripts/merge_classification.json', JSON.stringify(classified, null, 2));
    console.log('\n\nFull classification written to: scripts/merge_classification.json');
}

main().catch(console.error);
