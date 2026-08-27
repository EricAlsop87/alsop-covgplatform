import { supabase } from './supabaseClient';

export type UserRole = 'admin' | 'service' | 'agent' | 'user' | 'customer';

export interface UserProfile {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    role: UserRole;
    created_at?: string;
}

/**
 * Fetch the current user's profile including their role.
 * Returns null if not authenticated or profile not found.
 */
export async function getUserProfile(): Promise<UserProfile | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (error || !data) return null;

    return {
        id: data.id,
        email: data.email || session.user.email || '',
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        phone: data.phone || '',
        role: data.role as UserRole,
        created_at: data.created_at || undefined,
    };
}

/**
 * Check if a role has access to the authenticated dashboard area.
 * Only 'admin' and 'service' roles can access the dashboard.
 */
export function canAccessDashboard(role: UserRole): boolean {
    return role === 'admin' || role === 'service';
}

/**
 * Check if a role has full admin access to all features.
 */
export function isAdmin(role: UserRole): boolean {
    return role === 'admin';
}
