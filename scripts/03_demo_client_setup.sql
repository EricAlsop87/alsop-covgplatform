-- ============================================================================
-- 03_demo_client_setup.sql
-- Adds is_demo flag to clients table and inserts demo data for demonstration.
-- ALSO creates a customer account record linked to the demo client.
-- Run this migration against your Supabase database.
-- ============================================================================

-- 1. Add is_demo column to clients table (defaults to false for all existing data)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE;

-- 2. Create demo client
INSERT INTO clients (id, named_insured, insured_type, email, phone, mailing_address_raw, is_demo, created_by_account_id)
VALUES (
    '00000000-0000-4000-a000-000000000001',
    'Jane & John Demo',
    'person',
    'demo-client@gapguard.com',
    '(555) 123-4567',
    '1234 Sample Blvd, Demo City, CA 90210',
    TRUE,
    (SELECT id FROM accounts LIMIT 1)
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- POLICY 1: Active HO-3 in Beverly Hills
-- ============================================================================

INSERT INTO policies (id, client_id, policy_number, carrier_name, property_address_raw, status, created_by_account_id)
VALUES (
    '00000000-0000-4000-b000-000000000001',
    '00000000-0000-4000-a000-000000000001',
    'DEMO-HO3-2026-001',
    'Pacific Shield Insurance',
    '742 Evergreen Terrace, Beverly Hills, CA 90210',
    'active',
    (SELECT id FROM accounts LIMIT 1)
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO policy_terms (id, policy_id, effective_date, expiration_date, annual_premium, is_current, deductible, limit_dwelling, limit_other_structures, limit_personal_property)
VALUES (
    '00000000-0000-4000-c000-000000000001',
    '00000000-0000-4000-b000-000000000001',
    '2026-01-15',
    '2027-01-15',
    3250.00,
    TRUE,
    2500.00,
    650000.00,
    65000.00,
    325000.00
)
ON CONFLICT (id) DO NOTHING;

-- Property Enrichments for Policy 1
INSERT INTO property_enrichments (id, policy_id, field_key, field_value, source_name, source_type, source_url, confidence, fetched_at) VALUES
('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'fire_risk_label',    'High',              'CAL FIRE FHSZ',     'public_data', 'https://osfm.fire.ca.gov/divisions/community-wildfire-preparedness-and-mitigation/wildfire-preparedness/fire-hazard-severity-zones/', 'high', NOW() - INTERVAL '3 days'),
('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000001', 'year_built',          '1987',              'County Assessor',   'public_data', NULL, 'high', NOW() - INTERVAL '3 days'),
('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-b000-000000000001', 'square_footage',      '2,450',             'County Assessor',   'public_data', NULL, 'high', NOW() - INTERVAL '3 days'),
('00000000-0000-4000-d000-000000000004', '00000000-0000-4000-b000-000000000001', 'lot_size_sqft',       '8,200',             'County Assessor',   'public_data', NULL, 'high', NOW() - INTERVAL '3 days'),
('00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b000-000000000001', 'construction_type',   'Wood Frame',        'CoreLogic',         'api',         NULL, 'medium', NOW() - INTERVAL '3 days'),
('00000000-0000-4000-d000-000000000006', '00000000-0000-4000-b000-000000000001', 'roof_type',           'Composition Shingle','AI Vision',        'ai_interpretation', NULL, 'medium', NOW() - INTERVAL '3 days'),
('00000000-0000-4000-d000-000000000007', '00000000-0000-4000-b000-000000000001', 'property_image',      '/property-overhead-ai.png', 'Nearmap',  'api',         NULL, 'high', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

-- Flags for Policy 1
INSERT INTO policy_flags (id, policy_id, client_id, code, severity, title, message, source, status, category, created_at) VALUES
('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001',
 'FIRE_ZONE_HIGH', 'critical', 'High Fire Hazard Zone',
 'Property is located in a CAL FIRE-designated High Fire Hazard Severity Zone (FHSZ). Current policy does not include brush/wildfire endorsement. Recommend adding wildfire-specific coverage.',
 'evaluator', 'open', 'coverage_gap', NOW() - INTERVAL '2 days'),

('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001',
 'DWELLING_UNDERINSURED', 'high', 'Dwelling Limit May Be Insufficient',
 'Estimated replacement cost based on 2,450 sq ft wood-frame construction in Beverly Hills is $780,000–$850,000. Current dwelling limit is $650,000, which may leave a gap of $130,000+.',
 'evaluator', 'open', 'coverage_gap', NOW() - INTERVAL '2 days'),

('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001',
 'EARTHQUAKE_MISSING', 'warning', 'No Earthquake Coverage',
 'Southern California is seismically active. No earthquake policy or CEA endorsement detected. Consider adding earthquake coverage.',
 'evaluator', 'open', 'recommendation', NOW() - INTERVAL '2 days'),

('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001',
 'ROOF_AGE', 'info', 'Roof Age Assessment',
 'Composition shingle roof detected via aerial imagery. Typical lifespan is 20–30 years. If roof was original (1987), it may have been replaced. Verify with homeowner.',
 'evaluator', 'resolved', 'maintenance', NOW() - INTERVAL '2 days');

-- Report for Policy 1
INSERT INTO policy_reports (id, policy_id, client_id, policy_term_id, status, data_payload, ai_insights, created_at) VALUES
('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001',
 '00000000-0000-4000-c000-000000000001', 'published',
 '{"summary": "HO-3 policy for 742 Evergreen Terrace, Beverly Hills. Property is a 2,450 sq ft wood-frame home built in 1987 on an 8,200 sq ft lot. Located in a High Fire Hazard Severity Zone.", "coverage_grade": "C+", "risk_score": 72}'::jsonb,
 '{"recommendations": [{"priority": "high", "title": "Increase Dwelling Coverage", "description": "Current dwelling limit of $650,000 is approximately $130,000–$200,000 below estimated replacement cost. Consider increasing to at least $800,000 to avoid being underinsured in a total loss."}, {"priority": "high", "title": "Add Wildfire Endorsement", "description": "Property is in a CAL FIRE High Fire Hazard Zone. Standard HO-3 may not fully cover wildfire-related losses. A brush/wildfire endorsement or separate wildfire policy is strongly recommended."}, {"priority": "medium", "title": "Consider Earthquake Coverage", "description": "Southern California has significant seismic risk. A California Earthquake Authority (CEA) policy would protect against earthquake damage, which is excluded from standard homeowners policies."}, {"priority": "low", "title": "Verify Roof Condition", "description": "Aerial imagery shows composition shingle roofing. If the roof is original (1987), it may be nearing end of life. A recent inspection report can help ensure coverage eligibility."}], "overall_assessment": "This policy has notable coverage gaps, particularly around wildfire exposure and dwelling limits. The property''s location in a High Fire Hazard Zone, combined with a dwelling limit that may not cover full replacement cost, creates significant financial risk. Addressing the top two recommendations would substantially improve coverage adequacy."}'::jsonb,
 NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- POLICY 2: Condo HO-6 in Santa Monica
-- ============================================================================

INSERT INTO policies (id, client_id, policy_number, carrier_name, property_address_raw, status, created_by_account_id)
VALUES (
    '00000000-0000-4000-b000-000000000002',
    '00000000-0000-4000-a000-000000000001',
    'DEMO-HO6-2026-002',
    'Coastal Guard Mutual',
    '8800 Ocean Ave Unit 4B, Santa Monica, CA 90401',
    'active',
    (SELECT id FROM accounts LIMIT 1)
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO policy_terms (id, policy_id, effective_date, expiration_date, annual_premium, is_current, deductible, limit_dwelling, limit_other_structures, limit_personal_property)
VALUES (
    '00000000-0000-4000-c000-000000000002',
    '00000000-0000-4000-b000-000000000002',
    '2025-11-01',
    '2026-11-01',
    1475.00,
    TRUE,
    1000.00,
    125000.00,
    0.00,
    75000.00
)
ON CONFLICT (id) DO NOTHING;

-- Property Enrichments for Policy 2
INSERT INTO property_enrichments (id, policy_id, field_key, field_value, source_name, source_type, source_url, confidence, fetched_at) VALUES
('00000000-0000-4000-d000-000000000011', '00000000-0000-4000-b000-000000000002', 'fire_risk_label',    'Low',               'CAL FIRE FHSZ',     'public_data', 'https://osfm.fire.ca.gov/', 'high', NOW() - INTERVAL '5 days'),
('00000000-0000-4000-d000-000000000012', '00000000-0000-4000-b000-000000000002', 'year_built',          '2004',              'County Assessor',   'public_data', NULL, 'high', NOW() - INTERVAL '5 days'),
('00000000-0000-4000-d000-000000000013', '00000000-0000-4000-b000-000000000002', 'square_footage',      '1,180',             'County Assessor',   'public_data', NULL, 'high', NOW() - INTERVAL '5 days'),
('00000000-0000-4000-d000-000000000014', '00000000-0000-4000-b000-000000000002', 'construction_type',   'Reinforced Concrete','CoreLogic',         'api',         NULL, 'high', NOW() - INTERVAL '5 days'),
('00000000-0000-4000-d000-000000000015', '00000000-0000-4000-b000-000000000002', 'flood_zone',          'Zone X (Minimal)',   'FEMA NFHL',         'public_data', 'https://msc.fema.gov/portal/home', 'high', NOW() - INTERVAL '5 days'),
('00000000-0000-4000-d000-000000000016', '00000000-0000-4000-b000-000000000002', 'property_image',      '/property-overhead-ai.png', 'Nearmap',    'api',         NULL, 'high', NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- Flags for Policy 2
INSERT INTO policy_flags (id, policy_id, client_id, code, severity, title, message, source, status, category, created_at) VALUES
('00000000-0000-4000-e000-000000000011', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001',
 'LOSS_ASSESSMENT_LOW', 'high', 'Loss Assessment Coverage Insufficient',
 'HO-6 condo policy includes only $2,000 in loss assessment coverage. Industry recommendation for coastal condos is $50,000–$100,000 to cover special assessments from HOA for building damage.',
 'evaluator', 'open', 'coverage_gap', NOW() - INTERVAL '4 days'),

('00000000-0000-4000-e000-000000000012', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001',
 'FLOOD_MISSING', 'warning', 'No Flood Insurance',
 'Property is in FEMA Zone X (minimal flood risk), but coastal proximity increases exposure to storm surge and urban flooding. Consider NFIP or private flood policy.',
 'evaluator', 'open', 'recommendation', NOW() - INTERVAL '4 days'),

('00000000-0000-4000-e000-000000000013', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001',
 'PERSONAL_PROP_LOW', 'warning', 'Personal Property Limit Review',
 'Current personal property limit is $75,000. For a coastal condo with modern furnishings, industry average is $100,000–$150,000. Consider increasing or scheduling high-value items.',
 'evaluator', 'open', 'coverage_gap', NOW() - INTERVAL '4 days');

-- Report for Policy 2
INSERT INTO policy_reports (id, policy_id, client_id, policy_term_id, status, data_payload, ai_insights, created_at) VALUES
('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001',
 '00000000-0000-4000-c000-000000000002', 'published',
 '{"summary": "HO-6 condo policy for 8800 Ocean Ave Unit 4B, Santa Monica. 1,180 sq ft reinforced concrete unit built in 2004. Low fire risk, minimal flood zone, but coastal exposure.", "coverage_grade": "B-", "risk_score": 45}'::jsonb,
 '{"recommendations": [{"priority": "high", "title": "Increase Loss Assessment Coverage", "description": "Current loss assessment limit of $2,000 is far below industry recommendations. For a coastal condo, $50,000–$100,000 is recommended to cover potential HOA special assessments following building damage from storms or earthquakes."}, {"priority": "medium", "title": "Consider Flood Coverage", "description": "While FEMA classifies this zone as minimal risk, coastal proximity means storm surge and urban flooding are real possibilities. An NFIP or private flood policy provides an affordable safety net."}, {"priority": "medium", "title": "Review Personal Property Limits", "description": "Current $75,000 limit may be insufficient. Create a home inventory and consider scheduling valuable items like electronics, jewelry, and art separately."}, {"priority": "low", "title": "Verify HOA Master Policy", "description": "Confirm what your condo association''s master policy covers (building exterior, common areas, liability). Your HO-6 should fill in gaps left by the master policy."}], "overall_assessment": "This HO-6 policy provides a solid foundation but has a critical gap in loss assessment coverage that could leave you financially exposed if your HOA levies a special assessment. The coastal location also warrants consideration of flood coverage. Overall risk is moderate."}'::jsonb,
 NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- MANUAL STEP: Create the demo user in Supabase Auth Dashboard
-- Go to Authentication > Add User in Supabase Dashboard:
--   Email: demo-client@gapguard.com
--   Password: DemoClient2026!
-- Then run the INSERT below using the UUID Supabase generated for the auth user.
-- Replace <AUTH_USER_UUID> with the actual UUID from the Auth tab.
-- ============================================================================

 5. Link the demo auth user to an account record with 'customer' role
 INSERT INTO accounts (id, email, first_name, last_name, phone, role)
 VALUES (
     '439e3986-a8e8-48ec-9127-9ecc6cf63657',
     'demo-client@gapguard.com',
     'Jane',
     'Demo',
     '(555) 123-4567',
     'customer'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- ROUTES:
--   Demo client portal: /portal (after logging in as demo-client@gapguard.com)
--   Policy 1: /policy/00000000-0000-4000-b000-000000000001  (HO-3 Beverly Hills)
--   Policy 2: /policy/00000000-0000-4000-b000-000000000002  (HO-6 Santa Monica)
-- Dashboard KPIs will automatically exclude is_demo=true records.
-- ============================================================================
