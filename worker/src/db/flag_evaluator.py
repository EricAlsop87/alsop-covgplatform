"""
Flag Evaluator — rule-based flag generation for the CFP Platform.

Called after each document ingestion pipeline run.  For every rule in
FLAG_RULES, checks a condition against the extracted/lifecycle data
and either upserts an open flag or auto-resolves if the condition cleared.

Adding a new rule:
  1. Add entry to FLAG_RULES  (code, severity, title, category, scope, check_fn)
  2. Add matching row to flag_definitions seed SQL (if not already there)
  3. Done — evaluator will pick it up automatically.

See docs/flags-system.md for full architecture details.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Callable

from .flags import (
    build_flag_key,
    upsert_open_flag,
    resolve_open_flag,
    insert_activity_event,
)
from ..supabase_client import get_supabase

logger = logging.getLogger("worker.db.flag_evaluator")

RULE_VERSION = "1.0.0"


# ---------------------------------------------------------------------------
# Context object passed to every check function
# ---------------------------------------------------------------------------

class EvalContext:
    """
    Holds all data relevant to a single evaluation pass.
    Built once, shared across all rule checks.
    """

    def __init__(
        self,
        *,
        policy_id: str | None = None,
        client_id: str | None = None,
        policy_term_id: str | None = None,
        dec_page_id: str | None = None,
        extracted_data: dict | None = None,
        missing_fields: list[str] | None = None,
        policy_term: dict | None = None,
        client: dict | None = None,
    ):
        self.policy_id = policy_id
        self.client_id = client_id
        self.policy_term_id = policy_term_id
        self.dec_page_id = dec_page_id
        self.data = extracted_data or {}
        self.missing_fields = missing_fields or []
        self.term = policy_term or {}
        self.client = client or {}

    def get(self, key: str, default: Any = None) -> Any:
        """Look up key in extracted_data, then term, then client."""
        return self.data.get(key) or self.term.get(key) or self.client.get(key) or default


# ---------------------------------------------------------------------------
# Rule definition type
# ---------------------------------------------------------------------------

class FlagRule:
    """
    Declares one flag rule.

    Attributes:
        code:         Flag code (SCREAMING_SNAKE)
        severity:     critical | high | warning | info
        title:        Human label
        category:     data_quality | renewal | coverage_gap | dic | ...
        entity_scope: policy | client | policy_term
        auto_resolve: Whether the system auto-resolves when condition clears
        check_fn:     (ctx: EvalContext) -> str | None
                        Return a message string if the flag SHOULD fire.
                        Return None if the condition is clear (no flag).
    """

    def __init__(
        self,
        code: str,
        severity: str,
        title: str,
        category: str,
        entity_scope: str = "policy",
        auto_resolve: bool = True,
        check_fn: Callable[["EvalContext"], str | None] = lambda _: None,
    ):
        self.code = code
        self.severity = severity
        self.title = title
        self.category = category
        self.entity_scope = entity_scope
        self.auto_resolve = auto_resolve
        self.check_fn = check_fn


# ---------------------------------------------------------------------------
# Suppression helpers — used to quiet RC flags for mobile homes / SPC/Unit
# ---------------------------------------------------------------------------

# RC-related flag codes that should be suppressed for mobile/manufactured
# homes or addresses containing SPC/Unit keywords.
RC_SUPPRESSED_CODES = frozenset([
    "MISSING_DWELLING_REPLACEMENT_COST",
    "MISSING_PERSONAL_PROPERTY_REPLACEMENT_COST",
    "DWELLING_RC_NOT_INCLUDED",
    "DWELLING_RC_INCLUDED_LOW_ORDINANCE",
])


def _is_mobile_or_manufactured(ctx: EvalContext) -> bool:
    """Returns True if the property is mobile or manufactured based on construction_type."""
    construction = str(ctx.get("construction_type") or "").lower()
    return "mobile" in construction or "manufactured" in construction


def _has_suppression_address_keyword(ctx: EvalContext) -> bool:
    """Returns True if the property address contains SPC or Unit."""
    address = str(ctx.get("property_location") or "").upper()
    # Match common abbreviations: "SPC", "SPACE", "UNIT"
    for keyword in ("SPC ", "SPC#", "SPACE ", "SPACE#", "UNIT ", "UNIT#"):
        if keyword in address:
            return True
    return False


def _should_suppress_rc(ctx: EvalContext) -> bool:
    """Returns True if replacement-cost flags should be suppressed for this context."""
    return _is_mobile_or_manufactured(ctx) or _has_suppression_address_keyword(ctx)


def _rc_suppressed_check(inner_fn: Callable[[EvalContext], str | None]):
    """Wrapper: returns None (suppress the flag) if the property qualifies for RC suppression."""
    def wrapped(ctx: EvalContext) -> str | None:
        if _should_suppress_rc(ctx):
            return None
        return inner_fn(ctx)
    return wrapped


# ---------------------------------------------------------------------------
# Check functions — each returns message string (fire) or None (clear)
# ---------------------------------------------------------------------------

def _check_missing_field(field_key: str, label: str):
    """Factory: returns a checker for a missing extracted/term field."""
    def checker(ctx: EvalContext) -> str | None:
        val = ctx.get(field_key)
        if not val or str(val).strip() in ("", "0", "$0", "$0.00", "None"):
            return f"{label} is missing or empty."
        return None
    return checker


def _check_missing_field_in_list(field_name: str, label: str):
    """Factory: returns a checker that triggers if field_name is in parsed missing_fields list."""
    def checker(ctx: EvalContext) -> str | None:
        if field_name in ctx.missing_fields:
            return f"{label} was not extracted from the declaration page."
        return None
    return checker


def _check_zero_value(field_key: str, label: str):
    """Factory: triggers when a coverage field exists but is $0 or zero."""
    def checker(ctx: EvalContext) -> str | None:
        val = ctx.get(field_key)
        if val is None:
            return None  # missing is handled by a separate MISSING_ rule
        cleaned = str(val).replace("$", "").replace(",", "").strip()
        try:
            if float(cleaned) <= 0:
                return f"{label} is $0."
        except ValueError:
            pass
        return None
    return checker


def _check_no_dic(ctx: EvalContext) -> str | None:
    """DIC not on file — check the term's dic_exists bool."""
    dic = ctx.term.get("dic_exists")
    if dic is False:
        return "DIC coverage is not on file for this policy term."
    # Also check extracted data
    dic_data = ctx.data.get("dic_exists")
    if dic_data is not None and str(dic_data).lower() in ("false", "no", "0"):
        return "DIC coverage is not on file for this policy term."
    return None


