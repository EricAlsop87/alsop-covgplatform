import { supabase } from './supabaseClient';

export type ServicingStatus = 'ready' | 'emailed_to_agent' | 'email_not_needed' | 'completed' | 'will_not_proceed';

export type ServicingOutcome =
    | 'renewed'
    | 'cancelled'
    | 'requested_changes'
    | 'new_policy';

export interface OutcomeOption {
    id: ServicingOutcome;
    label: string;
    shortLabel: string;
    description: string;
    badgeBg: string;
    badgeColor: string;
    badgeBorder: string;
    btnBg: string;
    btnColor: string;
    btnBorder: string;
    btnHoverBg: string;
    btnHoverColor: string;
}

export const SERVICING_OUTCOMES: OutcomeOption[] = [
    {
        id: 'renewed',
        label: 'Insurance Renewed',
        shortLabel: 'Renewed',
        description: 'Renewal completed and bound with carrier',
        badgeBg: '#dcfce7',
        badgeColor: '#15803d',
        badgeBorder: '#86efac',
        btnBg: '#ecfdf5',
        btnColor: '#059669',
        btnBorder: '#a7f3d0',
        btnHoverBg: '#059669',
        btnHoverColor: '#ffffff',
    },
    {
        id: 'cancelled',
        label: 'Insurance Cancelled',
        shortLabel: 'Cancelled',
        description: 'Insured declined / will not proceed / cancelled',
        badgeBg: '#fee2e2',
        badgeColor: '#b91c1c',
        badgeBorder: '#fca5a5',
        btnBg: '#fef2f2',
        btnColor: '#dc2626',
        btnBorder: '#fecaca',
        btnHoverBg: '#dc2626',
        btnHoverColor: '#ffffff',
    },
    {
        id: 'requested_changes',
        label: 'Request Change',
        shortLabel: 'Request Change',
        description: 'Insured or agent requested coverage or limit changes',
        badgeBg: '#fef3c7',
        badgeColor: '#b45309',
        badgeBorder: '#fde68a',
        btnBg: '#fffbeb',
        btnColor: '#d97706',
        btnBorder: '#fde68a',
        btnHoverBg: '#d97706',
        btnHoverColor: '#ffffff',
    },
    {
        id: 'new_policy',
        label: 'Request New Policy',
        shortLabel: 'Request New Policy',
        description: 'Rewritten or written as new policy',
        badgeBg: '#ede9fe',
        badgeColor: '#6d28d9',
        badgeBorder: '#ddd6fe',
        btnBg: '#f5f3ff',
        btnColor: '#7c3aed',
        btnBorder: '#ddd6fe',
        btnHoverBg: '#7c3aed',
        btnHoverColor: '#ffffff',
    },
];

export interface ServicingEmailPayload {
    status: ServicingStatus;
    outcome?: ServicingOutcome | null;
    assigned_agent?: string;
    notes?: string;
    va_completed_at?: string;
    va_user_name?: string;
    emailed_at?: string | null;
    completed_at?: string | null;
}

export interface ServicingEmailItem {
    policy_id: string;
    policy_number: string;
    client_id: string;
    named_insured: string;
    property_address: string;
    carrier_name: string;
    effective_date: string | null;
    expiration_date: string | null;
    status: ServicingStatus;
    outcome?: ServicingOutcome | null;
    assigned_agent: string;
    assigned_agent_email?: string | null;
    notes: string;
    va_completed_at: string;
    va_user_name: string | null;
    emailed_at: string | null;
    completed_at: string | null;
    has_agent_reply?: boolean;
    last_reply_at?: string | null;
    last_reply_text?: string | null;
    last_reply_from?: string | null;
    
    // Documents
    has_rce: boolean;
    rce_carrier: string | null;
    rce_storage_path?: string | null;
    rce_file_name?: string | null;
    has_dic: boolean;
    dic_carrier: string | null;
    dic_storage_path?: string | null;
    dic_file_name?: string | null;
    no_dic_available?: boolean;
    has_es: boolean;
    es_storage_path?: string | null;
    es_file_name?: string | null;
    has_dec?: boolean;
    dec_storage_path?: string | null;
    dec_file_name?: string | null;
}

export interface ServicingEmailResponse {
    openItems: ServicingEmailItem[];
    completedItems: ServicingEmailItem[];
    stats: {
        totalReady: number;
        totalEmailed: number;
        totalEmailNotNeeded: number;
        totalCompleted: number;
        totalWillNotProceed: number;
    };
}

/**
 * Fetch all items in the servicing email queue.
 */
export async function fetchServicingEmailData(): Promise<ServicingEmailResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch('/api/servicing-email', {
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch servicing email queue: ${res.statusText}`);
    }

    return res.json();
}

/**
 * Add / send a policy to the servicing email queue.
 */
export async function addToServicingEmail(policyId: string, notes?: string): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch('/api/servicing-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
            policy_id: policyId,
            notes: notes || '',
        }),
    });

    return res.ok;
}

/**
 * Update a servicing email queue item (status, assigned agent, notes).
 */
export async function updateServicingEmailItem(
    policyId: string,
    updates: Partial<ServicingEmailPayload>
): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch('/api/servicing-email', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
            policy_id: policyId,
            ...updates,
        }),
    });

    return res.ok;
}

/**
 * Remove a policy from the servicing email queue.
 */
export async function removeFromServicingEmail(policyId: string): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`/api/servicing-email?policy_id=${encodeURIComponent(policyId)}`, {
        method: 'DELETE',
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    return res.ok;
}

export interface ServicingReturnPayload {
    policy_id: string;
    reason: string;
    custom_notes?: string;
}

/**
 * Return a policy from Servicing Email back to CFP Summary / VA with a reason.
 */
export async function returnPolicyToVA(payload: ServicingReturnPayload): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch('/api/servicing-email/return', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
    });

    return res.ok;
}

