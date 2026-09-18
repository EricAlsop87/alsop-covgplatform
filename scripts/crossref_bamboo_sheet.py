import os
import sys
import csv
import io
import re
from datetime import datetime
sys.stdout.reconfigure(encoding='utf-8')
from dotenv import load_dotenv
load_dotenv('.env') or load_dotenv('../.env.local') or load_dotenv('.env.local')
from supabase import create_client

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
sb = create_client(url, key)

policies_to_bind = [
    {
        'db_policy_number': 'BAM-P-0666',
        'sheet_policy_number': 'CFP 0100954467',
        'sheet_insured_name': 'SUSAN DEARSTINE',
        'sheet_address': '31334 EASY ST, RUNNING SPRINGS, CA 92382',
        'sheet_eff': '10/01/2026',
        'sheet_exp': '10/01/2027',
        'sheet_prem': '1867.00'
    },
    {
        'db_policy_number': 'BAM-P-0798',
        'sheet_policy_number': 'CFP 0102395297',
        'sheet_insured_name': 'MADELYN MADISON',
        'sheet_address': '7004 Elmwood Rd, San Bernardino, CA 92404',
        'sheet_eff': '10/15/2026',
        'sheet_exp': '10/15/2027',
        'sheet_prem': ''
    },
    {
        'db_policy_number': 'BAM-P-0804',
        'sheet_policy_number': 'CFP 0101462802',
        'sheet_insured_name': 'RAVEEN DEOL',
        'sheet_address': '1240 Mountain Springs Rd, Paso Robles, CA 93446',
        'sheet_eff': '10/16/2026',
        'sheet_exp': '10/16/2027',
        'sheet_prem': ''
    },
    {
        'db_policy_number': 'BAM-P-0817',
        'sheet_policy_number': 'CFP 0101374092',
        'sheet_insured_name': 'CAROLYN CARTER',
        'sheet_address': '250 N Mountain Trl, Sierra Madre, CA 91024',
        'sheet_eff': '10/18/2026',
        'sheet_exp': '10/18/2027',
        'sheet_prem': ''
    },
    {
        'db_policy_number': 'BAM-P-1031',
        'sheet_policy_number': 'CFP 0100025346',
        'sheet_insured_name': 'GLENN SUEKIEL',
        'sheet_address': '1105 NAVA AVE UNIT 25 BIG BEAR CITY CA 92314',
        'sheet_eff': '12/15/2025',
        'sheet_exp': '12/15/2026',
        'sheet_prem': '1058.00'
    },
    {
        'db_policy_number': 'BAM-P-1047',
        'sheet_policy_number': 'CFP 0100025545',
        'sheet_insured_name': 'THE JOHNSTONE FAMILY TRUST',
        'sheet_address': '268 Cameo Drive Po Box 378 Lake Arrowhead CA 92352',
        'sheet_eff': '12/15/2024',
        'sheet_exp': '12/15/2025',
        'sheet_prem': '3821.00'
    },
    {
        'db_policy_number': 'BAM-P-1078',
        'sheet_policy_number': 'CFP 0101447435',
        'sheet_insured_name': 'Davion Williams',
        'sheet_address': '215 Tiger Lane , San Jacinto , CA , 92583',
        'sheet_eff': '10/16/2024',
        'sheet_exp': '10/16/2025',
        'sheet_prem': ''
    },
    {
        'db_policy_number': 'BAM-P-0767',
        'sheet_policy_number': 'CFP 0100912591',
        'sheet_insured_name': 'JOHN KHOURI',
        'sheet_address': '9510 MESA RD LUCERNE VALLEY CA92356',
        'sheet_eff': '10/07/2024',
        'sheet_exp': '10/07/2025',
        'sheet_prem': '1723.00'
    },
    {
        'db_policy_number': 'BAM-P-0711',
        'sheet_policy_number': 'CFP 0100820560',
        'sheet_insured_name': 'NICHOLAS SANCHEZ',
        'sheet_address': '10346 HACIENDA ST 1 2 3 4 BELLFLOWER, CA 90706',
        'sheet_eff': '09/22/2026',
        'sheet_exp': '09/22/2027',
        'sheet_prem': '304.00'
    },
    {
        'db_policy_number': 'BAM-P-0971',
        'sheet_policy_number': 'CFP 0100104612',
        'sheet_insured_name': 'MICHAEL RETA',
        'sheet_address': '563 S Gerhart Ave Unit REAR , Los Angeles , CA , 90022',
        'sheet_eff': '12/27/2023',
        'sheet_exp': '12/27/2024',
        'sheet_prem': ''
    },
    {
        'db_policy_number': 'BAM-P-1323',
        'sheet_policy_number': 'CFP 0100057188',
        'sheet_insured_name': 'SUSAN KIM',
        'sheet_address': '57850 JOHNSTON RD , (ANZA AREA) HEMET , CA , 92539',
        'sheet_eff': '12/22/2023',
        'sheet_exp': '12/22/2024',
        'sheet_prem': ''
    },
    {
        'db_policy_number': 'BAM-P-1006',
        'sheet_policy_number': 'CFP 0100021788',
        'sheet_insured_name': 'THE SALEHIBAKHSH FAMILY ESTATE PLAN',
        'sheet_address': '22 DROVER CT TRABUCO CANYON, CA 92679',
        'sheet_eff': '12/12/2025',
        'sheet_exp': '12/12/2026',
        'sheet_prem': '1138.00'
    }
]

