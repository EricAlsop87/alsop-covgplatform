"""
LLM-powered declaration page field extraction using OpenAI GPT-4o-mini.

Sends trimmed raw text to GPT-4o-mini with a structured prompt based on
the CFP extraction ruleset derived from actual dec page layouts.
Returns JSON with all declaration fields.
Falls back to regex parser if the LLM call fails.

Cost: ~$0.01-0.03 per dec page (4o-mini pricing).
"""

import json
import logging
import os
from typing import Any

from openai import OpenAI

logger = logging.getLogger("worker.extract.llm_extract")

# How many chars of raw text to send to the LLM.
# Dec page fields are always in the first few pages; the rest is boilerplate.
MAX_TEXT_CHARS = 8000

# Fields critical for the pipeline lifecycle (client + policy creation)
LIFECYCLE_FIELDS = ["insured_name", "policy_number"]

SYSTEM_PROMPT = """You are an expert system designed to extract structured data from a California FAIR Plan (CFP) insurance declaration page.

You will receive raw OCR or extracted PDF text.
Extract ONLY information explicitly found in the text.
If a value is missing, ambiguous, unreadable, or not explicitly shown, return null.

DO NOT infer, guess, approximate, calculate, summarize, or fabricate.

Return ONLY valid JSON.
No comments, no markdown, no explanations.

============================================
FIELDS TO EXTRACT
============================================

{
    "insured_name": "",
    "secondary_insured_name": "",
    "mailing_address": "",
    "property_location": "",
    "policy_number": "",
    "date_issued": "",
    "policy_period_start": "",
    "policy_period_end": "",
    "year_built": "",
    "occupancy": "",
    "number_of_units": "",
    "construction_type": "",
    "deductible": "",
    "limit_dwelling": "",
    "limit_other_structures": "",
    "limit_personal_property": "",
    "limit_fair_rental_value": "",
    "limit_ordinance_or_law": "",
    "limit_debris_removal": "",
    "limit_extended_dwelling_coverage": "",
    "limit_dwelling_replacement_cost": "",
    "limit_inflation_guard": "",
    "limit_personal_property_replacement_cost": "",
    "limit_fences": "",
    "limit_permitted_incidental_occupancy": "",
    "limit_plants_shrubs_trees": "",
    "limit_outdoor_radio_tv_equipment": "",
    "limit_awnings": "",
    "limit_signs": "",
    "limit_actual_cash_value_coverage": "",
    "limit_replacement_cost_coverage": "",
    "limit_building_code_upgrade_coverage": "",
    "cb_fire_lightning_smoke_damage": "",
    "cb_extended_coverages": "",
    "cb_vandalism_malicious_mischief": "",
    "perils_insured_against": "",
    "total_annual_premium": "",
    "broker_name": "",
    "broker_address": "",
    "broker_phone_number": "",
    "mortgagee_1_name": "",
    "mortgagee_1_address": "",
    "mortgagee_1_code": "",
    "mortgagee_2_name": "",
    "mortgagee_2_address": "",
    "mortgagee_2_code": "",
    "mortgagee_1_loan_number": "",
    "mortgagee_2_loan_number": ""
}

============================================
EXTRACTION RULES BY SECTION
============================================

IMPORTANT: The raw text you receive is extracted from a PDF. Columns may be
interleaved and lines may wrap or split mid-word due to OCR. Use the LABELS
below to anchor your extraction — do NOT rely on line position alone.

--------------------------------------------
SECTION 1: INSURED NAME AND MAILING ADDRESS
--------------------------------------------
- Look for the section header "INSURED NAME AND MAILING ADDRESS".
- This section has TWO SIDE-BY-SIDE COLUMNS in the original PDF:
    LEFT COLUMN: Insured name(s) + mailing address
    RIGHT COLUMN: Property location (under separate "PROPERTY LOCATION" header)
- CRITICAL: Because the PDF has two columns, the raw text often INTERLEAVES
  them on the same line. You must mentally separate LEFT vs RIGHT content.
  Example of how the raw text may appear:
    INSURED NAME AND MAILING ADDRESS PROPERTY LOCATION
    TROY HASKELL 42608 CEDAR AVE MAIN HOUSE
    TRACY HASKELL BIG BEAR LAKE, CA 92315
    897 LELAND PL
    EL CAJON, CA 92019
  In this example:
    LEFT column (insured + mailing):
      - TROY HASKELL (insured_name)
      - TRACY HASKELL (secondary_insured_name)
      - 897 LELAND PL, EL CAJON, CA 92019 (mailing_address)
    RIGHT column (property location):
      - 42608 CEDAR AVE MAIN HOUSE, BIG BEAR LAKE, CA 92315

- RULES FOR EXTRACTING:
  1. insured_name: The FIRST person name under the header (left side).
  2. secondary_insured_name: If a SECOND person name appears on the next line
     (before any street address), extract it. Otherwise null.
  3. mailing_address: The street address + city/state/zip that belongs to the
     LEFT column (the insured's mailing address). This is the address that
     appears AFTER the name(s), on the LEFT side.
     Combine into one string with ", " separator.
  4. The mailing address and property location may be THE SAME or DIFFERENT.
     Always extract both independently based on their column position.

--------------------------------------------
SECTION 2: PROPERTY LOCATION
--------------------------------------------
- Look for the label "PROPERTY LOCATION" (appears as a RIGHT column header
  next to "INSURED NAME AND MAILING ADDRESS").
- The property location lines appear in the RIGHT column, which in the raw
  text may be interleaved with the left column content.
- Combine street + city/state/zip into a single string separated by ", ".
- The property location is independent of the mailing address — they may
  be identical or completely different addresses.
- Example:
    property_location="42608 CEDAR AVE MAIN HOUSE, BIG BEAR LAKE, CA 92315"
  while mailing_address="897 LELAND PL, EL CAJON, CA 92019"

--------------------------------------------
SECTION 3: POLICY HEADER
--------------------------------------------
- DATE ISSUED: Value appears to the RIGHT of the label "DATE ISSUED".
  The source format is MM/DD/YYYY. Convert to YYYY-MM-DD for output.
  Example: "DATE ISSUED 10/31/2025" → date_issued="2025-10-31"

- POLICY NUMBER: Value appears to the RIGHT of the label "POLICY NUMBER".
  CRITICAL: The policy number includes a base number AND a trailing 2-digit
  suffix. You MUST include both parts.
  Example: "POLICY NUMBER CFP 0101772837 01" → policy_number="CFP 0101772837 01"
  Example: "POLICY NUMBER CFP 0100024057 05" → policy_number="CFP 0100024057 05"

- POLICY PERIOD: Value appears to the RIGHT of the label "POLICY PERIOD".
  Format is "MM/DD/YYYY To MM/DD/YYYY". Extract both dates and convert
  each to YYYY-MM-DD.
  Example: "POLICY PERIOD 01/12/2026 To 01/12/2027"
    → policy_period_start="2026-01-12", policy_period_end="2027-01-12"

--------------------------------------------
SECTION 4: RATING INFORMATION
--------------------------------------------
- Look for the section header "RATING INFORMATION".
- Below that header is a table row with columns:
    YEAR BUILT | OCCUPANCY | # OF UNITS | CONSTRUCTION TYPE | DEDUCTIBLE
- The VALUES are on the line(s) directly below these column headers.
- IMPORTANT: OCR may split or merge values across lines. Common issues:
    - "SEASONALOW" + "NER" on next line = "SEASONAL OWNER" → occupancy="SEASONAL OWNER"
    - "OW" + "NER" = "OWNER" → occupancy="OWNER"
  Reconstruct the correct word if it is clearly split by OCR.
- year_built: Must be an explicit 4-digit year (e.g., "2005", "1968").
- occupancy: Return the full occupancy text (e.g., "OWNER", "TENANT", "SEASONAL OWNER").
- number_of_units: Numeric value (e.g., "1", "2").
- construction_type: Return exactly as printed (e.g., "FRAME", "MASONRY").
- deductible: Dollar amount exactly as printed (e.g., "$2,500").

--------------------------------------------
SECTION 5: COVERAGES, LIMITS, PERILS AND PREMIUMS
--------------------------------------------
- Look for the section header "COVERAGES, LIMITS, PERILS AND PREMIUMS".

LEFT SIDE — SELECTED COVERAGES AND LIMITS:
- This is a table with columns: checkbox | coverage name | dollar amount or "INCLUDED".
- Extract the LIMIT value (dollar amount or "INCLUDED") for each coverage.
- Map coverages to fields using these label matches:
    "A - Dwelling" or "A – Dwelling"                    → limit_dwelling
    "B - Other Structures" or "B – Other Structures"    → limit_other_structures
    "C - Personal Property" or "C – Personal Property"  → limit_personal_property
    "D - Fair Rental Value" or "D – Fair Rental Value"   → limit_fair_rental_value
    "Ordinance or Law"                                   → limit_ordinance_or_law
    "Debris Removal"                                     → limit_debris_removal
    "Extended Dwelling Coverage"                         → limit_extended_dwelling_coverage
    "Dwelling Replacement Cost"                          → limit_dwelling_replacement_cost
    "Inflation Guard"                                    → limit_inflation_guard
    "Personal Property Replacement Cost"                 → limit_personal_property_replacement_cost
    "Fences"                                             → limit_fences
    "Permitted Incidental Occupancy"                     → limit_permitted_incidental_occupancy
    "Plants, Shrubs and Trees"                           → limit_plants_shrubs_trees
    "Outdoor Radio and TV Equipment"                     → limit_outdoor_radio_tv_equipment
    "Awnings"                                            → limit_awnings
    "Signs"                                              → limit_signs
    "Actual Cash Value Coverage"                         → limit_actual_cash_value_coverage
    "Replacement Cost Coverage"                          → limit_replacement_cost_coverage
    "Building Code Upgrade Coverage"                     → limit_building_code_upgrade_coverage

- Format: Keep dollar amounts with $ and commas exactly as printed.
  Examples: "$ 626,329", "$ 0", "INCLUDED", "$ 5,000"

RIGHT SIDE — PERILS INSURED AGAINST (premium amounts):
- There are 3 perils listed. Each peril has a PREMIUM dollar amount to its right.
- Extract the PREMIUM dollar amount (not a boolean).
    "Fire or Lightning" / "Fire or Lightning, Internal Explosion and Smoke Damage"
      → cb_fire_lightning_smoke_damage (the premium amount, e.g. "$ 876")
    "Extended Coverages" / "Extended Coverage"
      → cb_extended_coverages (the premium amount, e.g. "$ 37")
    "Vandalism or Malicious Mischief"
      → cb_vandalism_malicious_mischief (the premium amount, e.g. "$ 34")
- Format: Keep dollar amounts with $ exactly as printed (e.g. "$ 876").
- If the peril has no premium or is not present, return empty string "".

PERILS INSURED AGAINST — TYPE:
- In the "PERILS INSURED AGAINST" column header or nearby text, look for the type designation.
- Common values: "CFP POLICY", "ISO HO-3", "Basic", "Broad", "Special", "Comprehensive"
- The raw text often shows something like: "PERILS INSURED AGAINST (not all-inclusive) CFP POLICY ISO HO-3"
- Extract the full perils type string. Example: "CFP POLICY ISO HO-3"
- If the section exists but has no specific type, return "Listed" or "Basic" based on context.
- If the section is completely absent, return null.
  → perils_insured_against

RIGHT SIDE — TOTAL ANNUAL PREMIUM:
- Look for the label "Total Annual Premium" in the right-side box.
- Extract the dollar amount to its right.
  Example: "Total Annual Premium $ 1,006" → total_annual_premium="$ 1,006"

--------------------------------------------
SECTION 6: YOUR INSURANCE BROKER
--------------------------------------------
- Look for the label "YOUR INSURANCE BROKER".
- Line 1 after the label: broker_name (e.g., "JOHN ALSOP INS. AGENCY")
- Lines 2-3: broker_address — combine street + city/state/zip with ", ".
  Example: "4701 ARROW HWY, STE. A" + "MONTCLAIR, CA 91763"
    → broker_address="4701 ARROW HWY, STE. A, MONTCLAIR, CA 91763"
- Last line: broker_phone_number — extract ONLY the phone number digits
  and formatting. Do NOT include the text "PHONE NUMBER".
  Example: "PHONE NUMBER (909) 626-5000" → broker_phone_number="(909) 626-5000"

--------------------------------------------
SECTION 7: MORTGAGEE/LOSS PAYEES
--------------------------------------------
- Look for the section header "MORTGAGEE/LOSS PAYEES".
- There are two columns: "1ST MORTGAGEE" and "2ND MORTGAGEE".

For EACH mortgagee (if present):
  - mortgagee_N_name: First line(s) under the column header (the entity name).
    May include suffixes like "ISAOA ATIMA" — include the full name as printed.
  - mortgagee_N_address: The address lines (street + city/state/zip),
    combined with ", ".
  - mortgagee_N_code: The LAST LINE of that mortgagee's block is a numeric code.
    Example: "3000450181"
  - mortgagee_N_loan_number: The loan or reference number associated with the
    mortgagee, often on its own line near the address or code. May be labeled
    "Loan #", "Loan Number", or appear as a standalone numeric string distinct
    from the clause code. If no loan number is present, return null.

- If a mortgagee column is empty or has no data, return null for all 3 fields.
- Example:
    1ST MORTGAGEE                    2ND MORTGAGEE
    NEW AMERICAN FUNDING, LLC.       (empty)
    ISAOA ATIMA
    PO BOX 5071
    Troy, MI 48007
    3000450181
  Result:
    mortgagee_1_name="NEW AMERICAN FUNDING, LLC. ISAOA ATIMA"
    mortgagee_1_address="PO BOX 5071, Troy, MI 48007"
    mortgagee_1_code="3000450181"
    mortgagee_2_name=null
    mortgagee_2_address=null
    mortgagee_2_code=null

============================================
GENERAL RULES
============================================

1. Preserve exact formatting of dollar amounts (keep $ and commas).
2. Convert ALL dates to YYYY-MM-DD format for output.
3. Never infer missing values — return null.
4. If OCR has clearly split a word across lines, reconstruct it
   (e.g., "SEASONALOW" + "NER" = "SEASONAL OWNER").
5. The raw text may have interleaved columns from the PDF layout.
   Always use SECTION HEADERS and FIELD LABELS as anchors.
6. Policy number MUST include the trailing 2-digit suffix.
7. For addresses, combine multi-line addresses with ", " separator.

============================================
NOW PARSE THE TEXT BELOW AND RETURN ONLY VALID JSON:
============================================"""


