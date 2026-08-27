"""Reset the stuck MARK ADAMS document and re-queue it."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()
from src.supabase_client import get_supabase
from datetime import datetime, timezone

sb = get_supabase()
doc_id = 'b118b5ef-fe8e-4dff-a7b3-8ce5c62c5e5d'
now = datetime.now(timezone.utc).isoformat()

# Kill stuck jobs
sb.table('ingestion_jobs').update({
    'status': 'failed',
    'locked_at': None,
    'locked_by': None,
    'last_error': 'Superseded by manual reset after OOM fix',
    'updated_at': now,
}).eq('document_id', doc_id).in_('status', ['queued', 'processing']).execute()

# Clear any partial data
sb.table('doc_data_dic').delete().eq('document_id', doc_id).execute()

# Reset document
sb.table('platform_documents').update({
    'parse_status': 'pending',
    'processing_step': 'queued',
    'match_status': 'pending',
    'match_confidence': None,
    'match_log': [],
    'error_message': None,
    'writeback_status': 'none',
    'writeback_log': [],
    'raw_text': None,
    'extracted_owner_name': None,
    'extracted_address': None,
    'extracted_address_norm': None,
    'updated_at': now,
}).eq('id', doc_id).execute()

# Queue fresh job
r = sb.table('platform_documents').select('account_id').eq('id', doc_id).single().execute()
sb.table('ingestion_jobs').insert({
    'document_id': doc_id,
    'account_id': r.data['account_id'],
    'status': 'queued',
    'attempts': 0,
    'max_attempts': 5,
}).execute()

print("Done! MARK ADAMS doc reset and re-queued.")
