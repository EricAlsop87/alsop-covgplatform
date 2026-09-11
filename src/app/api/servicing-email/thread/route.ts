import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { ServicingThreadMessage } from '@/lib/servicingEmailThreads';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const policy_id = searchParams.get('policy_id');

    if (!policy_id) {
        return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    try {
        const { data: threadOv } = await admin
            .from('manual_overrides')
            .select('new_value, updated_at')
            .eq('policy_id', policy_id)
            .eq('field_name', 'servicing_email_thread')
            .maybeSingle();

        let messages: ServicingThreadMessage[] = [];
        if (threadOv?.new_value) {
            try {
                messages = JSON.parse(threadOv.new_value);
            } catch {}
        }

        const hasUnreadReply = messages.some(m => m.direction === 'inbound' && !m.isRead);

        return NextResponse.json({
            policyId: policy_id,
            messages,
            hasUnreadReply,
            totalMessages: messages.length,
            lastMessageAt: messages[messages.length - 1]?.sentAt || threadOv?.updated_at || null,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

// Mark thread as read
export async function PATCH(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const { policy_id } = body;

        if (!policy_id) {
            return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
        }

        const { data: threadOv } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('policy_id', policy_id)
            .eq('field_name', 'servicing_email_thread')
            .maybeSingle();

        if (threadOv?.new_value) {
            try {
                const messages: ServicingThreadMessage[] = JSON.parse(threadOv.new_value);
                const updatedMessages = messages.map(m => ({ ...m, isRead: true }));

                await admin.from('manual_overrides').upsert(
                    {
                        policy_id,
                        field_name: 'servicing_email_thread',
                        new_value: JSON.stringify(updatedMessages),
                        actor_id: auth.user?.id || null,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'policy_id, field_name' }
                );
            } catch {}
        }

        // Also clear has_agent_reply on servicing_email_item
        const { data: itemOv } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('policy_id', policy_id)
            .eq('field_name', 'servicing_email_item')
            .maybeSingle();

        if (itemOv?.new_value) {
            try {
                const item = JSON.parse(itemOv.new_value);
                item.has_agent_reply = false;
                await admin.from('manual_overrides').upsert(
                    {
                        policy_id,
                        field_name: 'servicing_email_item',
                        new_value: JSON.stringify(item),
                        actor_id: auth.user?.id || null,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'policy_id, field_name' }
                );
            } catch {}
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
