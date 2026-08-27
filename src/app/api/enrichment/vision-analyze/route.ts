import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * POST /api/enrichment/vision-analyze
 *
 * AI vision analysis of the satellite image for a policy.
 * Uses GPT-4o to detect exterior structures from overhead imagery.
 * Stores structured observations with source attribution + confidence.
 *
 * Body: { policy_id: string }
 */

export const dynamic = 'force-dynamic';

const OPENAI_API_KEY = env.OPENAI_API_KEY || '';

// ---------------------------------------------------------------------------
// Target datapoints for overhead satellite detection (v1)
// ---------------------------------------------------------------------------

interface VisionTarget {
    key: string;          // field_key in property_enrichments (ai_ prefix)
    label: string;        // Human-readable label
    type: 'boolean' | 'count' | 'note';
    description: string;  // What the AI should look for
}

const VISION_TARGETS: VisionTarget[] = [
    {
        key: 'ai_pool',
        label: 'Swimming Pool',
        type: 'boolean',
        description: 'A swimming pool — look for rectangular or freeform blue/turquoise water areas',
    },
    {
        key: 'ai_solar_panels',
        label: 'Solar Panels',
        type: 'boolean',
        description: 'Solar panels on any rooftop — look for dark rectangular grid patterns on roofs',
    },
    {
        key: 'ai_detached_garage',
        label: 'Detached Garage',
        type: 'boolean',
        description: 'A garage structure separated from the main dwelling — look for a separate roofed structure near a driveway',
    },
    {
        key: 'ai_shed',
        label: 'Shed',
        type: 'boolean',
        description: 'A small detached storage shed or outbuilding — typically much smaller than the main dwelling',
    },
    {
        key: 'ai_driveway',
        label: 'Driveway',
        type: 'boolean',
        description: 'A paved or gravel driveway — look for a path from the road to a garage or parking area',
    },
    {
        key: 'ai_deck_patio',
        label: 'Deck / Patio',
        type: 'boolean',
        description: 'An outdoor deck, patio, or patio overhang attached to the dwelling',
    },
    {
        key: 'ai_carport',
        label: 'Car Port',
        type: 'boolean',
        description: 'An open-sided covered structure for vehicle parking (not an enclosed garage)',
    },
    {
        key: 'ai_gazebo',
        label: 'Gazebo',
        type: 'boolean',
        description: 'A freestanding roofed garden structure — look for a small circular or octagonal roof',
    },
    {
        key: 'ai_fences',
        label: 'Fences',
        type: 'boolean',
        description: 'Visible fence lines around the property perimeter or sections of the yard',
    },
    {
        key: 'ai_recreational',
        label: 'Tennis / Basketball / Rec Area',
        type: 'boolean',
        description: 'A sports court (tennis, basketball) or recreational area — look for distinctive court markings or large flat surfaces',
    },
    {
        key: 'ai_guest_house',
        label: 'Guest House / ADU',
        type: 'boolean',
        description: 'A secondary dwelling structure on the property — separate from main dwelling, larger than a shed, with its own roof',
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
        logger.error('Vision', `upsert failed: ${error.message}`, { field_key: payload.field_key });
    }
}

/**
 * Fetch the satellite image URL from existing enrichments.
 */
async function getSatelliteImageUrl(
    sb: ReturnType<typeof getSupabaseAdmin>,
    policyId: string
): Promise<string | null> {
    const { data } = await sb
        .from('property_enrichments')
        .select('field_value')
        .eq('policy_id', policyId)
        .eq('field_key', 'property_image')
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
        const contentType = res.headers.get('content-type') || 'image/png';
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

    return `You are a professional property inspection AI analyzing a satellite/overhead image of a residential property.

Your task is to examine this overhead image and report which exterior structures and features are visible.

For each target below, determine:
- "detected": true if you can see this feature, false if not
- "confidence": "high" if clearly visible, "medium" if somewhat visible but uncertain, "low" if barely visible or ambiguous
- "rationale": a short 1-sentence explanation of what you see (or why you believe the feature is absent)
- "manual_review": true if a human should verify this observation due to ambiguity

TARGET FEATURES TO ANALYZE:
${targetList}

IMPORTANT RULES:
- Only mark "detected: true" if you can genuinely see the feature in the image.
- Do NOT guess or hallucinate features that are not visible.
- Be honest about uncertainty — use "low" confidence and "manual_review: true" for ambiguous cases.
- This is an overhead/satellite view — some features may be partially occluded by trees or shadows.
- A "shed" is much smaller than a garage. A "guest house" is a full secondary dwelling.
- If the image quality is too poor to analyze, say so in the rationale.

Respond with ONLY a valid JSON object in this exact format:
{
  "observations": [
    {
      "key": "ai_pool",
      "detected": true,
      "confidence": "high",
      "rationale": "Clear rectangular blue pool visible in backyard",
      "manual_review": false
    },
    ...
  ],
  "image_quality": "good" | "moderate" | "poor",
  "overall_notes": "Brief summary of the property from overhead"
}

Include ALL ${VISION_TARGETS.length} targets in the observations array, even those not detected.`;
}

