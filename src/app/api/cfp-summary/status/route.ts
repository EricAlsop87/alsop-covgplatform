import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { serverSummaryCache } from '../route';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const userId = auth.user.id;

    try {
        const body = await req.json();
        const { policy_id, policy_term_id, status, carrier_status } = body;

        const rawStatus = (carrier_status || status || '').trim();
        if (!policy_id || !rawStatus) {
            return NextResponse.json({ error: 'policy_id and status are required' }, { status: 400 });
        }

        const normalizedStatus = rawStatus.toUpperCase();
        const isCancelled = normalizedStatus.includes('CANCEL');
        const finalStatus = isCancelled ? 'CANCELLED' : normalizedStatus;

        // Find sibling policies in the same family so all terms are in sync
        const targetPolicyIds = new Set<string>([policy_id]);
        const { data: pol } = await admin
            .from('policies')
            .select('id, policy_number')
            .eq('id', policy_id)
            .maybeSingle();

        if (pol?.policy_number) {
            const rawPol = pol.policy_number;
            const basePol = rawPol.replace(/\s+\d+$/, '').replace(/^CFP\s*/i, '').trim();
            if (basePol) {
                const { data: siblings } = await admin
                    .from('policies')
                    .select('id')
                    .ilike('policy_number', `%${basePol}%`)
                    .limit(20);
                if (siblings) {
                    for (const s of siblings) targetPolicyIds.add(s.id);
                }
            }
        }

        const now = new Date().toISOString();
        const pidArray = Array.from(targetPolicyIds);

        // 1. Update policy_terms.carrier_status
        await admin
            .from('policy_terms')
            .update({ carrier_status: finalStatus })
            .in('policy_id', pidArray);

        // 2. Update policies.status if cancelled or active
        if (isCancelled) {
            await admin
                .from('policies')
                .update({ status: 'cancelled' })
                .in('id', pidArray);
        } else {
            await admin
                .from('policies')
                .update({ status: 'active' })
                .in('id', pidArray);
        }

        // 3. Upsert manual_overrides for instant query consistency
        const overrideRows = pidArray.map(pid => ({
            policy_id: pid,
            field_name: 'carrier_status',
            new_value: finalStatus,
            actor_id: userId,
            updated_at: now,
        }));

        await admin
            .from('manual_overrides')
            .upsert(overrideRows, { onConflict: 'policy_id,field_name' });

        // 4. Log activity event
        try {
            await admin.from('activity_events').insert({
                policy_id,
                actor_user_id: userId,
                event_type: 'policy.status_changed',
                title: `Policy Status Changed to ${finalStatus}`,
                detail: `Status updated to ${finalStatus} for policy ${pol?.policy_number || policy_id}${isCancelled ? ' (marked as no quote needed)' : ''}`,
                meta: {
                    policy_id,
                    new_status: finalStatus,
                    is_cancelled: isCancelled,
                    updated_at: now,
                },
            });
        } catch {
            // Non-blocking
        }

        // 5. Invalidate server cache
        try {
            serverSummaryCache.clear();
        } catch {}

        return NextResponse.json({
            success: true,
            policy_id,
            carrier_status: finalStatus,
            is_cancelled: isCancelled,
            synced_policy_ids: pidArray,
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
