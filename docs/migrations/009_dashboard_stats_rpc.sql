-- Migration: Add dashboard_stats RPC function
-- Purpose: Replace client-side aggregate queries with a single server-side function.
-- Run:     Execute in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- Date:    2026-08-13

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $fn$
DECLARE
    v_total_policies     INT;
    v_pending_review     INT;
    v_high_policies      INT;
    v_total_high_flags   INT;
    v_missing_dic        INT;
    v_unenriched         INT;
    v_other_structures   INT;
    v_renewals_14_days   INT;
    v_demo_client_id     UUID := '00000000-0000-4000-a000-000000000001';
    v_inactive_statuses  TEXT[] := ARRAY['expired', 'cancelled', 'non_renewed'];
    v_today              DATE := CURRENT_DATE;
    v_fourteen_days      DATE := CURRENT_DATE + INTERVAL '14 days';
BEGIN
    -- 1. Total active, non-demo policies
    SELECT COUNT(*)
    INTO v_total_policies
    FROM policies p
    JOIN clients c ON c.id = p.client_id
    WHERE c.is_demo = false
      AND NOT (p.status = ANY(v_inactive_statuses));

    -- 2. Pending review (active only)
    SELECT COUNT(*)
    INTO v_pending_review
    FROM policies p
    JOIN clients c ON c.id = p.client_id
    WHERE c.is_demo = false
      AND NOT (p.status = ANY(v_inactive_statuses))
      AND p.status IN ('pending_review', 'unknown');

    -- 3 and 4. High/critical flags on active policies
    SELECT
        COUNT(DISTINCT pf.policy_id),
        COUNT(*)
    INTO v_high_policies, v_total_high_flags
    FROM policy_flags pf
    JOIN policies p ON p.id = pf.policy_id
    JOIN clients c ON c.id = p.client_id
    WHERE pf.status = 'open'
      AND pf.severity IN ('high', 'critical')
      AND c.is_demo = false
      AND NOT (p.status = ANY(v_inactive_statuses));

    -- 5. Missing DIC
    SELECT COUNT(DISTINCT pf.policy_id)
    INTO v_missing_dic
    FROM policy_flags pf
    JOIN policies p ON p.id = pf.policy_id
    JOIN clients c ON c.id = p.client_id
    WHERE pf.status = 'open'
      AND pf.code = 'NO_DIC'
      AND c.is_demo = false
      AND NOT (p.status = ANY(v_inactive_statuses));

    -- 6. Other Structures Zero
    SELECT COUNT(DISTINCT pf.policy_id)
    INTO v_other_structures
    FROM policy_flags pf
    JOIN policies p ON p.id = pf.policy_id
    JOIN clients c ON c.id = p.client_id
    WHERE pf.status = 'open'
      AND pf.code = 'OTHER_STRUCTURES_ZERO'
      AND c.is_demo = false
      AND NOT (p.status = ANY(v_inactive_statuses));

    -- 7. Unenriched active policies (no rows in property_enrichments)
    SELECT COUNT(*)
    INTO v_unenriched
    FROM policies p
    JOIN clients c ON c.id = p.client_id
    WHERE c.is_demo = false
      AND NOT (p.status = ANY(v_inactive_statuses))
      AND NOT EXISTS (
          SELECT 1 FROM property_enrichments pe WHERE pe.policy_id = p.id
      );

    -- 8. Renewals in next 14 days
    SELECT COUNT(*)
    INTO v_renewals_14_days
    FROM policy_terms pt
    WHERE pt.is_current = true
      AND pt.expiration_date >= v_today
      AND pt.expiration_date <= v_fourteen_days;

    RETURN json_build_object(
        'totalPolicies',    v_total_policies,
        'pendingReview',    v_pending_review,
        'highPolicies',     v_high_policies,
        'totalHighFlags',   v_total_high_flags,
        'missingDic',       v_missing_dic,
        'unenriched',       v_unenriched,
        'otherStructures',  v_other_structures,
        'renewals14Days',   v_renewals_14_days
    );
END;
$fn$;

GRANT EXECUTE ON FUNCTION get_dashboard_stats() TO anon, authenticated;

COMMENT ON FUNCTION get_dashboard_stats() IS 'Returns dashboard KPI counts as a single JSON object. Replaces client-side aggregate queries that previously downloaded all data to the browser.';
