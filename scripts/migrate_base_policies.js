const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
    if (line.includes('=') && !line.startsWith('#')) {
        const [k, ...rest] = line.split('=');
        env[k.trim()] = rest.join('=').trim();
    }
});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function normalizePolicyNumber(rawPolicy) {
    if (!rawPolicy) return { basePolicy: null, suffix: null };

    let s = rawPolicy.toUpperCase().trim();
    s = s.replace(/[^A-Z0-9\s]/g, '');

    const regex = /(?:CFP\s*)?(\d{10})(?:\s*(\d{2}))?\b/;
    const match = s.match(regex);

    if (match) {
        const baseDigits = match[1];
        const suffix = match[2] ? match[2] : null;
        return { basePolicy: `CFP ${baseDigits}`, suffix };
    }

    return { basePolicy: s.replace(/\s+/g, ' '), suffix: null };
}

async function runMigration() {
    console.log("=== POLICY LINEAGE MIGRATION SCRIPT ===");
    
    // 1. Fetch all policies
    const { data: policies, error: polErr } = await sb.from('policies').select('id, policy_number, status, updated_at, property_address_norm');
    if (polErr) { console.error("Error fetching policies:", polErr); return; }

    console.log(`Found ${policies.length} total policies.`);

    // 2. Group by normalized Base Policy + normalized Address (if any)
    const grouped = {};
    const exactMatches = {};

    for (const p of policies) {
        const { basePolicy, suffix } = normalizePolicyNumber(p.policy_number);
        const key = `${basePolicy}|${p.property_address_norm || 'UNKNOWN'}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push({ ...p, basePolicy, suffix });
        
        // Also fix the policy if it's currently a raw suffix form but has no duplicates
        if (basePolicy && basePolicy !== p.policy_number) {
            exactMatches[p.id] = basePolicy;
        }
    }

    let mergedCount = 0;
    let standardizedCount = 0;

    // 3. Process groups
    for (const key of Object.keys(grouped)) {
        const pols = grouped[key];
        if (pols.length > 1) {
            // We have duplicates!
            console.log(`\nFound duplicate cluster for [${key}] (${pols.length} variants)`);
            pols.forEach(p => console.log(`  - ${p.policy_number} -> Suffix: ${p.suffix || 'None'}`));
            
            // Elect a survivor (Oldest creation or just the first one if we sort by length)
            const survivor = pols[0];
            const duplicates = pols.slice(1);
            
            console.log(`  Targeting Survivor: ${survivor.id} acting as Base Container.`);
            
            // Ensure survivor has the unified base_policy string
            if (survivor.policy_number !== survivor.basePolicy) {
                await sb.from('policies').update({ policy_number: survivor.basePolicy }).eq('id', survivor.id);
                console.log(`  Updated Survivor to base policy string: ${survivor.basePolicy}`);
            }

            // Remap terms & delete duplicates
            for (const dup of duplicates) {
                // Relink terms
                await sb.from('policy_terms').update({ policy_id: survivor.id }).eq('policy_id', dup.id);
                // Relink dec_pages
                await sb.from('dec_pages').update({ policy_id: survivor.id }).eq('policy_id', dup.id);
                // Delete duplicate policy
                await sb.from('policies').delete().eq('id', dup.id);
                console.log(`  Merged and deleted duplicate: ${dup.id} (${dup.policy_number})`);
                mergedCount++;
            }
        } else {
            // No duplicates, just standardize the policy string if needed
            const single = pols[0];
            if (single.policy_number !== single.basePolicy && single.basePolicy) {
                await sb.from('policies').update({ policy_number: single.basePolicy }).eq('id', single.id);
                standardizedCount++;
                console.log(`Standardized isolated policy: ${single.policy_number} -> ${single.basePolicy}`);
            }
        }
    }

    console.log(`\n=== MIGRATION COMPLETE ===`);
    console.log(`Merged Duplicates: ${mergedCount}`);
    console.log(`Standardized Isolates: ${standardizedCount}`);
}

runMigration();
