"""
Policy matching engine for RCE and DIC documents.

Matches documents to existing policies using Owner Name + Property Address.
Unlike dec pages (which use policy_number), these documents require fuzzy matching
with strict safety controls.

Matching hierarchy:
1. Exact normalized address + exact normalized name → AUTO-LINK
2. Exact normalized address + close name (>80%) → AUTO-LINK
3. Exact normalized address + no name match → NEEDS_REVIEW
4. Close address (>90%) + exact name → NEEDS_REVIEW
5. No address match → NO_MATCH
6. Multiple address matches → NEEDS_REVIEW
"""

import logging
import re
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import TypedDict

from ..supabase_client import get_supabase

logger = logging.getLogger("worker.documents.matcher")


def _fetch_all(table_query) -> list[dict]:
    """Fetch ALL rows from a Supabase query using range-based pagination.

    PostgREST enforces a server-side maximum of 1000 rows per request
    that cannot be overridden via .limit(). We must paginate with .range().
    """
    PAGE = 1000
    offset = 0
    all_rows: list[dict] = []
    while True:
        res = table_query.range(offset, offset + PAGE - 1).execute()
        batch = res.data or []
        all_rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return all_rows


# ── Normalization ────────────────────────────────────────────────────────────

# Common street abbreviation expansions
STREET_ABBREVS = {
    "ST": "STREET", "ST.": "STREET",
    "AVE": "AVENUE", "AVE.": "AVENUE",
    "BLVD": "BOULEVARD", "BLVD.": "BOULEVARD",
    "DR": "DRIVE", "DR.": "DRIVE",
    "LN": "LANE", "LN.": "LANE",
    "CT": "COURT", "CT.": "COURT",
    "PL": "PLACE", "PL.": "PLACE",
    "RD": "ROAD", "RD.": "ROAD",
    "CIR": "CIRCLE", "CIR.": "CIRCLE",
    "HWY": "HIGHWAY", "HWY.": "HIGHWAY",
    "PKWY": "PARKWAY", "PKWY.": "PARKWAY",
    "WAY": "WAY",
}

# Name suffixes to strip for matching
NAME_SUFFIXES = {
    "LLC", "INC", "CORP", "CO", "LTD",
    "TRUST", "REVOCABLE", "IRREVOCABLE", "FAMILY",
    "JR", "SR", "II", "III", "IV",
    "ESTATE", "ESTATES",
}


def normalize_address(raw: str | None) -> str | None:
    """
    Normalize a property address for matching.
    
    Steps:
    - Uppercase
    - Remove punctuation (commas, periods, hashes)
    - Strip unit/apt/ste designators and their numbers
    - Expand common abbreviations
    - Collapse whitespace
    """
    if not raw or not raw.strip():
        return None

    s = raw.upper().strip()

    # Remove common punctuation
    s = s.replace(",", "").replace(".", "").replace("#", "").replace("'", "")

    # Strip unit/apt/ste and following number
    s = re.sub(r"\b(UNIT|APT|STE|SUITE|APARTMENT|BLDG|BUILDING)\s*\w*", "", s)

    # Expand abbreviations
    words = s.split()
    expanded = []
    for w in words:
        expanded.append(STREET_ABBREVS.get(w, w))
    s = " ".join(expanded)

    # Collapse whitespace
    s = " ".join(s.split())

    return s if s else None


def normalize_name(raw: str | None) -> str | None:
    """
    Normalize an owner/insured name for matching.
    
    Steps:
    - Uppercase
    - Remove punctuation
    - Strip legal/name suffixes (LLC, TRUST, JR, etc.)
    - Collapse whitespace
    """
    if not raw or not raw.strip():
        return None

    s = raw.upper().strip()

    # Remove punctuation
    s = re.sub(r"[.,\-'\"()]", " ", s)

    # Strip known suffixes
    words = s.split()
    filtered = [w for w in words if w not in NAME_SUFFIXES]

    s = " ".join(filtered)

    # Collapse whitespace
    s = " ".join(s.split())

    return s if s else None