def _check_other_structures_zero(ctx: EvalContext) -> str | None:
    val = ctx.get("limit_other_structures")
    if val is None:
        return None
    cleaned = str(val).replace("$", "").replace(",", "").strip()
    try:
        if float(cleaned) <= 0:
            return "Other structures coverage is $0."
    except ValueError:
        pass
    return None


def _check_personal_property_zero_owner(ctx: EvalContext) -> str | None:
    """Personal property $0 when occupancy is owner-occupied."""
    occupancy = str(ctx.get("occupancy") or "").lower()
    if "owner" not in occupancy:
        return None  # Only flag for owner-occupied
    val = ctx.get("limit_personal_property")
    if val is None:
        return None
    cleaned = str(val).replace("$", "").replace(",", "").strip()
    try:
        if float(cleaned) <= 0:
            return "Personal property coverage (Coverage C) is $0 for an owner-occupied property."
    except ValueError:
        pass
    return None


def _check_dwelling_rc_included_low_ordinance(ctx: EvalContext) -> str | None:
    """RC Included but ordinance/law coverage is low or missing."""
    rc = ctx.get("limit_dwelling_replacement_cost")
    if not rc:
        return None
    rc_str = str(rc).lower()
    if "included" not in rc_str and "yes" not in rc_str:
        return None
    # Check ordinance/law
    ordinance = ctx.get("limit_ordinance_or_law")
    if not ordinance:
        return "Replacement cost is included but ordinance or law coverage is missing."
    cleaned = str(ordinance).replace("$", "").replace(",", "").strip().replace("%", "")
    try:
        if float(cleaned) < 10:
            return "Replacement cost is included but ordinance or law coverage is very low."
    except ValueError:
        pass
    return None


