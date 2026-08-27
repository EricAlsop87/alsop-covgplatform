import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { getPolicyDetailById } from '@/lib/api';
import {
    enrichmentsToSqFtCandidates,
    resolveBestSqFt,
    getReplacementCostEstimate,
    ValuationResult,
    SqFtCandidate,
} from '@/lib/valuationEngine';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';


/**
 * POST /api/valuation
 *
 * On-demand valuation for a specific policy.
 * - Gathers sq ft candidates from all sources
 * - Resolves best current sq ft
 * - Runs fallback RC estimator
 * - Saves results to property_enrichments
 *
 * Body: { policy_id: string, manual_sqft?: number }
 */
export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    try {
        const body = await req.json();
        const { policy_id, manual_sqft } = body;

        if (!policy_id || typeof policy_id !== 'string') {
            return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();

        // 1. Fetch policy details for construction type, year built, etc.
        const policy = await getPolicyDetailById(policy_id);
        if (!policy) {
            return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
        }

        // 2. If manual sq ft provided, upsert it as a manual entry enrichment
        if (manual_sqft && manual_sqft > 0) {
            const now = new Date().toISOString();
            await supabase.from('property_enrichments').upsert({
                policy_id,
                field_key: 'square_footage',
                field_value: String(manual_sqft),
                source_name: 'Manual Entry',
                source_type: 'manual',
                confidence: 'medium',
                notes: 'Agent-entered square footage',
                fetched_at: now,
                updated_at: now,
            }, { onConflict: 'policy_id,field_key,source_name' });
        }

        // 3. Fetch all enrichments for this policy
        const { data: enrichments } = await supabase
            .from('property_enrichments')
            .select('field_key, field_value, source_name, source_type, confidence, fetched_at, notes')
            .eq('policy_id', policy_id);

        // 4. Resolve sq ft
        const candidates: SqFtCandidate[] = enrichmentsToSqFtCandidates(enrichments || []);
        const sqft = resolveBestSqFt(candidates);

        // 5. Run RC estimate if we have sq ft
        let replacementCost = null;
        if (sqft.bestValue && sqft.bestValue > 0) {
            // Extract state from address (simple heuristic)
            const stateMatch = (policy.property_address || '').match(/\b([A-Z]{2})\s*\d{5}/);
            const state = stateMatch ? stateMatch[1] : undefined;

            // Get stories from enrichments
            const storiesEnrich = (enrichments || []).find(
                e => e.field_key === 'ai_sv_stories' || e.field_key === 'stories'
            );
            const stories = storiesEnrich ? parseInt(storiesEnrich.field_value, 10) || undefined : undefined;

            replacementCost = await getReplacementCostEstimate({
                squareFootage: sqft.bestValue,
                constructionType: policy.construction_type || undefined,
                yearBuilt: policy.year_built || undefined,
                stories,
                state,
            });
        }

        // 6. Save resolved values back to enrichments for easy retrieval
        const now = new Date().toISOString();

        if (sqft.bestValue) {
            await supabase.from('property_enrichments').upsert({
                policy_id,
                field_key: 'best_sqft',
                field_value: String(sqft.bestValue),
                source_name: 'Valuation Engine',
                source_type: 'ai_inferred',
                confidence: sqft.bestConfidence || 'low',
                notes: JSON.stringify({
                    resolvedFrom: sqft.bestSource,
                    candidateCount: sqft.candidates.length,
                    needsReview: sqft.needsReview,
                }),
                fetched_at: now,
                updated_at: now,
            }, { onConflict: 'policy_id,field_key,source_name' });
        }

        if (replacementCost) {
            await supabase.from('property_enrichments').upsert({
                policy_id,
                field_key: 'rc_estimate_fallback',
                field_value: String(replacementCost.estimatedRCV),
                source_name: replacementCost.providerName,
                source_type: replacementCost.methodology === 'vendor' ? 'api' : 'ai_inferred',
                confidence: replacementCost.confidence,
                notes: JSON.stringify({
                    costPerSqFt: replacementCost.costPerSqFt,
                    methodology: replacementCost.methodology,
                    adjustments: replacementCost.adjustments,
                    inputs: replacementCost.inputs,
                    disclaimer: replacementCost.disclaimer,
                }),
                fetched_at: now,
                updated_at: now,
            }, { onConflict: 'policy_id,field_key,source_name' });
        }

        // 7. Activity event
        try {
            await supabase.from('activity_events').insert({
                event_type: 'valuation.completed',
                title: 'Property valuation completed',
                detail: sqft.bestValue
                    ? `Sq ft: ${sqft.bestValue.toLocaleString()} (${sqft.bestSourceLabel || 'unknown'}). ${replacementCost ? `Est. RCV: $${replacementCost.estimatedRCV.toLocaleString()}` : 'No RC estimate.'}`
                    : 'No square footage available for valuation.',
                policy_id,
                client_id: policy.client_id || null,
                meta: { sqft: sqft.bestValue, rcv: replacementCost?.estimatedRCV },
            });
        } catch { /* non-fatal */ }

        const result: ValuationResult = { sqft, replacementCost };

        return NextResponse.json({ success: true, valuation: result });

    } catch (err: any) {
        logger.error('Valuation', 'Valuation error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
