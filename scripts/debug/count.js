const fs = require('fs');
const envStr = fs.readFileSync('.env.local', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^"|"$/g, '');
});
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { count } = await supabaseAdmin.from('policies').select('*', { count: 'exact', head: true });
    console.log('Total Policies:', count);
    
    const { count: clientCount } = await supabaseAdmin.from('clients').select('*', { count: 'exact', head: true });
    console.log('Total Clients:', clientCount);
}
run();