def _check_dwelling_rc_not_included(ctx: EvalContext) -> str | None:
    """Dwelling replacement cost not included."""
    rc = ctx.get("limit_dwelling_replacement_cost")
    if not rc:
        return None  # Missing — handled by MISSING_DWELLING_REPLACEMENT_COST
    rc_str = str(rc).lower().strip()
    if rc_str in ("not included", "no", "false", "excluded"):
        return "Dwelling replacement cost is not included."
    return None


def _check_mortgagee_present_dwelling_zero(ctx: EvalContext) -> str | None:
    """Mortgagee on policy but dwelling coverage is $0."""
    mortgagee = ctx.get("mortgagee_1_name")
    if not mortgagee:
        return None
    dwelling = ctx.get("limit_dwelling")
    if not dwelling:
        return "Mortgagee is present but dwelling coverage is missing."
    cleaned = str(dwelling).replace("$", "").replace(",", "").strip()
    try:
        if float(cleaned) <= 0:
            return "Mortgagee is present but dwelling coverage is $0."
    except ValueError:
        pass
    return None


def _check_mobile_manufactured_with_rc(ctx: EvalContext) -> str | None:
    """Mobile/manufactured home with RC Included."""
    construction = str(ctx.get("construction_type") or "").lower()
    if "mobile" not in construction and "manufactured" not in construction:
        return None
    rc = ctx.get("limit_dwelling_replacement_cost")
    if rc and str(rc).lower() in ("included", "yes"):
        return "Mobile/manufactured home has replacement cost included — verify eligibility."
    return None






def _check_fair_rental_value(ctx: EvalContext) -> str | None:
    """Fair rental value $0 or missing."""
    val = ctx.get("limit_fair_rental_value")
    if not val:
        return "Fair rental value coverage is missing."
    cleaned = str(val).replace("$", "").replace(",", "").strip()
    try:
        if float(cleaned) <= 0:
            return "Fair rental value coverage is $0."
    except ValueError:
        pass
    return None


def _check_inflation_guard_not_included(ctx: EvalContext) -> str | None:
    """Inflation guard not included or missing."""
    val = ctx.get("limit_inflation_guard")
    if val is None or val == "":
        return "Inflation guard is not included or missing from the declaration page."
    val_str = str(val).lower().strip()
    if val_str in ("not included", "no", "false", "excluded", "0", "$0", "$0.00", "none"):
        return "Inflation guard is not included."
    return None


def _check_ecm_premium(ctx: EvalContext) -> str | None:
    """ECM premium missing or zero — check annual_premium at term level."""
    val = ctx.get("total_annual_premium") or ctx.term.get("annual_premium")
    if not val:
        return "Annual premium is missing."
    cleaned = str(val).replace("$", "").replace(",", "").strip()
    try:
        if float(cleaned) <= 0:
            return "Annual premium is $0."
    except ValueError:
        pass
    return None


def _check_renewal_upcoming(ctx: EvalContext) -> str | None:
    """Policy term expiring within 21 days."""
    exp = ctx.term.get("expiration_date") or ctx.data.get("policy_period_end")
    if not exp:
        return None
    try:
        if isinstance(exp, str):
            # Handle both YYYY-MM-DD and full ISO formats
            exp_date = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            if exp_date.tzinfo is None:
                exp_date = exp_date.replace(tzinfo=timezone.utc)
        else:
            return None

        now = datetime.now(timezone.utc)
        days_until = (exp_date - now).days

        if 0 <= days_until <= 21:
            return f"Policy term expires in {days_until} day{'s' if days_until != 1 else ''} ({exp_date.strftime('%m/%d/%Y')})."
        return None
    except (ValueError, TypeError):
        return None


