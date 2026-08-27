"""
Ingestion Worker — Main Entry Point

Polls ingestion_jobs for queued work, downloads PDFs from Supabase Storage,
extracts text with pdfplumber, and upserts into dec_pages.

Usage:
    cd worker
    python -m src.main
"""

import logging
import os
import sys
import time
import traceback

from dotenv import load_dotenv

# Load .env before any other imports that need env vars
load_dotenv()

from .supabase_client import get_supabase
from .jobs import (
    claim_next_job,
    complete_job,
    fail_job,
    force_release_job,
    get_submission,
    requeue_stale_jobs,
    update_submission_status,
    update_submission_step,
    MAX_ATTEMPTS,
)
from .extract.pdf_text import extract_text_from_bytes
from .extract.fair_plan import parse_declaration
from .extract.llm_extract import extract_with_llm
from .db.dec_pages import upsert_dec_page
from .db.lifecycle import process_lifecycle
from .db.flag_evaluator import evaluate_flags
from .db.flags import insert_activity_event
from .db.enrichment import enrich_property
from .db.api_enrichment import trigger_full_enrichment, trigger_flag_evaluation
from .documents.job_handler import process_document_job

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("worker.main")

POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "5"))


# ---------------------------------------------------------------------------
# PDF Download
# ---------------------------------------------------------------------------

def download_pdf(storage_path: str) -> bytes:
    """Download a PDF from Supabase Storage bucket 'cfp-raw-decpage'."""
    sb = get_supabase()
    logger.info("Downloading PDF from storage: %s", storage_path)

    response = sb.storage.from_("cfp-raw-decpage").download(storage_path)

    if not response:
        raise RuntimeError(f"Empty response downloading {storage_path}")

    logger.info("Downloaded %d bytes", len(response))
    return response


# ---------------------------------------------------------------------------
# Process One Job
# ---------------------------------------------------------------------------

