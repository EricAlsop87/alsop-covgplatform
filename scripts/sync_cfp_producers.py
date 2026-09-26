import os, re, csv, urllib.request, time
from supabase import create_client

url = 'https://hbbkxlvbyqffikzmsdht.supabase.co'
key = ''

with open('.env.local') as f:
    for line in f:
        line = line.strip()
        if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
            url = line.split('=', 1)[1].strip('"\'')
        if line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
            key = line.split('=', 1)[1].strip('"\'')

supabase = create_client(url, key)

SHEET_URL = 'https://docs.google.com/spreadsheets/d/15_I-XqW9dkmv1wUIeTsHIDZx9_fBrDgsotKuJvjl3S8/export?format=csv&gid=1681627194'

def normalize_pn(pn: str) -> str:
    if not pn: return ''
    s = re.sub(r'(?i)^CFP\s*', '', str(pn).strip())
    s = re.sub(r'[^a-zA-Z0-9]', '', s).upper()
    return s

def to_title_case(name: str) -> str:
    if not name: return ''
    words = name.strip().split()
    def cap_word(w):
        return '-'.join(p.capitalize() for p in w.split('-'))
    return ' '.join(cap_word(w) for w in words)

print('Fetching Google Sheet CSV...')
req = urllib.request.Request(SHEET_URL, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    content = resp.read().decode('utf-8', errors='ignore')

reader = csv.DictReader(content.splitlines())
sheet_records = list(reader)
print(f'Loaded {len(sheet_records)} rows from Google Sheet.')

sheet_map = {}
for r in sheet_records:
    raw_pn = r.get('POLICY NUMBER', '')
    norm = normalize_pn(raw_pn)
    prod = to_title_case((r.get('PRODUCER NAME') or '').strip())
    email = (r.get('PRODUCER EMAIL ADDRESS') or '').strip()
    agency = (r.get('AGENCY NAME') or '').strip()
    
    if norm and prod:
        sheet_map[norm] = {
            'policy_number': raw_pn,
            'producer_name': prod,
            'producer_email': email,
            'agency_name': agency,
        }

print(f'Unique policies in sheet: {len(sheet_map)}')

print('Querying policies and policy_terms...')
all_policies = []
page_size = 1000
offset = 0

while True:
    res = supabase.table('policies').select('id, policy_number').range(offset, offset + page_size - 1).execute()
    data = res.data or []
    all_policies.extend(data)
    if len(data) < page_size:
        break
    offset += page_size

print(f'Total DB policies: {len(all_policies)}')

# Group policy IDs that need updating
matched_updates = []
for p in all_policies:
    norm = normalize_pn(p.get('policy_number', ''))
    if norm in sheet_map:
        prod_info = sheet_map[norm]
        matched_updates.append((p['id'], prod_info['producer_name']))

print(f'Total policies to update in database: {len(matched_updates)}')

# Update policy_terms in batches
updated_count = 0
chunk_size = 50
for i in range(0, len(matched_updates), chunk_size):
    chunk = matched_updates[i:i + chunk_size]
    for pid, prod_name in chunk:
        try:
            supabase.table('policy_terms').update({'sold_by': prod_name}).eq('policy_id', pid).execute()
            updated_count += 1
        except Exception as e:
            print(f'Error updating policy {pid}: {e}')
    
    if (i + chunk_size) % 250 == 0 or (i + chunk_size) >= len(matched_updates):
        print(f'Progress: {min(i + chunk_size, len(matched_updates))}/{len(matched_updates)} policies updated...')

print(f'\nDone! Successfully updated {updated_count} policies with Producer Name.')
