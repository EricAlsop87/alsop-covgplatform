-- Migration: Add source_tier column to property_enrichments
-- 
-- source_tier classifies the reliability and origin of each enrichment value.
-- This is the foundation of the platform's confidence and trust model.
--
-- Tier values:
--   verified       = From a signed legal document (dec page, DIC policy on file)
--   enriched_real  = From a real external API with actual property data (ATTOM, USDA WHP, Google Geocoding)
--   enriched_ai    = From AI vision/imagery analysis (satellite or street view)
--   inferred       = Computed from partial real data (interim RCE estimate)
--   mock           = Placeholder/random data (old mock assessor \u2014 should no longer be written)
--
-- The confidence scoring system uses source_tier to determine report readiness:
-- Only enriched_real and verified fields contribute to High Confidence estimates.
-- enriched_ai fields contribute at Medium Confidence.
-- inferred/mock fields do NOT trigger underinsurance flags.

ALTER TABLE property_enrichments
ADD COLUMN IF NOT EXISTS source_tier TEXT
    CHECK (source_tier IN ('verified', 'enriched_real', 'enriched_ai', 'inferred', 'mock'))
    DEFAULT 'enriched_ai';

-- Backfill existing data:
-- Old mock assessor rows (labeled 'County Assessor (Mock API)') must be marked as 'mock'
-- so they are excluded from flag and confidence calculations.
UPDATE property_enrichments
SET source_tier = 'mock'
WHERE source_name ILIKE '%mock%'
   OR source_name ILIKE '%simulated%'
   OR notes ILIKE '%simulated%'
   OR notes ILIKE '%mock%';

-- Real USDA / Google enrichments are enriched_real
UPDATE property_enrichments
SET source_tier = 'enriched_real'
WHERE source_name IN ('USDA Forest Service', 'Google Geocoding', 'ATTOM Data Solutions')
  AND source_tier != 'mock';

-- AI-derived fields are enriched_ai
UPDATE property_enrichments
SET source_tier = 'enriched_ai'
WHERE source_name IN ('Google Maps Vision', 'Google Street View Vision', 'Google Maps', 'Google Street View')
   OR field_key ILIKE 'ai_%'
   OR field_key ILIKE 'ai_sv_%'
   AND source_tier IS NULL;

-- Add index for fast tier-based filtering in flag evaluation
CREATE INDEX IF NOT EXISTS idx_property_enrichments_source_tier
    ON property_enrichments(policy_id, source_tier);

COMMENT ON COLUMN property_enrichments.source_tier IS
    'Reliability tier: verified | enriched_real | enriched_ai | inferred | mock. '
    'Controls whether this field contributes to confidence scores and flag evaluation.';
