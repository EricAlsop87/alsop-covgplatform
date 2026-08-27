-- Create the policy_reports table to store generated report snapshots
CREATE TABLE IF NOT EXISTS public.policy_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    policy_term_id UUID REFERENCES public.policy_terms(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by_account_id UUID,
    
    -- The snapshot of policy data at time of creation
    data_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- The synthesized AI summary & recommendations
    ai_insights JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.policy_reports ENABLE ROW LEVEL SECURITY;

-- Base permissive RLS policies for authenticated users 
-- (adjust according to your exact multi-tenant / auth scoping rules)
CREATE POLICY "Allow authenticated full access to policy_reports" 
    ON public.policy_reports 
    FOR ALL 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Index for fast lookup by policy
CREATE INDEX IF NOT EXISTS idx_policy_reports_policy_id ON public.policy_reports(policy_id);
