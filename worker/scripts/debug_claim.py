"""Exact same query the worker uses in claim_next_job."""
import os
from dotenv import load_dotenv
from datetime import datetime, timezone
load_dotenv()
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
now_iso = datetime.now(timezone.utc).isoformat()

print(f"Current time (UTC): {now_iso}")
print()

# Exact query from claim_next_job
result = (
    sb.table("ingestion_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("run_after", now_iso)
    .order("run_after", desc=False)
    .limit(1)
    .execute()
)

if not result.data:
    print("No eligible jobs found.")
    print()
    # Let's also check all queued jobs regardless of run_after
    all_queued = sb.table("ingestion_jobs").select("id, status, run_after, attempts").eq("status", "queued").execute()
    if all_queued.data:
        print(f"But there ARE {len(all_queued.data)} queued jobs:")
        for j in all_queued.data:
            print(f"  id={j['id']}  run_after={j['run_after']}  attempts={j['attempts']}")
            is_eligible = j['run_after'] <= now_iso if j['run_after'] else True
            print(f"    run_after <= now? {is_eligible}  (run_after={j['run_after']}, now={now_iso})")
    else:
        print("No queued jobs at all.")
else:
    print(f"Found eligible job: {result.data[0]['id']}")
    print(f"  submission_id: {result.data[0]['submission_id']}")
    print(f"  run_after: {result.data[0]['run_after']}")
