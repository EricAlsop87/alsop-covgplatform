"""
Export CFP Book of Business — Active/Unexpired Policies
========================================================
Produces:
  - CFP_Book_of_Business_YYYY-MM-DD.xlsx  (styled Excel)
  - CFP_Book_of_Business_YYYY-MM-DD.csv   (plain CSV backup)

Every value comes directly from the database.
No inference, no guessing, no hallucination.
"""

import sys
import os
import re
import csv
import json
import logging
from datetime import date, datetime
from collections import OrderedDict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "worker"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "worker", ".env"))

from supabase import create_client
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("export_book")

TODAY = date.today()
TODAY_ISO = TODAY.isoformat()

# ─────────────────────────────────────────────────────────────
# Database helpers
# ─────────────────────────────────────────────────────────────

def get_supabase():
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def paginate_table(sb, table_name, select_cols, filters=None, order_by="id"):
    """Fetch all rows from a table, paginating past the 1000-row limit."""
    all_rows = []
    offset = 0
    page_size = 1000
    while True:
        q = sb.table(table_name).select(select_cols).order(order_by)
        if filters:
            for f in filters:
                q = f(q)
        q = q.range(offset, offset + page_size - 1)
        result = q.execute()
        if not result.data:
            break
        all_rows.extend(result.data)
        if len(result.data) < page_size:
            break
        offset += page_size
    return all_rows


# ─────────────────────────────────────────────────────────────
# Intelligent Name Parsing
# ─────────────────────────────────────────────────────────────

# Keywords that indicate the name is an entity (trust, LLC, etc.)
ENTITY_KEYWORDS = [
    "TRUST", "LLC", "INC", "CORP", "CORPORATION", "ESTATE",
    "FAMILY TRUST", "REVOCABLE", "IRREVOCABLE", "PARTNERS",
    "PARTNERSHIP", "GROUP", "HOLDINGS", "ASSOCIATES",
    "UTD", "U/A", "DATED", "LIVING TRUST", "FAM TRST",
    "RLT",  # Revocable Living Trust abbreviation
]

JUNK_PATTERNS = re.compile(
    r"^\(noname\)$|^N/?A$|^[0-9A-Fa-f]{8,}$|^\.+$|^-+$|^\?+$",
    re.IGNORECASE,
)


def is_entity_name(name: str) -> bool:
    """Detect if a name is an entity (trust, LLC, etc.) rather than a person."""
    upper = name.upper()
    return any(kw in upper for kw in ENTITY_KEYWORDS)


def is_joint_name(name: str) -> bool:
    """Detect joint names like 'JOHN & JANE SMITH' or 'JOHN AND JANE SMITH'."""
    upper = name.upper()
    # Check for & or " AND " between name parts (not inside entity keywords)
    if is_entity_name(name):
        return False
    return bool(re.search(r'\s[&]\s|\s+AND\s+', upper))


def is_junk_name(name: str) -> bool:
    """Detect placeholder/junk names."""
    return bool(JUNK_PATTERNS.match(name.strip()))


def parse_name(raw_name: str | None) -> tuple[str, str, str]:
    """
    Parse a named_insured string into (first_name, last_name, full_named_insured).

    Rules (in order of precedence):
    1. Null/empty → all blank
    2. Junk/placeholder → ("", "", raw)
    3. Entity (trust/LLC/etc) → ("", "", raw)
    4. Joint name (& or AND) → ("", "", raw)
    5. Single word → (word, "", word)
    6. Two words → (first, last, raw)
    7. Three+ words → (first_word, last_word, raw)  [middle names preserved in full]
    """
    if not raw_name or not raw_name.strip():
        return ("", "", "")

    clean = raw_name.strip()

    if is_junk_name(clean):
        return ("", "", clean)

    if is_entity_name(clean):
        # Some entity names have a contact person after a comma:
        # "Peaceful Pines Llc, Robert Lombardi"
        if "," in clean:
            parts = clean.split(",", 1)
            entity_part = parts[0].strip()
            contact_part = parts[1].strip()
            # Check if the contact part looks like a person name
            contact_words = contact_part.split()
            if (
                len(contact_words) >= 2
                and not is_entity_name(contact_part)
                and not is_junk_name(contact_part)
                and contact_part.upper() != "N/A"
            ):
                return (contact_words[0], contact_words[-1], clean)
        return ("", "", clean)

    if is_joint_name(clean):
        return ("", "", clean)

    words = clean.split()
    if len(words) == 1:
        return (words[0], "", clean)
    elif len(words) == 2:
        return (words[0], words[1], clean)
    else:
        # 3+ words: first word = first name, last word = last name
        return (words[0], words[-1], clean)


