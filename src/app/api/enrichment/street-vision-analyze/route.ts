import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * POST /api/enrichment/street-vision-analyze
 *
 * AI vision analysis of the street view / front-elevation image for a policy.
 * Uses GPT-4o to detect exterior structures and conditions.
 * Stores structured observations with source attribution + confidence.
 *
 * Body: { policy_id: string }
 */

export const dynamic = 'force-dynamic';

const OPENAI_API_KEY = env.OPENAI_API_KEY || '';

// ---------------------------------------------------------------------------
// Target datapoints for front-elevation/street-view detection (v1)
// ---------------------------------------------------------------------------

interface VisionTarget {
    key: string;
    label: string;
    type: 'boolean' | 'count' | 'note';
    description: string;
}

const VISION_TARGETS: VisionTarget[] = [
    {
        key: 'ai_sv_stories',
        label: 'Number of Stories',
        type: 'count',
        description: 'How many visible stories does the main structure have? (e.g., "1", "2", "3+")',
    },
    {
        key: 'ai_sv_roof_condition',
        label: 'Roof Condition Clues',
        type: 'note',
        description: 'Any visible signs of roof wear, damage, missing shingles, rust, or tarps? (Respond "Clear" if none, or describe issues briefly)',
    },
    {
        key: 'ai_sv_exterior_condition',
        label: 'Exterior Condition',
        type: 'note',
        description: 'Any visible signs of siding damage, peeling paint, massive cracks, or missing finish? (Respond "Clear" if none, or describe issues briefly)',
    },
    {
        key: 'ai_sv_vegetation',
        label: 'Overgrown Vegetation',
        type: 'boolean',
        description: 'Is there severely overgrown vegetation, yard debris, or large tree limbs directly overhanging the roof? (Respond "true" or "false" as a string)',
    },
    {
        key: 'ai_sv_garage',
        label: 'Garage / Carport',
        type: 'boolean',
        description: 'Is there a distinctly visible front-facing attached/detached garage or carport? (Respond "true" or "false" as a string)',
    },
    {
        key: 'ai_sv_fencing',
        label: 'Front Fencing',
        type: 'boolean',
        description: 'Is there visible fencing or a gate across the front property line? (Respond "true" or "false" as a string)',
    },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertEnrichment(
    sb: ReturnType<typeof getSupabaseAdmin>,
    payload: {
        policy_id: string;
        field_key: string;
        field_value: string | null;
        source_name: string;
        source_type: string;
        source_url?: string | null;
        confidence?: string;
        notes?: string | null;
    }
) {
    const now = new Date().toISOString();
    const row = {
        ...payload,
        confidence: payload.confidence || 'medium',
        fetched_at: now,
        updated_at: now,
    };

    const { error } = await sb
        .from('property_enrichments')
        .upsert(row, { onConflict: 'policy_id,field_key,source_name' });

    if (error) {
        logger.error('StreetVision', `upsert failed: ${error.message}`, { field_key: payload.field_key });
    }
}

/**
 * Fetch the street view image URL from existing enrichments.
 */
async function getStreetViewImageUrl(
    sb: ReturnType<typeof getSupabaseAdmin>,
    policyId: string
): Promise<string | null> {
    const { data } = await sb
        .from('property_enrichments')
        .select('field_value')
        .eq('policy_id', policyId)
        .eq('field_key', 'street_view_image')
        .single();

    return data?.field_value || null;
}

/**
 * Download image from URL and convert to base64 data URI.
 */
async function imageUrlToBase64(url: string): Promise<string | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;

        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const contentType = res.headers.get('content-type') || 'image/jpeg';
        return `data:${contentType};base64,${base64}`;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// GPT-4o Vision prompt
// ---------------------------------------------------------------------------

function buildVisionPrompt(): string {
    const targetList = VISION_TARGETS.map(
        (t, i) => `${i + 1}. "${t.key}" — ${t.label}: ${t.description}`
    ).join('\n');

    return `You are a professional property inspection AI analyzing a front-elevation / street-level image of a residential property.

Your task is to examine this front street view image and report on specific structural and condition indicators.

For each target below, determine:
- "value": the extracted string answer (either a number for count, a descriptive string for notes, or the string "true"/"false" for booleans)
- "confidence": "high" if clearly visible, "medium" if somewhat visible but uncertain, "low" if barely visible, hidden, or ambiguous
- "rationale": a short 1-sentence explanation of what you see (or why you believe the feature is absent/hidden)
- "manual_review": boolean true if a human agent should verify this observation due to ambiguity, obstruction, or concern

TARGET FEATURES TO ANALYZE:
${targetList}

IMPORTANT RULES:
- Do NOT guess or hallucinate features that are not visible. If the view is heavily obscured by trees, vehicles, or poor image quality, state that in the rationale and lower the confidence.
- Be honest about uncertainty — use "low" confidence and "manual_review: true" for ambiguous cases.
- If the image quality is too poor, or no house is visible (e.g. just a street or forest), say so in the rationale and mark overall_notes.

Respond with ONLY a valid JSON object in this exact format:
{
  "observations": [
    {
      "key": "ai_sv_stories",
      "value": "2",
      "confidence": "high",
      "rationale": "Clear view of a two-story residential structure.",
      "manual_review": false
    },
    ...
  ],
  "image_quality": "good" | "moderate" | "poor",
  "overall_notes": "Brief summary of the property from the front elevation"
}

Include ALL ${VISION_TARGETS.length} targets in the observations array.`;
}

// ---------------------------------------------------------------------------
// OpenAI GPT-4o call
// ---------------------------------------------------------------------------

interface VisionObservation {
    key: string;
    value: string;
    confidence: 'high' | 'medium' | 'low';
    rationale: string;
    manual_review: boolean;
}

interface VisionResponse {
    observations: VisionObservation[];
    image_quality: 'good' | 'moderate' | 'poor';
    overall_notes: string;
}

async function analyzeWithGPT4o(imageBase64: string): Promise<VisionResponse | null> {
    if (!OPENAI_API_KEY) {
        logger.error('StreetVision', 'OPENAI_API_KEY not configured');
        return null;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: buildVisionPrompt() },
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageBase64,
                                detail: 'high',
                            },
                        },
                    ],
                },
            ],
            max_tokens: 2500,
            temperature: 0.1,  // Low temp for factual analysis
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        logger.error('StreetVision', `OpenAI API error: ${response.status} ${errText}`);
        return null;
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
        logger.error('StreetVision', 'Empty response from OpenAI');
        return null;
    }

    try {
        const jsonStr = rawContent
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            .trim();
        return JSON.parse(jsonStr) as VisionResponse;
    } catch (parseErr) {
        logger.error('StreetVision', `Failed to parse GPT-4o response: ${parseErr}`, { rawContent });
        return null;
    }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    try {
        const body = await request.json();
        const { policy_id } = body;

        if (!policy_id) {
            return NextResponse.json({ error: 'policy_id required' }, { status: 400 });
        }

        if (!OPENAI_API_KEY) {
            return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
        }

        const sb = getSupabaseAdmin();

        // 1. Get street view image URL from existing enrichments
        const imageUrl = await getStreetViewImageUrl(sb, policy_id);
        if (!imageUrl) {
            return NextResponse.json({
                error: 'No street view image available for this policy. Run enrichment first.',
                results: { analyzed: false, reason: 'no_image' },
            }, { status: 422 });
        }

        // 2. Download and encode street view image
        const imageBase64 = await imageUrlToBase64(imageUrl);
        if (!imageBase64) {
            return NextResponse.json({
                error: 'Failed to download street view image for analysis',
                results: { analyzed: false, reason: 'download_failed' },
            }, { status: 422 });
        }

        // 3. Analyze with GPT-4o
        logger.info('StreetVision', `Starting AI street vision analysis for policy ${policy_id}`);
        const visionResult = await analyzeWithGPT4o(imageBase64);

        if (!visionResult) {
            return NextResponse.json({
                error: 'AI street vision analysis failed',
                results: { analyzed: false, reason: 'ai_error' },
            }, { status: 500 });
        }

        // 4. Store each observation in property_enrichments
        const storedObservations: Array<{
            key: string;
            label: string;
            value: string;
            confidence: string;
            rationale: string;
            manual_review: boolean;
        }> = [];

        for (const obs of visionResult.observations) {
            const target = VISION_TARGETS.find(t => t.key === obs.key);
            if (!target) continue;

            await upsertEnrichment(sb, {
                policy_id,
                field_key: obs.key,
                field_value: obs.value,
                source_name: 'Street Vision AI',
                source_type: 'ai_interpretation',
                source_url: null,
                confidence: obs.confidence,
                notes: JSON.stringify({
                    label: target.label,
                    value: obs.value,
                    rationale: obs.rationale,
                    manual_review: obs.manual_review,
                    image_type: 'street_view',
                    image_quality: visionResult.image_quality,
                    model: 'gpt-4o',
                }),
            });

            storedObservations.push({
                key: obs.key,
                label: target.label,
                value: obs.value,
                confidence: obs.confidence,
                rationale: obs.rationale,
                manual_review: obs.manual_review,
            });
        }

        // 5. Store overall analysis metadata
        await upsertEnrichment(sb, {
            policy_id,
            field_key: 'ai_sv_summary',
            field_value: visionResult.overall_notes,
            source_name: 'Street Vision AI',
            source_type: 'ai_interpretation',
            source_url: null,
            confidence: 'medium',
            notes: JSON.stringify({
                image_quality: visionResult.image_quality,
                total_targets: VISION_TARGETS.length,
                model: 'gpt-4o',
                image_type: 'street_view',
            }),
        });

        logger.info('StreetVision', `Street vision analysis complete`, { policy_id });

        return NextResponse.json({
            message: 'Street Vision analysis complete',
            results: {
                analyzed: true,
                image_quality: visionResult.image_quality,
                overall_notes: visionResult.overall_notes,
                total_targets: VISION_TARGETS.length,
                observations: storedObservations,
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('StreetVision', `Unexpected error: ${msg}`);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
