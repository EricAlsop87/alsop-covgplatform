-- Migration: Add carrier names/sources to policy_document_status view
-- Purpose: Allows the dashboard to render carrier badges (Bamboo, American Modern, PSIC, Aegis, SageSure)
--          without N+1 queries.
-- Run:     Execute in Supabase SQL Editor
-- Date:    2026-09-08

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
    ) AS has_es_doc,
    (
        SELECT COALESCE(
            NULLIF(ddr.source, ''),
            'rce_360value'
        )
        FROM platform_documents pd
        LEFT JOIN doc_data_rce ddr ON ddr.document_id = pd.id
        WHERE pd.policy_id = p.id AND pd.doc_type = 'rce'
        ORDER BY pd.created_at DESC
        LIMIT 1
    ) AS rce_carrier,
    (
        SELECT ddd.carrier_name
        FROM platform_documents pd
        JOIN doc_data_dic ddd ON ddd.document_id = pd.id
        WHERE pd.policy_id = p.id AND pd.doc_type = 'dic_dec_page'
        ORDER BY pd.created_at DESC
        LIMIT 1
    ) AS dic_carrier,
    (
        SELECT dde.carrier_name
        FROM platform_documents pd
        JOIN doc_data_es dde ON dde.document_id = pd.id
        WHERE pd.policy_id = p.id AND pd.doc_type = 'es_doc'
        ORDER BY pd.created_at DESC
        LIMIT 1
    ) AS es_carrier
FROM policies p;

GRANT SELECT ON policy_document_status TO anon, authenticated;

COMMENT ON VIEW policy_document_status IS 'Pre-computed boolean flags and carrier metadata for document/enrichment presence per policy.';
