"""
Merge #2: Integrate CA Fair Plan (Book_v2 + CommBook) into the Master Book.
============================================================================
Takes the current CFP_Master_Book CSV and merges in CA Fair Plan data.

Rules (user-approved):
 - Policy Active overrides computed Policy Status
 - Book_v2 Paid overrides Payment Status; else keep existing
 - CommBook enriches Reason/Activity where Book_v2 is blank
 - Sold By / Office / DIC: coalesce (master first, then Fair Plan)
 - CFP Status Notes: separate column
 - Line of Business: separate from Occupancy
 - Autopay, Payment Plan, Cancellation Reason, DIC Notes: new columns
"""

import sys, os, re, csv, logging
from datetime import datetime, date
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "worker"))
from openpyxl import load_workbook, Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("merge2")

TODAY = date.today()


def normalize_pn(pn: str) -> str:
    return re.sub(r'\s+', ' ', pn.strip().upper())


def safe_str(val) -> str:
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
    for v in values:
        s = v if isinstance(v, str) else safe_str(v)
        if s and s.strip():
            return s.strip()
    return ""


# ─────────────────────────────────────────────────────────
# Load sources
# ─────────────────────────────────────────────────────────

def load_master_csv(path: str) -> tuple[list[str], list[dict]]:
    """Load master CSV, return (headers, list of dicts)."""
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        rows = list(reader)
    logger.info("Loaded %d master rows (%d columns)", len(rows), len(headers))
    return headers, rows


def load_fair_plan(xlsx_path: str) -> tuple[list[dict], dict[str, dict]]:
    """Load Book_v2 and CommBook. Return (book_v2_rows, commbook_latest_by_pn)."""
    wb = load_workbook(xlsx_path, read_only=True, data_only=True)

    # --- Book_v2 ---
    ws = wb['Book_v2']
    raw = list(ws.iter_rows(values_only=True))
    headers = [str(h).strip() if h else f'col_{i}' for i, h in enumerate(raw[0])]
    data = [r for r in raw[1:] if any(c is not None for c in r)]

    book_rows = []
    for row in data:
        d = {}
        for i, h in enumerate(headers):
            d[h] = row[i] if i < len(row) else None
        pn = d.get('policy #')
        if pn and str(pn).strip() not in ('', 'None'):
            d['policy #'] = str(pn).strip()
            book_rows.append(d)

    logger.info("Loaded %d Book_v2 rows with policy #", len(book_rows))

    # Deduplicate Book_v2: keep latest by Exp Date
    by_pn: dict[str, list[dict]] = {}
    for d in book_rows:
        by_pn.setdefault(d['policy #'], []).append(d)

    deduped = []
    dupes = 0
    for pn, rows in by_pn.items():
        if len(rows) == 1:
            deduped.append(rows[0])
        else:
            dupes += 1
            def sort_key(r):
                exp = r.get('Exp Date')
                if isinstance(exp, datetime):
                    return exp
                return datetime.min
            rows.sort(key=sort_key, reverse=True)
            deduped.append(rows[0])

    logger.info("Deduplicated Book_v2: %d unique (%d dupes resolved)", len(deduped), dupes)

    # --- CommBook ---
    ws_comm = wb['CommBook']
    comm_raw = list(ws_comm.iter_rows(values_only=True))
    comm_headers = [str(h).strip() if h else '' for h in comm_raw[0]]
    comm_data = comm_raw[1:]

    pn_idx = comm_headers.index('Policy No')
    reason_idx = comm_headers.index('Reason')
    activity_idx = comm_headers.index('Activity')
    stmt_idx = comm_headers.index('StatementMonth')

    latest_comm: dict[str, dict] = {}
    for row in comm_data:
        if not row[pn_idx]:
            continue
        pn = normalize_pn(str(row[pn_idx]).strip())
        stmt = row[stmt_idx]
        if isinstance(stmt, datetime):
            if pn not in latest_comm or stmt > latest_comm[pn]['date']:
                latest_comm[pn] = {
                    'date': stmt,
                    'reason': safe_str(row[reason_idx]),
                    'activity': safe_str(row[activity_idx]),
                }

    logger.info("CommBook: %d unique policies with latest reason/activity", len(latest_comm))

    wb.close()
    return deduped, latest_comm


