-- ============================================================================
-- Add DIC coverage fields to policy_terms
-- 
-- These columns store the DIC carrier's coverage limits SEPARATELY from
-- the CFP/FAIR Plan limits.  They are populated automatically by the
-- dic_processor worker after a DIC dec page upload.
--
-- SAFE: Only adds new nullable columns. No data is modified.
-- ============================================================================

ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS dic_limit_dwelling TEXT;
ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS dic_limit_other_structures TEXT;
ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS dic_limit_personal_property TEXT;
ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS dic_limit_loss_of_use TEXT;
ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS dic_deductible TEXT;
ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS dic_annual_premium_raw NUMERIC(10,2);

-- dic_policy_number may already exist from earlier migration; safe with IF NOT EXISTS
ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS dic_policy_number TEXT;
