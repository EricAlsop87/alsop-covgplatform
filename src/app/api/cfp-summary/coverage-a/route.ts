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
        const { policy_id, coverage_a = null } = body;

        if (!policy_id) {
            return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
        }

        const numCoverageA = typeof coverage_a === 'number'
            ? coverage_a
            : (coverage_a ? parseFloat(String(coverage_a).replace(/[^0-9.]/g, '')) : null);

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

        const now = new Date().toISOString();
        const upsertRows = Array.from(targetPolicyIds).flatMap(pid => [
            {
                policy_id: pid,
                field_name: 'coverage_a',
                new_value: numCoverageA != null ? String(numCoverageA) : '',
                actor_id: userId,
                updated_at: now,
            },
            {
                policy_id: pid,
                field_name: 'limit_dwelling',
                new_value: numCoverageA != null ? String(numCoverageA) : '',
                actor_id: userId,
                updated_at: now,
            },
        ]);

        const { error: upsertError } = await admin.from('manual_overrides').upsert(
            upsertRows,
            { onConflict: 'policy_id, field_name' }
        );

        if (upsertError) {
            return NextResponse.json({ error: upsertError.message }, { status: 500 });
        }

        // Update policy_terms and dec_pages for targetPolicyIds
        if (numCoverageA != null) {
            await admin
                .from('policy_terms')
                .update({ limit_dwelling: String(numCoverageA) })
                .in('policy_id', Array.from(targetPolicyIds));

            await admin
                .from('dec_pages')
                .update({ limit_dwelling: String(numCoverageA) })
                .in('policy_id', Array.from(targetPolicyIds));
        }

        // Invalidate server memory cache on manual updates
        serverSummaryCache.clear();

        return NextResponse.json({
            success: true,
            coverage_a: numCoverageA,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}
