import os, sys
from dotenv import load_dotenv
load_dotenv('C:/Projects/Coverage Check/worker/.env')
sys.path.insert(0, 'C:/Projects/Coverage Check/worker')
from src.supabase_client import get_supabase
sb = get_supabase()

docs = sb.table('platform_documents').select('id, doc_type, policy_id, file_name').not_.is_('policy_id', 'null').in_('doc_type', ['rce', 'dic_dec_page']).execute()
dic_data = sb.table('doc_data_dic').select('document_id, carrier_name').execute()
dic_map = {d['document_id']: d.get('carrier_name') for d in dic_data.data}
rce_data = sb.table('doc_data_rce').select('document_id, source').execute()
rce_map = {r['document_id']: r.get('source') for r in rce_data.data}

pol_dic = {}
pol_rce = {}
for d in docs.data:
    p_id = d['policy_id']
    if d['doc_type'] == 'dic_dec_page':
        pol_dic[p_id] = dic_map.get(d['id']) or 'Bamboo'
    elif d['doc_type'] == 'rce':
        pol_rce[p_id] = rce_map.get(d['id']) or ('rce_american_modern' if 'american modern' in (d.get('file_name') or '').lower() else 'rce_360value')

policies = sb.table('policies').select('id, policy_number, clients(named_insured)').execute()
print(f'Total policies: {len(policies.data)}')
for p in policies.data:
    client = p.get('clients') or {}
    name = client.get('named_insured', '')
    if any(k in name.upper() for k in ['HALL', 'SAMA', 'TORRES', 'SOLIS', 'ORTIZ', 'HERNANDEZ', 'ALVAREZ', 'MONTOYA', 'CLARK', 'GUTIERREZ']):
        rce_c = pol_rce.get(p['id'])
        dic_c = pol_dic.get(p['id'])
        print(f"{name:25} | Pol: {str(p.get('policy_number')):15} | RCE: {rce_c} | DIC: {dic_c}")