from datetime import datetime

def parse_date(d_str):
    if not d_str: return None
    d_str = d_str.strip()
    for fmt in ('%m/%d/%Y', '%m/%d/%y', '%Y-%m-%d'):
        try: return datetime.strptime(d_str, fmt).strftime('%Y-%m-%d')
        except ValueError: pass
    return None

def parse_premium(p_str):
    if not p_str: return None
    cleaned = re.sub(r'[^0-9.]', '', p_str)
    try: return float(cleaned)
    except ValueError: return None

print("="*50)
print(f"STARTING BINDING EXECUTION FOR {len(policies_to_bind)} POLICIES")
print("="*50)

success_count = 0
error_count = 0

for idx, m in enumerate(policies_to_bind, 1):
    try:
        sheet_pol = m['sheet_policy_number']
        sheet_name = m['sheet_insured_name']
        sheet_addr = m['sheet_address']
        eff_date = parse_date(m['sheet_eff'])
        exp_date = parse_date(m['sheet_exp'])
        premium = parse_premium(m['sheet_prem'])

        # 1. Fetch or create root CFP policy
        res_root = sb.table('policies').select('id, client_id, status').eq('policy_number', sheet_pol).execute()
        if res_root.data:
            root_id = res_root.data[0]['id']
            root_client_id = res_root.data[0].get('client_id')
        else:
            new_root = sb.table('policies').insert({
                'policy_number': sheet_pol,
                'status': 'active',
                'carrier_name': 'California FAIR Plan',
                'property_address_raw': sheet_addr
            }).execute()
            root_id = new_root.data[0]['id']
            root_client_id = None

        # 2. Fetch pipeline policy
        res_pipe = sb.table('policies').select('id, client_id').eq('policy_number', m['db_policy_number']).execute()
        if not res_pipe.data:
            print(f"[{idx:02d}] Pipeline policy {m['db_policy_number']} already removed/bound.")
            success_count += 1
            continue
        pipeline_id = res_pipe.data[0]['id']
        pipe_client_id = res_pipe.data[0].get('client_id')

        # 3. Handle Client Record
        target_client_id = root_client_id or pipe_client_id
        if target_client_id:
            sb.table('clients').update({'named_insured': sheet_name}).eq('id', target_client_id).execute()
        else:
            new_client = sb.table('clients').insert({'named_insured': sheet_name}).execute()
            target_client_id = new_client.data[0]['id']

        # 4. Update Root Policy
        sb.table('policies').update({
            'client_id': target_client_id,
            'property_address_raw': sheet_addr,
            'carrier_name': 'California FAIR Plan',
            'status': 'active'
        }).eq('id', root_id).execute()

        # 5. Re-link child records
        sb.table('dec_pages').update({'policy_id': root_id}).eq('policy_id', pipeline_id).execute()
        sb.table('platform_documents').update({'policy_id': root_id, 'client_id': target_client_id}).eq('policy_id', pipeline_id).execute()
        if pipe_client_id and pipe_client_id != target_client_id:
            sb.table('platform_documents').update({'client_id': target_client_id}).eq('client_id', pipe_client_id).execute()

        # 6. Re-link policy_terms
        res_terms = sb.table('policy_terms').select('id').eq('policy_id', root_id).execute()
        if res_terms.data:
            term_id = res_terms.data[0]['id']
            update_payload = {}
            if eff_date: update_payload['effective_date'] = eff_date
            if exp_date: update_payload['expiration_date'] = exp_date
            if premium is not None: update_payload['annual_premium'] = premium
            if update_payload:
                sb.table('policy_terms').update(update_payload).eq('id', term_id).execute()
        else:
            pipe_terms = sb.table('policy_terms').select('id').eq('policy_id', pipeline_id).execute()
            if pipe_terms.data:
                term_id = pipe_terms.data[0]['id']
                update_payload = {'policy_id': root_id}
                if eff_date: update_payload['effective_date'] = eff_date
                if exp_date: update_payload['expiration_date'] = exp_date
                if premium is not None: update_payload['annual_premium'] = premium
                sb.table('policy_terms').update(update_payload).eq('id', term_id).execute()
            elif eff_date and exp_date:
                sb.table('policy_terms').insert({
                    'policy_id': root_id,
                    'effective_date': eff_date,
                    'expiration_date': exp_date,
                    'annual_premium': premium or 0
                }).execute()

        # 7. Delete placeholder pipeline policy
        sb.table('policies').delete().eq('id', pipeline_id).execute()

        if pipe_client_id and pipe_client_id != target_client_id:
            try: sb.table('clients').delete().eq('id', pipe_client_id).execute()
            except: pass

        print(f"[{idx:02d}] SUCCESS: Bound {m['db_policy_number']} -> {sheet_pol} | Insured: {sheet_name}")
        success_count += 1

    except Exception as e:
        print(f"[{idx:02d}] ERROR binding {m['db_policy_number']}: {str(e)}")
        error_count += 1

