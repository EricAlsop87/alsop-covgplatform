import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = {};
for (const line of readFileSync('.env.local','utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) env[t.slice(0,i).trim()] = t.slice(i+1).trim();
}
const sb = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

async function main() {
    const { error } = await sb.rpc('exec_sql', {
        query: `ALTER TABLE dec_pages ADD COLUMN IF NOT EXISTS perils_insured_against TEXT;`
    });
    if (error) {
        console.log('Error executing SQL RPC:', error.message);
        console.log('You may need to add the column manually in the Supabase Dashboard SQL Editor:');
        console.log('ALTER TABLE dec_pages ADD COLUMN IF NOT EXISTS perils_insured_against TEXT;');
    } else {
        console.log('Column added successfully via RPC.');
    }
}
main();
