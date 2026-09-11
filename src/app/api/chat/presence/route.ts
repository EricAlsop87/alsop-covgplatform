import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { computePresenceStatus, UserPresence } from '@/lib/teamChat';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const currentUserId = auth.user.id;

    try {
        // 1. Fetch staff accounts
        const { data: staff } = await admin
            .from('accounts')
            .select('id, first_name, last_name, email, role, is_active')
            .in('role', ['admin', 'service', 'agent'])
            .eq('is_active', true);

        // 2. Fetch presence map
        const { data: presenceOv } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('field_name', 'team_chat_presence_map')
            .maybeSingle();

        let presenceMap: Record<string, string> = {};
        if (presenceOv?.new_value) {
            try {
                presenceMap = JSON.parse(presenceOv.new_value);
            } catch {}
        }

        // Build complete user presence list
        const users: UserPresence[] = (staff || []).map(s => {
            const lastSeen = presenceMap[s.id] || null;
            const status = computePresenceStatus(lastSeen);
            const userName = s.first_name ? `${s.first_name} ${s.last_name || ''}`.trim() : s.email.split('@')[0];

            return {
                userId: s.id,
                userName,
                userEmail: s.email,
                role: s.role,
                lastSeenAt: lastSeen || '',
                status,
            };
        });

        return NextResponse.json({
            users,
            currentUserId,
        });
    } catch (err: any) {
        console.error('Error fetching presence:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const userId = auth.user.id;

    try {
        const now = new Date().toISOString();

        const { data: presenceOv } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('field_name', 'team_chat_presence_map')
            .maybeSingle();

        let presenceMap: Record<string, string> = {};
        if (presenceOv?.new_value) {
            try {
                presenceMap = JSON.parse(presenceOv.new_value);
            } catch {}
        }

        presenceMap[userId] = now;

        await admin.from('manual_overrides').upsert(
            {
                policy_id: '00000000-0000-0000-0000-000000000000',
                field_name: 'team_chat_presence_map',
                new_value: JSON.stringify(presenceMap),
                actor_id: userId,
                updated_at: now,
            },
            { onConflict: 'policy_id, field_name' }
        );

        return NextResponse.json({ success: true, timestamp: now });
    } catch (err: any) {
        console.error('Error recording presence heartbeat:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