print("="*50)
print(f"BINDING COMPLETE: {success_count} succeeded, {error_count} failed.")
print("="*50)

# 1. Read Google Sheet CSV
sheet_path = r"C:\Users\phoeb\.gemini\antigravity\brain\48c28ff0-e0a5-4418-a5ef-ae7377b6ac3d\.system_generated\steps\19149\content.md"

with open(sheet_path, "r", encoding="utf-8") as f:
    text = f.read()

csv_part = text.split("---\n\n", 1)[-1]
reader = csv.DictReader(io.StringIO(csv_part))
sheet_rows = list(reader)

def norm_addr(addr):
    if not addr:
        return ""
    cleaned = re.sub(r'[^A-Za-z0-9\s]', ' ', addr).upper()
    parts = cleaned.split()
    return " ".join(parts)

def get_num_street(addr):
    if not addr:
        return ""
    norm = norm_addr(addr)
    parts = norm.split()
    if len(parts) >= 2 and parts[0].isdigit():
        return f"{parts[0]} {parts[1]}"
    return norm[:15]

sheet_by_exact_addr = {}
sheet_by_street_prefix = {}
sheet_valid = []

for row in sheet_rows:
    pol_num = row.get("policy #", "").strip()
    name = row.get("Insured Name", "").strip()
    addr = row.get("Property Address", "").strip()
    eff = row.get("Eff Date", "").strip()
    exp = row.get("Exp Date", "").strip()
    prem = row.get("Premium", "").strip()
    status = row.get("Status", "").strip()
    
    if not pol_num or not pol_num.startswith(("CFP", "COM")):
        continue
        
    n_addr = norm_addr(addr)
# 1. Investigate the screenshot policies
screenshot_addrs = ['31307 EASY', '7004 Elmwood', '1240 Mountain Springs', '250 N Mountain']

print("="*60)
print("INVESTIGATING 4 SCREENSHOT POLICIES")
print("="*60)

for sa in screenshot_addrs:
    print(f"\nSearching for address containing: '{sa}'")
    res = sb.table('policies').select('id, policy_number, status, carrier_name, property_address_raw, client_id, clients(named_insured)').ilike('property_address_raw', f'%{sa}%').execute().data
    for p in res:
        cname = (p.get('clients') or {}).get('named_insured')
        print(f"  Policy: {p['policy_number']} | ID: {p['id']} | Status: {p['status']} | Insured: '{cname}' | Addr: '{p['property_address_raw']}'")
        # Check dec_pages
        decs = sb.table('dec_pages').select('id, policy_number, insured_name, property_location, created_at').eq('policy_id', p['id']).execute().data
        print(f"    -> dec_pages ({len(decs)}):", decs)
        # Check platform_documents
        docs = sb.table('platform_documents').select('id, doc_type, file_name').eq('policy_id', p['id']).execute().data
        print(f"    -> platform_documents ({len(docs)}):", docs)
        
        # Check if address is in Google Sheet
        st_num = re.search(r'^\d+', p['property_address_raw'] or '')
        sheet_hits = []
        if st_num:
            num = st_num.group(0)
            for r in sheet_rows:
                s_addr = r.get('Property Address', '')
                if num in s_addr:
                    sheet_hits.append((r.get('policy #'), r.get('Insured Name'), s_addr))
        print(f"    -> Google Sheet rows containing street number '{st_num.group(0) if st_num else ''}': {len(sheet_hits)}")
        for sh in sheet_hits[:5]:
            print(f"       * Sheet: {sh[0]} | {sh[1]} | {sh[2]}")

