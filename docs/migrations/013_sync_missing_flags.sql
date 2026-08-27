-- This script will insert any missing flags (like the newly created Personal Property or Missing Perils logic)
-- into the flag_definitions table so that they appear on the Flag Catalog page.
-- It also safely updates existing flags with trigger logic if they are missing it.

INSERT INTO public.flag_definitions 
(code, label, default_severity, category, entity_scope, auto_resolve, is_manual_allowed, is_active, trigger_logic, description)
VALUES 
-- System Data Quality Flags
('MISSING_POLICY_NUMBER', 'Missing Policy Number', 'low', 'Data Quality', 'policy', true, false, true, 'missing_fields[] contains "policy_number"', 'Policy number was not automatically extracted'),
('MISSING_PROPERTY_LOCATION', 'Missing Property Location', 'low', 'Data Quality', 'policy', true, false, true, 'extracted_data.property_location is missing', 'Property location was not extracted'),
('ECM_PREMIUM_MISSING_OR_ZERO', 'Premium Missing or Zero', 'high', 'Data Quality', 'policy', true, false, true, 'Premium is missing or $0', 'Annual premium is missing or $0'),

-- Coverage Gaps (Original)
('MISSING_DWELLING_LIMIT', 'Missing Dwelling Limit', 'high', 'Coverage Gap', 'policy', true, false, true, 'limit_dwelling is null or $0', 'Dwelling coverage limit is missing or $0'),
('MISSING_ORDINANCE_OR_LAW', 'Missing Ordinance or Law', 'medium', 'Coverage Gap', 'policy', true, false, true, 'limit_ordinance_or_law is null or $0', 'Ordinance or law coverage is missing'),
('MISSING_EXTENDED_DWELLING', 'Missing Extended Dwelling Coverage', 'medium', 'Coverage Gap', 'policy', true, false, true, 'limit_extended_dwelling is null or $0', 'Extended dwelling coverage is missing'),
('MISSING_DWELLING_REPLACEMENT_COST', 'Missing Dwelling Replacement Cost', 'medium', 'Coverage Gap', 'policy', true, false, true, 'limit_dwelling_replacement_cost is null or $0', 'Dwelling replacement cost is missing'),
('MISSING_PERSONAL_PROPERTY_REPLACEMENT_COST', 'Missing Personal Property RC', 'medium', 'Coverage Gap', 'policy', true, false, true, 'limit_personal_property_replacement_cost is null or $0', 'Personal property replacement cost is missing'),
('MISSING_FENCES_COVERAGE', 'Missing Fences Coverage', 'low', 'Coverage Gap', 'policy', true, false, true, 'limit_fences is null or $0', 'Fences coverage is missing'),
('MORTGAGEE_PRESENT_DWELLING_ZERO', 'Mortgagee Present, Dwelling $0', 'medium', 'Coverage Gap', 'policy', false, false, true, 'Mortgagee is present but dwelling coverage is $0', 'Mortgagee on policy but dwelling coverage is $0'),
('NO_DIC', 'DIC Not on File', 'high', 'DIC', 'policy', true, false, true, 'policy_terms.dic_exists is explicitly false', 'DIC coverage is not on file for this policy term'),
('DWELLING_RC_NOT_INCLUDED', 'Dwelling RC Not Included', 'high', 'Coverage Gap', 'policy', false, false, true, 'limit_dwelling_replacement_cost equals not included', 'Dwelling replacement cost is explicitly not included'),
('DWELLING_RC_INCLUDED_LOW_ORDINANCE', 'RC Included, Low Ordinance/Law', 'medium', 'Coverage Gap', 'policy', true, false, true, 'RC is included but Ordinance/Law limit is low', 'Replacement cost included but ordinance/law is low'),
('FAIR_RENTAL_VALUE_ZERO_OR_MISSING', 'Fair Rental Value Zero or Missing', 'high', 'Coverage Gap', 'policy', true, false, true, 'limit_fair_rental_value is $0 or missing', 'Fair rental value coverage is $0 or missing'),
('OTHER_STRUCTURES_ZERO', 'Other Structures $0', 'high', 'Coverage Gap', 'policy', true, false, true, 'limit_other_structures is $0 but structures exist', 'Other structures coverage is $0, but enrichment detected structures.'),

