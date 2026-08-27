-- ============================================================================
-- DIC Carrier Quoting Eligibility Migration
-- 
-- Adds toggles to policies table for Bamboo, Aegis, and PSIC DIC quoting eligibility.
-- Default value is TRUE (eligible / able to run quote).
-- ============================================================================

ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS dic_bamboo_eligible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dic_aegis_eligible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dic_psic_eligible BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.policies.dic_bamboo_eligible IS 'Indicates if Bamboo DIC quote can be run for this policy. Default: true.';
COMMENT ON COLUMN public.policies.dic_aegis_eligible IS 'Indicates if Aegis DIC quote can be run for this policy. Default: true.';
COMMENT ON COLUMN public.policies.dic_psic_eligible IS 'Indicates if PSIC DIC quote can be run for this policy. Default: true.';
