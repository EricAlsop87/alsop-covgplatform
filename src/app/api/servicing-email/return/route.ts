import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const { policy_id, reason, custom_notes } = body;

        if (!policy_id) {
            return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
        }

        if (!reason) {
            return NextResponse.json({ error: 'reason is required' }, { status: 400 });
        }

        // Lookup staff user name
        let staffName = 'Servicing Team';
        if (auth.user?.id) {
            const { data: acc } = await admin
                .from('accounts')
                .select('first_name, last_name')
                .eq('id', auth.user.id)
                .single();
            if (acc) {
                const full = `${acc.first_name || ''} ${acc.last_name || ''}`.trim();
                if (full) staffName = full;
            }
        }

        // Fetch policy details for note insertion
        const { data: pol } = await admin
            .from('policies')
            .select('id, client_id, policy_number')
            .eq('id', policy_id)
            .single();

        // 1. Remove from servicing email queue
        await admin
            .from('manual_overrides')
            .delete()
            .eq('policy_id', policy_id)
            .eq('field_name', 'servicing_email_item');

        // 2. Set servicing_return_info override
        const returnPayload = {
            reason,
            custom_notes: custom_notes || '',
            returned_by: staffName,
            returned_at: new Date().toISOString(),
        };

        const { error: ovErr } = await admin
            .from('manual_overrides')
            .upsert(
                {
                    policy_id,
                    field_name: 'servicing_return_info',
                    new_value: JSON.stringify(returnPayload),
                    actor_id: auth.user?.id || null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'policy_id, field_name' }
            );

        if (ovErr) {
            return NextResponse.json({ error: ovErr.message }, { status: 500 });
        }

        // 3. Log an audit note on the policy
        if (pol?.client_id) {
            const noteText = `[Returned from Servicing]: ${reason}${
                custom_notes ? `\nDetails: ${custom_notes}` : ''
            }`;

            await admin.from('notes').insert({
                client_id: pol.client_id,
                policy_id: pol.id,
                body: noteText,
                author_user_id: auth.user?.id || null,
                meta: {
                    tags: ['Servicing', 'Returned'],
                    return_reason: reason,
                    returned_by: staffName,
                },
            });
        }

        return NextResponse.json({ success: true, returnPayload });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