-- New Personal Property Split Flags
('PERSONAL_PROPERTY_LOW_OWNER_OCCUPIED', 'Personal Property Below 30% of Dwelling (Owner-Occupied)', 'medium', 'Coverage Gap', 'policy', true, false, true, 'Occupancy is owner and Personal Property is < 30% of Dwelling Limit', 'Personal property coverage is extremely low for an owner-occupied property.'),
('PERSONAL_PROPERTY_LOW_TENANT_OCCUPIED', 'Personal Property Below 10% of Dwelling (Tenant-Occupied)', 'low', 'Coverage Gap', 'policy', true, false, true, 'Occupancy is tenant and Personal Property is < 10% of Dwelling Limit', 'Personal property coverage is extremely low for a tenant-occupied property.'),

-- New Perils & Debris & Roof & Inflation
('MISSING_PERILS_INSURED', 'Missing Perils Insured Against', 'high', 'Data Quality', 'policy', true, false, true, 'perils_insured_against array is empty or missing completely', 'The policy is missing critical details about which perils it insures against.'),
('MISSING_DEBRIS_REMOVAL', 'Missing Debris Removal Coverage', 'high', 'Coverage Gap', 'policy', true, false, true, 'limit_debris_removal is empty, missing, or $0', 'Debris removal coverage is missing or $0.'),
('YOUNG_ROOF_WITHOUT_RC', 'Young Roof without Replacement Cost', 'medium', 'Coverage Gap', 'policy', true, false, true, 'Roof is < 25 years old but Dwelling Replacement Cost is NOT included', 'Structure is relatively new (< 25 years) but is inexplicably missing replacement cost coverage.'),
('INFLATION_GUARD_NOT_INCLUDED', 'Inflation Guard Not Included', 'medium', 'Coverage Gap', 'policy', true, false, true, 'limit_inflation_guard is negative, false, or 0', 'Inflation guard coverage is not included on this policy.'),
('SOLAR_PANELS_NOT_COVERED', 'Solar Panels Detected — Coverage Gap Possible', 'medium', 'Coverage Gap', 'policy', false, false, true, 'ai_solar_panels=detected AND Other Structures is missing or $0', 'Satellite imagery detected solar panels, but Other Structures coverage is $0 or missing. Solar equipment may need dedicated coverage or an endorsement.'),

-- Standard Utilities
('MOBILE_OR_MANUFACTURED_WITH_RC_INCLUDED', 'Mobile/Manufactured Home w/ RC Included', 'low', 'Coverage Gap', 'policy', false, false, true, 'construction_type=mobile AND RC=included', 'Mobile/manufactured home has replacement cost included'),
('ROOF_AGE_OVER_25_WITH_RC_INCLUDED', 'Roof Age >25 Years w/ RC Included', 'low', 'Coverage Gap', 'policy', false, false, true, 'Roof age >= 25 AND RC=included', 'Structure >25 years old with replacement cost included'),
('DUPLICATE_ID_IN_TABLE', 'Possible Duplicate Policy', 'low', 'Duplicate', 'policy', false, false, true, 'Count policies where policy_number matches > 1', 'Another policy exists with the same policy number'),
('PARSER_EXTRACTION_FAILURE', 'Extraction Failure', 'low', 'Parser', 'policy', true, false, true, 'missing_fields[] length > 0', 'Document parser could not extract one or more fields'),
('RENEWAL_UPCOMING', 'Renewal Upcoming', 'low', 'Renewal', 'policy', true, false, true, 'expiration_date < 21 days out', 'Policy term expires within 21 days'),
('MANUAL_FLAG', 'Manual Flag', 'low', 'Manual', 'policy', false, true, true, 'Manually created by user', 'Staff-created flag for any purpose'),
('MANUAL_CLIENT_FLAG', 'Manual Client Flag', 'low', 'Manual', 'client', false, true, true, 'Manually created by user on client', 'Staff-created flag on a client')

ON CONFLICT (code) DO UPDATE 
SET 
  -- Just in case we missed updating a priority during the previous migration 
  -- or we want to ensure descriptions/logic are populated:
  description = COALESCE(flag_definitions.description, EXCLUDED.description),
  trigger_logic = COALESCE(flag_definitions.trigger_logic, EXCLUDED.trigger_logic);

-- Forcefully update the OTHER_STRUCTURES_ZERO flag to guarantee high priority and correct, explicit logic documentation.
UPDATE public.flag_definitions
SET 
    default_severity = 'high',
    trigger_logic = 'Flags ONLY IF limit_other_structures is missing or $0 AND AI detects structures (solar panels, pool, deck, shed, or detached garage)',
    description = 'Other structures coverage is missing or $0, but enrichment data confirms structures exist on the property.'
WHERE code = 'OTHER_STRUCTURES_ZERO';
