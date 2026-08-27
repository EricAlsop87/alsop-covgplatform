import re
from typing import Dict, Optional

def normalize_policy_number(raw_policy: Optional[str]) -> Dict[str, Optional[str]]:
    """
    Parses a raw policy string into its canonical Base Policy and Sequence Suffix
    according to the Global Policy Invariant (treat all term suffixes as the same base).
    
    Input: "CFP 0102162693 01"
    Output: { "base_policy": "CFP 0102162693", "suffix": "01" }

    Input: "0102162693"
    Output: { "base_policy": "CFP 0102162693", "suffix": None }
    """
    if not raw_policy:
        return {"base_policy": None, "suffix": None}

    s = raw_policy.upper().strip()
    # Remove all non-alphanumeric except spaces
    s = re.sub(r'[^A-Z0-9\s]', '', s)
    
    # Strategy: Optional "CFP ", exactly 10 digits, optional spaces, optional 2 digits of suffix.
    m = re.search(r'(?:CFP\s*)?(\d{10})(?:\s*(\d{2}))?\b', s)
    if m:
        base_digits = m.group(1)
        suffix = m.group(2) if m.group(2) else None
        return {"base_policy": f"CFP {base_digits}", "suffix": suffix}

    # Fallback for non-standard or legacy policy strings that don't match 10-digit requirement
    # We collapse multiple spaces into one.
    return {"base_policy": " ".join(s.split()), "suffix": None}
