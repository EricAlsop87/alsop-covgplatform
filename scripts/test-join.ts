import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
    const { data, error } = await supabase
        .from('policy_flags')
        .select(`
            *,
            policies!policy_flags_policy_id_fkey(policy_number)
        `)
        .limit(3);

    if (error) {
        console.error('Error:', error);
    } else {
        console.dir(data, { depth: null });
    }
}

testQuery();
