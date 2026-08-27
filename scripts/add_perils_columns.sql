-- Add perils_insured_against to dec_pages
ALTER TABLE dec_pages ADD COLUMN IF NOT EXISTS perils_insured_against TEXT;

-- Add perils_insured_against to policy_terms (if it's not JSONB mapped)
ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS perils_insured_against TEXT;