def _check_duplicate_policy_by_number(ctx: EvalContext) -> str | None:
    """Check if another policy exists with the same policy_number."""
    if not ctx.policy_id:
        return None
    # Get the policy_number from extracted data or from the DB
    policy_number = ctx.data.get("policy_number")
    if not policy_number:
        return None
    try:
        sb = get_supabase()
        res = (
            sb.table("policies")
            .select("id, policy_number")
            .eq("policy_number", policy_number)
            .neq("id", ctx.policy_id)
            .limit(3)
            .execute()
        )
        if res.data and len(res.data) > 0:
            count = len(res.data)
            return f"Found {count} other polic{'ies' if count > 1 else 'y'} with the same policy number ({policy_number})."
    except Exception as e:
        logger.warning("Duplicate check failed for policy_number %s: %s", policy_number, e)
    return None


def _check_roof_age_over_25_with_rc(ctx: EvalContext) -> str | None:
    """
    Roof ≥25 years old with replacement cost included.
    Under 25 years is required for RC eligibility.

    Checks enrichment data first (year_built from property_enrichments),
    then falls back to parsed year_built from extracted data.
    """
    # Check if RC is included
    rc_val = ctx.get("dwelling_replacement_cost_included")
    if not rc_val:
        return None

    rc_str = str(rc_val).strip().lower()
    rc_included = rc_str in ("yes", "true", "included", "1")
    if not rc_included:
        return None

    # Try to get year_built — first from enrichments, then from parsed data
    year_built = None

    # Try enrichment data via DB
    if ctx.policy_id:
        try:
            sb = get_supabase()
            res = (
                sb.table("property_enrichments")
                .select("field_value")
                .eq("policy_id", ctx.policy_id)
                .eq("field_key", "year_built")
                .limit(1)
                .execute()
            )
            if res.data and res.data[0].get("field_value"):
                year_built = int(res.data[0]["field_value"])
        except Exception:
            pass

    # Fallback: parsed data
    if not year_built:
        yb_raw = ctx.get("year_built")
        if yb_raw:
            try:
                year_built = int(str(yb_raw).strip())
            except (ValueError, TypeError):
                pass

    if not year_built:
        return None

    current_year = datetime.now().year
    roof_age = current_year - year_built

    if roof_age >= 25:
        return (
            f"Structure built in {year_built} ({roof_age} years old). "
            f"Roof age must be under 25 years for replacement cost eligibility."
        )
    return None


# ---------------------------------------------------------------------------
# Rule registry — add new rules here
# ---------------------------------------------------------------------------

