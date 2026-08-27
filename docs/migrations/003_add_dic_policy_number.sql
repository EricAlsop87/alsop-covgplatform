-- ============================================================================
-- Add DIC Policy Number Field
-- ============================================================================

ALTER TABLE public.policy_terms
    ADD COLUMN IF NOT EXISTS dic_policy_number text NULL;

COMMENT ON COLUMN public.policy_terms.dic_policy_number IS 'Policy number for the associated Difference in Conditions (DIC) policy, if applicable.';
