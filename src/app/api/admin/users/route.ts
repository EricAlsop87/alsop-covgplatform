import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';

export interface StaffUser {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    role: 'admin' | 'service' | 'customer';
    is_active: boolean;
    created_at: string;
    updated_at: string;
    last_sign_in_at: string | null;
}

/**
 * GET /api/admin/users
 *
 * Retrieves all staff accounts (administrators and agents) along with
 * total counts for admins, agents, and self-registered clients.
 * ADMIN ONLY.
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await authenticateRequest(req, { requiredRole: ['admin'] });
        if (isAuthError(auth)) return auth;

        const supabase = getSupabaseAdmin();

        // 1. Fetch staff accounts (admin, service/agent)
        const { data: staffAccounts, error: staffError } = await supabase
            .from('accounts')
            .select('*')
            .in('role', ['admin', 'service', 'agent'])
            .order('created_at', { ascending: false });

        if (staffError) {
            logger.error('AdminUsers', 'Failed to fetch staff accounts', { error: staffError.message });
            return NextResponse.json({ error: staffError.message }, { status: 500 });
        }

        // 2. Count registered client accounts (customer role)
        const { count: clientCount, error: clientCountError } = await supabase
            .from('accounts')
            .select('id', { count: 'exact', head: true })
            .eq('role', 'customer');

        if (clientCountError) {
            logger.warn('AdminUsers', 'Failed to fetch client count', { error: clientCountError.message });
        }

        // 3. Fetch Auth user metadata to get exact last_sign_in_at and invited_at
        let authUsersMap = new Map<string, { last_sign_in_at: string | null; created_at: string }>();
        try {
            const { data: authData } = await supabase.auth.admin.listUsers();
            if (authData?.users) {
                for (const u of authData.users) {
                    authUsersMap.set(u.id, {
                        last_sign_in_at: u.last_sign_in_at || null,
                        created_at: u.created_at,
                    });
                }
            }
        } catch (authErr: any) {
            logger.warn('AdminUsers', 'Could not list auth users for last_sign_in timestamps', { error: authErr.message });
        }

        // 4. Enrich staff account objects
        const staff: StaffUser[] = (staffAccounts || []).map(acc => {
            const authInfo = authUsersMap.get(acc.id);
            // Normalize 'agent' to 'service' if present in legacy records
            const normalizedRole = (acc.role === 'agent' ? 'service' : acc.role) as 'admin' | 'service';
            return {
                id: acc.id,
                email: acc.email || '',
                first_name: acc.first_name || '',
                last_name: acc.last_name || '',
                phone: acc.phone || '',
                role: normalizedRole,
                is_active: acc.is_active !== false,
                created_at: acc.created_at || authInfo?.created_at || new Date().toISOString(),
                updated_at: acc.updated_at || acc.created_at || new Date().toISOString(),
                last_sign_in_at: acc.last_sign_in_at || authInfo?.last_sign_in_at || null,
            };
        });

        const adminCount = staff.filter(s => s.role === 'admin' && s.is_active).length;
        const agentCount = staff.filter(s => s.role === 'service' && s.is_active).length;
        const inactiveCount = staff.filter(s => !s.is_active).length;

        return NextResponse.json({
            success: true,
            staff,
            stats: {
                adminCount,
                agentCount,
                inactiveCount,
                clientCount: clientCount || 0,
                totalStaff: staff.filter(s => s.is_active).length,
            },
        });

    } catch (err: any) {
        logger.error('AdminUsers', 'Unexpected error in GET /api/admin/users', { error: err.message || String(err) });
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