# ─────────────────────────────────────────────────────────
# Master columns — final schema after all 3 merges
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
    # Line of Business / Occupancy
    ("Line of Business", 20),
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
    ("DIC Notes", 30),
    # E&S
    ("E&S Exists", 12),
    ("E&S Policy Number", 20),
    ("E&S Premium", 14),
    # Sold By / Office
    ("Sold By", 20),
    ("Office", 20),
    # Tracker columns
    ("Quote Number", 18),
    ("RCE Source", 18),
    ("Branch", 40),
    ("Quote Created By", 20),
    ("Quoted In", 14),
    # Payment
    ("Payment Status", 20),
    ("Autopay", 12),
    ("Payment Plan", 14),
    ("Payment Terms", 20),
    # Policy lifecycle
    ("Cancellation Reason", 22),
    ("CFP Status Notes", 40),
    ("Reason", 10),
    ("Activity", 10),
    # Mortgagee
    ("Mortgagee", 40),
    ("Mortgagee Billed", 16),
    # Workflow
    ("Priority Status", 55),
    ("Notes", 40),
    # Source tracking
    ("Data Source", 22),
]


def build_final_row(master_row: dict | None, fair_row: dict | None,
                    comm: dict | None) -> list[str]:
    """Build a single row from master + CA Fair Plan + CommBook."""
    m = master_row or {}
    f = fair_row or {}

    # --- Data source tag ---
    sources = []
    if m.get("Data Source", ""):
        sources.append(m["Data Source"])
    if f:
        sources.append("CA Fair Plan")
    source = " + ".join(sources) if sources else "Unknown"

    # --- Policy Status: Fair Plan 'Policy Active' overrides ---
    policy_status = m.get("Policy Status", "")
    fair_active = safe_str(f.get("Policy Active"))
    if fair_active:
        policy_status = fair_active

    # --- Premium: coalesce master then fair plan ---
    premium = coalesce(m.get("Annual Premium", ""), safe_str(f.get("Column 7")))
    # Format as currency if it's a number
    if premium and not premium.startswith("$"):
        try:
            num = float(premium.replace(",", ""))
            premium = f"${int(num):,}" if num == int(num) else f"${num:,.2f}"
        except (ValueError, TypeError):
            pass

    # --- Payment Status: Fair Plan Paid overrides, else keep tracker ---
    fair_paid = safe_str(f.get("Paid"))
    payment_status = coalesce(fair_paid, m.get("Payment Status", ""))

    # --- Sold By / Office: coalesce master then fair plan ---
    sold_by = coalesce(m.get("Sold By", ""), safe_str(f.get("sold by")))
    office = coalesce(m.get("Office", ""), safe_str(f.get("Office")))

    # --- DIC: coalesce master then fair plan ---
    dic_exists = m.get("DIC Exists", "")
    fair_dic = safe_str(f.get("DIC"))
    if not dic_exists and fair_dic:
        dic_exists = fair_dic

    # --- DIC Notes: new from fair plan ---
    dic_notes = safe_str(f.get("DIC Notes"))

    # --- Line of Business: new from fair plan ---
    line = safe_str(f.get("Line"))

    # --- Carrier Status from fair plan (col 6) ---
    fair_carrier_status = safe_str(f.get("Status"))

    # --- Reason / Activity: from fair plan, enriched by CommBook where blank ---
    reason = safe_str(f.get("Reason"))
    activity = safe_str(f.get("Activity"))
    if comm:
        if not reason and comm.get("reason"):
            reason = comm["reason"]
        if not activity and comm.get("activity"):
            activity = comm["activity"]

    # --- CFP Status Notes: col 14 from fair plan (separate from Notes) ---
    # Handle duplicate 'Status' column name — it's col 14 in Book_v2
    cfp_status_notes = ""
    # The second 'Status' column is stored with trailing space: 'Status '
    # In our dict it would be 'Status' (the second one overwrites the first)
    # We need to handle this carefully — it was col 14 in the Excel
    # Since both cols are named 'Status', the dict will only have the last one
    # We stored it with exact header names, so 'Status ' (with space) for col 14
    if 'Status ' in f:
        cfp_status_notes = safe_str(f.get('Status '))
    elif 'Status' in f and fair_carrier_status:
        # If we only got one Status, check if it looks like notes
        s = safe_str(f.get('Status'))
        if s and s not in ('InForce', 'Cancelled'):
            cfp_status_notes = s

    # --- Autopay, Payment Plan, Cancellation Reason ---
    autopay = safe_str(f.get("Autopay"))
    payment_plan = safe_str(f.get("payment plan"))
    cancel_reason = safe_str(f.get("Cancellation Reason"))

    # Policy Number
    policy_num = coalesce(m.get("Policy Number", ""), safe_str(f.get("policy #")))

    return [
        # Policy ID
        policy_num,
        m.get("Carrier Policy Number", ""),
        m.get("Carrier Name", ""),
        coalesce(m.get("Effective Date", ""), safe_str(f.get("Eff Date"))),
        coalesce(m.get("Expiration Date", ""), safe_str(f.get("Exp Date"))),
        premium,
        policy_status,
        # Insured
        m.get("First Name", ""),
        m.get("Last Name", ""),
        coalesce(m.get("Full Named Insured", ""), safe_str(f.get("Insured Name"))),
        "",  # Birthdate
        m.get("Insured Type", ""),
        # Contact
        m.get("Home Phone", ""),
        m.get("Work Phone", ""),
        m.get("Mobile Phone", ""),
        m.get("Other Phone", ""),
        m.get("Email", ""),
        m.get("Mailing Address", ""),
        # Property
        coalesce(m.get("Property Address", ""), safe_str(f.get("Property Address"))),
        m.get("Year Built", ""),
        m.get("Construction Type", ""),
        # Line of Business / Occupancy
        line,
        m.get("Occupancy", ""),
        m.get("Number of Units", ""),
        # Coverage Limits
        m.get("Coverage A (Dwelling)", ""),
        m.get("Coverage B (Other Structures)", ""),
        m.get("Coverage C (Personal Property)", ""),
        m.get("Coverage D (Fair Rental Value)", ""),
        m.get("Extended Dwelling Coverage", ""),
        m.get("Ordinance or Law", ""),
        m.get("Debris Removal", ""),
        m.get("Inflation Guard", ""),
        # Deductible
        m.get("Deductible", ""),
        m.get("Perils Insured Against", ""),
        # DIC
        dic_exists,
        m.get("DIC Policy Number", ""),
        m.get("DIC Dwelling Limit", ""),
        m.get("DIC Personal Property", ""),
        m.get("DIC Loss of Use", ""),
        m.get("DIC Deductible", ""),
        m.get("DIC Premium", ""),
        dic_notes,
        # E&S
        m.get("E&S Exists", ""),
        m.get("E&S Policy Number", ""),
        m.get("E&S Premium", ""),
        # Sold By / Office
        sold_by,
        office,
        # Tracker
        m.get("Quote Number", ""),
        m.get("RCE Source", ""),
        m.get("Branch", ""),
        m.get("Quote Created By", ""),
        m.get("Quoted In", ""),
        # Payment
        payment_status,
        autopay,
        payment_plan,
        m.get("Payment Terms", ""),
        # Policy lifecycle
        cancel_reason,
        cfp_status_notes,
        reason,
        activity,
        # Mortgagee
        m.get("Mortgagee", ""),
        m.get("Mortgagee Billed", ""),
        # Workflow
        m.get("Priority Status", ""),
        m.get("Notes", ""),
        # Source
        source,
    ]


