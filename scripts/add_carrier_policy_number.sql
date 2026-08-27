-- Migration: Add carrier_policy_number to policy_terms table
-- This column preserves the original carrier policy number (including suffixes like 01, 08) for each term.
--
-- IMPORTANT: Run these as TWO SEPARATE queries in the Supabase SQL Editor.
-- Running them together may cause a transaction rollback if the UPDATE fails.

-- Step 1: Add the column
ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS carrier_policy_number TEXT;

-- Step 2: Backfill from the linked dec_page's policy_number
UPDATE policy_terms pt
SET carrier_policy_number = dp.policy_number
FROM dec_pages dp
WHERE pt.source_dec_page_id = dp.id
  AND pt.carrier_policy_number IS NULL
  AND dp.policy_number IS NOT NULL;