# 2. Check ALL pending_dec policies that have dec_pages attached
print("\n" + "="*60)
print("CHECKING ALL PENDING_DEC POLICIES WITH DEC PAGES ATTACHED")
print("="*60)

all_pending_with_decs = sb.table('dec_pages').select('id, policy_id, policy_number, insured_name, policies!inner(id, policy_number, status, property_address_raw, client_id, clients(named_insured))').eq('policies.status', 'pending_dec').execute().data
print(f"Total dec_pages linked to 'pending_dec' policies: {len(all_pending_with_decs)}")

all_pending_with_docs = sb.table('platform_documents').select('id, policy_id, doc_type, file_name, policies!inner(id, policy_number, status, property_address_raw, client_id, clients(named_insured))').eq('doc_type', 'dec_page').eq('policies.status', 'pending_dec').execute().data
print(f"Total platform_documents (dec_page) linked to 'pending_dec' policies: {len(all_pending_with_docs)}")

for item in (all_pending_with_decs + all_pending_with_docs)[:10]:
    pol = item.get('policies') or {}
    cname = (pol.get('clients') or {}).get('named_insured')
    print(f"  Policy {pol.get('policy_number')} | Insured: '{cname}' | Addr: '{pol.get('property_address_raw')}' | Doc/Dec: {item.get('policy_number') or item.get('file_name')}")

# Check all platform_documents on pending_dec policies
docs = sb.table('platform_documents').select('id, policy_id, doc_type, file_name, raw_text, extracted_owner_name, extracted_address, policies!inner(id, policy_number, status, property_address_raw, client_id, clients(named_insured))').eq('policies.status', 'pending_dec').execute().data
print('Total platform_documents attached to pending_dec policies:', len(docs))

found_cfps = []
for d in docs:
    fname = d.get('file_name') or ''
    m = re.search(r'CFP\s*0?(\d{9,10})', fname, re.I)
    pol = d.get('policies') or {}
    cname = (pol.get('clients') or {}).get('named_insured')
    if m:
        raw_num = re.sub(r'[^0-9]', '', m.group(0))
        cfp_num = f"CFP {raw_num}"
        found_cfps.append((pol.get('policy_number'), cname, pol.get('property_address_raw'), cfp_num, fname, d.get('id'), pol.get('id')))
    else:
        print('  Doc without CFP in filename:', pol.get('policy_number'), f"'{cname}'", fname, d.get('doc_type'))

print(f"\nTotal documents containing real CFP numbers in filename: {len(found_cfps)}")
for fc in found_cfps:
    print(f"  DB: {fc[0]} ('{fc[1]}') | Addr: {fc[2]} -> FOUND CFP: {fc[3]} (File: '{fc[4]}')")

# Check high similarity address matches
def norm_words(s):
    return set(re.findall(r'[A-Za-z0-9]+', s.upper()))

def get_st_num(s):
    m = re.search(r'^\d+', s.strip())
    return m.group(0) if m else None

all_pending = []
page = 0
while True:
    res = sb.table('policies').select('id, policy_number, status, carrier_name, property_address_raw, client_id, clients(named_insured)').eq('status', 'pending_dec').range(page*1000, (page+1)*1000 - 1).execute()
    d = res.data or []
    all_pending.extend(d)
    if len(d) < 1000:
        break
    page += 1

fuzzy_matches = []
for p in all_pending:
    p_addr = p.get('property_address_raw') or ''
    p_num = get_st_num(p_addr)
    if not p_num: continue
    p_words = norm_words(p_addr)
    cname = (p.get('clients') or {}).get('named_insured') or ''
    
    for r in sheet_rows:
        pol_num = r.get('policy #', '').strip()
        if not pol_num or not pol_num.startswith(('CFP', 'COM')):
            continue
        s_addr = r.get('Property Address', '')
        s_num = get_st_num(s_addr)
        if s_num == p_num:
            s_words = norm_words(s_addr)
            common = p_words.intersection(s_words)
            if len(common) >= 3:
                s_name = r.get('Insured Name', '').strip()
                fuzzy_matches.append({
                    'db_pol': p['policy_number'],
                    'db_client': cname,
                    'db_addr': p_addr,
                    'sheet_pol': pol_num,
                    'sheet_name': s_name,
                    'sheet_addr': s_addr,
                    'overlap': list(common)
                })

print(f"\nTotal High-Similarity Street Overlap Matches in Sheet: {len(fuzzy_matches)}")
for fm in fuzzy_matches:
    print(f"  DB: {fm['db_pol']} ('{fm['db_client']}') | {fm['db_addr']}")
    print(f"    -> Sheet: {fm['sheet_pol']} | Insured: {fm['sheet_name']} | Addr: {fm['sheet_addr']}\n")


