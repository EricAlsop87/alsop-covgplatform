"""
Merge CFP Book of Business (DB Export) with CFP Tracker.
=========================================================
- Outer join on Policy Number (keep all rows from both sources)
- Deduplicate tracker: keep most recent/active term per policy number
- Tracker names win for First/Last; Full Named Insured preserved from DB
- Priority Status and Policy Status kept as separate columns
- Tracker brings new data: phones, emails, mortgagee, branch, payment, etc.
"""

import sys, os, re, csv, logging
from datetime import datetime, date
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "worker"))
from openpyxl import load_workbook, Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("merge")

TODAY = date.today()

# ─────────────────────────────────────────────────────────
# 1. Load DB Export
# ─────────────────────────────────────────────────────────

def load_db_export(csv_path: str) -> list[dict]:
    """Load the database export CSV into a list of dicts."""
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    logger.info("Loaded %d rows from DB export", len(rows))
    return rows


# ─────────────────────────────────────────────────────────
# 2. Load & Deduplicate CFP Tracker
# ─────────────────────────────────────────────────────────

TRACKER_HEADER_ROW = 4  # 0-indexed

TRACKER_COLUMNS = [
    "Insert Date", "Subject", "Policy Number", "FIRST NAME", "LAST NAME",
    "File Name and Link", "Mailing Address", "Property Address",
    "Home Phone", "Work Phone", "Mobile Phone", "Other Phone", "Email",
    "VA", "Date Created", "Quote Number", "RCE FROM", "Status",
    "Upload to CCN", "Remarks for RCE", "Branch", "Quote created by:",
    "Quoted In", "Upload Status", "Remarks for DIC",
    "Upload Status to CFP", "VA Name for Documents",
    "File Name and Link Formula", "Date of Call", "Payment Status",
    "Payment Terms", "Remarks on payment", "Payment Date", "Mortgagee",
    "Mortgagee Billed", "Renewal/Effective Date", "Expiration Date",
    "Priority Status", "Notes",
]


def load_tracker(xlsx_path: str) -> list[dict]:
    """Load the CFP Tracker Excel, parse into list of dicts, deduplicate."""
    wb = load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    raw_rows = list(ws.iter_rows(values_only=True))
    wb.close()

    # Parse data rows (skip header + summary rows)
    data_rows = raw_rows[TRACKER_HEADER_ROW + 1:]
    parsed = []
    for row in data_rows:
        if not any(c is not None for c in row):
            continue
        d = {}
        for i, col_name in enumerate(TRACKER_COLUMNS):
            if i < len(row):
                d[col_name] = row[i]
            else:
                d[col_name] = None
        # Skip rows with no policy number
        pn = d.get("Policy Number")
        if pn is None or str(pn).strip() in ("", "None", "-"):
            continue
        d["Policy Number"] = str(pn).strip()
        parsed.append(d)

    logger.info("Loaded %d tracker rows with policy numbers", len(parsed))

    # Deduplicate: keep most recent row per policy number
    # "Most recent" = latest Expiration Date, then latest Renewal/Effective Date
    by_pn: dict[str, list[dict]] = {}
    for d in parsed:
        by_pn.setdefault(d["Policy Number"], []).append(d)

    deduped = []
    dupes_resolved = 0
    for pn, rows in by_pn.items():
        if len(rows) == 1:
            deduped.append(rows[0])
        else:
            dupes_resolved += 1
            # Sort by expiration date descending (most recent first)
            def sort_key(r):
                exp = r.get("Expiration Date")
                if isinstance(exp, datetime):
                    return exp
                return datetime.min
            rows.sort(key=sort_key, reverse=True)
            deduped.append(rows[0])

    logger.info("Deduplicated tracker: %d unique policies (%d duplicates resolved)",
                len(deduped), dupes_resolved)
    return deduped


# ─────────────────────────────────────────────────────────
# 3. Normalize policy numbers for matching
# ─────────────────────────────────────────────────────────

def normalize_pn(pn: str) -> str:
    """Normalize policy number for matching: strip, uppercase, remove extra spaces."""
    return re.sub(r'\s+', ' ', pn.strip().upper())


# ─────────────────────────────────────────────────────────
# 4. Format helpers
# ─────────────────────────────────────────────────────────

def fmt_date(val) -> str:
    if val is None or str(val).strip() in ("", "None"):
        return ""
    if isinstance(val, datetime):
        return val.strftime("%m/%d/%Y")
    if isinstance(val, date):
        return val.strftime("%m/%d/%Y")
    s = str(val).strip()
    # Try parsing YYYY-MM-DD
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").strftime("%m/%d/%Y")
    except (ValueError, TypeError):
        pass
    return s


