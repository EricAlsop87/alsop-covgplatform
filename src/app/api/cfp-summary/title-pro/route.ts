import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const policy_id = searchParams.get('policy_id');

    if (!policy_id) {
        return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
    }

    try {
        // 1. Direct query for policy_id
        const { data, error } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('policy_id', policy_id)
            .eq('field_name', 'title_pro')
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        let titleData = null;
        if (data?.new_value) {
            try {
                titleData = typeof data.new_value === 'string' ? JSON.parse(data.new_value) : data.new_value;
            } catch {}
        }

        if (titleData) {
            return NextResponse.json({ success: true, title_pro: titleData });
        }

        // 2. Family / Sibling fallback: look up base policy or client_id to find any matching Title Pro override
        const { data: pol } = await admin
            .from('policies')
            .select('id, policy_number, client_id')
            .eq('id', policy_id)
            .maybeSingle();

        if (pol) {
            const rawPol = pol.policy_number || '';
            const basePol = rawPol.replace(/\s+\d+$/, '').replace(/^CFP\s*/i, '').trim();

            let siblingQuery = admin
                .from('policies')
                .select('id')
                .neq('id', policy_id);

            if (basePol) {
                siblingQuery = siblingQuery.or(`policy_number.ilike.%${basePol}%,client_id.eq.${pol.client_id || '00000000-0000-0000-0000-000000000000'}`);
            } else if (pol.client_id) {
                siblingQuery = siblingQuery.eq('client_id', pol.client_id);
            }

            const { data: siblings } = await siblingQuery.limit(10);
            if (siblings && siblings.length > 0) {
                const siblingIds = siblings.map(s => s.id);
                const { data: sibOverrides } = await admin
                    .from('manual_overrides')
                    .select('new_value')
                    .in('policy_id', siblingIds)
                    .eq('field_name', 'title_pro')
                    .limit(1);

                if (sibOverrides && sibOverrides.length > 0 && sibOverrides[0].new_value) {
                    try {
                        const parsed = typeof sibOverrides[0].new_value === 'string'
                            ? JSON.parse(sibOverrides[0].new_value)
                            : sibOverrides[0].new_value;
                        return NextResponse.json({ success: true, title_pro: parsed });
                    } catch {}
                }
            }
        }

        return NextResponse.json({ success: true, title_pro: null });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const userId = auth.user.id;

    try {
        const body = await req.json();
        const { policy_id, title_name, match_status = 'matched', notes = '' } = body;

        if (!policy_id) {
            return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
        }

        // Fetch user account info for audit
        const { data: userAcc } = await admin
            .from('accounts')
            .select('first_name, last_name, email')
            .eq('id', userId)
            .maybeSingle();

        const verifiedBy = userAcc?.first_name
            ? `${userAcc.first_name} ${userAcc.last_name || ''}`.trim()
            : auth.user.email?.split('@')[0] || 'Staff';

        const now = new Date().toISOString();
        const titleData = {
            title_name: (title_name || '').trim(),
            match_status: match_status || 'matched',
            notes: (notes || '').trim(),
            verified_by: verifiedBy,
            verified_at: now,
        };

        // Find sibling policy IDs in the same family to sync across all terms
        const targetPolicyIds = new Set<string>([policy_id]);
        const { data: pol } = await admin
            .from('policies')
            .select('id, policy_number, client_id')
            .eq('id', policy_id)
            .maybeSingle();

        if (pol) {
            const rawPol = pol.policy_number || '';
            const basePol = rawPol.replace(/\s+\d+$/, '').replace(/^CFP\s*/i, '').trim();
            let siblingQuery = admin.from('policies').select('id');
            if (basePol) {
                siblingQuery = siblingQuery.or(`policy_number.ilike.%${basePol}%,client_id.eq.${pol.client_id || '00000000-0000-0000-0000-000000000000'}`);
            } else if (pol.client_id) {
                siblingQuery = siblingQuery.eq('client_id', pol.client_id);
            }
            const { data: siblings } = await siblingQuery.limit(20);
            if (siblings) {
                for (const s of siblings) targetPolicyIds.add(s.id);
            }
        }

        const upsertRows = Array.from(targetPolicyIds).map(pid => ({
            policy_id: pid,
            field_name: 'title_pro',
            new_value: JSON.stringify(titleData),
            actor_id: userId,
            updated_at: now,
        }));

        const { error: upsertError } = await admin.from('manual_overrides').upsert(
            upsertRows,
            { onConflict: 'policy_id, field_name' }
        );

        if (upsertError) {
            console.error('Error saving Title Pro verification:', upsertError);
            return NextResponse.json({ error: upsertError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            title_pro: titleData,
        });
    } catch (err: any) {
        console.error('Unexpected error in Title Pro POST:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();

    try {
        const { searchParams } = new URL(req.url);
        const policy_id = searchParams.get('policy_id');

        if (!policy_id) {
            return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
        }

        const targetPolicyIds = new Set<string>([policy_id]);
        const { data: pol } = await admin
            .from('policies')
            .select('id, policy_number, client_id')
            .eq('id', policy_id)
            .maybeSingle();

        if (pol) {
            const rawPol = pol.policy_number || '';
            const basePol = rawPol.replace(/\s+\d+$/, '').replace(/^CFP\s*/i, '').trim();
            let siblingQuery = admin.from('policies').select('id');
            if (basePol) {
                siblingQuery = siblingQuery.or(`policy_number.ilike.%${basePol}%,client_id.eq.${pol.client_id || '00000000-0000-0000-0000-000000000000'}`);
            } else if (pol.client_id) {
                siblingQuery = siblingQuery.eq('client_id', pol.client_id);
            }
            const { data: siblings } = await siblingQuery.limit(20);
            if (siblings) {
                for (const s of siblings) targetPolicyIds.add(s.id);
            }
        }

        const { error } = await admin
            .from('manual_overrides')
            .delete()
            .in('policy_id', Array.from(targetPolicyIds))
            .eq('field_name', 'title_pro');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('Unexpected error in Title Pro DELETE:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
