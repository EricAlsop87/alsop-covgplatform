/**
 * Dry-Run Duplicate / Merge / Match Analysis
 * ─────────────────────────────────────────────
 * Connects to the live Supabase DB (read-only), runs the same matching
 * algorithms the app uses, and produces a JSON report.
 * 
 * NO WRITES. NO MERGES. NO MUTATIONS.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE env vars. Run with: node -r dotenv/config scripts/analyze_duplicates.js dotenv_config_path=.env.local');
    process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Policy Number Normalization (mirrors src/lib/normalization.ts) ──
function normalizePolicyNumber(raw) {
    if (!raw) return { basePolicy: null, suffix: null };
    let s = raw.toUpperCase().trim().replace(/[^A-Z0-9\s]/g, '');
    const match = s.match(/(?:CFP\s*)?(\d{10})(?:\s*(\d{2}))?\b/);
    if (match) {
        return { basePolicy: `CFP ${match[1]}`, suffix: match[2] || null };
    }
    return { basePolicy: s.replace(/\s+/g, ' '), suffix: null };
}

// ── Name Normalization ──
function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

function tokenize(name) {
    return new Set(
        normalizeName(name).split(' ').filter(t => t.length >= 2)
    );
}

async function fetchAll(table, select, orderBy = 'id') {
    let all = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await sb
            .from(table)
            .select(select)
            .order(orderBy, { ascending: true })
            .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) { console.error(`Error fetching ${table}:`, error.message); break; }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < pageSize) break;
        page++;
    }
    return all;
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  DRY-RUN DUPLICATE / MERGE / MATCH ANALYSIS');
    console.log('  Date:', new Date().toISOString());
    console.log('  Mode: READ-ONLY — No changes will be made');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // 1. LOAD DATA
    // ────────────────────────────────────────────────────────
    console.log('Loading data...');
    const clients = await fetchAll('clients', 'id, named_insured, email, phone, mailing_address_raw, created_at, is_demo');
    const policies = await fetchAll('policies', 'id, policy_number, client_id, property_address_raw, property_address_norm, carrier_name, status, created_at');
    const policyTerms = await fetchAll('policy_terms', 'id, policy_id, carrier_policy_number, effective_date, expiration_date, is_current, annual_premium');
    const flags = await fetchAll('policy_flags', 'id, policy_id, flag_key, status, code, title, severity, times_seen');

    // Filter out demo clients
    const demoClientIds = new Set(clients.filter(c => c.is_demo).map(c => c.id));
    const realClients = clients.filter(c => !c.is_demo);
    const realPolicies = policies.filter(p => !demoClientIds.has(p.client_id));

    console.log(`  Clients: ${realClients.length} (${clients.length - realClients.length} demo excluded)`);
    console.log(`  Policies: ${realPolicies.length}`);
    console.log(`  Policy Terms: ${policyTerms.length}`);
    console.log(`  Flags: ${flags.length}\n`);

    const report = {
        timestamp: new Date().toISOString(),
        totals: { clients: realClients.length, policies: realPolicies.length, terms: policyTerms.length, flags: flags.length },
        clientDuplicates: { exact: [], fuzzy: [] },
        policyDuplicates: [],
        orphanedPolicies: [],
        duplicateFlags: [],
        summary: {}
    };

    // ────────────────────────────────────────────────────────
    // 2. CLIENT DUPLICATE DETECTION
    // ────────────────────────────────────────────────────────
    console.log('─── PHASE 1: Client Duplicate Detection ───\n');

    // 2a. Exact name matches
    const nameMap = new Map();
    for (const c of realClients) {
        const norm = normalizeName(c.named_insured);
        if (norm.length < 3) continue;
        if (!nameMap.has(norm)) nameMap.set(norm, []);
        nameMap.get(norm).push(c);
    }

    for (const [norm, cluster] of nameMap) {
        if (cluster.length < 2) continue;
        const survivor = cluster.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
        const duplicates = cluster.slice(1);
        
        // Count policies for each
        const survivorPolicies = realPolicies.filter(p => p.client_id === survivor.id);
        const dupPolicies = duplicates.flatMap(d => realPolicies.filter(p => p.client_id === d.id));

        report.clientDuplicates.exact.push({
            normalizedName: norm,
            confidence: 95,
            survivorId: survivor.id,
            survivorName: survivor.named_insured,
            survivorEmail: survivor.email,
            survivorPolicyCount: survivorPolicies.length,
            duplicates: duplicates.map(d => ({
                id: d.id,
                name: d.named_insured,
                email: d.email,
                phone: d.phone,
                policyCount: realPolicies.filter(p => p.client_id === d.id).length,
                createdAt: d.created_at,
            })),
            totalPoliciesAffected: survivorPolicies.length + dupPolicies.length,
        });
    }

    console.log(`  Exact name matches: ${report.clientDuplicates.exact.length} group(s)`);
    for (const g of report.clientDuplicates.exact.slice(0, 5)) {
        console.log(`    "${g.survivorName}" — ${g.duplicates.length} duplicate(s), ${g.totalPoliciesAffected} policies affected`);
        for (const d of g.duplicates) {
            console.log(`      ↳ Dup: "${d.name}" (${d.policyCount} policies, email: ${d.email || 'none'})`);
        }
    }
    if (report.clientDuplicates.exact.length > 5) {
        console.log(`    ... and ${report.clientDuplicates.exact.length - 5} more`);
    }

    // 2b. Fuzzy token-subset matches (using the improved REL-7 logic: require 2+ tokens)
    const exactMatchedIds = new Set();
    for (const g of report.clientDuplicates.exact) {
        exactMatchedIds.add(g.survivorId);
        for (const d of g.duplicates) exactMatchedIds.add(d.id);
    }

    const ungrouped = realClients.filter(c =>
        c.named_insured &&
        normalizeName(c.named_insured).length >= 4 &&
        !exactMatchedIds.has(c.id)
    );

    const tokenEntries = ungrouped.map(c => ({
        client: c,
        tokens: tokenize(c.named_insured),
    }));

    const fuzzyMatchedIds = new Set();
    for (let i = 0; i < tokenEntries.length; i++) {
        if (fuzzyMatchedIds.has(tokenEntries[i].client.id)) continue;
        const a = tokenEntries[i];
        const fuzzyCluster = [a.client];

        for (let j = i + 1; j < tokenEntries.length; j++) {
            if (fuzzyMatchedIds.has(tokenEntries[j].client.id)) continue;
            const b = tokenEntries[j];

            // REL-7 fix: require 2+ tokens on subset side
            const aSubsetOfB = a.tokens.size > 1 && [...a.tokens].every(t => b.tokens.has(t));
            const bSubsetOfA = b.tokens.size > 1 && [...b.tokens].every(t => a.tokens.has(t));

            if (aSubsetOfB || bSubsetOfA) {
                fuzzyCluster.push(b.client);
                fuzzyMatchedIds.add(b.client.id);
            }
        }

        if (fuzzyCluster.length > 1) {
            fuzzyMatchedIds.add(a.client.id);
            fuzzyCluster.sort((x, y) => new Date(x.created_at) - new Date(y.created_at));
            const survivor = fuzzyCluster[0];
            const duplicates = fuzzyCluster.slice(1);

            report.clientDuplicates.fuzzy.push({
                confidence: 70,
                reason: 'Token-subset match (name variation)',
                survivorId: survivor.id,
                survivorName: survivor.named_insured,
                duplicates: duplicates.map(d => ({
                    id: d.id,
                    name: d.named_insured,
                    policyCount: realPolicies.filter(p => p.client_id === d.id).length,
                })),
            });
        }
    }

    console.log(`\n  Fuzzy (token-subset) matches: ${report.clientDuplicates.fuzzy.length} group(s)`);
    for (const g of report.clientDuplicates.fuzzy.slice(0, 5)) {
        console.log(`    "${g.survivorName}" ↔ ${g.duplicates.map(d => `"${d.name}"`).join(', ')}`);
    }
    if (report.clientDuplicates.fuzzy.length > 5) {
        console.log(`    ... and ${report.clientDuplicates.fuzzy.length - 5} more`);
    }

    // ────────────────────────────────────────────────────────
    // 3. POLICY DUPLICATE DETECTION
    // ────────────────────────────────────────────────────────
    console.log('\n─── PHASE 2: Policy Duplicate Detection ───\n');

    const policyBaseMap = new Map();
    for (const p of realPolicies) {
        // Check policy_number AND all carrier_policy_numbers from terms
        const termsForPolicy = policyTerms.filter(t => t.policy_id === p.id);
        const numbers = [p.policy_number, ...termsForPolicy.map(t => t.carrier_policy_number)].filter(Boolean);
        
        const bases = new Set();
        for (const num of numbers) {
            const { basePolicy } = normalizePolicyNumber(num);
            if (basePolicy) bases.add(basePolicy);
        }

        for (const base of bases) {
            if (!policyBaseMap.has(base)) policyBaseMap.set(base, []);
            policyBaseMap.get(base).push({
                ...p,
                terms: termsForPolicy,
                normalizedBase: base,
            });
        }
    }

    for (const [base, cluster] of policyBaseMap) {
        if (cluster.length < 2) continue;

        // Check if they belong to different client_ids (cross-client duplicate = more serious)
        const clientIds = new Set(cluster.map(p => p.client_id));
        const sameClient = clientIds.size === 1;

        const survivor = cluster.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
        const duplicates = cluster.slice(1);

        report.policyDuplicates.push({
            normalizedBase: base,
            confidence: sameClient ? 90 : 75,
            type: sameClient ? 'same-client' : 'cross-client',
            survivorId: survivor.id,
            survivorPolicyNumber: survivor.policy_number,
            survivorClientId: survivor.client_id,
            survivorAddress: survivor.property_address_raw,
            duplicates: duplicates.map(d => ({
                id: d.id,
                policyNumber: d.policy_number,
                clientId: d.client_id,
                address: d.property_address_raw,
                termCount: d.terms.length,
                createdAt: d.created_at,
            })),
        });
    }

    console.log(`  Policy duplicates by normalized number: ${report.policyDuplicates.length} group(s)`);
    const sameClient = report.policyDuplicates.filter(g => g.type === 'same-client');
    const crossClient = report.policyDuplicates.filter(g => g.type === 'cross-client');
    console.log(`    Same-client duplicates: ${sameClient.length}`);
    console.log(`    Cross-client duplicates: ${crossClient.length}`);

    for (const g of report.policyDuplicates.slice(0, 8)) {
        const survivorClient = realClients.find(c => c.id === g.survivorClientId);
        console.log(`\n    Base: ${g.normalizedBase} (${g.type}, confidence: ${g.confidence}%)`);
        console.log(`      Survivor: ${g.survivorPolicyNumber} → Client: "${survivorClient?.named_insured}" | ${g.survivorAddress || 'no address'}`);
        for (const d of g.duplicates) {
            const dupClient = realClients.find(c => c.id === d.clientId);
            console.log(`      Dup:      ${d.policyNumber} → Client: "${dupClient?.named_insured}" | ${d.address || 'no address'} (${d.termCount} terms)`);
        }
    }
    if (report.policyDuplicates.length > 8) {
        console.log(`\n    ... and ${report.policyDuplicates.length - 8} more`);
    }

    // ────────────────────────────────────────────────────────
    // 4. ORPHANED POLICIES (client_id points to non-existent client)
    // ────────────────────────────────────────────────────────
    console.log('\n─── PHASE 3: Orphaned Policies ───\n');

    const clientIdSet = new Set(clients.map(c => c.id));
    for (const p of realPolicies) {
        if (!clientIdSet.has(p.client_id)) {
            report.orphanedPolicies.push({
                policyId: p.id,
                policyNumber: p.policy_number,
                clientId: p.client_id,
                address: p.property_address_raw,
            });
        }
    }
    console.log(`  Orphaned policies (missing client): ${report.orphanedPolicies.length}`);
    for (const o of report.orphanedPolicies.slice(0, 3)) {
        console.log(`    Policy "${o.policyNumber}" → client_id ${o.clientId} (NOT FOUND)`);
    }

    // ────────────────────────────────────────────────────────
    // 5. DUPLICATE FLAGS (same flag_key, multiple open records)
    // ────────────────────────────────────────────────────────
    console.log('\n─── PHASE 4: Duplicate Open Flags ───\n');

    const openFlags = flags.filter(f => f.status === 'open');
    const flagKeyMap = new Map();
    for (const f of openFlags) {
        const key = f.flag_key;
        if (!key) continue;
        if (!flagKeyMap.has(key)) flagKeyMap.set(key, []);
        flagKeyMap.get(key).push(f);
    }

    for (const [key, cluster] of flagKeyMap) {
        if (cluster.length < 2) continue;
        report.duplicateFlags.push({
            flagKey: key,
            count: cluster.length,
            code: cluster[0].code,
            title: cluster[0].title,
            severity: cluster[0].severity,
            flagIds: cluster.map(f => f.id),
        });
    }

    console.log(`  Duplicate open flags (same flag_key): ${report.duplicateFlags.length} group(s)`);
    for (const g of report.duplicateFlags.slice(0, 5)) {
        console.log(`    "${g.title}" (${g.code}) — ${g.count} duplicates, severity: ${g.severity}`);
    }

    // ────────────────────────────────────────────────────────
    // SUMMARY
    // ────────────────────────────────────────────────────────
    report.summary = {
        clientExactDuplicates: report.clientDuplicates.exact.length,
        clientFuzzyMatches: report.clientDuplicates.fuzzy.length,
        totalClientDuplicateRecords: report.clientDuplicates.exact.reduce((s, g) => s + g.duplicates.length, 0) +
            report.clientDuplicates.fuzzy.reduce((s, g) => s + g.duplicates.length, 0),
        policyDuplicateGroups: report.policyDuplicates.length,
        policyDuplicateSameClient: sameClient.length,
        policyDuplicateCrossClient: crossClient.length,
        totalPolicyDuplicateRecords: report.policyDuplicates.reduce((s, g) => s + g.duplicates.length, 0),
        orphanedPolicies: report.orphanedPolicies.length,
        duplicateFlagGroups: report.duplicateFlags.length,
    };

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Client duplicates (exact name):    ${report.summary.clientExactDuplicates} groups (${report.clientDuplicates.exact.reduce((s, g) => s + g.duplicates.length, 0)} mergeable records)`);
    console.log(`  Client duplicates (fuzzy match):   ${report.summary.clientFuzzyMatches} groups (${report.clientDuplicates.fuzzy.reduce((s, g) => s + g.duplicates.length, 0)} mergeable records)`);
    console.log(`  Policy duplicates (same base #):   ${report.summary.policyDuplicateGroups} groups (${report.summary.totalPolicyDuplicateRecords} mergeable records)`);
    console.log(`    ├─ Same client:                  ${report.summary.policyDuplicateSameClient}`);
    console.log(`    └─ Cross client:                 ${report.summary.policyDuplicateCrossClient}`);
    console.log(`  Orphaned policies:                 ${report.summary.orphanedPolicies}`);
    console.log(`  Duplicate open flags:              ${report.summary.duplicateFlagGroups} groups`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Write full report to file
    const fs = require('fs');
    const reportPath = 'scripts/duplicate_analysis_report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Full report written to: ${reportPath}`);
}

main().catch(console.error);