def safe_str(val) -> str:
    """Convert value to string, handling None and datetime."""
    if val is None:
        return ""
    if isinstance(val, datetime):
        return val.strftime("%m/%d/%Y")
    if isinstance(val, date):
        return val.strftime("%m/%d/%Y")
    if isinstance(val, bool):
        return "Yes" if val else "No"
    if isinstance(val, float):
        if val == int(val):
            return str(int(val))
        return str(val)
    s = str(val).strip()
    if s in ("None", "-"):
        return ""
    return s


def coalesce(*values) -> str:
    """Return the first non-empty string value."""
    for v in values:
        s = safe_str(v)
        if s:
            return s
    return ""


# ─────────────────────────────────────────────────────────
# 5. Master columns definition
# ─────────────────────────────────────────────────────────

MASTER_COLUMNS = [
    # Policy Identification
    ("Policy Number", 22),
    ("Carrier Policy Number", 22),
    ("Carrier Name", 20),
    ("Effective Date", 14),
    ("Expiration Date", 14),
    ("Annual Premium", 16),
    ("Policy Status", 14),
    # Insured
    ("First Name", 16),
    ("Last Name", 18),
    ("Full Named Insured", 35),
    ("Birthdate", 14),
    ("Insured Type", 14),
    # Contact
    ("Home Phone", 16),
    ("Work Phone", 16),
    ("Mobile Phone", 16),
    ("Other Phone", 16),
    ("Email", 28),
    ("Mailing Address", 35),
    # Property
    ("Property Address", 40),
    ("Year Built", 12),
    ("Construction Type", 18),
    # Line of Business
    ("Occupancy", 18),
    ("Number of Units", 14),
    # Coverage Limits
    ("Coverage A (Dwelling)", 22),
    ("Coverage B (Other Structures)", 28),
    ("Coverage C (Personal Property)", 28),
    ("Coverage D (Fair Rental Value)", 28),
    ("Extended Dwelling Coverage", 24),
    ("Ordinance or Law", 18),
    ("Debris Removal", 16),
    ("Inflation Guard", 16),
    # Deductible
    ("Deductible", 14),
    ("Perils Insured Against", 22),
    # DIC
    ("DIC Exists", 12),
    ("DIC Policy Number", 20),
    ("DIC Dwelling Limit", 18),
    ("DIC Personal Property", 20),
    ("DIC Loss of Use", 16),
    ("DIC Deductible", 14),
    ("DIC Premium", 14),
    # E&S
    ("E&S Exists", 12),
    ("E&S Policy Number", 20),
    ("E&S Premium", 14),
    # Sold By
    ("Sold By", 20),
    ("Office", 20),
    # --- Tracker-only columns ---
    ("Quote Number", 18),
    ("RCE Source", 18),
    ("Branch", 40),
    ("Quote Created By", 20),
    ("Quoted In", 14),
    ("Payment Status", 16),
    ("Payment Terms", 20),
    ("Mortgagee", 40),
    ("Mortgagee Billed", 16),
    ("Priority Status", 55),
    ("Notes", 40),
    # Source tracking
    ("Data Source", 16),
]


