"""
Job handler for platform document processing.

This module bridges the ingestion_jobs queue to the document processing framework.
It mirrors the safety patterns from the existing dec page process_job():
- try/except/finally for guaranteed state cleanup
- Atomic job status management
- Live step tracking for UI

Called from main.py's poll loop when a job has document_id set.
"""

import logging
import time
import traceback
from datetime import datetime, timezone

from ..supabase_client import get_supabase
from ..jobs import complete_job, fail_job, MAX_ATTEMPTS
from .rce_processor import RCEProcessor
from .am_rce_processor import AMRCEProcessor
from .dic_processor import DICProcessor
from .es_processor import ESProcessor

logger = logging.getLogger("worker.documents.job_handler")

# Registry of document type → processor class
PROCESSOR_REGISTRY = {
    "rce": RCEProcessor,
    "dic_dec_page": DICProcessor,
    "es_doc": ESProcessor,
    "other": ESProcessor,  # Default fallback processor for 'other' before classification
}


def classify_document_text(text: str) -> str:
    """
    Classify document text to determine document type when uploaded as 'other'.
    Returns one of: 'es_doc', 'dic_dec_page', 'rce'.
    """
    upper_text = text.upper()

    # Check E&S indicators
    es_markers = [
        "SURPLUS LINES", "STAMPING FEE", "E&S", "EXCESS AND SURPLUS",
        "EXCESS & SURPLUS", "LLOYD'S", "AEGIS", "INSPECTION FEE",
        "CA SURPLUS LINES TAX", "CA STAMPING FEE"
    ]
    for marker in es_markers:
        if marker in upper_text:
            logger.info("Auto-classified document as 'es_doc' via marker: %s", marker)
            return "es_doc"

    # Check DIC indicators
    dic_markers = ["DIFFERENCE IN CONDITIONS", "DIC", "BAMBOO", "PACIFIC SPECIALTY", "PSIC"]
    for marker in dic_markers:
        if marker in upper_text:
            logger.info("Auto-classified document as 'dic_dec_page' via marker: %s", marker)
            return "dic_dec_page"

    # Check RCE indicators (both 360Value and American Modern / Cotality)
    rce_markers = [
        "360VALUE", "REPLACEMENT COST ESTIMATION", "REPLACEMENT COST ESTIMATOR",
        "VALUATION DATE", "AMERICAN MODERN", "RCT EXPRESS", "COTALITY",
        "DETAILED REPORT ESTIMATE", "RECONSTRUCTION COST WITH DEBRIS REMOVAL",
    ]
    for marker in rce_markers:
        if marker in upper_text:
            logger.info("Auto-classified document as 'rce' via marker: %s", marker)
            return "rce"

    # Default to E&S document
    logger.info("No specific classification markers matched — defaulting 'other' upload to 'es_doc'")
    return "es_doc"


