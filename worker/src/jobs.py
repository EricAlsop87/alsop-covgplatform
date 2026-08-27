"""
Job queue operations for ingestion_jobs table.
Implements atomic claim, complete, fail, and safety-net release logic.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from .supabase_client import get_supabase

logger = logging.getLogger("worker.jobs")

WORKER_NAME = os.environ.get("WORKER_NAME", "worker-unknown")
MAX_ATTEMPTS = int(os.environ.get("MAX_ATTEMPTS", "5"))
STALE_MINUTES = int(os.environ.get("STALE_MINUTES", "10"))


def claim_next_job() -> dict | None:
    """
    Atomically claim the next eligible job from ingestion_jobs.

    Eligible: status='queued' AND run_after <= now().
    Claim: set status='processing', locked_at=now(), locked_by, increment attempts.

    Uses a two-step approach:
      1) Select the oldest eligible job.
      2) Attempt an UPDATE with a WHERE guard to prevent double-claim.

    Returns the claimed job dict, or None if no jobs available.
    """
    sb = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Step 1: Find the next eligible job
    #   Eligible: status='queued' AND (run_after <= now OR run_after IS NULL)
    #   NOTE: NULL run_after must be handled explicitly because
    #   PostgreSQL's NULL <= <timestamp> evaluates to NULL (falsy),
    #   making such jobs permanently invisible to the lte() filter.
    result = (
        sb.table("ingestion_jobs")
        .select("*")
        .eq("status", "queued")
        .or_(f"run_after.lte.{now_iso},run_after.is.null")
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )

    if not result.data:
        return None

    candidate = result.data[0]
    job_id = candidate["id"]
    current_attempts = candidate.get("attempts", 0)

    # Step 2: Atomic claim — only succeeds if still 'queued'
    claim_result = (
        sb.table("ingestion_jobs")
        .update(
            {
                "status": "processing",
                "locked_at": now_iso,
                "locked_by": WORKER_NAME,
                "attempts": current_attempts + 1,
                "updated_at": now_iso,
            }
        )
        .eq("id", job_id)
        .eq("status", "queued")  # Guard: another worker may have claimed it
        .execute()
    )

    if not claim_result.data:
        logger.debug("Job %s was claimed by another worker, skipping", job_id)
        return None

    claimed = claim_result.data[0]
    logger.info("Claimed job %s (submission=%s, document=%s, attempt=%d)",
                claimed["id"], claimed.get("submission_id"), claimed.get("document_id"), claimed["attempts"])
    return claimed


def complete_job(job_id: str) -> None:
    """Mark a job as done and clear error fields."""
    sb = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()
    sb.table("ingestion_jobs").update(
        {
            "status": "done",
            "last_error": None,
            "last_error_detail": None,
            "updated_at": now_iso,
        }
    ).eq("id", job_id).execute()
    logger.info("Job %s marked as done", job_id)


def fail_job(job_id: str, error_msg: str, error_detail: dict | None = None,
             attempts: int = 0, max_attempts: int | None = None) -> None:
    """
    Handle job failure with exponential backoff.
    - If attempts < max_attempts: requeue with exponential delay (capped at 60 min).
    - Otherwise: mark as failed permanently.
    """
    if max_attempts is None:
        max_attempts = MAX_ATTEMPTS

    sb = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Truncate error message to a safe DB length
    safe_error = (error_msg or "")[:2000]

    if attempts < max_attempts:
        # Fast retry for race-condition errors (API still writing storage_path)
        if "storage_path" in safe_error.lower() or "file_path" in safe_error.lower():
            delay_seconds = 10
            run_after = (datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)).isoformat()
            logger.info("Job %s fast-retry in %ds (storage_path race): %s", job_id, delay_seconds, safe_error)
        else:
            # Normal exponential backoff: 5, 10, 20, 40, 60(cap) minutes
            delay_minutes = min(5 * (2 ** (attempts - 1)), 60)
            run_after = (datetime.now(timezone.utc) + timedelta(minutes=delay_minutes)).isoformat()
            logger.warning("Job %s requeued (attempt %d/%d, retry in %d min): %s",
                            job_id, attempts, max_attempts, delay_minutes, safe_error)
        sb.table("ingestion_jobs").update(
            {
                "status": "queued",
                "locked_at": None,
                "locked_by": None,
                "last_error": safe_error,
                "last_error_detail": error_detail or {},
                "run_after": run_after,
                "updated_at": now_iso,
            }
        ).eq("id", job_id).eq("status", "processing").execute()
    else:
        sb.table("ingestion_jobs").update(
            {
                "status": "failed",
                "last_error": safe_error,
                "last_error_detail": error_detail or {},
                "updated_at": now_iso,
            }
        ).eq("id", job_id).eq("status", "processing").execute()
        logger.error("Job %s permanently failed after %d attempts: %s",
                      job_id, attempts, safe_error)


def force_release_job(job_id: str, submission_id: str, attempts: int, max_attempts: int | None = None) -> None:
    """
    Safety-net: if a job is STILL in 'processing' after process_job's
    try/except, force it back to 'queued' (or 'failed' if at max attempts).

    Called from the finally block — must not raise.
    """
    if max_attempts is None:
        max_attempts = MAX_ATTEMPTS

    try:
        sb = get_supabase()
        now_iso = datetime.now(timezone.utc).isoformat()

        # Only act if the job is still stuck in 'processing'
        check = (
            sb.table("ingestion_jobs")
            .select("id, status")
            .eq("id", job_id)
            .eq("status", "processing")
            .limit(1)
            .execute()
        )
        if not check.data:
            return  # Already moved to another status — nothing to do

        if attempts >= max_attempts:
            new_status = "failed"
            run_after = now_iso
        else:
            new_status = "queued"
            delay_minutes = min(5 * (2 ** (attempts - 1)), 60)
            run_after = (datetime.now(timezone.utc) + timedelta(minutes=delay_minutes)).isoformat()

        sb.table("ingestion_jobs").update(
            {
                "status": new_status,
                "locked_at": None,
                "locked_by": None,
                "last_error": "force-released by safety-net (was still processing)",
                "run_after": run_after,
                "updated_at": now_iso,
            }
        ).eq("id", job_id).eq("status", "processing").execute()
        
        # Keep UI in sync
        update_submission_status(
            submission_id,
            new_status,
            error_message="Worker safely released job due to unknown error."
        )

        logger.warning("Safety-net force-released job %s -> %s", job_id, new_status)

    except Exception as inner_exc:
        # Last resort — log and give up; at least we tried
        logger.critical("force_release_job itself failed for %s: %s", job_id, inner_exc)


def requeue_stale_jobs() -> int:
    """
    Requeue jobs stuck in 'processing' longer than STALE_MINUTES.
    Respects max_attempts: jobs at the limit are marked 'failed' instead.
    Returns count of requeued/failed jobs.
    """
    sb = get_supabase()
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(minutes=STALE_MINUTES)).isoformat()

    stale = (
        sb.table("ingestion_jobs")
        .select("id, submission_id, attempts, max_attempts, locked_at")
        .eq("status", "processing")
        .lt("locked_at", cutoff)
        .execute()
    )

    if not stale.data:
        return 0

    now_iso = now.isoformat()
    count = 0
    for row in stale.data:
        job_attempts = row.get("attempts", 0)
        job_max = row.get("max_attempts") or MAX_ATTEMPTS

        if job_attempts >= job_max:
            # Permanently failed — do NOT requeue
            sb.table("ingestion_jobs").update(
                {
                    "status": "failed",
                    "locked_at": None,
                    "locked_by": None,
                    "last_error": f"Permanently failed: was stuck in processing since {row.get('locked_at')} (attempts={job_attempts}/{job_max})",
                    "updated_at": now_iso,
                }
            ).eq("id", row["id"]).eq("status", "processing").execute()

            if row.get("submission_id"):
                update_submission_status(
                    row["submission_id"],
                    "failed",
                    error_message=f"Processing timed out after {job_attempts} attempts."
                )
            logger.error("Stale job %s permanently failed (attempts=%d/%d)", row["id"], job_attempts, job_max)
        else:
            # Retryable — requeue
            sb.table("ingestion_jobs").update(
                {
                    "status": "queued",
                    "locked_at": None,
                    "locked_by": None,
                    "run_after": now_iso,
                    "last_error": f"Requeued: was stuck in processing since {row.get('locked_at')}",
                    "updated_at": now_iso,
                }
            ).eq("id", row["id"]).eq("status", "processing").execute()

            if row.get("submission_id"):
                update_submission_status(
                    row["submission_id"],
                    "queued",
                    error_message="Worker restarted while processing. Retrying..."
                )
            logger.warning("Requeued stale job %s (submission=%s, attempts=%d, locked_at=%s)",
                            row["id"], row.get("submission_id"), job_attempts, row.get("locked_at"))

        count += 1

    return count


def update_submission_status(submission_id: str, status: str,
                             error_message: str | None = None,
                             error_detail: dict | None = None) -> None:
    """Update the dec_page_submissions status with timestamp."""
    sb = get_supabase()
    payload: dict = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if error_message is not None:
        payload["error_message"] = (error_message or "")[:2000]
    if error_detail is not None:
        payload["error_detail"] = error_detail
    sb.table("dec_page_submissions").update(payload).eq("id", submission_id).execute()
    logger.info("Submission %s status -> %s", submission_id, status)


def get_submission(submission_id: str) -> dict | None:
    """Fetch a dec_page_submissions row by ID."""
    sb = get_supabase()
    result = (
        sb.table("dec_page_submissions")
        .select("*")
        .eq("id", submission_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def update_submission_step(submission_id: str, step: str) -> None:
    """
    Update the processing_step column on a submission for live UI progress.

    Valid steps (in order):
      extracting_text → parsing_fields → creating_records →
      enriching_property → evaluating_flags → generating_report → complete

    The UI polls this field to show agents exactly what stage is running.
    """
    sb = get_supabase()
    sb.table("dec_page_submissions").update({
        "processing_step": step,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", submission_id).execute()
    logger.debug("Submission %s step -> %s", submission_id, step)

