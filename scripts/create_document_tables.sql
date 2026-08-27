-- ============================================================================
-- RCE & DIC Document Ingestion Framework — Database Migration
-- 
-- Run this in Supabase SQL Editor.
-- SAFE: Creates new tables and adds one column. Does NOT modify existing tables
-- except adding an optional nullable column to ingestion_jobs.
-- ============================================================================

-- 1. Add document_id column to ingestion_jobs (for new pipeline routing)
--    Nullable so existing dec page jobs are unaffected.
ALTER TABLE ingestion_jobs 
ADD COLUMN IF NOT EXISTS document_id UUID;

-- 2. Universal document record for all non-dec-page document types
CREATE TABLE IF NOT EXISTS platform_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES accounts(id),
    doc_type        TEXT NOT NULL CHECK (doc_type IN (
        'rce','dic_dec_page','invoice','inspection','endorsement','questionnaire','es_doc','other'
    )),
    
    -- File metadata
    file_name       TEXT NOT NULL,
    file_size       INTEGER,
    file_hash       TEXT,
    storage_path    TEXT,
    bucket          TEXT DEFAULT 'cfp-platform-documents',
    
    -- Policy linking (nullable until matched)
    client_id       UUID REFERENCES clients(id),
    policy_id       UUID REFERENCES policies(id),
    policy_term_id  UUID REFERENCES policy_terms(id),
    
    -- Matching state
    match_status    TEXT DEFAULT 'pending' CHECK (match_status IN (
        'pending','matched','needs_review','no_match','manual'
    )),
    match_log       JSONB DEFAULT '[]'::jsonb,
    match_confidence NUMERIC(3,2),
    
    -- Parsing state
    parse_status    TEXT DEFAULT 'pending' CHECK (parse_status IN (
        'pending','processing','parsed','needs_review','failed'
    )),
    processing_step TEXT,
    error_message   TEXT,
    raw_text        TEXT,
    
    -- Extracted identity fields (used for matching)
    extracted_owner_name   TEXT,
    extracted_address      TEXT,
    extracted_address_norm TEXT,
    
    -- Writeback tracking
    writeback_status TEXT DEFAULT 'none' CHECK (writeback_status IN (
        'none','pending_review','written','skipped','conflict'
    )),
    writeback_log   JSONB DEFAULT '[]'::jsonb,
    
    -- Audit
    duplicate_of    UUID REFERENCES platform_documents(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platdoc_policy   ON platform_documents(policy_id);
CREATE INDEX IF NOT EXISTS idx_platdoc_account  ON platform_documents(account_id);
CREATE INDEX IF NOT EXISTS idx_platdoc_type     ON platform_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_platdoc_hash     ON platform_documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_platdoc_match    ON platform_documents(match_status);
CREATE INDEX IF NOT EXISTS idx_platdoc_parse    ON platform_documents(parse_status);

-- 3. RCE-specific extracted data (360Value Replacement Cost Estimator)
CREATE TABLE IF NOT EXISTS doc_data_rce (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL UNIQUE REFERENCES platform_documents(id) ON DELETE CASCADE,
    
    -- Valuation metadata
    valuation_id        TEXT,
    date_entered        DATE,
    date_calculated     DATE,
    created_by          TEXT,
    
    -- Structure
    stories             TEXT,
    use_type            TEXT,
    style               TEXT,
    sq_feet             INTEGER,
    year_built          INTEGER,
    quality_grade       TEXT,
    site_access         TEXT,
    cost_per_sqft       NUMERIC(10,2),
    
    -- Foundation
    foundation_shape    TEXT,
    foundation_material TEXT,
    foundation_type     TEXT,
    property_slope      TEXT,
    
    -- Exterior
    roof_year           TEXT,
    roof_cover          TEXT,
    roof_shape          TEXT,
    roof_construction   TEXT,
    wall_finish         TEXT,
    wall_construction   TEXT,
    num_dormers         INTEGER DEFAULT 0,
    
    -- Interior
    avg_wall_height     INTEGER,
    floor_coverings     TEXT,
    ceiling_finish      TEXT,
    interior_wall_material TEXT,
    interior_wall_finish   TEXT,
    
    -- Rooms / Structures / Systems (flexible JSON)
    rooms               JSONB,
    garage_info         JSONB,
    porch_info          JSONB,
    heating             TEXT,
    air_conditioning    TEXT,
    fireplace_info      JSONB,
    home_features       JSONB,
    
    -- Cost estimates (the key numbers)
    replacement_cost       NUMERIC(12,2),
    replacement_range_low  NUMERIC(12,2),
    replacement_range_high NUMERIC(12,2),
    actual_cash_value      NUMERIC(12,2),
    acv_age                INTEGER,
    acv_condition          TEXT,
    cost_breakdown         JSONB,
    
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- 4. DIC carrier dec page extracted data (PSIC, Bamboo, Aegis, etc.)
CREATE TABLE IF NOT EXISTS doc_data_dic (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL UNIQUE REFERENCES platform_documents(id) ON DELETE CASCADE,
    
    -- Carrier info
    carrier_name    TEXT,
    policy_number   TEXT,
    policy_form     TEXT,
    effective_date  DATE,
    expiration_date DATE,
    notice_date     DATE,
    document_type   TEXT,
    
    -- Named insured
    insured_name      TEXT,
    secondary_insured TEXT,
    mailing_address   TEXT,
    property_address  TEXT,
    
    -- Broker
    broker_name     TEXT,
    broker_address  TEXT,
    broker_phone    TEXT,
    
    -- Has mortgagee
    has_mortgagee   BOOLEAN DEFAULT false,
    
    -- Coverages
    deductible         TEXT,
    cov_a_dwelling     TEXT,
    cov_b_other_struct TEXT,
    cov_c_personal_prop TEXT,
    cov_e_add_living   TEXT,
    cov_l_liability    TEXT,
    cov_m_medical      TEXT,
    ordinance_or_law   TEXT,
    extended_repl_cost TEXT,
    sewer_backup       TEXT,
    
    -- DIC endorsement specifics
    has_dic_endorsement BOOLEAN DEFAULT false,
    dic_form_number     TEXT,
    dic_eliminates_fire BOOLEAN DEFAULT false,
    requires_fair_plan  BOOLEAN DEFAULT false,
    
    -- Premiums
    basic_premium      NUMERIC(10,2),
    optional_premium   NUMERIC(10,2),
    credits            NUMERIC(10,2),
    surcharges         NUMERIC(10,2),
    total_charge       NUMERIC(10,2),
    
    -- Embedded 360Value reference (if present)
    rce_estimate_number    TEXT,
    rce_replacement_cost   NUMERIC(12,2),
    rce_insured_value      NUMERIC(12,2),
    rce_year_built         INTEGER,
    rce_living_area        INTEGER,
    rce_quality_grade      TEXT,
    
    -- Forms & endorsements list
    forms_endorsements JSONB,
    
    -- Full extracted JSON (backup)
    extracted_json     JSONB,
    
    created_at         TIMESTAMPTZ DEFAULT now()
);

-- 5. Add FK from ingestion_jobs.document_id to platform_documents
--    (separate statement since the column was added above)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ingestion_jobs_document_id_fkey'
    ) THEN
        ALTER TABLE ingestion_jobs 
        ADD CONSTRAINT ingestion_jobs_document_id_fkey 
        FOREIGN KEY (document_id) REFERENCES platform_documents(id);
    END IF;
END $$;

-- 6. Enable RLS on new tables (matching platform security posture)
ALTER TABLE platform_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_data_rce ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_data_dic ENABLE ROW LEVEL SECURITY;

-- RLS policies: service role has full access (worker uses service key)
CREATE POLICY "Service role full access" ON platform_documents
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON doc_data_rce
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON doc_data_dic
    FOR ALL USING (true) WITH CHECK (true);

-- Authenticated users can read their own documents
CREATE POLICY "Users read own documents" ON platform_documents
    FOR SELECT USING (auth.uid() = account_id);
