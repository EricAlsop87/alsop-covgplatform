const fs = require('fs');
const envStr = fs.readFileSync('.env.local', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^"|"$/g, '');
});
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function normalizePolicyNumber(rawPolicy) {
    if (!rawPolicy) {
        return { basePolicy: null, suffix: null };
    }

    let s = rawPolicy.toUpperCase().trim();
    // Remove all non-alphanumeric except spaces
    s = s.replace(/[^A-Z0-9\s]/g, '');

    // Strategy: Optional 'CFP ', exactly 10 digits, optional spaces, optional 2 digits of suffix.
    const regex = /(?:CFP\s*)?(\d{10})(?:\s*(\d{2}))?\b/;
    const match = s.match(regex);

    if (match) {
        const baseDigits = match[1];
        const suffix = match[2] ? match[2] : null;
        return { basePolicy: 'CFP ' + baseDigits, suffix };
    }

    return { basePolicy: s.replace(/\s+/g, ' '), suffix: null };
}

async function run() {
    const { data: policies, error } = await supabaseAdmin
        .from('policies')
        .select('id, policy_number, created_at, client_id, property_address_norm')
        .ilike('policy_number', '%0101728613%');

    console.log('Policies from DB:', policies);

    const grouped = new Map();
    for (const pol of policies) {
        const { basePolicy } = normalizePolicyNumber(pol.policy_number);
        console.log(pol.policy_number, '=>', basePolicy);
        if (!basePolicy) continue;
        
        if (!grouped.has(basePolicy)) {
            grouped.set(basePolicy, []);
        }
        grouped.get(basePolicy).push(pol);
    }

    console.log('Grouped Size:', grouped.size);
    for (const [key, cluster] of grouped.entries()) {
        console.log(key, 'has', cluster.length);
        if (cluster.length > 1) {
            console.log('Duplicate Found!');
        }
    }
}
run();
