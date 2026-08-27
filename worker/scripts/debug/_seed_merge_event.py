import sys, os
sys.path.insert(0, '.')
os.environ.setdefault('SUPABASE_URL', 'https://qbihizqbtimwvhxkneeb.supabase.co')
try:
    os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', open('../.env.local').read().split('SUPABASE_SERVICE_ROLE_KEY=')[1].split('\n')[0].strip())
except Exception:
    pass

from src.supabase_client import get_supabase
sb = get_supabase()

# Find Luis Cerda's surviving client record
res = sb.table('clients').select('id, named_insured').ilike('named_insured', '%cerda%').execute()
print("Luis Cerda clients:", res.data)

survivor = res.data[0] if res.data else None
if survivor:
    # Seed the merge activity event for the dashboard
    insert_res = sb.table('activity_events').insert({
        'event_type': 'merge.client',
        'title': f'Client records consolidated: {survivor["named_insured"]}',
        'detail': f'Merged duplicate "Luis Cerda" into "{survivor["named_insured"]}". All policies and documents migrated.',
        'client_id': survivor['id'],
        'meta': {
            'survivor_id': survivor['id'],
            'survivor_name': survivor['named_insured'],
            'duplicate_name': 'Luis Cerda',
            'keep_documents': True,
        },
    }).execute()
    print("Activity event seeded:", insert_res.data)
else:
    print("No Luis Cerda client found — they may have already been fully merged.")
