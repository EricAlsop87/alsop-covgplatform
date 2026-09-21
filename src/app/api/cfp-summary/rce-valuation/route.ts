import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { serverSummaryCache } from '../route';

export const dynamic = 'force-dynamic';

export interface RceValuationData {
    replacement_cost: number | null;
    carrier?: string | null;
    sq_feet?: number | null;
    cost_per_sqft?: number | null;
    notes?: string | null;
    storage_path?: string | null;
    file_name?: string | null;
    verified_by?: string | null;
    verified_at?: string | null;
}

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const userId = auth.user.id;

    try {
        const body = await req.json();
        const {
            policy_id,
            replacement_cost = null,
            carrier = null,
            sq_feet = null,
            cost_per_sqft = null,
            notes = '',
            storage_path = null,
            file_name = null,
        } = body;

        if (!policy_id) {
            return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
        }

        const numCost = typeof replacement_cost === 'number'
            ? replacement_cost
            : (replacement_cost ? parseFloat(String(replacement_cost).replace(/[^0-9.]/g, '')) : null);

        const numSqft = typeof sq_feet === 'number'
            ? sq_feet
            : (sq_feet ? parseFloat(String(sq_feet).replace(/[^0-9.]/g, '')) : null);

        const computedCostPerSqft = typeof cost_per_sqft === 'number'
            ? cost_per_sqft
            : (numCost && numSqft && numSqft > 0 ? Math.round((numCost / numSqft) * 100) / 100 : null);

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
        const valuationData: RceValuationData = {
            replacement_cost: numCost,
            carrier: (carrier || '').trim() || null,
            sq_feet: numSqft,
            cost_per_sqft: computedCostPerSqft,
            notes: (notes || '').slice(0, 500).trim() || null,
            storage_path: storage_path || null,
            file_name: file_name || null,
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

        // Upsert manual_overrides for rce_valuation and rce_replacement_cost
        const upsertRows = Array.from(targetPolicyIds).flatMap(pid => [
            {
                policy_id: pid,
                field_name: 'rce_valuation',
                new_value: JSON.stringify(valuationData),
                actor_id: userId,
                updated_at: now,
            },
            {
                policy_id: pid,
                field_name: 'rce_replacement_cost',
                new_value: numCost != null ? String(numCost) : '',
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

        // Also check if any linked platform_documents exist for RCE to update doc_data_rce or doc_data_dic
        if (numCost != null) {
            const { data: rceDocs } = await admin
                .from('platform_documents')
                .select('id, doc_type, file_name')
                .in('policy_id', Array.from(targetPolicyIds))
                .or("doc_type.eq.rce,file_name.ilike.%rce%");

            if (rceDocs && rceDocs.length > 0) {
                for (const d of rceDocs) {
                    await admin.from('doc_data_rce').upsert({
                        document_id: d.id,
                        replacement_cost: numCost,
                        sq_feet: numSqft,
                        cost_per_sqft: computedCostPerSqft,
                        source: carrier || 'manual_entry',
                    }, { onConflict: 'document_id' });
                }
            }
        }

        // Invalidate server memory cache on manual updates
        serverSummaryCache.clear();

        return NextResponse.json({
            success: true,
            rce_valuation: valuationData,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const policy_id = searchParams.get('policy_id');

    if (!policy_id) {
        return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
    }

    try {
        // Find sibling policy IDs in the same family
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
            .in('field_name', ['rce_valuation', 'rce_replacement_cost']);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Invalidate server memory cache on manual updates
        serverSummaryCache.clear();

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}
