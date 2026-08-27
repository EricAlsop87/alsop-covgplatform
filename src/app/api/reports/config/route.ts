import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';

export interface ReportSectionConfig {
    id: string;
    label: string;
    description: string;
    enabled: boolean;
    order: number;
}

export interface ReportRulesConfig {
    strict_non_adequacy: boolean;
    exact_numerical_accuracy: boolean;
    explicit_source_attribution: boolean;
    property_noise_filter: boolean;
    suppress_fire_risk: boolean;
    suppress_image_quality_notes: boolean;
    standardize_fair_rental_value: boolean;
}

export interface ReportBrandingConfig {
    agency_name: string;
    license_number: string;
    phone: string;
    header_badge: string;
    disclaimer_text: string;
}

export type ReportTone = 'consultative_advisory' | 'educational_direct' | 'executive_analytical';

export interface ReportTemplateConfig {
    tone: ReportTone;
    custom_prompt_directives: string;
    sections: ReportSectionConfig[];
    rules: ReportRulesConfig;
    branding: ReportBrandingConfig;
    version_number?: number;
    updated_at?: string;
}

export const DEFAULT_REPORT_CONFIG: ReportTemplateConfig = {
    tone: 'consultative_advisory',
    custom_prompt_directives: 'Emphasize that the agency is conducting an annual policy review to ensure coverage limits keep pace with current construction costs and modern building codes.',
    sections: [
        {
            id: 'executive_summary',
            label: 'Executive Summary',
            description: 'Concise 2-4 sentence overview of key findings and annual review purpose.',
            enabled: true,
            order: 0,
        },
        {
            id: 'top_concerns',
            label: 'Key Consultation Highlights',
            description: 'Top 3-5 priority findings with headline, concise explanation, and evidence anchor.',
            enabled: true,
            order: 1,
        },
        {
            id: 'coverage_review',
            label: 'Coverage & Rebuild Benchmark Matrix',
            description: 'Comparison table of coverage lines with current limits, discovery sources, and advisory recommendations.',
            enabled: true,
            order: 2,
        },
        {
            id: 'property_observations',
            label: 'Property & Aerial Observations',
            description: 'High-value physical structures (swimming pools, solar panels, detached garages, outbuildings, fences).',
            enabled: true,
            order: 3,
        },
        {
            id: 'dic_matrix',
            label: 'Essential Companion Protection (DIC)',
            description: 'Difference in Conditions matrix highlighting water, pipe burst, theft, and liability protections.',
            enabled: true,
            order: 4,
        },
        {
            id: 'next_steps',
            label: 'Consultation Agenda & Next Steps',
            description: 'Prioritized checklist grouped by timeframe (Review Now, At Renewal, Confirm & Update).',
            enabled: true,
            order: 5,
        },
        {
            id: 'sources',
            label: 'Sources & Legal Notice',
            description: 'Agency signature, named third-party data sources, and policyholder responsibility notice.',
            enabled: true,
            order: 6,
        },
    ],
    rules: {
        strict_non_adequacy: true,
        exact_numerical_accuracy: true,
        explicit_source_attribution: true,
        property_noise_filter: true,
        suppress_fire_risk: true,
        suppress_image_quality_notes: true,
        standardize_fair_rental_value: true,
    },
    branding: {
        agency_name: 'John Alsop Insurance Agency',
        license_number: 'CA Lic #0D12345',
        phone: '(909) 626-5000',
        header_badge: 'Annual Policy Review',
        disclaimer_text: 'This report is provided for informational and comparative advisory purposes only based on policy documents and third-party data provided to our office. Final decisions regarding coverage limits, endorsements, and carrier selection remain solely with the policyholder.',
    },
};

/**
 * GET /api/reports/config
 * Returns active report configuration and latest changelog version.
 */
export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    try {
        const supabase = getSupabaseAdmin();

        // Check latest changelog entry with full template config
        const { data: changelogEntry } = await supabase
            .from('report_config_changelog')
            .select('version_number, changed_at, changes')
            .order('version_number', { ascending: false })
            .limit(1)
            .maybeSingle();

        let config = DEFAULT_REPORT_CONFIG;
        if (changelogEntry?.changes?.template_config) {
            config = {
                ...DEFAULT_REPORT_CONFIG,
                ...changelogEntry.changes.template_config,
                rules: { ...DEFAULT_REPORT_CONFIG.rules, ...(changelogEntry.changes.template_config.rules || {}) },
                branding: { ...DEFAULT_REPORT_CONFIG.branding, ...(changelogEntry.changes.template_config.branding || {}) },
            };
        }

        return NextResponse.json({
            success: true,
            config: {
                ...config,
                version_number: changelogEntry?.version_number || 1,
                updated_at: changelogEntry?.changed_at || new Date().toISOString(),
            },
        });
    } catch (err: any) {
        logger.error('ReportConfig', 'Error fetching report config', { error: err.message });
        return NextResponse.json({ success: true, config: DEFAULT_REPORT_CONFIG });
    }
}

/**
 * POST /api/reports/config
 * Updates report configuration and increments config version.
 */
export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service'] });
    if (isAuthError(auth)) return auth;

    try {
        const body = await req.json();
        const { config } = body;

        if (!config || typeof config !== 'object') {
            return NextResponse.json({ error: 'Invalid config payload' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();

        // Get latest version number
        const { data: latestEntry } = await supabase
            .from('report_config_changelog')
            .select('version_number')
            .order('version_number', { ascending: false })
            .limit(1)
            .maybeSingle();

        const nextVersion = (latestEntry?.version_number || 0) + 1;

        const sanitizedConfig: ReportTemplateConfig = {
            tone: config.tone || DEFAULT_REPORT_CONFIG.tone,
            custom_prompt_directives: typeof config.custom_prompt_directives === 'string' ? config.custom_prompt_directives : DEFAULT_REPORT_CONFIG.custom_prompt_directives,
            sections: Array.isArray(config.sections) ? config.sections : DEFAULT_REPORT_CONFIG.sections,
            rules: { ...DEFAULT_REPORT_CONFIG.rules, ...(config.rules || {}) },
            branding: { ...DEFAULT_REPORT_CONFIG.branding, ...(config.branding || {}) },
            version_number: nextVersion,
            updated_at: new Date().toISOString(),
        };

        const { error: insertError } = await supabase
            .from('report_config_changelog')
            .insert({
                version_number: nextVersion,
                changed_by: auth.user?.id || null,
                changes: {
                    event: 'report_template_config_updated',
                    template_config: sanitizedConfig,
                },
            });

        if (insertError) {
            logger.error('ReportConfig', 'Failed to save config changelog', { error: insertError.message });
            return NextResponse.json({ error: 'Failed to persist configuration' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            config: sanitizedConfig,
            message: `Report configuration saved successfully (v${nextVersion})`,
        });
    } catch (err: any) {
        logger.error('ReportConfig', 'Unexpected error saving report config', { error: err.message });
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
