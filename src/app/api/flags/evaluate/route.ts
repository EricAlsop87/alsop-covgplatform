import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { normalizeInputs, calculateEstimate } from '@/lib/rce/InterimEstimator';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

/**
 * POST /api/flags/evaluate
 *
 * On-demand flag evaluation for a specific policy.
 * Fetches policy, current term, and client data, then runs all flag checks.
 * Creates/refreshes open flags and auto-resolves cleared conditions.
 *
 * Schema-resilient: works with both old and new policy_flags schemas.
 *
 * Priority values: high | medium | low (3-tier system)
 *
 * Body: { policy_id: string }
 */

const RULE_VERSION = '2.0.0';

interface FlagCheck {
    code: string;
    severity: string; // DB column name — stores priority values: 'high' | 'medium' | 'low'
    title: string;
    category: string;
    entity_scope: 'policy' | 'client' | 'policy_term';
    auto_resolve: boolean;
    /** If true, this flag requires dec page data or enrichment data to be meaningful */
    requires_data?: boolean;
    check: (ctx: EvalCtx) => string | null;
}

interface EvalCtx {
    policy_id: string;
    client_id: string | null;
    policy_term_id: string | null;
    data: Record<string, unknown>;
    term: Record<string, unknown>;
    client: Record<string, unknown>;
    policy: Record<string, unknown>;
    enrichments: Array<{ field_key: string; field_value: string; confidence: string; notes?: string }>;
}

function get(ctx: EvalCtx, key: string): unknown {
    return ctx.data[key] || ctx.term[key] || ctx.client[key] || ctx.policy[key] || null;
}

function isMissing(val: unknown): boolean {
    if (val === null || val === undefined) return true;
    const s = String(val).trim();
    return s === '' || s === '0' || s === '$0' || s === '$0.00' || s === 'None';
}

function isZeroOrMissing(val: unknown): boolean {
    if (val === null || val === undefined) return true;
    const cleaned = String(val).replace(/[$,]/g, '').trim();
    try {
        return parseFloat(cleaned) <= 0;
    } catch {
        return false;
    }
}

function parseNumeric(val: unknown): number | null {
    if (val === null || val === undefined) return null;
    const cleaned = String(val).replace(/[$,]/g, '').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
}

function getEnrichmentValue(ctx: EvalCtx, fieldKey: string): string | null {
    const e = ctx.enrichments.find(en => en.field_key === fieldKey);
    return e?.field_value || null;
}

/** Check if address indicates a condo/unit-style property */
function isCondoOrUnit(ctx: EvalCtx): boolean {
    const addr = String(get(ctx, 'property_location') || get(ctx, 'property_address_raw') || ctx.policy.property_address_raw || '').toLowerCase();
    const unitPatterns = ['unit ', 'unit#', 'apt ', 'apt#', 'ste ', 'suite ', 'spc ', 'space ', '#', 'condo'];
    return unitPatterns.some(p => addr.includes(p));
}

/** Check if enrichment data indicates other structures exist on the property */
function hasOtherStructuresEvidence(ctx: EvalCtx): boolean {
    const solarDetected = getEnrichmentValue(ctx, 'ai_solar_panels') === 'detected';
    const poolDetected = getEnrichmentValue(ctx, 'ai_pool') === 'detected';
    const deckDetected = getEnrichmentValue(ctx, 'ai_deck') === 'detected';
    const shedDetected = getEnrichmentValue(ctx, 'ai_shed') === 'detected';
    const garageDetected = getEnrichmentValue(ctx, 'ai_detached_garage') === 'detected';
    return solarDetected || poolDetected || deckDetected || shedDetected || garageDetected;
}

// ── Check functions ──────────────────────────────────────────

function checkMissingField(key: string, label: string) {
    return (ctx: EvalCtx): string | null => {
        if (isMissing(get(ctx, key))) return `${label} is missing or empty.`;
        return null;
    };
}

function checkNoDic(ctx: EvalCtx): string | null {
    const dic = ctx.term.dic_exists;
    // Fire when DIC is explicitly false OR when it has never been set (null/undefined).
    // A null value means the agent hasn't confirmed DIC — that is functionally unknown,
    // not confirmed-present. We surface it so agents are prompted to verify.
    if (dic === false) return 'DIC coverage is not on file for this policy term.';
    if (dic === null || dic === undefined) return 'DIC status has not been confirmed. Please verify whether DIC coverage is in place for this client.';
    return null;
}

