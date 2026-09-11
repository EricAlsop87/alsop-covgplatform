import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

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

        const { error: upsertError } = await admin.from('manual_overrides').upsert(
            {
                policy_id,
                field_name: 'title_pro',
                new_value: JSON.stringify(titleData),
                actor_id: userId,
                updated_at: now,
            },
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

        const { error } = await admin
            .from('manual_overrides')
            .delete()
            .eq('policy_id', policy_id)
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