def process_job(job: dict) -> None:
    """
    Full lifecycle for one ingestion job.

    Pipeline — two phases:

      PHASE 1: FAST PATH (~15s) — blocks until complete
        1. Download PDF
        2. Extract text (pdfplumber/OCR)          → step: extracting_text
        3. Parse declaration fields (LLM/regex)    → step: parsing_fields
        4. Create lifecycle records (client/policy) → step: creating_records
        5. Mark complete → submission: parsed      → step: complete

      PHASE 2: BACKGROUND ENRICHMENT — continues after job is done
        6. Full enrichment via API (ATTOM, vision) → activity: enrichment.completed
        7. Flag evaluation via API                 → activity: flags evaluated
        (Report is auto-generated inside enrichment)

    The agent sees the policy in ~15s. Enrichment data populates as it arrives.

    Uses try/except/finally to guarantee the job NEVER stays in 'processing':
      - On success: job -> done, submission -> parsed
      - On failure: job -> queued (with backoff) or failed, submission updated
      - Finally: safety-net force_release_job if still processing
    """
    import time as _time

    job_id = job["id"]
    submission_id = job["submission_id"]
    account_id = job["account_id"]
    attempts = job.get("attempts", 1)
    max_attempts = job.get("max_attempts", MAX_ATTEMPTS)
    current_step = "init"
    job_completed = False  # Sentinel: True only after complete_job succeeds
    job_start = _time.monotonic()

    logger.info(">>> job_id=%s submission_id=%s attempts=%d/%d step=start",
                job_id, submission_id, attempts, max_attempts)

    try:
        # 1. Fetch submission
        current_step = "fetch_submission"
        step_start = _time.monotonic()
        logger.info("job_id=%s step=%s", job_id, current_step)
        submission = get_submission(submission_id)
        if not submission:
            raise RuntimeError(f"Submission {submission_id} not found")
        logger.info("job_id=%s step=%s elapsed=%.2fs", job_id, current_step, _time.monotonic() - step_start)

        # 2. Set submission -> processing
        current_step = "set_submission_processing"
        logger.info("job_id=%s step=%s", job_id, current_step)
        update_submission_status(submission_id, "processing")

        # 3. Determine storage path
        #    NOTE: During rapid uploads, the worker may claim a job before the
        #    upload API has finished writing storage_path. Poll briefly to let
        #    the API catch up instead of failing immediately.
        current_step = "resolve_storage_path"
        storage_path = submission.get("storage_path") or submission.get("file_path")
        if not storage_path:
            logger.info("job_id=%s step=%s waiting for storage_path (API may still be uploading)", job_id, current_step)
            for wait_attempt in range(5):
                _time.sleep(1)
                submission = get_submission(submission_id)
                if submission:
                    storage_path = submission.get("storage_path") or submission.get("file_path")
                    if storage_path:
                        logger.info("job_id=%s step=%s storage_path appeared after %ds", job_id, current_step, wait_attempt + 1)
                        break
            if not storage_path:
                raise RuntimeError(f"No storage_path or file_path on submission {submission_id} after waiting 5s")

        # 4. Download PDF
        current_step = "download_pdf"
        step_start = _time.monotonic()
        logger.info("job_id=%s step=%s path=%s", job_id, current_step, storage_path)
        pdf_bytes = download_pdf(storage_path)
        logger.info("job_id=%s step=%s elapsed=%.2fs bytes=%d", job_id, current_step, _time.monotonic() - step_start, len(pdf_bytes))

        # 5. Extract text  ── UI step: extracting_text
        current_step = "extract_text"
        update_submission_step(submission_id, "extracting_text")
        logger.info("job_id=%s step=%s", job_id, current_step)
        extraction = extract_text_from_bytes(pdf_bytes)
        raw_text = extraction["raw_text"]

        extracted_json = {
            "method": extraction["method"],
            "raw_text_length": extraction["raw_text_length"],
            "pages": extraction["page_count"],
        }

        # 6. Parse declaration fields  ── UI step: parsing_fields
        current_step = "parse_declaration"
        update_submission_step(submission_id, "parsing_fields")
        logger.info("job_id=%s step=%s (trying LLM first)", job_id, current_step)

        parsed_result = extract_with_llm(raw_text)
        if parsed_result:
            extracted_json["parser"] = "llm_gpt4o_mini"
            logger.info("job_id=%s step=%s LLM extraction succeeded", job_id, current_step)
        else:
            logger.info("job_id=%s step=%s LLM unavailable, falling back to regex", job_id, current_step)
            parsed_result = parse_declaration(raw_text)
            if parsed_result["is_fair_plan"]:
                extracted_json["parser"] = "fairplan_regex_v1"

        fair_plan_data = parsed_result["extracted_data"]
        extracted_json["is_fair_plan"] = parsed_result["is_fair_plan"]

        # 7. Upsert dec_pages
        current_step = "upsert_dec_page"
        step_start = _time.monotonic()
        logger.info("job_id=%s step=%s", job_id, current_step)
        dec_page_id = upsert_dec_page(
            submission_id=submission_id,
            account_id=account_id,
            raw_text=raw_text,
            extracted_json=extracted_json,
            missing_fields=parsed_result["missing_fields"],
            parse_status=parsed_result["parse_status"],
            extracted_data=fair_plan_data,
        )
        logger.info("job_id=%s step=%s dec_page_id=%s elapsed=%.2fs", job_id, current_step, dec_page_id, _time.monotonic() - step_start)

        # 8. Process Policy Lifecycle  ── UI step: creating_records
        policy_id = None
        client_id = None
        policy_term_id = None

        if parsed_result["is_fair_plan"]:
            current_step = "process_lifecycle"
            update_submission_step(submission_id, "creating_records")
            logger.info("job_id=%s step=%s", job_id, current_step)
            res_ids = process_lifecycle(account_id, fair_plan_data, dec_page_id=dec_page_id)
            policy_id = res_ids.get("policy_id")
            client_id = res_ids.get("client_id")
            policy_term_id = res_ids.get("policy_term_id")

            # 8b. Link dec_pages row to policy/client/term
            if policy_id or client_id:
                current_step = "link_dec_page"
                logger.info("job_id=%s step=%s dec_page_id=%s policy_id=%s client_id=%s",
                            job_id, current_step, dec_page_id, policy_id, client_id)
                link_payload = {}
                if policy_id:
                    link_payload["policy_id"] = policy_id
                if client_id:
                    link_payload["client_id"] = client_id
                if policy_term_id:
                    link_payload["policy_term_id"] = policy_term_id
                
                sb = get_supabase()
                sb.table("dec_pages").update(link_payload).eq("id", dec_page_id).execute()
                logger.info("job_id=%s step=%s linked dec_pages to policy/client", job_id, current_step)

            # 9. Log document-processed activity event
            if policy_id:
                insert_activity_event(
                    event_type="dec.uploaded",
                    title="New Declaration Processed",
                    detail="A new declaration page was successfully uploaded and applied.",
                    policy_id=policy_id,
                    client_id=client_id,
                    dec_page_id=dec_page_id,
                    actor_user_id=account_id,
                )

        # ─────────────────────────────────────────────────────────────
        # 10. EARLY COMPLETION — Mark job done NOW so the agent can
        #     start working on the policy immediately (~15s).
        #     Enrichment, flags, and report run as a background
        #     continuation in the same thread after this point.
        # ─────────────────────────────────────────────────────────────
        current_step = "complete_job"
        update_submission_step(submission_id, "complete")
        logger.info("job_id=%s step=%s", job_id, current_step)
        complete_job(job_id)
        job_completed = True  # MUST be set AFTER complete_job succeeds

        # Mark submission parsed (updates updated_at → fast processing time)
        current_step = "update_submission_parsed"
        update_submission_status(submission_id, "parsed")

        parse_elapsed = _time.monotonic() - job_start
        logger.info("<<< job_id=%s submission_id=%s step=parsed status=done parse_elapsed=%.2fs",
                     job_id, submission_id, parse_elapsed)

        # ─────────────────────────────────────────────────────────────
        # 11. BACKGROUND ENRICHMENT — Runs in a separate daemon thread
        #     so the ThreadPoolExecutor slot is freed immediately.
        #     Failures are non-fatal; the policy is already saved.
        # ─────────────────────────────────────────────────────────────
        if policy_id:
            import threading
            def _background_enrich(pid: str, jid: str) -> None:
                try:
                    bg_start = _time.monotonic()
                    logger.info(">>> job_id=%s starting background enrichment for policy_id=%s",
                                 jid, pid)

                    enrichment_ok = False
                    try:
                        enrich_result = trigger_full_enrichment(pid)
                        enrichment_ok = enrich_result.get("success", False)
                        if not enrichment_ok:
                            logger.warning(
                                "job_id=%s bg_enrichment returned non-success: %s",
                                jid, enrich_result.get("error"),
                            )
                        else:
                            logger.info("job_id=%s bg_enrichment completed in %.2fs",
                                        jid, _time.monotonic() - bg_start)
                    except Exception as enrich_exc:
                        logger.warning(
                            "job_id=%s bg_enrichment failed (non-fatal): %s",
                            jid, enrich_exc,
                        )

                    flags_ok = False
                    try:
                        flag_result = trigger_flag_evaluation(pid)
                        flags_ok = flag_result.get("success", False)
                        if not flags_ok:
                            logger.warning(
                                "job_id=%s bg_flags returned non-success: %s",
                                jid, flag_result.get("error"),
                            )
                        else:
                            logger.info("job_id=%s bg_flags completed", jid)
                    except Exception as flag_exc:
                        logger.error(
                            "job_id=%s bg_flags failed (non-fatal): %s",
                            jid, flag_exc,
                        )

                    bg_elapsed = _time.monotonic() - bg_start
                    logger.info("<<< job_id=%s bg_enrichment_total elapsed=%.2fs enrichment=%s flags=%s",
                                 jid, bg_elapsed, enrichment_ok, flags_ok)
                except Exception as bg_outer_exc:
                    logger.warning(
                        "job_id=%s background enrichment block failed (non-fatal): %s",
                        jid, bg_outer_exc,
                    )

            t = threading.Thread(
                target=_background_enrich,
                args=(policy_id, job_id),
                name=f"bg-enrich-{policy_id[:8]}",
                daemon=True,
            )
            t.start()

    except Exception as exc:
        error_msg = str(exc)
        error_detail = {
            "traceback": traceback.format_exc(),
            "job_id": job_id,
            "submission_id": submission_id,
            "step": current_step,
            "elapsed": round(_time.monotonic() - job_start, 2),
        }
        logger.error("job_id=%s step=%s error=%s", job_id, current_step, error_msg)

        try:
            # Fail the job (requeue with backoff, or permanent fail)
            fail_job(job_id, error_msg, error_detail, attempts, max_attempts)

            # Only mark submission as 'failed' if permanently failed
            if attempts >= max_attempts:
                update_submission_status(
                    submission_id, "failed",
                    error_message=error_msg,
                    error_detail=error_detail,
                )

                # Log failed processing as activity event for admin visibility
                try:
                    insert_activity_event(
                        event_type="dec.processing_failed",
                        title="Declaration Processing Failed",
                        detail=f"Failed after {attempts} attempt(s) at step '{current_step}': {error_msg[:200]}",
                        dec_page_id=None,
                        actor_user_id=account_id,
                        meta={"step": current_step, "submission_id": submission_id},
                    )
                except Exception:
                    pass  # Non-fatal
            else:
                # Retryable — set submission back to 'queued' so UI shows retry pending
                update_submission_status(submission_id, "queued")

        except Exception as inner_exc:
            logger.critical(
                "job_id=%s step=error_handling FAILED to write error state: %s",
                job_id, inner_exc,
            )

    finally:
        # Safety-net: guarantee the job is NOT left in 'processing'
        # Skip if we already confirmed the job completed successfully
        if not job_completed:
            force_release_job(job_id, submission_id, attempts, max_attempts)


