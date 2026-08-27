import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { getPolicyDetailById, fetchFlagsByPolicyId, PolicyDetail, PolicyFlagRow, FlagDefinition } from '@/lib/api';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';


/**
 * Expected schema from the GPT-4o report synthesizer (v3 — compact client-facing).
 *
 * Changes from v2:
 *  - executive_summary: tighter (2-4 sentences)
 *  - top_concerns: shorter explanations
 *  - coverage_review: shorter observations
 *  - property_observations: retained for agent-only internal review
 *  - data_gaps / recommendations / action_items: retained for backwards compat,
 *    but the client report merges them into "Next Steps"
 *  - internal_notes: NEW — agent-only observations
 */
interface AIReportInsights {
    executive_summary: string;
    renewal_snapshot: string;
    top_concerns: Array<{
        topic: string;
        explanation: string;
        severity: 'high' | 'medium' | 'low';
        source: string;
        evidence: string;
    }>;
    coverage_review: Array<{
        coverage: string;
        current_value: string;
        observation: string;
        adequacy: 'adequate' | 'review' | 'gap' | 'unknown';
    }>;
    property_observations: Array<{
        observation: string;
        source: string;
        confidence: string;
        discrepancy: string;
    }>;
    data_gaps: Array<{
        field: string;
        impact: string;
        suggestion: string;
    }>;
    recommendations: Array<{
        text: string;
        category: 'discuss' | 'verify' | 'review' | 'consider_coverage';
        priority: number;
        source: string;
    }>;
    action_items: Array<{
        item: string;
        type: 'confirm' | 'discuss' | 'update' | 'verify';
        urgency: 'before_renewal' | 'at_renewal' | 'when_convenient';
    }>;
    next_steps?: Array<{ text: string; group: string }>;
    internal_notes: string;
}

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    try {
        const body = await req.json();
        const { policyId } = body;

        if (!policyId) {
            return NextResponse.json({ error: 'policyId is required' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();

        // 1. Gather all required data (using admin client to bypass RLS)
        const policy = await getPolicyDetailById(policyId, supabase);
        if (!policy) {
            return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
        }

        const flags = await fetchFlagsByPolicyId(policyId, supabase) || [];

        // Fetch enrichments for this policy directly using Admin
        const { data: enrichmentsData } = await supabase
            .from('property_enrichments')
            .select('*')
            .eq('policy_id', policyId);

        const enrichments = enrichmentsData || [];

        // Fetch linked RCE documents and exact RCE calculations (doc_data_rce)
        const { data: rceDocs } = await supabase
            .from('platform_documents')
            .select('id, file_name, extracted_owner_name, extracted_address, created_at')
            .eq('policy_id', policyId)
            .eq('doc_type', 'rce')
            .not('parse_status', 'eq', 'failed')
            .order('created_at', { ascending: false });

        let rceData: any = null;
        if (rceDocs && rceDocs.length > 0) {
            const docIds = rceDocs.map(d => d.id);
            const { data: rceRows } = await supabase
                .from('doc_data_rce')
                .select('*')
                .in('document_id', docIds)
                .order('created_at', { ascending: false });

            if (rceRows && rceRows.length > 0) {
                const latestRce = rceRows[0];
                const matchingDoc = rceDocs.find(d => d.id === latestRce.document_id);
                // Determine clean carrier / provider name (e.g. "Bamboo", "360Value", "e2Value")
                // Never use technical accounts, system emails, or "Web Services" / "Guidewire"
                const rawCreatedBy = latestRce.created_by?.trim() || '';
                const isTechnicalOrEmail = !rawCreatedBy ||
                    /@/i.test(rawCreatedBy) ||
                    /web\s*services|guidewire|system|admin|batch|api|user|service/i.test(rawCreatedBy);

                let providerName = '';
                if (!isTechnicalOrEmail) {
                    if (/bamboo/i.test(rawCreatedBy)) providerName = 'Bamboo';
                    else if (/360\s*value/i.test(rawCreatedBy)) providerName = '360Value';
                    else if (/e2\s*value/i.test(rawCreatedBy)) providerName = 'e2Value';
                    else if (/corelogic/i.test(rawCreatedBy)) providerName = 'CoreLogic';
                    else if (/verisk/i.test(rawCreatedBy)) providerName = 'Verisk';
                    else providerName = rawCreatedBy.replace(/\s+(insurance|services|group|corp)$/i, '');
                }

                if (!providerName && matchingDoc?.file_name) {
                    if (/bamboo/i.test(matchingDoc.file_name)) providerName = 'Bamboo';
                    else if (/360\s*value/i.test(matchingDoc.file_name)) providerName = '360Value';
                    else if (/e2\s*value/i.test(matchingDoc.file_name)) providerName = 'e2Value';
                    else if (/corelogic/i.test(matchingDoc.file_name)) providerName = 'CoreLogic';
                    else if (/verisk/i.test(matchingDoc.file_name)) providerName = 'Verisk';
                }

                if (!providerName && policy.carrier_name && !/california\s*fair\s*plan|cfp/i.test(policy.carrier_name)) {
                    providerName = policy.carrier_name.replace(/\s+(insurance|services|group|corp)$/i, '');
                }

                if (!providerName) {
                    providerName = 'Bamboo';
                }

                const formattedCost = latestRce.replacement_cost
                    ? `$${Number(latestRce.replacement_cost).toLocaleString('en-US')}`
                    : null;
                const formattedCostPerSqft = latestRce.cost_per_sqft
                    ? `$${Number(latestRce.cost_per_sqft).toLocaleString('en-US')}`
                    : null;

                rceData = {
                    provider_name: providerName,
                    source_label: `${providerName} RCE`,
                    replacement_cost_exact: formattedCost,
                    replacement_cost_numeric: latestRce.replacement_cost,
                    cost_per_sqft: formattedCostPerSqft,
                    sq_feet: latestRce.sq_feet,
                    year_built: latestRce.year_built,
                    quality_grade: latestRce.quality_grade,
                    date_calculated: latestRce.date_calculated,
                    valuation_id: latestRce.valuation_id,
                };
            }
        }

        // Fetch flag definitions with report config (report_enabled, report_prompt_hint)
        const { data: flagDefsData } = await supabase
            .from('flag_definitions')
            .select('code, label, default_severity, report_enabled, report_prompt_hint')
            .eq('is_active', true);
        const flagDefs: Array<Pick<FlagDefinition, 'code' | 'label' | 'default_severity' | 'report_enabled' | 'report_prompt_hint'>> = flagDefsData || [];

        // Fetch latest config version and active template config
        const { data: configChangelog } = await supabase
            .from('report_config_changelog')
            .select('version_number, changed_at, changes')
            .order('version_number', { ascending: false })
            .limit(1)
            .maybeSingle();

        const activeTemplate = configChangelog?.changes?.template_config || {};
        const selectedTone = activeTemplate.tone || 'consultative_advisory';
        const customDirectives = activeTemplate.custom_prompt_directives || '';
        const rules = {
            strict_non_adequacy: true,
            exact_numerical_accuracy: true,
            explicit_source_attribution: true,
            property_noise_filter: true,
            suppress_fire_risk: true,
            suppress_image_quality_notes: true,
            standardize_fair_rental_value: true,
            ...(activeTemplate.rules || {}),
        };

        // Partition flags into mandatory (report_enabled) and suppressed
        const openFlagCodes = new Set(flags.filter(f => f.status === 'open').map(f => f.code));
        const mandatoryFlags = flagDefs.filter(fd => fd.report_enabled && openFlagCodes.has(fd.code));
        const suppressedFlags = flagDefs.filter(fd => !fd.report_enabled && openFlagCodes.has(fd.code));

        // Build mandatory/suppressed instruction blocks for the prompt
        let flagInstructions = '';
        if (mandatoryFlags.length > 0) {
            flagInstructions += `\nMANDATORY FLAG REPORTING INSTRUCTIONS:\nThe following flags are active on this policy and MUST be addressed in your report.\nDo NOT skip any of these. Use the provided guidance for tone and framing:\n`;
            mandatoryFlags.forEach(fd => {
                const hint = fd.report_prompt_hint ? ` — Guidance: "${fd.report_prompt_hint}"` : '';
                flagInstructions += `- ${fd.label} (${fd.default_severity})${hint}\n`;
            });
        }
        if (suppressedFlags.length > 0) {
            flagInstructions += `\nSUPPRESSED FLAGS (DO NOT MENTION IN CLIENT REPORT):\nThe following flags exist on this policy but must NOT appear in the client-facing report:\n`;
            suppressedFlags.forEach(fd => {
                flagInstructions += `- ${fd.code}\n`;
            });
        }

        // 2. Build deterministic JSON payload (Layer 1)
        const dataPayload = {
            policy,
            rce_data: rceData,
            flags: flags.map(f => ({
                code: f.code,
                title: f.title,
                severity: f.severity,
                status: f.status,
                source: f.source
            })),
            enrichments: enrichments.map((e: any) => ({
                key: e.field_key,
                value: e.field_value,
                confidence: e.confidence,
                source: e.source_name,
                notes: e.notes
            })),
            config_version: configChangelog?.version_number || 1,
            config_changed_at: configChangelog?.changed_at || null,
            template_config: activeTemplate,
        };

        // 3. Prompt GPT-4o for Synthesis (Layer 2)
        const openAiKey = env.OPENAI_API_KEY;
        if (!openAiKey) {
            logger.warn('Generate', 'OPENAI_API_KEY missing - saving draft report without AI insights')
            return saveAndReturnReport(policyId, policy.client_id, dataPayload, {
                executive_summary: "Coverage review in progress.",
                renewal_snapshot: "",
                top_concerns: [],
                coverage_review: [],
                property_observations: [],
                data_gaps: [],
                recommendations: [],
                action_items: [],
                next_steps: [],
                internal_notes: ""
            });
        }

        const streetViewDateEnrichment = enrichments.find((e: any) => e.field_key === 'street_view_capture_date');
        const streetViewEnrichment = enrichments.find((e: any) => e.field_key === 'street_view_image');
        const streetViewDate = streetViewDateEnrichment?.field_value || (streetViewEnrichment?.notes?.match(/Date:\s*([^)]+)/)?.[1] !== 'Unknown' ? streetViewEnrichment?.notes?.match(/Date:\s*([^)]+)/)?.[1] : null);
        const streetViewSourceLabel = streetViewDate ? `Google Street View (Photo Captured: ${streetViewDate})` : 'Google Street View';

        const tonePrompt = selectedTone === 'executive_analytical'
            ? 'TONE: Executive, concise, data-driven, and high-density. Focus heavily on numerical benchmarks, variances, and specific coverage differentials.'
            : selectedTone === 'educational_direct'
            ? 'TONE: Educational, direct, and empowering. Use accessible plain-language explanations to clearly illustrate why specific endorsements matter.'
            : 'TONE: Consultative, advisory, proactive, and non-judgmental. Position all findings as collaborative discussion points for the policyholder and agent.';

        const customDirectivesBlock = customDirectives.trim()
            ? `\nCUSTOM BROKERAGE DIRECTIVES (APPLY THESE STRICTLY):\n${customDirectives.trim()}\n`
            : '';

        const systemPrompt = `
You are creating a COMPACT, CLIENT-FACING coverage comparison report for an insurance brokerage.
This report will be shared with the client. It must be clear, professional, concise, and non-judgmental.

${tonePrompt}
${customDirectivesBlock}
AUDIENCE: Homeowners and policyholders. Use plain language. No jargon.

STRICT MANDATORY RULES:
${rules.explicit_source_attribution ? `1. EVERYTHING MUST BE SOURCED & NAMED SPECIFICALLY:
   - Every top concern, coverage review item, property observation, and recommendation MUST explicitly specify its exact data source.
   - For Replacement Cost Estimates, ALWAYS state the specific carrier/provider company cleanly (e.g., "${rceData?.source_label || 'Bamboo RCE'}" or "360Value RCE", NEVER "Web Services", NEVER email addresses or technical system usernames, and NEVER just generic "Replacement Cost Estimate (RCE)").
   - For Google Satellite & Aerial Imagery observations, ALWAYS cite the source as "Google Satellite Vision".
   - For Google Street View observations, ALWAYS cite the source as "${streetViewSourceLabel}".` : ''}

${rules.exact_numerical_accuracy ? `2. EXACT NUMERICAL ACCURACY (NEVER ROUND):
   - NEVER round, estimate, or change any dollar amount.
   - Use the EXACT figures provided in dataPayload (down to the penny or dollar). For example, if RCE replacement cost is ${rceData?.replacement_cost_exact || '$987,450'}, state '${rceData?.replacement_cost_exact || '$987,450'}' (NEVER round it to '$990,000' or '~1M').` : ''}

${rules.strict_non_adequacy ? `3. DO NOT DETERMINE COVERAGE ADEQUACY: Never state, imply, or judge whether coverage is "adequate", "inadequate", "sufficient", or "deficient". Determining adequacy creates liability. Your job is ONLY to explain where we found coverage on their previous policy and point out differences or optional coverages that may be missing.` : ''}

4. NEUTRAL & COMPARATIVE TONE: Frame findings neutrally: "On your previous policy, X limit was $Y. An option to adjust to $Z is available to evaluate." or "This endorsement was not present on your prior dec page."

5. NO GUARANTEES: Never reassure the client that they are "fully protected" or "properly covered".

6. CLIENT RESPONSIBILITY: Frame all recommendations as options for the client to review and decide upon.

7. BE CONCISE: Observations 10-15 words max.

${rules.property_noise_filter ? `8. PROPERTY OBSERVATIONS & NOISE REDUCTION (ACTIONABLE COVERAGE GAPS ONLY):
   - DO NOT include generic, expected property attributes (e.g., "two-story home", "attached garage", "standard driveway", "tile roof") unless they directly reveal an under-coverage gap or unlisted risk.
   - ONLY report property observations that have direct coverage or limit implications, such as:
     * Other Structures Gaps (swimming pool, solar panels, detached garage, storage shed, outbuildings, perimeter fences, gazebo, guest house/ADU when Other Structures coverage is $0 or low).
     * High-Risk / Special Liability Features (trampoline, diving board, separate rental unit).
   - If an observation does NOT point to a potential coverage gap or necessary discussion point, OMIT IT ENTIRELY.
   - For detected structures, use neutral phrasing: "We may have detected a [structure] based on Google Satellite Vision. Please confirm with your agent so we can ensure it is properly covered."` : ''}

${rules.standardize_fair_rental_value ? `9. FAIR RENTAL VALUE: "Loss of Use" and "Fair Rental Value" are the exact same coverage. Always refer to it as "Fair Rental Value" and never say it is missing if "Fair Rental Value" is present.` : ''}

10. EVIDENCE FORMATTING: Do NOT use literal system flag names (like "NO_DIC" or "MISSING_PERILS_INSURED") in the evidence or explanations. Use natural, human-readable language (e.g., "No DIC coverage on file").

11. NO CROSS-SECTION DUPLICATION (CRITICAL):
    - KEY FINDINGS (top_concerns) are STRICTLY reserved for 2-3 major policy-level findings:
      * Core Valuation differences (e.g. "${rceData?.source_label || 'Bamboo RCE'}" estimated replacement cost of ${rceData?.replacement_cost_exact || '$X'} vs current Dwelling limit of $Y).
      * Missing major coverage lines (e.g. "$0 limit on Other Structures coverage").
      * Missing DIC policy (e.g. "No DIC (Difference in Conditions) policy on file for earthquake or flood").
      * Policy deductible or endorsement differences.
    - NEVER put physical imagery observations (e.g., "pool detected", "solar panels detected", "detached shed", "fence") into KEY FINDINGS (top_concerns).
    - Physical imagery detections belong EXCLUSIVELY in 'property_observations' and attached as 'related_findings' on the relevant coverage row in 'coverage_review'.
    - In top_concerns, 'explanation' must be a standalone, concise sentence with exact numbers and source. 'evidence' should be a short 3-5 word label (e.g. "${rceData?.source_label || 'Bamboo RCE'}").

EXCLUSIONS AND GUARDRAILS:
${rules.suppress_fire_risk ? '1. NO FIRE RISK: NEVER mention fire risk, fire scores, or wildfire scores in any section. Completely suppress these findings.' : ''}
${rules.suppress_image_quality_notes ? '2. NO IMAGERY NOTES: NEVER mention satellite image quality or photo limitations.' : ''}
3. NO INSPECTION NOTES: NEVER recommend visual, property, or field inspections.
4. NO "APPROVED VENDOR": DO NOT use the phrase "with an approved vendor". Simply state "Review replacement cost estimate".
5. NO REASSURANCE: NEVER use words like "adequate", "inadequate", "sufficient", "properly covered", "looks good", or "coverage is good".
6. SOURCED COMPARISON ONLY: Every recommendation must cite what data source triggered the observation.

${rceData ? `
VALUATION & RCE DATA GUIDANCE (RCE DOCUMENT ON FILE):
- Verified RCE calculation available in dataPayload.rce_data:
  * Provider / Source Label: "${rceData.source_label}"
  * Exact Estimated Replacement Cost: ${rceData.replacement_cost_exact}
  * Cost Per Sq Ft: ${rceData.cost_per_sqft || 'N/A'}
- In coverage_review (Dwelling) and Key Findings, reference this exact figure (${rceData.replacement_cost_exact}) citing source "${rceData.source_label}".
- NEVER present estimates as authoritative.
` : `
VALUATION & RCE DATA GUIDANCE (NO RCE DOCUMENT ON FILE):
- NO Replacement Cost Estimate (RCE) document has been uploaded for this policy (dataPayload.rce_data is null).
- NEVER invent an RCE estimate or cite "Source: Replacement Cost Estimate (RCE)".
- DO NOT mistake Companion DIC limits (e.g., dic_limit_dwelling) for an RCE estimate.
- If companion DIC coverage is present on file, accurately refer to it as "Companion DIC Policy" (e.g. "Companion DIC policy has a dwelling limit of $X" with source "Companion DIC Policy").
`}

COVERAGE REVIEW STRUCTURE & OTHER STRUCTURES ATTACHMENTS (MANDATORY):
- Do NOT include per-row "Source:" text in coverage_review items since coverage data obviously comes from the policy declaration page.
- For "Other Structures (B)": You MUST inspect dataPayload.enrichments and attach ALL detected structures and physical features as separate items in "related_findings" (not just one!):
  * Swimming pool: "Swimming pool detected on premises" (Source: "Google Satellite Vision")
  * Rooftop solar panels: "Rooftop solar panels detected" (Source: "Google Satellite Vision")
  * Perimeter fences: "Perimeter fencing detected" (Source: "Google Satellite Vision")
  * Detached garage: "Detached garage detected" (Source: "Google Satellite Vision")
  * Storage shed / outbuilding: "Outbuilding / storage shed detected" (Source: "Google Satellite Vision")
  * Gazebo, deck/patio, carport, guest house / ADU: Add each detected item as its own related_finding.
  * If multiple structures are detected in dataPayload.enrichments, include ALL of them as separate entries in related_findings.
- For "Dwelling (A)": If an RCE estimate is available in dataPayload.rce_data, attach the RCE calculation difference as a related_finding citing "${rceData?.source_label}".
- related_findings should be brief supporting data points (1 sentence) with specific source (e.g. source: "${rceData?.source_label || 'Companion DIC Policy'}" or source: "Google Satellite Vision" or source: "${streetViewSourceLabel}").
${flagInstructions}
Data Context:
${JSON.stringify(dataPayload, null, 2)}
`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                temperature: 0.1,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: 'Generate the structured report. Be concise — the client report should feel tight and premium, not verbose.' }
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'report_insights_v4',
                        strict: true,
                        schema: {
                            type: 'object',
                            properties: {
                                top_concerns: {
                                    type: 'array',
                                    description: 'Top 3-5 findings. Keep explanations to 1-2 sentences.',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            explanation: { type: 'string', description: 'Clear, client-facing explanation of the concern.' },
                                            source: { type: 'string', description: 'Data source: policy, satellite, property data, etc.' },
                                            evidence: { type: 'string', description: 'Brief data point supporting this concern' }
                                        },
                                        required: ['explanation', 'source', 'evidence'],
                                        additionalProperties: false
                                    }
                                },
                                coverage_review: {
                                    type: 'array',
                                    description: 'Comparative notes per coverage line. Keep observations to 10-15 words. Attach any related findings (e.g. satellite detections, RCE data) as related_findings so they appear as supporting evidence next to the coverage line.',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            coverage: { type: 'string', description: 'Coverage name' },
                                            current_value: { type: 'string', description: 'Current limit from the policy' },
                                            observation: { type: 'string', description: 'Brief comparative note (10-15 words max)' },
                                            source: { type: 'string', description: 'Source document or line reference' },
                                            related_findings: {
                                                type: 'array',
                                                description: 'Supporting evidence items linked to this coverage line. Include flag findings, satellite detections, RCE comparisons. Each item has a brief text and its data source.',
                                                items: {
                                                    type: 'object',
                                                    properties: {
                                                        text: { type: 'string', description: 'Brief supporting finding (1 sentence)' },
                                                        source: { type: 'string', description: 'Data source: Google imagery, RCE, ATTOM, etc.' }
                                                    },
                                                    required: ['text', 'source'],
                                                    additionalProperties: false
                                                }
                                            }
                                        },
                                        required: ['coverage', 'current_value', 'observation', 'source', 'related_findings'],
                                        additionalProperties: false
                                    }
                                },
                                property_observations: {
                                    type: 'array',
                                    description: 'Structured property observations from enrichment data. Include only high-value items.',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            observation: { type: 'string', description: 'What was observed (1 sentence)' },
                                            source: { type: 'string', description: 'Named data source' },
                                            confidence: { type: 'string', description: 'high, medium, or low' },
                                            discrepancy: { type: 'string', description: 'Any conflict with policy data. Empty string if none.' }
                                        },
                                        required: ['observation', 'source', 'confidence', 'discrepancy'],
                                        additionalProperties: false
                                    }
                                },
                                next_steps: {
                                    type: 'array',
                                    description: 'Actionable next steps, combining recommendations, action items, and data gaps into a single logical list. No duplicates.',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            text: { type: 'string', description: 'Clear, concise recommendation or action item (1 sentence)' },
                                            timeframe: { type: 'string', enum: ['review_now', 'discuss_at_renewal', 'confirm_and_update'] }
                                        },
                                        required: ['text', 'timeframe'],
                                        additionalProperties: false
                                    }
                                },
                                internal_notes: {
                                    type: 'string',
                                    description: 'Agent-only notes: technical observations, enrichment conflicts, raw data insights. NOT shown to clients.'
                                }
                            },
                            required: ['top_concerns', 'coverage_review', 'property_observations', 'next_steps', 'internal_notes'],
                            additionalProperties: false
                        }
                    }
                }
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            logger.error('Generate', 'OpenAI Error:', { detail: errBody })
            throw new Error('Failed to generate AI insights');
        }

        const responseData = await response.json();
        const aiInsights: AIReportInsights = JSON.parse(responseData.choices[0].message.content);

        // 4. Save to DB
        return await saveAndReturnReport(policyId, policy.client_id, dataPayload, aiInsights);

    } catch (err: any) {
        logger.error('Generate', 'Error generating report:', err)
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

async function saveAndReturnReport(policyId: string, clientId: string | undefined, dataPayload: any, aiInsights: AIReportInsights) {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('policy_reports')
        .insert({
            policy_id: policyId,
            client_id: clientId || null,
            status: 'published',
            data_payload: dataPayload,
            ai_insights: aiInsights
        })
        .select()
        .single();

    if (error) {
        logger.error('Generate', 'Failed to save report to DB:', { error: error.message })
        return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
    }

    // Activity event: report generated
    try {
        await supabase.from('activity_events').insert({
            event_type: 'report.generated',
            title: 'Coverage analysis report generated',
            detail: `Report created for policy review`,
            policy_id: policyId,
            client_id: clientId || null,
            meta: { report_id: data.id },
        });
    } catch (e) {
        logger.warn('Generate', 'Activity event insert failed (non-fatal):', { error: e instanceof Error ? e.message : String(e) });
    }

    // Save a reference in platform_documents so report appears in Files tab
    try {
        const reportDate = new Date().toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
        });
        await supabase.from('platform_documents').insert({
            policy_id: policyId,
            client_id: clientId || null,
            doc_type: 'other',
            file_name: `Coverage Analysis Report — ${reportDate}.pdf`,
            parse_status: 'parsed',
            match_status: 'matched',
            writeback_status: 'complete',
            processing_step: null,
            error_message: null,
        });
    } catch (e) {
        logger.warn('Generate', 'platform_documents insert for report failed (non-fatal):', { error: e instanceof Error ? e.message : String(e) });
    }

    return NextResponse.json({ success: true, report: data });
}
