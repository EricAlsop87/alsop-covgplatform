import { readFileSync } from 'fs';

const envText = readFileSync('.env.local', 'utf8');
const envVars = {};
envText.split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) envVars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
const DB_PASSWORD = envVars.SUPABASE_DB_PASSWORD || envVars.DB_PASSWORD;
const projId = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');

// Try connecting via the pooler/direct pg connection
// Supabase provides a direct connection at db.<project-ref>.supabase.co
const connStr = `postgresql://postgres.${projId}:${DB_PASSWORD}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

console.log('Has DB_PASSWORD:', !!DB_PASSWORD);
console.log('Project ID:', projId);

if (!DB_PASSWORD) {
    console.log('\nNo DB_PASSWORD found in .env.local');
    console.log('Please run this SQL in the Supabase Dashboard SQL Editor:');
    console.log(`https://supabase.com/dashboard/project/${projId}/sql/new`);
    console.log(`
ALTER TABLE policies ADD COLUMN IF NOT EXISTS renewal_email_status TEXT DEFAULT 'not_sent';
ALTER TABLE policies ADD COLUMN IF NOT EXISTS renewal_email_last_sent_at TIMESTAMPTZ;
    `);
}
