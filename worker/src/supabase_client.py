"""
Supabase client using SERVICE ROLE key.
Used by the worker for server-side operations (bypass RLS).
"""

import os
from supabase import create_client, Client

_client: Client | None = None


def get_supabase() -> Client:
    """Return a singleton Supabase admin client."""
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
    return _client
