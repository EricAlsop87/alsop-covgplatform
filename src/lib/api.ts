import { type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { logger } from './logger';
import { INACTIVE_STATUSES, ACTIVE_STATUS_FILTER } from './policyFilters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Raw row shape from the `dec_pages` Supabase table.
 * Mirrors the DB schema so we can eliminate `any` casts.
 */
export interface SupabaseDeclarationRow {
    id: string;
    created_at?: string;
    // Relational links
    submission_id?: string;
    created_by_account_id?: string;
    client_id?: string;
    policy_id?: string;
    policy_term_id?: string;
    // Insured
    insured_name?: string;
    secondary_insured_name?: string;
    // Addresses
    mailing_address?: string;
    property_location?: string;
    // Policy metadata
    policy_number?: string;
    date_issued?: string;
    policy_period_start?: string;
    policy_period_end?: string;
    // Property details
    year_built?: string;
    occupancy?: string;
    number_of_units?: string;
    construction_type?: string;
    deductible?: string;
    // Coverage limits
    limit_dwelling?: string;
    limit_other_structures?: string;
    limit_personal_property?: string;
    limit_fair_rental_value?: string;
    limit_ordinance_or_law?: string;
    limit_debris_removal?: string;
    limit_extended_dwelling_coverage?: string;
    limit_dwelling_replacement_cost?: string;
    limit_inflation_guard?: string;
    limit_personal_property_replacement_cost?: string;
    limit_fences?: string;
    limit_permitted_incidental_occupancy?: string;
    limit_plants_shrubs_trees?: string;
    limit_outdoor_radio_tv_equipment?: string;
    limit_awnings?: string;
    limit_signs?: string;
    // Special coverage
    limit_actual_cash_value_coverage?: string;
    limit_replacement_cost_coverage?: string;
    limit_building_code_upgrade_coverage?: string;
    limit_extended_replacement_cost_coverage?: string;
    limit_guaranteed_replacement_cost_coverage?: string;
    // Flags (checkboxes)
    cb_fire_lightning_smoke_damage?: string;
    cb_extended_coverages?: string;
    cb_vandalism_malicious_mischief?: string;
    // Premium
    total_annual_premium?: string;
    // Broker
    broker_name?: string;
    broker_address?: string;
    broker_phone_number?: string;
    // Mortgagees
    mortgagee_1_name?: string;
    mortgagee_1_address?: string;
    mortgagee_1_code?: string;
    mortgagee_1_loan_number?: string;
    mortgagee_2_name?: string;
    mortgagee_2_address?: string;
    mortgagee_2_code?: string;
    mortgagee_2_loan_number?: string;
    // DIC
    dic_company?: string;
    // Raw text
    raw_text?: string;
    // System
    status?: string;
}

/**
 * Application-level Declaration type.
 * This is the canonical shape used by all UI components that need full dec page detail.
 */
export interface Declaration {
    id: string;
    // Relational links
    client_id?: string;
    policy_id?: string;
    policy_term_id?: string;
    submission_id?: string;
    client_email?: string;
    client_phone?: string;
    // Insured Information
    insured_name: string;
    secondary_insured_name?: string;
    // Addresses
    mailing_address: string;
    property_location: string;
    // Policy Metadata
    policy_number: string;
    carrier_policy_number?: string;
    previous_policy_number?: string;
    date_issued: string;
    policy_period_start: string;
    policy_period_end: string;
    renewal_date: string;
    // Property Details
    year_built: number;
    occupancy: string;
    number_of_units: number;
    construction_type: string;
    deductible: string;
    // Coverage Limits
    limit_dwelling: string;
    limit_other_structures: string;
    limit_personal_property: string;
    limit_fair_rental_value: string;
    limit_ordinance_or_law: string;
    limit_debris_removal: string;
    limit_extended_dwelling_coverage: string;
    limit_dwelling_replacement_cost: string;
    limit_inflation_guard: string;
    limit_personal_property_replacement_cost: string;
    limit_fences: string;
    limit_permitted_incidental_occupancy: string;
    limit_plants_shrubs_trees: string;
    limit_outdoor_radio_tv_equipment: string;
    limit_awnings: string;
    limit_signs: string;
    // Special Coverage
    limit_actual_cash_value_coverage?: string;
    limit_replacement_cost_coverage?: string;
    limit_building_code_upgrade_coverage?: string;
    limit_extended_replacement_cost_coverage?: string;
    limit_guaranteed_replacement_cost_coverage?: string;
    // Flags (Checkboxes)
    cb_fire_lightning_smoke_damage: string;
    cb_extended_coverages: string;
    cb_vandalism_malicious_mischief: string;
    // Premium
    total_annual_premium: string;
    // Broker
    broker_name: string;
    broker_address: string;
    broker_phone_number: string;
    // Mortgagees
    mortgagee_1_name?: string;
    mortgagee_1_address?: string;
    mortgagee_1_code?: string;
    mortgagee_1_loan_number?: string;
    mortgagee_2_name?: string;
    mortgagee_2_address?: string;
    mortgagee_2_code?: string;
    mortgagee_2_loan_number?: string;
    // DIC (Difference in Conditions)
    dic_company?: string;
    dic_exists?: boolean;
    dic_policy_number?: string;
    dic_limit_dwelling?: string;
    dic_limit_other_structures?: string;
    dic_limit_personal_property?: string;
    dic_limit_loss_of_use?: string;
    dic_deductible?: string;
    dic_annual_premium_raw?: number;
    dic_bamboo_eligible?: boolean;
    dic_aegis_eligible?: boolean;
    dic_psic_eligible?: boolean;

    // System Fields
    status: 'Pending Review' | 'Approved' | 'Rejected' | 'Incomplete';
    flags: string[];
}

// ---------------------------------------------------------------------------
// New Normalized Schema Types
// ---------------------------------------------------------------------------

/** Row shape from the `clients` table. */
export interface ClientRow {
    id: string;
    created_by_account_id: string;
    named_insured: string;
    insured_type?: string;
    email?: string;
    phone?: string;
    mailing_address_raw?: string;
    mailing_address_norm?: string;
    is_demo?: boolean;
    created_at?: string;
    updated_at?: string;
}

/** Row shape from the `policies` table. */
export interface PolicyRow {
    id: string;
    created_by_account_id: string;
    client_id: string;
    policy_number: string;
    carrier_name?: string;
    property_address_raw?: string;
    property_address_norm?: string;
    status?: string;
    dic_bamboo_eligible?: boolean;
    dic_aegis_eligible?: boolean;
    dic_psic_eligible?: boolean;
    created_at?: string;
    updated_at?: string;
}

/** Row shape from the `policy_terms` table. */
export interface PolicyTermRow {
    id: string;
    policy_id: string;
    carrier_policy_number?: string;
    effective_date?: string;
    expiration_date?: string;
    date_issued?: string;
    annual_premium?: number;
    is_current?: boolean;
    policy_activity?: string;
    carrier_status?: string;
    payment_status?: string;
    payment_plan?: string;
    cancellation_reason?: string;
    dic_exists?: boolean;
    dic_policy_number?: string;
    dic_limit_dwelling?: string;
    dic_limit_other_structures?: string;
    dic_limit_personal_property?: string;
    dic_limit_loss_of_use?: string;
    dic_deductible?: string;
    dic_annual_premium_raw?: number;
    sold_by?: string;
    office?: string;
    import_batch_id?: string;
    created_at?: string;
    updated_at?: string;
}

/** Row shape from the `policy_flags` table. */
export interface PolicyFlagRow {
    id: string;
    policy_id?: string | null;
    client_id?: string | null;
    policy_term_id?: string | null;
    submission_id?: string | null;
    dec_page_id?: string | null;
    source_dec_page_id?: string | null;
    code: string;
    severity: string;
    title: string;
    message?: string | null;
    details?: Record<string, unknown>;
    source: string;
    status: string;               // 'open' | 'resolved' | 'dismissed'
    flag_key?: string | null;
    category?: string | null;
    action_path?: string | null;
    rule_version?: string | null;
    assigned_account_id?: string | null;
    assigned_office?: string | null;
    first_seen_at?: string | null;
    last_seen_at?: string | null;
    times_seen?: number;
    created_by_account_id?: string | null;
    created_at?: string;
    updated_at?: string | null;
    resolved_at?: string | null;
    resolved_by_account_id?: string | null;
    dismissed_at?: string | null;
    dismissed_by_account_id?: string | null;
    dismiss_reason?: string | null;
    policy_number?: string | null;
}

/** Row shape from the `policy_reports` table. */
export interface PolicyReportRow {
    id: string;
    policy_id: string;
    client_id?: string | null;
    policy_term_id?: string | null;
    status: string; // 'draft' | 'published'
    created_by_account_id?: string | null;
    data_payload: Record<string, any>;
    ai_insights: Record<string, any>;
    created_at?: string;
    updated_at?: string;
}

// ------------------------------------------------------------------
// Flag Definitions
// ------------------------------------------------------------------

export interface FlagDefinition {
    code: string;
    label: string;
    description?: string;
    category: string;
    default_severity: 'high' | 'medium' | 'low';
    entity_scope: string;
    auto_resolve: boolean;
    is_manual_allowed: boolean;
    is_active: boolean;
    default_action_path?: string;
    rule_version?: string;
    trigger_logic?: string;
    data_fields_checked?: string;
    dec_page_section?: string;
    suppression_rules?: string;
    notes?: string;
    /** Whether this flag should be surfaced in the AI-generated client report */
    report_enabled?: boolean;
    /** Freeform AI instruction for how to frame this flag in the report */
    report_prompt_hint?: string | null;
    created_at: string;
}

export interface FlagEventRow {
    id: string;
    flag_id: string;
    event_type: string;
    actor_account_id?: string | null;
    note?: string | null;
    details?: Record<string, unknown>;
    created_at: string;
}

export interface FlagDefinitionRow {
    code: string;
    label: string;
    description?: string | null;
    category: string;
    default_severity: string;
    entity_scope: string;
    auto_resolve: boolean;
    is_manual_allowed: boolean;
    is_active: boolean;
    default_action_path?: string | null;
    rule_version?: string | null;
    trigger_logic?: string | null;
    data_fields_checked?: string | null;
    dec_page_section?: string | null;
    suppression_rules?: string | null;
    notes?: string | null;
}


/**
 * Dashboard-level Policy type — a joined view for the agent dashboard table.
 * One row per policy (with current term info).
 */
export interface DashboardPolicy {
    // Policy fields
    id: string;               // policies.id
    policy_number: string;
    carrier_policy_number?: string;
    previous_policy_number?: string;
    property_address: string;
    status: string;
    carrier_name?: string;
    // Client fields (joined)
    client_id: string;
    named_insured: string;
    client_email?: string;
    client_phone?: string;
    mailing_address?: string;
    // Current term fields (joined)
    policy_term_id?: string;
    effective_date?: string;
    expiration_date?: string;
    annual_premium?: string;
    // Flag summary (joined)
    flag_count: number;
    highest_severity?: 'high' | 'medium' | 'low';
    flags: Array<{ code: string; title: string; severity: string }>;
    // Document presence
    has_dec_page: boolean;
    has_rce: boolean;
    has_dic: boolean;
    has_es: boolean;
    // Document carrier identifiers
    rce_carrier?: string;
    dic_carrier?: string;
    es_carrier?: string;
    // Metadata
    created_at?: string;
    // Enrichment status
    is_enriched: boolean;
    // Term workflow fields
    payment_status?: string;
    payment_plan?: string;
    policy_activity?: string;
}

// ---------------------------------------------------------------------------
// Helpers (Single Source of Truth)
// ---------------------------------------------------------------------------

/**
 * Generate flags based on policy data.
 * Flags are displayed in the UI to highlight issues/risks.
 */
function generateFlags(row: SupabaseDeclarationRow): string[] {
    const flags: string[] = [];

    // Check for missing critical data
    if (!row.policy_number) flags.push('Missing Policy #');
    if (!row.limit_dwelling) flags.push('Missing Coverage');

    // Check for occupancy type
    const occupancy = row.occupancy?.toLowerCase();
    if (occupancy === 'tenant') {
        flags.push('Tenant-Occupied');
    } else if (occupancy === 'secondary') {
        flags.push('Secondary Residence');
    }

    return flags;
}

/**
 * Derive status from the DB row.
 * If the row has a `status` column, map it to one of our valid statuses.
 * Otherwise, derive from data completeness.
 */
function deriveStatus(row: SupabaseDeclarationRow): Declaration['status'] {
    // If a status is stored in the DB, trust it
    if (row.status) {
        const normalized = row.status.trim();
        if (['Approved', 'Rejected', 'Incomplete', 'Pending Review'].includes(normalized)) {
            return normalized as Declaration['status'];
        }
    }

    // Derive from data completeness
    const missingCritical =
        !row.policy_number ||
        !row.insured_name ||
        !row.mailing_address ||
        !row.limit_dwelling;

    return missingCritical ? 'Incomplete' : 'Pending Review';
}

/**
 * Maps a raw Supabase row to the application-level Declaration type.
 * SINGLE SOURCE OF TRUTH — all fetch functions use this.
 */
function mapRowToDeclaration(row: SupabaseDeclarationRow): Declaration {
    return {
        id: row.id,
        // Relational links (real FKs from dec_pages)
        client_id: row.client_id || undefined,
        policy_id: row.policy_id || undefined,
        policy_term_id: row.policy_term_id || undefined,
        submission_id: row.submission_id || undefined,
        client_email: undefined,
        client_phone: undefined,
        // Insured Information
        insured_name: row.insured_name || 'Unknown',
        secondary_insured_name: row.secondary_insured_name || undefined,
        // Addresses
        mailing_address: row.mailing_address || 'No address provided',
        property_location: row.property_location || 'No location provided',
        // Policy Metadata
        policy_number: row.policy_number || 'N/A',
        date_issued: row.date_issued || '',
        policy_period_start: row.policy_period_start || '',
        policy_period_end: row.policy_period_end || '',
        renewal_date: row.policy_period_end || '',
        // Property Details
        year_built: row.year_built ? parseInt(row.year_built, 10) : 0,
        occupancy: row.occupancy || 'Unknown',
        number_of_units: row.number_of_units ? parseInt(row.number_of_units, 10) : 1,
        construction_type: row.construction_type || 'Unknown',
        deductible: row.deductible || '$0',
        // Coverage Limits
        limit_dwelling: row.limit_dwelling || '$0',
        limit_other_structures: row.limit_other_structures || '$0',
        limit_personal_property: row.limit_personal_property || '$0',
        limit_fair_rental_value: row.limit_fair_rental_value || '$0',
        limit_ordinance_or_law: row.limit_ordinance_or_law || '$0',
        limit_debris_removal: row.limit_debris_removal || '$0',
        limit_extended_dwelling_coverage: row.limit_extended_dwelling_coverage || 'None',
        limit_dwelling_replacement_cost: row.limit_dwelling_replacement_cost || 'None',
        limit_inflation_guard: row.limit_inflation_guard || 'None',
        limit_personal_property_replacement_cost: row.limit_personal_property_replacement_cost || 'None',
        limit_fences: row.limit_fences || '$0',
        limit_permitted_incidental_occupancy: row.limit_permitted_incidental_occupancy || '$0',
        limit_plants_shrubs_trees: row.limit_plants_shrubs_trees || '$0',
        limit_outdoor_radio_tv_equipment: row.limit_outdoor_radio_tv_equipment || '$0',
        limit_awnings: row.limit_awnings || '$0',
        limit_signs: row.limit_signs || '$0',
        // Special Coverage
        limit_actual_cash_value_coverage: row.limit_actual_cash_value_coverage || undefined,
        limit_replacement_cost_coverage: row.limit_replacement_cost_coverage || undefined,
        limit_building_code_upgrade_coverage: row.limit_building_code_upgrade_coverage || undefined,
        limit_extended_replacement_cost_coverage: row.limit_extended_replacement_cost_coverage || undefined,
        limit_guaranteed_replacement_cost_coverage: row.limit_guaranteed_replacement_cost_coverage || undefined,
        // Flags (Checkboxes)
        cb_fire_lightning_smoke_damage: row.cb_fire_lightning_smoke_damage || '',
        cb_extended_coverages: row.cb_extended_coverages || '',
        cb_vandalism_malicious_mischief: row.cb_vandalism_malicious_mischief || '',
        // Premium
        total_annual_premium: row.total_annual_premium || '$0',
        // Broker
        broker_name: row.broker_name || 'Unknown',
        broker_address: row.broker_address || '',
        broker_phone_number: row.broker_phone_number || '',
        // Mortgagees
        mortgagee_1_name: row.mortgagee_1_name || undefined,
        mortgagee_1_address: row.mortgagee_1_address || undefined,
        mortgagee_1_code: row.mortgagee_1_code || undefined,
        mortgagee_1_loan_number: row.mortgagee_1_loan_number || undefined,
        mortgagee_2_name: row.mortgagee_2_name || undefined,
        mortgagee_2_address: row.mortgagee_2_address || undefined,
        mortgagee_2_code: row.mortgagee_2_code || undefined,
        mortgagee_2_loan_number: row.mortgagee_2_loan_number || undefined,
        // DIC
        dic_company: row.dic_company || undefined,
        // System Fields
        status: deriveStatus(row),
        flags: generateFlags(row),
    };
}

// ---------------------------------------------------------------------------
// Data Access Functions
// ---------------------------------------------------------------------------

/**
 * Fetch all declarations from Supabase (dec_pages table), ordered by most recent first.
 */
export async function fetchSupabaseDeclarations(): Promise<Declaration[]> {
    try {
        const { data, error } = await supabase
            .from('dec_pages')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('API', 'Error fetching declarations from Supabase', {
                message: error.message,
                code: error.code,
                details: error.details,
            });
            return [];
        }

        if (!data || data.length === 0) {
            logger.info('API', 'No declarations found in Supabase');
            return [];
        }

        logger.info('API', `Fetched ${data.length} declarations`);
        return (data as SupabaseDeclarationRow[]).map(mapRowToDeclaration);
    } catch (err) {
        logger.error('API', 'Unexpected error fetching Supabase data', {
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

/** Backward-compat alias. */
export const fetchDeclarations = fetchSupabaseDeclarations;

/**
 * Fetch a single declaration by ID from dec_pages.
 */
export async function getDeclarationById(id: string): Promise<Declaration | undefined> {
    try {
        const { data, error } = await supabase
            .from('dec_pages')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            logger.error('API', `Error fetching declaration ${id}`, {
                message: error.message,
                code: error.code,
            });
            return undefined;
        }

        if (!data) return undefined;

        return mapRowToDeclaration(data as SupabaseDeclarationRow);
    } catch (err) {
        logger.error('API', `Unexpected error fetching declaration ${id}`, {
            error: err instanceof Error ? err.message : String(err),
        });
        return undefined;
    }
}

/**
 * Fetch all declarations for a client by their real client_id FK.
 */
export async function fetchDeclarationsByClientId(clientId: string): Promise<Declaration[]> {
    try {
        const { data, error } = await supabase
            .from('dec_pages')
            .select('*')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('API', 'Error fetching declarations by client_id', {
                clientId,
                message: error.message,
            });
            return [];
        }

        if (!data || data.length === 0) return [];

        return (data as SupabaseDeclarationRow[]).map(mapRowToDeclaration);
    } catch (err) {
        logger.error('API', 'Unexpected error in fetchDeclarationsByClientId', {
            clientId,
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

// ---------------------------------------------------------------------------
// Dashboard: Policy-Centric Queries
// ---------------------------------------------------------------------------

/**
 * Fetch policies joined with clients and current policy terms for the dashboard.
 * One row per policy — this replaces fetchSupabaseDeclarations for the dashboard.
 */
export async function fetchDashboardPolicies(): Promise<DashboardPolicy[]> {
    try {
        const PAGE_SIZE = 1000;
        const IN_CHUNK = 200;

        const buildDashboardTermSelect = (includeCarrierCol: boolean) => `
                    id,
                    policy_number,
                    property_address_raw,
                    property_address_norm,
                    carrier_name,
                    status,
                    created_at,
                    client_id,
                    clients!inner (
                        id,
                        named_insured,
                        email,
                        phone,
                        mailing_address_raw,
                        is_demo
                    ),
                    policy_terms (
                        id,
                        effective_date,
                        expiration_date,
                        annual_premium,
                        is_current,
                        payment_status,
                        payment_plan,
                        es_exists,
                        policy_activity${includeCarrierCol ? ',\n                        carrier_policy_number' : ''}
                    )
                `;

        // Paginate through ALL policies (Supabase default limit is 1000)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let allData: any[] = [];
        let page = 0;
        let hasMore = true;
        let includeCarrierPolicyNumber = true;

        while (hasMore) {
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            let query = supabase
                .from('policies')
                .select(buildDashboardTermSelect(includeCarrierPolicyNumber))
                .eq('clients.is_demo', false);

            for (const inactiveStatus of INACTIVE_STATUSES) {
                query = query.neq('status', inactiveStatus);
            }

            let { data: pageData, error } = await query
                .order('created_at', { ascending: false })
                .order('id', { ascending: true })
                .range(from, to);

            // Fallback: if carrier_policy_number column doesn't exist yet, retry without it
            if (error && error.message?.includes('does not exist') && includeCarrierPolicyNumber) {
                logger.warn('API', 'carrier_policy_number column not found, retrying without it. Run scripts/add_carrier_policy_number.sql');
                includeCarrierPolicyNumber = false;
                let retryQuery = supabase
                    .from('policies')
                    .select(buildDashboardTermSelect(false))
                    .eq('clients.is_demo', false);
                for (const inactiveStatus of INACTIVE_STATUSES) {
                    retryQuery = retryQuery.neq('status', inactiveStatus);
                }
                const retryResult = await retryQuery
                    .order('created_at', { ascending: false })
                    .order('id', { ascending: true })
                    .range(from, to);
                pageData = retryResult.data;
                error = retryResult.error;
            }

            if (error) {
                logger.error('API', 'Error fetching dashboard policies', {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                    page,
                });
                break;
            }

            if (!pageData || pageData.length === 0) {
                hasMore = false;
            } else {
                allData = allData.concat(pageData);
                hasMore = pageData.length === PAGE_SIZE;
                page++;
            }
        }

        if (allData.length === 0) {
            logger.info('API', 'No policies found for dashboard');
            return [];
        }

        logger.info('API', `Loaded ${allData.length} policies across ${page + 1} page(s)`);

        // Batch-fetch flag counts for all policies (chunked to avoid URL limits)
        const policyIds = allData.map((r: { id: string }) => r.id);
        const flagMap = await fetchFlagSummaryForPolicies(policyIds);

        // Batch-fetch document/enrichment status via pre-computed view
        // (replaces 3 separate chunked loops that caused N+1 queries)
        const enrichedSet = new Set<string>();
        const decPageSet = new Set<string>();
        const rceSet = new Set<string>();
        const dicSet = new Set<string>();
        const esSet = new Set<string>();
        const rceCarrierMap = new Map<string, string>();
        const dicCarrierMap = new Map<string, string>();
        const esCarrierMap = new Map<string, string>();

        try {
            for (let i = 0; i < policyIds.length; i += IN_CHUNK) {
                const chunk = policyIds.slice(i, i + IN_CHUNK);
                let { data: statusRows, error: statusErr } = await supabase
                    .from('policy_document_status')
                    .select('policy_id, is_enriched, has_dec_page, has_rce, has_dic, has_es_doc, rce_carrier, dic_carrier, es_carrier')
                    .in('policy_id', chunk);

                // Fallback if view doesn't have carrier columns yet
                if (statusErr && statusErr.message?.includes('does not exist')) {
                    const fallback = await supabase
                        .from('policy_document_status')
                        .select('policy_id, is_enriched, has_dec_page, has_rce, has_dic, has_es_doc')
                        .in('policy_id', chunk);
                    statusRows = (fallback.data || []) as any;
                }

                if (statusRows) {
                    for (const row of statusRows) {
                        if (row.is_enriched) enrichedSet.add(row.policy_id);
                        if (row.has_dec_page) decPageSet.add(row.policy_id);
                        if (row.has_rce) rceSet.add(row.policy_id);
                        if (row.has_dic) dicSet.add(row.policy_id);
                        if (row.has_es_doc) esSet.add(row.policy_id);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const r = row as any;
                        if (r.rce_carrier) rceCarrierMap.set(r.policy_id, r.rce_carrier);
                        if (r.dic_carrier) dicCarrierMap.set(r.policy_id, r.dic_carrier);
                        if (r.es_carrier) esCarrierMap.set(r.policy_id, r.es_carrier);
                    }
                }
            }

            // Fallback carrier resolver if policy_document_status view is not yet updated
            if (rceCarrierMap.size === 0 && dicCarrierMap.size === 0 && (rceSet.size > 0 || dicSet.size > 0)) {
                const { data: linkedDocs } = await supabase
                    .from('platform_documents')
                    .select('id, doc_type, policy_id, file_name')
                    .not('policy_id', 'is', null)
                    .in('doc_type', ['rce', 'dic_dec_page', 'es_doc']);

                if (linkedDocs && linkedDocs.length > 0) {
                    const dicDocIds = linkedDocs.filter(d => d.doc_type === 'dic_dec_page').map(d => d.id);
                    const rceDocIds = linkedDocs.filter(d => d.doc_type === 'rce').map(d => d.id);

                    if (dicDocIds.length > 0) {
                        const { data: dicData } = await supabase
                            .from('doc_data_dic')
                            .select('document_id, carrier_name')
                            .in('document_id', dicDocIds);
                        if (dicData) {
                            const dicMap = new Map(dicData.map(d => [d.document_id, d.carrier_name]));
                            for (const doc of linkedDocs) {
                                if (doc.doc_type === 'dic_dec_page' && doc.policy_id && dicMap.has(doc.id)) {
                                    dicCarrierMap.set(doc.policy_id, dicMap.get(doc.id)!);
                                }
                            }
                        }
                    }

                    if (rceDocIds.length > 0) {
                        const { data: rceData } = await supabase
                            .from('doc_data_rce')
                            .select('document_id, source')
                            .in('document_id', rceDocIds);
                        if (rceData) {
                            const rceMap = new Map(rceData.map(r => [r.document_id, r.source]));
                            for (const doc of linkedDocs) {
                                if (doc.doc_type === 'rce' && doc.policy_id) {
                                    const src = rceMap.get(doc.id) || (doc.file_name?.toLowerCase().includes('american modern') ? 'rce_american_modern' : 'rce_360value');
                                    rceCarrierMap.set(doc.policy_id, src);
                                }
                            }
                        }
                    }
                }
            }
        } catch {
            // Non-fatal: if status check fails, all show as missing/unenriched
        }

        // Map the joined result to DashboardPolicy
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return allData.map((row: any) => {
            // clients is an object (inner join, one-to-one via FK)
            const client = row.clients;
            // policy_terms is an array; find the current term
            const terms: Array<{ id: string; effective_date?: string; expiration_date?: string; annual_premium?: number; is_current?: boolean; payment_status?: string; payment_plan?: string; policy_activity?: string; carrier_policy_number?: string; es_exists?: boolean; }> = row.policy_terms || [];
            const currentTerm = terms.find(t => t.is_current === true) || terms[0] || null;
            const flagInfo = flagMap.get(row.id) || { count: 0, severity: undefined, flags: [] };

            // Sort terms by effective_date descending (newest first)
            const sortedTerms = [...terms].sort((a: any, b: any) => {
                const da = a.effective_date ? new Date(a.effective_date).getTime() : 0;
                const db = b.effective_date ? new Date(b.effective_date).getTime() : 0;
                return db - da;
            });
            const currentTermSorted = sortedTerms.find((t: any) => t.id === currentTerm?.id) || sortedTerms[0];

            const displayPolicyNum = currentTermSorted?.carrier_policy_number || row.policy_number || 'N/A';

            // Find previous term
            const currentTermIndex = sortedTerms.findIndex((t: any) => t.id === currentTermSorted?.id);
            const previousTerm = currentTermIndex !== -1 && currentTermIndex < sortedTerms.length - 1
                ? sortedTerms[currentTermIndex + 1]
                : (sortedTerms.length > 1 ? sortedTerms.find((t: any) => t.id !== currentTermSorted?.id) : null);

            return {
                id: row.id,
                policy_number: displayPolicyNum,
                carrier_policy_number: currentTermSorted?.carrier_policy_number,
                previous_policy_number: previousTerm?.carrier_policy_number,
                property_address: row.property_address_raw || row.property_address_norm || 'No address',
                status: row.status || 'unknown',
                carrier_name: row.carrier_name || undefined,
                client_id: row.client_id,
                named_insured: client?.named_insured || 'Unknown',
                client_email: client?.email || undefined,
                client_phone: client?.phone || undefined,
                mailing_address: client?.mailing_address_raw || undefined,
                policy_term_id: currentTermSorted?.id || undefined,
                effective_date: currentTermSorted?.effective_date || undefined,
                expiration_date: currentTermSorted?.expiration_date || undefined,
                annual_premium: currentTermSorted?.annual_premium != null
                    ? `$${Number(currentTermSorted.annual_premium).toLocaleString()}`
                    : undefined,
                payment_status: currentTermSorted?.payment_status || undefined,
                payment_plan: currentTermSorted?.payment_plan || undefined,
                policy_activity: currentTermSorted?.policy_activity || undefined,
                flag_count: flagInfo.count,
                highest_severity: flagInfo.severity,
                flags: flagInfo.flags || [],
                created_at: row.created_at,
                is_enriched: enrichedSet.has(row.id),
                has_dec_page: decPageSet.has(row.id),
                has_rce: rceSet.has(row.id),
                has_dic: dicSet.has(row.id),
                has_es: esSet.has(row.id) || (currentTermSorted?.es_exists ?? false),
                rce_carrier: rceCarrierMap.get(row.id),
                dic_carrier: dicCarrierMap.get(row.id),
                es_carrier: esCarrierMap.get(row.id),
            } as DashboardPolicy;
        });
    } catch (err) {
        logger.error('API', 'Unexpected error fetching dashboard policies', {
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

/**
 * Full detail for a single policy — used by the policy review page.
 * Combines policy, client, current term, and (optionally) the latest dec_page.
 */
/** Lightweight term summary used by the Term History panel. */
export interface PolicyTermSummary {
    id: string;
    effective_date?: string;
    expiration_date?: string;
    annual_premium?: number;
    is_current?: boolean;
    carrier_status?: string;
    property_location?: string;
    limit_dwelling?: string;
    deductible?: string;
    source_dec_page_id?: string;
    source_policy_number?: string;
    carrier_policy_number?: string;
    created_at?: string;
}

export interface PolicyDetail {
    // Policy
    id: string;
    policy_number: string;
    carrier_policy_number?: string;
    previous_policy_number?: string;
    property_address: string;
    carrier_name?: string;
    status: string;
    created_at?: string;
    updated_at?: string;
    // Client (joined)
    client_id: string;
    named_insured: string;
    secondary_insured_name?: string;
    client_email?: string;
    client_phone?: string;
    mailing_address?: string;
    // Current term (joined)
    policy_term_id?: string;
    effective_date?: string;
    expiration_date?: string;
    date_issued?: string;
    annual_premium?: string;
    annual_premium_raw?: number;
    // Term workflow fields
    policy_activity?: string;
    carrier_status?: string;
    payment_status?: string;
    payment_plan?: string;
    cancellation_reason?: string;
    dic_exists?: boolean;
    dic_policy_number?: string;
    perils_insured_against?: string;
    sold_by?: string;
    office?: string;
    is_current?: boolean;
    // Dec page data (joined, optional — may not exist yet)
    dec_page_id?: string;
    year_built?: number;
    occupancy?: string;
    number_of_units?: number;
    construction_type?: string;
    deductible?: string;
    limit_dwelling?: string;
    limit_other_structures?: string;
    limit_personal_property?: string;
    limit_fair_rental_value?: string;
    limit_ordinance_or_law?: string;
    limit_debris_removal?: string;
    limit_extended_dwelling_coverage?: string;
    limit_dwelling_replacement_cost?: string;
    limit_inflation_guard?: string;
    limit_personal_property_replacement_cost?: string;
    limit_fences?: string;
    limit_permitted_incidental_occupancy?: string;
    limit_plants_shrubs_trees?: string;
    limit_outdoor_radio_tv_equipment?: string;
    limit_awnings?: string;
    limit_signs?: string;
    // Special coverage (from dec page)
    limit_actual_cash_value_coverage?: string;
    limit_replacement_cost_coverage?: string;
    limit_building_code_upgrade_coverage?: string;
    limit_extended_replacement_cost_coverage?: string;
    limit_guaranteed_replacement_cost_coverage?: string;
    // Flags (from dec page)
    cb_fire_lightning_smoke_damage?: string;
    cb_extended_coverages?: string;
    cb_vandalism_malicious_mischief?: string;
    // Broker (from dec page)
    broker_name?: string;
    broker_address?: string;
    broker_phone_number?: string;
    // Mortgagees (from dec page)
    mortgagee_1_name?: string;
    mortgagee_1_address?: string;
    mortgagee_1_code?: string;
    mortgagee_1_loan_number?: string;
    mortgagee_2_name?: string;
    mortgagee_2_address?: string;
    mortgagee_2_code?: string;
    mortgagee_2_loan_number?: string;
    // DIC (from dec page)
    dic_company?: string;
    // DIC coverage limits (from dic_processor writeback)
    dic_limit_dwelling?: string;
    dic_limit_other_structures?: string;
    dic_limit_personal_property?: string;
    dic_limit_loss_of_use?: string;
    dic_deductible?: string;
    dic_annual_premium_raw?: number;
    // All terms (for Term History panel)
    all_terms?: PolicyTermSummary[];
}

/**
 * Fetch a single policy by ID with client and current term (which now contains coverage data).
 * Used by the policy review page.
 * Coverage is read from policy_terms (curated/approved) — NOT from raw dec_pages.
 */
export async function getPolicyDetailById(policyId: string, customClient?: SupabaseClient): Promise<PolicyDetail | undefined> {
    const sb = customClient || supabase;
    try {
        // DIC coverage columns (added by scripts/add_dic_fields.sql)
        // These are kept in a variable so we can fallback without them if migration hasn't run yet
        const dicTermFields = `
                    dic_policy_number,
                    dic_limit_dwelling,
                    dic_limit_other_structures,
                    dic_limit_personal_property,
                    dic_limit_loss_of_use,
                    dic_deductible,
                    dic_annual_premium_raw,`;

        const buildSelect = (includeDicFields: boolean, includeCarrierCol: boolean) => `
                id,
                policy_number,
                property_address_raw,
                property_address_norm,
                carrier_name,
                status,
                created_at,
                client_id,
                clients (
                    id,
                    named_insured,
                    email,
                    phone,
                    mailing_address_raw
                ),
                policy_terms (
                    id,
                    effective_date,
                    expiration_date,
                    date_issued,
                    annual_premium,
                    is_current,${includeCarrierCol ? '\n                    carrier_policy_number,' : ''}
                    source_dec_page_id,
                    approved_at,
                    deductible,
                    limit_dwelling,
                    limit_other_structures,
                    limit_personal_property,
                    limit_fair_rental_value,
                    limit_ordinance_or_law,
                    limit_debris_removal,
                    limit_extended_dwelling_coverage,
                    limit_dwelling_replacement_cost,
                    limit_inflation_guard,
                    limit_personal_property_replacement_cost,
                    broker_name,
                    broker_address,
                    broker_phone,
                    mortgagee_1_name,
                    mortgagee_1_address,
                    mortgagee_1_code,
                    mortgagee_1_loan_number,
                    mortgagee_2_name,
                    mortgagee_2_address,
                    mortgagee_2_code,
                    mortgagee_2_loan_number,
                    property_location,
                    year_built,
                    occupancy,
                    number_of_units,
                    construction_type,
                    cb_fire_lightning_smoke_damage,
                    cb_extended_coverages,
                    cb_vandalism_malicious_mischief,
                    policy_activity,
                    carrier_status,
                    payment_status,
                    payment_plan,
                    cancellation_reason,
                    dic_exists,
                    perils_insured_against,${includeDicFields ? dicTermFields : ''}
                    sold_by,
                    office
                )
            `;

        // Try with all optional columns, then progressively fall back
        let result = await sb
            .from('policies')
            .select(buildSelect(true, true))
            .eq('id', policyId)
            .single();

        // Fallback: if columns don't exist yet, retry without them
        if (result.error && result.error.message?.includes('does not exist')) {
            logger.warn('API', 'Optional columns not found, retrying without them. Run pending migration scripts.');
            result = await sb
                .from('policies')
                .select(buildSelect(false, false))
                .eq('id', policyId)
                .single();
        }

        const { data, error } = result;

        if (error || !data) {
            logger.error('API', `Error fetching policy detail ${policyId}`, {
                message: error?.message,
            });
            return undefined;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = data as any;
        const client = row.clients;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const terms: any[] = row.policy_terms || [];

        // Sort terms by effective_date descending (newest first)
        const sortedTerms = [...terms].sort((a: any, b: any) => {
            const da = a.effective_date ? new Date(a.effective_date).getTime() : 0;
            const db = b.effective_date ? new Date(b.effective_date).getTime() : 0;
            if (db !== da) return db - da;
            const aScore = (a.source_dec_page_id ? 2 : 0) + (a.annual_premium ? 1 : 0);
            const bScore = (b.source_dec_page_id ? 2 : 0) + (b.annual_premium ? 1 : 0);
            return bScore - aScore;
        });

        const currentTerm = sortedTerms.find((t: any) => t.is_current === true) || sortedTerms[0] || null;

        // Build all-terms array for the Term History panel
        const allTermsSorted: PolicyTermSummary[] = sortedTerms.map((t: any) => ({
            id: t.id,
            effective_date: t.effective_date,
            expiration_date: t.expiration_date,
            annual_premium: t.annual_premium,
            is_current: t.id === currentTerm?.id,
            carrier_status: t.carrier_status,
            property_location: t.property_location,
            limit_dwelling: t.limit_dwelling,
            deductible: t.deductible,
            source_dec_page_id: t.source_dec_page_id,
            carrier_policy_number: t.carrier_policy_number,
            created_at: t.created_at,
        }));

        // Enrich terms with source_policy_number from their dec pages
        const decPageIds = allTermsSorted
            .map(t => t.source_dec_page_id)
            .filter((id): id is string => !!id);

        if (decPageIds.length > 0) {
            const { data: decPages } = await sb
                .from('dec_pages')
                .select('id, policy_number')
                .in('id', decPageIds);

            if (decPages) {
                const dpMap = new Map(decPages.map(dp => [dp.id, dp.policy_number]));
                for (const term of allTermsSorted) {
                    if (term.source_dec_page_id) {
                        const dpPolicyNum = dpMap.get(term.source_dec_page_id);
                        // Only set if it differs from the parent policy number (shows suffix/variant)
                        if (dpPolicyNum && dpPolicyNum !== row.policy_number) {
                            term.source_policy_number = dpPolicyNum;
                        }
                    }
                }
            }
        }

        // Resolve the display policy number: if the current term came from a
        // dec page with a suffixed policy number (e.g. "CFP 0102162693 02"),
        // show that instead of the base policy number.
        const currentTermSorted = allTermsSorted.find(t => t.id === currentTerm?.id);
        const displayPolicyNumber = currentTermSorted?.carrier_policy_number
            || currentTermSorted?.source_policy_number
            || row.policy_number
            || 'N/A';

        // Find the previous term
        const currentTermIndex = allTermsSorted.findIndex(t => t.id === currentTerm?.id);
        const previousTerm = currentTermIndex !== -1 && currentTermIndex < allTermsSorted.length - 1
            ? allTermsSorted[currentTermIndex + 1]
            : (allTermsSorted.length > 1 ? allTermsSorted.find(t => t.id !== currentTerm?.id) : null);

        return {
            id: row.id,
            policy_number: displayPolicyNumber,
            carrier_policy_number: currentTermSorted?.carrier_policy_number,
            previous_policy_number: previousTerm?.carrier_policy_number || previousTerm?.source_policy_number,
            property_address: row.property_address_raw || row.property_address_norm || 'No address',
            carrier_name: row.carrier_name || undefined,
            status: row.status || 'unknown',
            created_at: row.created_at,
            client_id: row.client_id,
            named_insured: client?.named_insured || 'Unknown',
            secondary_insured_name: undefined,
            client_email: client?.email || undefined,
            client_phone: client?.phone || undefined,
            mailing_address: client?.mailing_address_raw || undefined,
            policy_term_id: currentTerm?.id || undefined,
            effective_date: currentTerm?.effective_date || undefined,
            expiration_date: currentTerm?.expiration_date || undefined,
            date_issued: currentTerm?.date_issued || undefined,
            annual_premium: currentTerm?.annual_premium != null
                ? `$${Number(currentTerm.annual_premium).toLocaleString()}`
                : undefined,
            annual_premium_raw: currentTerm?.annual_premium ?? undefined,
            // Term workflow fields
            policy_activity: currentTerm?.policy_activity || undefined,
            carrier_status: currentTerm?.carrier_status || undefined,
            payment_status: currentTerm?.payment_status || undefined,
            payment_plan: currentTerm?.payment_plan || undefined,
            cancellation_reason: currentTerm?.cancellation_reason || undefined,
            dic_exists: currentTerm?.dic_exists ?? undefined,
            dic_policy_number: currentTerm?.dic_policy_number || undefined,
            dic_limit_dwelling: currentTerm?.dic_limit_dwelling || undefined,
            dic_limit_other_structures: currentTerm?.dic_limit_other_structures || undefined,
            dic_limit_personal_property: currentTerm?.dic_limit_personal_property || undefined,
            dic_limit_loss_of_use: currentTerm?.dic_limit_loss_of_use || undefined,
            dic_deductible: currentTerm?.dic_deductible || undefined,
            dic_annual_premium_raw: currentTerm?.dic_annual_premium_raw ?? undefined,
            perils_insured_against: currentTerm?.perils_insured_against || undefined,
            sold_by: currentTerm?.sold_by || undefined,
            office: currentTerm?.office || undefined,
            is_current: currentTerm?.is_current ?? undefined,
            // Coverage — now from policy_terms (approved data)
            dec_page_id: currentTerm?.source_dec_page_id || undefined,
            year_built: currentTerm?.year_built ? parseInt(currentTerm.year_built, 10) : undefined,
            occupancy: currentTerm?.occupancy || undefined,
            number_of_units: currentTerm?.number_of_units ? parseInt(currentTerm.number_of_units, 10) : undefined,
            construction_type: currentTerm?.construction_type || undefined,
            deductible: currentTerm?.deductible || undefined,
            limit_dwelling: currentTerm?.limit_dwelling || undefined,
            limit_other_structures: currentTerm?.limit_other_structures || undefined,
            limit_personal_property: currentTerm?.limit_personal_property || undefined,
            limit_fair_rental_value: currentTerm?.limit_fair_rental_value || undefined,
            limit_ordinance_or_law: currentTerm?.limit_ordinance_or_law || undefined,
            limit_debris_removal: currentTerm?.limit_debris_removal || undefined,
            limit_extended_dwelling_coverage: currentTerm?.limit_extended_dwelling_coverage || undefined,
            limit_dwelling_replacement_cost: currentTerm?.limit_dwelling_replacement_cost || undefined,
            limit_inflation_guard: currentTerm?.limit_inflation_guard || undefined,
            limit_personal_property_replacement_cost: currentTerm?.limit_personal_property_replacement_cost || undefined,
            limit_fences: undefined,
            limit_permitted_incidental_occupancy: undefined,
            limit_plants_shrubs_trees: undefined,
            limit_outdoor_radio_tv_equipment: undefined,
            limit_awnings: undefined,
            limit_signs: undefined,
            limit_actual_cash_value_coverage: undefined,
            limit_replacement_cost_coverage: undefined,
            limit_building_code_upgrade_coverage: undefined,
            limit_extended_replacement_cost_coverage: undefined,
            limit_guaranteed_replacement_cost_coverage: undefined,
            cb_fire_lightning_smoke_damage: currentTerm?.cb_fire_lightning_smoke_damage || undefined,
            cb_extended_coverages: currentTerm?.cb_extended_coverages || undefined,
            cb_vandalism_malicious_mischief: currentTerm?.cb_vandalism_malicious_mischief || undefined,
            broker_name: currentTerm?.broker_name || undefined,
            broker_address: currentTerm?.broker_address || undefined,
            broker_phone_number: currentTerm?.broker_phone || undefined,
            mortgagee_1_name: currentTerm?.mortgagee_1_name || undefined,
            mortgagee_1_address: currentTerm?.mortgagee_1_address || undefined,
            mortgagee_1_code: currentTerm?.mortgagee_1_code || undefined,
            mortgagee_1_loan_number: currentTerm?.mortgagee_1_loan_number || undefined,
            mortgagee_2_name: currentTerm?.mortgagee_2_name || undefined,
            mortgagee_2_address: currentTerm?.mortgagee_2_address || undefined,
            mortgagee_2_code: currentTerm?.mortgagee_2_code || undefined,
            mortgagee_2_loan_number: currentTerm?.mortgagee_2_loan_number || undefined,
            dic_company: undefined,
            all_terms: allTermsSorted,
        };
    } catch (err) {
        logger.error('API', `Unexpected error fetching policy detail ${policyId}`, {
            error: err instanceof Error ? err.message : String(err),
        });
        return undefined;
    }
}

/**
 * Convert a PolicyDetail to a Declaration for backward-compat with PolicyDashboard.
 */
export function mapPolicyDetailToDeclaration(detail: PolicyDetail): Declaration {
    return {
        id: detail.dec_page_id || detail.id,
        client_id: detail.client_id,
        policy_id: detail.id,
        policy_term_id: detail.policy_term_id,
        client_email: detail.client_email,
        client_phone: detail.client_phone,
        insured_name: detail.named_insured,
        secondary_insured_name: detail.secondary_insured_name,
        mailing_address: detail.mailing_address || 'No address provided',
        property_location: detail.property_address || 'No location provided',
        policy_number: detail.policy_number,
        date_issued: detail.date_issued || '',
        policy_period_start: detail.effective_date || '',
        policy_period_end: detail.expiration_date || '',
        renewal_date: detail.expiration_date || '',
        year_built: detail.year_built || 0,
        occupancy: detail.occupancy || 'Unknown',
        number_of_units: detail.number_of_units || 1,
        construction_type: detail.construction_type || 'Unknown',
        deductible: detail.deductible || '$0',
        limit_dwelling: detail.limit_dwelling || '$0',
        limit_other_structures: detail.limit_other_structures || '$0',
        limit_personal_property: detail.limit_personal_property || '$0',
        limit_fair_rental_value: detail.limit_fair_rental_value || '$0',
        limit_ordinance_or_law: detail.limit_ordinance_or_law || '$0',
        limit_debris_removal: detail.limit_debris_removal || '$0',
        limit_extended_dwelling_coverage: detail.limit_extended_dwelling_coverage || 'None',
        limit_dwelling_replacement_cost: detail.limit_dwelling_replacement_cost || 'None',
        limit_inflation_guard: detail.limit_inflation_guard || 'None',
        limit_personal_property_replacement_cost: detail.limit_personal_property_replacement_cost || 'None',
        limit_fences: detail.limit_fences || '$0',
        limit_permitted_incidental_occupancy: detail.limit_permitted_incidental_occupancy || '$0',
        limit_plants_shrubs_trees: detail.limit_plants_shrubs_trees || '$0',
        limit_outdoor_radio_tv_equipment: detail.limit_outdoor_radio_tv_equipment || '$0',
        limit_awnings: detail.limit_awnings || '$0',
        limit_signs: detail.limit_signs || '$0',
        limit_actual_cash_value_coverage: detail.limit_actual_cash_value_coverage,
        limit_replacement_cost_coverage: detail.limit_replacement_cost_coverage,
        limit_building_code_upgrade_coverage: detail.limit_building_code_upgrade_coverage,
        limit_extended_replacement_cost_coverage: detail.limit_extended_replacement_cost_coverage,
        limit_guaranteed_replacement_cost_coverage: detail.limit_guaranteed_replacement_cost_coverage,
        cb_fire_lightning_smoke_damage: detail.cb_fire_lightning_smoke_damage || '',
        cb_extended_coverages: detail.cb_extended_coverages || '',
        cb_vandalism_malicious_mischief: detail.cb_vandalism_malicious_mischief || '',
        total_annual_premium: detail.annual_premium || '$0',
        broker_name: detail.broker_name || 'Unknown',
        broker_address: detail.broker_address || '',
        broker_phone_number: detail.broker_phone_number || '',
        mortgagee_1_name: detail.mortgagee_1_name,
        mortgagee_1_address: detail.mortgagee_1_address,
        mortgagee_1_code: detail.mortgagee_1_code,
        mortgagee_1_loan_number: detail.mortgagee_1_loan_number,
        mortgagee_2_name: detail.mortgagee_2_name,
        mortgagee_2_address: detail.mortgagee_2_address,
        mortgagee_2_code: detail.mortgagee_2_code,
        mortgagee_2_loan_number: detail.mortgagee_2_loan_number,
        dic_company: detail.dic_company,
        dic_exists: detail.dic_exists,
        dic_policy_number: detail.dic_policy_number,
        dic_limit_dwelling: detail.dic_limit_dwelling,
        dic_limit_other_structures: detail.dic_limit_other_structures,
        dic_limit_personal_property: detail.dic_limit_personal_property,
        dic_limit_loss_of_use: detail.dic_limit_loss_of_use,
        dic_deductible: detail.dic_deductible,
        dic_annual_premium_raw: detail.dic_annual_premium_raw,
        status: 'Pending Review',
        flags: [],
    };
}

/**
 * Get a signed URL for the dec page PDF file.
 * Looks up: dec_pages(id) → submission_id → dec_page_submissions(storage_path)
 * Returns null if no file exists.
 */
export async function getDecPageFileUrl(decPageId: string): Promise<string | null> {
    try {
        // 1. Get the submission_id from dec_pages
        const { data: decPage, error: dpErr } = await supabase
            .from('dec_pages')
            .select('submission_id')
            .eq('id', decPageId)
            .single();

        if (dpErr || !decPage?.submission_id) return null;

        // 2. Get storage path from dec_page_submissions
        const { data: sub, error: subErr } = await supabase
            .from('dec_page_submissions')
            .select('storage_path, file_path')
            .eq('id', decPage.submission_id)
            .single();

        if (subErr || !sub) return null;

        const storagePath = sub.storage_path || sub.file_path;
        if (!storagePath) return null;

        // 3. Generate signed URL via server-side API (bypass RLS)
        return _getSignedUrlViaApi(storagePath, 'cfp-raw-decpage');
    } catch (err) {
        logger.error('api', 'Error getting dec page file URL:', { error: err instanceof Error ? err.message : String(err) })
        return null;
    }
}

/**
 * Fetch a single client by ID.
 */
export async function getClientById(clientId: string): Promise<ClientRow | undefined> {
    try {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .maybeSingle();

        if (error || !data) {
            logger.error('API', `Error fetching client ${clientId}`, {
                message: error?.message,
            });
            return undefined;
        }

        return data as ClientRow;
    } catch (err) {
        logger.error('API', `Unexpected error fetching client ${clientId}`, {
            error: err instanceof Error ? err.message : String(err),
        });
        return undefined;
    }
}

/**
 * Fetch policies for a given client_id (with current terms).
 */
export async function fetchPoliciesByClientId(clientId: string): Promise<DashboardPolicy[]> {
    try {
        const buildClientPoliciesSelect = (includeCarrierCol: boolean) => `
                id,
                policy_number,
                property_address_raw,
                carrier_name,
                status,
                created_at,
                client_id,
                clients (
                    id,
                    named_insured,
                    email,
                    phone,
                    mailing_address_raw
                ),
                policy_terms (
                    id,
                    effective_date,
                    expiration_date,
                    annual_premium,
                    is_current,
                    source_dec_page_id${includeCarrierCol ? ',\n                    carrier_policy_number' : ''}
                ),
                policy_flags (
                    id,
                    code,
                    title,
                    severity,
                    status
                ),
                property_enrichments (
                    id
                )
            `;

        let result = await supabase
            .from('policies')
            .select(buildClientPoliciesSelect(true))
            .eq('client_id', clientId)
            .order('created_at', { ascending: false });

        // Fallback: if carrier_policy_number column doesn't exist yet, retry without it
        if (result.error && result.error.message?.includes('does not exist')) {
            logger.warn('API', 'carrier_policy_number column not found in fetchPoliciesByClientId, retrying without it');
            result = await supabase
                .from('policies')
                .select(buildClientPoliciesSelect(false))
                .eq('client_id', clientId)
                .order('created_at', { ascending: false });
        }

        const { data, error } = result;

        if (error || !data) {
            logger.error('API', 'Error fetching policies by client_id', {
                clientId,
                message: error?.message,
            });
            return [];
        }

        // Batch lookup: resolve current term dec page policy numbers for suffix display
        const decPagePolicyMap = new Map<string, string>();
        const allDecPageIds = new Set<string>();
        for (const row of data as any[]) {
            const terms = row.policy_terms || [];
            const currentTerm = terms.find((t: any) => t.is_current === true) || terms[0] || null;
            if (currentTerm?.source_dec_page_id) allDecPageIds.add(currentTerm.source_dec_page_id);
        }
        if (allDecPageIds.size > 0) {
            const { data: decPages } = await supabase
                .from('dec_pages')
                .select('id, policy_number')
                .in('id', Array.from(allDecPageIds));
            if (decPages) {
                for (const dp of decPages) {
                    if (dp.policy_number) decPagePolicyMap.set(dp.id, dp.policy_number);
                }
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return data.map((row: any) => {
            const client = row.clients;
            const terms = row.policy_terms || [];
            const currentTerm = terms.find((t: PolicyTermRow) => t.is_current === true) || terms[0] || null;

            // Flags
            const openFlags = (row.policy_flags || []).filter((f: any) => f.status !== 'dismissed');
            const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
            const sortedFlags = [...openFlags].sort((a: any, b: any) =>
                (priorityOrder[a.severity] ?? 9) - (priorityOrder[b.severity] ?? 9)
            );
            const highestSev = sortedFlags.length > 0 ? sortedFlags[0].severity : undefined;

            // Sort terms by effective_date descending (newest first)
            const sortedTerms = [...terms].sort((a: any, b: any) => {
                const da = a.effective_date ? new Date(a.effective_date).getTime() : 0;
                const db = b.effective_date ? new Date(b.effective_date).getTime() : 0;
                return db - da;
            });
            const currentTermSorted = sortedTerms.find((t: any) => t.id === currentTerm?.id) || sortedTerms[0];

            // Resolve display policy number from current term's dec page or carrier_policy_number
            let displayPolicyNum = currentTermSorted?.carrier_policy_number || row.policy_number || 'N/A';
            if (!currentTermSorted?.carrier_policy_number && currentTermSorted?.source_dec_page_id) {
                const decPageNum = decPagePolicyMap.get(currentTermSorted.source_dec_page_id);
                if (decPageNum) displayPolicyNum = decPageNum;
            }

            // Find the previous term
            const currentTermIndex = sortedTerms.findIndex((t: any) => t.id === currentTermSorted?.id);
            const previousTerm = currentTermIndex !== -1 && currentTermIndex < sortedTerms.length - 1
                ? sortedTerms[currentTermIndex + 1]
                : (sortedTerms.length > 1 ? sortedTerms.find((t: any) => t.id !== currentTermSorted?.id) : null);

            let previousPolicyNum: string | undefined = previousTerm?.carrier_policy_number;
            if (!previousPolicyNum && previousTerm?.source_dec_page_id) {
                previousPolicyNum = decPagePolicyMap.get(previousTerm.source_dec_page_id);
            }

            return {
                id: row.id,
                policy_number: displayPolicyNum,
                carrier_policy_number: currentTermSorted?.carrier_policy_number,
                previous_policy_number: previousPolicyNum,
                property_address: row.property_address_raw || 'No address',
                status: row.status || 'unknown',
                carrier_name: row.carrier_name || undefined,
                client_id: row.client_id,
                named_insured: client?.named_insured || 'Unknown',
                client_email: client?.email || undefined,
                client_phone: client?.phone || undefined,
                mailing_address: client?.mailing_address_raw || undefined,
                policy_term_id: currentTermSorted?.id || undefined,
                effective_date: currentTermSorted?.effective_date || undefined,
                expiration_date: currentTermSorted?.expiration_date || undefined,
                annual_premium: currentTermSorted?.annual_premium != null
                    ? `$${Number(currentTermSorted.annual_premium).toLocaleString()}`
                    : undefined,
                created_at: row.created_at,
                flag_count: sortedFlags.length,
                highest_severity: highestSev,
                flags: sortedFlags.map((f: any) => ({ code: f.code, title: f.title, severity: f.severity })),
                is_enriched: (row.property_enrichments || []).length > 0,
                has_dec_page: false,
                has_rce: false,
                has_dic: false,
            } as DashboardPolicy;
        });
    } catch (err) {
        logger.error('API', 'Unexpected error fetching policies by client', {
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

// ---------------------------------------------------------------------------
// AI Report
// ---------------------------------------------------------------------------

export interface AIReportData {
    overallScore: number;
    coverageGaps: string[];
    flagDetails: string[];
    suggestions: string[];
}

/**
 * Generate a coverage analysis report for a declaration.
 * Uses deterministic rule-based logic to evaluate coverage gaps,
 * flag anomalies, and suggest improvements.
 *
 * Enhancement opportunity: Could be augmented with AI-powered analysis
 * for more nuanced recommendations (e.g., regional risk factors).
 */
export function generateAIReport(declaration: Declaration): AIReportData {
    const gaps: string[] = [];
    const flagDetails: string[] = [];
    const suggestions: string[] = [];
    let score = 85;

    // Check coverage limits
    if (declaration.limit_ordinance_or_law === '$0' || declaration.limit_ordinance_or_law === 'None') {
        gaps.push('No Ordinance or Law coverage');
        score -= 10;
    }
    if (declaration.limit_extended_dwelling_coverage === 'None') {
        gaps.push('No Extended Dwelling coverage');
        score -= 5;
    }
    if (declaration.limit_inflation_guard === 'None') {
        gaps.push('No Inflation Guard');
        score -= 5;
    }

    // Check flags
    if (declaration.flags.includes('Missing Coverage')) {
        flagDetails.push('Missing critical coverage information');
        score -= 10;
    }

    // Generate suggestions
    if (declaration.limit_ordinance_or_law === '$0' || declaration.limit_ordinance_or_law === 'None') {
        suggestions.push('Increase Ordinance or Law coverage to 50%');
    }
    if (!declaration.limit_personal_property || declaration.limit_personal_property === '$0') {
        suggestions.push('Review personal property limits (currently low relative to dwelling)');
    }
    suggestions.push('Add Service Line Coverage');

    return {
        overallScore: Math.max(0, Math.min(100, score)),
        coverageGaps: gaps.length > 0 ? gaps : ['No significant coverage gaps detected'],
        flagDetails: flagDetails.length > 0 ? flagDetails : ['No flags detected'],
        suggestions,
    };
}

/**
 * Fetch an AI report for a specific policy by ID.
 */
export async function fetchAIReport(id: string): Promise<AIReportData> {
    const declaration = await getDeclarationById(id);
    if (!declaration) {
        logger.warn('API', `Cannot generate AI report — declaration ${id} not found`);
        return {
            overallScore: 0,
            coverageGaps: ['Unable to load policy data'],
            flagDetails: ['Policy not found'],
            suggestions: ['Please verify the policy ID'],
        };
    }
    return generateAIReport(declaration);
}

// ---------------------------------------------------------------------------
// Policy Flags
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };

/**
 * Batch-fetch flag summary (count + highest severity + flag details) for a list of policy IDs.
 * Handles both old schema (no status column) and new schema (status='open').
 */
async function fetchFlagSummaryForPolicies(
    policyIds: string[]
): Promise<Map<string, { count: number; severity?: string; flags: Array<{ code: string; title: string; severity: string }> }>> {
    const result = new Map<string, { count: number; severity?: string; flags: Array<{ code: string; title: string; severity: string }> }>();
    if (policyIds.length === 0) return result;

    const IN_CHUNK = 200;

    try {
        // Chunk the .in() query to handle large policy sets (2500+)
        for (let i = 0; i < policyIds.length; i += IN_CHUNK) {
            const chunk = policyIds.slice(i, i + IN_CHUNK);

            // Try fetching with status filter first (new schema)
            // Fall back to resolved_at IS NULL if status column doesn't exist
            let { data, error } = await supabase
                .from('policy_flags')
                .select('id, policy_id, severity, status, code, title')
                .in('policy_id', chunk)
                .eq('status', 'open');

            if (error) {
                // Fallback: old schema — use resolved_at IS NULL
                const fallback = await supabase
                    .from('policy_flags')
                    .select('id, policy_id, severity, code, title, resolved_at')
                    .in('policy_id', chunk)
                    .is('resolved_at', null);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data = fallback.data as any;
                error = fallback.error;
            }

            if (error || !data) {
                logger.warn('API', 'Could not fetch flag summaries', { message: error?.message, chunk: i });
                continue;
            }

            for (const flag of data) {
                const existing = result.get(flag.policy_id) || { count: 0, severity: undefined, flags: [] };
                existing.count++;
                existing.flags.push({
                    code: flag.code || 'UNKNOWN',
                    title: flag.title || flag.code || 'Flag',
                    severity: flag.severity || 'low',
                });
                const sev = flag.severity as string;
                if (!existing.severity || (PRIORITY_ORDER[sev] || 0) > (PRIORITY_ORDER[existing.severity] || 0)) {
                    existing.severity = sev;
                }
                result.set(flag.policy_id, existing);
            }
        }
    } catch (err) {
        logger.warn('API', 'Unexpected error fetching flag summaries', {
            error: err instanceof Error ? err.message : String(err),
        });
    }

    return result;
}

/**
 * Fetch all flags for a given policy, ordered by status then severity.
 */
export async function fetchFlagsByPolicyId(policyId: string, customClient?: SupabaseClient): Promise<PolicyFlagRow[]> {
    const sb = customClient || supabase;
    try {
        const { data, error } = await sb
            .from('policy_flags')
            .select('*')
            .eq('policy_id', policyId)
            .order('created_at', { ascending: false });

        if (error || !data) {
            // Silently return empty on schema errors (column missing etc.)
            if (error) logger.error('API', 'Error fetching flags for policy', { policyId, message: error.message });
            return [];
        }

        return (data as PolicyFlagRow[]).sort((a, b) => {
            const statusOrder: Record<string, number> = { open: 0, dismissed: 1, resolved: 2 };
            // Old schema: no status column — use resolved_at to infer
            const getStatus = (f: PolicyFlagRow) => f.status || (f.resolved_at ? 'resolved' : 'open');
            const aStat = statusOrder[getStatus(a)] ?? 0;
            const bStat = statusOrder[getStatus(b)] ?? 0;
            if (aStat !== bStat) return aStat - bStat;
            return (PRIORITY_ORDER[b.severity] || 0) - (PRIORITY_ORDER[a.severity] || 0);
        });
    } catch (err) {
        logger.error('API', 'Unexpected error fetching flags', {
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

/**
 * Fetch all flags for a given client.
 * Gracefully returns [] if client_id column doesn't exist (pre-migration).
 */
export async function fetchFlagsByClientId(clientId: string): Promise<PolicyFlagRow[]> {
    try {
        const { data, error } = await supabase
            .from('policy_flags')
            .select('*')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false });

        // Return empty on any error (including missing client_id column)
        if (error || !data) return [];

        return (data as PolicyFlagRow[]).sort((a, b) => {
            const statusOrder: Record<string, number> = { open: 0, dismissed: 1, resolved: 2 };
            const getStatus = (f: PolicyFlagRow) => f.status || (f.resolved_at ? 'resolved' : 'open');
            const aStat = statusOrder[getStatus(a)] ?? 0;
            const bStat = statusOrder[getStatus(b)] ?? 0;
            if (aStat !== bStat) return aStat - bStat;
            return (PRIORITY_ORDER[b.severity] || 0) - (PRIORITY_ORDER[a.severity] || 0);
        });
    } catch (err) {
        return [];
    }
}

/**
 * Resolve a flag — sets status='resolved', resolved_at, resolved_by.
 * Falls back to old schema if new columns don't exist.
 */
export async function resolveFlag(flagId: string, actorAccountId?: string): Promise<boolean> {
    try {
        const now = new Date().toISOString();

        // Try new schema first
        const newUpdate: Record<string, unknown> = {
            status: 'resolved',
            resolved_at: now,
            updated_at: now,
        };
        if (actorAccountId) newUpdate.resolved_by_account_id = actorAccountId;

        const { error } = await supabase
            .from('policy_flags')
            .update(newUpdate)
            .eq('id', flagId);

        if (error) {
            // Fallback: old schema — any error from new schema triggers fallback
            const oldUpdate: Record<string, unknown> = { resolved_at: now };
            if (actorAccountId) oldUpdate.resolved_by_account_id = actorAccountId;

            const { error: oldErr } = await supabase
                .from('policy_flags')
                .update(oldUpdate)
                .eq('id', flagId);

            if (oldErr) {
                logger.error('API', 'Error resolving flag', { flagId, message: oldErr.message });
                return false;
            }
        }

        // Append flag event (best-effort, ignore errors)
        await supabase.from('flag_events').insert({
            flag_id: flagId,
            event_type: 'resolved',
            actor_account_id: actorAccountId || null,
            note: 'Resolved by staff',
        }).then(() => { });

        return true;
    } catch (err) {
        logger.error('API', 'Unexpected error resolving flag', {
            error: err instanceof Error ? err.message : String(err),
        });
        return false;
    }
}

/**
 * Dismiss a flag — sets status='dismissed', dismissed_at, reason.
 * Falls back to old schema (sets resolved_at as proxy) if new columns don't exist.
 */
export async function dismissFlag(
    flagId: string,
    reason: string = '',
    actorAccountId?: string
): Promise<boolean> {
    try {
        const now = new Date().toISOString();

        // Try new schema first
        const newUpdate: Record<string, unknown> = {
            status: 'dismissed',
            dismissed_at: now,
            updated_at: now,
        };
        if (reason) newUpdate.dismiss_reason = reason;
        if (actorAccountId) newUpdate.dismissed_by_account_id = actorAccountId;

        const { error } = await supabase
            .from('policy_flags')
            .update(newUpdate)
            .eq('id', flagId);

        if (error) {
            // Fallback: old schema — any error triggers fallback, use resolved_at as proxy
            const oldUpdate: Record<string, unknown> = { resolved_at: now };
            if (actorAccountId) oldUpdate.resolved_by_account_id = actorAccountId;

            const { error: oldErr } = await supabase
                .from('policy_flags')
                .update(oldUpdate)
                .eq('id', flagId);

            if (oldErr) {
                logger.error('API', 'Error dismissing flag', { flagId, message: oldErr.message });
                return false;
            }
        }

        // Append flag event (best-effort, ignore errors)
        await supabase.from('flag_events').insert({
            flag_id: flagId,
            event_type: 'dismissed',
            actor_account_id: actorAccountId || null,
            note: reason || 'Dismissed by staff',
        }).then(() => { });

        return true;
    } catch (err) {
        logger.error('API', 'Unexpected error dismissing flag', {
            error: err instanceof Error ? err.message : String(err),
        });
        return false;
    }
}

/**
 * Unresolve (reopen) a flag.
 * Falls back to old schema if new columns don't exist.
 */
export async function unresolveFlag(flagId: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('policy_flags')
            .update({
                status: 'open',
                resolved_at: null,
                resolved_by_account_id: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', flagId);

        if (error) {
            // Fallback: old schema
            const { error: oldErr } = await supabase
                .from('policy_flags')
                .update({ resolved_at: null, resolved_by_account_id: null })
                .eq('id', flagId);

            if (oldErr) {
                logger.error('API', 'Error unresolving flag', { flagId, message: oldErr.message });
                return false;
            }
        }

        // Best-effort event logging
        await supabase.from('flag_events').insert({
            flag_id: flagId,
            event_type: 'reopened',
            note: 'Reopened by staff',
        }).then(() => { });

        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Update a flag's title, message, severity, and/or details.
 */
export async function updateFlag(
    flagId: string,
    updates: { title?: string; message?: string; severity?: string; details?: Record<string, unknown> }
): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('policy_flags')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', flagId);

        if (error) {
            logger.error('API', 'Error updating flag', { flagId, message: error.message });
            return false;
        }
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Fetch flag_events history for a flag.
 */
export async function fetchFlagEvents(flagId: string): Promise<FlagEventRow[]> {
    try {
        const { data, error } = await supabase
            .from('flag_events')
            .select('*')
            .eq('flag_id', flagId)
            .order('created_at', { ascending: false });

        if (error || !data) return [];
        return data as FlagEventRow[];
    } catch {
        return [];
    }
}

/**
 * Fetch manual-allowed flag definitions.
 */
export async function fetchManualFlagDefinitions(): Promise<FlagDefinitionRow[]> {
    try {
        const { data, error } = await supabase
            .from('flag_definitions')
            .select('*')
            .eq('is_manual_allowed', true)
            .eq('is_active', true);

        if (error || !data) return [];
        return data as FlagDefinitionRow[];
    } catch {
        return [];
    }
}

/**
 * Create a manual flag (supports both policy and client scope).
 */
export async function createManualFlag(fields: {
    code: string;
    severity: string;
    title: string;
    message?: string;
    policy_id?: string | null;
    client_id?: string | null;
    category?: string;
}): Promise<PolicyFlagRow | null> {
    try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('policy_flags')
            .insert({
                policy_id: fields.policy_id || null,
                client_id: fields.client_id || null,
                code: fields.code,
                severity: fields.severity,
                title: fields.title,
                message: fields.message || null,
                source: 'user',
                status: 'open',
                category: fields.category || 'manual',
                first_seen_at: now,
                last_seen_at: now,
                times_seen: 1,
                created_at: now,
                updated_at: now,
            })
            .select('*')
            .single();

        if (error || !data) {
            logger.error('API', 'Error creating manual flag', { message: error?.message });
            return null;
        }

        // Append flag_event
        await supabase.from('flag_events').insert({
            flag_id: (data as PolicyFlagRow).id,
            event_type: 'created',
            note: `Manual flag created: ${fields.title}`,
        });

        return data as PolicyFlagRow;
    } catch (err) {
        logger.error('API', 'Unexpected error creating manual flag', {
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

// NOTE: fetchAllOpenFlags was removed (dead code — zero callers). Restorable from Git.


// ------------------------------------------------------------------
// Flagged Policies — grouped by policy for the agent worklist
// ------------------------------------------------------------------

export interface FlaggedPolicyGroup {
    policy_id: string;
    policy_number: string;
    named_insured: string;
    carrier_name?: string;
    expiration_date?: string;
    office?: string;
    sold_by?: string;
    client_id?: string;
    flags: PolicyFlagRow[];
    total_flags: number;
    high_count: number;
    medium_count: number;
    low_count: number;
    max_severity: string;
}

export async function fetchFlaggedPoliciesGrouped(): Promise<FlaggedPolicyGroup[]> {
    try {
        let allData: any[] = [];
        let r_start = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from('policy_flags')
                .select(`
                    *,
                    policies(
                        id, policy_number, carrier_name, status, client_id,
                        clients(named_insured, is_demo),
                        policy_terms(expiration_date, office, sold_by, is_current)
                    )
                `)
                .eq('status', 'open')
                .order('created_at', { ascending: false })
                .order('id', { ascending: true })
                .range(r_start, r_start + limit - 1);

            if (error) {
                logger.error('api', 'fetchFlaggedPoliciesGrouped error:', { error: error instanceof Error ? error.message : String(error) })
                break;
            }
            if (!data || data.length === 0) {
                hasMore = false;
            } else {
                allData = allData.concat(data);
                if (data.length < limit) hasMore = false;
                r_start += limit;
            }
        }

        const data = allData;

        // Group by policy_id
        const groupMap = new Map<string, FlaggedPolicyGroup>();

        for (const row of data as any[]) {
            const policyId = row.policy_id;
            if (!policyId) continue; // skip flags without a policy

            // Skip flags from demo clients
            const policy = row.policies || {};
            if (policy.clients?.is_demo) continue;

            // Skip flags from inactive policies (expired, cancelled, non_renewed)
            if (policy.status && (INACTIVE_STATUSES as readonly string[]).includes(policy.status)) continue;

            if (!groupMap.has(policyId)) {
                const client = policy.clients || {};
                // Find the current term or the most recent one
                const terms: any[] = Array.isArray(policy.policy_terms) ? policy.policy_terms : [];
                const currentTerm = terms.find((t: any) => t.is_current) || terms[0] || {};

                groupMap.set(policyId, {
                    policy_id: policyId,
                    policy_number: policy.policy_number || row.policy_number || 'Unknown',
                    named_insured: client.named_insured || 'Unknown Insured',
                    carrier_name: policy.carrier_name || undefined,
                    expiration_date: currentTerm.expiration_date || undefined,
                    office: currentTerm.office || undefined,
                    sold_by: currentTerm.sold_by || undefined,
                    client_id: policy.client_id || row.client_id || undefined,
                    flags: [],
                    total_flags: 0,
                    high_count: 0,
                    medium_count: 0,
                    low_count: 0,
                    max_severity: 'low',
                });
            }

            const group = groupMap.get(policyId)!;
            // Deduplicate: skip if we already have this flag ID in the group
            if (group.flags.some((existing: any) => existing.id === row.id)) continue;
            group.flags.push({
                ...row,
                policy_number: row.policies?.policy_number || row.policy_number || null,
            });
            group.total_flags++;

            switch (row.severity) {
                case 'high': group.high_count++; break;
                case 'medium': group.medium_count++; break;
                default: group.low_count++; break;
            }
        }

        // compute max_severity for each group
        for (const group of groupMap.values()) {
            if (group.high_count > 0) group.max_severity = 'high';
            else if (group.medium_count > 0) group.max_severity = 'medium';
            else group.max_severity = 'low';

            // Sort flags within each group by priority
            group.flags.sort((a, b) =>
                (PRIORITY_ORDER[b.severity] || 0) - (PRIORITY_ORDER[a.severity] || 0)
            );
        }

        // Sort groups: highest priority first, then nearest expiration, then most flags
        const groups = Array.from(groupMap.values());
        groups.sort((a, b) => {
            const sevDiff = (PRIORITY_ORDER[b.max_severity] || 0) - (PRIORITY_ORDER[a.max_severity] || 0);
            if (sevDiff !== 0) return sevDiff;

            // Nearest expiration first (nulls last)
            const expA = a.expiration_date ? new Date(a.expiration_date).getTime() : Infinity;
            const expB = b.expiration_date ? new Date(b.expiration_date).getTime() : Infinity;
            if (expA !== expB) return expA - expB;

            // Most flags first
            return b.total_flags - a.total_flags;
        });

        return groups;
    } catch (err) {
        logger.error('api', 'fetchFlaggedPoliciesGrouped error:', { error: err instanceof Error ? err.message : String(err) })
        return [];
    }
}


/**
 * Run on-demand flag evaluation for a policy via the API route.
 */
export async function runFlagCheck(policyId: string): Promise<{
    success: boolean;
    message?: string;
    summary?: { created: number; refreshed: number; resolved: number; checked: number };
}> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const res = await fetch('/api/flags/evaluate', {
            method: 'POST',
            headers,
            body: JSON.stringify({ policy_id: policyId }),
        });
        return await res.json();
    } catch (err) {
        return { success: false, message: 'Failed to run flag check' };
    }
}


// --- Ingestion Debug (Phase 2) ---

export interface SubmissionDebugRow {
    id: string;
    account_id: string;
    status: string;
    file_path: string | null;
    storage_path: string | null;
    created_at: string;
    error_message: string | null;

    // Joined dec_pages data
    dec_page_id?: string;
    parse_status?: string;
    missing_fields?: string[];
    insured_name?: string;
    policy_number?: string;
    extracted_json?: any;
}

export async function fetchRecentSubmissions(limit = 20): Promise<SubmissionDebugRow[]> {
    try {
        const { data, error } = await supabase
            .from('dec_page_submissions')
            .select(`
        id,
        account_id,
        status,
        file_path,
        storage_path,
        created_at,
        error_message,
        dec_pages (
          id,
          parse_status,
          missing_fields,
          insured_name,
          policy_number,
          extracted_json
        )
      `)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            logger.error('api', "Error fetching submissions:", { error: error.message })
            throw error;
        }

        if (!data) return [];

        return data.map((row: any) => {
            const dp = row.dec_pages && row.dec_pages.length > 0 ? row.dec_pages[0] : null;
            return {
                id: row.id,
                account_id: row.account_id,
                status: row.status,
                file_path: row.file_path,
                storage_path: row.storage_path,
                created_at: row.created_at,
                error_message: row.error_message,
                dec_page_id: dp?.id,
                parse_status: dp?.parse_status,
                missing_fields: dp?.missing_fields,
                insured_name: dp?.insured_name,
                policy_number: dp?.policy_number,
                extracted_json: dp?.extracted_json,
            };
        });
    } catch (err) {
        logger.error('api', "Exception in fetchRecentSubmissions:", { error: err instanceof Error ? err.message : String(err) })
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Policy Files (Dec Pages for a Policy)
// ---------------------------------------------------------------------------

export interface DecPageFileInfo {
    id: string;
    dec_page_id: string;
    storage_path: string | null;
    file_name: string | null;
    file_size: number | null;
    uploaded_at: string;
    parse_status: string | null;
    insured_name: string | null;
    policy_number: string | null;
    uploaded_by?: string | null;
}

/**
 * Fetch dec page files linked to a policy.
 * Joins dec_pages → dec_page_submissions & accounts to get file metadata and uploader.
 */
export async function fetchDecPageFilesByPolicyId(policyId: string): Promise<DecPageFileInfo[]> {
    try {
        const { data, error } = await supabase
            .from('dec_pages')
            .select(`
                id,
                insured_name,
                policy_number,
                parse_status,
                created_at,
                created_by_account_id,
                submission_id,
                dec_page_submissions (
                    id,
                    storage_path,
                    file_path,
                    file_name,
                    file_size,
                    file_hash,
                    status,
                    account_id,
                    created_at,
                    accounts:account_id (
                        id,
                        first_name,
                        last_name,
                        email
                    )
                ),
                accounts:created_by_account_id (
                    id,
                    first_name,
                    last_name,
                    email
                )
            `)
            .eq('policy_id', policyId)
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('API', 'Error fetching dec page files', { message: error.message, policyId });
            return [];
        }
        
        if (!data) return [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawFiles = data.map((row: any) => {
            const sub = Array.isArray(row.dec_page_submissions)
                ? row.dec_page_submissions[0]
                : row.dec_page_submissions;
            
            const subAccount = Array.isArray(sub?.accounts) ? sub?.accounts[0] : sub?.accounts;
            const decAccount = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
            const account = subAccount || decAccount;

            let uploaded_by: string | null = null;
            if (account) {
                const fn = account.first_name || '';
                const ln = account.last_name || '';
                uploaded_by = `${fn} ${ln}`.trim() || account.email || null;
            }

            return {
                id: sub?.id || row.id,
                dec_page_id: row.id,
                storage_path: sub?.storage_path || sub?.file_path || null,
                file_name: sub?.file_name || null,
                file_size: sub?.file_size || null,
                uploaded_at: sub?.created_at || row.created_at,
                parse_status: row.parse_status,
                insured_name: row.insured_name,
                policy_number: row.policy_number,
                uploaded_by,
                _sub_status: sub?.status || null,
                _file_hash: sub?.file_hash || null,
            };
        });

        // Filter out duplicate/failed tracking rows
        const filtered = rawFiles.filter(f => f._sub_status !== 'duplicate' && f._sub_status !== 'failed');

        // Deduplicate by file_hash — keep only the best version (parsed > needs_review > others)
        const hashMap = new Map<string, typeof filtered[0]>();
        const statusPriority: Record<string, number> = { parsed: 0, needs_review: 1 };
        for (const f of filtered) {
            const key = f._file_hash || f.id; // Use hash if available, else unique ID
            const existing = hashMap.get(key);
            if (!existing) {
                hashMap.set(key, f);
            } else {
                const existingPriority = statusPriority[existing.parse_status || ''] ?? 99;
                const newPriority = statusPriority[f.parse_status || ''] ?? 99;
                if (newPriority < existingPriority) {
                    hashMap.set(key, f);
                }
            }
        }

        // Return deduplicated files (strip internal fields)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        return [...hashMap.values()].map(({ _sub_status, _file_hash, ...rest }) => rest);
    } catch (err) {
        logger.error('API', 'Unexpected error fetching dec page files', {
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}
/**
 * Internal helper: generate a signed URL via the server-side API route.
 * This bypasses Supabase storage RLS by using the admin client on the server.
 */
async function _getSignedUrlViaApi(storagePath: string, bucket: string): Promise<string | null> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            logger.error('API', 'No auth session for signed URL request');
            return null;
        }

        const res = await fetch('/api/documents/signed-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ storagePath, bucket }),
        });

        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            logger.error('API', 'Signed URL API failed', {
                status: res.status,
                error: errBody.error,
                storagePath,
                bucket,
            });
            return null;
        }

        const { signedUrl } = await res.json();
        return signedUrl || null;
    } catch (err) {
        logger.error('API', 'Unexpected error getting signed URL', {
            error: err instanceof Error ? err.message : String(err),
            storagePath,
            bucket,
        });
        return null;
    }
}

/**
 * Generate a signed download URL for a dec page file via server-side API.
 * Uses the admin client on the server to bypass storage bucket RLS.
 */
export async function getDecPageFileDownloadUrl(storagePath: string): Promise<string | null> {
    return _getSignedUrlViaApi(storagePath, 'cfp-raw-decpage');
}

// ---------------------------------------------------------------------------
// Platform Documents (RCE, DIC, etc.)
// ---------------------------------------------------------------------------

export type PlatformDocType = 'rce' | 'dic_dec_page' | 'es_doc' | 'invoice' | 'inspection' | 'endorsement' | 'questionnaire';

export interface PlatformDocumentInfo {
    id: string;
    doc_type: PlatformDocType;
    file_name: string;
    file_size: number | null;
    storage_path: string | null;
    parse_status: string;
    processing_step: string | null;
    match_status: string;
    match_confidence: number | null;
    error_message: string | null;
    extracted_owner_name: string | null;
    extracted_address: string | null;
    writeback_status: string;
    policy_id: string | null;
    client_id: string | null;
    created_at: string;
    updated_at: string;
    uploaded_by?: string | null;
    carrier_name?: string | null;
    source?: string | null;
    created_by?: string | null;
    policy_number?: string | null;
    policy_address?: string | null;
    policy_insured?: string | null;
    dic_data?: {
        carrier_name?: string | null;
        policy_number?: string | null;
        document_type?: string | null;
        has_dic_endorsement?: boolean | null;
        basic_premium?: number | null;
        total_charge?: number | null;
        cov_a_dwelling?: string | null;
    } | null;
}

/**
 * Fetch platform documents linked to a policy.
 */
export async function fetchPlatformDocumentsByPolicyId(policyId: string): Promise<PlatformDocumentInfo[]> {
    try {
        const { data, error } = await supabase
            .from('platform_documents')
            .select(`
                id, doc_type, file_name, file_size, storage_path,
                parse_status, processing_step, match_status, match_confidence,
                error_message, extracted_owner_name, extracted_address,
                writeback_status, policy_id, client_id, created_at, updated_at,
                account_id,
                accounts:account_id (
                    id, first_name, last_name, email
                ),
                doc_data_rce (
                    source, created_by
                ),
                doc_data_dic (
                    carrier_name, policy_number, document_type, has_dic_endorsement, basic_premium, total_charge, cov_a_dwelling
                )
            `)
            .eq('policy_id', policyId)
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('API', 'Error fetching platform documents', { message: error.message, policyId });
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docs = (data || []).map((row: any) => {
            const acc = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
            let uploaded_by: string | null = null;
            if (acc) {
                const fn = acc.first_name || '';
                const ln = acc.last_name || '';
                uploaded_by = `${fn} ${ln}`.trim() || acc.email || null;
            }
            const rce = Array.isArray(row.doc_data_rce) ? row.doc_data_rce[0] : row.doc_data_rce;
            const dic = Array.isArray(row.doc_data_dic) ? row.doc_data_dic[0] : row.doc_data_dic;
            const carrier_name = dic?.carrier_name || (rce?.created_by?.toLowerCase().includes('bamboo') ? 'Bamboo' : null);
            return {
                ...row,
                uploaded_by,
                carrier_name,
                source: rce?.source || null,
                created_by: rce?.created_by || null,
                dic_data: dic || null,
            };
        });

        return docs as PlatformDocumentInfo[];
    } catch (err) {
        logger.error('API', 'Unexpected error fetching platform documents', {
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

/**
 * Fetch platform documents linked to a client.
 */
export async function fetchPlatformDocumentsByClientId(clientId: string): Promise<PlatformDocumentInfo[]> {
    try {
        // First get all policy IDs for this client to capture policy-assigned documents
        const { data: clientPolicies } = await supabase
            .from('policies')
            .select('id')
            .eq('client_id', clientId);
        
        const policyIds = (clientPolicies || []).map(p => p.id).filter(Boolean);

        let query = supabase
            .from('platform_documents')
            .select(`
                id, doc_type, file_name, file_size, storage_path,
                parse_status, processing_step, match_status, match_confidence,
                error_message, extracted_owner_name, extracted_address,
                writeback_status, policy_id, client_id, created_at, updated_at,
                account_id,
                accounts:account_id (
                    id, first_name, last_name, email
                ),
                doc_data_rce (
                    source, created_by
                ),
                doc_data_dic (
                    carrier_name, policy_number, document_type, has_dic_endorsement, basic_premium, total_charge, cov_a_dwelling
                )
            `);

        if (policyIds.length > 0) {
            query = query.or(`client_id.eq.${clientId},policy_id.in.(${policyIds.join(',')})`);
        } else {
            query = query.eq('client_id', clientId);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) {
            logger.error('API', 'Error fetching client platform documents', { message: error.message, clientId });
            return [];
        }

        const seenIds = new Set<string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docs: any[] = [];

        (data || []).forEach((row: any) => {
            if (seenIds.has(row.id)) return;
            seenIds.add(row.id);

            const acc = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
            let uploaded_by: string | null = null;
            if (acc) {
                const fn = acc.first_name || '';
                const ln = acc.last_name || '';
                uploaded_by = `${fn} ${ln}`.trim() || acc.email || null;
            }
            const rce = Array.isArray(row.doc_data_rce) ? row.doc_data_rce[0] : row.doc_data_rce;
            const dic = Array.isArray(row.doc_data_dic) ? row.doc_data_dic[0] : row.doc_data_dic;
            const carrier_name = dic?.carrier_name || (rce?.created_by?.toLowerCase().includes('bamboo') ? 'Bamboo' : null);
            docs.push({
                ...row,
                uploaded_by,
                carrier_name,
                source: rce?.source || null,
                created_by: rce?.created_by || null,
                dic_data: dic || null,
            });
        });

        return docs as PlatformDocumentInfo[];
    } catch (err) {
        logger.error('API', 'Unexpected error fetching client platform documents', {
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

/**
 * Fetch platform documents needing agent review.
 */
export async function fetchDocumentsNeedingReview(): Promise<PlatformDocumentInfo[]> {
    try {
        const { data, error } = await supabase
            .from('platform_documents')
            .select(`
                id, doc_type, file_name, file_size, storage_path,
                parse_status, processing_step, match_status, match_confidence,
                error_message, extracted_owner_name, extracted_address,
                writeback_status, policy_id, client_id, created_at, updated_at,
                account_id,
                accounts:account_id (
                    id, first_name, last_name, email
                ),
                doc_data_rce (
                    source, created_by
                ),
                doc_data_dic (
                    carrier_name
                )
            `)
            .or('match_status.eq.needs_review,match_status.eq.no_match,parse_status.eq.failed')
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('API', 'Error fetching review queue', { message: error.message });
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docs = (data || []).map((row: any) => {
            const acc = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
            let uploaded_by: string | null = null;
            if (acc) {
                const fn = acc.first_name || '';
                const ln = acc.last_name || '';
                uploaded_by = `${fn} ${ln}`.trim() || acc.email || null;
            }
            const rce = Array.isArray(row.doc_data_rce) ? row.doc_data_rce[0] : row.doc_data_rce;
            const dic = Array.isArray(row.doc_data_dic) ? row.doc_data_dic[0] : row.doc_data_dic;
            const carrier_name = dic?.carrier_name || (rce?.created_by?.toLowerCase().includes('bamboo') ? 'Bamboo' : null);
            return {
                ...row,
                uploaded_by,
                carrier_name,
                source: rce?.source || null,
                created_by: rce?.created_by || null,
            };
        });

        return docs as PlatformDocumentInfo[];
    } catch (err) {
        logger.error('API', 'Unexpected error fetching review queue', {
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

/**
 * Fetch platform documents that have been flagged as mismatched with their attached policy.
 */
export async function fetchMismatchedDocuments(): Promise<PlatformDocumentInfo[]> {
    try {
        const { data, error } = await supabase
            .from('platform_documents')
            .select(`
                id, doc_type, file_name, file_size, storage_path,
                parse_status, processing_step, match_status, match_confidence,
                error_message, extracted_owner_name, extracted_address,
                writeback_status, policy_id, client_id, created_at, updated_at,
                account_id,
                accounts:account_id (
                    id, first_name, last_name, email
                ),
                doc_data_rce (
                    source, created_by
                ),
                doc_data_dic (
                    carrier_name
                ),
                policies:policy_id (
                    id, policy_number, property_address_raw,
                    clients:client_id (
                        id, named_insured
                    )
                )
            `)
            .or('match_status.eq.mismatch,error_message.ilike.%Mismatch%')
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('API', 'Error fetching mismatched documents', { message: error.message });
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docs = (data || []).map((row: any) => {
            const acc = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
            let uploaded_by: string | null = null;
            if (acc) {
                const fn = acc.first_name || '';
                const ln = acc.last_name || '';
                uploaded_by = `${fn} ${ln}`.trim() || acc.email || null;
            }
            const rce = Array.isArray(row.doc_data_rce) ? row.doc_data_rce[0] : row.doc_data_rce;
            const dic = Array.isArray(row.doc_data_dic) ? row.doc_data_dic[0] : row.doc_data_dic;
            const carrier_name = dic?.carrier_name || (rce?.created_by?.toLowerCase().includes('bamboo') ? 'Bamboo' : null);

            const pol = Array.isArray(row.policies) ? row.policies[0] : row.policies;
            const client = pol?.clients ? (Array.isArray(pol.clients) ? pol.clients[0] : pol.clients) : null;

            return {
                ...row,
                uploaded_by,
                carrier_name,
                source: rce?.source || null,
                created_by: rce?.created_by || null,
                policy_number: pol?.policy_number || null,
                policy_address: pol?.property_address_raw || null,
                policy_insured: client?.named_insured || null,
            };
        });

        return docs as PlatformDocumentInfo[];
    } catch (err) {
        logger.error('API', 'Unexpected error fetching mismatched documents', {
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

/**
 * Confirm/override a mismatched document to remain attached to its policy.
 */
export async function confirmMismatchDocument(documentId: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('platform_documents')
            .update({
                match_status: 'manual',
                error_message: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', documentId);

        if (error) {
            logger.error('API', 'Failed to confirm mismatch document', { error: error.message });
            return false;
        }
        return true;
    } catch (err) {
        logger.error('API', 'Unexpected error confirming mismatch document', { error: String(err) });
        return false;
    }
}

/**
 * Generate a signed download URL for a platform document.
 */
export async function getPlatformDocDownloadUrl(storagePath: string, bucket = 'cfp-platform-documents'): Promise<string | null> {
    return _getSignedUrlViaApi(storagePath, bucket);
}

/**
 * Manually link a platform document to a policy.
 */
export async function linkDocumentToPolicy(
    documentId: string,
    policyId: string,
    clientId?: string,
    policyTermId?: string,
): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('platform_documents')
            .update({
                policy_id: policyId,
                client_id: clientId || null,
                policy_term_id: policyTermId || null,
                match_status: 'manual',
                updated_at: new Date().toISOString(),
            })
            .eq('id', documentId);

        if (error) {
            logger.error('API', 'Failed to link document to policy', { error: error.message, documentId, policyId });
            return false;
        }
        return true;
    } catch (err) {
        logger.error('API', 'Unexpected error linking document', {
            error: err instanceof Error ? err.message : String(err),
        });
        return false;
    }
}

// ---------------------------------------------------------------------------
// Activity Feed
// ---------------------------------------------------------------------------

export interface ActivityFeedItem {
    id: string;
    type: 'upload' | 'merge' | 'document';
    status: string;
    created_at: string;
    file_path: string | null;
    error_message?: string | null;
    // From dec_pages (joined)
    insured_name?: string;
    policy_number?: string;
    policy_id?: string;
    client_id?: string;
    // Uploader info
    uploaded_by: string;
    // Processing time (seconds) — computed from updated_at - created_at for completed items
    processing_time_seconds?: number;
    // Whether enrichment/flags have actually run (for real-time indicators)
    is_enriched?: boolean;
    flags_checked?: boolean;
    // Merge event extras
    event_type?: string;
    title?: string;
    detail?: string;
    meta?: Record<string, any>;
    // Document-specific fields
    doc_type?: string;
    document_id?: string;
    match_status?: string;
    writeback_status?: string;
    match_confidence?: number;
    file_name?: string;
}

/**
 * Fetch recent uploads + merge events for the dashboard activity feed.
 */
export async function fetchActivityFeed(limit = 20): Promise<ActivityFeedItem[]> {
    try {
        const { data, error } = await supabase
            .from('dec_page_submissions')
            .select(`
                id,
                status,
                file_path,
                error_message,
                created_at,
                updated_at,
                account_id,
                dec_pages (
                    insured_name,
                    policy_number,
                    policy_id,
                    client_id
                ),
                accounts:account_id (
                    first_name,
                    last_name,
                    role
                )
            `)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            logger.error('API', 'Error fetching activity feed', { message: error.message });
            return [];
        }

        if (!data) return [];

        // Collect unique policy IDs for batch enrichment/flags lookup
        const policyIds = new Set<string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const row of data) {
            const dpRaw = row.dec_pages;
            const dp = Array.isArray(dpRaw) ? dpRaw[0] : dpRaw;
            if (dp?.policy_id) policyIds.add(dp.policy_id);
        }

        // Batch lookup: which policies have enrichments?
        const enrichedSet = new Set<string>();
        if (policyIds.size > 0) {
            const { data: enrichRows } = await supabase
                .from('property_enrichments')
                .select('policy_id')
                .in('policy_id', Array.from(policyIds))
                .limit(500);
            if (enrichRows) {
                for (const e of enrichRows) enrichedSet.add(e.policy_id);
            }
        }

        // Batch lookup: which policies have flags evaluated?
        const flagsSet = new Set<string>();
        if (policyIds.size > 0) {
            const { data: flagRows } = await supabase
                .from('policy_flags')
                .select('policy_id')
                .in('policy_id', Array.from(policyIds))
                .limit(500);
            if (flagRows) {
                for (const f of flagRows) flagsSet.add(f.policy_id);
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uploadItems = data.map((row: any) => {
            const dpRaw = row.dec_pages;
            const dp = Array.isArray(dpRaw)
                ? (dpRaw.length > 0 ? dpRaw[0] : null)
                : (dpRaw || null);

            const acct = row.accounts;
            let uploaderName = 'Unknown';
            if (acct) {
                const first = acct.first_name || '';
                const last = acct.last_name || '';
                const fullName = `${first} ${last}`.trim();
                if (fullName) {
                    uploaderName = fullName;
                } else {
                    uploaderName = acct.role === 'agent' ? 'Agent' : acct.role === 'customer' ? 'Client' : 'User';
                }
            }

            let processingSeconds: number | undefined;
            if ((row.status === 'parsed' || row.status === 'done') && row.updated_at && row.created_at) {
                const elapsed = (new Date(row.updated_at).getTime() - new Date(row.created_at).getTime()) / 1000;
                if (elapsed > 0 && elapsed < 3600) {
                    processingSeconds = Math.round(elapsed);
                }
            }

            const pid = dp?.policy_id;

            return {
                id: row.id,
                type: 'upload' as const,
                status: row.status,
                created_at: row.created_at,
                file_path: row.file_path,
                error_message: row.error_message,
                insured_name: dp?.insured_name || undefined,
                policy_number: dp?.policy_number || undefined,
                policy_id: pid || undefined,
                client_id: dp?.client_id || undefined,
                uploaded_by: uploaderName,
                processing_time_seconds: processingSeconds,
                is_enriched: pid ? enrichedSet.has(pid) : false,
                flags_checked: pid ? flagsSet.has(pid) : false,
            };
        });

        // ── Source B: Merge events only ──
        const { data: mergeData } = await supabase
            .from('activity_events')
            .select('id, event_type, title, detail, client_id, policy_id, meta, created_at')
            .in('event_type', ['merge.client', 'merge.policy'])
            .order('created_at', { ascending: false })
            .limit(limit);

        const mergeItems: ActivityFeedItem[] = (mergeData || []).map((ev: any) => ({
            id: ev.id,
            type: 'merge' as const,
            status: 'done',
            created_at: ev.created_at,
            file_path: null,
            uploaded_by: 'System',
            event_type: ev.event_type,
            title: ev.title,
            detail: ev.detail,
            client_id: ev.client_id || ev.meta?.survivor_id || undefined,
            insured_name: ev.meta?.survivor_name || undefined,
            policy_number: ev.meta?.survivor_policy_number || undefined,
            policy_id: ev.policy_id || undefined,
            meta: ev.meta,
        }));

        // Source C — Document upload + processing events (including RCE, DIC, etc.)
        let docItems: ActivityFeedItem[] = [];
        try {
            const { data: docEvents } = await supabase
                .from('activity_events')
                .select('*')
                .or(
                    'event_type.in.(document.processed,document.needs_review,document.no_match,document.failed),' +
                    'event_type.like.doc.uploaded.%'
                )
                .order('created_at', { ascending: false })
                .limit(limit);
            if (docEvents && docEvents.length > 0) {
                // Batch lookup: get policy_number for linked policies
                const docPolicyIds = new Set<string>();
                const docClientIds = new Set<string>();
                const actorUserIds = new Set<string>();
                for (const evt of docEvents) {
                    if (evt.policy_id) docPolicyIds.add(evt.policy_id);
                    if (evt.client_id) docClientIds.add(evt.client_id);
                    if (evt.actor_user_id) actorUserIds.add(evt.actor_user_id);
                }

                const policyNumberMap = new Map<string, string>();
                if (docPolicyIds.size > 0) {
                    const { data: policyRows } = await supabase
                        .from('policies')
                        .select('id, policy_number')
                        .in('id', Array.from(docPolicyIds))
                        .limit(200);
                    if (policyRows) {
                        for (const p of policyRows) {
                            if (p.policy_number) policyNumberMap.set(p.id, p.policy_number);
                        }
                    }
                }

                const clientNameMap = new Map<string, string>();
                if (docClientIds.size > 0) {
                    const { data: clientRows } = await supabase
                        .from('clients')
                        .select('id, named_insured')
                        .in('id', Array.from(docClientIds))
                        .limit(200);
                    if (clientRows) {
                        for (const c of clientRows) {
                            if (c.named_insured) clientNameMap.set(c.id, c.named_insured);
                        }
                    }
                }

                // Batch lookup: resolve agent names from actor_user_id
                const actorNameMap = new Map<string, string>();
                if (actorUserIds.size > 0) {
                    const { data: actorRows } = await supabase
                        .from('accounts')
                        .select('id, first_name, last_name, role')
                        .in('id', Array.from(actorUserIds))
                        .limit(200);
                    if (actorRows) {
                        for (const a of actorRows) {
                            const fullName = `${a.first_name || ''} ${a.last_name || ''}`.trim();
                            actorNameMap.set(a.id, fullName || (a.role === 'agent' ? 'Agent' : 'User'));
                        }
                    }
                }

                // Batch lookup: platform_documents for metadata & staleness check
                const docMetaIds = new Set<string>();
                const processedDocIds = new Set<string>();
                for (const evt of docEvents) {
                    if (evt.meta?.document_id) {
                        docMetaIds.add(evt.meta.document_id);
                        if (!evt.event_type?.startsWith('doc.uploaded.')) {
                            processedDocIds.add(evt.meta.document_id);
                        }
                    }
                }
                const platDocMap = new Map<string, { id: string; doc_type: string; match_status: string; policy_id: string | null; file_name: string }>();
                if (docMetaIds.size > 0) {
                    const { data: platDocs } = await supabase
                        .from('platform_documents')
                        .select('id, doc_type, match_status, policy_id, file_name')
                        .in('id', Array.from(docMetaIds))
                        .limit(200);
                    if (platDocs) {
                        for (const pd of platDocs) {
                            platDocMap.set(pd.id, pd);
                        }
                    }
                }

                for (const evt of docEvents) {
                    const meta = evt.meta || {};

                    // If this event points to a specific document_id that was deleted or converted, skip it
                    if (meta.document_id && !platDocMap.has(meta.document_id)) {
                        continue;
                    }

                    const isUploadEvent = (evt.event_type || '').startsWith('doc.uploaded.');

                    // Deduplicate: If document has been processed/needs_review/failed, skip the raw initial upload event
                    if (isUploadEvent && meta.document_id && processedDocIds.has(meta.document_id)) {
                        continue;
                    }

                    const platDoc = meta.document_id ? platDocMap.get(meta.document_id) : undefined;

                    // If this was a "needs_review" event, but the document has already been matched/assigned, skip the obsolete prompt
                    if (evt.event_type === 'document.needs_review' && platDoc && (platDoc.policy_id || platDoc.match_status === 'matched' || platDoc.match_status === 'manual')) {
                        continue;
                    }

                    const docType = platDoc?.doc_type || meta.doc_type || (isUploadEvent ? evt.event_type.replace('doc.uploaded.', '') : undefined);

                    // Resolve insured_name: client table → meta.owner_name → null
                    const resolvedInsuredName = (evt.client_id && clientNameMap.get(evt.client_id))
                        || meta.owner_name || undefined;

                    // Resolve policy_number from policies table
                    const resolvedPolicyNumber = (evt.policy_id && policyNumberMap.get(evt.policy_id)) || undefined;

                    // Resolve agent name from actor_user_id
                    const uploaderName = (evt.actor_user_id && actorNameMap.get(evt.actor_user_id)) || 'System';

                    // Determine display status
                    let docStatus = 'done';
                    if (evt.event_type === 'document.failed') docStatus = 'failed';
                    else if (evt.event_type === 'document.needs_review') docStatus = 'done';
                    else if (evt.event_type === 'document.no_match') docStatus = 'done';
                    else if (isUploadEvent) docStatus = 'done';

                    docItems.push({
                        id: evt.id,
                        type: 'document' as const,
                        event_type: evt.event_type,
                        title: evt.title,
                        detail: evt.detail,
                        policy_id: evt.policy_id || undefined,
                        client_id: evt.client_id || undefined,
                        insured_name: resolvedInsuredName,
                        policy_number: resolvedPolicyNumber,
                        created_at: evt.created_at,
                        meta: meta,
                        status: docStatus,
                        file_path: null,
                        uploaded_by: uploaderName,
                        // Document-specific fields
                        doc_type: docType,
                        document_id: meta.document_id || undefined,
                        match_status: meta.match_status || undefined,
                        writeback_status: meta.writeback_status || undefined,
                        match_confidence: meta.confidence || undefined,
                        file_name: meta.file_name || undefined,
                    });
                }
            }
        } catch (e) {
            logger.warn('api', 'Failed to fetch document events:', { error: e instanceof Error ? e.message : String(e) })
        }

        // Merge + sort chronologically
        const combined = [...uploadItems, ...mergeItems, ...docItems]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, limit);

        return combined;
    } catch (err) {
        logger.error('API', 'Unexpected error fetching activity feed', {
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

// NOTE: fetchEntityActivity + EntityActivityEvent were removed (dead code — zero callers). Restorable from Git.


// ---------------------------------------------------------------------------
// Dec Page Review & Approval
// ---------------------------------------------------------------------------

export interface DecPageSummary {
    id: string;
    created_at: string;
    policy_number?: string;
    insured_name?: string;
    review_status: string;
    parse_status?: string;
    // Key coverage fields for comparison
    limit_dwelling?: string;
    limit_other_structures?: string;
    limit_personal_property?: string;
    deductible?: string;
    broker_name?: string;
    total_annual_premium?: string;
    policy_period_start?: string;
    policy_period_end?: string;
}

/**
 * Fetch all dec pages for a given policy, ordered most recent first.
 */
export async function fetchDecPagesForPolicy(policyId: string): Promise<DecPageSummary[]> {
    try {
        const { data, error } = await supabase
            .from('dec_pages')
            .select(`
                id, created_at, policy_number, insured_name, review_status, parse_status,
                limit_dwelling, limit_other_structures, limit_personal_property,
                deductible, broker_name, total_annual_premium,
                policy_period_start, policy_period_end
            `)
            .eq('policy_id', policyId)
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('API', 'Error fetching dec pages for policy', { message: error.message });
            return [];
        }
        return (data || []) as DecPageSummary[];
    } catch (err) {
        logger.error('API', 'Unexpected error', { error: String(err) });
        return [];
    }
}

/**
 * Approve a dec page: copy its coverage data into the current policy_term.
 * Supersedes any previously approved dec pages for the same policy.
 */
export async function approveDecPage(decPageId: string, policyId: string): Promise<boolean> {
    try {
        // 1. Fetch full dec page data
        const { data: dp, error: dpErr } = await supabase
            .from('dec_pages')
            .select('*')
            .eq('id', decPageId)
            .single();

        if (dpErr || !dp) {
            logger.error('API', 'Cannot fetch dec page for approval', { message: dpErr?.message });
            return false;
        }

        // 2. Find the current policy_term for this policy
        const { data: terms, error: termErr } = await supabase
            .from('policy_terms')
            .select('id')
            .eq('policy_id', policyId)
            .eq('is_current', true)
            .limit(1);

        if (termErr || !terms?.length) {
            logger.error('API', 'No current term found for policy', { policyId });
            return false;
        }

        const termId = terms[0].id;
        const now = new Date().toISOString();

        // 3. Get current user for approved_by
        const { data: { user } } = await supabase.auth.getUser();

        // 4. Promote dec page data → policy_term
        const { error: updateErr } = await supabase
            .from('policy_terms')
            .update({
                source_dec_page_id: decPageId,
                approved_at: now,
                approved_by: user?.id || null,
                effective_date: dp.policy_period_start || undefined,
                expiration_date: dp.policy_period_end || undefined,
                date_issued: dp.date_issued || undefined,
                deductible: dp.deductible || undefined,
                limit_dwelling: dp.limit_dwelling || undefined,
                limit_other_structures: dp.limit_other_structures || undefined,
                limit_personal_property: dp.limit_personal_property || undefined,
                limit_fair_rental_value: dp.limit_fair_rental_value || undefined,
                limit_ordinance_or_law: dp.limit_ordinance_or_law || undefined,
                limit_debris_removal: dp.limit_debris_removal || undefined,
                limit_extended_dwelling_coverage: dp.limit_extended_dwelling_coverage || undefined,
                limit_dwelling_replacement_cost: dp.limit_dwelling_replacement_cost || undefined,
                limit_inflation_guard: dp.limit_inflation_guard || undefined,
                limit_personal_property_replacement_cost: dp.limit_personal_property_replacement_cost || undefined,
                broker_name: dp.broker_name || undefined,
                broker_address: dp.broker_address || undefined,
                broker_phone: dp.broker_phone_number || undefined,
                mortgagee_1_name: dp.mortgagee_1_name || undefined,
                mortgagee_1_address: dp.mortgagee_1_address || undefined,
                mortgagee_1_code: dp.mortgagee_1_code || undefined,
                mortgagee_1_loan_number: dp.mortgagee_1_loan_number || undefined,
                mortgagee_2_name: dp.mortgagee_2_name || undefined,
                mortgagee_2_address: dp.mortgagee_2_address || undefined,
                mortgagee_2_code: dp.mortgagee_2_code || undefined,
                mortgagee_2_loan_number: dp.mortgagee_2_loan_number || undefined,
                property_location: dp.property_location || undefined,
                year_built: dp.year_built || undefined,
                occupancy: dp.occupancy || undefined,
                number_of_units: dp.number_of_units || undefined,
                construction_type: dp.construction_type || undefined,
                cb_fire_lightning_smoke_damage: dp.cb_fire_lightning_smoke_damage || undefined,
                cb_extended_coverages: dp.cb_extended_coverages || undefined,
                cb_vandalism_malicious_mischief: dp.cb_vandalism_malicious_mischief || undefined,
                annual_premium: dp.total_annual_premium
                    ? parseFloat(dp.total_annual_premium.replace(/[$,]/g, '').trim()) || undefined
                    : undefined,
                updated_at: now,
            })
            .eq('id', termId);

        if (updateErr) {
            logger.error('API', 'Error promoting dec page to term', { message: updateErr.message });
            return false;
        }

        // 5. Mark this dec page as approved, supersede others
        await supabase
            .from('dec_pages')
            .update({ review_status: 'superseded' })
            .eq('policy_id', policyId)
            .eq('review_status', 'approved')
            .neq('id', decPageId);

        // Look up client_id from the policy so we can link fully
        const { data: policyRow } = await supabase
            .from('policies')
            .select('client_id')
            .eq('id', policyId)
            .single();

        await supabase
            .from('dec_pages')
            .update({
                review_status: 'approved',
                policy_id: policyId,
                client_id: policyRow?.client_id || null,
                policy_term_id: termId,
            })
            .eq('id', decPageId);

        logger.info('API', `Dec page ${decPageId} approved for policy ${policyId}`);
        return true;
    } catch (err) {
        logger.error('API', 'Error in approveDecPage', { error: String(err) });
        return false;
    }
}

export async function deleteDocument(id: string, source: 'dec_page' | 'platform'): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return false;

    try {
        const response = await fetch('/api/documents/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ id, source }),
        });

        const result = await response.json();
        return result.success;
    } catch (e) {
        logger.error('API', 'Error in deleteDocument', { error: String(e) });
        return false;
    }
}

/**
 * Reassign a platform document (e.g. RCE) from its current policy to a new one.
 * This cleans up old extracted data, enrichments, and policy_terms writebacks
 * from the previous policy before re-queuing for processing on the new target.
 */
export async function reassignDocument(documentId: string, newPolicyId: string): Promise<{ success: boolean; message?: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { success: false, message: 'Not authenticated' };

    try {
        const response = await fetch('/api/documents/reassign', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ documentId, newPolicyId }),
        });

        return await response.json();
    } catch (e) {
        logger.error('API', 'Error in reassignDocument', { error: String(e) });
        return { success: false, message: 'Network error' };
    }
}

// ---------------------------------------------------------------------------
// Update Helpers (Edit MVP)
// ---------------------------------------------------------------------------

/**
 * Update a client record. Only sends the fields provided.
 */
export async function updateClient(
    clientId: string,
    fields: Partial<Pick<ClientRow, 'named_insured' | 'insured_type' | 'email' | 'phone' | 'mailing_address_raw'>>
): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('clients')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', clientId);

        if (error) {
            logger.error('API', `Error updating client ${clientId}`, { message: error.message });
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('API', `Unexpected error updating client ${clientId}`, { error: msg });
        return { success: false, error: msg };
    }
}

/**
 * Update a policy header record.
 */
export async function updatePolicy(
    policyId: string,
    fields: Partial<Pick<PolicyRow, 'policy_number' | 'carrier_name' | 'property_address_raw' | 'status'>>
): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('policies')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', policyId);

        if (error) {
            logger.error('API', `Error updating policy ${policyId}`, { message: error.message });
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('API', `Unexpected error updating policy ${policyId}`, { error: msg });
        return { success: false, error: msg };
    }
}

/**
 * Update a policy term record (typically the is_current=true term).
 */
export async function updatePolicyTerm(
    termId: string,
    fields: Partial<Omit<PolicyTermRow, 'id' | 'policy_id' | 'created_at' | 'updated_at' | 'import_batch_id'>>
): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('policy_terms')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', termId);

        if (error) {
            logger.error('API', `Error updating policy_term ${termId}`, { message: error.message });
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('API', `Unexpected error updating policy_term ${termId}`, { error: msg });
        return { success: false, error: msg };
    }
}

// ------------------------------------------------------------------
// Flag Definitions
// ------------------------------------------------------------------

/**
 * Fetch all flag definitions from the catalog.
 */
export async function fetchAllFlagDefinitions(): Promise<FlagDefinition[]> {
    try {
        const { data, error } = await supabase
            .from('flag_definitions')
            .select('*')
            .order('category', { ascending: true })
            .order('code', { ascending: true });

        if (error) {
            logger.error('API', 'Error fetching flag definitions', { message: error.message });
            return [];
        }

        return (data as FlagDefinition[]) || [];
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('API', 'Unexpected error fetching flag definitions', { error: msg });
        return [];
    }
}


/**
 * Update a flag definition by code. Admin-only operation.
 * Only allows updating editable columns (not code or entity_scope).
 */
export async function updateFlagDefinition(
    code: string,
    updates: Partial<Pick<FlagDefinition,
        'label' | 'description' | 'default_severity' | 'category' |
        'auto_resolve' | 'is_manual_allowed' | 'is_active' |
        'trigger_logic' | 'data_fields_checked' | 'dec_page_section' |
        'suppression_rules' | 'notes' | 'report_enabled' | 'report_prompt_hint'
    >>
): Promise<FlagDefinition | null> {
    try {
        const { data, error } = await supabase
            .from('flag_definitions')
            .update(updates)
            .eq('code', code)
            .select('*')
            .single();

        if (error) {
            logger.error('API', 'Error updating flag definition', { code, message: error.message });
            return null;
        }

        // CASCADE: Update all existing occurrences of this flag
        const flagUpdates: Record<string, unknown> = {};
        if (updates.default_severity !== undefined) flagUpdates.severity = updates.default_severity;
        if (updates.label !== undefined) flagUpdates.title = updates.label;
        if (updates.description !== undefined) flagUpdates.message = updates.description;

        if (Object.keys(flagUpdates).length > 0) {
            const { error: cascadeError } = await supabase
                .from('policy_flags')
                .update(flagUpdates)
                .eq('code', code);
            
            if (cascadeError) {
                logger.error('API', 'Error cascading flag definition updates to policy_flags', { code, error: cascadeError.message });
            }
        }

        return data as FlagDefinition;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('API', 'Unexpected error updating flag definition', { code, error: msg });
        return null;
    }
}


// ------------------------------------------------------------------
// Property Enrichments (Source-Tracked Data)
// ------------------------------------------------------------------

export interface PropertyEnrichment {
    id: string;
    policy_id: string;
    field_key: string;
    field_value: string | null;
    source_name: string;
    source_type: 'api' | 'public_data' | 'parser' | 'premium' | 'ai_interpretation';
    source_url: string | null;
    confidence: 'high' | 'medium' | 'low';
    fetched_at: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Fetch all property enrichments for a policy.
 * Returns source-attributed data points (images, property data, etc.)
 */
export async function getPropertyEnrichments(policyId: string): Promise<PropertyEnrichment[]> {
    try {
        const { data, error } = await supabase
            .from('property_enrichments')
            .select('*')
            .eq('policy_id', policyId)
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('API', 'Error fetching property enrichments', { policyId, message: error.message });
            return [];
        }

        return (data as PropertyEnrichment[]) || [];
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('API', 'Unexpected error fetching enrichments', { policyId, error: msg });
        return [];
    }
}


// ------------------------------------------------------------------
// On-Demand Property Enrichment
// ------------------------------------------------------------------

export interface EnrichmentRunResult {
    message: string;
    results: {
        satellite_image: boolean;
        coordinates: boolean;
        fire_risk: boolean;
        vision_analysis: boolean;
        address_used: string;
    };
    error?: string;
}

/**
 * Trigger on-demand property enrichment for a specific policy.
 * Calls the server-side API route which runs satellite imagery,
 * geocoding, and fire risk enrichment directly.
 */
export async function runPropertyEnrichment(policyId: string): Promise<EnrichmentRunResult> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        throw new Error('No active session — please sign in to run enrichment.');
    }

    const res = await fetch('/api/enrichment/run', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ policy_id: policyId }),
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || data.message || 'Enrichment failed');
    }
    return data as EnrichmentRunResult;
}

/**
 * Generate an AI coverage report for a policy.
 * Calls /api/reports/generate with proper authentication.
 */
export async function generatePolicyReport(policyId: string): Promise<{ report?: { id: string }; error?: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ policyId }),
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { error: errData.message || errData.error || `Report generation failed (${res.status})` };
    }
    return await res.json();
}
// ---------------------------------------------------------------------------
// Policy Reports (v1)
// ---------------------------------------------------------------------------

/**
 * Fetch a specific generated policy report by its ID.
 */
export async function getReportById(reportId: string): Promise<PolicyReportRow | undefined> {
    try {
        const { data, error } = await supabase
            .from('policy_reports')
            .select('*')
            .eq('id', reportId)
            .single();

        if (error || !data) {
            logger.error('API', `Error fetching report ${reportId}`, { message: error?.message });
            return undefined;
        }

        return data as PolicyReportRow;
    } catch (err) {
        logger.error('API', `Unexpected error fetching report ${reportId}`, {
            error: err instanceof Error ? err.message : String(err),
        });
        return undefined;
    }
}

/**
 * Fetch the most recently generated report for a specific policy.
 */
export async function getLatestReportForPolicy(policyId: string): Promise<PolicyReportRow | undefined> {
    try {
        const { data, error } = await supabase
            .from('policy_reports')
            .select('*')
            .eq('policy_id', policyId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) {
            // It's normal for a policy to not have a report yet.
            return undefined;
        }

        return data as PolicyReportRow;
    } catch (err) {
        logger.warn('API', `Could not fetch latest report for policy ${policyId}`);
        return undefined;
    }
}

/**
 * Upload a Dec Page file directly to an existing policy.
 */
export async function uploadDecPageToPolicy(policyId: string, file: File): Promise<{ success: boolean; error?: string; storagePath?: string }> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
            return { success: false, error: 'Authentication required.' };
        }

        const accountId = session.user.id;
        const submitId = crypto.randomUUID();
        const extension = file.name.split('.').pop() || 'pdf';
        const storagePath = `submissions/${accountId}/${submitId}.${extension}`;

        // 1. Upload to storage
        const { error: uploadError } = await supabase.storage
            .from('cfp-raw-decpage')
            .upload(storagePath, file, { contentType: file.type });

        if (uploadError) {
            logger.error('API', 'Storage upload failed', { message: uploadError.message });
            return { success: false, error: 'Failed to upload file to storage.' };
        }

        // 2. Insert into dec_page_submissions so fetchDecPageFilesByPolicyId finds it
        const { data: subData, error: subError } = await supabase
            .from('dec_page_submissions')
            .insert({
                id: submitId,
                account_id: accountId,
                status: 'processed', // Skip AI ingestion
                storage_path: storagePath,
                file_path: storagePath,
                file_name: file.name,
                file_size: file.size,
                file_type: file.type,
                bucket: 'cfp-raw-decpage',
            })
            .select('id')
            .single();

        if (subError || !subData) {
            logger.error('API', 'Failed to link file to submissions', { message: subError?.message });
            return { success: false, error: 'Uploaded, but failed to link submission.' };
        }

        // 3. Insert into dec_pages to link to policy
        const { error: linkError } = await supabase
            .from('dec_pages')
            .insert({
                policy_id: policyId,
                submission_id: subData.id,
                parse_status: 'manual',
            });

        if (linkError) {
            logger.error('API', 'Failed to link dec_page to policy', { message: linkError.message });
            return { success: false, error: 'Uploaded, but failed to link to policy.' };
        }

        return { success: true, storagePath };
    } catch (err) {
        logger.error('API', 'Unexpected error uploading dec page', { error: err instanceof Error ? err.message : String(err) });
        return { success: false, error: 'Unexpected error occurred.' };
    }
}

// ─── Manual Data Overrides (Inline Editing) ───

export interface ManualOverride {
    id: string;
    policy_id: string;
    field_name: string;
    new_value: string;
    original_value?: string | null;
    actor_id?: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Fetch all manual overrides for a specific policy.
 */
export async function getManualOverridesForPolicy(policyId: string): Promise<Record<string, string>> {
    try {
        const { data, error } = await supabase
            .from('manual_overrides')
            .select('*')
            .eq('policy_id', policyId);

        if (error) {
            logger.error('API', 'Error fetching manual overrides', { error: error.message });
            return {};
        }

        const map: Record<string, string> = {};
        data?.forEach((row: ManualOverride) => {
            map[row.field_name] = row.new_value;
        });
        return map;
    } catch (e) {
        return {};
    }
}

/**
 * Upsert a manual override to correct AI parsed data.
 */
export async function upsertManualOverride(
    policyId: string,
    fieldName: string,
    newValue: string,
    originalValue?: string
): Promise<{ success: boolean; data?: ManualOverride; error?: string }> {
    try {
        const { data: user } = await supabase.auth.getUser();
        const actorId = user?.user?.id;

        // Upsert the main override record
        const { data, error } = await supabase
            .from('manual_overrides')
            .upsert(
                {
                    policy_id: policyId,
                    field_name: fieldName,
                    new_value: newValue,
                    original_value: originalValue || null,
                    actor_id: actorId || null,
                },
                { onConflict: 'policy_id, field_name' }
            )
            .select()
            .single();

        if (error) throw error;

        // Write to the append-only log table for full audit history
        await supabase.from('manual_override_logs').insert({
            policy_id: policyId,
            field_name: fieldName,
            changed_from: originalValue || null,
            changed_to: newValue,
            actor_id: actorId || null,
        });

        return { success: true, data };
    } catch (e: any) {
        logger.error('API', 'Failed to upsert manual override', { error: e.message });
        return { success: false, error: e.message };
    }
}

/**
 * Bulk update policy statuses (e.g. mark multiple as reviewed)
 */
export async function bulkUpdatePolicyStatus(policyIds: string[], status: string): Promise<boolean> {
    if (!policyIds.length) return false;
    try {
        const { error } = await supabase
            .from('policies')
            .update({ status })
            .in('id', policyIds);
            
        if (error) throw error;
        return true;
    } catch (e) {
        logger.error('API', 'Failed to bulk update status', { policyIds, status, error: e instanceof Error ? e.message : String(e) });
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// RCE Document Data (doc_data_rce)
// ═══════════════════════════════════════════════════════════════════════

export interface RceDocData {
    id: string;
    document_id: string;
    valuation_id: string | null;
    date_entered: string | null;
    date_calculated: string | null;
    created_by: string | null;
    stories: string | null;
    use_type: string | null;
    style: string | null;
    sq_feet: number | null;
    year_built: string | null;
    quality_grade: string | null;
    site_access: string | null;
    cost_per_sqft: number | null;
    foundation_shape: string | null;
    foundation_material: string | null;
    foundation_type: string | null;
    property_slope: string | null;
    roof_year: string | null;
    roof_cover: string | null;
    roof_shape: string | null;
    roof_construction: string | null;
    wall_finish: string | null;
    wall_construction: string | null;
    num_dormers: string | null;
    avg_wall_height: string | null;
    floor_coverings: string | null;
    ceiling_finish: string | null;
    interior_wall_material: string | null;
    interior_wall_finish: string | null;
    rooms: unknown;
    garage_info: unknown;
    porch_info: unknown;
    heating: string | null;
    air_conditioning: string | null;
    fireplace_info: unknown;
    home_features: unknown;
    replacement_cost: number | null;
    replacement_range_low: number | null;
    replacement_range_high: number | null;
    actual_cash_value: number | null;
    acv_age: string | null;
    acv_condition: string | null;
    cost_breakdown: unknown;
    created_at: string;
    // Joined from platform_documents
    file_name?: string;
    extracted_owner_name?: string;
    extracted_address?: string;
    // ── American Modern / Cotality RCT Express fields ──
    source?: string;
    estimate_number?: string;
    effective_date?: string;
    renewal_date?: string;
    estimate_expiration_date?: string;
    insured_name?: string;
    property_address?: string;
    construction_type?: string;
    finished_floor_area?: number;
    num_families?: number;
    perimeter?: string;
    wall_height?: string;
    coverage_a_without_debris?: number;
    coverage_a_debris_removal?: number;
    coverage_a_with_debris?: number;
    coverage_b_without_debris?: number;
    coverage_b_debris_removal?: number;
    coverage_b_with_debris?: number;
    coverage_b_pct_of_a?: number;
    cost_data_as_of?: string;
    latitude?: number;
    longitude?: number;
    coordinates_source?: string;
    detailed_cost_breakdown?: unknown;
    materials_detail?: unknown;
    exterior_features?: unknown;
    interior_features?: unknown;
    kitchens_baths?: unknown;
    electrical?: unknown;
    fire_protection?: unknown;
}

/**
 * Fetch full RCE extracted data for a policy via its linked platform_documents.
 * Returns the doc_data_rce rows joined with document metadata.
 */
export async function fetchRceDocDataByPolicyId(policyId: string): Promise<RceDocData[]> {
    try {
        // Step 1: Find RCE documents linked to this policy
        const { data: docs, error: docError } = await supabase
            .from('platform_documents')
            .select('id, file_name, extracted_owner_name, extracted_address')
            .eq('policy_id', policyId)
            .eq('doc_type', 'rce')
            .not('parse_status', 'eq', 'failed');

        if (docError || !docs || docs.length === 0) {
            return [];
        }

        // Step 2: Fetch doc_data_rce for those document IDs
        const docIds = docs.map(d => d.id);
        const { data: rceRows, error: rceError } = await supabase
            .from('doc_data_rce')
            .select('*')
            .in('document_id', docIds)
            .order('created_at', { ascending: false });

        if (rceError || !rceRows || rceRows.length === 0) {
            return [];
        }

        // Step 3: Merge document metadata into RCE rows
        const docMap = new Map(docs.map(d => [d.id, d]));
        return rceRows.map(row => {
            const doc = docMap.get(row.document_id);
            return {
                ...row,
                file_name: doc?.file_name,
                extracted_owner_name: doc?.extracted_owner_name,
                extracted_address: doc?.extracted_address,
            } as RceDocData;
        });
    } catch (err) {
        logger.error('API', 'Failed to fetch RCE doc data', {
            policyId,
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

// ---------------------------------------------------------------------------
// DIC Document Data (from doc_data_dic)
// ---------------------------------------------------------------------------

export interface DicDocData {
    id: string;
    document_id: string;
    carrier_name: string | null;
    policy_number: string | null;
    policy_form: string | null;
    effective_date: string | null;
    expiration_date: string | null;
    notice_date: string | null;
    document_type: string | null;
    insured_name: string | null;
    secondary_insured: string | null;
    mailing_address: string | null;
    property_address: string | null;
    broker_name: string | null;
    broker_address: string | null;
    broker_phone: string | null;
    has_mortgagee: boolean;
    deductible: string | null;
    cov_a_dwelling: string | null;
    cov_b_other_struct: string | null;
    cov_c_personal_prop: string | null;
    cov_e_add_living: string | null;
    cov_l_liability: string | null;
    cov_m_medical: string | null;
    ordinance_or_law: string | null;
    extended_repl_cost: string | null;
    sewer_backup: string | null;
    has_dic_endorsement: boolean;
    dic_form_number: string | null;
    dic_eliminates_fire: boolean;
    requires_fair_plan: boolean;
    basic_premium: number | null;
    optional_premium: number | null;
    credits: number | null;
    surcharges: number | null;
    total_charge: number | null;
    rce_estimate_number: string | null;
    rce_replacement_cost: number | null;
    rce_insured_value: number | null;
    rce_year_built: number | null;
    rce_living_area: number | null;
    rce_quality_grade: string | null;
    forms_endorsements: unknown;
    extracted_json: unknown;
    created_at: string;
    // Joined from platform_documents
    file_name?: string;
    extracted_owner_name?: string;
    extracted_address?: string;
}

/**
 * Fetch full DIC extracted data for a policy via its linked platform_documents.
 * Returns the doc_data_dic rows joined with document metadata.
 */
export async function fetchDicDocDataByPolicyId(policyId: string): Promise<DicDocData[]> {
    try {
        // Step 1: Find DIC documents linked to this policy
        const { data: docs, error: docError } = await supabase
            .from('platform_documents')
            .select('id, file_name, extracted_owner_name, extracted_address')
            .eq('policy_id', policyId)
            .eq('doc_type', 'dic_dec_page')
            .not('parse_status', 'eq', 'failed');

        if (docError || !docs || docs.length === 0) {
            return [];
        }

        // Step 2: Fetch doc_data_dic for those document IDs
        const docIds = docs.map(d => d.id);
        const { data: dicRows, error: dicError } = await supabase
            .from('doc_data_dic')
            .select('*')
            .in('document_id', docIds)
            .order('created_at', { ascending: false });

        if (dicError || !dicRows || dicRows.length === 0) {
            return [];
        }

        // Step 3: Merge document metadata into DIC rows
        const docMap = new Map(docs.map(d => [d.id, d]));
        return dicRows.map(row => {
            const doc = docMap.get(row.document_id);
            return {
                ...row,
                file_name: doc?.file_name,
                extracted_owner_name: doc?.extracted_owner_name,
                extracted_address: doc?.extracted_address,
            } as DicDocData;
        });
    } catch (err) {
        logger.error('API', 'Failed to fetch DIC doc data', {
            policyId,
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

// ---------------------------------------------------------------------------
// DIC Carrier Quoting Eligibility
// ---------------------------------------------------------------------------

export interface DicCarrierEligibility {
    dic_bamboo_eligible: boolean;
    dic_aegis_eligible: boolean;
    dic_psic_eligible: boolean;
}

/**
 * Fetch DIC Carrier Quoting Eligibility toggles for a policy.
 * Defaults to true for all carriers if not specified or column missing.
 */
export async function fetchDicCarrierEligibility(policyId: string): Promise<DicCarrierEligibility> {
    try {
        const { data, error } = await supabase
            .from('policies')
            .select('dic_bamboo_eligible, dic_aegis_eligible, dic_psic_eligible')
            .eq('id', policyId)
            .maybeSingle();

        if (error || !data) {
            return { dic_bamboo_eligible: true, dic_aegis_eligible: true, dic_psic_eligible: true };
        }

        return {
            dic_bamboo_eligible: data.dic_bamboo_eligible ?? true,
            dic_aegis_eligible: data.dic_aegis_eligible ?? true,
            dic_psic_eligible: data.dic_psic_eligible ?? true,
        };
    } catch {
        return { dic_bamboo_eligible: true, dic_aegis_eligible: true, dic_psic_eligible: true };
    }
}

/**
 * Update DIC Carrier Quoting Eligibility toggles for a policy.
 */
export async function updateDicCarrierEligibility(
    policyId: string,
    eligibility: Partial<DicCarrierEligibility>
): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('policies')
            .update(eligibility)
            .eq('id', policyId);

        if (error) {
            logger.error('API', 'Failed to update DIC carrier eligibility', { policyId, error: error.message });
            return false;
        }
        return true;
    } catch (err) {
        logger.error('API', 'Unexpected error updating DIC carrier eligibility', {
            policyId,
            error: err instanceof Error ? err.message : String(err),
        });
        return false;
    }
}

// ---------------------------------------------------------------------------
// Renewal Email Tracking
// ---------------------------------------------------------------------------

export interface RenewalEmailLogEntry {
    id: string;
    policy_id: string;
    client_id?: string | null;
    template_id: string;
    template_name: string;
    marked_sent_by?: string | null;
    sent_at: string;
    notes?: string | null;
    created_at: string;
}

/**
 * Fetch the renewal email log for a given policy.
 * Returns entries sorted by sent_at DESC (most recent first).
 */
export async function fetchRenewalEmailLog(policyId: string): Promise<RenewalEmailLogEntry[]> {
    try {
        const { data, error } = await supabase
            .from('renewal_email_log')
            .select('*')
            .eq('policy_id', policyId)
            .order('sent_at', { ascending: false });

        if (!error && data) {
            return data as RenewalEmailLogEntry[];
        }

        // Fallback: query activity_events table
        const { data: actData } = await supabase
            .from('activity_events')
            .select('*')
            .eq('policy_id', policyId)
            .eq('event_type', 'email.marked_sent')
            .order('created_at', { ascending: false });

        if (actData && actData.length > 0) {
            return actData.map((a: any) => ({
                id: a.id,
                policy_id: a.policy_id,
                client_id: a.client_id,
                template_id: a.meta?.template_id || 'rce_verification',
                template_name: a.meta?.template_name || 'Renewal Review',
                sent_at: a.created_at,
                created_at: a.created_at,
            }));
        }

        return [];
    } catch (err) {
        logger.error('API', 'Unexpected error fetching renewal email log', {
            policyId,
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

// ---------------------------------------------------------------------------
// Flag Report Settings — Batch Update & Config Version
// ---------------------------------------------------------------------------

export interface FlagReportSettingsUpdate {
    code: string;
    report_enabled: boolean;
    report_prompt_hint: string | null;
}

/**
 * Batch-update report_enabled and report_prompt_hint for multiple flag definitions.
 * Also inserts a changelog entry so stale reports can be detected.
 */
export async function batchUpdateFlagReportSettings(
    updates: FlagReportSettingsUpdate[]
): Promise<{ success: boolean; error?: string }> {
    try {
        // Update each flag definition
        for (const u of updates) {
            const { error } = await supabase
                .from('flag_definitions')
                .update({
                    report_enabled: u.report_enabled,
                    report_prompt_hint: u.report_prompt_hint,
                })
                .eq('code', u.code);

            if (error) {
                logger.error('API', 'Error updating flag report settings', { code: u.code, message: error.message });
                return { success: false, error: `Failed to update ${u.code}: ${error.message}` };
            }
        }

        // Insert changelog entry for stale report detection
        const { data: latestVersion } = await supabase
            .from('report_config_changelog')
            .select('version_number')
            .order('version_number', { ascending: false })
            .limit(1)
            .single();

        const nextVersion = (latestVersion?.version_number || 0) + 1;

        await supabase.from('report_config_changelog').insert({
            version_number: nextVersion,
            changes: {
                event: 'flag_report_settings_updated',
                flags_changed: updates.map(u => u.code),
                count: updates.length,
            },
        });

        return { success: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('API', 'Unexpected error in batchUpdateFlagReportSettings', { error: msg });
        return { success: false, error: msg };
    }
}

/**
 * Get the latest report config changelog entry (for stale report detection).
 */
export async function getLatestReportConfigVersion(): Promise<{
    version_number: number;
    changed_at: string;
} | null> {
    try {
        const { data, error } = await supabase
            .from('report_config_changelog')
            .select('version_number, changed_at')
            .order('changed_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) return null;
        return data;
    } catch {
        return null;
    }
}

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
 * Fetch the active report template configuration from /api/reports/config
 */
export async function fetchReportTemplateConfig(): Promise<ReportTemplateConfig | null> {
    try {
        const res = await fetch('/api/reports/config');
        if (!res.ok) return null;
        const data = await res.json();
        return data.config || null;
    } catch (err) {
        logger.error('API', 'Failed to fetch report template config', { error: err instanceof Error ? err.message : String(err) });
        return null;
    }
}

/**
 * Save report template configuration to /api/reports/config
 */
export async function saveReportTemplateConfig(config: ReportTemplateConfig): Promise<{ success: boolean; config?: ReportTemplateConfig; error?: string }> {
    try {
        const res = await fetch('/api/reports/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            return { success: false, error: data.error || 'Failed to save report configuration' };
        }
        return { success: true, config: data.config };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('API', 'Failed to save report template config', { error: msg });
        return { success: false, error: msg };
    }
}

