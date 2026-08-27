"""
FAIR Plan Declaration Parser — Robust Multi-Strategy Extraction.

Extracts all available fields from FAIR Plan declaration page text using
multiple regex patterns per field with fallback chains.

Fields extracted:
  - insured_name, secondary_insured_name, mailing_address
  - property_location
  - policy_number, policy_period_start, policy_period_end
  - year_built, construction_type, occupancy, number_of_units
  - deductible, total_annual_premium
  - broker_name, broker_address, broker_phone_number
  - Coverage limits (dwelling, personal_property, etc.)
"""

import logging
import re
from datetime import datetime

logger = logging.getLogger("worker.extract.fair_plan")

# ── Required fields for lifecycle ──────────────────────────────────────────

LIFECYCLE_FIELDS = [
    "insured_name",
    "policy_number",
]

ALL_FIELDS = [
    "insured_name",
    "secondary_insured_name",
    "mailing_address",
    "property_location",
    "policy_number",
    "policy_period_start",
    "policy_period_end",
    "year_built",
    "construction_type",
    "occupancy",
    "number_of_units",
    "deductible",
    "total_annual_premium",
    "broker_name",
    "broker_address",
    "broker_phone_number",
]

# ── FAIR Plan detection keywords ───────────────────────────────────────────

FAIR_PLAN_KEYWORDS = [
    "DWELLING INSURANCE POLICY DECLARATIONS",
    "POLICY PERIOD",
    "POLICY NUMBER",
    "CALIFORNIA FAIR PLAN",
    "FAIR PLAN",
    "CFP",
    "DWELLING FIRE",
    "NAMED INSURED",
    "PROPERTY SUBJECT",
]


# ── Helpers ────────────────────────────────────────────────────────────────