// ---------------------------------------------------------------------------
// OpenAI GPT-4o call
// ---------------------------------------------------------------------------

interface VisionObservation {
    key: string;
    detected: boolean;
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
        logger.error('Vision', 'OPENAI_API_KEY not configured');
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
            max_tokens: 2000,
            temperature: 0.1,  // Low temp for factual analysis
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        logger.error('Vision', `OpenAI API error: ${response.status} ${errText}`);
        return null;
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
        logger.error('Vision', 'Empty response from OpenAI');
        return null;
    }

    // Parse JSON from response (handle markdown code blocks)
    try {
        const jsonStr = rawContent
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            .trim();
        return JSON.parse(jsonStr) as VisionResponse;
    } catch (parseErr) {
        logger.error('Vision', `Failed to parse GPT-4o response: ${parseErr}`, { rawContent });
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

        // 1. Get satellite image URL from existing enrichments
        const imageUrl = await getSatelliteImageUrl(sb, policy_id);
        if (!imageUrl) {
            return NextResponse.json({
                error: 'No satellite image available for this policy. Run enrichment first.',
                results: { analyzed: false, reason: 'no_image' },
            }, { status: 422 });
        }

        // 2. Download and encode satellite image
        const imageBase64 = await imageUrlToBase64(imageUrl);
        if (!imageBase64) {
            return NextResponse.json({
                error: 'Failed to download satellite image for analysis',
                results: { analyzed: false, reason: 'download_failed' },
            }, { status: 422 });
        }

        // 3. Analyze with GPT-4o
        logger.info('Vision', `Starting AI vision analysis for policy ${policy_id}`);
        const visionResult = await analyzeWithGPT4o(imageBase64);

        if (!visionResult) {
            return NextResponse.json({
                error: 'AI vision analysis failed',
                results: { analyzed: false, reason: 'ai_error' },
            }, { status: 500 });
        }

        // 4. Store each observation in property_enrichments
        const storedObservations: Array<{
            key: string;
            label: string;
            detected: boolean;
            confidence: string;
            rationale: string;
            manual_review: boolean;
        }> = [];

        for (const obs of visionResult.observations) {
            // Find the target definition
            const target = VISION_TARGETS.find(t => t.key === obs.key);
            if (!target) continue;

            // Store every observation (detected or not) for complete records
            await upsertEnrichment(sb, {
                policy_id,
                field_key: obs.key,
                field_value: obs.detected ? 'detected' : 'not_detected',
                source_name: 'Satellite Vision AI',
                source_type: 'ai_interpretation',
                source_url: null,
                confidence: obs.confidence,
                notes: JSON.stringify({
                    label: target.label,
                    detected: obs.detected,
                    rationale: obs.rationale,
                    manual_review: obs.manual_review,
                    image_type: 'satellite',
                    image_quality: visionResult.image_quality,
                    model: 'gpt-4o',
                }),
            });

            storedObservations.push({
                key: obs.key,
                label: target.label,
                detected: obs.detected,
                confidence: obs.confidence,
                rationale: obs.rationale,
                manual_review: obs.manual_review,
            });
        }

        // 5. Store overall analysis metadata
        await upsertEnrichment(sb, {
            policy_id,
            field_key: 'ai_vision_summary',
            field_value: visionResult.overall_notes,
            source_name: 'Satellite Vision AI',
            source_type: 'ai_interpretation',
            source_url: null,
            confidence: 'medium',
            notes: JSON.stringify({
                image_quality: visionResult.image_quality,
                total_detected: visionResult.observations.filter(o => o.detected).length,
                total_targets: VISION_TARGETS.length,
                model: 'gpt-4o',
                image_type: 'satellite',
            }),
        });

        const detectedCount = storedObservations.filter(o => o.detected).length;
        logger.info('Vision', `Vision analysis complete: ${detectedCount}/${VISION_TARGETS.length} features detected`, { policy_id });

        return NextResponse.json({
            message: 'Vision analysis complete',
            results: {
                analyzed: true,
                image_quality: visionResult.image_quality,
                overall_notes: visionResult.overall_notes,
                detected_count: detectedCount,
                total_targets: VISION_TARGETS.length,
                observations: storedObservations,
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('Vision', `Unexpected error: ${msg}`);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