function checkDwellingRcLowOrdinance(ctx: EvalCtx): string | null {
    const rc = get(ctx, 'limit_dwelling_replacement_cost');
    if (!rc) return null;
    const rcStr = String(rc).toLowerCase();
    if (!rcStr.includes('included') && !rcStr.includes('yes')) return null;
    const ord = get(ctx, 'limit_ordinance_or_law');
    if (!ord) return 'Replacement cost is included but ordinance or law coverage is missing.';
    const cleaned = String(ord).replace(/[$,%]/g, '').trim();
    try {
        if (parseFloat(cleaned) < 10) return 'Replacement cost is included but ordinance or law coverage is very low.';
    } catch { /* ignore */ }
    return null;
}

function checkFairRentalValue(ctx: EvalCtx): string | null {
    const val = get(ctx, 'limit_fair_rental_value');
    if (!val) return 'Fair rental value coverage is missing.';
    if (isZeroOrMissing(val)) return 'Fair rental value coverage is $0.';
    return null;
}

function checkLossOfUse(ctx: EvalCtx): string | null {
    // Check base policy loss-of-use first (Fair Rental Value is the FAIR Plan equivalent)
    const baseVal = get(ctx, 'limit_fair_rental_value');
    if (baseVal && !isZeroOrMissing(baseVal)) return null; // Base policy has Loss of Use — OK

    // If DIC exists, check DIC-specific loss of use
    const dic = ctx.term.dic_exists;
    if (dic === true) {
        const dicVal = get(ctx, 'dic_limit_loss_of_use');
        if (dicVal && !isZeroOrMissing(dicVal)) return null; // DIC covers Loss of Use — OK
    }

    // Neither base policy nor DIC has Loss of Use
    return 'Loss of Use / Additional Living Expense coverage is missing or $0. This coverage pays for temporary housing if the home becomes uninhabitable.';
}

// ── Rule registry ────────────────────────────────────────────

