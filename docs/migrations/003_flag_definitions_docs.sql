-- ============================================================================
-- Flag Definitions — Documentation Columns
-- Run AFTER 002_flag_seed_mvp.sql
-- Adds trigger_logic, data_fields_checked, dec_page_section,
-- suppression_rules, and notes columns to flag_definitions.
-- Then seeds them with comprehensive documentation for all flags.
-- ============================================================================

-- ============================================================================
-- 1. ADD COLUMNS
-- ============================================================================
ALTER TABLE public.flag_definitions
    ADD COLUMN IF NOT EXISTS trigger_logic text NULL;

ALTER TABLE public.flag_definitions
    ADD COLUMN IF NOT EXISTS data_fields_checked text NULL;

ALTER TABLE public.flag_definitions
    ADD COLUMN IF NOT EXISTS dec_page_section text NULL;

ALTER TABLE public.flag_definitions
    ADD COLUMN IF NOT EXISTS suppression_rules text NULL;

ALTER TABLE public.flag_definitions
    ADD COLUMN IF NOT EXISTS notes text NULL;

-- ============================================================================
-- 2. SEED DOCUMENTATION DATA
-- ============================================================================

-- ── CRITICAL ─────────────────────────────────────────────────────────────────

UPDATE public.flag_definitions SET
    trigger_logic = 'Fires when "policy_number" appears in the missing_fields list returned by the document parser. The parser outputs a list of fields it could NOT find in the uploaded dec page.',
    data_fields_checked = 'missing_fields[] → "policy_number"',
    dec_page_section = 'Header / Top of Dec Page',
    suppression_rules = 'None',
    notes = 'Auto-resolves if a re-parse extracts the policy number successfully.'
WHERE code = 'MISSING_POLICY_NUMBER';

UPDATE public.flag_definitions SET
    trigger_logic = 'Fires when the extracted_data field "property_location" is null, empty string, "0", "$0", "$0.00", or "None". Checks extracted_data first, then falls back to policy_term and client records.',
    data_fields_checked = 'extracted_data.property_location, policy_terms.property_location, clients.property_location',
    dec_page_section = 'Property / Location Section',
    suppression_rules = 'None',
    notes = ''
WHERE code = 'MISSING_PROPERTY_LOCATION';

UPDATE public.flag_definitions SET
    trigger_logic = 'Fires when the extracted field "limit_dwelling" is null, empty, "0", "$0", "$0.00", or "None".',
    data_fields_checked = 'extracted_data.limit_dwelling',
    dec_page_section = 'Coverages — Coverage A (Dwelling)',
    suppression_rules = 'None',
    notes = ''
WHERE code = 'MISSING_DWELLING_LIMIT';

UPDATE public.flag_definitions SET
    trigger_logic = 'Fires when "limit_ordinance_or_law" is null, empty, "0", "$0", "$0.00", or "None".',
    data_fields_checked = 'extracted_data.limit_ordinance_or_law',
    dec_page_section = 'Coverages — Ordinance or Law',
    suppression_rules = 'None',
    notes = ''
WHERE code = 'MISSING_ORDINANCE_OR_LAW';

UPDATE public.flag_definitions SET
    trigger_logic = 'Fires when "limit_extended_dwelling_coverage" is null, empty, "0", "$0", "$0.00", or "None".',
    data_fields_checked = 'extracted_data.limit_extended_dwelling_coverage',
    dec_page_section = 'Coverages — Extended Dwelling',
    suppression_rules = 'None',
    notes = ''
WHERE code = 'MISSING_EXTENDED_DWELLING';

UPDATE public.flag_definitions SET
    trigger_logic = 'Fires when "limit_dwelling_replacement_cost" is null, empty, "0", "$0", "$0.00", or "None". SUPPRESSED for mobile/manufactured homes or addresses containing SPC/SPACE/UNIT keywords.',
    data_fields_checked = 'extracted_data.limit_dwelling_replacement_cost, extracted_data.construction_type, extracted_data.property_location',
    dec_page_section = 'Coverages — Dwelling Replacement Cost',
    suppression_rules = 'Suppressed if construction_type contains "mobile" or "manufactured", OR if property_location contains "SPC", "SPACE", or "UNIT".',
    notes = 'Mobile homes and SPC/Unit addresses (condos, manufactured) typically use ACV, not RC.'