# ---------------------------------------------------------------------------
# Poll Loop (concurrent via ThreadPoolExecutor)
# ---------------------------------------------------------------------------

MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT_JOBS", "3"))


def run() -> None:
    """
    Main poll loop with concurrent job processing.

    Uses a ThreadPoolExecutor to process up to MAX_CONCURRENT jobs
    simultaneously. This prevents one slow job (e.g. 60s enrichment)
    from blocking the entire queue while other jobs sit idle.

    The loop:
      1. Counts how many slots are available (MAX_CONCURRENT - active_futures)
      2. Claims up to that many jobs from the queue
      3. Dispatches each to the thread pool
      4. Sleeps POLL_INTERVAL before checking again
    """
    from concurrent.futures import ThreadPoolExecutor, Future

    worker_name = os.environ.get("WORKER_NAME", "worker-unknown")
    logger.info("Starting ingestion worker: %s (max_concurrent=%d)", worker_name, MAX_CONCURRENT)
    logger.info("Poll interval: %ds", POLL_INTERVAL)

    # Verify connection on startup
    try:
        sb = get_supabase()
        sb.table("ingestion_jobs").select("id").limit(1).execute()
        logger.info("Supabase connection OK")
    except Exception as exc:
        logger.error("Failed to connect to Supabase: %s", exc)
        sys.exit(1)

    # Requeue any stale processing jobs on startup
    try:
        requeued = requeue_stale_jobs()
        logger.info("Requeued %d stale processing jobs on startup", requeued)
    except Exception as exc:
        logger.error("Failed to requeue stale jobs on startup: %s", exc)

    stale_check_counter = 0
    STALE_CHECK_INTERVAL = 60  # Check every ~60 poll cycles (~5 min at 5s interval)

    executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT, thread_name_prefix="job")
    active_futures: list[Future] = []

    try:
        while True:
            try:
                # Prune completed futures
                active_futures = [f for f in active_futures if not f.done()]

                # Check for exceptions in completed futures (logging only)
                for f in list(active_futures):
                    if f.done() and f.exception():
                        logger.error("Job thread raised: %s", f.exception())

                # Periodically requeue stale processing jobs
                stale_check_counter += 1
                if stale_check_counter >= STALE_CHECK_INTERVAL:
                    stale_check_counter = 0
                    try:
                        requeued = requeue_stale_jobs()
                        if requeued > 0:
                            logger.info("Periodic requeue: recovered %d stale job(s)", requeued)
                    except Exception as stale_exc:
                        logger.warning("Periodic stale job requeue failed: %s", stale_exc)

                available_slots = MAX_CONCURRENT - len(active_futures)

                if available_slots > 0:
                    # Claim up to `available_slots` jobs
                    jobs_claimed = 0
                    for _ in range(available_slots):
                        job = claim_next_job()
                        if job:
                            # Route: document_id → new pipeline, else → legacy dec page
                            handler = process_document_job if job.get("document_id") else process_job
                            future = executor.submit(handler, job)
                            active_futures.append(future)
                            jobs_claimed += 1
                        else:
                            break  # No more jobs in queue

                    if jobs_claimed > 0:
                        logger.info("Dispatched %d job(s) to thread pool (%d/%d slots active)",
                                    jobs_claimed, len(active_futures), MAX_CONCURRENT)
                        continue  # Don't sleep — check for more jobs immediately

                # Nothing to do — sleep before next poll
                time.sleep(POLL_INTERVAL)

            except KeyboardInterrupt:
                raise
            except Exception as exc:
                logger.error("Unexpected error in poll loop: %s", exc)
                time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        logger.info("Shutting down gracefully — waiting for %d active job(s)", len(active_futures))
        executor.shutdown(wait=True, cancel_futures=False)
        logger.info("All jobs completed. Goodbye.")


if __name__ == "__main__":
    run()
