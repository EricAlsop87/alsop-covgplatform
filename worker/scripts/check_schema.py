"""Check actual column names in dec_pages and policy_terms tables."""
import os, sys
sys.stdout.reconfigure(encoding='utf-8')
from dotenv import load_dotenv
load_dotenv()
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

# Query dec_pages and get column names from the first row
for table in ["dec_pages", "policies", "policy_terms", "clients"]:
    result = sb.table(table).select("*").limit(1).execute()
    if result.data:
        cols = sorted(result.data[0].keys())
        print(f"\n{table} columns ({len(cols)}):")
        for c in cols:
            print(f"  - {c}")
    else:
        print(f"\n{table}: no rows (cannot introspect columns)")