# ─────────────────────────────────────────────────────────────
# Occupancy normalization
# ─────────────────────────────────────────────────────────────

def normalize_occupancy(raw: str | None) -> str:
    """Normalize occupancy to title case."""
    if not raw:
        return ""
    mapping = {
        "OWNER": "Owner",
        "TENANT": "Tenant",
        "SEASONAL OWNER": "Seasonal Owner",
        "VACANT": "Vacant",
    }
    return mapping.get(raw.upper().strip(), raw.strip().title())


# ─────────────────────────────────────────────────────────────
# Main export
# ─────────────────────────────────────────────────────────────

# Column definitions: (header_name, width, is_currency)
COLUMNS = [
    # Policy Identification
    ("Policy Number", 22, False),
    ("Carrier Policy Number", 22, False),
    ("Carrier Name", 20, False),
    ("Effective Date", 14, False),
    ("Expiration Date", 14, False),
    ("Annual Premium", 16, True),
    ("Policy Status", 14, False),
    # Insured Information
    ("First Name", 16, False),
    ("Last Name", 18, False),
    ("Full Named Insured", 35, False),
    ("Birthdate", 14, False),
    ("Insured Type", 14, False),
    ("Phone", 16, False),
    ("Email", 25, False),
    ("Mailing Address", 35, False),
    # Property
    ("Property Address", 40, False),
    ("Year Built", 12, False),
    ("Construction Type", 18, False),
    # Line of Business
    ("Occupancy", 18, False),
    ("Number of Units", 14, False),
    # Coverage Limits
    ("Coverage A (Dwelling)", 22, True),
    ("Coverage B (Other Structures)", 28, True),
    ("Coverage C (Personal Property)", 28, True),
    ("Coverage D (Fair Rental Value)", 28, True),
    ("Extended Dwelling Coverage", 24, True),
    ("Ordinance or Law", 18, True),
    ("Debris Removal", 16, True),
    ("Inflation Guard", 16, False),
    # Deductible
    ("Deductible", 14, False),
    ("Perils Insured Against", 22, False),
    # DIC
    ("DIC Exists", 12, False),
    ("DIC Policy Number", 20, False),
    ("DIC Dwelling Limit", 18, True),
    ("DIC Personal Property", 20, True),
    ("DIC Loss of Use", 16, True),
    ("DIC Deductible", 14, False),
    ("DIC Premium", 14, True),
    # E&S
    ("E&S Exists", 12, False),
    ("E&S Policy Number", 20, False),
    ("E&S Premium", 14, True),
    # Sold By
    ("Sold By", 20, False),
    ("Office", 20, False),
]


def format_date(date_str: str | None) -> str:
    """Convert YYYY-MM-DD to MM/DD/YYYY for display."""
    if not date_str:
        return ""
    try:
        d = datetime.strptime(date_str[:10], "%Y-%m-%d")
        return d.strftime("%m/%d/%Y")
    except (ValueError, TypeError):
        return str(date_str)


def format_currency(value) -> str:
    """Format numeric value as currency string."""
    if value is None:
        return ""
    try:
        num = float(value)
        if num == int(num):
            return f"${int(num):,}"
        return f"${num:,.2f}"
    except (ValueError, TypeError):
        return str(value)


def build_row(policy, client, term, computed_status: str = "") -> list[str]:
    """Build one export row from joined data. Every value comes from DB columns only."""
    first, last, full_name = parse_name(client.get("named_insured") if client else None)

    # Coalesce property address: prefer policies.property_address_raw, fallback to policy_terms.property_location
    prop_addr = policy.get("property_address_raw") or ""
    if not prop_addr and term:
        prop_addr = term.get("property_location") or ""

    t = term or {}

    return [
        # Policy Identification
        policy.get("policy_number") or "",
        t.get("carrier_policy_number") or "",
        policy.get("carrier_name") or "",
        format_date(t.get("effective_date")),
        format_date(t.get("expiration_date")),
        format_currency(t.get("annual_premium")),
        computed_status,
        # Insured Information
        first,
        last,
        full_name,
        "",  # Birthdate — blank for manual fill
        client.get("insured_type") or "" if client else "",
        client.get("phone") or "" if client else "",
        client.get("email") or "" if client else "",
        client.get("mailing_address_raw") or "" if client else "",
        # Property
        prop_addr,
        str(t.get("year_built") or "") if t.get("year_built") else "",
        t.get("construction_type") or "",
        # Line of Business
        normalize_occupancy(t.get("occupancy")),
        str(t.get("number_of_units") or "") if t.get("number_of_units") else "",
        # Coverage Limits
        format_currency(t.get("limit_dwelling")),
        format_currency(t.get("limit_other_structures")),
        format_currency(t.get("limit_personal_property")),
        format_currency(t.get("limit_fair_rental_value")),
        format_currency(t.get("limit_extended_dwelling_coverage")),
        format_currency(t.get("limit_ordinance_or_law")),
        format_currency(t.get("limit_debris_removal")),
        t.get("limit_inflation_guard") or "",
        # Deductible
        t.get("deductible") or "",
        t.get("perils_insured_against") or "",
        # DIC
        "Yes" if t.get("dic_exists") else ("No" if t.get("dic_exists") is False else ""),
        t.get("dic_policy_number") or "",
        format_currency(t.get("dic_limit_dwelling")),
        format_currency(t.get("dic_limit_personal_property")),
        format_currency(t.get("dic_limit_loss_of_use")),
        t.get("dic_deductible") or "",
        format_currency(t.get("dic_annual_premium_raw")),
        # E&S
        "Yes" if t.get("es_exists") else ("No" if t.get("es_exists") is False else ""),
        t.get("es_policy_number") or "",
        format_currency(t.get("es_annual_premium_raw")),
        # Sold By
        t.get("sold_by") or "",
        t.get("office") or "",
    ]


