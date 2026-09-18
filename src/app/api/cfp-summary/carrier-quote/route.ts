import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export type CarrierKey = 'bamboo' | 'aegis' | 'am' | 'sagesure' | 'psic';
export type CoverageQuoteType = 'DIC' | 'FULL' | 'QUOTE' | 'AGENT_REVIEW' | 'UNAVAILABLE';

const VALID_CARRIERS: CarrierKey[] = ['bamboo', 'aegis', 'am', 'sagesure', 'psic'];

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const userId = auth.user.id;

    try {
        const body = await req.json();
        const {
            policy_id,
            carrier_key,
            coverage_type,
            quote_number = '',
            premium = null,
            notes = '',
            storage_path = null,
            file_name = null,
        } = body;

        if (!policy_id) {
            return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
        }

        if (!carrier_key || !VALID_CARRIERS.includes(carrier_key)) {
            return NextResponse.json({ error: 'Invalid carrier_key' }, { status: 400 });
        }

        if (!coverage_type || !['DIC', 'FULL', 'QUOTE', 'AGENT_REVIEW', 'UNAVAILABLE'].includes(coverage_type)) {
            return NextResponse.json({ error: 'Invalid coverage_type' }, { status: 400 });
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
        const quoteData = {
            carrier_key,
            coverage_type,
            quote_number: (quote_number || '').trim(),
            premium: typeof premium === 'number' ? premium : (premium ? parseFloat(premium) : null),
            notes: (notes || '').slice(0, 500).trim(),
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

        const fieldName = `carrier_quote_${carrier_key}`;
        const upsertRows = Array.from(targetPolicyIds).map(pid => ({
            policy_id: pid,
            field_name: fieldName,
            new_value: JSON.stringify(quoteData),
            actor_id: userId,
            updated_at: now,
        }));

        const { error: upsertError } = await admin.from('manual_overrides').upsert(
            upsertRows,
            { onConflict: 'policy_id, field_name' }
        );

        if (upsertError) {
            console.error('Error saving carrier quote override:', upsertError);
            return NextResponse.json({ error: upsertError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            carrier_quote: quoteData,
        });
    } catch (err: any) {
        console.error('Unexpected error in carrier quote POST:', err);
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
        const carrier_key = searchParams.get('carrier_key') as CarrierKey | null;

        if (!policy_id || !carrier_key) {
            return NextResponse.json({ error: 'policy_id and carrier_key are required' }, { status: 400 });
        }

        const fieldName = `carrier_quote_${carrier_key}`;

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
            .eq('field_name', fieldName);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('Unexpected error in carrier quote DELETE:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
