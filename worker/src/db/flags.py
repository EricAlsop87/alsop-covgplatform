"""
Core flag helpers — CRUD operations for policy_flags, flag_events.

Provides idempotent upsert / resolve / dismiss primitives used by the
flag evaluator and (eventually) the API layer.

Key concepts:
  - flag_key:  stable dedup key in format {scope}:{entity_id}:{code}:{path}
  - status:    'open' | 'resolved' | 'dismissed'
  - auto_resolve: system can resolve when condition clears
  - flag_events: immutable audit trail for every lifecycle change
"""

import logging
from datetime import datetime, timezone
from typing import Any

from ..supabase_client import get_supabase

logger = logging.getLogger("worker.db.flags")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    """UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


def build_flag_key(
    entity_scope: str,
    entity_id: str,
    code: str,
    subject_path: str = "",
) -> str:
    """
    Build a stable, unique flag key.

    Format: {entity_scope}:{entity_id}:{code}:{subject_path}
    Example: policy:abc-123:MISSING_DWELLING_LIMIT:
    """
    return f"{entity_scope}:{entity_id}:{code}:{subject_path}"


# ---------------------------------------------------------------------------
# flag_events — immutable audit log
# ---------------------------------------------------------------------------

def append_flag_event(
    flag_id: str,
    event_type: str,
    actor_account_id: str | None = None,
    note: str | None = None,
    details: dict | None = None,
) -> None:
    """
    Insert a row into flag_events.

    event_type: created | resolved | dismissed | reopened |
                assigned | severity_changed | note_added | updated
    """
    sb = get_supabase()
    payload: dict[str, Any] = {
        "flag_id": flag_id,
        "event_type": event_type,
        "created_at": _now_iso(),
    }
    if actor_account_id:
        payload["actor_account_id"] = actor_account_id
    if note:
        payload["note"] = note
    if details:
        payload["details"] = details

    try:
        sb.table("flag_events").insert(payload).execute()
    except Exception as e:
        logger.warning("Failed to insert flag_event for flag %s: %s", flag_id, e)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def get_open_flag_by_key(flag_key: str) -> dict | None:
    """
    Return the single open flag for a given flag_key, or None.
    """
    sb = get_supabase()
    res = (
        sb.table("policy_flags")
        .select("*")
        .eq("flag_key", flag_key)
        .eq("status", "open")
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0]
    return None


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------

def upsert_open_flag(
    *,
    flag_key: str,
    code: str,
    severity: str,
    title: str,
    message: str | None = None,
    details: dict | None = None,
    category: str | None = None,
    source: str = "system",
    policy_id: str | None = None,
    client_id: str | None = None,
    policy_term_id: str | None = None,
    dec_page_id: str | None = None,
    submission_id: str | None = None,
    action_path: str | None = None,
    rule_version: str | None = None,
) -> str | None:
    """
    Create-or-refresh an open flag.

    If an open flag with the same flag_key exists:
      - Bump times_seen, update last_seen_at, refresh message/details.
    If no open flag exists (including if previous was resolved/dismissed):
      - Insert a new open flag.

    Returns the flag id or None on failure.
    """
    sb = get_supabase()
    now = _now_iso()

    # Build the full payload for insert (new flag) or update (existing)
    payload: dict[str, Any] = {
        "flag_key": flag_key,
        "code": code,
        "severity": severity,
        "title": title,
        "status": "open",
        "source": source,
        "category": category,
        "last_seen_at": now,
        "updated_at": now,
    }
    if message is not None:
        payload["message"] = message
    if details is not None:
        payload["details"] = details
    if policy_id:
        payload["policy_id"] = policy_id
    if client_id:
        payload["client_id"] = client_id
    if policy_term_id:
        payload["policy_term_id"] = policy_term_id
    if dec_page_id:
        payload["dec_page_id"] = dec_page_id
        payload["source_dec_page_id"] = dec_page_id
    if submission_id:
        payload["submission_id"] = submission_id
    if action_path:
        payload["action_path"] = action_path
    if rule_version:
        payload["rule_version"] = rule_version

    # For new inserts, set first_seen_at and times_seen
    payload["first_seen_at"] = now
    payload["times_seen"] = 1
    payload["created_at"] = now

    try:
        res = (
            sb.table("policy_flags")
            .upsert(
                payload,
                on_conflict="flag_key",  # partial unique index WHERE status='open'
                count="exact",
            )
            .select("id, times_seen")
            .single()
            .execute()
        )
        flag_id = res.data["id"]
        was_update = (res.data.get("times_seen", 1) > 1)
        
        if was_update:
            # Increment times_seen for existing flags
            sb.table("policy_flags").update({
                "times_seen": res.data["times_seen"] + 1,
                "last_seen_at": now,
                "updated_at": now,
            }).eq("id", flag_id).execute()
            logger.debug("Refreshed open flag %s (key=%s)", flag_id, flag_key)
        else:
            logger.info("Created flag %s  code=%s  key=%s", flag_id, code, flag_key)
            append_flag_event(flag_id, "created", note=f"System created flag: {title}")
        
        return flag_id
    except Exception as e:
        logger.error("Failed to upsert flag code=%s key=%s: %s", code, flag_key, e)
        return None


# ---------------------------------------------------------------------------
# Resolve
# ---------------------------------------------------------------------------

def resolve_open_flag(
    flag_key: str,
    actor_account_id: str | None = None,
    note: str = "Auto-resolved: condition no longer applies",
) -> bool:
    """
    Resolve the open flag for a given key (if one exists).

    Returns True if a flag was resolved, False if none was open.
    """
    existing = get_open_flag_by_key(flag_key)
    if not existing:
        return False

    sb = get_supabase()
    now = _now_iso()

    try:
        update = {
            "status": "resolved",
            "resolved_at": now,
            "updated_at": now,
        }
        if actor_account_id:
            update["resolved_by_account_id"] = actor_account_id

        sb.table("policy_flags").update(update).eq("id", existing["id"]).execute()
        append_flag_event(existing["id"], "resolved", actor_account_id=actor_account_id, note=note)
        logger.info("Resolved flag %s (key=%s)", existing["id"], flag_key)
        return True
    except Exception as e:
        logger.error("Failed to resolve flag %s: %s", existing["id"], e)
        return False


# ---------------------------------------------------------------------------
# Dismiss
# ---------------------------------------------------------------------------

def dismiss_flag(
    flag_id: str,
    dismissed_by_account_id: str | None = None,
    reason: str = "",
) -> bool:
    """
    Dismiss a flag by id. Sets status='dismissed'.

    If the same condition reappears later, a NEW flag instance will be created
    because the partial unique index only covers status='open'.
    """
    sb = get_supabase()
    now = _now_iso()

    try:
        update: dict[str, Any] = {
            "status": "dismissed",
            "dismissed_at": now,
            "updated_at": now,
        }
        if dismissed_by_account_id:
            update["dismissed_by_account_id"] = dismissed_by_account_id
        if reason:
            update["dismiss_reason"] = reason

        sb.table("policy_flags").update(update).eq("id", flag_id).execute()
        append_flag_event(flag_id, "dismissed", actor_account_id=dismissed_by_account_id, note=reason or "Dismissed")
        logger.info("Dismissed flag %s", flag_id)
        return True
    except Exception as e:
        logger.error("Failed to dismiss flag %s: %s", flag_id, e)
        return False


# ---------------------------------------------------------------------------
# Activity event helper (for NEW_DOCUMENT migration)
# ---------------------------------------------------------------------------

def insert_activity_event(
    *,
    event_type: str,
    title: str,
    detail: str | None = None,
    policy_id: str | None = None,
    client_id: str | None = None,
    dec_page_id: str | None = None,
    actor_user_id: str | None = None,
    meta: dict | None = None,
) -> None:
    """
    Insert into activity_events. Use this for informational events
    like 'document processed' that should NOT be flags.
    """
    sb = get_supabase()
    payload: dict[str, Any] = {
        "event_type": event_type,
        "title": title,
        "created_at": _now_iso(),
    }
    if detail:
        payload["detail"] = detail
    if policy_id:
        payload["policy_id"] = policy_id
    if client_id:
        payload["client_id"] = client_id
    if dec_page_id:
        payload["dec_page_id"] = dec_page_id
    if actor_user_id:
        payload["actor_user_id"] = actor_user_id
    if meta:
        payload["meta"] = meta

    try:
        sb.table("activity_events").insert(payload).execute()
        logger.debug("Inserted activity_event: %s", event_type)
    except Exception as e:
        logger.warning("Failed to insert activity_event %s: %s", event_type, e)
