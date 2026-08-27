"""Quick check: list all ingestion_jobs and their current state."""
import os
from dotenv import load_dotenv
load_dotenv()
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

result = sb.table("ingestion_jobs").select("id, submission_id, status, attempts, run_after, locked_at, locked_by, last_error").order("created_at", desc=True).limit(10).execute()

if not result.data:
    print("No ingestion_jobs found.")
else:
    for job in result.data:
        print(f"Job {job['id']}")
        print(f"  submission_id: {job['submission_id']}")
        print(f"  status:        {job['status']}")
        print(f"  attempts:      {job['attempts']}")
        print(f"  run_after:     {job['run_after']}")
        print(f"  locked_at:     {job['locked_at']}")
        print(f"  locked_by:     {job['locked_by']}")
        print(f"  last_error:    {job.get('last_error', 'None')[:100] if job.get('last_error') else 'None'}")
        print()
