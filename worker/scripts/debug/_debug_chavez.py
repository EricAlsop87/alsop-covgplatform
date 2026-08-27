import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()
from src.supabase_client import get_supabase
sb = get_supabase()

# 1. Adrian Chavez doc
print("=== Adrian Chavez Document ===")
r = sb.table('platform_documents').select('id, file_name, extracted_owner_name, match_status, parse_status').eq('file_name', 'Adrian Chavez bamboo updated dec page.pdf').execute()
if r.data:
    for k, v in r.data[0].items():
        print(f"  {k}: {v}")
else:
    # Try partial match
    r = sb.table('platform_documents').select('id, file_name, extracted_owner_name, match_status, parse_status').ilike('file_name', '%chavez%').execute()
    for d in r.data:
        print(f"  {d['file_name']}: owner={d['extracted_owner_name']}, match={d['match_status']}")

# 2. Search for "Chavez" in clients
print("\n=== Clients matching 'Chavez' ===")
r2 = sb.table('clients').select('id, named_insured').ilike('named_insured', '%chavez%').execute()
for c in r2.data:
    print(f"  {c['id']}: {c['named_insured']}")

# 3. Search for "Adrian" in clients  
print("\n=== Clients matching 'Adrian' ===")
r3 = sb.table('clients').select('id, named_insured').ilike('named_insured', '%adrian%').execute()
for c in r3.data:
    print(f"  {c['id']}: {c['named_insured']}")

# 4. Policies with Chavez client
print("\n=== Policies with Chavez clients ===")
r4 = sb.table('policies').select('id, policy_number, property_address_raw, client_id, clients!inner(id, named_insured)').ilike('clients.named_insured', '%chavez%').execute()
for p in r4.data:
    print(f"  policy={p['policy_number']}, addr={p['property_address_raw']}, client={p.get('clients',{})}")