WHERE code = 'MISSING_DWELLING_REPLACEMENT_COST';

UPDATE public.flag_definitions SET
    trigger_logic = 'Fires when "limit_personal_property_replacement_cost" is null, empty, "0", "$0", "$0.00", or "None". SUPPRESSED for mobile/manufactured homes or SPC/Unit addresses.',
    data_fields_checked = 'extracted_data.limit_personal_property_replacement_cost, extracted_data.construction_type, extracted_data.property_location',
    dec_page_section = 'Coverages — Personal Property RC',
    suppression_rules = 'Same as MISSING_DWELLING_REPLACEMENT_COST (mobile/manufactured + SPC/Unit suppression).',
    notes = ''
WHERE code = 'MISSING_PERSONAL_PROPERTY_REPLACEMENT_COST';

UPDATE public.flag_definitions SET
    trigger_logic = 'Fires when "limit_fences" is null, empty, "0", "$0", "$0.00", or "None".',
    data_fields_checked = 'extracted_data.limit_fences',
    dec_page_section = 'Coverages — Fences',
    suppression_rules = 'None',
    notes = 'Parser does not yet reliably extract this field from all dec page formats. May fire frequently.'
WHERE code = 'MISSING_FENCES_COVERAGE';

UPDATE public.flag_definitions SET
    trigger_logic = 'Fires when "limit_personal_property" is null, empty, "0", "$0", "$0.00", or "None".',
    data_fields_checked = 'extracted_data.limit_personal_property',
    dec_page_section = 'Coverages — Coverage C (Personal Property)',
    suppression_rules = 'None',
    notes = ''
WHERE code = 'MISSING_PERSONAL_PROPERTY_COVERAGE_C';

UPDATE public.flag_definitions SET
    trigger_logic = 'Two-step check: (1) Checks if "mortgagee_1_name" is present (non-null/non-empty). If no mortgagee, flag does NOT fire. (2) If mortgagee IS present, checks "limit_dwelling" — fires if missing or $0.',
    data_fields_checked = 'extracted_data.mortgagee_1_name, extracted_data.limit_dwelling',
    dec_page_section = 'Mortgagee Section + Coverages — Coverage A (Dwelling)',
    suppression_rules = 'None',
    notes = 'Does NOT auto-resolve — requires agent review because a mortgagee with $0 dwelling is a serious data or coverage issue.'
WHERE code = 'MORTGAGEE_PRESENT_DWELLING_ZERO';

-- ── HIGH ─────────────────────────────────────────────────────────────────────

UPDATE public.flag_definitions SET
    trigger_logic = 'Checks policy_term.dic_exists boolean. Fires if dic_exists is explicitly False. Also checks extracted_data.dic_exists for string values "false", "no", "0".',
    data_fields_checked = 'policy_terms.dic_exists, extracted_data.dic_exists',
    dec_page_section = 'DIC / Additional Coverage',
    suppression_rules = 'None',
    notes = 'Does NOT auto-resolve — agent must manually confirm DIC status.'
WHERE code = 'NO_DIC';

UPDATE public.flag_definitions SET
    trigger_logic = 'Fires when "limit_dwelling_replacement_cost" exists but equals "not included", "no", "false", or "excluded" (case-insensitive). SUPPRESSED for mobile/manufactured + SPC/Unit.',
    data_fields_checked = 'extracted_data.limit_dwelling_replacement_cost, extracted_data.construction_type, extracted_data.property_location',
    dec_page_section = 'Coverages — Dwelling Replacement Cost',
    suppression_rules = 'Same RC suppression: mobile/manufactured + SPC/Unit addresses.',
    notes = 'Only fires when the field EXISTS but value indicates RC is not included. If missing entirely, MISSING_DWELLING_REPLACEMENT_COST fires instead.'
WHERE code = 'DWELLING_RC_NOT_INCLUDED';

UPDATE public.flag_definitions SET
    trigger_logic = 'Two-step: (1) Checks "limit_dwelling_replacement_cost" contains "included" or "yes". (2) If RC IS included, checks "limit_ordinance_or_law" — fires if missing OR if numeric value < 10 (percent or dollar). SUPPRESSED for mobile/manufactured + SPC/Unit.',
    data_fields_checked = 'extracted_data.limit_dwelling_replacement_cost, extracted_data.limit_ordinance_or_law, extracted_data.construction_type, extracted_data.property_location',
    dec_page_section = 'Coverages — Dwelling RC + Ordinance or Law',
    suppression_rules = 'Same RC suppression: mobile/manufactured + SPC/Unit addresses.',
    notes = ''
