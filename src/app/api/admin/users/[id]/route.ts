import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';

/**
 * PATCH /api/admin/users/[id]
 *
 * Update staff user role, active status, or profile fields.
 * ADMIN ONLY.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await authenticateRequest(req, { requiredRole: ['admin'] });
        if (isAuthError(auth)) return auth;
        const caller = auth.user;

        const { id: targetId } = await params;
        if (!targetId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        const body = await req.json();
        const { role, is_active, first_name, last_name, phone } = body;

        const supabase = getSupabaseAdmin();

        // 1. Fetch current target account
        const { data: currentAccount, error: fetchErr } = await supabase
            .from('accounts')
            .select('*')
            .eq('id', targetId)
            .single();

        if (fetchErr || !currentAccount) {
            return NextResponse.json({ error: 'User account not found' }, { status: 404 });
        }

        // 2. Safety Guards: Prevent self-lockout
        if (targetId === caller.id) {
            if (role && role !== 'admin') {
                return NextResponse.json(
                    { error: 'Self-demotion blocked: You cannot change your own administrator role.' },
                    { status: 400 }
                );
            }
            if (is_active === false) {
                return NextResponse.json(
                    { error: 'Self-deactivation blocked: You cannot deactivate your own account.' },
                    { status: 400 }
                );
            }
        }

        // 3. Build accounts update payload
        const updatePayload: Record<string, any> = {
            updated_at: new Date().toISOString(),
        };

        const changesList: string[] = [];

        if (role !== undefined) {
            if (!['admin', 'service'].includes(role)) {
                return NextResponse.json({ error: 'Role must be either admin or service (agent)' }, { status: 400 });
            }
            updatePayload.role = role;
            if (role !== currentAccount.role) {
                changesList.push(`role changed from ${currentAccount.role} to ${role}`);
            }
        }

        if (is_active !== undefined) {
            updatePayload.is_active = Boolean(is_active);
            if (Boolean(is_active) !== currentAccount.is_active) {
                changesList.push(is_active ? 'account activated' : 'account deactivated');
            }
        }

        if (first_name !== undefined) updatePayload.first_name = String(first_name).trim();
        if (last_name !== undefined) updatePayload.last_name = String(last_name).trim();
        if (phone !== undefined) updatePayload.phone = String(phone).trim();

        // 4. Update PostgreSQL accounts row
        const { data: updatedAccount, error: updateErr } = await supabase
            .from('accounts')
            .update(updatePayload)
            .eq('id', targetId)
            .select()
            .single();

        if (updateErr) {
            logger.error('AdminUsers', 'Failed to update account in PostgreSQL', { error: updateErr.message });
            return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }

        // 5. If role or names changed, synchronize to Supabase Auth metadata
        if (role !== undefined || first_name !== undefined || last_name !== undefined) {
            try {
                await supabase.auth.admin.updateUserById(targetId, {
                    user_metadata: {
                        ...(role !== undefined ? { role } : {}),
                        ...(first_name !== undefined ? { first_name: updatePayload.first_name } : {}),
                        ...(last_name !== undefined ? { last_name: updatePayload.last_name } : {}),
                    }
                });
            } catch (authSyncErr: any) {
                logger.warn('AdminUsers', 'Non-fatal: Auth metadata sync failed', { error: authSyncErr.message });
            }
        }

        // 6. Record audit event
        const targetName = `${updatedAccount.first_name || ''} ${updatedAccount.last_name || ''}`.trim() || updatedAccount.email;
        if (changesList.length > 0) {
            await supabase.from('activity_events').insert({
                event_type: 'user.modified',
                title: `Staff account updated: ${targetName}`,
                detail: `${changesList.join(', ')} · Performed by: ${caller.email || caller.id}`,
                meta: {
                    targetUserId: targetId,
                    targetEmail: updatedAccount.email,
                    changes: changesList,
                    performedBy: caller.id,
                },
            });
        }

        return NextResponse.json({
            success: true,
            user: updatedAccount,
        });

    } catch (err: any) {
        logger.error('AdminUsers', 'Unexpected error in PATCH /api/admin/users/[id]', { error: err.message || String(err) });
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
