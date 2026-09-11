import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { ChatMessage, getSystemPolicyId } from '@/lib/teamChat';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get('channel_id');

    if (!channelId) {
        return NextResponse.json({ error: 'channel_id is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const userId = auth.user.id;

    // Fetch user details from accounts
    const { data: userAcc } = await admin
        .from('accounts')
        .select('first_name, last_name, email')
        .eq('id', userId)
        .maybeSingle();

    const userName = userAcc?.first_name 
        ? `${userAcc.first_name} ${userAcc.last_name || ''}`.trim()
        : auth.user.email?.split('@')[0] || 'User';

    try {
        const fieldName = `team_chat_msg_${channelId}`;
        const { data: msgOv } = await admin
            .from('manual_overrides')
            .select('new_value, updated_at')
            .eq('field_name', fieldName)
            .maybeSingle();

        let messages: ChatMessage[] = [];
        if (msgOv?.new_value) {
            try {
                messages = JSON.parse(msgOv.new_value);
            } catch {}
        }

        // Mark as seen by current user
        let updated = false;
        const now = new Date().toISOString();
        const markedMessages = messages.map(m => {
            if (m.senderId !== userId && (!m.seenBy || !m.seenBy[userId])) {
                updated = true;
                return {
                    ...m,
                    seenBy: {
                        ...(m.seenBy || {}),
                        [userId]: { userName, seenAt: now },
                    },
                };
            }
            return m;
        });

        if (updated) {
            const systemPolicyId = await getSystemPolicyId(admin);
            await admin.from('manual_overrides').upsert(
                {
                    policy_id: systemPolicyId,
                    field_name: fieldName,
                    new_value: JSON.stringify(markedMessages),
                    actor_id: userId,
                    updated_at: now,
                },
                { onConflict: 'policy_id, field_name' }
            );
            messages = markedMessages;
        }

        return NextResponse.json({
            channelId,
            messages,
            totalMessages: messages.length,
        });
    } catch (err: any) {
        console.error('Error fetching chat messages:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const userId = auth.user.id;

    try {
        const body = await req.json();
        const { channel_id, text, attachments = [], policy_ref = null } = body;

        if (!channel_id) {
            return NextResponse.json({ error: 'channel_id is required' }, { status: 400 });
        }

        if (!text?.trim() && (!attachments || attachments.length === 0) && !policy_ref) {
            return NextResponse.json({ error: 'Message content cannot be empty' }, { status: 400 });
        }

        // Fetch sender details
        const { data: account } = await admin
            .from('accounts')
            .select('first_name, last_name, email, role')
            .eq('id', userId)
            .maybeSingle();

        const senderName = account?.first_name 
            ? `${account.first_name} ${account.last_name || ''}`.trim()
            : auth.user.email?.split('@')[0] || 'Team Member';
        const senderEmail = account?.email || auth.user.email || '';
        const senderRole = account?.role || 'agent';

        const now = new Date().toISOString();
        const newMessage: ChatMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            channelId: channel_id,
            senderId: userId,
            senderName,
            senderEmail,
            senderRole,
            text: text ? text.trim() : '',
            attachments,
            policyRef: policy_ref,
            reactions: {},
            seenBy: {
                [userId]: { userName: senderName, seenAt: now }
            },
            createdAt: now,
        };

        const fieldName = `team_chat_msg_${channel_id}`;
        const { data: existingOv } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('field_name', fieldName)
            .maybeSingle();

        let messages: ChatMessage[] = [];
        if (existingOv?.new_value) {
            try {
                messages = JSON.parse(existingOv.new_value);
            } catch {}
        }

        messages.push(newMessage);

        // Keep last 300 messages per channel for lightning fast responses
        if (messages.length > 300) {
            messages = messages.slice(messages.length - 300);
        }

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

        return NextResponse.json({ success: true, message: newMessage });
    } catch (err: any) {
        console.error('Error posting chat message:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
