-- ============================================================================
-- American Modern RCE Support — Database Migration
-- 
-- Adds columns to doc_data_rce for American Modern / Cotality RCT Express
-- RCE documents. All new columns are nullable so existing 360Value rows
-- are completely unaffected.
--
-- Run this in Supabase SQL Editor.
-- SAFE: Only adds columns and an index. No existing data is modified.
-- ============================================================================

-- Source discriminator: identifies which RCE format produced this row
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'rce_360value';

-- General Information (AM-specific fields)
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS estimate_number TEXT;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS renewal_date DATE;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS estimate_expiration_date DATE;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS insured_name TEXT;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS property_address TEXT;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS construction_type TEXT;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS finished_floor_area INTEGER;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS num_families INTEGER;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS perimeter TEXT;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS wall_height TEXT;

-- Coverage A breakdown (AM separates debris removal)
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS coverage_a_without_debris NUMERIC(12,2);
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS coverage_a_debris_removal NUMERIC(12,2);
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS coverage_a_with_debris NUMERIC(12,2);

-- Coverage B (Other Structures — present on some AM docs)
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS coverage_b_without_debris NUMERIC(12,2);
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS coverage_b_debris_removal NUMERIC(12,2);
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS coverage_b_with_debris NUMERIC(12,2);
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS coverage_b_pct_of_a NUMERIC(5,2);

-- Cost data reference
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS cost_data_as_of TEXT;

-- Geospatial coordinates
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,6);
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,6);
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS coordinates_source TEXT;

-- Detailed structured data (JSONB for flexibility)
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS detailed_cost_breakdown JSONB;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS materials_detail JSONB;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS exterior_features JSONB;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS interior_features JSONB;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS kitchens_baths JSONB;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS electrical JSONB;
ALTER TABLE doc_data_rce ADD COLUMN IF NOT EXISTS fire_protection JSONB;

-- Index for filtering by source
CREATE INDEX IF NOT EXISTS idx_doc_data_rce_source ON doc_data_rce(source);
