/**
 * Migration: Add renewal email tracking
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load .env.local manually
const envText = readFileSync('.env.local', 'utf8');
const envVars = {};
envText.split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) envVars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function migrate() {
    console.log('=== Renewal Email Tracking Migration ===\n');

    // Check if table exists
    const { error: checkErr } = await supabase.from('renewal_email_log').select('id').limit(1);
    if (checkErr && checkErr.message.includes('does not exist')) {
        console.log('Table does not exist. Please run the following SQL in the Supabase SQL Editor:\n');
        console.log(`
CREATE TABLE IF NOT EXISTS renewal_email_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    template_id TEXT NOT NULL,
    template_name TEXT NOT NULL,
    marked_sent_by TEXT,
    sent_at TIMESTAMPTZ DEFAULT now(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_renewal_email_log_policy 
    ON renewal_email_log(policy_id);
CREATE INDEX IF NOT EXISTS idx_renewal_email_log_template 
    ON renewal_email_log(policy_id, template_id);

ALTER TABLE renewal_email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON renewal_email_log FOR ALL USING (true);

ALTER TABLE policies ADD COLUMN IF NOT EXISTS renewal_email_status TEXT DEFAULT 'not_sent';
ALTER TABLE policies ADD COLUMN IF NOT EXISTS renewal_email_last_sent_at TIMESTAMPTZ;
        `);
        process.exit(1);
    } else {
        console.log('✓ renewal_email_log table exists');
    }

    // Check policies columns
    const { error: polErr } = await supabase.from('policies').select('renewal_email_status').limit(1);
    if (polErr) {
        console.log('✗ policies.renewal_email_status column missing');
    } else {
        console.log('✓ policies.renewal_email_status column exists');
    }

    const { error: polErr2 } = await supabase.from('policies').select('renewal_email_last_sent_at').limit(1);
    if (polErr2) {
        console.log('✗ policies.renewal_email_last_sent_at column missing');
    } else {
        console.log('✓ policies.renewal_email_last_sent_at column exists');
    }

    console.log('\n=== Done ===');
}

migrate();
