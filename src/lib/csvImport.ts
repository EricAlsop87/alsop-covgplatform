/**
 * CSV Import — shared types and client-side fetch helpers.
 * NOTE: No 'use client' — this module is used by both server API routes and client components.
 */

/**
 * CSV Import — shared types and client-side fetch helpers.
 */

// ---------------------------------------------------------------------------
// Header alias map (case-insensitive)
// ---------------------------------------------------------------------------

export const HEADER_ALIASES: Record<string, string> = {
    // Policy number
    'policy no': 'policy_number',
    'policyno': 'policy_number',
    'policy number': 'policy_number',
    'policynumber': 'policy_number',
    'policy #': 'policy_number',
    'policy_no': 'policy_number',
    // Insured
    'insured name': 'insured_name',
    'insuredname': 'insured_name',
    'named insured': 'insured_name',
    'insured_name': 'insured_name',
    // Dates
    'eff date': 'effective_date',
    'effdate': 'effective_date',
    'effective date': 'effective_date',
    'eff_date': 'effective_date',
    'exp date': 'expiration_date',
    'expdate': 'expiration_date',
    'expiration date': 'expiration_date',
    'exp_date': 'expiration_date',
    // Line of business
    'line': 'line',
    // Status / Activity
    'status': 'carrier_status',
    'policy activity': 'policy_activity',
    'policyactivity': 'policy_activity',
    'policy active': 'policy_activity',
    'policyactive': 'policy_activity',
    'policy_activity': 'policy_activity',
    // Premium / Payment
    'premium': 'annual_premium',
    'annual premium': 'annual_premium',
    'paid': 'payment_status',
    'payment plan': 'payment_plan',
    'paymentplan': 'payment_plan',
    'payment_plan': 'payment_plan',
    'cancellation reason': 'cancellation_reason',
    'cancellationreason': 'cancellation_reason',
    'cancellation_reason': 'cancellation_reason',
    // Notes
    'notes': 'notes',
    'dic notes': 'dic_notes',
    'dicnotes': 'dic_notes',
    'dic_notes': 'dic_notes',
    // Misc
    'dic exists': 'dic_exists',
    'dicexists': 'dic_exists',
    'dic_exists': 'dic_exists',
    'sold by': 'sold_by',
    'soldby': 'sold_by',
    'sold_by': 'sold_by',
    'office': 'office',
    'reason': 'reason',
    'activity': 'activity',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RowStatus = 'valid' | 'invalid' | 'duplicate' | 'name_mismatch';

export interface ImportRow {
    /** 0-based row index in the CSV */
    row_index: number;
    status: RowStatus;
    errors: string[];
    /** Raw values keyed by normalized field name */
    raw: Record<string, string>;
    /** Normalized values */
    policy_number: string;
    insured_name: string;
    effective_date: string | null;
    expiration_date: string | null;
    annual_premium: number | null;
    carrier_status: string | null;
    policy_activity: string | null;
    payment_status: string | null;
    payment_plan: string | null;
    cancellation_reason: string | null;
    notes: string | null;
    dic_exists: boolean;
    dic_notes: string | null;
    sold_by: string | null;
    office: string | null;
    reason: string | null;
    activity: string | null;
    line: string | null;
    /** Set when an existing policy has a different insured name */
    existing_insured_name?: string | null;
}

export interface ImportStats {
    total: number;
    valid: number;
    invalid: number;
    duplicate: number;
    name_mismatch: number;
}

export interface ParseResult {
    success: boolean;
    batch_id: string;
    stats: ImportStats;
    rows: ImportRow[];
    /** How many rows are included in this response (may be truncated) */
    rows_preview_count?: number;
    /** Total rows parsed (may be larger than rows.length) */
    rows_total_count?: number;
    error?: string;
}

export interface CommitResult {
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
    flags_created?: number;
    new_clients_created?: number;
    terms_created?: number;
    terms_updated?: number;
}

// ---------------------------------------------------------------------------
// Fetch helpers (client-side)
// ---------------------------------------------------------------------------

export async function parseCSVFile(file: File, token: string): Promise<ParseResult> {
    const form = new FormData();
    form.append('file', file);

    const res = await fetch('/api/csv-import/parse', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });

    return res.json();
}

export async function commitImport(batchId: string, token: string): Promise<CommitResult> {
    const res = await fetch('/api/csv-import/commit', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchId }),
    });

    return res.json();
}

// ---------------------------------------------------------------------------
// Progress polling
// ---------------------------------------------------------------------------

export interface BatchProgress {
    progress_pct: number;
    progress_message: string;
    status: string;
}

export async function pollBatchProgress(batchId: string, token: string): Promise<BatchProgress> {
    const res = await fetch(`/api/csv-import/progress?batchId=${encodeURIComponent(batchId)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
}

// ---------------------------------------------------------------------------
// Batch flag re-evaluation
// ---------------------------------------------------------------------------

export interface BatchEvalResult {
    success: boolean;
    total_policies?: number;
    evaluated?: number;
    stale_flags_deleted?: number;
    flags_created?: number;
    flags_refreshed?: number;
    flags_resolved?: number;
    message?: string;
    error?: string;
}

export async function batchReEvaluateFlags(batchId: string, token: string): Promise<BatchEvalResult> {
    const res = await fetch('/api/flags/batch-evaluate', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batch_id: batchId }),
    });
    return res.json();
}
