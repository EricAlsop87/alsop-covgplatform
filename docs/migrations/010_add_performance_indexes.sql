-- Migration: Add performance indexes for core query patterns
-- Purpose: The most frequent dashboard, flag, and document queries filter on columns
--          that currently have no indexes. This causes full table scans at scale.
-- Run:     Execute in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- Date:    2026-08-14

-- policies: filtered by status on every dashboard/table load
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);

-- policies: joined via client_id in every policy list query
CREATE INDEX IF NOT EXISTS idx_policies_client_id ON policies(client_id);

-- policy_terms: is_current=true is the standard filter for active term data
CREATE INDEX IF NOT EXISTS idx_policy_terms_is_current ON policy_terms(is_current);

-- policy_terms: expiration_date range queries for renewal windows
CREATE INDEX IF NOT EXISTS idx_policy_terms_expiration ON policy_terms(expiration_date);

-- policy_flags: filtered by status='open' on flags page, dashboard, and evaluator
CREATE INDEX IF NOT EXISTS idx_policy_flags_status ON policy_flags(status);

-- policy_flags: filtered by policy_id for per-policy flag lookups
CREATE INDEX IF NOT EXISTS idx_policy_flags_policy_id ON policy_flags(policy_id);

-- dec_page_submissions: filtered by account_id for user-specific views
CREATE INDEX IF NOT EXISTS idx_dec_submissions_account_id ON dec_page_submissions(account_id);

-- property_enrichments: filtered by policy_id for enrichment lookups
CREATE INDEX IF NOT EXISTS idx_enrichments_policy_id ON property_enrichments(policy_id);

-- ingestion_jobs: the worker polls for status='queued' with run_after filter
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON ingestion_jobs(status);
