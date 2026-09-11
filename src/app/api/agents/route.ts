import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getActiveAgents, COMPANY_AGENTS, CompanyAgent } from '@/lib/agentsDirectory';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const teamFilter = searchParams.get('team');

    let agents = getActiveAgents();

    if (teamFilter) {
        agents = agents.filter(a => a.team.toLowerCase() === teamFilter.toLowerCase());
    }

    // Also check if any custom agents were added via manual_overrides or database
    try {
        const admin = getSupabaseAdmin();
        const { data: customAgents } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('field_name', 'custom_company_agent');

        if (customAgents && customAgents.length > 0) {
            for (const ca of customAgents) {
                try {
                    const parsed: CompanyAgent = JSON.parse(ca.new_value);
                    if (parsed && parsed.email && !agents.some(a => a.email.toLowerCase() === parsed.email.toLowerCase())) {
                        agents.push(parsed);
                    }
                } catch {}
            }
        }
    } catch {}

    // Group by team for structured dropdowns
    const groupedByTeam: Record<string, CompanyAgent[]> = {};
    for (const a of agents) {
        const t = a.team || 'Other';
        if (!groupedByTeam[t]) groupedByTeam[t] = [];
        groupedByTeam[t].push(a);
    }

    return NextResponse.json({
        agents,
        groupedByTeam,
        total: agents.length,
    });
}

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const { nickname, fullName, email, team, office, role } = body;

        if (!fullName || !email) {
            return NextResponse.json({ error: 'fullName and email are required' }, { status: 400 });
        }

        const agent: CompanyAgent = {
            nickname: nickname || fullName.split(' ')[0],
            fullName,
            email: email.trim().toLowerCase(),
            team: team || 'Support',
            office: office || '',
            role: role || 'agent',
            active: true,
        };

        const { error } = await admin.from('manual_overrides').insert({
            policy_id: '00000000-0000-0000-0000-000000000000',
            field_name: 'custom_company_agent',
            new_value: JSON.stringify(agent),
            actor_id: auth.user?.id || null,
        });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, agent });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