def build_merged_row(db_row: dict | None, tracker_row: dict | None) -> list[str]:
    """Build a single merged row from DB export and/or tracker data."""
    db = db_row or {}
    tr = tracker_row or {}

    # Determine data source tag
    if db and tr:
        source = "Both"
    elif db:
        source = "DB Only"
    else:
        source = "Tracker Only"

    # Name resolution: tracker wins for First/Last if available
    first = coalesce(tr.get("FIRST NAME"), db.get("First Name"))
    last = coalesce(tr.get("LAST NAME"), db.get("Last Name"))
    full_named = db.get("Full Named Insured", "") or ""

    # If tracker-only row, build a full name from first/last
    if not full_named and (first or last):
        full_named = f"{first} {last}".strip()

    # Property address: coalesce DB then tracker
    prop_addr = coalesce(db.get("Property Address"), tr.get("Property Address"))

    # Mailing address: coalesce DB then tracker
    mail_addr = coalesce(db.get("Mailing Address"), tr.get("Mailing Address"))

    # Phones: tracker is the only source
    home_phone = safe_str(tr.get("Home Phone"))
    work_phone = safe_str(tr.get("Work Phone"))
    mobile_phone = safe_str(tr.get("Mobile Phone"))
    other_phone = safe_str(tr.get("Other Phone"))

    # Email: tracker wins (DB has 0%)
    email = coalesce(tr.get("Email"), db.get("Email"))

    # Dates: DB wins (structured), fallback to tracker
    eff_date = coalesce(db.get("Effective Date"), fmt_date(tr.get("Renewal/Effective Date")))
    exp_date = coalesce(db.get("Expiration Date"), fmt_date(tr.get("Expiration Date")))

    # Mortgagee: coalesce DB then tracker
    mortgagee = coalesce(db.get("Mortgagee (Tracker)") if "Mortgagee (Tracker)" in db else "", tr.get("Mortgagee"))

    # Policy number: prefer DB format, fallback tracker
    policy_num = coalesce(db.get("Policy Number"), tr.get("Policy Number"))

    return [
        # Policy ID
        policy_num,
        db.get("Carrier Policy Number", ""),
        db.get("Carrier Name", ""),
        eff_date,
        exp_date,
        db.get("Annual Premium", ""),
        db.get("Policy Status", ""),
        # Insured
        first,
        last,
        full_named,
        "",  # Birthdate
        db.get("Insured Type", ""),
        # Contact
        home_phone,
        work_phone,
        mobile_phone,
        other_phone,
        email,
        mail_addr,
        # Property
        prop_addr,
        db.get("Year Built", ""),
        db.get("Construction Type", ""),
        # LOB
        db.get("Occupancy", ""),
        db.get("Number of Units", ""),
        # Coverage
        db.get("Coverage A (Dwelling)", ""),
        db.get("Coverage B (Other Structures)", ""),
        db.get("Coverage C (Personal Property)", ""),
        db.get("Coverage D (Fair Rental Value)", ""),
        db.get("Extended Dwelling Coverage", ""),
        db.get("Ordinance or Law", ""),
        db.get("Debris Removal", ""),
        db.get("Inflation Guard", ""),
        # Deductible
        db.get("Deductible", ""),
        db.get("Perils Insured Against", ""),
        # DIC
        db.get("DIC Exists", ""),
        db.get("DIC Policy Number", ""),
        db.get("DIC Dwelling Limit", ""),
        db.get("DIC Personal Property", ""),
        db.get("DIC Loss of Use", ""),
        db.get("DIC Deductible", ""),
        db.get("DIC Premium", ""),
        # E&S
        db.get("E&S Exists", ""),
        db.get("E&S Policy Number", ""),
        db.get("E&S Premium", ""),
        # Sold By
        db.get("Sold By", ""),
        db.get("Office", ""),
        # Tracker-only
        safe_str(tr.get("Quote Number")),
        safe_str(tr.get("RCE FROM")),
        safe_str(tr.get("Branch")),
        safe_str(tr.get("Quote created by:")),
        safe_str(tr.get("Quoted In")),
        safe_str(tr.get("Payment Status")),
        safe_str(tr.get("Payment Terms")),
        safe_str(tr.get("Mortgagee")) if not mortgagee else mortgagee,
        safe_str(tr.get("Mortgagee Billed")),
        safe_str(tr.get("Priority Status")),
        safe_str(tr.get("Notes")),
        # Source
        source,
    ]


# ─────────────────────────────────────────────────────────
# 6. Main merge
# ─────────────────────────────────────────────────────────

