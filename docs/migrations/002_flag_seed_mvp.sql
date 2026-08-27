-- ============================================================================
-- Flag System — MVP Rollout Seed
-- Run AFTER 001_flag_system_phase1.sql
-- Idempotent: uses ON CONFLICT DO NOTHING
-- ============================================================================

-- ============================================================================
-- 1. Ensure all MVP flag_definitions exist
-- This is a safety re-seed. If 001 was already applied, these are no-ops.
-- ============================================================================
INSERT INTO public.flag_definitions (code, label, description, category, default_severity, entity_scope, auto_resolve, is_manual_allowed, default_action_path) VALUES
    -- ── MVP-ACTIVE rules (evaluated by worker on every doc ingestion) ──────
    -- Data quality — Critical
    ('MISSING_POLICY_NUMBER',                    'Missing Policy Number',               'Policy number was not extracted from the declaration page.',     'data_quality',  'critical', 'policy', true,  false, NULL),
    ('MISSING_PROPERTY_LOCATION',                'Missing Property Location',            'Property location was not extracted.',                          'data_quality',  'critical', 'policy', true,  false, NULL),
    ('MISSING_DWELLING_LIMIT',                   'Missing Dwelling Limit',               'Dwelling coverage limit is missing or empty.',                  'data_quality',  'critical', 'policy', true,  false, NULL),

    -- Coverage/DIC — High
    ('NO_DIC',                                   'DIC Not on File',                      'DIC coverage is not on file for this policy term.',             'dic',           'high',     'policy', false, false, NULL),

    -- Renewal — High
    ('RENEWAL_UPCOMING',                         'Renewal Upcoming',                     'Policy term expires within 21 days.',                           'renewal',       'high',     'policy', true,  false, NULL),

    -- Duplicate — Warning
    ('DUPLICATE_ID_IN_TABLE',                    'Possible Duplicate Policy',            'Another policy exists with the same policy number.',            'duplicate',     'warning',  'policy', false, false, NULL),

    -- ── MVP-ACTIVE but NOT in the 8 first-rules list (bonus coverage) ─────
    ('MISSING_ORDINANCE_OR_LAW',                 'Missing Ordinance or Law',             'Ordinance or law coverage is missing.',                         'coverage_gap',  'critical', 'policy', true,  false, NULL),
    ('MISSING_EXTENDED_DWELLING',                'Missing Extended Dwelling Coverage',   'Extended dwelling coverage is missing.',                        'coverage_gap',  'critical', 'policy', true,  false, NULL),
    ('MISSING_DWELLING_REPLACEMENT_COST',        'Missing Dwelling Replacement Cost',    'Dwelling replacement cost is missing.',                         'coverage_gap',  'critical', 'policy', true,  false, NULL),
    ('MISSING_PERSONAL_PROPERTY_REPLACEMENT_COST','Missing Personal Property RC',        'Personal property replacement cost is missing.',                'coverage_gap',  'critical', 'policy', true,  false, NULL),
    ('MISSING_FENCES_COVERAGE',                  'Missing Fences Coverage',              'Fences coverage is missing. (Parser does not yet extract this.)', 'coverage_gap','critical', 'policy', true,  false, NULL),
    ('MISSING_PERSONAL_PROPERTY_COVERAGE_C',     'Missing Personal Property (Cov C)',    'Personal property Coverage C is missing.',                      'coverage_gap',  'critical', 'policy', true,  false, NULL),
    ('DWELLING_RC_NOT_INCLUDED',                 'Dwelling RC Not Included',             'Dwelling replacement cost is not included.',                    'coverage_gap',  'high',     'policy', false, false, NULL),
    ('DWELLING_RC_INCLUDED_LOW_ORDINANCE',       'RC Included, Low Ordinance/Law',       'Replacement cost included but ordinance/law is low.',           'coverage_gap',  'high',     'policy', true,  false, NULL),
    ('FAIR_RENTAL_VALUE_ZERO_OR_MISSING',        'Fair Rental Value Zero or Missing',    'Fair rental value coverage is $0 or missing.',                  'coverage_gap',  'high',     'policy', true,  false, NULL),
    ('INFLATION_GUARD_NOT_INCLUDED',             'Inflation Guard Not Included',         'Inflation guard is not included or missing.',                   'coverage_gap',  'high',     'policy', true,  false, NULL),
    ('ECM_PREMIUM_MISSING_OR_ZERO',              'Premium Missing or Zero',              'Annual premium is missing or $0.',                              'data_quality',  'high',     'policy', true,  false, NULL),
    ('OTHER_STRUCTURES_ZERO',                    'Other Structures $0',                  'Other structures coverage is $0.',                              'coverage_gap',  'warning',  'policy', true,  false, NULL),
    ('PERSONAL_PROPERTY_ZERO_OWNER_OCCUPIED',    'Personal Property $0 (Owner-Occupied)','Personal property is $0 for owner-occupied property.',          'coverage_gap',  'warning',  'policy', true,  false, NULL),
    ('MOBILE_OR_MANUFACTURED_WITH_RC_INCLUDED',  'Mobile/Manufactured Home w/ RC',       'Mobile/manufactured home has replacement cost included.',       'coverage_gap',  'warning',  'policy', false, false, NULL),
    ('ROOF_AGE_OVER_25_WITH_RC_INCLUDED',        'Roof Age >25 Years w/ RC',             'Structure >25 years old with replacement cost included.',       'coverage_gap',  'warning',  'policy', false, false, NULL),
    ('MORTGAGEE_PRESENT_DWELLING_ZERO',          'Mortgagee Present, Dwelling $0',       'Mortgagee on policy but dwelling coverage is $0.',              'coverage_gap',  'critical', 'policy', false, false, NULL),

    -- ── MVP-DEFERRED (seeded but NOT evaluated yet) ───────────────────────
    ('MISSING_EMAIL',                            'Missing Client Email',                 'Client has no email on file. Deferred: clients table needs email column.', 'data_quality', 'high', 'client', true, false, NULL),
    ('MISSING_PHONE',                            'Missing Client Phone',                 'Client has no phone on file. Deferred: clients table needs phone column.', 'data_quality', 'high', 'client', true, false, NULL),

    -- ── Manual (always available) ─────────────────────────────────────────
    ('MANUAL_FLAG',                              'Manual Flag',                          'Staff-created flag for any purpose.',                           'manual',        'info',     'policy', false, true,  NULL),
    ('MANUAL_CLIENT_FLAG',                       'Manual Client Flag',                   'Staff-created flag on a client.',                               'manual',        'info',     'client', false, true,  NULL),

    -- ── Parser ────────────────────────────────────────────────────────────
    ('PARSER_EXTRACTION_FAILURE',                'Extraction Failure',                   'Document parser could not extract one or more fields.',         'parser',        'warning',  'policy', true,  false, NULL)

ON CONFLICT (code) DO UPDATE SET
    label           = EXCLUDED.label,
    description     = EXCLUDED.description,
    category        = EXCLUDED.category,
    default_severity = EXCLUDED.default_severity,
    entity_scope    = EXCLUDED.entity_scope,
    auto_resolve    = EXCLUDED.auto_resolve,
    is_manual_allowed = EXCLUDED.is_manual_allowed,
    default_action_path = EXCLUDED.default_action_path;

-- ============================================================================
-- 2. Verification queries (run manually)
-- ============================================================================
-- SELECT code, label, category, default_severity, auto_resolve FROM public.flag_definitions ORDER BY code;
-- SELECT count(*) FROM public.flag_definitions;
-- Expected: 26 definitions