def _similarity(a: str, b: str) -> float:
    """Compute normalized similarity ratio (0.0-1.0) between two strings."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


# ── Match Result Types ───────────────────────────────────────────────────────

class MatchCandidate(TypedDict):
    policy_id: str
    client_id: str | None
    named_insured: str | None
    property_address_norm: str | None
    address_similarity: float
    name_similarity: float


class MatchLogEntry(TypedDict):
    step: str
    candidates_found: int
    result: str
    reason: str
    details: dict
    timestamp: str


class MatchResult(TypedDict):
    status: str   # "matched" | "needs_review" | "no_match"
    policy_id: str | None
    client_id: str | None
    policy_term_id: str | None
    confidence: float
    match_log: list[MatchLogEntry]
    review_reason: str | None
    action_items: list[str]


# ── Main Matching Function ───────────────────────────────────────────────────

def match_document_to_policy(
    extracted_owner_name: str | None,
    extracted_address: str | None,
    account_id: str,
) -> MatchResult:
    """
    Attempt to match a document to an existing policy using owner name + address.
    
    Returns a MatchResult with:
    - status: "matched" (safe to auto-link), "needs_review" (agent must decide),
              or "no_match" (no candidates found)
    - policy_id / client_id / policy_term_id: populated if matched
    - confidence: 0.0 - 1.0
    - match_log: detailed audit trail of every decision step
    - review_reason: human-readable explanation if needs_review
    - action_items: list of suggested actions for the agent
    """
    match_log: list[MatchLogEntry] = []
    now_iso = datetime.now(timezone.utc).isoformat()
    
    def log_step(step: str, result: str, reason: str, details: dict | None = None):
        entry: MatchLogEntry = {
            "step": step,
            "candidates_found": 0,
            "result": result,
            "reason": reason,
            "details": details or {},
            "timestamp": now_iso,
        }
        match_log.append(entry)
        logger.info("Match step=%s result=%s reason=%s", step, result, reason)

    # Normalize inputs
    norm_address = normalize_address(extracted_address)
    norm_name = normalize_name(extracted_owner_name)

    if not norm_address:
        log_step("validate_inputs", "no_match", "No address extracted from document")
        return MatchResult(
            status="no_match",
            policy_id=None, client_id=None, policy_term_id=None,
            confidence=0.0,
            match_log=match_log,
            review_reason="No property address could be extracted from this document.",
            action_items=[
                "Manually search for the correct policy and link this document.",
                "Verify the uploaded document is readable and contains an address.",
            ],
        )

    if not norm_name:
        log_step("validate_inputs", "warning", "No owner name extracted — matching on address only")

    # Query policies by normalized address
    sb = get_supabase()
    
    try:
        result = (
            sb.table("policies")
            .select("id, client_id, policy_number, property_address_norm, property_address_raw")
            .eq("property_address_norm", norm_address)
            .execute()
        )
        exact_candidates = result.data or []
    except Exception as e:
        log_step("query_policies_exact", "error", f"Database query failed: {e}")
        return MatchResult(
            status="needs_review",
            policy_id=None, client_id=None, policy_term_id=None,
            confidence=0.0,
            match_log=match_log,
            review_reason=f"Database error during matching: {e}",
            action_items=["Retry the match or manually link this document to a policy."],
        )

    log_step(
        "query_address_exact",
        "found" if exact_candidates else "empty",
        f"Found {len(exact_candidates)} exact address match(es) for: {norm_address}",
        {"candidates": len(exact_candidates), "query_address": norm_address},
    )

    if not exact_candidates:
        # Before relying on a fuzzy address (which can hallucinate matches for similar street names),
        # try an exact or strong name match if we have a name. This handles policies that have
        # missing (NULL) addresses in the database, like newly created FAIR Plan policies.
        if norm_name:
            try:
                all_clients = _fetch_all(sb.table("clients").select("id, named_insured"))
                best_client_id = None
                best_client_name = None
                best_client_sim = 0.0
                
                for c in all_clients:
                    c_name = normalize_name(c.get("named_insured"))
                    if c_name:
                        sim = _similarity(norm_name, c_name)
                        if sim > best_client_sim and sim >= 0.85:
                            best_client_sim = sim
                            best_client_id = c["id"]
                            best_client_name = c.get("named_insured")
                
                if best_client_id:
                    # Find policies for this client
                    pol_res = sb.table("policies").select("id, client_id, policy_number, property_address_raw").eq("client_id", best_client_id).execute()
                    pols = pol_res.data or []
                    
                    if len(pols) == 1:
                        pol = pols[0]
                        pol_addr = pol.get("property_address_raw")
                        
                        log_step(
                            "name_fallback", "found",
                            f"No exact address matches, but found EXACTLY 1 policy for matching client '{best_client_name}' ({best_client_sim:.0%} match)",
                            {"client_id": best_client_id, "policy_id": pol["id"]}
                        )
                        
                        # Fetch policy term id
                        term_id = None
                        term_res = sb.table("policy_terms").select("id").eq("policy_id", pol["id"]).eq("is_current", True).limit(1).execute()
                        if term_res.data:
                            term_id = term_res.data[0]["id"]
                            
                        # If the DB policy has an address and it's quite different, flag for review
                        if pol_addr:
                            pol_addr_norm = normalize_address(pol_addr)
                            if pol_addr_norm and _similarity(norm_address, pol_addr_norm) < 0.85:
                                return MatchResult(
                                    status="needs_review",
                                    policy_id=pol["id"], client_id=best_client_id, policy_term_id=term_id,
                                    confidence=0.5, match_log=match_log,
                                    review_reason=f"Owner name matched '{best_client_name}', but the document's address ('{extracted_address}') differs from the policy's address ('{pol_addr}').",
                                    action_items=["Verify if this document belongs to this policy, or if the address needs updating."]
                                )
                                
                        # Otherwise, strong name match + no conflicting address -> auto or strong review
                        if best_client_sim >= 0.95:
                            return MatchResult(
                                status="matched",
                                policy_id=pol["id"], client_id=best_client_id, policy_term_id=term_id,
                                confidence=0.8, match_log=match_log, review_reason=None, action_items=[]
                            )
                        else:
                            return MatchResult(
                                status="needs_review",
                                policy_id=pol["id"], client_id=best_client_id, policy_term_id=term_id,
                                confidence=round(best_client_sim * 0.7, 2), match_log=match_log,
                                review_reason=f"Matches client '{best_client_name}' ({best_client_sim:.0%} similar). Policy has no address in DB to compare.",
                                action_items=["Confirm this is the correct policy for the insured."]
                            )
            except Exception as e:
                logger.error("Name fallback failed: %s", e)

        # Try fuzzy address match — query all policies for this account and score
        try:
            all_policies_data = _fetch_all(
                sb.table("policies")
                .select("id, client_id, policy_number, property_address_norm, property_address_raw")
                .not_.is_("property_address_norm", "null")
            )
            fuzzy_candidates = []
            for p in all_policies_data:
                sim = _similarity(norm_address, p.get("property_address_norm", ""))
                if sim >= 0.85:
                    fuzzy_candidates.append({**p, "_addr_sim": sim})
            
            fuzzy_candidates.sort(key=lambda x: x["_addr_sim"], reverse=True)
        except Exception as e:
            logger.error("Fuzzy address query failed: %s", e)
            fuzzy_candidates = []

        if fuzzy_candidates:
            log_step(
                "query_address_fuzzy",
                "needs_review",
                f"No exact address match, but found {len(fuzzy_candidates)} close match(es)",
                {
                    "top_candidate": fuzzy_candidates[0].get("property_address_norm"),
                    "top_similarity": round(fuzzy_candidates[0]["_addr_sim"], 3),
                },
            )
            return MatchResult(
                status="needs_review",
                policy_id=fuzzy_candidates[0]["id"],
                client_id=fuzzy_candidates[0].get("client_id"),
                policy_term_id=None,
                confidence=round(fuzzy_candidates[0]["_addr_sim"] * 0.5, 2),
                match_log=match_log,
                review_reason=(
                    f"Address is close but not exact. "
                    f"Document: '{extracted_address}' → "
                    f"Closest policy: '{fuzzy_candidates[0].get('property_address_raw')}' "
                    f"({round(fuzzy_candidates[0]['_addr_sim'] * 100)}% match)"
                ),
                action_items=[
                    f"Review: Is this the correct policy? (Policy #{fuzzy_candidates[0].get('policy_number', 'unknown')})",
                    "Search for the correct policy and link manually if this is wrong.",
                    "Create a new client/policy if this property doesn't exist in the system yet.",
                ],
            )

        log_step("query_address_fuzzy", "no_match", "No close address matches found either")
        return MatchResult(
            status="no_match",
            policy_id=None, client_id=None, policy_term_id=None,
            confidence=0.0,
            match_log=match_log,
            review_reason=(
                f"No policy found with address matching '{extracted_address}'. "
                f"This property may not be in the system yet."
            ),
            action_items=[
                "Search for the correct policy by name or address and link this document.",
                "If this is a new property, consider creating a new client/policy record.",
            ],
        )

    # We have exact address match(es). Now check owner name.
    if len(exact_candidates) > 1:
        # Multiple policies at the same address — need name to disambiguate
        if not norm_name:
            log_step(
                "multiple_address_no_name",
                "needs_review",
                f"Multiple policies ({len(exact_candidates)}) at this address, and no owner name to disambiguate",
            )
            return MatchResult(
                status="needs_review",
                policy_id=None, client_id=None, policy_term_id=None,
                confidence=0.3,
                match_log=match_log,
                review_reason=(
                    f"Found {len(exact_candidates)} policies at '{extracted_address}' "
                    f"but could not extract an owner name to determine which one."
                ),
                action_items=[
                    f"Choose from {len(exact_candidates)} policies at this address.",
                    "Review the document to identify the correct policy holder.",
                ],
            )

    # Score name similarity for each candidate
    scored: list[MatchCandidate] = []
    for cand in exact_candidates:
        client_id = cand.get("client_id")
        named_insured = None

        # Fetch the client's named_insured for name comparison
        if client_id:
            try:
                client_result = (
                    sb.table("clients")
                    .select("named_insured")
                    .eq("id", client_id)
                    .limit(1)
                    .execute()
                )
                if client_result.data:
                    named_insured = client_result.data[0].get("named_insured")
            except Exception as e:
                logger.warning("Failed to fetch client %s: %s", client_id, e)

        name_sim = 0.0
        if norm_name and named_insured:
            norm_existing = normalize_name(named_insured)
            if norm_existing:
                name_sim = _similarity(norm_name, norm_existing)

        scored.append(MatchCandidate(
            policy_id=cand["id"],
            client_id=client_id,
            named_insured=named_insured,
            property_address_norm=cand.get("property_address_norm"),
            address_similarity=1.0,
            name_similarity=round(name_sim, 3),
        ))

    # Sort by name similarity descending
    scored.sort(key=lambda x: x["name_similarity"], reverse=True)
    best = scored[0]

    log_step(
        "name_scoring",
        "scored",
        f"Best name match: {best['name_similarity']:.1%} "
        f"('{norm_name}' vs '{best.get('named_insured')}')",
        {
            "extracted_name": extracted_owner_name,
            "normalized_name": norm_name,
            "best_insured": best.get("named_insured"),
            "best_similarity": best["name_similarity"],
            "candidates_scored": len(scored),
        },
    )

    # Resolve current term for the matched policy
    policy_term_id = None
    if best["policy_id"]:
        try:
            term_result = (
                sb.table("policy_terms")
                .select("id")
                .eq("policy_id", best["policy_id"])
                .eq("is_current", True)
                .limit(1)
                .execute()
            )
            if term_result.data:
                policy_term_id = term_result.data[0]["id"]
        except Exception as e:
            logger.warning("Failed to fetch current term: %s", e)

    # Decision
    if not norm_name:
        # Only one address match, no name to compare
        if len(exact_candidates) == 1:
            log_step("decision", "matched", "Single address match, no name to compare — auto-linking")
            return MatchResult(
                status="matched",
                policy_id=best["policy_id"],
                client_id=best["client_id"],
                policy_term_id=policy_term_id,
                confidence=0.7,
                match_log=match_log,
                review_reason=None,
                action_items=[],
            )

    if best["name_similarity"] >= 0.80:
        # Good match
        log_step(
            "decision", "matched",
            f"Address exact + name {best['name_similarity']:.0%} match → auto-linked",
        )
        return MatchResult(
            status="matched",
            policy_id=best["policy_id"],
            client_id=best["client_id"],
            policy_term_id=policy_term_id,
            confidence=round((1.0 + best["name_similarity"]) / 2, 2),
            match_log=match_log,
            review_reason=None,
            action_items=[],
        )

    if best["name_similarity"] >= 0.50:
        # Partial name match — needs review
        log_step(
            "decision", "needs_review",
            f"Address exact but name only {best['name_similarity']:.0%} match",
        )
        return MatchResult(
            status="needs_review",
            policy_id=best["policy_id"],
            client_id=best["client_id"],
            policy_term_id=policy_term_id,
            confidence=round(best["name_similarity"] * 0.6, 2),
            match_log=match_log,
            review_reason=(
                f"Address matched exactly, but the owner name doesn't fully match. "
                f"Document: '{extracted_owner_name}' — "
                f"Policy: '{best.get('named_insured')}' "
                f"({best['name_similarity']:.0%} similar)"
            ),
            action_items=[
                "Confirm this is the correct policy (name may differ due to formatting or legal entity).",
                "If wrong, search for the correct policy and link manually.",
            ],
        )

    # Address matches but name is very different
    log_step(
        "decision", "needs_review",
        f"Address exact but name mismatch ({best['name_similarity']:.0%})",
    )
    return MatchResult(
        status="needs_review",
        policy_id=best["policy_id"],
        client_id=best["client_id"],
        policy_term_id=policy_term_id,
        confidence=0.3,
        match_log=match_log,
        review_reason=(
            f"Found {len(candidates)} possible match(es). "
            f"DIC/RCE documents require manual confirmation — "
            f"please review the candidates below and assign to the correct policy."
        ),
        action_items=[
            "Review the candidate matches below.",
            "Compare insured names and property addresses.",
            "Click 'Assign' on the correct policy.",
        ],
    )


# ── Candidate-Based Matching (DIC / RCE) ────────────────────────────────────

def match_candidates_for_review(
    extracted_owner_name: str | None,
    extracted_address: str | None,
    account_id: str,
    doc_type: str = "dic_dec_page",
) -> MatchResult:
    """
    Gather match candidates by BOTH name and address — never auto-link.

    DIC and RCE documents have different policy numbers than the CFP policy,
    so we can't match by policy number. Instead we find all plausible
    candidates and always return 'needs_review' so the agent picks the
    correct one.

    Candidates are stored in match_log under steps with step='candidates'
    and a 'candidates' list in details. Each candidate has:
      - policy_id, client_id, policy_number, carrier_name
      - named_insured, property_address_raw
      - name_similarity, address_similarity
      - match_source: 'name' | 'address' | 'both'

    The frontend uses these to render a comparison UI.
    """
    match_log: list[MatchLogEntry] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    def log_step(step: str, result: str, reason: str, details: dict | None = None):
        entry: MatchLogEntry = {
            "step": step,
            "candidates_found": 0,
            "result": result,
            "reason": reason,
            "details": details or {},
            "timestamp": now_iso,
        }
        match_log.append(entry)
        logger.info("Match step=%s result=%s reason=%s", step, result, reason)

    norm_address = normalize_address(extracted_address)
    norm_name = normalize_name(extracted_owner_name)

    if not norm_address and not norm_name:
        log_step("validate_inputs", "no_match", "Neither name nor address extracted from document")
        return MatchResult(
            status="no_match",
            policy_id=None, client_id=None, policy_term_id=None,
            confidence=0.0,
            match_log=match_log,
            review_reason="Could not extract owner name or property address from this document.",
            action_items=["Manually search for the correct policy and link this document."],
        )

    sb = get_supabase()
    seen_policy_ids: set[str] = set()
    candidates: list[dict] = []

    # ── Step 1: Name-based candidates ────────────────────────────────
    if norm_name:
        try:
            all_clients = _fetch_all(sb.table("clients").select("id, named_insured"))
            name_matches: list[tuple[str, str, float]] = []

            for c in all_clients:
                c_insured = c.get("named_insured")
                c_norm = normalize_name(c_insured)
                if c_norm:
                    sim = _similarity(norm_name, c_norm)
                    if sim >= 0.85:
                        name_matches.append((c["id"], c_insured, sim))

            name_matches.sort(key=lambda x: x[2], reverse=True)

            for client_id, client_name, name_sim in name_matches[:8]:
                pol_res = (
                    sb.table("policies")
                    .select("id, policy_number, carrier_name, property_address_raw, property_address_norm")
                    .eq("client_id", client_id)
                    .execute()
                )
                for pol in (pol_res.data or []):
                    if pol["id"] in seen_policy_ids:
                        continue
                    seen_policy_ids.add(pol["id"])

                    addr_sim = 0.0
                    if norm_address and pol.get("property_address_norm"):
                        addr_sim = _similarity(norm_address, pol["property_address_norm"])

                    candidates.append({
                        "policy_id": pol["id"],
                        "client_id": client_id,
                        "policy_number": pol.get("policy_number"),
                        "carrier_name": pol.get("carrier_name"),
                        "named_insured": client_name,
                        "property_address_raw": pol.get("property_address_raw"),
                        "name_similarity": round(name_sim, 3),
                        "address_similarity": round(addr_sim, 3),
                        "match_source": "name",
                    })

            log_step(
                "name_search", "found" if name_matches else "empty",
                f"Found {len(name_matches)} client(s) matching name '{extracted_owner_name}'",
                {"query_name": extracted_owner_name, "normalized": norm_name, "hits": len(name_matches)},
            )
        except Exception as e:
            logger.error("Name-based candidate search failed: %s", e)
            log_step("name_search", "error", f"Name search failed: {e}")

    # ── Step 2: Address-based candidates ─────────────────────────────
    if norm_address:
        try:
            all_policies_data = _fetch_all(
                sb.table("policies")
                .select("id, client_id, policy_number, carrier_name, property_address_norm, property_address_raw")
                .not_.is_("property_address_norm", "null")
            )

            addr_hits = 0
            for p in all_policies_data:
                if p["id"] in seen_policy_ids:
                    # Already found by name — upgrade match_source to 'both'
                    p_norm = p.get("property_address_norm", "")
                    if p_norm:
                        addr_sim = _similarity(norm_address, normalize_address(p_norm) or p_norm)
                        if addr_sim >= 0.80:
                            for c in candidates:
                                if c["policy_id"] == p["id"]:
                                    c["address_similarity"] = round(addr_sim, 3)
                                    c["match_source"] = "both"
                                    break
                    continue

                p_norm = p.get("property_address_norm", "")
                if not p_norm:
                    continue
                addr_sim = _similarity(norm_address, normalize_address(p_norm) or p_norm)
                if addr_sim >= 0.80:
                    addr_hits += 1
                    client_name = None
                    name_sim = 0.0
                    cid = p.get("client_id")
                    if cid:
                        try:
                            cr = sb.table("clients").select("named_insured").eq("id", cid).limit(1).execute()
                            if cr.data:
                                client_name = cr.data[0].get("named_insured")
                                if norm_name and client_name:
                                    name_sim = _similarity(norm_name, normalize_name(client_name) or "")
                        except Exception:
                            pass

                    seen_policy_ids.add(p["id"])
                    candidates.append({
                        "policy_id": p["id"],
                        "client_id": cid,
                        "policy_number": p.get("policy_number"),
                        "carrier_name": p.get("carrier_name"),
                        "named_insured": client_name,
                        "property_address_raw": p.get("property_address_raw"),
                        "name_similarity": round(name_sim, 3),
                        "address_similarity": round(addr_sim, 3),
                        "match_source": "address",
                    })

            log_step(
                "address_search", "found" if addr_hits else "empty",
                f"Found {addr_hits} additional address match(es) for '{extracted_address}'",
                {"query_address": extracted_address, "normalized": norm_address, "hits": addr_hits},
            )
        except Exception as e:
            logger.error("Address-based candidate search failed: %s", e)
            log_step("address_search", "error", f"Address search failed: {e}")

    # ── Sort: 'both' first, then by combined score ───────────────────
    def _sort_key(c: dict) -> tuple:
        source_rank = 0 if c["match_source"] == "both" else (1 if c["match_source"] == "name" else 2)
        combined = c["name_similarity"] * 0.5 + c["address_similarity"] * 0.5
        return (source_rank, -combined)

    candidates.sort(key=_sort_key)
    candidates = candidates[:10]

    # ── Filter: remove weak candidates ───────────────────────────────
    # To survive with a bad name match (<0.50), the address must be strong (≥0.90).
    # To survive with a bad address match (<0.90), the name must be at least recognizable (≥0.50).
    pre_filter_count = len(candidates)
    candidates = [
        c for c in candidates
        if c["name_similarity"] >= 0.50 or c["address_similarity"] >= 0.90
    ]
    filtered_out = pre_filter_count - len(candidates)
    if filtered_out:
        log_step(
            "filter_weak", "filtered",
            f"Removed {filtered_out} weak candidate(s) (name<0.50 AND address<0.90)",
            {"before": pre_filter_count, "after": len(candidates)},
        )

    # ── Store candidates in match_log ────────────────────────────────
    log_step(
        "candidates", "found" if candidates else "empty",
        f"Gathered {len(candidates)} total candidate(s) for agent review",
        {"candidates": candidates},
    )

    if not candidates:
        return MatchResult(
            status="no_match",
            policy_id=None, client_id=None, policy_term_id=None,
            confidence=0.0,
            match_log=match_log,
            review_reason=(
                f"No matching policies found for '{extracted_owner_name or '?'}' "
                f"at '{extracted_address or '?'}'. Manual assignment required."
            ),
            action_items=[
                "Search for the correct policy by name or address.",
                "If this is a new property, create a new client/policy record first.",
            ],
        )

    # ── Auto-attach: exactly 1 strong candidate ─────────────────────
    strong = [
        c for c in candidates
        if c["name_similarity"] >= 0.95 and c["address_similarity"] >= 0.95
    ]
    if len(strong) == 1:
        auto = strong[0]
        policy_term_id = None
        try:
            term_res = (
                sb.table("policy_terms")
                .select("id")
                .eq("policy_id", auto["policy_id"])
                .eq("is_current", True)
                .limit(1)
                .execute()
            )
            if term_res.data:
                policy_term_id = term_res.data[0]["id"]
        except Exception as e:
            logger.warning("Failed to fetch policy_term for auto-attach: %s", e)

        log_step(
            "auto_attach", "matched",
            f"Single strong candidate: name={auto['name_similarity']:.0%} address={auto['address_similarity']:.0%} → auto-linked",
            {"policy_id": auto["policy_id"], "client_id": auto["client_id"]},
        )
        return MatchResult(
            status="matched",
            policy_id=auto["policy_id"],
            client_id=auto["client_id"],
            policy_term_id=policy_term_id,
            confidence=round((auto["name_similarity"] + auto["address_similarity"]) / 2, 2),
            match_log=match_log,
            review_reason=None,
            action_items=[],
        )

    # Best candidate for pre-selection hint (agent still must confirm)
    best = candidates[0]
    return MatchResult(
        status="needs_review",
        policy_id=best["policy_id"],
        client_id=best["client_id"],
        policy_term_id=None,
        confidence=round(
            best["name_similarity"] * 0.5 + best["address_similarity"] * 0.5,
            2,
        ),
        match_log=match_log,
        review_reason=(
            f"Found {len(candidates)} possible match(es). "
            f"DIC/RCE documents require manual confirmation — "
            f"please review the candidates below and assign to the correct policy."
        ),
        action_items=[
            "Review the candidate matches below.",
            "Compare insured names and property addresses.",
            "Click 'Assign' on the correct policy.",
        ],
    )
