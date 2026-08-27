const fs = require('fs');
const envStr = fs.readFileSync('.env.local', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^"|"$/g, '');
    env[key] = val;
  }
});

console.log('URL:', env.NEXT_PUBLIC_SUPABASE_URL);

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('Querying for CFP 0102023158...');
  const { data: policy } = await supabase.from('policies').select('*').eq('policy_number', 'CFP 0102023158').single();
  
  if (!policy) {
    console.log('Policy not found');
  } else {
    console.log('Policy ID:', policy.id);
    console.log('Policy Object:', policy);
    const { data: decPages, error: err1 } = await supabase.from('dec_pages').select('*').eq('policy_id', policy.id);
    if (err1) console.error('Err1:', err1);
    console.log('Dec Pages linked to policy.id:', decPages);
  }
  
  if (policy.client_id) {
    const { data: client } = await supabase.from('clients').select('*').eq('id', policy.client_id).single();
    console.log('Client Object:', client);
    
    if (client) {
      const { data: subsByName } = await supabase.from('dec_page_submissions').select('*').ilike('file_name', `%${client.name || client.last_name || client.first_name}%`);
      console.log('Submissions with client name in filename:', subsByName);
    }
  }
}

run();
