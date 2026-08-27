import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';


/**
 * POST /api/admin/invite
 *
 * Invite a new user to the CFP Platform.
 * ADMIN ONLY — server-side role check enforced via Bearer token.
 *
 * Uses Supabase auth.admin.inviteUserByEmail() which:
 * 1. Sends a Supabase-managed invite email with a secure magic link
 * 2. Stores the role in the user's auth metadata
 * 3. Our DB trigger then copies role from auth metadata → accounts table on signup
 *
 * Body: { email: string, role: 'admin' | 'service' | 'customer', firstName?: string, lastName?: string }
 * Returns: { success: boolean, email: string, role: string, error?: string }
 */

type InviteRole = 'admin' | 'service' | 'customer';

const ROLE_LABELS: Record<InviteRole, string> = {
    admin: 'Administrator',
    service: 'Agent',
    customer: 'Client',
};

export async function POST(req: NextRequest) {
    try {
        // ── Auth check: admin only (via Bearer token) ──
        const auth = await authenticateRequest(req, { requiredRole: ['admin'] });
        if (isAuthError(auth)) return auth;
        const profile = auth.user;

        const body = await req.json();
        const { email, role, firstName, lastName } = body as {
            email?: string;
            role?: InviteRole;
            firstName?: string;
            lastName?: string;
        };

        // ── Validate ──
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return NextResponse.json({ error: 'Valid email address is required' }, { status: 400 });
        }

        const normalizedRole = role as InviteRole;
        if (!normalizedRole || !['admin', 'service', 'customer'].includes(normalizedRole)) {
            return NextResponse.json(
                { error: 'Invalid role — must be admin, service, or customer' },
                { status: 400 }
            );
        }

        const supabase = getSupabaseAdmin();

        // ── Invite via Supabase Admin (handles invite email + secure token) ──
        const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
            data: {
                role: normalizedRole,
                first_name: firstName || '',
                last_name: lastName || '',
                invited_by: profile.id,
                invited_at: new Date().toISOString(),
            },
            redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://coveragechecknow.com'}/auth/accept-invite`,
        });

        if (error) {
            // Handle common errors gracefully
            if (error.message?.includes('already been registered')) {
                return NextResponse.json(
                    { error: 'A user with this email address already exists.' },
                    { status: 409 }
                );
            }
            logger.error('Invite', '[Admin Invite] Supabase invite error:', { error: error.message })
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // ── Log to activity events ──
        await supabase.from('activity_events').insert({
            event_type: 'user.invited',
            title: `User invited: ${email}`,
            detail: `Role: ${ROLE_LABELS[normalizedRole]} (${normalizedRole}) · Invited by: ${profile.email || profile.id}`,
            meta: {
                invitedEmail: email,
                role: normalizedRole,
                roleLabel: ROLE_LABELS[normalizedRole],
                invitedBy: profile.id,
                invitedByEmail: profile.email,
            },
        });

        return NextResponse.json({
            success: true,
            email,
            role: normalizedRole,
            roleLabel: ROLE_LABELS[normalizedRole],
            userId: data.user?.id,
        });

    } catch (err: any) {
        logger.error('Invite', '[Admin Invite] Unexpected error:', err)
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
