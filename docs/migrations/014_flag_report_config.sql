-- =============================================================================
-- Migration 014: Flag Report Configuration
-- Adds report_enabled + report_prompt_hint to flag_definitions
-- Creates report_config_changelog for stale-report detection
-- =============================================================================

-- 1. Add report configuration columns to flag_definitions
ALTER TABLE public.flag_definitions
  ADD COLUMN IF NOT EXISTS report_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_prompt_hint text NULL;

COMMENT ON COLUMN public.flag_definitions.report_enabled IS
  'When true, the AI report generator MUST address this flag if it is open on the policy. When false, the AI must NOT mention it.';

COMMENT ON COLUMN public.flag_definitions.report_prompt_hint IS
  'Freeform instruction guiding how the AI should frame this flag in the client report (tone, angle, emphasis).';

-- 2. Changelog table for tracking config version (stale report detection)
CREATE TABLE IF NOT EXISTS public.report_config_changelog (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  version_number integer NOT NULL,
  changed_by uuid NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changes jsonb NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE public.report_config_changelog IS
  'Tracks when flag reporting configuration changes. Used to detect stale reports generated before config updates.';

-- Seed initial version
INSERT INTO report_config_changelog (version_number, changes)
VALUES (1, '{"event": "initial_setup"}');

-- 3. RLS policies
ALTER TABLE public.report_config_changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read config changelog"
  ON public.report_config_changelog FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role can manage config changelog"
  ON public.report_config_changelog FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 4. Enable some sensible default flags for reporting
UPDATE public.flag_definitions SET report_enabled = true, report_prompt_hint = 'Emphasize that $0 Other Structures means detached structures such as pools, sheds, fences, and detached garages have zero coverage in a total loss event.' WHERE code = 'OTHER_STRUCTURES_ZERO';
UPDATE public.flag_definitions SET report_enabled = true, report_prompt_hint = 'Explain that the Dwelling limit appears significantly below the estimated replacement cost, which could result in a substantial shortfall if the home needs to be fully rebuilt.' WHERE code = 'SEVERE_UNDERINSURANCE_ESTIMATE';
UPDATE public.flag_definitions SET report_enabled = true, report_prompt_hint = 'Explain that a Difference in Conditions (DIC) policy provides earthquake and flood coverage that the base FAIR Plan policy does not include.' WHERE code = 'NO_DIC';
UPDATE public.flag_definitions SET report_enabled = true, report_prompt_hint = 'Note that Other Structures coverage is $0 but satellite imagery detected what appears to be solar panels on the property, which may require separate coverage consideration.' WHERE code = 'SOLAR_PANELS_NOT_COVERED';
UPDATE public.flag_definitions SET report_enabled = true, report_prompt_hint = 'Note that Other Structures coverage is $0 but satellite imagery detected what appears to be a swimming pool, which may need liability and property coverage consideration.' WHERE code = 'POOL_LIABILITY_GAP';
UPDATE public.flag_definitions SET report_enabled = true, report_prompt_hint = 'Note that Ordinance or Law coverage helps pay for building code upgrades required during rebuilding after a covered loss.' WHERE code = 'MISSING_ORDINANCE_OR_LAW';
UPDATE public.flag_definitions SET report_enabled = true, report_prompt_hint = 'Note that Replacement Cost coverage ensures the dwelling is rebuilt at current construction costs rather than depreciated value.' WHERE code = 'DWELLING_RC_NOT_INCLUDED';
UPDATE public.flag_definitions SET report_enabled = true, report_prompt_hint = 'Note that Fair Rental Value coverage provides funds for temporary living expenses if the home becomes uninhabitable after a covered loss.' WHERE code = 'FAIR_RENTAL_VALUE_ZERO_OR_MISSING';
