-- ============================================================================
-- Migration 007: Enable Row-Level Security on all core tables
-- ============================================================================
-- Purpose: Block anonymous (unauthenticated) access to all tables.
--          Authenticated users (admin/service/customer) retain current access.
--          The service_role key (used by the Python worker and API routes via
--          getSupabaseAdmin()) bypasses RLS by design — no policy needed.
--
-- Strategy:
--   Phase 1 (this migration):
--     - Enable RLS on all 12 unprotected tables
--     - Add permissive USING(true) policies for 'authenticated' role
--     - Fix misconfigured "Service role full access" policies on
--       platform_documents / doc_data_rce / doc_data_dic (missing TO clause)
--     - Add scoped SELECT on 'accounts' (users see own row; admin sees all)
--   Phase 2 (future):
--     - Add customer-scoped policies that filter by created_by_account_id
--
-- Idempotent: uses IF NOT EXISTS / DROP IF EXISTS where possible.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Helper: create_rls_policy — avoids errors if policy already exists
-- ────────────────────────────────────────────────────────────────────────────
-- Postgres does not support CREATE POLICY IF NOT EXISTS, so we drop + create.

-- ============================================================================
-- 1. CLIENTS
-- ============================================================================
ALTER TABLE IF EXISTS clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON clients;
CREATE POLICY "authenticated_full_access" ON clients
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 2. POLICIES
-- ============================================================================
ALTER TABLE IF EXISTS policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON policies;
CREATE POLICY "authenticated_full_access" ON policies
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 3. POLICY_TERMS
-- ============================================================================
ALTER TABLE IF EXISTS policy_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON policy_terms;
CREATE POLICY "authenticated_full_access" ON policy_terms
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 4. DEC_PAGES
-- ============================================================================
ALTER TABLE IF EXISTS dec_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON dec_pages;
CREATE POLICY "authenticated_full_access" ON dec_pages
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 5. DEC_PAGE_SUBMISSIONS
-- ============================================================================
ALTER TABLE IF EXISTS dec_page_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON dec_page_submissions;
CREATE POLICY "authenticated_full_access" ON dec_page_submissions
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 6. INGESTION_JOBS
-- ============================================================================
ALTER TABLE IF EXISTS ingestion_jobs ENABLE ROW LEVEL SECURITY;

-- Worker-only table: authenticated users may need to read (admin submissions view)
-- but should not write directly from the browser.
DROP POLICY IF EXISTS "authenticated_read" ON ingestion_jobs;
CREATE POLICY "authenticated_read" ON ingestion_jobs
    FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================================
-- 7. ACTIVITY_EVENTS
-- ============================================================================
ALTER TABLE IF EXISTS activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON activity_events;
CREATE POLICY "authenticated_full_access" ON activity_events
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 8. POLICY_FLAGS
-- ============================================================================
ALTER TABLE IF EXISTS policy_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON policy_flags;
CREATE POLICY "authenticated_full_access" ON policy_flags
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 9. FLAG_EVENTS
-- ============================================================================
ALTER TABLE IF EXISTS flag_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON flag_events;
CREATE POLICY "authenticated_full_access" ON flag_events
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 10. FLAG_DEFINITIONS
-- ============================================================================
ALTER TABLE IF EXISTS flag_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON flag_definitions;
CREATE POLICY "authenticated_full_access" ON flag_definitions
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 11. PROPERTY_ENRICHMENTS
-- ============================================================================
ALTER TABLE IF EXISTS property_enrichments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON property_enrichments;
CREATE POLICY "authenticated_full_access" ON property_enrichments
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 12. ACCOUNTS
-- ============================================================================
-- More restrictive: users can read their own account; admin/service can read all.
ALTER TABLE IF EXISTS accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_account" ON accounts;
CREATE POLICY "users_read_own_account" ON accounts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Allow users to update their own account only
DROP POLICY IF EXISTS "users_update_own_account" ON accounts;
CREATE POLICY "users_update_own_account" ON accounts
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ============================================================================
-- 13. FIX: PLATFORM_DOCUMENTS — misconfigured "Service role full access"
-- ============================================================================
-- The existing policy has no TO clause, granting ALL roles (including anon) full
-- access. Drop it and replace with a properly scoped authenticated policy.

DROP POLICY IF EXISTS "Service role full access" ON platform_documents;
DROP POLICY IF EXISTS "authenticated_full_access" ON platform_documents;
CREATE POLICY "authenticated_full_access" ON platform_documents
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Keep the existing "Users read own documents" policy (properly scoped SELECT).

-- ============================================================================
-- 14. FIX: DOC_DATA_RCE — same misconfiguration
-- ============================================================================
DROP POLICY IF EXISTS "Service role full access" ON doc_data_rce;
DROP POLICY IF EXISTS "authenticated_full_access" ON doc_data_rce;
CREATE POLICY "authenticated_full_access" ON doc_data_rce
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 15. FIX: DOC_DATA_DIC — same misconfiguration
-- ============================================================================
DROP POLICY IF EXISTS "Service role full access" ON doc_data_dic;
DROP POLICY IF EXISTS "authenticated_full_access" ON doc_data_dic;
CREATE POLICY "authenticated_full_access" ON doc_data_dic
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 16. MERGE_LOGS (if exists) — enable RLS
-- ============================================================================
ALTER TABLE IF EXISTS merge_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON merge_logs;
CREATE POLICY "authenticated_full_access" ON merge_logs
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ============================================================================
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
--
-- SELECT tablename, policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
