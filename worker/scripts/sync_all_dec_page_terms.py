"""
Sync and promote all extracted dec_pages coverage limits and premiums
to their respective policy_terms rows.
"""

import os
import sys
import re
from dotenv import load_dotenv

load_dotenv('C:/Projects/Coverage Check/worker/.env')
sys.path.insert(0, 'C:/Projects/Coverage Check/worker')
from src.supabase_client import get_supabase

sb = get_supabase()


def parse_num(val):
    if not val:
        return None
    s = re.sub(r'[^\d.]', '', str(val))
    try:
        return float(s)
    except:
        return None


def run_sync():
    decs = sb.table('dec_pages').select('*').not_.is_('policy_id', 'null').execute()
    print(f'Total dec pages linked: {len(decs.data)}')

    updated_count = 0
    for d in decs.data:
        pid = d['policy_id']
        dec_id = d['id']

        terms = sb.table('policy_terms').select('*').eq('policy_id', pid).execute()
        if not terms.data:
            continue

        sorted_terms = sorted(
            terms.data,
            key=lambda t: (t.get('effective_date') or '', t.get('created_at') or ''),
            reverse=True,
        )

        target_term = None
        for t in sorted_terms:
            if t.get('source_dec_page_id') == dec_id:
                target_term = t
                break
        if not target_term:
            dec_eff = d.get('policy_period_start')
            for t in sorted_terms:
                if dec_eff and t.get('effective_date') == dec_eff:
                    target_term = t
                    break
        if not target_term:
            target_term = next((t for t in sorted_terms if t.get('is_current')), sorted_terms[0])

        payload = {}

        if not target_term.get('source_dec_page_id'):
            payload['source_dec_page_id'] = dec_id

        fields_to_sync = [
            ('limit_dwelling', 'limit_dwelling'),
            ('limit_other_structures', 'limit_other_structures'),
            ('limit_personal_property', 'limit_personal_property'),
            ('limit_fair_rental_value', 'limit_fair_rental_value'),
            ('limit_ordinance_or_law', 'limit_ordinance_or_law'),
            ('limit_debris_removal', 'limit_debris_removal'),
            ('limit_extended_dwelling_coverage', 'limit_extended_dwelling_coverage'),
            ('limit_dwelling_replacement_cost', 'limit_dwelling_replacement_cost'),
            ('limit_inflation_guard', 'limit_inflation_guard'),
            ('limit_personal_property_replacement_cost', 'limit_personal_property_replacement_cost'),
            ('deductible', 'deductible'),
            ('year_built', 'year_built'),
            ('occupancy', 'occupancy'),
            ('construction_type', 'construction_type'),
            ('number_of_units', 'number_of_units'),
            ('broker_name', 'broker_name'),
            ('broker_address', 'broker_address'),
        ]
        for dec_k, term_k in fields_to_sync:
            dec_v = d.get(dec_k)
            term_v = target_term.get(term_k)
            if dec_v and (not term_v or term_v in ['$0', '$ 0', '0']):
                payload[term_k] = dec_v

        if d.get('total_annual_premium') and not target_term.get('annual_premium'):
            num_p = parse_num(d.get('total_annual_premium'))
            if num_p:
                payload['annual_premium'] = num_p

        if payload:
            sb.table('policy_terms').update(payload).eq('id', target_term['id']).execute()
            updated_count += 1
            print(f"Updated term {target_term['id'][:8]} for policy {pid[:8]} ({d.get('policy_number')}): {list(payload.keys())}")

    print(f'\nFinished! Successfully updated {updated_count} policy terms with full coverage details!')


if __name__ == '__main__':
    run_sync()
