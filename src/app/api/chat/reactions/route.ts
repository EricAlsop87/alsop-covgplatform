import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { ChatMessage, getSystemPolicyId } from '@/lib/teamChat';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const userId = auth.user.id;

    try {
        const body = await req.json();
        const { channel_id, message_id, emoji } = body;

        if (!channel_id || !message_id || !emoji) {
            return NextResponse.json({ error: 'channel_id, message_id, and emoji are required' }, { status: 400 });
        }

        const fieldName = `team_chat_msg_${channel_id}`;
        const { data: existingOv } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('field_name', fieldName)
            .maybeSingle();

        if (!existingOv?.new_value) {
            return NextResponse.json({ error: 'Channel history not found' }, { status: 404 });
        }

        let messages: ChatMessage[] = [];
        try {
            messages = JSON.parse(existingOv.new_value);
        } catch {
            return NextResponse.json({ error: 'Invalid channel history' }, { status: 500 });
        }

        const msgIdx = messages.findIndex(m => m.id === message_id);
        if (msgIdx === -1) {
            return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }

        const msg = messages[msgIdx];
        const reactions = { ...(msg.reactions || {}) };
        const userList = reactions[emoji] ? [...reactions[emoji]] : [];

        const userIdx = userList.indexOf(userId);
        if (userIdx > -1) {
            // Remove reaction if already reacted
            userList.splice(userIdx, 1);
            if (userList.length === 0) {
                delete reactions[emoji];
            } else {
                reactions[emoji] = userList;
            }
        } else {
            // Add reaction
            userList.push(userId);
            reactions[emoji] = userList;
        }

        messages[msgIdx] = {
            ...msg,
            reactions,
        };

        const now = new Date().toISOString();
        const systemPolicyId = await getSystemPolicyId(admin);
        await admin.from('manual_overrides').upsert(
            {
                policy_id: systemPolicyId,
                field_name: fieldName,
                new_value: JSON.stringify(messages),
                actor_id: userId,
                updated_at: now,
            },
            { onConflict: 'policy_id, field_name' }
        );

        return NextResponse.json({ success: true, reactions });
    } catch (err: any) {
        console.error('Error toggling reaction:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