def _clean_text(text: str) -> str:
    """Normalize whitespace while preserving newline structure."""
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    # Collapse runs of spaces/tabs (but NOT newlines)
    text = re.sub(r'[ \t]+', ' ', text)
    # Collapse runs of 3+ newlines into 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _parse_date(date_str: str) -> str | None:
    """Attempt multiple date formats → ISO YYYY-MM-DD."""
    if not date_str:
        return None

    date_str = date_str.strip()
    formats = [
        "%m/%d/%Y",   # 12/03/2024
        "%m-%d-%Y",   # 12-03-2024
        "%m/%d/%y",   # 12/03/24
        "%m-%d-%y",   # 12-03-24
        "%B %d, %Y",  # December 03, 2024
        "%b %d, %Y",  # Dec 03, 2024
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _parse_dollar(text: str | None) -> str | None:
    """Extract a dollar amount like '$2,500.00' → '2500.00' (as string)."""
    if not text:
        return None
    m = re.search(r'\$?\s*([\d,]+(?:\.\d{2})?)', text)
    if m:
        return m.group(1).replace(',', '')
    return None


def _parse_phone(text: str | None) -> str | None:
    """Extract a US phone number from text."""
    if not text:
        return None
    m = re.search(r'(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})', text)
    return m.group(1).strip() if m else None


def _first_match(text: str, patterns: list[str], flags: int = re.IGNORECASE) -> re.Match | None:
    """Try each regex pattern in order, return first match or None."""
    for pattern in patterns:
        m = re.search(pattern, text, flags)
        if m:
            return m
    return None


# ── Detection ──────────────────────────────────────────────────────────────

def detect_fair_plan(raw_text: str) -> bool:
    """Score text to detect a FAIR Plan document. Needs ≥ 2 keyword hits."""
    if not raw_text:
        return False
    lower = raw_text.lower()
    score = sum(1 for kw in FAIR_PLAN_KEYWORDS if kw.lower() in lower)
    return score >= 2


# ── Individual field extractors ────────────────────────────────────────────

def _extract_policy_number(text: str) -> str | None:
    """Extract policy number with multiple pattern strategies."""
    patterns = [
        # "POLICY NUMBER: CFP 1234567" or "POLICY NUMBER CFP 1234567"
        r'POLICY\s*(?:NO|NUMBER|#)[:\s]+([A-Z]{2,4}\s*\d{5,})',
        # "CFP 0100024057" standalone
        r'\b(CFP\s*\d{7,})\b',
        # "POLICY NUMBER" followed by alphanumeric on next line
        r'POLICY\s*(?:NO|NUMBER|#)\s*\n\s*([A-Z0-9][\w\s\-]{4,20})',
    ]
    m = _first_match(text, patterns)
    if m:
        val = m.group(1).strip()
        # Normalize: "CFP0100024057" → "CFP 0100024057"
        val = re.sub(r'^(CFP)\s*(\d)', r'\1 \2', val)
        return val
    return None


# Known-bad patterns that the regex parser mistakenly captures as names
# from PDF form metadata, section headers, and interleaved columns.
_BAD_NAME_PATTERNS = [
    r"(?i)^copy\b",                    # "Copy Cfp-R3A (09/2019)" — PDF form name
    r"(?i)^name\s+and\b",              # "Name And" — partial header capture
    r"(?i)cfp-r3a",                     # FAIR Plan form identifier
    r"(?i)^insured\s+name",            # Section header fragment
    r"(?i)^mailing\s+address",         # Section header fragment
    r"(?i)^property\s+location",       # Section header fragment
    r"(?i)^declarations?",             # Document type label
    r"(?i)^dwelling\s+insurance",      # Document type label
    r"(?i)^california\s+fair",         # Carrier name, not insured
    r"\(\d{2}/\d{4}\)",               # Form revision dates like (09/2019)
]


def _looks_like_name(text: str) -> bool:
    """Heuristic: does this text look like a person or company name?"""
    if not text or len(text) < 2:
        return False
    # Too many words for a name (names rarely exceed 6 words)
    words = text.split()
    if len(words) > 8:
        return False
    # Reject known-bad patterns from PDF form metadata
    for pat in _BAD_NAME_PATTERNS:
        if re.search(pat, text):
            return False
    # Reject if it contains legal / policy / exclusion keywords
    reject_keywords = [
        "CRIME", "ELEMENT", "INCREASING", "NECESSARY", "EXCLUSION",
        "LIABILITY", "COVERAGE", "PREMIUM", "DEDUCTIBLE", "POLICY",
        "ENDORSEMENT", "AMENDMENT", "CONDITION", "PROVISION",
        "PURSUANT", "HEREIN", "THEREOF", "WHEREIN", "SHALL",
        "SUBJECT TO", "IN THE EVENT", "APPLICABLE", "ACCORDANCE",
    ]
    upper = text.upper()
    if any(kw in upper for kw in reject_keywords):
        return False
    # Reject if all lowercase (names are typically capitalized)
    if text == text.lower() and not any(c.isupper() for c in text):
        return False
    # Reject if it looks like a sentence (contains common sentence words)
    sentence_words = {"having", "which", "that", "with", "from", "shall", "must", "will", "does"}
    lower_words = {w.lower() for w in words}
    if len(lower_words & sentence_words) >= 2:
        return False
    return True


def _extract_insured_name(text: str) -> tuple[str | None, str | None, str | None]:
    """
    Extract insured name, secondary name, and mailing address.
    Returns (insured_name, secondary_insured_name, mailing_address).
    """
    block_patterns = [
        # Pattern 1: "NAMED INSURED AND MAILING ADDRESS" block
        r'NAMED\s+INSURED\s+AND\s+MAILING\s+ADDRESS[:\s]*\n(.*?)(?:\n\n|PROPERTY|POLICY\s+(?:PERIOD|NUMBER)|COVERAGES|SUBJECT)',
        # Pattern 2: "NAMED INSURED:" followed by text
        r'NAMED\s+INSURED[:\s]+\n?(.*?)(?:\n\n|PROPERTY|POLICY\s+(?:PERIOD|NUMBER)|MAILING|COVERAGES)',
        # Pattern 3: "INSURED:" with text
        r'(?:^|\n)\s*INSURED[:\s]+\n?(.*?)(?:\n\n|PROPERTY|POLICY|MAILING)',
        # Pattern 4: "NAMED INSURED" header then content block
        r'NAMED\s+INSURED.*?\n(.*?)(?:\n\n|\nPROPERTY|\nPOLICY|\nCOVERAGES)',
    ]

    for pattern in block_patterns:
        m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if m:
            block_text = m.group(1).strip()
            lines = [ln.strip() for ln in block_text.split('\n') if ln.strip()]
            if not lines:
                continue

            insured_name = None
            secondary_name = None
            address_lines = []

            for i, line in enumerate(lines):
                # Skip header-like lines
                if re.match(r'^(NAMED|INSURED|AND|MAILING|ADDRESS|SECTION|EXCLUSION|CONDITIONS)', line, re.IGNORECASE):
                    continue
                # Skip lines that look like labels / legal text
                if re.match(r'^(POLICY|PROPERTY|COVERAGE|PREMIUM|DEDUCTIBLE|THIS|THE|ANY|NO|IN\s+THE)', line, re.IGNORECASE):
                    break

                # First non-address line = insured name
                if insured_name is None:
                    # Names typically don't start with a digit
                    if not re.match(r'^\d', line) and _looks_like_name(line):
                        insured_name = line
                    elif re.match(r'^\d', line):
                        # It's an address, name wasn't found in expected position
                        address_lines.append(line)
                    # else: skip (not a name, not an address)
                elif secondary_name is None and not re.match(r'^\d', line) and i < 3:
                    # Second non-numeric line could be a co-insured
                    # Heuristic: if it looks like a name (no numbers, no commas with state)
                    if not re.search(r',\s*[A-Z]{2}\s+\d{5}', line) and _looks_like_name(line):
                        secondary_name = line
                    else:
                        address_lines.append(line)
                else:
                    address_lines.append(line)

            mailing_address = ", ".join(address_lines[:3]) if address_lines else None
            if insured_name:
                return (insured_name, secondary_name, mailing_address)

    return (None, None, None)



def _extract_property_location(text: str) -> str | None:
    """Extract property location / address."""
    patterns = [
        r'PROPERTY\s+SUBJECT\s+TO\s+THIS\s+INSURANCE[:\s]*\n(.*?)(?:\n\n|COVERAGES|COVERAGE|LIMIT|DEDUCTIBLE|PREMIUM)',
        r'PROPERTY\s+(?:ADDRESS|LOCATION)[:\s]*\n?(.*?)(?:\n\n|COVERAGES|LIMIT)',
        r'LOCATION\s+OF\s+PROPERTY[:\s]*\n?(.*?)(?:\n\n|COVERAGES|LIMIT)',
        r'INSURED\s+LOCATION[:\s]*\n?(.*?)(?:\n\n|COVERAGES|LIMIT)',
    ]
    m = _first_match(text, patterns, re.IGNORECASE | re.DOTALL)
    if m:
        lines = [ln.strip() for ln in m.group(1).strip().split('\n') if ln.strip()]
        # Filter out header/label lines
        lines = [ln for ln in lines if not re.match(r'^(COVERAGES|COVERAGE|LIMIT|DEDUCTIBLE|PREMIUM)', ln, re.IGNORECASE)]
        if lines:
            return ", ".join(lines[:2])
    return None


def _extract_policy_period(text: str) -> tuple[str | None, str | None]:
    """Extract policy period start and end dates."""
    patterns = [
        # "POLICY PERIOD: 12/03/2024 to 12/03/2025" or with "FROM ... TO ..."
        r'POLICY\s+PERIOD.*?(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}).*?(?:to|through|–|-)\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})',
        # Two dates near "POLICY PERIOD"
        r'POLICY\s+PERIOD.*?(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}).*?(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})',
        # "FROM 12/03/2024 TO 12/03/2025"
        r'FROM\s+(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s+TO\s+(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})',
        # "EFFECTIVE DATE: ... EXPIRATION DATE: ..."
        r'EFFECTIVE\s+DATE[:\s]*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}).*?EXPIRATION\s+DATE[:\s]*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})',
    ]
    m = _first_match(text, patterns, re.IGNORECASE | re.DOTALL)
    if m:
        return (_parse_date(m.group(1)), _parse_date(m.group(2)))
    return (None, None)


def _extract_simple_field(text: str, patterns: list[str]) -> str | None:
    """Extract a simple value using the first matching pattern group(1)."""
    m = _first_match(text, patterns, re.IGNORECASE)
    if m:
        val = m.group(1).strip()
        return val if val else None
    return None


def _extract_dollar_field(text: str, patterns: list[str]) -> str | None:
    """Extract a dollar amount using the first matching pattern."""
    m = _first_match(text, patterns, re.IGNORECASE)
    if m:
        return _parse_dollar(m.group(1))
    return None


def _extract_broker_info(text: str) -> tuple[str | None, str | None, str | None]:
    """Extract broker name, address, and phone."""
    block_patterns = [
        r'(?:AGENT|BROKER|PRODUCER)\s*(?:NAME|INFO|INFORMATION)?[:\s]*\n(.*?)(?:\n\n|POLICY|NAMED|INSURED|$)',
        r'(?:AGENT|BROKER|PRODUCER)[/\s&]+(?:AGENT|BROKER|PRODUCER)[:\s]*\n(.*?)(?:\n\n|POLICY|NAMED|$)',
    ]
    m = _first_match(text, block_patterns, re.IGNORECASE | re.DOTALL)
    if not m:
        return (None, None, None)

    block = m.group(1).strip()
    lines = [ln.strip() for ln in block.split('\n') if ln.strip()]
    if not lines:
        return (None, None, None)

    name = None
    address_parts = []
    phone = None

    for line in lines:
        p = _parse_phone(line)
        if p:
            phone = p
            continue
        if name is None and not re.match(r'^\d', line):
            name = line
        else:
            address_parts.append(line)

    address = ", ".join(address_parts[:2]) if address_parts else None
    return (name, address, phone)


def _extract_coverage_limits(text: str) -> dict[str, str | None]:
    """Extract coverage limit dollar amounts."""
    limits = {}
    limit_patterns = {
        "limit_dwelling": [
            r'(?:DWELLING|COVERAGE\s*A)[:\s]*\$?([\d,]+(?:\.\d{2})?)',
            r'DWELLING\s+LIMIT[:\s]*\$?([\d,]+)',
        ],
        "limit_personal_property": [
            r'(?:PERSONAL\s+PROPERTY|COVERAGE\s*C)[:\s]*\$?([\d,]+(?:\.\d{2})?)',
        ],
        "limit_other_structures": [
            r'(?:OTHER\s+STRUCTURES|COVERAGE\s*B)[:\s]*\$?([\d,]+(?:\.\d{2})?)',
        ],
        "limit_loss_of_use": [
            r'(?:LOSS\s+OF\s+USE|ADDITIONAL\s+LIVING|COVERAGE\s*D)[:\s]*\$?([\d,]+(?:\.\d{2})?)',
        ],
        "limit_liability": [
            r'(?:LIABILITY|COVERAGE\s*E)[:\s]*\$?([\d,]+(?:\.\d{2})?)',
        ],
        "limit_medical": [
            r'(?:MEDICAL|COVERAGE\s*F)[:\s]*\$?([\d,]+(?:\.\d{2})?)',
        ],
    }
    for key, patterns in limit_patterns.items():
        val = _extract_dollar_field(text, patterns)
        if val:
            limits[key] = val
    return limits


# ── Main parser ────────────────────────────────────────────────────────────

def parse_declaration(raw_text: str) -> dict:
    """
    Parse a FAIR Plan declaration page's text.

    Returns:
    {
        "is_fair_plan": bool,
        "extracted_data": dict,      # all extracted fields
        "missing_fields": list[str], # lifecycle fields that are missing
        "parse_status": str          # "parsed" | "needs_review"
    }
    """
    if not detect_fair_plan(raw_text):
        logger.info("Text does not appear to be a FAIR Plan declaration.")
        return {
            "is_fair_plan": False,
            "extracted_data": {},
            "missing_fields": LIFECYCLE_FIELDS,
            "parse_status": "needs_review",
        }

    cleaned = _clean_text(raw_text)
    extracted: dict[str, str | None] = {}

    # ── Policy Number ──
    extracted["policy_number"] = _extract_policy_number(cleaned)

    # ── Policy Period ──
    start, end = _extract_policy_period(cleaned)
    extracted["policy_period_start"] = start
    extracted["policy_period_end"] = end

    # ── Insured Name + Mailing Address ──
    name, secondary, mailing = _extract_insured_name(cleaned)
    extracted["insured_name"] = name
    extracted["secondary_insured_name"] = secondary
    extracted["mailing_address"] = mailing

    # ── Property Location ──
    extracted["property_location"] = _extract_property_location(cleaned)

    # ── Year Built ──
    extracted["year_built"] = _extract_simple_field(cleaned, [
        r'(?:YEAR|YR)\s*BUILT[:\s]*(\d{4})',
        r'BUILT\s+IN[:\s]*(\d{4})',
        r'YEAR\s*(?:OF\s+)?CONSTRUCTION[:\s]*(\d{4})',
    ])

    # ── Construction Type ──
    extracted["construction_type"] = _extract_simple_field(cleaned, [
        r'CONSTRUCTION\s*(?:TYPE)?[:\s]+([A-Za-z\s/\-]+?)(?:\n|$|YEAR|OCCUPANCY)',
        r'CONST(?:RUCTION)?\s*TYPE[:\s]+([A-Za-z\s/\-]+?)(?:\n|$)',
    ])
    if extracted.get("construction_type"):
        extracted["construction_type"] = str(extracted["construction_type"]).strip().rstrip('.')

    # ── Occupancy ──
    extracted["occupancy"] = _extract_simple_field(cleaned, [
        r'OCCUPANCY[:\s]+([A-Za-z\s/\-]+?)(?:\n|$|CONSTRUCTION|UNITS)',
        r'PROTECTION\s+CLASS[:\s]+([A-Za-z0-9\s]+?)(?:\n|$)',
    ])
    if extracted.get("occupancy"):
        extracted["occupancy"] = str(extracted["occupancy"]).strip().rstrip('.')

    # ── Number of Units ──
    extracted["number_of_units"] = _extract_simple_field(cleaned, [
        r'(?:NO\.?\s*OF\s+)?UNITS[:\s]*(\d+)',
        r'NUMBER\s+OF\s+UNITS[:\s]*(\d+)',
        r'(\d+)\s*UNIT',
    ])

    # ── Deductible ──
    extracted["deductible"] = _extract_dollar_field(cleaned, [
        r'DEDUCTIBLE[:\s]*(\$?\s*[\d,]+(?:\.\d{2})?)',
        r'DED(?:UCTIBLE)?[:\s]*(\$?\s*[\d,]+)',
    ])

    # ── Total Annual Premium ──
    extracted["total_annual_premium"] = _extract_dollar_field(cleaned, [
        r'TOTAL\s+(?:ANNUAL\s+)?PREMIUM[:\s]*(\$?\s*[\d,]+(?:\.\d{2})?)',
        r'ANNUAL\s+PREMIUM[:\s]*(\$?\s*[\d,]+(?:\.\d{2})?)',
        r'TOTAL\s+POLICY\s+PREMIUM[:\s]*(\$?\s*[\d,]+(?:\.\d{2})?)',
        r'PREMIUM\s+AMOUNT[:\s]*(\$?\s*[\d,]+(?:\.\d{2})?)',
    ])

    # ── Broker Info ──
    broker_name, broker_address, broker_phone = _extract_broker_info(cleaned)
    extracted["broker_name"] = broker_name
    extracted["broker_address"] = broker_address
    extracted["broker_phone_number"] = broker_phone

    # ── Coverage Limits ──
    limits = _extract_coverage_limits(cleaned)
    extracted.update(limits)

    # ── Determine status ──
    missing = [f for f in LIFECYCLE_FIELDS if not extracted.get(f)]
    all_missing = [f for f in ALL_FIELDS if not extracted.get(f)]

    status = "parsed" if not missing else "needs_review"

    logger.info(
        "Parsed FAIR Plan fields. Extracted %d/%d total, Lifecycle missing: %s, Status: %s",
        len(ALL_FIELDS) - len(all_missing), len(ALL_FIELDS), missing, status,
    )

    return {
        "is_fair_plan": True,
        "extracted_data": extracted,
        "missing_fields": missing,
        "parse_status": status,
    }
