from src.supabase_client import get_supabase
sb = get_supabase()

ids = ['c891492a-2ca9-4264-8ede-6a61d0afcd3e', '65ac4a18-25a8-41c0-90de-2a43c0a3369c', 'c61739c6-2cbd-411c-ab41-ada9632aff84']

for id in ids:
    r = sb.table('dec_page_submissions').select('id,file_name,created_at,file_hash').eq('id', id).execute()
    if r.data:
        print(r.data[0])
