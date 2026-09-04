"""Build Bamboo CFP List — multi-strategy matching."""
import sys, os, csv, re, logging
from datetime import datetime, date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "worker"))
from openpyxl import load_workbook, Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("bamboo_list")

TODAY = date.today()

def norm_addr(addr):
    if not addr: return ""
    s = str(addr).upper().replace('\n', ' ').replace('\r', ' ')
    s = re.sub(r'[^A-Z0-9 ]', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def safe_str(val):
    if val is None: return ""
    s = str(val).strip()
    if s in ('None', '-', 'nan'): return ""
    return s

def fmt_date(val):
    if isinstance(val, datetime):
        return val.strftime("%m/%d/%Y"), val.month
    if isinstance(val, date):
        return val.strftime("%m/%d/%Y"), val.month
    if val:
        s = str(val).strip()
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%m/%d/%Y"):
            try:
                dt = datetime.strptime(s[:10], fmt[:min(len(fmt), 10)])
                return dt.strftime("%m/%d/%Y"), dt.month
            except:
                pass
    return "", None


def main():
    base_dir = os.path.join(os.path.dirname(__file__), "..")
    exports_dir = os.path.join(base_dir, "exports")

    # ── Load Bamboo ──────────────────────────────────────
    wb_b = load_workbook(os.path.join(exports_dir, "Bamboo Processed - Alsop BOB May 2026 Clean.xlsx"),
                         read_only=True, data_only=True)
    ws_b = wb_b[wb_b.sheetnames[0]]
    raw_b = list(ws_b.iter_rows(values_only=True))
    bamboo_data = [r for r in raw_b[1:] if any(c is not None for c in r)]
    wb_b.close()
    logger.info("Loaded %d Bamboo rows", len(bamboo_data))

    # ── Load DEC PAGES ───────────────────────────────────
    wb_t = load_workbook(os.path.join(exports_dir, "CFP Tracker.xlsx"), read_only=True, data_only=True)
    ws_t = wb_t['DEC PAGES']
    raw_t = list(ws_t.iter_rows(values_only=True))
    dec_headers = [str(h).strip() if h else f'col_{i}' for i, h in enumerate(raw_t[4])]
    dec_data = [r for r in raw_t[5:] if any(c is not None for c in r)]
    wb_t.close()
    logger.info("Loaded %d DEC PAGES rows", len(dec_data))

    pn_idx = dec_headers.index('Policy Number')
    fn_idx = dec_headers.index('FIRST NAME')
    ln_idx = dec_headers.index('LAST NAME')
    prop_idx = dec_headers.index('Property Address')
    hp_idx = dec_headers.index('Home Phone')
    wp_idx = dec_headers.index('Work Phone')
    mp_idx = dec_headers.index('Mobile Phone')
    op_idx = dec_headers.index('Other Phone')
    em_idx = dec_headers.index('Email')
    ren_idx = dec_headers.index('Renewal/Effective Date')
    exp_idx_dec = dec_headers.index('Expiration Date')

    # Build DEC PAGES indices
    dec_by_addr = {}
    dec_by_name_dates = {}
    for row in dec_data:
        # Address index
        raw_addr = safe_str(row[prop_idx] if prop_idx < len(row) else None)
        addr = norm_addr(raw_addr)
        if addr:
            dec_by_addr.setdefault(addr, []).append(row)

        # Name+Dates index (3-char last name + eff + exp)
        ln = safe_str(row[ln_idx] if ln_idx < len(row) else None).upper()[:3]
        eff_s, _ = fmt_date(row[ren_idx] if ren_idx < len(row) else None)
        exp_s, _ = fmt_date(row[exp_idx_dec] if exp_idx_dec < len(row) else None)
        if ln and eff_s and exp_s:
            key = f"{ln}|{eff_s}|{exp_s}"
            dec_by_name_dates.setdefault(key, []).append(row)

    logger.info("DEC PAGES: %d addr keys, %d name+date keys", len(dec_by_addr), len(dec_by_name_dates))

    # ── Load Master Book v3 ──────────────────────────────
    with open(os.path.join(exports_dir, "CFP_Master_Book_v3_2026-09-03.csv"), 'r', encoding='utf-8-sig') as f:
        master_rows = list(csv.DictReader(f))

    master_by_addr = {}
    master_by_name_dates = {}
    for r in master_rows:
        # Address index
        addr = norm_addr(r.get('Property Address', ''))
        if addr:
            master_by_addr.setdefault(addr, []).append(r)

        # Name+Dates index
        ln = r.get('Last Name', '').strip().upper()[:3]
        eff_s = r.get('Effective Date', '').strip()
        exp_s = r.get('Expiration Date', '').strip()
        if ln and eff_s and exp_s:
            key = f"{ln}|{eff_s}|{exp_s}"
            master_by_name_dates.setdefault(key, []).append(r)

    logger.info("Master Book: %d addr keys, %d name+date keys", len(master_by_addr), len(master_by_name_dates))

    # ── Match Bamboo rows (multi-strategy) ───────────────
    output_rows = []
    match_method_counts = {"Address": 0, "Name+Dates": 0, "Both": 0, "No Match": 0}

    for brow in bamboo_data:
        street = safe_str(brow[5])
        city = safe_str(brow[6])
        state = safe_str(brow[7])
        zipcode = safe_str(brow[8])
        lname_3 = safe_str(brow[4]).upper()[:3]
        full_cov = safe_str(brow[31])

        eff_str, eff_month = fmt_date(brow[19])
        exp_str, exp_month = fmt_date(brow[20])
        is_october = "Yes" if (eff_month == 10 or exp_month == 10) else ""

        property_addr = f"{street}, {city}, {state} {zipcode}"

        # Build address variants
        bamboo_full = norm_addr(f"{street} {city} {state} {zipcode}")
        bamboo_street = norm_addr(street)

        # ── Strategy 1: Address matching ──
        addr_matches_dec = []
        addr_matches_master = []

        for d_addr, d_rows in dec_by_addr.items():
            if bamboo_full == d_addr or (bamboo_street and bamboo_street in d_addr):
                addr_matches_dec.extend(d_rows)
        for m_addr, m_rows in master_by_addr.items():
            if bamboo_full == m_addr or (bamboo_street and bamboo_street in m_addr):
                addr_matches_master.extend(m_rows)

        # ── Strategy 2: Name + Dates matching ──
        name_matches_dec = []
        name_matches_master = []

        if lname_3 and eff_str and exp_str:
            name_key = f"{lname_3}|{eff_str}|{exp_str}"

            # DEC PAGES: only use if exactly 1 unique policy number
            if name_key in dec_by_name_dates:
                dec_candidates = dec_by_name_dates[name_key]
                dec_pns = set(safe_str(r[pn_idx]) for r in dec_candidates if safe_str(r[pn_idx]))
                if len(dec_pns) == 1:
                    name_matches_dec.extend(dec_candidates)

            # Master Book: only use if exactly 1 unique policy number
            if name_key in master_by_name_dates:
                master_candidates = master_by_name_dates[name_key]
                master_pns = set(r.get('Policy Number', '') for r in master_candidates if r.get('Policy Number', ''))
                if len(master_pns) == 1:
                    name_matches_master.extend(master_candidates)

        # Combine: address matches first, then name+date matches as fallback
        all_dec = addr_matches_dec + [r for r in name_matches_dec if r not in addr_matches_dec]
        all_master = addr_matches_master + [r for r in name_matches_master if r not in addr_matches_master]

        has_addr = bool(addr_matches_dec or addr_matches_master)
        has_name = bool(name_matches_dec or name_matches_master)

        if has_addr and has_name:
            match_method_counts["Both"] += 1
        elif has_addr:
            match_method_counts["Address"] += 1
        elif has_name:
            match_method_counts["Name+Dates"] += 1
        else:
            match_method_counts["No Match"] += 1

        # Build output
        if all_dec or all_master:
            seen_pns = set()
            all_matches = []

            # DEC PAGES first
            for d in all_dec:
                pn = safe_str(d[pn_idx])
                if pn and pn not in seen_pns:
                    seen_pns.add(pn)
                    fn = safe_str(d[fn_idx])
                    ln = safe_str(d[ln_idx])
                    hp = safe_str(d[hp_idx])
                    wp = safe_str(d[wp_idx])
                    mp = safe_str(d[mp_idx])
                    op = safe_str(d[op_idx])
                    em = safe_str(d[em_idx])
                    phone = hp or mp or wp or op
                    # Determine match method
                    method = "Address" if d in addr_matches_dec else "Name+Dates"
                    all_matches.append({
                        'pn': pn, 'fn': fn, 'ln': ln,
                        'phone': phone, 'email': em,
                        'source': f'DEC PAGES ({method})'
                    })

            # Master Book fallback
            for m in all_master:
                pn = m.get('Policy Number', '')
                if pn and pn not in seen_pns:
                    seen_pns.add(pn)
                    fn = m.get('First Name', '')
                    ln = m.get('Last Name', '')
                    hp = m.get('Home Phone', '')
                    mp = m.get('Mobile Phone', '')
                    wp = m.get('Work Phone', '')
                    em = m.get('Email', '')
                    phone = hp or mp or wp
                    method = "Address" if m in addr_matches_master else "Name+Dates"
                    all_matches.append({
                        'pn': pn, 'fn': fn, 'ln': ln,
                        'phone': phone, 'email': em,
                        'source': f'Master Book ({method})'
                    })

            is_dupe = "Yes" if len(all_matches) > 1 else ""

            # Pick best match: most recent policy number (highest alphanumerically = most recent term)
            if len(all_matches) > 1:
                # Sort by policy number descending — higher suffix = more recent term
                all_matches.sort(key=lambda x: x['pn'], reverse=True)

            best = all_matches[0]
            output_rows.append([
                best['pn'], best['fn'], best['ln'],
                best['email'], best['phone'],
                property_addr, eff_str, exp_str, is_october,
                full_cov, best['source'], is_dupe,
            ])
        else:
            output_rows.append([
                "", "", "", "", "",
                property_addr, eff_str, exp_str, is_october,
                full_cov, "No Match", "",
            ])

    total_matched = match_method_counts["Address"] + match_method_counts["Name+Dates"] + match_method_counts["Both"]
    logger.info("Matching complete: %d matched, %d unmatched", total_matched, match_method_counts["No Match"])

    # ── Write Excel ──────────────────────────────────────
    out_headers = [
        ("Policy Number", 22),
        ("First Name", 16),
        ("Last Name", 18),
        ("Email", 30),
        ("Phone", 18),
        ("Property Address", 45),
        ("Effective Date", 14),
        ("Expiration Date", 14),
        ("October Renewal", 16),
        ("Bamboo Full Coverage", 22),
        ("Match Source", 26),
        ("Duplicate Flag", 14),
    ]

    out_path = os.path.join(exports_dir, "Bamboo CFP List.xlsx")
    wb = Workbook()
    ws = wb.active
    ws.title = "Bamboo CFP List"

    header_font = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin", color="CCCCCC"),
        right=Side(style="thin", color="CCCCCC"),
        top=Side(style="thin", color="CCCCCC"),
        bottom=Side(style="thin", color="CCCCCC"),
    )

    for col_idx, (header, width) in enumerate(out_headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align
        cell.border = thin_border
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    data_font = Font(name="Calibri", size=10)
    alt_fill = PatternFill(start_color="F2F6FC", end_color="F2F6FC", fill_type="solid")
    green_fill = PatternFill(start_color="D4EDDA", end_color="D4EDDA", fill_type="solid")
    red_fill = PatternFill(start_color="F8D7DA", end_color="F8D7DA", fill_type="solid")
    yellow_fill = PatternFill(start_color="FFF3CD", end_color="FFF3CD", fill_type="solid")

    for row_idx, row_data in enumerate(output_rows, 2):
        for col_idx, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.font = data_font
            cell.border = thin_border
            if row_idx % 2 == 0:
                cell.fill = alt_fill

        # Color Bamboo Full Coverage (col 10)
        cov_cell = ws.cell(row=row_idx, column=10)
        if cov_cell.value == "Yes":
            cov_cell.fill = green_fill
        elif cov_cell.value == "No":
            cov_cell.fill = red_fill

        # Color October Renewal (col 9)
        oct_cell = ws.cell(row=row_idx, column=9)
        if oct_cell.value == "Yes":
            oct_cell.fill = yellow_fill

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(out_headers))}{len(output_rows) + 1}"
    wb.save(out_path)

    # ── Summary ──────────────────────────────────────────
    yes_count = sum(1 for r in output_rows if r[9] == "Yes")
    no_count = sum(1 for r in output_rows if r[9] == "No")
    oct_count = sum(1 for r in output_rows if r[8] == "Yes")

    print("\n" + "=" * 60)
    print("  BAMBOO CFP LIST — SUMMARY")
    print("=" * 60)
    print(f"  Total Bamboo Properties:     {len(bamboo_data)}")
    print(f"  Matched to Policy #:         {total_matched}")
    print(f"    via Address only:          {match_method_counts['Address']}")
    print(f"    via Name+Dates only:       {match_method_counts['Name+Dates']}")
    print(f"    via Both strategies:       {match_method_counts['Both']}")
    print(f"  Unmatched (no Policy #):     {match_method_counts['No Match']}")
    print(f"  Output Rows (incl dupes):    {len(output_rows)}")
    print(f"  Bamboo Says Yes:             {yes_count}")
    print(f"  Bamboo Says No:              {no_count}")
    print(f"  October Renewals:            {oct_count}")
    print(f"\n  FILE: {os.path.abspath(out_path)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
