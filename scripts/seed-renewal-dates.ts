/**
 * Quick script to update existing policy_terms with near-future
 * expiration dates so the dashboard renewal chart shows data.
 * 
 * Run: npx ts-node --skip-project scripts/seed-renewal-dates.ts
 * Or:  npx tsx scripts/seed-renewal-dates.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    // 1. Fetch all policy_terms
    const { data: terms, error } = await supabase
        .from('policy_terms')
        .select('id, effective_date, expiration_date')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching policy_terms:', error);
        process.exit(1);
    }

    if (!terms || terms.length === 0) {
        console.log('No policy_terms found. Nothing to update.');
        return;
    }

    console.log(`Found ${terms.length} policy terms. Spreading expiration dates over the next 12 weeks...`);

    const today = new Date();
    const updates: { id: string; effective_date: string; expiration_date: string }[] = [];

    for (let i = 0; i < terms.length; i++) {
        const term = terms[i];

        // Spread across weeks 0-11 (next 12 weeks from today)
        const weekOffset = i % 12;
        // Add some variety within each week (different days)
        const dayOffset = (i * 3) % 7;

        const expirationDate = new Date(today);
        expirationDate.setDate(today.getDate() + (weekOffset * 7) + dayOffset);

        // Effective date = 1 year before expiration
        const effectiveDate = new Date(expirationDate);
        effectiveDate.setFullYear(effectiveDate.getFullYear() - 1);

        updates.push({
            id: term.id,
            effective_date: effectiveDate.toISOString().split('T')[0],
            expiration_date: expirationDate.toISOString().split('T')[0],
        });
    }

    // 2. Update each term
    let successCount = 0;
    for (const update of updates) {
        const { error: updateError } = await supabase
            .from('policy_terms')
            .update({
                effective_date: update.effective_date,
                expiration_date: update.expiration_date,
                is_current: true,
            })
            .eq('id', update.id);

        if (updateError) {
            console.error(`  ✗ Failed to update term ${update.id}:`, updateError.message);
        } else {
            successCount++;
        }
    }

    console.log(`\n✓ Updated ${successCount}/${terms.length} policy terms.`);
    console.log('\nSample dates:');
    updates.slice(0, 5).forEach((u, i) => {
        console.log(`  Term ${i + 1}: effective=${u.effective_date}, expires=${u.expiration_date}`);
    });
    console.log('\nRefresh the dashboard to see the renewal chart populated!');
}

main();
