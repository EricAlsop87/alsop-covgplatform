import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()
from src.supabase_client import get_supabase
sb = get_supabase()

# MARK ADAMS PSIC
doc_id = 'b118b5ef-fe8e-4dff-a7b3-8ce5c62c5e5d'

print("=== MARK ADAMS Doc ===")
r = sb.table('platform_documents').select('id, doc_type, file_name, parse_status, processing_step, match_status, error_message, created_at, updated_at').eq('id', doc_id).single().execute()
for k, v in r.data.items():
    if v is not None:
        print(f"  {k}: {v}")

print("\n=== Jobs for this doc ===")
r2 = sb.table('ingestion_jobs').select('id, status, document_id, attempts, max_attempts, last_error, created_at, updated_at').eq('document_id', doc_id).order('created_at', desc=True).limit(5).execute()
for j in r2.data:
    print(f"\n  Job {j['id']}:")
    for k, v in j.items():
        if v is not None and k != 'id':
            print(f"    {k}: {v}")

print("\n=== All document statuses ===")
r3 = sb.table('platform_documents').select('id, file_name, parse_status, processing_step, match_status, error_message').order('created_at', desc=True).limit(10).execute()
for d in r3.data:
    print(f"  {d['file_name']}: parse={d['parse_status']}, step={d['processing_step']}, match={d['match_status']}, err={d.get('error_message', '')[:80] if d.get('error_message') else '-'}")
