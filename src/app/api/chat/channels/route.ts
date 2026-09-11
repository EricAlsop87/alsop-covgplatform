import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { DEFAULT_CHANNELS, ChatChannel } from '@/lib/teamChat';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const userId = auth.user.id;

    try {
        // 1. Fetch custom channels and groups from manual_overrides
        const { data: customOv } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('field_name', 'team_chat_custom_channels')
            .maybeSingle();

        let customChannels: ChatChannel[] = [];
        if (customOv?.new_value) {
            try {
                customChannels = JSON.parse(customOv.new_value);
            } catch {}
        }

        // 2. Fetch all staff accounts to build DM list and names
        const { data: staff } = await admin
            .from('accounts')
            .select('id, first_name, last_name, email, role, is_active')
            .in('role', ['admin', 'service', 'agent'])
            .eq('is_active', true);

        // Filter custom channels to those the user has access to (public or member)
        const accessibleCustom = customChannels.filter(c => {
            if (!c.memberIds || c.memberIds.length === 0) return true;
            return c.memberIds.includes(userId) || c.createdBy === userId;
        });

        // Combine default public channels with custom groups
        const allChannels = [...DEFAULT_CHANNELS, ...accessibleCustom];

        return NextResponse.json({
            channels: allChannels,
            staff: staff || [],
            currentUserId: userId,
        });
    } catch (err: any) {
        console.error('Error fetching chat channels:', err);
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
        const { name, type = 'group', description, memberIds = [], memberNames = [] } = body;

        if (!name && type !== 'dm') {
            return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
        }

        const newChannel: ChatChannel = {
            id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: name ? name.trim().replace(/^#+/, '') : 'Group Chat',
            type: type || 'group',
            description: description || '',
            memberIds: Array.from(new Set([userId, ...memberIds])),
            memberNames: memberNames || [],
            createdBy: userId,
            createdAt: new Date().toISOString(),
        };

        // Fetch existing custom channels
        const { data: existingOv } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('field_name', 'team_chat_custom_channels')
            .maybeSingle();

        let channels: ChatChannel[] = [];
        if (existingOv?.new_value) {
            try {
                channels = JSON.parse(existingOv.new_value);
            } catch {}
        }

        channels.push(newChannel);

        await admin.from('manual_overrides').upsert(
            {
                policy_id: '00000000-0000-0000-0000-000000000000',
                field_name: 'team_chat_custom_channels',
                new_value: JSON.stringify(channels),
                actor_id: userId,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'policy_id, field_name' }
        );

        return NextResponse.json({ success: true, channel: newChannel });
    } catch (err: any) {
        console.error('Error creating chat channel:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
