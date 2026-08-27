"""Reset the 2 stuck jobs: set run_after=now, attempts=0."""
import os
from dotenv import load_dotenv
from datetime import datetime, timezone
load_dotenv()
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
now = datetime.now(timezone.utc).isoformat()

# Reset ALL queued jobs with future run_after
result = sb.table("ingestion_jobs").select("id, submission_id, run_after").eq("status", "queued").execute()
if not result.data:
    print("No queued jobs.")
else:
    for job in result.data:
        sb.table("ingestion_jobs").update({
            "run_after": now,
            "attempts": 0,
            "locked_at": None,
            "locked_by": None,
            "last_error": None,
            "last_error_detail": None,
        }).eq("id", job["id"]).execute()
        print(f"Reset job {job['id']} (was run_after={job['run_after']})")
print("Done")