WHERE code = 'DWELLING_RC_INCLUDED_LOW_ORDINANCE';

UPDATE public.flag_definitions SET
    trigger_logic = 'Fires when "limit_fair_rental_value" is null/empty (→ "missing") OR when it parses to a numeric value ≤ 0 after stripping $ and commas.',
    data_fields_checked = 'extracted_data.limit_fair_rental_value',
    dec_page_section = 'Coverages — Fair Rental Value',
    suppression_rules = 'None',
    notes = ''
WHERE code = 'FAIR_RENTAL_VALUE_ZERO_OR_MISSING';

UPDATE public.flag_definitions SET
    trigger_logic = 'Fires when "limit_inflation_guard" is null, empty, or equals "not included", "no", "false", "excluded", "0", "$0", "$0.00", "none" (case-insensitive).',
    data_fields_checked = 'extracted_data.limit_inflation_guard',
    dec_page_section = 'Coverages — Inflation Guard',
    suppression_rules = 'None',
    notes = ''
WHERE code = 'INFLATION_GUARD_NOT_INCLUDED';

UPDATE public.flag_definitions SET
    trigger_logic = 'Checks "total_annual_premium" (extracted) OR "annual_premium" (from policy_terms table). Fires if both are missing, OR if the value parses to ≤ 0.',
    data_fields_checked = 'extracted_data.total_annual_premium, policy_terms.annual_premium',
    dec_page_section = 'Premium Summary',
    suppression_rules = 'None',
    notes = ''
WHERE code = 'ECM_PREMIUM_MISSING_OR_ZERO';

UPDATE public.flag_definitions SET
    trigger_logic = 'Checks "expiration_date" from policy_terms table, or "policy_period_end" from extracted_data. Parses the date and calculates days until expiration. Fires when 0 ≤ days_until ≤ 21.',
    data_fields_checked = 'policy_terms.expiration_date, extracted_data.policy_period_end',
    dec_page_section = 'Policy Period / Term Dates',
    suppression_rules = 'None',
    notes = 'Auto-resolves once the expiration date is > 21 days away (e.g., after renewal is processed with new term).'
WHERE code = 'RENEWAL_UPCOMING';

-- ── WARNING ──────────────────────────────────────────────────────────────────

UPDATE public.flag_definitions SET
    trigger_logic = 'Fires when "limit_other_structures" exists (non-null) AND parses to a numeric value ≤ 0 after stripping $ and commas. Does NOT fire if field is missing.',
    data_fields_checked = 'extracted_data.limit_other_structures',
    dec_page_section = 'Coverages — Coverage B (Other Structures)',
    suppression_rules = 'None',
    notes = ''
WHERE code = 'OTHER_STRUCTURES_ZERO';

UPDATE public.flag_definitions SET
    trigger_logic = 'Two-step: (1) Checks "occupancy" — only fires for owner-occupied (string contains "owner"). If occupancy is tenant or rental, skips. (2) Checks "limit_personal_property" — fires if it exists and parses to ≤ 0.',
    data_fields_checked = 'extracted_data.occupancy, extracted_data.limit_personal_property',
    dec_page_section = 'Occupancy + Coverages — Coverage C',
    suppression_rules = 'Skipped entirely if occupancy does not contain "owner".',
    notes = '$0 personal property is normal for landlord/rental policies, but suspicious for owner-occupied.'
WHERE code = 'PERSONAL_PROPERTY_ZERO_OWNER_OCCUPIED';

UPDATE public.flag_definitions SET
    trigger_logic = 'Two-step: (1) Checks "construction_type" for "mobile" or "manufactured" (case-insensitive). (2) Checks "limit_dwelling_replacement_cost" for "included" or "yes". Fires only if BOTH are true.',
    data_fields_checked = 'extracted_data.construction_type, extracted_data.limit_dwelling_replacement_cost',
    dec_page_section = 'Property Info (Construction Type) + Coverages (Dwelling RC)',
    suppression_rules = 'None (this IS the mobile-home check, not suppressed).',
    notes = 'Does NOT auto-resolve — agent should verify if RC eligibility is accurate for mobile/manufactured.'
