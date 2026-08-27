"""
Quick script to reset all failed ingestion_jobs back to 'queued'
so the worker can re-process them after the column-name fix.

Usage: cd worker && python -m scripts.requeue_failed
"""
import os
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

from supabase import create_client

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
sb = create_client(url, key)

now_iso = datetime.now(timezone.utc).isoformat()

# Find all failed jobs
failed = sb.table("ingestion_jobs").select("id, submission_id, attempts").eq("status", "failed").execute()

if not failed.data:
    print("No failed jobs found.")
else:
    print(f"Found {len(failed.data)} failed jobs. Resetting to queued...")
    for job in failed.data:
        sb.table("ingestion_jobs").update({
            "status": "queued",
            "attempts": 0,
            "locked_at": None,
            "locked_by": None,
            "last_error": None,
            "last_error_detail": None,
            "run_after": now_iso,
            "updated_at": now_iso,
        }).eq("id", job["id"]).execute()

        # Also reset the submission status
        sb.table("dec_page_submissions").update({
            "status": "uploaded",
            "error_message": None,
            "error_detail": None,
            "updated_at": now_iso,
        }).eq("id", job["submission_id"]).execute()

        print(f"  Reset job {job['id']} (submission={job['submission_id']}, was attempt {job['attempts']})")

    print("Done! All failed jobs requeued.")
