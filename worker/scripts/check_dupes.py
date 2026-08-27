#!/usr/bin/env python3
"""Quick check for duplicate RCE documents matching MARI DELROCIO VARGAS"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

from supabase import create_client
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])

# Find all platform_documents with this owner name
res = sb.table('platform_documents').select('id, file_name, parse_status, match_status, policy_id, client_id, extracted_owner_name, file_hash').ilike('extracted_owner_name', '%VARGAS%').execute()
print(f"Found {len(res.data)} documents matching VARGAS:")
for d in res.data:
    print(f"  ID: {d['id'][:12]}... | status: {d['parse_status']}/{d['match_status']} | policy: {d['policy_id'][:12] if d['policy_id'] else 'None'} | name: {d['extracted_owner_name']} | hash: {d['file_hash'][:16] if d['file_hash'] else 'None'}")
