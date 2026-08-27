-- Migration: Add progress tracking columns to policy_import_batches
-- Run this in the Supabase SQL Editor before using the updated CSV import

ALTER TABLE policy_import_batches
ADD COLUMN IF NOT EXISTS progress_pct integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS progress_message text DEFAULT '';
