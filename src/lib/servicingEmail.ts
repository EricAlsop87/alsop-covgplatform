import { supabase } from './supabaseClient';

export type ServicingStatus = 'ready' | 'emailed_to_agent' | 'completed' | 'will_not_proceed';

export interface ServicingEmailPayload {
    status: ServicingStatus;
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
    assigned_agent: string;
    notes: string;
    va_completed_at: string;
    va_user_name: string | null;
    emailed_at: string | null;
    completed_at: string | null;
    
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
