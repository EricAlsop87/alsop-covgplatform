import { logger } from '@/lib/logger';

/**
 * Valuation Engine — Square Footage Strategy & Replacement Cost Estimation
 *
 * This module provides:
 * 1. Multi-source square footage resolution (best-value selection)
 * 2. Fallback replacement cost estimation (internal, pre-vendor)
 * 3. Provider interface for future vendor swap-in
 *
 * Design principles:
 * - Source attribution and confidence are first-class
 * - Fallback estimates are NEVER presented as vendor-grade
 * - Architecture allows clean vendor plug-in without redesign
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SqFtCandidate {
    value: number;
    source: string;           // e.g. 'dec_page_parser', 'manual_entry', 'property_data_api', 'vendor_xyz'
    sourceLabel: string;      // Human-readable: 'Dec Page Parser', 'Agent Entry', etc.
    confidence: 'high' | 'medium' | 'low';
    timestamp: string;        // ISO date
    notes?: string;
}

export interface SqFtResolution {
    bestValue: number | null;
    bestSource: string | null;
    bestSourceLabel: string | null;
    bestConfidence: 'high' | 'medium' | 'low' | null;
    candidates: SqFtCandidate[];
    needsReview: boolean;     // True if no high-confidence source, or only 1 source
    resolvedAt: string;
}

export interface RCEstimateParams {
    squareFootage: number;
    constructionType?: string;
    yearBuilt?: number;
    state?: string;            // 2-letter state code, for future regional adjustment
    stories?: number;
}

export interface RCEstimateResult {
    estimatedRCV: number;         // Total estimated replacement cost value
    costPerSqFt: number;          // $/sqft used
    methodology: 'internal_fallback' | 'vendor';
    providerName: string;         // 'CFP Internal Estimator' or vendor name
    confidence: 'high' | 'medium' | 'low';
    inputs: RCEstimateParams;
    adjustments: Array<{ name: string; factor: number; reason: string }>;
    disclaimer: string;
    timestamp: string;
}

export interface ReplacementCostProvider {
    name: string;
    type: 'internal_fallback' | 'vendor';
    getEstimate(params: RCEstimateParams): Promise<RCEstimateResult>;
}

export interface ValuationResult {
    sqft: SqFtResolution;
    replacementCost: RCEstimateResult | null;
}

// ---------------------------------------------------------------------------
// Constants — Cost-per-sqft table by construction type
// ---------------------------------------------------------------------------

/**
 * Base cost per sq ft by construction type (2024 national averages).
 * These are deliberately conservative midpoints.
 * Source: Industry averages — clearly labeled as internal estimates.
 */
const COST_PER_SQFT_TABLE: Record<string, { low: number; mid: number; high: number }> = {
    'frame':              { low: 150, mid: 190, high: 240 },
    'wood frame':         { low: 150, mid: 190, high: 240 },
    'masonry':            { low: 175, mid: 225, high: 290 },
    'brick':              { low: 175, mid: 225, high: 290 },
    'brick veneer':       { low: 170, mid: 215, high: 275 },
    'stucco':             { low: 160, mid: 200, high: 260 },
    'concrete block':     { low: 165, mid: 210, high: 270 },
    'steel':              { low: 180, mid: 235, high: 300 },
    'log':                { low: 200, mid: 260, high: 340 },
    'superior':           { low: 225, mid: 300, high: 400 },
    'custom':             { low: 225, mid: 300, high: 400 },
    // Default fallback
    'unknown':            { low: 160, mid: 200, high: 260 },
};

const CONFIDENCE_RANK: Record<string, number> = {
    'high': 3,
    'medium': 2,
    'low': 1,
};

// ---------------------------------------------------------------------------
// 1. Square Footage Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the best current square footage from multiple candidate sources.
 *
 * Priority: highest confidence → most recent timestamp (tie-breaker)
 * Candidates come from property_enrichments rows with field_key containing 'square_footage'.
 */