WHERE code = 'MOBILE_OR_MANUFACTURED_WITH_RC_INCLUDED';

UPDATE public.flag_definitions SET
    trigger_logic = 'Multi-step: (1) Checks "dwelling_replacement_cost_included" for "yes"/"true"/"included"/"1". (2) If RC is included, looks up year_built — first from property_enrichments DB table (field_key="year_built"), then falls back to extracted_data.year_built. (3) Calculates roof_age = current_year − year_built. Fires if roof_age ≥ 25.',
    data_fields_checked = 'extracted_data.dwelling_replacement_cost_included, property_enrichments.year_built (DB lookup), extracted_data.year_built',
    dec_page_section = 'Coverages (Dwelling RC) + Property Info (Year Built) + Enrichment Data',
    suppression_rules = 'None',
    notes = 'Uses enrichment data (from property data enrichment pipeline) as the primary source for year_built, with parsed dec page data as a fallback.'
WHERE code = 'ROOF_AGE_OVER_25_WITH_RC_INCLUDED';

UPDATE public.flag_definitions SET
    trigger_logic = 'Queries the policies DB table for any other policy (different id) with the same policy_number. Fires if ≥ 1 match is found. Returns count of duplicates found.',
    data_fields_checked = 'extracted_data.policy_number → DB lookup: policies.policy_number (excluding current policy)',
    dec_page_section = 'Header / Policy Number',
    suppression_rules = 'None',
    notes = 'Does NOT auto-resolve — requires agent to manually verify if the duplicate is real or a false positive.'
WHERE code = 'DUPLICATE_ID_IN_TABLE';

UPDATE public.flag_definitions SET
    trigger_logic = 'Created by the ingestion pipeline when the parser returns a non-empty missing_fields list. This is a system-level flag indicating partial extraction.',
    data_fields_checked = 'missing_fields[] (the entire list from the parser)',
    dec_page_section = 'N/A — System-level flag',
    suppression_rules = 'None',
    notes = 'Auto-resolves on successful re-parse. Defined in seed SQL but triggered by the pipeline, not the flag evaluator rules directly.'
WHERE code = 'PARSER_EXTRACTION_FAILURE';

-- ── INFO (Manual) ────────────────────────────────────────────────────────────

UPDATE public.flag_definitions SET
    trigger_logic = 'Manually created by an agent/admin through the UI. No automated trigger — agent chooses when to create.',
    data_fields_checked = 'N/A — Agent discretion',
    dec_page_section = 'N/A — Manual',
    suppression_rules = 'None',
    notes = 'Can be dismissed by any agent. Not auto-resolved.'
WHERE code = 'MANUAL_FLAG';

UPDATE public.flag_definitions SET
    trigger_logic = 'Manually created by an agent/admin through the UI. Scoped to a client record rather than a specific policy.',
    data_fields_checked = 'N/A — Agent discretion',
    dec_page_section = 'N/A — Manual',
    suppression_rules = 'None',
    notes = 'Can be dismissed by any agent. Not auto-resolved.'
WHERE code = 'MANUAL_CLIENT_FLAG';

-- ── DEFERRED ─────────────────────────────────────────────────────────────────

UPDATE public.flag_definitions SET
    trigger_logic = 'DEFERRED — Not currently evaluated. Will check clients.email when clients table has email column reliably populated.',
    data_fields_checked = 'clients.email (future)',
    dec_page_section = 'N/A — Client record',
    suppression_rules = 'None',
    notes = 'Waiting on clients table schema update to add reliable email field.'
WHERE code = 'MISSING_EMAIL';

UPDATE public.flag_definitions SET
    trigger_logic = 'DEFERRED — Not currently evaluated. Will check clients.phone when clients table has phone column reliably populated.',
    data_fields_checked = 'clients.phone (future)',
    dec_page_section = 'N/A — Client record',
    suppression_rules = 'None',
    notes = 'Waiting on clients table schema update to add reliable phone field.'
WHERE code = 'MISSING_PHONE';

-- ============================================================================
-- 3. VERIFICATION
-- ============================================================================
SELECT code, label, trigger_logic IS NOT NULL AS has_logic,
       data_fields_checked IS NOT NULL AS has_fields
FROM public.flag_definitions
ORDER BY code;
