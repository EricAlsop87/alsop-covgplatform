-- Migration: Property Enrichments table for source-tracked enriched data
-- Run after 004_decpage_dedupe.sql

CREATE TABLE IF NOT EXISTS public.property_enrichments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,

    -- What was enriched
    field_key TEXT NOT NULL,           -- e.g. 'property_image', 'year_built', 'lot_size'
    field_value TEXT,                  -- The enriched value (URL, string, number-as-string)

    -- Source attribution (critical for transparency)
    source_name TEXT NOT NULL,         -- e.g. 'Google Maps', 'County Assessor', 'Parser'
    source_type TEXT NOT NULL          -- 'api', 'public_data', 'parser', 'premium', 'ai_interpretation'
        CHECK (source_type IN ('api', 'public_data', 'parser', 'premium', 'ai_interpretation')),
    source_url TEXT,                   -- Raw citation URL if applicable
    confidence TEXT DEFAULT 'medium'   -- 'high', 'medium', 'low'
        CHECK (confidence IN ('high', 'medium', 'low')),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Prevent duplicate entries per source per field
    CONSTRAINT uq_enrichment_policy_field_source UNIQUE (policy_id, field_key, source_name)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_enrichments_policy_id ON public.property_enrichments(policy_id);
CREATE INDEX IF NOT EXISTS idx_enrichments_field_key ON public.property_enrichments(field_key);
