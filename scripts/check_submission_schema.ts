import { getSupabaseAdmin } from '../src/lib/supabaseClient';

async function checkSubmissions() {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('dec_page_submissions')
        .select('id, file_name, status, file_hash, duplicate_of')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error:', error.message);
        return;
    }
    console.log('Latest Submissions:', JSON.stringify(data, null, 2));
}

checkSubmissions().catch(console.error);
