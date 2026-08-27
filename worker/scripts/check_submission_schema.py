import asyncio
from src.db.flag_evaluator import get_supabase

async def check_schema():
    sb = get_supabase()
    res = sb.table('dec_page_submissions').select('*').limit(1).execute()
    if res.data:
        print("Columns in dec_page_submissions:", list(res.data[0].keys()))
    else:
        print("No rows in dec_page_submissions to inspect.")

if __name__ == "__main__":
    asyncio.run(check_schema())
