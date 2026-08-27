-- Migration: Add mortgagee loan number columns
-- These columns store the loan/reference numbers associated with each mortgagee,
-- which appear on dec pages below the mortgagee's address.

ALTER TABLE dec_pages ADD COLUMN IF NOT EXISTS mortgagee_1_loan_number TEXT;
ALTER TABLE dec_pages ADD COLUMN IF NOT EXISTS mortgagee_2_loan_number TEXT;
ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS mortgagee_1_loan_number TEXT;
ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS mortgagee_2_loan_number TEXT;
