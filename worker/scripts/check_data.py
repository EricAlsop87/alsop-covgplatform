"""Check for bad data created during failed pipeline runs."""
import os
from dotenv import load_dotenv
load_dotenv()
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

print("=== CLIENTS ===")
clients = sb.table("clients").select("id, named_insured, created_by_account_id, created_at").execute()
for c in (clients.data or []):
    print(f"  {c['id'][:12]}..  {c['named_insured']:<50}  {c.get('created_at', 'N/A')}")

print("\n=== POLICIES ===")
policies = sb.table("policies").select("id, client_id, policy_number, carrier_name, property_address_raw, created_at").execute()
for p in (policies.data or []):
    print(f"  {p['id'][:12]}..  policy={p.get('policy_number','?'):<20} carrier={p.get('carrier_name','?'):<20}  addr={p.get('property_address_raw','?')}")

print("\n=== POLICY_TERMS ===")
terms = sb.table("policy_terms").select("id, policy_id, effective_date, expiration_date, is_current, created_at").execute()
for t in (terms.data or []):
    print(f"  {t['id'][:12]}..  policy={t['policy_id'][:12]}..  eff={t.get('effective_date','?')}  exp={t.get('expiration_date','?')}  current={t.get('is_current')}")

print("\n=== DEC_PAGES (insured_name) ===")
dec_pages = sb.table("dec_pages").select("id, insured_name, policy_number, parse_status, client_id, policy_id").execute()
for d in (dec_pages.data or []):
    print(f"  {d['id'][:12]}..  name={d.get('insured_name','?'):<50}  policy={d.get('policy_number','?')}  status={d.get('parse_status','?')}  client_id={d.get('client_id','None')}")
