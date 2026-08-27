"""
Post-Parse API Enrichment — calls Next.js API endpoints from the worker.

After the worker finishes parsing a dec page and creating lifecycle entities,
this module triggers the FULL enrichment pipeline (ATTOM, satellite, street view,
AI vision, fire risk, report generation) and flag re-evaluation by calling the
Next.js API routes hosted on Vercel.

This ensures every dec-page upload gets the same comprehensive analysis that
the manual "Full Analysis" button provides — no gaps, no partial data.
"""

import logging
import os
import time as _time

import httpx

logger = logging.getLogger("worker.db.api_enrichment")

# The production URL of the Next.js app (Vercel)
APP_BASE_URL = os.environ.get("APP_BASE_URL", "https://coveragechecknow.com").rstrip("/")

# Timeout for enrichment calls (ATTOM + vision AI can be slow)
ENRICHMENT_TIMEOUT = 120  # seconds
FLAGS_TIMEOUT = 30
REPORT_TIMEOUT = 60

# Internal API key for service-to-service auth (optional safety layer)
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "")


def _headers() -> dict:
    """Build common request headers."""
    h = {"Content-Type": "application/json"}
    if INTERNAL_API_KEY:
        h["X-Internal-Key"] = INTERNAL_API_KEY
    return h


def _call_with_retry(
    url: str,
    payload: dict,
    timeout: int,
    max_retries: int = 3,
    backoff_base: float = 2.0,
) -> httpx.Response:
    """POST with exponential backoff. Retries on 5xx, timeout, and connection errors."""
    last_exc: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            with httpx.Client(timeout=timeout, follow_redirects=True) as client:
                resp = client.post(url, json=payload, headers=_headers())
            if resp.status_code < 500:
                return resp  # Success or 4xx client error — don't retry
            logger.warning(
                "Attempt %d/%d got %d for %s",
                attempt, max_retries, resp.status_code, url,
            )
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            logger.warning(
                "Attempt %d/%d failed for %s: %s",
                attempt, max_retries, url, e,
            )
            last_exc = e
        if attempt < max_retries:
            sleep_time = backoff_base ** attempt
            _time.sleep(sleep_time)
    if last_exc:
        raise last_exc
    return resp  # Return the last 5xx response


def trigger_full_enrichment(policy_id: str, step_callback=None) -> dict:
    """
    Call POST /api/enrichment/run to run the full enrichment pipeline.

    This runs: satellite image, ATTOM assessor data, geocoding,
    fire risk, street view, AI vision, AI street vision, and
    auto-generates an AI report.

    Returns the results dict from the API, or an error dict on failure.
    """
    url = f"{APP_BASE_URL}/api/enrichment/run"
    logger.info("Triggering full enrichment: policy_id=%s url=%s", policy_id, url)

    try:
        response = _call_with_retry(url, {"policy_id": policy_id}, ENRICHMENT_TIMEOUT)

        if response.status_code != 200:
            error_text = response.text[:500]
            logger.error(
                "Full enrichment API returned %d for policy %s: %s",
                response.status_code, policy_id, error_text,
            )
            return {"success": False, "error": f"HTTP {response.status_code}: {error_text}"}

        data = response.json()
        results = data.get("results", {})
        logger.info(
            "Full enrichment complete for policy %s: satellite=%s, attom=%s, "
            "street_view=%s, fire_risk=%s, vision=%s, report=%s",
            policy_id,
            results.get("satellite_image"),
            results.get("assessor_data"),
            results.get("street_view_image"),
            results.get("fire_risk"),
            results.get("vision_analysis"),
            results.get("report_generated"),
        )
        return {"success": True, "results": results}

    except httpx.TimeoutException:
        logger.error("Full enrichment timed out for policy %s (timeout=%ds)", policy_id, ENRICHMENT_TIMEOUT)
        return {"success": False, "error": f"Timeout after {ENRICHMENT_TIMEOUT}s"}
    except Exception as e:
        logger.error("Full enrichment failed for policy %s: %s", policy_id, e)
        return {"success": False, "error": str(e)}


def trigger_flag_evaluation(policy_id: str) -> dict:
    """
    Call POST /api/flags/evaluate to re-evaluate flags with enriched data.

    This should run AFTER enrichment so flags like SEVERE_UNDERINSURANCE_ESTIMATE
    can use ATTOM data (sqft, year_built, etc.) for accurate assessment.
    """
    url = f"{APP_BASE_URL}/api/flags/evaluate"
    logger.info("Triggering flag evaluation: policy_id=%s url=%s", policy_id, url)

    try:
        response = _call_with_retry(url, {"policy_id": policy_id}, FLAGS_TIMEOUT)

        if response.status_code != 200:
            error_text = response.text[:500]
            logger.error(
                "Flag evaluation API returned %d for policy %s: %s",
                response.status_code, policy_id, error_text,
            )
            return {"success": False, "error": f"HTTP {response.status_code}: {error_text}"}

        data = response.json()
        logger.info("Flag evaluation complete for policy %s", policy_id)
        return {"success": True, "data": data}

    except httpx.TimeoutException:
        logger.error("Flag evaluation timed out for policy %s", policy_id)
        return {"success": False, "error": f"Timeout after {FLAGS_TIMEOUT}s"}
    except Exception as e:
        logger.error("Flag evaluation failed for policy %s: %s", policy_id, e)
        return {"success": False, "error": str(e)}
