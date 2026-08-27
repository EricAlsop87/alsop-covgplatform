/**
 * Quick script to update existing policy_terms with near-future
 * expiration dates for the dashboard renewal chart.
 * 
 * Run: node scripts/seed-renewal-dates.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Manually parse .env.local
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        env[key] = val;
    }
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseServiceKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    const { data: terms, error } = await supabase
        .from('policy_terms')
        .select('id, effective_date, expiration_date')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching policy_terms:', error);
        process.exit(1);
    }

    if (!terms || terms.length === 0) {
        console.log('No policy_terms found.');
        return;
    }

    console.log(`Found ${terms.length} policy terms. Spreading expiration dates over the next 12 weeks...`);

    const today = new Date();
    let successCount = 0;

    for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        const weekOffset = i % 12;
        const dayOffset = (i * 3) % 7;

        const expirationDate = new Date(today);
        expirationDate.setDate(today.getDate() + (weekOffset * 7) + dayOffset);

        const effectiveDate = new Date(expirationDate);
        effectiveDate.setFullYear(effectiveDate.getFullYear() - 1);

        const { error: updateError } = await supabase
            .from('policy_terms')
            .update({
                effective_date: effectiveDate.toISOString().split('T')[0],
                expiration_date: expirationDate.toISOString().split('T')[0],
                is_current: true,
            })
            .eq('id', term.id);

        if (updateError) {
            console.error(`  ✗ ${term.id}: ${updateError.message}`);
        } else {
            successCount++;
            if (i < 5) {
                console.log(`  ✓ Term ${i + 1}: expires ${expirationDate.toISOString().split('T')[0]}`);
            }
        }
    }

    console.log(`\n✓ Updated ${successCount}/${terms.length} policy terms.`);
    console.log('Refresh the dashboard to see the renewal chart!');
}

main();
