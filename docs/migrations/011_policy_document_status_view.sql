-- Migration: Add a view that pre-computes boolean document/enrichment flags
-- Purpose: Eliminates the N+1 query pattern in the dashboard policy loader.
--          Previously, after fetching policies the client fired 3 separate
--          chunked queries (enrichments, dec_pages, platform_documents) to
--          resolve boolean has_* columns. This view joins them in one query.
-- Run:     Execute in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- Date:    2026-08-14

CREATE OR REPLACE VIEW policy_document_status AS
SELECT
    p.id AS policy_id,
    EXISTS (
        SELECT 1 FROM property_enrichments pe WHERE pe.policy_id = p.id
    ) AS is_enriched,
    EXISTS (
        SELECT 1 FROM dec_pages dp WHERE dp.policy_id = p.id
    ) AS has_dec_page,
    EXISTS (
        SELECT 1 FROM platform_documents pd
        WHERE pd.policy_id = p.id AND pd.doc_type = 'rce'
    ) AS has_rce,
    EXISTS (
        SELECT 1 FROM platform_documents pd
        WHERE pd.policy_id = p.id AND pd.doc_type = 'dic_dec_page'
    ) AS has_dic,
    EXISTS (
        SELECT 1 FROM platform_documents pd
        WHERE pd.policy_id = p.id AND pd.doc_type = 'es_doc'
    ) AS has_es_doc
FROM policies p;

GRANT SELECT ON policy_document_status TO anon, authenticated;

COMMENT ON VIEW policy_document_status IS 'Pre-computed boolean flags for document/enrichment presence per policy. Eliminates the N+1 chunked query pattern in the dashboard policy loader.';