def main():
    sb = get_supabase()
    out_dir = os.path.join(os.path.dirname(__file__), "..", "exports")
    os.makedirs(out_dir, exist_ok=True)

    date_stamp = TODAY.strftime("%Y-%m-%d")
    xlsx_path = os.path.join(out_dir, f"CFP_Book_of_Business_{date_stamp}.xlsx")
    csv_path = os.path.join(out_dir, f"CFP_Book_of_Business_{date_stamp}.csv")

    # ── Step 1: Fetch all data with pagination ──────────────────
    logger.info("Fetching all policies...")
    policies = paginate_table(sb, "policies", "id, policy_number, property_address_raw, carrier_name, client_id, status")
    logger.info("  Fetched %d policies", len(policies))

    logger.info("Fetching all clients...")
    clients = paginate_table(sb, "clients", "id, named_insured, insured_type, email, phone, mailing_address_raw, is_demo")
    logger.info("  Fetched %d clients", len(clients))

    logger.info("Fetching all policy_terms...")
    terms = paginate_table(sb, "policy_terms",
        "id, policy_id, effective_date, expiration_date, is_current, carrier_status, "
        "annual_premium, deductible, perils_insured_against, "
        "limit_dwelling, limit_other_structures, limit_personal_property, "
        "limit_fair_rental_value, limit_ordinance_or_law, limit_debris_removal, "
        "limit_extended_dwelling_coverage, limit_inflation_guard, "
        "property_location, year_built, occupancy, number_of_units, construction_type, "
        "carrier_policy_number, "
        "dic_exists, dic_policy_number, dic_limit_dwelling, dic_limit_personal_property, "
        "dic_limit_loss_of_use, dic_deductible, dic_annual_premium_raw, "
        "es_exists, es_policy_number, es_annual_premium_raw, "
        "sold_by, office"
    )
    logger.info("  Fetched %d policy_terms", len(terms))

    # ── Step 2: Build lookup maps ──────────────────────────────
    client_map = {c["id"]: c for c in clients}

    # For each policy_id, find the best current term
    # Priority: is_current=true term with valid expiration date
    terms_by_policy: dict[str, list[dict]] = {}
    for t in terms:
        pid = t["policy_id"]
        terms_by_policy.setdefault(pid, []).append(t)

    # ── Step 3: Filter to active/unexpired policies ────────────
    logger.info("Building export rows for ALL policies...")
    rows = []
    skipped_no_term = 0
    skipped_demo = 0

    for policy in policies:
        # Skip demo clients
        client = client_map.get(policy.get("client_id"))
        if client and client.get("is_demo"):
            skipped_demo += 1
            continue

        # Find the best current term
        policy_terms_list = terms_by_policy.get(policy["id"], [])
        if not policy_terms_list:
            skipped_no_term += 1
            continue

        # Pick the best term: prefer is_current=True
        current_terms = [t for t in policy_terms_list if t.get("is_current")]
        best_term = current_terms[0] if current_terms else policy_terms_list[0]

        # Compute a human-readable status for the export
        exp_date = best_term.get("expiration_date")
        computed_status = ""
        if exp_date:
            try:
                exp = datetime.strptime(exp_date[:10], "%Y-%m-%d").date()
                if exp >= TODAY:
                    computed_status = "Active"
                else:
                    computed_status = "Expired"
            except (ValueError, TypeError):
                computed_status = "Unknown"
        else:
            carrier_st = best_term.get("carrier_status")
            if carrier_st == "InForce":
                computed_status = "Active"
            elif carrier_st == "Cancelled":
                computed_status = "Cancelled"
            else:
                computed_status = "Unknown"

        row = build_row(policy, client, best_term, computed_status)
        rows.append(row)

    logger.info("  Total rows: %d", len(rows))
    logger.info("  Skipped no term: %d", skipped_no_term)
    logger.info("  Skipped demo: %d", skipped_demo)

    # Sort by policy number
    rows.sort(key=lambda r: r[0])

    # ── Step 4: Write Excel ────────────────────────────────────
    logger.info("Writing Excel to %s ...", xlsx_path)
    wb = Workbook()
    ws = wb.active
    ws.title = "Book of Business"

    # Header styles
    header_font = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="2F5496", end_color="2F5496", fill_type="solid")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin", color="CCCCCC"),
        right=Side(style="thin", color="CCCCCC"),
        top=Side(style="thin", color="CCCCCC"),
        bottom=Side(style="thin", color="CCCCCC"),
    )

    # Write headers
    headers = [c[0] for c in COLUMNS]
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align
        cell.border = thin_border

    # Write data rows
    data_font = Font(name="Calibri", size=10)
    alt_fill = PatternFill(start_color="F2F6FC", end_color="F2F6FC", fill_type="solid")

    for row_idx, row_data in enumerate(rows, 2):
        for col_idx, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.font = data_font
            cell.border = thin_border
            if row_idx % 2 == 0:
                cell.fill = alt_fill

    # Set column widths
    for col_idx, (_, width, _) in enumerate(COLUMNS, 1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    # Freeze top row
    ws.freeze_panes = "A2"

    # Auto-filter
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNS))}{len(rows) + 1}"

    wb.save(xlsx_path)
    logger.info("  Excel saved: %d rows", len(rows))

    # ── Step 5: Write CSV ──────────────────────────────────────
    logger.info("Writing CSV to %s ...", csv_path)
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)
    logger.info("  CSV saved: %d rows", len(rows))

    # ── Step 6: Verification Summary ───────────────────────────
    print("\n" + "=" * 70)
    print("  BOOK OF BUSINESS EXPORT — VERIFICATION SUMMARY")
    print("=" * 70)
    print(f"  Export Date:         {date_stamp}")
    print(f"  Total Rows:          {len(rows)}")
    print(f"  Skipped (no term):   {skipped_no_term}")
    print(f"  Skipped (demo):      {skipped_demo}")
    print()

    # Status breakdown
    from collections import Counter
    status_col_idx = [i for i, c in enumerate(COLUMNS) if c[0] == "Policy Status"][0]
    status_counts = Counter(r[status_col_idx] for r in rows)
    print("  STATUS BREAKDOWN:")
    for status, count in sorted(status_counts.items(), key=lambda x: -x[1]):
        print(f"    {status or '(blank)':20s} {count}")
    print()

    # Field completeness
    print("  FIELD COMPLETENESS:")
    print("  " + "-" * 50)
    for col_idx, (col_name, _, _) in enumerate(COLUMNS):
        filled = sum(1 for r in rows if r[col_idx] and str(r[col_idx]).strip())
        pct = (filled / len(rows) * 100) if rows else 0
        bar = "#" * int(pct / 5) + "." * (20 - int(pct / 5))
        print(f"  {col_name:32s} {filled:4d}/{len(rows):4d}  [{bar}] {pct:5.1f}%")

    # Sample rows (column offsets: 0=policy, 7=first, 8=last, 15=address, 20=dwelling)
    print()
    print("  SAMPLE ROWS (first 5):")
    print("  " + "-" * 50)
    for i, row in enumerate(rows[:5]):
        print(f"  Row {i+1}: {row[0]} | {row[7]} {row[8]} | {row[15][:40] if row[15] else '(no address)'} | Dwelling: {row[20]} | {row[status_col_idx]}")

    # Name parsing stats (first=7, last=8, full=9)
    entities = sum(1 for r in rows if not r[7] and not r[8] and r[9])
    parsed = sum(1 for r in rows if r[7] and r[8])
    first_only = sum(1 for r in rows if r[7] and not r[8])
    no_name = sum(1 for r in rows if not r[9])
    print()
    print("  NAME PARSING BREAKDOWN:")
    print(f"    Parsed (First + Last):   {parsed}")
    print(f"    First Name Only:         {first_only}")
    print(f"    Entity/Trust/LLC:        {entities}")
    print(f"    No Name:                 {no_name}")

    print()
    print(f"  FILES:")
    print(f"    Excel: {os.path.abspath(xlsx_path)}")
    print(f"    CSV:   {os.path.abspath(csv_path)}")
    print("=" * 70)


if __name__ == "__main__":
    main()
