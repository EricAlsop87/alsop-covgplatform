import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sql = `
CREATE TABLE IF NOT EXISTS renewal_email_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
    template_id text NOT NULL,
    template_name text NOT NULL,
    marked_sent_by uuid,
    sent_at timestamptz DEFAULT now() NOT NULL,
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL
);
`;

async function run() {
    const { error: rpcErr } = await s.rpc('exec_sql', { sql });
    if (rpcErr) {
        console.log('rpc exec_sql not available:', rpcErr.message);
        // Check if table exists
        const { data, error } = await s.from('renewal_email_log').select('id').limit(1);
        if (error && error.code === 'PGRST205') {
            console.log('\n❌ Table does NOT exist. You must create it via Supabase Dashboard SQL Editor.');
            console.log('\nSQL to run:\n' + sql);
        } else {
            console.log('✓ Table already exists!', data);
        }
    } else {
        console.log('✓ Table created via exec_sql');
    }

    // Test insert/delete
    console.log('\n--- Testing insert ---');
    const { data: ins, error: insErr } = await s
        .from('renewal_email_log')
        .insert({ policy_id: '00000000-0000-0000-0000-000000000000', template_id: 'test', template_name: 'Test' })
        .select()
        .single();
    console.log('Insert:', ins ? 'OK' : 'FAIL', insErr?.message || '');

    if (ins?.id) {
        const { error: delErr } = await s.from('renewal_email_log').delete().eq('id', ins.id);
        console.log('Delete:', delErr ? 'FAIL ' + delErr.message : 'OK');
    }
}

run();
