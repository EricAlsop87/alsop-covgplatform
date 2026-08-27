CREATE TABLE IF NOT EXISTS public.merge_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL, -- 'client' or 'policy'
    survivor_id UUID NOT NULL,
    merged_id UUID NOT NULL,
    merge_details JSONB,
    performed_by UUID NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: We also optionally need the `term_sequence` column from Phase A if you didn't add it yet
-- ALTER TABLE policy_terms ADD COLUMN IF NOT EXISTS term_sequence VARCHAR(10);