def process_document_job(job: dict) -> None:
    """
    Full lifecycle for one platform document processing job.

    Mirrors the safety patterns of the existing dec page process_job():
    - try/except/finally for guaranteed state cleanup
    - Detailed step logging
    - Exponential backoff on failure

    This function is the ONLY entry point for processing non-dec-page documents.
    """
    job_id = job["id"]
    document_id = job.get("document_id")
    account_id = job.get("account_id")
    attempts = job.get("attempts", 1)
    max_attempts = job.get("max_attempts", MAX_ATTEMPTS)
    job_start = time.monotonic()
    job_completed = False

    logger.info(
        ">>> DOCUMENT job_id=%s document_id=%s attempts=%d/%d",
        job_id, document_id, attempts, max_attempts,
    )

    if not document_id:
        logger.error("Job %s has no document_id — cannot process", job_id)
        fail_job(job_id, "Job missing document_id", None, attempts, max_attempts)
        return

    sb = get_supabase()

    try:
        # 1. Fetch the platform_documents row
        doc_result = (
            sb.table("platform_documents")
            .select("*")
            .eq("id", document_id)
            .limit(1)
            .execute()
        )
        if not doc_result.data:
            raise RuntimeError(f"Document {document_id} not found in platform_documents")

        doc = doc_result.data[0]
        doc_type = doc["doc_type"]
        storage_path = doc.get("storage_path")

        if not storage_path:
            raise RuntimeError(f"Document {document_id} has no storage_path")

        # 2. Resolve processor
        processor_cls = PROCESSOR_REGISTRY.get(doc_type)
        if not processor_cls:
            raise RuntimeError(
                f"No processor registered for doc_type='{doc_type}'. "
                f"Supported types: {list(PROCESSOR_REGISTRY.keys())}"
            )

        # 3. Download PDF from storage
        bucket = doc.get("bucket", "cfp-platform-documents")
        logger.info(
            "job=%s downloading %s from %s/%s",
            job_id, doc_type, bucket, storage_path,
        )
        pdf_bytes = sb.storage.from_(bucket).download(storage_path)
        if not pdf_bytes:
            raise RuntimeError(f"Empty response downloading {storage_path} from {bucket}")

        logger.info("job=%s downloaded %d bytes", job_id, len(pdf_bytes))

        # Handle auto-classification for 'other' uploads
        if doc_type == "other":
            from ..extract.pdf_text import extract_text_from_bytes
            text_result = extract_text_from_bytes(pdf_bytes)
            raw_text = text_result["raw_text"]
            classified_type = classify_document_text(raw_text)

            logger.info("job=%s auto-classified 'other' document -> '%s'", job_id, classified_type)

            # Update document record in database with classified doc_type
            try:
                sb.table("platform_documents").update({"doc_type": classified_type}).eq("id", document_id).execute()
                doc_type = classified_type
                processor_cls = PROCESSOR_REGISTRY.get(doc_type, ESProcessor)
            except Exception as e:
                logger.warning("job=%s failed to update doc_type to '%s': %s", job_id, classified_type, e)

        # ── RCE variant detection: American Modern vs 360Value ────────
        # When doc_type is 'rce', inspect the PDF text to determine which
        # RCE format it is and select the correct processor. This is
        # transparent to the uploading agent.
        if doc_type == "rce":
            from ..extract.pdf_text import extract_text_from_bytes
            text_result = extract_text_from_bytes(pdf_bytes)
            raw_text = text_result["raw_text"]
            upper_text = raw_text.upper()

            am_markers = [
                "AMERICAN MODERN", "RCT EXPRESS", "COTALITY",
                "DETAILED REPORT ESTIMATE",
            ]
            is_american_modern = any(m in upper_text for m in am_markers)

            if is_american_modern:
                processor_cls = AMRCEProcessor
                logger.info(
                    "job=%s detected American Modern RCE format — using AMRCEProcessor",
                    job_id,
                )
            else:
                processor_cls = RCEProcessor
                logger.info(
                    "job=%s detected 360Value RCE format — using RCEProcessor",
                    job_id,
                )

        # 4. Instantiate processor and run
        processor = processor_cls(document_id=document_id, account_id=account_id)
        result = processor.process(pdf_bytes)

        # 5. Check for processing errors
        if result.get("errors"):
            error_summary = "; ".join(result["errors"])
            raise RuntimeError(f"Processing errors: {error_summary}")

        # 6. Mark job done
        complete_job(job_id)
        job_completed = True

        elapsed = time.monotonic() - job_start
        match_status = result.get("match_result", {}).get("status", "unknown") if result.get("match_result") else "unknown"
        logger.info(
            "<<< DOCUMENT job_id=%s document_id=%s doc_type=%s match=%s elapsed=%.2fs",
            job_id, document_id, doc_type, match_status, elapsed,
        )

    except Exception as exc:
        error_msg = str(exc)
        error_detail = {
            "traceback": traceback.format_exc(),
            "job_id": job_id,
            "document_id": document_id,
            "elapsed": round(time.monotonic() - job_start, 2),
        }
        logger.error("job_id=%s document processing failed: %s", job_id, error_msg)

        try:
            fail_job(job_id, error_msg, error_detail, attempts, max_attempts)

            # Update document status
            now_iso = datetime.now(timezone.utc).isoformat()
            if attempts >= max_attempts:
                sb.table("platform_documents").update({
                    "parse_status": "failed",
                    "error_message": error_msg[:2000],
                    "processing_step": "failed",
                    "updated_at": now_iso,
                }).eq("id", document_id).execute()
            else:
                sb.table("platform_documents").update({
                    "error_message": f"Retry {attempts}/{max_attempts}: {error_msg[:500]}",
                    "updated_at": now_iso,
                }).eq("id", document_id).execute()

        except Exception as inner_exc:
            logger.critical(
                "job_id=%s error handling itself failed: %s",
                job_id, inner_exc,
            )

    finally:
        # Safety-net: if job is still 'processing', force release it
        if not job_completed:
            try:
                sb_check = get_supabase()
                check = (
                    sb_check.table("ingestion_jobs")
                    .select("id, status")
                    .eq("id", job_id)
                    .eq("status", "processing")
                    .limit(1)
                    .execute()
                )
                if check.data:
                    now_iso = datetime.now(timezone.utc).isoformat()
                    new_status = "failed" if attempts >= max_attempts else "queued"
                    sb_check.table("ingestion_jobs").update({
                        "status": new_status,
                        "locked_at": None,
                        "locked_by": None,
                        "last_error": "force-released by safety-net (document pipeline)",
                        "updated_at": now_iso,
                    }).eq("id", job_id).eq("status", "processing").execute()
                    logger.warning(
                        "Safety-net force-released document job %s -> %s",
                        job_id, new_status,
                    )
            except Exception as safety_exc:
                logger.critical(
                    "Safety-net release failed for job %s: %s",
                    job_id, safety_exc,
                )
