import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()
from src.supabase_client import get_supabase
sb = get_supabase()

# The Wendy Paolini doc
doc_id = '1305a1d8-1f9a-4798-a946-377e459c6642'

r = sb.table('platform_documents').select('*').eq('id', doc_id).single().execute()
d = r.data
print("=== Full Document Record ===")
for k, v in d.items():
    if v is not None and v != '' and v != [] and v != '[]':
        print(f"  {k}: {v}")