export function resolveBestSqFt(candidates: SqFtCandidate[]): SqFtResolution {
    const now = new Date().toISOString();

    if (candidates.length === 0) {
        return {
            bestValue: null,
            bestSource: null,
            bestSourceLabel: null,
            bestConfidence: null,
            candidates: [],
            needsReview: true,
            resolvedAt: now,
        };
    }

    // Filter out invalid values
    const valid = candidates.filter(c => c.value > 0 && !isNaN(c.value));
    if (valid.length === 0) {
        return {
            bestValue: null,
            bestSource: null,
            bestSourceLabel: null,
            bestConfidence: null,
            candidates,
            needsReview: true,
            resolvedAt: now,
        };
    }

    // Sort by confidence (desc), then by timestamp (desc)
    const sorted = [...valid].sort((a, b) => {
        const confDiff = (CONFIDENCE_RANK[b.confidence] || 0) - (CONFIDENCE_RANK[a.confidence] || 0);
        if (confDiff !== 0) return confDiff;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const best = sorted[0];

    // Needs review if: only one source, or best confidence is 'low'
    const needsReview = valid.length === 1 || best.confidence === 'low';

    return {
        bestValue: best.value,
        bestSource: best.source,
        bestSourceLabel: best.sourceLabel,
        bestConfidence: best.confidence,
        candidates: valid,
        needsReview,
        resolvedAt: now,
    };
}

/**
 * Convert property_enrichments rows into SqFtCandidate objects.
 * Looks for field_key = 'square_footage' (any source_name).
 */
export function enrichmentsToSqFtCandidates(
    enrichments: Array<{
        field_key: string;
        field_value: string;
        source_name: string;
        source_type?: string;
        confidence?: string;
        fetched_at?: string;
        notes?: string;
    }>
): SqFtCandidate[] {
    return enrichments
        .filter(e => e.field_key === 'square_footage' && e.field_value)
        .map(e => {
            const parsed = parseFloat(e.field_value.replace(/[^0-9.]/g, ''));
            return {
                value: isNaN(parsed) ? 0 : parsed,
                source: e.source_name.toLowerCase().replace(/\s+/g, '_'),
                sourceLabel: e.source_name,
                confidence: (e.confidence as 'high' | 'medium' | 'low') || 'medium',
                timestamp: e.fetched_at || new Date().toISOString(),
                notes: e.notes || undefined,
            };
        })
        .filter(c => c.value > 0);
}

// ---------------------------------------------------------------------------
// 2. Fallback Replacement Cost Estimator
// ---------------------------------------------------------------------------

/**
 * Internal fallback replacement cost estimator.
 * Uses sq ft × cost-per-sqft by construction type, with age adjustments.
 *
 * This is NOT a vendor-grade estimate. It is a reasonable starting point
 * for renewal conversations when no official vendor data is available.
 */
export function calculateFallbackRC(params: RCEstimateParams): RCEstimateResult {
    const now = new Date().toISOString();
    const adjustments: Array<{ name: string; factor: number; reason: string }> = [];

    // 1. Look up base cost per sqft
    const ctNormalized = (params.constructionType || 'unknown').toLowerCase().trim();
    const costBracket = COST_PER_SQFT_TABLE[ctNormalized] || COST_PER_SQFT_TABLE['unknown'];
    let costPerSqFt = costBracket.mid; // Use midpoint as baseline

    // 2. Age adjustment — older homes cost more to rebuild to current code
    if (params.yearBuilt && params.yearBuilt > 0) {
        const age = new Date().getFullYear() - params.yearBuilt;
        if (age > 50) {
            const factor = 1.15;
            adjustments.push({ name: 'Age (50+ years)', factor, reason: 'Older homes typically require significant code upgrades during rebuild' });
            costPerSqFt *= factor;
        } else if (age > 25) {
            const factor = 1.10;
            adjustments.push({ name: 'Age (25-50 years)', factor, reason: 'Moderate code upgrade costs expected' });
            costPerSqFt *= factor;
        }
    }

    // 3. Multi-story adjustment
    if (params.stories && params.stories > 1) {
        const factor = 1 + ((params.stories - 1) * 0.05); // +5% per additional story
        adjustments.push({ name: `Multi-story (${params.stories})`, factor, reason: 'Additional stories increase structural and finish costs' });
        costPerSqFt *= factor;
    }

    // 4. Calculate total
    const estimatedRCV = Math.round(params.squareFootage * costPerSqFt);

    return {
        estimatedRCV,
        costPerSqFt: Math.round(costPerSqFt),
        methodology: 'internal_fallback',
        providerName: 'CFP Internal Estimator',
        confidence: 'low',
        inputs: params,
        adjustments,
        disclaimer: 'This is an internal estimate based on construction type averages and available property data. It is not a vendor-grade replacement cost valuation. Use for reference only — an approved vendor estimate should be obtained for binding decisions.',
        timestamp: now,
    };
}

// ---------------------------------------------------------------------------
// 3. Internal Fallback Provider (implements ReplacementCostProvider)
// ---------------------------------------------------------------------------

export const internalFallbackProvider: ReplacementCostProvider = {
    name: 'CFP Internal Estimator',
    type: 'internal_fallback',
    async getEstimate(params: RCEstimateParams): Promise<RCEstimateResult> {
        return calculateFallbackRC(params);
    },
};

// ---------------------------------------------------------------------------
// 4. Provider Registry (extensible for future vendors)
// ---------------------------------------------------------------------------

const providers: ReplacementCostProvider[] = [
    internalFallbackProvider,
    // Future: add vendor providers here
    // e.g., corelogicProvider, e2valueProvider
];

/**
 * Get the best available replacement cost estimate.
 * Tries vendor providers first. Falls back to internal estimator.
 */
export async function getReplacementCostEstimate(
    params: RCEstimateParams
): Promise<RCEstimateResult> {
    // Try vendors first (type = 'vendor')
    const vendorProviders = providers.filter(p => p.type === 'vendor');
    for (const provider of vendorProviders) {
        try {
            const result = await provider.getEstimate(params);
            if (result && result.estimatedRCV > 0) return result;
        } catch (err) {
            logger.warn('valuationEngine', `Vendor provider ${provider.name} failed:`, { error: err instanceof Error ? err.message : String(err) })
        }
    }

    // Fall back to internal
    return internalFallbackProvider.getEstimate(params);
}

// ---------------------------------------------------------------------------
// 5. Full Valuation Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full valuation pipeline for a set of enrichments + policy data.
 * This is the main entry point called by the /api/valuation route.
 */
export async function runValuation(
    enrichments: Array<{
        field_key: string;
        field_value: string;
        source_name: string;
        source_type?: string;
        confidence?: string;
        fetched_at?: string;
        notes?: string;
    }>,
    policyData: {
        constructionType?: string;
        yearBuilt?: number;
        stories?: number;
        state?: string;
    }
): Promise<ValuationResult> {
    // 1. Resolve sq ft
    const candidates = enrichmentsToSqFtCandidates(enrichments);
    const sqft = resolveBestSqFt(candidates);

    // 2. Estimate replacement cost (only if we have sq ft)
    let replacementCost: RCEstimateResult | null = null;
    if (sqft.bestValue && sqft.bestValue > 0) {
        replacementCost = await getReplacementCostEstimate({
            squareFootage: sqft.bestValue,
            constructionType: policyData.constructionType,
            yearBuilt: policyData.yearBuilt,
            stories: policyData.stories,
            state: policyData.state,
        });
    }

    return { sqft, replacementCost };
}
