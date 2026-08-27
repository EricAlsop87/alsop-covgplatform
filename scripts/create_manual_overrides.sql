-- Create manual_overrides table to store agent modifications to policy data
CREATE TABLE IF NOT EXISTS manual_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    new_value TEXT NOT NULL,
    original_value TEXT,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_policy_field UNIQUE (policy_id, field_name)
);

-- Enable RLS
ALTER TABLE manual_overrides ENABLE ROW LEVEL SECURITY;

-- Policies for manual_overrides
CREATE POLICY "Users can view manual_overrides in their organization"
    ON manual_overrides FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM policies p
            JOIN accounts a ON a.id = auth.uid()
            WHERE p.id = manual_overrides.policy_id
              AND (a.role = 'admin' OR a.role = 'service' OR p.client_id = a.id)
        )
    );

CREATE POLICY "Agents can insert manual_overrides"
    ON manual_overrides FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.id = auth.uid() AND a.role IN ('admin', 'service')
        )
    );

CREATE POLICY "Agents can update manual_overrides"
    ON manual_overrides FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.id = auth.uid() AND a.role IN ('admin', 'service')
        )
    );

CREATE POLICY "Agents can delete manual_overrides"
    ON manual_overrides FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.id = auth.uid() AND a.role IN ('admin', 'service')
        )
    );

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_manual_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_manual_overrides_updated_at ON manual_overrides;
CREATE TRIGGER trg_manual_overrides_updated_at
BEFORE UPDATE ON manual_overrides
FOR EACH ROW
EXECUTE FUNCTION update_manual_overrides_updated_at();

-- Add a history log table if you strictly want a full audit trail of EVERY change sequentially, 
-- but since the unique constraint ensures only the CURRENT override is kept, 
-- we will also create an append-only audit log for these overrides.

CREATE TABLE IF NOT EXISTS manual_override_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    changed_from TEXT,
    changed_to TEXT NOT NULL,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE manual_override_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view override logs"
    ON manual_override_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM policies p
            JOIN accounts a ON a.id = auth.uid()
            WHERE p.id = manual_override_logs.policy_id
              AND (a.role = 'admin' OR a.role = 'service')
        )
    );

CREATE POLICY "System can insert override logs"
    ON manual_override_logs FOR INSERT
    WITH CHECK (true); -- Usually enforced by API/trigger