const FLAG_CHECKS: FlagCheck[] = [
    // ── No Declaration Page (fires ONLY for sparse CSV imports via early gate) ──
    {
        code: 'NO_DEC_PAGE', severity: 'low', title: 'No Declaration Page Uploaded',
        category: 'data_quality', entity_scope: 'policy', auto_resolve: true,
        requires_data: false,
        check: () => null // Handled by the early-gate logic, not inline
    },

    // ── Data Quality ──
    {
        code: 'MISSING_POLICY_NUMBER', severity: 'high', title: 'Missing Policy Number',
        category: 'data_quality', entity_scope: 'policy', auto_resolve: true, requires_data: false,
        check: (ctx) => { if (!ctx.policy.policy_number) return 'Policy number is missing.'; return null; }
    },
    {
        code: 'MISSING_PROPERTY_LOCATION', severity: 'high', title: 'Missing Property Location',
        category: 'data_quality', entity_scope: 'policy', auto_resolve: true, requires_data: false,
        check: checkMissingField('property_location', 'Property location')
    },
    {
        // MODIFIED: Add condo/unit suppression
        code: 'MISSING_DWELLING_LIMIT', severity: 'high', title: 'Missing Dwelling Limit',
        category: 'data_quality', entity_scope: 'policy', auto_resolve: true, requires_data: true,
        check: (ctx) => {
            if (isCondoOrUnit(ctx)) return null; // Suppress for condos/units
            if (isMissing(get(ctx, 'limit_dwelling'))) return 'Dwelling coverage limit is missing or empty.';
            return null;
        }
    },

    // ── Underwriting Insights (Estimates) ──
    {
        code: 'SEVERE_UNDERINSURANCE_ESTIMATE', severity: 'high', title: 'Severe Underinsurance (Modeled Estimate)',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true, requires_data: true,
        check: (ctx) => {
            const dw = parseNumeric(get(ctx, 'limit_dwelling') || get(ctx, 'limit_dwelling_coverage' /* older schema */));
            if (!dw) return null; // No coverage A parsed

            // Guard: do NOT fire this flag if structural data was produced by the old mock source.
            // Mock data is random — a flag based on it would be misleading and wrong.
            const sqftEnrichment = ctx.enrichments.find(e => e.field_key === 'living_area_sqft');
            if (!sqftEnrichment) return null; // No sqft at all — insufficient to estimate
            const isMockSource = (
                !sqftEnrichment.notes ||
                sqftEnrichment.notes.toLowerCase().includes('mock') ||
                sqftEnrichment.notes.toLowerCase().includes('simulated')
            );
            if (isMockSource) return null; // Silently skip — mock data should never drive a flag

            // Map the generic EvalCtx enrichments format into the format expected by the Normalizer
            const mockEnrichments = ctx.enrichments.map(e => ({
                policy_id: ctx.policy_id,
                field_key: e.field_key,
                field_value: e.field_value,
                confidence: e.confidence,
            }));

            // Assemble base input
            const rawAddress = String(get(ctx, 'property_location') || get(ctx, 'property_address_raw') || ctx.policy.property_address_raw || '');
            const input = normalizeInputs({ id: ctx.policy_id, property_address_raw: rawAddress }, mockEnrichments);
            const estimate = calculateEstimate(input);

            if (!estimate) return null; // Insufficient data to calculate
            // Only trigger on Medium/High confidence estimates where coverage A is drastically below minimum band
            if (estimate.confidence === 'Low') return null;

            // If Dwelling Limit is less than 85% of our MINIMUM estimated bound, flag it
            if (dw < (estimate.rangeMin * 0.85)) {
                return `Dwelling coverage ($${dw.toLocaleString()}) appears severely underinsured. The modeled CA interim rebuild min/max range is $${estimate.rangeMin.toLocaleString()} - $${estimate.rangeMax.toLocaleString()} (Confidence: ${estimate.confidence}). Consider procuring a verified e2Value / 360Value RCE to confirm.`;
            }

            return null;
        }
    },

    // ── Coverage Gaps ──
    {
        code: 'MISSING_ORDINANCE_OR_LAW', severity: 'medium', title: 'Missing Ordinance or Law',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true, requires_data: true,
        check: checkMissingField('limit_ordinance_or_law', 'Ordinance or law coverage')
    },
    {
        code: 'MISSING_EXTENDED_DWELLING', severity: 'medium', title: 'Missing Extended Dwelling Coverage',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true, requires_data: true,
        check: checkMissingField('limit_extended_dwelling_coverage', 'Extended dwelling coverage')
    },
    {
        code: 'MISSING_DWELLING_REPLACEMENT_COST', severity: 'medium', title: 'Missing Dwelling Replacement Cost',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true, requires_data: true,
        check: checkMissingField('limit_dwelling_replacement_cost', 'Dwelling replacement cost')
    },
    {
        // MODIFIED: No mobile/manufactured suppression — evaluate for all
        code: 'MISSING_PERSONAL_PROPERTY_REPLACEMENT_COST', severity: 'medium', title: 'Missing Personal Property RC',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true, requires_data: true,
        check: checkMissingField('limit_personal_property_replacement_cost', 'Personal property replacement cost')
    },
    {
        // MODIFIED: Only fire when fences field was actually parsed/present in coverage data
        code: 'MISSING_FENCES_COVERAGE', severity: 'low', title: 'Missing Fences Coverage',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true, requires_data: true,
        check: (ctx) => {
            // Only flag if the parser actually produced a fences field (even if empty)
            // Avoids noise when the dec page didn't have a fences section at all
            const hasField = 'limit_fences' in ctx.data;
            if (!hasField) return null;
            if (isMissing(get(ctx, 'limit_fences'))) return 'Fences coverage is missing or empty.';
            return null;
        }
    },
    {
        code: 'MISSING_PERSONAL_PROPERTY', severity: 'high', title: 'Missing Personal Property',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true, requires_data: true,
        check: (ctx) => {
            if (isMissing(get(ctx, 'limit_personal_property'))) return 'Coverage C — Personal Property limit is missing or $0.';
            return null;
        }
    },
    {
        code: 'MISSING_OTHER_STRUCTURES', severity: 'medium', title: 'Missing Other Structures',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true, requires_data: true,
        check: (ctx) => {
            if (isCondoOrUnit(ctx)) return null; // Suppress for condos/units
            if (isMissing(get(ctx, 'limit_other_structures'))) return 'Coverage B — Other Structures limit is missing or $0.';
            return null;
        }
    },

    // ── DIC ──
    {
        // MODIFIED: auto_resolve = true so new uploads clear it
        code: 'NO_DIC', severity: 'high', title: 'DIC Not on File',
        category: 'dic', entity_scope: 'policy', auto_resolve: true,
        check: checkNoDic
    },

    // ── Coverage Gap Analysis ──
    {
        code: 'DWELLING_RC_INCLUDED_LOW_ORDINANCE', severity: 'medium', title: 'RC Included, Low Ordinance/Law',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true, requires_data: true,
        check: checkDwellingRcLowOrdinance
    },
    {
        code: 'FAIR_RENTAL_VALUE_ZERO_OR_MISSING', severity: 'high', title: 'Fair Rental Value Zero or Missing',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true, requires_data: true,
        check: checkFairRentalValue
    },
    {
        code: 'LOSS_OF_USE_ZERO_OR_MISSING', severity: 'high', title: 'Loss of Use Zero or Missing',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true, requires_data: true,
        check: checkLossOfUse
    },
    {
        code: 'INFLATION_GUARD_NOT_INCLUDED', severity: 'medium', title: 'Inflation Guard Not Included',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true, requires_data: true,
        check: (ctx) => {
            const val = get(ctx, 'limit_inflation_guard');
            if (val === null || val === undefined) return 'Inflation guard coverage is missing.';
            const s = String(val).toLowerCase().trim();
            if (['not included', 'no', 'false', 'excluded', '0', '$0', '$0.00', 'none', ''].includes(s)) {
                return 'Inflation guard is not included.';
            }
            return null;
        }
    },

    // ── Other Structures — only fire when enrichment confirms structures exist ──
    {
        code: 'OTHER_STRUCTURES_ZERO', severity: 'high', title: 'Other Structures $0',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true,
        check: (ctx) => {
            const val = get(ctx, 'limit_other_structures');
            if (val === null || val === undefined) return null;
            if (!isZeroOrMissing(val)) return null;
            // Only flag if enrichment data suggests structures actually exist
            if (!hasOtherStructuresEvidence(ctx)) return null;
            return 'Other structures coverage is $0, but property analysis detected structures (solar panels, pool, deck, shed, or detached garage).';
        }
    },

    // ── NEW: Personal Property Threshold Flags ──
    {
        code: 'PERSONAL_PROPERTY_LOW_OWNER_OCCUPIED', severity: 'medium',
        title: 'Personal Property Below 30% of Dwelling (Owner-Occupied)',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true,
        check: (ctx) => {
            const occ = String(get(ctx, 'occupancy') || '').toLowerCase();
            if (!occ.includes('owner')) return null;
            const pp = parseNumeric(get(ctx, 'limit_personal_property'));
            const dw = parseNumeric(get(ctx, 'limit_dwelling'));
            if (pp === null || dw === null || dw <= 0) return null;
            const ratio = pp / dw;
            if (ratio < 0.30) {
                return `Personal property coverage ($${pp.toLocaleString()}) is ${(ratio * 100).toFixed(1)}% of dwelling limit ($${dw.toLocaleString()}), below the recommended 30% threshold for owner-occupied properties.`;
            }
            return null;
        }
    },
    {
        code: 'PERSONAL_PROPERTY_LOW_TENANT_OCCUPIED', severity: 'low',
        title: 'Personal Property Below 10% of Dwelling (Tenant-Occupied)',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true,
        check: (ctx) => {
            const occ = String(get(ctx, 'occupancy') || '').toLowerCase();
            if (!occ.includes('tenant') && !occ.includes('rental') && !occ.includes('renter')) return null;
            const pp = parseNumeric(get(ctx, 'limit_personal_property'));
            const dw = parseNumeric(get(ctx, 'limit_dwelling'));
            if (pp === null || dw === null || dw <= 0) return null;
            const ratio = pp / dw;
            if (ratio < 0.10) {
                return `Personal property coverage ($${pp.toLocaleString()}) is ${(ratio * 100).toFixed(1)}% of dwelling limit ($${dw.toLocaleString()}), below the recommended 10% threshold for tenant-occupied properties.`;
            }
            return null;
        }
    },

    // ── NEW: Missing Perils Insured (replaces always-fire PERILS_INSURED_AGAINST) ──
    {
        code: 'MISSING_PERILS_INSURED', severity: 'high', requires_data: true,
        title: 'Missing Perils Insured Against',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true,
        check: (ctx) => {
            const val = get(ctx, 'perils_insured_against');
            if (isMissing(val)) return 'The "Perils Insured Against" section is missing. This is a key coverage element that should be present on every policy.';
            return null;
        }
    },

    // ── NEW: Missing Debris Removal ──
    {
        code: 'MISSING_DEBRIS_REMOVAL', severity: 'high', requires_data: true,
        title: 'Missing Debris Removal',
        category: 'coverage_gap', entity_scope: 'policy', auto_resolve: true,
        check: (ctx) => {
            const val = get(ctx, 'limit_debris_removal');
            if (isMissing(val)) return 'Debris removal coverage is missing or not present on the declarations page.';
            return null;
        }
    },

    // ── Enrichment-Aware Checks (AI Vision → Coverage Inconsistencies) ──
    {
        code: 'SOLAR_PANELS_NOT_COVERED',
        severity: 'medium',
        title: 'Solar Panels Detected — Coverage Gap Possible',
        category: 'property_observation',
        entity_scope: 'policy',
        auto_resolve: false,
        check: (ctx) => {
            const val = getEnrichmentValue(ctx, 'ai_solar_panels');
            if (val !== 'detected') return null;
            // Solar detected — check if Other Structures or equipment coverage exists
            const otherStructures = get(ctx, 'limit_other_structures');
            if (!isMissing(otherStructures) && !isZeroOrMissing(otherStructures)) return null;
            return 'Satellite imagery detected solar panels, but Other Structures coverage is $0 or missing. Solar equipment may need dedicated coverage or an endorsement.';
        }
    },
    {
        code: 'POOL_LIABILITY_GAP',
        severity: 'medium',
        title: 'Pool Detected — Verify Liability Coverage',
        category: 'property_observation',
        entity_scope: 'policy',
        auto_resolve: false,
        check: (ctx) => {
            const val = getEnrichmentValue(ctx, 'ai_pool');
            if (val !== 'detected') return null;
            const otherStructures = get(ctx, 'limit_other_structures');
            if (isMissing(otherStructures) || isZeroOrMissing(otherStructures)) {
                return 'Satellite imagery detected a swimming pool, but Other Structures coverage is $0 or missing. Pools and related structures (decking, fencing) typically require Other Structures coverage and may need a liability review.';
            }
            return null;
        }
    },
    {
        code: 'ROOF_CONDITION_CONCERN',
        severity: 'medium',
        title: 'Roof Condition Concern',
        category: 'property_observation',
        entity_scope: 'policy',
        auto_resolve: false,
        check: (ctx) => {
            const roofVal = getEnrichmentValue(ctx, 'ai_roof_condition');
            const svRoof = getEnrichmentValue(ctx, 'ai_sv_roof_condition');
            const val = roofVal || svRoof;
            if (val && (val.toLowerCase().includes('poor') || val.toLowerCase().includes('aging') || val.toLowerCase().includes('damaged') || val.toLowerCase().includes('deteriorat'))) {
                return `AI vision analysis flagged potential roof concerns: "${val}". This may impact Dwelling Replacement Cost coverage. Recommend verification and possible inspection before renewal.`;
            }
            return null;
        }
    },

    // ── NEW: Young Roof Without RC (replaces old ROOF_AGE_OVER_25_WITH_RC_INCLUDED) ──
    {
        code: 'YOUNG_ROOF_WITHOUT_RC', severity: 'medium',
        title: 'Young Roof Without Replacement Cost',
        category: 'coverage_gap',
        entity_scope: 'policy',
        auto_resolve: false,
        check: (ctx) => {
            // Get year built from enrichment
            const yearBuiltStr = getEnrichmentValue(ctx, 'year_built') || getEnrichmentValue(ctx, 'ai_year_built');
            if (!yearBuiltStr) return null;
            const yearBuilt = parseInt(yearBuiltStr, 10);
            if (isNaN(yearBuilt)) return null;

            const currentYear = new Date().getFullYear();
            const age = currentYear - yearBuilt;

            // Only flag if structure is less than 25 years old
            if (age >= 25) return null;

            // Check if RC is NOT included
            const rc = get(ctx, 'limit_dwelling_replacement_cost');
            if (!rc) return null; // Can't determine if RC is included
            const rcStr = String(rc).toLowerCase().trim();
            if (rcStr.includes('included') || rcStr.includes('yes') || rcStr === 'true') return null; // RC is included, no issue

            return `Property is ${age} years old (built ${yearBuilt}), which qualifies for Replacement Cost coverage, but RC is currently not included. Consider adding RC coverage for this relatively new structure.`;
        }
    },
];

