-- ============================================================
-- MERGE ARCHITECTURE: Phase 0 — Schema Foundation
-- ============================================================
-- This migration adds the soft-merge columns needed for the
-- client/policy merge system. No data is deleted. All existing
-- rows are backfilled to 'active'.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. CLIENTS: Add status + merge tracking columns
-- ─────────────────────────────────────────────────────────────

-- Add status column (does not exist yet on clients table)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Add soft-merge pointer
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES clients(id);

-- Add merge audit columns
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS merged_by_account_id uuid REFERENCES accounts(id);

-- ─────────────────────────────────────────────────────────────
-- 2. POLICIES: Add merge tracking columns
--    (policies.status already exists, just needs 'merged' support)
-- ─────────────────────────────────────────────────────────────

-- Add soft-merge pointer
ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES policies(id);

-- Add merge audit columns
ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS merged_by_account_id uuid REFERENCES accounts(id);

-- ─────────────────────────────────────────────────────────────
-- 3. POLICY_TERMS: Enforce single is_current per policy
--    This prevents silent data corruption from bad merges or
--    race conditions in the ingestion pipeline.
-- ─────────────────────────────────────────────────────────────

-- Unique partial index: only one term per policy can be is_current=true
-- This will FAIL if duplicates already exist. Check first:
-- SELECT policy_id, count(*) FROM policy_terms WHERE is_current = true GROUP BY policy_id HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_term_per_policy
  ON policy_terms (policy_id)
  WHERE is_current = true;

-- ─────────────────────────────────────────────────────────────
-- 4. Backfill: Ensure all existing clients have status='active'
--    (The DEFAULT handles this, but be explicit for safety)
-- ─────────────────────────────────────────────────────────────

UPDATE clients
  SET status = 'active'
  WHERE status IS NULL;