def main():
    base_dir = os.path.join(os.path.dirname(__file__), "..")
    exports_dir = os.path.join(base_dir, "exports")

    db_csv = os.path.join(exports_dir, "CFP_Book_of_Business_2026-09-03.csv")
    tracker_xlsx = os.path.join(exports_dir, "CFP Tracker.xlsx")
    date_stamp = TODAY.strftime("%Y-%m-%d")
    out_xlsx = os.path.join(exports_dir, f"CFP_Master_Book_{date_stamp}.xlsx")
    out_csv = os.path.join(exports_dir, f"CFP_Master_Book_{date_stamp}.csv")

    # Load sources
    db_rows = load_db_export(db_csv)
    tracker_rows = load_tracker(tracker_xlsx)

    # Build lookup maps by normalized policy number
    db_by_pn: dict[str, dict] = {}
    for r in db_rows:
        pn = normalize_pn(r.get("Policy Number", ""))
        if pn:
            db_by_pn[pn] = r

    tracker_by_pn: dict[str, dict] = {}
    for r in tracker_rows:
        pn = normalize_pn(r.get("Policy Number", ""))
        if pn:
            tracker_by_pn[pn] = r

    all_pns = sorted(set(list(db_by_pn.keys()) + list(tracker_by_pn.keys())))

    logger.info("Merge: %d DB, %d Tracker, %d unique policy numbers",
                len(db_by_pn), len(tracker_by_pn), len(all_pns))

    # Count overlap
    both = set(db_by_pn.keys()) & set(tracker_by_pn.keys())
    only_db = set(db_by_pn.keys()) - set(tracker_by_pn.keys())
    only_tracker = set(tracker_by_pn.keys()) - set(db_by_pn.keys())
    logger.info("  In both: %d, DB-only: %d, Tracker-only: %d",
                len(both), len(only_db), len(only_tracker))

    # Build merged rows
    merged = []
    for pn in all_pns:
        db_row = db_by_pn.get(pn)
        tr_row = tracker_by_pn.get(pn)
        merged.append(build_merged_row(db_row, tr_row))

    logger.info("Merged: %d total rows", len(merged))

    # ── Write Excel ──────────────────────────────────────
    logger.info("Writing Excel to %s ...", out_xlsx)
    wb = Workbook()
    ws = wb.active
    ws.title = "Master Book"

    headers = [c[0] for c in MASTER_COLUMNS]
    header_font = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin", color="CCCCCC"),
        right=Side(style="thin", color="CCCCCC"),
        top=Side(style="thin", color="CCCCCC"),
        bottom=Side(style="thin", color="CCCCCC"),
    )

    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align
        cell.border = thin_border

    data_font = Font(name="Calibri", size=10)
    alt_fill = PatternFill(start_color="F2F6FC", end_color="F2F6FC", fill_type="solid")

    for row_idx, row_data in enumerate(merged, 2):
        for col_idx, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.font = data_font
            cell.border = thin_border
            if row_idx % 2 == 0:
                cell.fill = alt_fill

    for col_idx, (_, width) in enumerate(MASTER_COLUMNS, 1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(MASTER_COLUMNS))}{len(merged) + 1}"

    wb.save(out_xlsx)
    logger.info("  Excel saved: %d rows", len(merged))

    # ── Write CSV ────────────────────────────────────────
    logger.info("Writing CSV to %s ...", out_csv)
    with open(out_csv, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(merged)
    logger.info("  CSV saved: %d rows", len(merged))

    # ── Verification Summary ─────────────────────────────
    print("\n" + "=" * 70)
    print("  MASTER BOOK MERGE — VERIFICATION SUMMARY")
    print("=" * 70)
    print(f"  Export Date:            {date_stamp}")
    print(f"  Total Merged Rows:      {len(merged)}")
    print(f"    - In both sources:    {len(both)}")
    print(f"    - DB only:            {len(only_db)}")
    print(f"    - Tracker only:       {len(only_tracker)}")
    print()

    # Source distribution
    source_col = len(MASTER_COLUMNS) - 1  # last column
    source_counts = Counter(r[source_col] for r in merged)
    print("  DATA SOURCE DISTRIBUTION:")
    for src, cnt in sorted(source_counts.items(), key=lambda x: -x[1]):
        print(f"    {src:20s} {cnt}")
    print()

    # Field completeness for key fields
    key_fields = [
        "Policy Number", "First Name", "Last Name", "Email",
        "Home Phone", "Mobile Phone", "Property Address",
        "Coverage A (Dwelling)", "Priority Status", "Payment Status",
    ]
    print("  KEY FIELD COMPLETENESS:")
    print(f"  {'Field':32s} {'Filled':>6s} / {len(merged):>5d}  {'%':>6s}")
    print("  " + "-" * 55)
    for field in key_fields:
        col_idx = headers.index(field)
        filled = sum(1 for r in merged if r[col_idx] and str(r[col_idx]).strip())
        pct = (filled / len(merged) * 100) if merged else 0
        print(f"  {field:32s} {filled:6d} / {len(merged):5d}  {pct:5.1f}%")

    # Sample merged rows
    print()
    print("  SAMPLE MERGED ROWS (first 5):")
    for i, row in enumerate(merged[:5]):
        print(f"  Row {i+1}: {row[0]} | {row[7]} {row[8]} | {row[16] or '(no email)'} | {row[source_col]}")

    print()
    print(f"  FILES:")
    print(f"    Excel: {os.path.abspath(out_xlsx)}")
    print(f"    CSV:   {os.path.abspath(out_csv)}")
    print("=" * 70)


if __name__ == "__main__":
    main()