FLAG_RULES: list[FlagRule] = [
    # ── Data quality: parsed missing fields ────────────────────────────────
    FlagRule("MISSING_POLICY_NUMBER", "critical", "Missing Policy Number",
             "data_quality", "policy", True,
             _check_missing_field_in_list("policy_number", "Policy number")),

    FlagRule("MISSING_PROPERTY_LOCATION", "critical", "Missing Property Location",
             "data_quality", "policy", True,
             _check_missing_field("property_location", "Property location")),

    # ── Data quality: coverage fields ──────────────────────────────────────
    FlagRule("MISSING_DWELLING_LIMIT", "critical", "Missing Dwelling Limit",
             "data_quality", "policy", True,
             _check_missing_field("limit_dwelling", "Dwelling coverage limit")),

    FlagRule("MISSING_ORDINANCE_OR_LAW", "critical", "Missing Ordinance or Law",
             "coverage_gap", "policy", True,
             _check_missing_field("limit_ordinance_or_law", "Ordinance or law coverage")),

    FlagRule("MISSING_EXTENDED_DWELLING", "critical", "Missing Extended Dwelling Coverage",
             "coverage_gap", "policy", True,
             _check_missing_field("limit_extended_dwelling_coverage", "Extended dwelling coverage")),

    FlagRule("MISSING_DWELLING_REPLACEMENT_COST", "critical", "Missing Dwelling Replacement Cost",
             "coverage_gap", "policy", True,
             _rc_suppressed_check(_check_missing_field("limit_dwelling_replacement_cost", "Dwelling replacement cost"))),

    FlagRule("MISSING_PERSONAL_PROPERTY_REPLACEMENT_COST", "critical", "Missing Personal Property RC",
             "coverage_gap", "policy", True,
             _rc_suppressed_check(_check_missing_field("limit_personal_property_replacement_cost", "Personal property replacement cost"))),

    FlagRule("MISSING_FENCES_COVERAGE", "critical", "Missing Fences Coverage",
             "coverage_gap", "policy", True,
             _check_missing_field("limit_fences", "Fences coverage")),

    FlagRule("MISSING_PERSONAL_PROPERTY_COVERAGE_C", "critical", "Missing Personal Property (Cov C)",
             "coverage_gap", "policy", True,
             _check_missing_field("limit_personal_property", "Personal property (Coverage C)")),

    # ── Client/contact ─────────────────────────────────────────────────────
    # MVP-DEFERRED: MISSING_EMAIL and MISSING_PHONE are disabled until the
    # clients table has email/phone columns reliably populated.
    # Uncomment when ready:
    # FlagRule("MISSING_EMAIL", "high", "Missing Client Email",
    #          "data_quality", "client", True,
    #          _check_missing_field("email", "Client email")),
    # FlagRule("MISSING_PHONE", "high", "Missing Client Phone",
    #          "data_quality", "client", True,
    #          _check_missing_field("phone", "Client phone number")),

    # ── Coverage/DIC ───────────────────────────────────────────────────────
    FlagRule("NO_DIC", "high", "DIC Not on File",
             "dic", "policy", False, _check_no_dic),

    FlagRule("DWELLING_RC_NOT_INCLUDED", "high", "Dwelling RC Not Included",
             "coverage_gap", "policy", False, _rc_suppressed_check(_check_dwelling_rc_not_included)),

    FlagRule("DWELLING_RC_INCLUDED_LOW_ORDINANCE", "high", "RC Included, Low Ordinance/Law",
             "coverage_gap", "policy", True, _rc_suppressed_check(_check_dwelling_rc_included_low_ordinance)),

    FlagRule("FAIR_RENTAL_VALUE_ZERO_OR_MISSING", "high", "Fair Rental Value Zero or Missing",
             "coverage_gap", "policy", True, _check_fair_rental_value),

    FlagRule("INFLATION_GUARD_NOT_INCLUDED", "high", "Inflation Guard Not Included",
             "coverage_gap", "policy", True, _check_inflation_guard_not_included),

    FlagRule("ECM_PREMIUM_MISSING_OR_ZERO", "high", "Premium Missing or Zero",
             "data_quality", "policy", True, _check_ecm_premium),

    # ── Renewal ────────────────────────────────────────────────────────────
    FlagRule("RENEWAL_UPCOMING", "high", "Renewal Upcoming",
             "renewal", "policy", True, _check_renewal_upcoming),

    # ── Warning-level rules ────────────────────────────────────────────────
    FlagRule("OTHER_STRUCTURES_ZERO", "warning", "Other Structures $0",
             "coverage_gap", "policy", True, _check_other_structures_zero),

    FlagRule("PERSONAL_PROPERTY_ZERO_OWNER_OCCUPIED", "warning",
             "Personal Property $0 (Owner-Occupied)",
             "coverage_gap", "policy", True, _check_personal_property_zero_owner),

    FlagRule("MOBILE_OR_MANUFACTURED_WITH_RC_INCLUDED", "warning",
             "Mobile/Manufactured Home w/ RC Included",
             "coverage_gap", "policy", False, _check_mobile_manufactured_with_rc),

    FlagRule("ROOF_AGE_OVER_25_WITH_RC_INCLUDED", "warning",
             "Roof Age >25 Years w/ RC Included",
             "coverage_gap", "policy", False, _check_roof_age_over_25_with_rc),

    FlagRule("MORTGAGEE_PRESENT_DWELLING_ZERO", "critical",
             "Mortgagee Present, Dwelling $0",
             "coverage_gap", "policy", False, _check_mortgagee_present_dwelling_zero),

    # ── Duplicate detection ────────────────────────────────────────────────
    FlagRule("DUPLICATE_ID_IN_TABLE", "warning",
             "Possible Duplicate Policy",
             "duplicate", "policy", False, _check_duplicate_policy_by_number),
]