def main():
    base_dir = os.path.join(os.path.dirname(__file__), "..")
    exports_dir = os.path.join(base_dir, "exports")

    master_csv = os.path.join(exports_dir, "CFP_Master_Book_2026-09-03.csv")
    fair_xlsx = os.path.join(exports_dir, "CA Fair Plan.xlsx")
    date_stamp = TODAY.strftime("%Y-%m-%d")
    out_xlsx = os.path.join(exports_dir, f"CFP_Master_Book_v2_{date_stamp}.xlsx")
    out_csv = os.path.join(exports_dir, f"CFP_Master_Book_v2_{date_stamp}.csv")

    # Load
    master_headers, master_rows = load_master_csv(master_csv)
    fair_rows, comm_latest = load_fair_plan(fair_xlsx)

    # Build lookup maps
    master_by_pn = {}
    for r in master_rows:
        pn = normalize_pn(r.get("Policy Number", ""))
        if pn:
            master_by_pn[pn] = r

    fair_by_pn = {}
    for r in fair_rows:
        pn = normalize_pn(r.get("policy #", ""))
        if pn:
            fair_by_pn[pn] = r

    all_pns = sorted(set(list(master_by_pn.keys()) + list(fair_by_pn.keys())))

    both = set(master_by_pn.keys()) & set(fair_by_pn.keys())
    only_master = set(master_by_pn.keys()) - set(fair_by_pn.keys())
    only_fair = set(fair_by_pn.keys()) - set(master_by_pn.keys())

    logger.info("Merge: %d master, %d fair plan, %d total unique PNs",
                len(master_by_pn), len(fair_by_pn), len(all_pns))
    logger.info("  In both: %d, Master-only: %d, Fair-only: %d",
                len(both), len(only_master), len(only_fair))

    # Build merged rows
    merged = []
    for pn in all_pns:
        m_row = master_by_pn.get(pn)
        f_row = fair_by_pn.get(pn)
        c_data = comm_latest.get(pn)
        merged.append(build_final_row(m_row, f_row, c_data))

    logger.info("Final merged: %d rows", len(merged))

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
    print("  MASTER BOOK v2 — VERIFICATION SUMMARY")
    print("=" * 70)
    print(f"  Export Date:              {date_stamp}")
    print(f"  Total Merged Rows:        {len(merged)}")
    print(f"    In both (master+fair):  {len(both)}")
    print(f"    Master only:            {len(only_master)}")
    print(f"    CA Fair Plan only:      {len(only_fair)}")
    print()

    # Source distribution
    source_col = len(MASTER_COLUMNS) - 1
    source_counts = Counter(r[source_col] for r in merged)
    print("  DATA SOURCE DISTRIBUTION:")
    for src, cnt in sorted(source_counts.items(), key=lambda x: -x[1]):
        print(f"    {src:35s} {cnt}")
    print()

    # Policy Status
    status_col = headers.index("Policy Status")
    status_counts = Counter(r[status_col] for r in merged if r[status_col])
    print("  POLICY STATUS (after Fair Plan override):")
    for s, c in sorted(status_counts.items(), key=lambda x: -x[1]):
        print(f"    {s:20s} {c}")
    print()

    # Key field completeness
    key_fields = [
        "Policy Number", "First Name", "Last Name", "Email",
        "Property Address", "Line of Business", "Coverage A (Dwelling)",
        "Payment Status", "Sold By", "Office", "DIC Exists",
        "Priority Status", "Reason", "Activity",
    ]
    print("  KEY FIELD COMPLETENESS:")
    print(f"  {'Field':32s} {'Filled':>6s} / {len(merged):>5d}  {'%':>6s}")
    print("  " + "-" * 55)
    for field in key_fields:
        col_idx = headers.index(field)
        filled = sum(1 for r in merged if r[col_idx] and str(r[col_idx]).strip())
        pct = (filled / len(merged) * 100) if merged else 0
        print(f"  {field:32s} {filled:6d} / {len(merged):5d}  {pct:5.1f}%")

    print()
    print(f"  FILES:")
    print(f"    Excel: {os.path.abspath(out_xlsx)}")
    print(f"    CSV:   {os.path.abspath(out_csv)}")
    print("=" * 70)


if __name__ == "__main__":
    main()