def _normalize_for_compare(addr: str) -> str:
    """Normalize an address for fuzzy comparison (lowercase, strip punctuation)."""
    import re
    return re.sub(r"[^a-z0-9]", "", addr.lower())


def _is_po_box(addr: str) -> bool:
    """Check if an address is a PO Box (not a valid insured property location)."""
    import re
    return bool(re.search(r"(?i)\bP\.?\s*O\.?\s*BOX\b", addr))


def _is_physical_street_address(addr: str) -> bool:
    """
    Heuristic: does this look like a physical street address?
    Must start with a number and contain a street-type word.
    """
    import re
    if not addr:
        return False
    addr_upper = addr.upper().strip()
    # Must start with a street number
    if not re.match(r"^\d+", addr_upper):
        return False
    # Must contain a common street suffix or directional
    street_words = (
        r"\b(?:ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|LN|LANE|RD|ROAD|"
        r"CT|COURT|CIR|CIRCLE|WAY|PL|PLACE|TRL|TRAIL|TERR?|TERRACE|"
        r"HWY|HIGHWAY|PKWY|PARKWAY|SQ|SQUARE|LOOP|PATH|RUN|PASS)\b"
    )
    return bool(re.search(street_words, addr_upper))


def _fix_swapped_addresses(extracted: dict) -> None:
    """
    Detect and fix known LLM failure modes where property_location is wrong.

    Checks performed (in order):
      1. CFP corporate address used as property → replace with mailing_address
      2. Broker address used as property → swap with mailing_address
      3. PO Box used as property → swap with mailing_address (PO Boxes
         cannot be insured property locations)
      4. Property is missing but mailing_address is a physical street
         → use mailing_address as property_location

    The correct property address is ALWAYS prioritized. If the LLM placed
    the real property address into the wrong field, these checks recover it.
    """
    import re

    # ── Check 1: CFP corporate address mistakenly used as property ──
    _CFP_ADDRESSES = [
        "725sfigueroastreetsuite3900losangelesca90017",
        "725sfigueroastlosangelesca90017",
    ]
    prop_raw = extracted.get("property_location")
    if prop_raw:
        prop_cfp_norm = _normalize_for_compare(prop_raw)
        for cfp_addr in _CFP_ADDRESSES:
            if cfp_addr in prop_cfp_norm or prop_cfp_norm.startswith(cfp_addr[:20]):
                mail = extracted.get("mailing_address")
                if mail and not _is_po_box(mail):
                    logger.warning(
                        "CFP corporate address detected as property_location: '%s' "
                        "— replacing with mailing_address '%s'",
                        prop_raw, mail,
                    )
                    extracted["property_location"] = mail
                else:
                    logger.warning(
                        "CFP corporate address detected as property_location: '%s' "
                        "— clearing (no usable mailing_address)",
                        prop_raw,
                    )
                    extracted["property_location"] = None
                break

    # ── Check 2: Broker address used as property ──
    prop = extracted.get("property_location")
    broker = extracted.get("broker_address")
    mail = extracted.get("mailing_address")

    if prop and broker:
        prop_norm = _normalize_for_compare(prop)
        broker_norm = _normalize_for_compare(broker)

        if prop_norm == broker_norm or (len(prop_norm) > 10 and broker_norm.startswith(prop_norm[:20])):
            if mail and not _is_po_box(mail):
                logger.warning(
                    "Broker address swap detected: property_location '%s' matches "
                    "broker_address '%s' — swapping with mailing_address '%s'",
                    prop, broker, mail,
                )
                extracted["property_location"] = mail
                extracted["mailing_address"] = prop
            else:
                logger.warning(
                    "Broker address swap detected: property_location '%s' matches "
                    "broker_address '%s' — clearing property_location (no usable mailing to swap)",
                    prop, broker,
                )
                extracted["property_location"] = None

    # ── Check 3: PO Box used as property → not a valid insured location ──
    prop = extracted.get("property_location")
    mail = extracted.get("mailing_address")

    if prop and _is_po_box(prop):
        if mail and not _is_po_box(mail) and _is_physical_street_address(mail):
            logger.warning(
                "PO Box detected as property_location: '%s' "
                "— replacing with physical mailing_address '%s'",
                prop, mail,
            )
            extracted["property_location"] = mail
            extracted["mailing_address"] = prop
        else:
            logger.warning(
                "PO Box detected as property_location: '%s' "
                "— clearing (no physical mailing_address to use)",
                prop,
            )
            extracted["property_location"] = None

    # ── Check 4: Property still missing — try to recover from mailing ──
    prop = extracted.get("property_location")
    mail = extracted.get("mailing_address")

    if not prop and mail and not _is_po_box(mail) and _is_physical_street_address(mail):
        logger.info(
            "property_location missing — using mailing_address '%s' as fallback "
            "(it appears to be a physical street address)",
            mail,
        )
        extracted["property_location"] = mail


