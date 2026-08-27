-- ============================================================================
-- E&S Document Ingestion Framework — Database Migration
-- 
-- Run via Node script or Supabase SQL Editor.
-- SAFE: Creates new tables and adds E&S columns to policy_terms.
-- ============================================================================

-- 1. Create doc_data_es table
CREATE TABLE IF NOT EXISTS doc_data_es (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL UNIQUE REFERENCES platform_documents(id) ON DELETE CASCADE,
    
    -- Carrier & Producer info
    carrier_name        TEXT,
    producer_name       TEXT,
    producer_code       TEXT,
    producer_phone      TEXT,
    
    -- Policy / Quote metadata
    document_type       TEXT, -- e.g. "E&S Homeowner (HO-3) Quote", "E&S Policy"
    quote_number        TEXT,
    policy_number       TEXT,
    quote_date          DATE,
    effective_date      DATE,
    expiration_date     DATE,
    
    -- Insured & Property
    named_insured       TEXT,
    risk_address        TEXT,
    risk_city           TEXT,
    risk_state          TEXT,
    risk_zip            TEXT,
    
    -- Primary Coverages & Limits
    cov_a_dwelling          NUMERIC(12,2),
    cov_b_other_structures  NUMERIC(12,2),
    cov_c_personal_property NUMERIC(12,2),
    cov_d_loss_of_use       NUMERIC(12,2),
    cov_e_personal_liability NUMERIC(12,2),
    cov_f_medical_payments   NUMERIC(12,2),
    deductible              NUMERIC(12,2),
    
    -- Premiums, Taxes & Fees
    base_premium        NUMERIC(10,2),
    inspection_fee      NUMERIC(10,2),
    policy_fee          NUMERIC(10,2),
    surplus_lines_tax   NUMERIC(10,2),
    stamping_fee        NUMERIC(10,2),
    total_policy_premium NUMERIC(10,2),
    
    -- Flexible storage for itemized coverages & endorsements
    additional_coverages JSONB,
    extracted_json       JSONB,
    
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- 2. Add E&S tracking columns to policy_terms
ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS es_exists BOOLEAN DEFAULT false;
ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS es_policy_number TEXT;
ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS es_annual_premium_raw NUMERIC(10,2);

-- 3. Enable RLS and set policies
ALTER TABLE doc_data_es ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'doc_data_es' AND policyname = 'Service role full access'
    ) THEN
        CREATE POLICY "Service role full access" ON doc_data_es FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
