# RLS (Row-Level Security) Verification Checklist

> **SEC-8 from Audit Report**: RLS posture cannot be verified from code alone.
> This checklist must be completed in the Supabase Dashboard before handoff.

## Required Verification

Log into the **Supabase Dashboard** → **Database** → **Tables** and verify each table below has:
1. ✅ RLS **enabled** (toggle in table settings)
2. ✅ SELECT/INSERT/UPDATE/DELETE policies that restrict by `account_id`

### Core Tables to Verify

| Table | RLS Enabled? | Policy Restricts by account_id? | Notes |
|-------|:---:|:---:|-------|
| `policies` | ☐ | ☐ | Must join through `clients.account_id` |
| `clients` | ☐ | ☐ | Direct `account_id` column |
| `policy_terms` | ☐ | ☐ | Via `policies → clients.account_id` |
| `dec_pages` | ☐ | ☐ | Via `policies → clients.account_id` |
| `platform_documents` | ☐ | ☐ | Via `policies → clients.account_id` |
| `policy_flags` | ☐ | ☐ | Via `policies → clients.account_id` |
| `property_enrichments` | ☐ | ☐ | Via `policies → clients.account_id` |
| `activity_events` | ☐ | ☐ | Direct `account_id` or via FK |
| `accounts` | ☐ | ☐ | Users can only see own account |

### What to Look For

Each table should have policies like:
```sql
-- SELECT policy
CREATE POLICY "Users can view own data" ON policies
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM clients WHERE account_id = auth.uid()
    )
  );
```

### Admin Client Bypass
The `getSupabaseAdmin()` client uses the `service_role` key which **bypasses all RLS**.
This is correct for:
- Worker ingestion (writes from Python worker)
- Internal API routes that already check auth via `authenticateRequest()`

### If RLS is Missing
If any table above does NOT have RLS enabled, add it immediately:
```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
-- Then create appropriate policies
```

> [!CAUTION]
> Without RLS on `policies` and `clients`, a customer-role user can read ALL agency data
> by querying the Supabase REST API directly with their JWT.