def _build_user_prompt(raw_text: str) -> str:
    """Build the user prompt with trimmed text."""
    trimmed = raw_text[:MAX_TEXT_CHARS]
    return trimmed


MAX_LLM_RETRIES = 3


def extract_with_llm(raw_text: str) -> dict | None:
    """
    Extract declaration fields from raw text using OpenAI GPT-4o-mini.

    Retries up to MAX_LLM_RETRIES times with exponential backoff on transient
    failures (rate limits, timeouts, API errors). This is critical because the
    regex fallback parser cannot reliably handle interleaved-column PDF layouts
    and will produce garbage data if used.

    Returns a dict:
    {
        "is_fair_plan": bool,
        "extracted_data": dict,
        "missing_fields": list[str],
        "parse_status": str  # "parsed" | "needs_review"
    }

    Returns None if the LLM call fails after all retries.
    """
    import time as _time

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set -- skipping LLM extraction")
        return None

    client = OpenAI(api_key=api_key)
    trimmed_text = raw_text[:MAX_TEXT_CHARS]

    for attempt in range(1, MAX_LLM_RETRIES + 1):
        try:
            logger.info(
                "Sending %d chars to GPT-4o-mini for extraction (attempt %d/%d)",
                len(trimmed_text), attempt, MAX_LLM_RETRIES,
            )

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": trimmed_text},
                ],
                temperature=0.0,
                max_tokens=2000,
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content
            if not content:
                logger.error("LLM returned empty content (attempt %d/%d)", attempt, MAX_LLM_RETRIES)
                if attempt < MAX_LLM_RETRIES:
                    _time.sleep(2 ** attempt)
                    continue
                return None

            extracted: dict[str, Any] = json.loads(content)

            # Normalize: convert empty strings to None (keep booleans as-is)
            for key in extracted:
                if isinstance(extracted[key], str) and (
                    extracted[key] == "" or extracted[key].lower() == "null"
                ):
                    extracted[key] = None

            # ── Post-extraction sanity check: detect swapped addresses ──
            # The LLM sometimes confuses the interleaved PDF columns and swaps
            # property_location ↔ mailing_address. Detect & correct this.
            _fix_swapped_addresses(extracted)

            # Determine if it's a FAIR Plan doc from the text
            upper_text = trimmed_text.upper()
            is_fair_plan = (
                "FAIR PLAN" in upper_text
                or "CALIFORNIA FAIR PLAN" in upper_text
                or "CFP" in (extracted.get("policy_number") or "").upper()
            )

            # Determine missing lifecycle fields
            missing = [f for f in LIFECYCLE_FIELDS if not extracted.get(f)]

            # Determine parse status
            parse_status = "parsed" if not missing else "needs_review"

            logger.info(
                "LLM extraction complete. is_fair_plan=%s, insured=%s, policy=%s, missing=%s",
                is_fair_plan,
                extracted.get("insured_name"),
                extracted.get("policy_number"),
                missing,
            )

            return {
                "is_fair_plan": is_fair_plan,
                "extracted_data": extracted,
                "missing_fields": missing,
                "parse_status": parse_status,
            }

        except json.JSONDecodeError as e:
            logger.error("Failed to parse LLM response as JSON (attempt %d/%d): %s", attempt, MAX_LLM_RETRIES, e)
            if attempt < MAX_LLM_RETRIES:
                _time.sleep(2 ** attempt)
                continue
            return None
        except Exception as e:
            logger.error("LLM extraction failed (attempt %d/%d): %s", attempt, MAX_LLM_RETRIES, e)
            if attempt < MAX_LLM_RETRIES:
                _time.sleep(2 ** attempt)
                continue
            return None

    return None