// ── Build stable flag_key ────────────────────────────────────
function buildFlagKey(scope: string, entityId: string, code: string): string {
    return `${scope}:${entityId}:${code}`;
}

// ── Schema detection ─────────────────────────────────────────
let schemaHasStatus: boolean | null = null;

async function detectSchema(sb: ReturnType<typeof getSupabaseAdmin>): Promise<boolean> {
    if (schemaHasStatus !== null) return schemaHasStatus;
    try {
        const { error } = await sb
            .from('policy_flags')
            .select('status')
            .limit(1);
        schemaHasStatus = !error;
    } catch {
        schemaHasStatus = false;
    }
    return schemaHasStatus;
}

// ── Main handler ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const errors: string[] = [];

    try {
        const body = await request.json();
        const policyId = body.policy_id;

        if (!policyId || typeof policyId !== 'string') {
            return NextResponse.json({ success: false, error: 'policy_id is required' }, { status: 400 });
        }

        const sb = getSupabaseAdmin();
        const summary = { created: 0, refreshed: 0, resolved: 0, checked: 0, fired: 0 };
        const newSchema = await detectSchema(sb);

        logger.info('API', `Flag evaluation v${RULE_VERSION} starting for policy ${policyId}`, { newSchema });

        // 1. Fetch policy
        const { data: policy, error: pErr } = await sb
            .from('policies')
            .select('*')
            .eq('id', policyId)
            .single();

        if (pErr || !policy) {
            return NextResponse.json({
                success: false,
                error: `Policy not found: ${pErr?.message || 'no data'}`,
            }, { status: 404 });
        }

        // 2. Fetch current term
        const { data: term, error: tErr } = await sb
            .from('policy_terms')
            .select('*')
            .eq('policy_id', policyId)
            .eq('is_current', true)
            .single();

        if (tErr) {
            logger.warn('API', `No current term for policy ${policyId}: ${tErr.message}`);
        }

        // 3. Fetch client
        let client: Record<string, unknown> = {};
        if (policy.client_id) {
            const { data: c } = await sb.from('clients').select('*').eq('id', policy.client_id).single();
            if (c) client = c;
        }

        // 4. Build coverage_data from term's coverage_data JSONB
        const coverageData = (term?.coverage_data || {}) as Record<string, unknown>;

        const ctx: EvalCtx = {
            policy_id: policyId,
            client_id: policy.client_id || null,
            policy_term_id: term?.id || null,
            data: coverageData,
            term: term || {},
            client,
            policy,
            enrichments: [],
        };

        // 4b. Fetch enrichments for AI-observation-based flags
        const { data: enrichData } = await sb
            .from('property_enrichments')
            .select('field_key, field_value, confidence, notes')
            .eq('policy_id', policyId);
        if (enrichData) {
            ctx.enrichments = enrichData;
        }

        // 4c. Check if any dec pages exist for this policy
        const { count: decPageCount } = await sb
            .from('dec_pages')
            .select('id', { count: 'exact', head: true })
            .eq('policy_id', policyId);
        const hasDecPage = (decPageCount || 0) > 0;
        const hasEnrichments = ctx.enrichments.length > 0;
        const hasCoverageData = Object.keys(coverageData).length > 0;
        const hasSubstantiveData = hasDecPage || hasEnrichments || hasCoverageData;

        logger.info('API', `Eval context built`, {
            has_term: !!term,
            coverage_keys: Object.keys(coverageData).length,
            has_client: !!policy.client_id,
            has_dec_page: hasDecPage,
            has_enrichments: hasEnrichments,
        });

        // 4d. Early gate: sparse CSV imports with no dec page, no enrichments, no coverage data
        //     → fire a single NO_DEC_PAGE flag instead of flooding with "missing X" noise
        if (!hasSubstantiveData) {
            const flagKey = buildFlagKey('policy', policyId, 'NO_DEC_PAGE');
            const now = new Date().toISOString();
            const message = 'No declaration page has been uploaded for this policy. Upload a dec page to enable full coverage analysis and flag evaluation.';

            summary.checked++;
            summary.fired++;

            const { data: existing } = await sb
                .from('policy_flags')
                .select('id, times_seen')
                .eq('flag_key', flagKey)
                .eq('status', 'open')
                .maybeSingle();

            if (existing) {
                await sb.from('policy_flags').update({
                    last_seen_at: now,
                    times_seen: (existing.times_seen || 1) + 1,
                    message,
                    updated_at: now,
                }).eq('id', existing.id);
                summary.refreshed++;
            } else {
                await sb.from('policy_flags').insert({
                    flag_key: flagKey,
                    code: 'NO_DEC_PAGE',
                    severity: 'low',
                    title: 'No Declaration Page Uploaded',
                    message,
                    category: 'data_quality',
                    source: 'system',
                    status: 'open',
                    policy_id: policyId,
                    client_id: policy.client_id,
                    rule_version: RULE_VERSION,
                    first_seen_at: now,
                    last_seen_at: now,
                    times_seen: 1,
                    created_at: now,
                    updated_at: now,
                });
                summary.created++;
            }
        }

        // 5. Run each check
        for (const rule of FLAG_CHECKS) {
            summary.checked++;

            // Skip data-dependent checks if there's no substantive data
            if (rule.requires_data && !hasSubstantiveData) {
                continue;
            }
            const entityId = rule.entity_scope === 'client'
                ? ctx.client_id
                : rule.entity_scope === 'policy_term'
                    ? ctx.policy_term_id
                    : ctx.policy_id;

            if (!entityId) continue;

            const message = rule.check(ctx);

            if (message) {
                summary.fired++;

                if (newSchema) {
                    // ── New schema path: use flag_key + status ──
                    const flagKey = buildFlagKey(rule.entity_scope, entityId, rule.code);
                    const now = new Date().toISOString();

                    // Check if open flag already exists
                    const { data: existing, error: lookupErr } = await sb
                        .from('policy_flags')
                        .select('id, times_seen')
                        .eq('flag_key', flagKey)
                        .eq('status', 'open')
                        .maybeSingle();

                    if (lookupErr) {
                        errors.push(`Lookup error for ${rule.code}: ${lookupErr.message}`);
                        continue;
                    }

                    if (existing) {
                        const { error: updErr } = await sb.from('policy_flags').update({
                            last_seen_at: now,
                            times_seen: (existing.times_seen || 1) + 1,
                            message,
                            updated_at: now,
                        }).eq('id', existing.id);

                        if (updErr) {
                            errors.push(`Update error for ${rule.code}: ${updErr.message}`);
                        } else {
                            summary.refreshed++;
                        }
                    } else {
                        const { data: newFlag, error: insErr } = await sb.from('policy_flags').insert({
                            flag_key: flagKey,
                            code: rule.code,
                            severity: rule.severity,
                            title: rule.title,
                            message,
                            category: rule.category,
                            source: 'system',
                            status: 'open',
                            policy_id: rule.entity_scope !== 'client' ? ctx.policy_id : null,
                            client_id: ctx.client_id,
                            policy_term_id: rule.entity_scope === 'policy_term' ? ctx.policy_term_id : null,
                            rule_version: RULE_VERSION,
                            first_seen_at: now,
                            last_seen_at: now,
                            times_seen: 1,
                            created_at: now,
                            updated_at: now,
                        }).select('id').single();

                        if (insErr) {
                            errors.push(`Insert error for ${rule.code}: ${insErr.message}`);
                        } else if (newFlag) {
                            try {
                                await sb.from('flag_events').insert({
                                    flag_id: newFlag.id,
                                    event_type: 'created',
                                    note: `Flag check: ${rule.title}`,
                                });
                            } catch { /* flag_events table may not exist */ }
                            summary.created++;
                        }
                    }
                } else {
                    // ── Old schema path: use resolved_at for status ──
                    const now = new Date().toISOString();

                    const { data: existing, error: lookupErr } = await sb
                        .from('policy_flags')
                        .select('id')
                        .eq('policy_id', policyId)
                        .eq('code', rule.code)
                        .is('resolved_at', null)
                        .maybeSingle();

                    if (lookupErr) {
                        errors.push(`Old-schema lookup error for ${rule.code}: ${lookupErr.message}`);
                        continue;
                    }

                    if (existing) {
                        summary.refreshed++;
                    } else {
                        const { data: newFlag, error: insErr } = await sb.from('policy_flags').insert({
                            policy_id: policyId,
                            code: rule.code,
                            severity: rule.severity,
                            title: rule.title,
                            message,
                            source: 'system',
                        }).select('id').single();

                        if (insErr) {
                            errors.push(`Old-schema insert error for ${rule.code}: ${insErr.message}`);
                        } else if (newFlag) {
                            summary.created++;
                        }
                    }
                }
            } else if (rule.auto_resolve && newSchema) {
                const flagKey = buildFlagKey(rule.entity_scope, entityId, rule.code);
                const { data: openFlag } = await sb
                    .from('policy_flags')
                    .select('id')
                    .eq('flag_key', flagKey)
                    .eq('status', 'open')
                    .maybeSingle();

                if (openFlag) {
                    await sb.from('policy_flags').update({
                        status: 'resolved',
                        resolved_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    }).eq('id', openFlag.id);
                    summary.resolved++;
                }
            }
        }

        // 6. Also check for duplicates
        if (policy.policy_number) {
            summary.checked++;
            const { data: dupes } = await sb
                .from('policies')
                .select('id')
                .eq('policy_number', policy.policy_number)
                .neq('id', policyId)
                .limit(3);

            if (dupes && dupes.length > 0) {
                summary.fired++;
                const msg = `Found ${dupes.length} other polic${dupes.length > 1 ? 'ies' : 'y'} with the same policy number (${policy.policy_number}).`;

                if (newSchema) {
                    const flagKey = buildFlagKey('policy', policyId, 'DUPLICATE_ID_IN_TABLE');
                    const now = new Date().toISOString();

                    const { data: existing } = await sb
                        .from('policy_flags')
                        .select('id, times_seen')
                        .eq('flag_key', flagKey)
                        .eq('status', 'open')
                        .maybeSingle();

                    if (!existing) {
                        const { error: insErr } = await sb.from('policy_flags').insert({
                            flag_key: flagKey,
                            code: 'DUPLICATE_ID_IN_TABLE',
                            severity: 'medium',
                            title: 'Possible Duplicate Policy',
                            message: msg,
                            category: 'duplicate',
                            source: 'system',
                            status: 'open',
                            policy_id: policyId,
                            client_id: policy.client_id,
                            rule_version: RULE_VERSION,
                            first_seen_at: now,
                            last_seen_at: now,
                            times_seen: 1,
                            created_at: now,
                            updated_at: now,
                        }).select('id').single();
                        if (insErr) errors.push(`Duplicate insert error: ${insErr.message}`);
                        else summary.created++;
                    } else {
                        summary.refreshed++;
                    }
                } else {
                    const { data: existing } = await sb
                        .from('policy_flags')
                        .select('id')
                        .eq('policy_id', policyId)
                        .eq('code', 'DUPLICATE_ID_IN_TABLE')
                        .is('resolved_at', null)
                        .maybeSingle();

                    if (!existing) {
                        const { error: insErr } = await sb.from('policy_flags').insert({
                            policy_id: policyId,
                            code: 'DUPLICATE_ID_IN_TABLE',
                            severity: 'medium',
                            title: 'Possible Duplicate Policy',
                            message: msg,
                            source: 'system',
                        }).select('id').single();
                        if (insErr) errors.push(`Old-schema duplicate insert error: ${insErr.message}`);
                        else summary.created++;
                    } else {
                        summary.refreshed++;
                    }
                }
            }
        }

        logger.info('API', `Flag evaluation complete for policy ${policyId}`, { ...summary, errors });

        return NextResponse.json({
            success: true,
            summary,
            errors: errors.length > 0 ? errors : undefined,
            schema: newSchema ? 'new' : 'old',
            message: `Checked ${summary.checked} rules (${summary.fired} fired): ${summary.created} created, ${summary.refreshed} refreshed, ${summary.resolved} resolved.${errors.length > 0 ? ` ${errors.length} errors.` : ''}`,
        });

    } catch (err) {
        logger.error('API', 'Error in flag evaluation', {
            error: err instanceof Error ? err.message : String(err),
            errors,
        });
        return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Internal server error',
            errors,
        }, { status: 500 });
    }
}