# ---------------------------------------------------------------------------
# Evaluator entry point
# ---------------------------------------------------------------------------

def evaluate_flags(
    *,
    policy_id: str | None = None,
    client_id: str | None = None,
    policy_term_id: str | None = None,
    dec_page_id: str | None = None,
    extracted_data: dict | None = None,
    missing_fields: list[str] | None = None,
) -> dict:
    """
    Run all flag rules against the given context.

    Fetches live data from DB for the policy term and client
    to supplement the extracted_data from the parser.

    Returns summary: {"created": int, "refreshed": int, "resolved": int}
    """
    summary = {"created": 0, "refreshed": 0, "resolved": 0, "errors": 0}

    # Fetch live term data from DB
    term_data = {}
    if policy_term_id:
        try:
            sb = get_supabase()
            res = sb.table("policy_terms").select("*").eq("id", policy_term_id).single().execute()
            if res.data:
                term_data = res.data
        except Exception as e:
            logger.warning("Could not fetch policy_term %s: %s", policy_term_id, e)

    # Fetch live client data from DB
    client_data = {}
    if client_id:
        try:
            sb = get_supabase()
            res = sb.table("clients").select("*").eq("id", client_id).single().execute()
            if res.data:
                client_data = res.data
        except Exception as e:
            logger.warning("Could not fetch client %s: %s", client_id, e)

    ctx = EvalContext(
        policy_id=policy_id,
        client_id=client_id,
        policy_term_id=policy_term_id,
        dec_page_id=dec_page_id,
        extracted_data=extracted_data,
        missing_fields=missing_fields,
        policy_term=term_data,
        client=client_data,
    )

    for rule in FLAG_RULES:
        try:
            _evaluate_one_rule(rule, ctx, summary)
        except Exception as e:
            logger.error("Error evaluating rule %s: %s", rule.code, e)
            summary["errors"] += 1

    logger.info(
        "Flag evaluation complete for policy=%s: created=%d refreshed=%d resolved=%d errors=%d",
        policy_id, summary["created"], summary["refreshed"],
        summary["resolved"], summary["errors"],
    )
    return summary


def _evaluate_one_rule(rule: FlagRule, ctx: EvalContext, summary: dict) -> None:
    """Evaluate a single rule: fire or auto-resolve."""

    # Determine entity scope IDs
    if rule.entity_scope == "client":
        entity_id = ctx.client_id
    elif rule.entity_scope == "policy_term":
        entity_id = ctx.policy_term_id
    else:
        entity_id = ctx.policy_id

    if not entity_id:
        return  # Can't evaluate without the scoped entity

    flag_key = build_flag_key(rule.entity_scope, entity_id, rule.code)

    # Run the check function
    message = rule.check_fn(ctx)

    if message:
        # Condition fires — upsert open flag
        flag_id = upsert_open_flag(
            flag_key=flag_key,
            code=rule.code,
            severity=rule.severity,
            title=rule.title,
            message=message,
            category=rule.category,
            source="system",
            policy_id=ctx.policy_id,
            client_id=ctx.client_id,
            policy_term_id=ctx.policy_term_id,
            dec_page_id=ctx.dec_page_id,
            rule_version=RULE_VERSION,
        )
        if flag_id:
            # We don't know from upsert_open_flag if it was created or refreshed,
            # but we can check if it was just created (times_seen=1) via a simple heuristic.
            # For summary purposes, count any successful upsert.
            summary["created"] += 1
    else:
        # Condition is clear
        if rule.auto_resolve:
            resolved = resolve_open_flag(
                flag_key,
                note=f"Auto-resolved: {rule.title} condition no longer applies.",
            )
            if resolved:
                summary["resolved"] += 1
