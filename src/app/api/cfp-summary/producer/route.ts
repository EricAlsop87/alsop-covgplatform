import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export interface ProducerAuditEntry {
    previous_producer: string | null;
    new_producer: string | null;
    changed_by: string;
    changed_at: string;
    note?: string | null;
}

export function toTitleCase(name?: string | null): string {
    if (!name) return '';
    return name
        .trim()
        .split(/\s+/)
        .map(word => {
            return word
                .split('-')
                .map(sub => sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase())
                .join('-');
        })
        .join(' ');
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
            producer_name,
            previous_producer = null,
            note = '',
        } = body;

        if (!policy_id) {
            return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
        }

        // Fetch current user account details for audit
        const { data: userAcc } = await admin
            .from('accounts')
            .select('first_name, last_name, email')
            .eq('id', userId)
            .maybeSingle();

        const changedBy = userAcc?.first_name
            ? `${userAcc.first_name} ${userAcc.last_name || ''}`.trim()
            : auth.user.email?.split('@')[0] || 'Staff';

        const now = new Date().toISOString();
        const newProducerClean = toTitleCase(producer_name);
        const prevProducerClean = toTitleCase(previous_producer);

        // 1. Fetch current policy details to identify all terms
        const { data: pol } = await admin
            .from('policies')
            .select('id, policy_number')
            .eq('id', policy_id)
            .maybeSingle();

        // 2. Fetch existing producer audit history from manual_overrides
        const { data: existingOverride } = await admin
            .from('manual_overrides')
            .select('*')
            .eq('policy_id', policy_id)
            .eq('field_name', 'producer_override')
            .maybeSingle();

        let history: ProducerAuditEntry[] = [];
        if (existingOverride?.original_value) {
            try {
                const parsed = JSON.parse(existingOverride.original_value);
                if (Array.isArray(parsed)) {
                    history = parsed;
                }
            } catch {
                // fallback
            }
        }

        // Add new change entry
        history.unshift({
            previous_producer: prevProducerClean || null,
            new_producer: newProducerClean || null,
            changed_by: changedBy,
            changed_at: now,
            note: (note || '').trim() || null,
        });

        // Keep last 20 audit entries
        if (history.length > 20) {
            history = history.slice(0, 20);
        }

        // 3. Update policy_terms.sold_by
        const { error: termErr } = await admin
            .from('policy_terms')
            .update({
                sold_by: newProducerClean || null,
                updated_at: now,
            })
            .eq('policy_id', policy_id);

        if (termErr) {
            console.error('Failed to update policy_terms.sold_by:', termErr);
        }

        // 4. Save manual_overrides with full audit trail in original_value
        const { error: overrideErr } = await admin
            .from('manual_overrides')
            .upsert(
                {
                    policy_id: policy_id,
                    field_name: 'producer_override',
                    new_value: newProducerClean,
                    original_value: JSON.stringify(history),
                    actor_id: userId,
                    updated_at: now,
                },
                { onConflict: 'policy_id,field_name' }
            );

        if (overrideErr) {
            console.error('Failed to upsert manual_overrides for producer:', overrideErr);
        }

        return NextResponse.json({
            success: true,
            producer_name: newProducerClean,
            history,
            changed_by: changedBy,
            changed_at: now,
        });
    } catch (err: any) {
        console.error('Error updating producer:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const policyId = searchParams.get('policy_id');

    if (!policyId) {
        return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
    }

    try {
        const { data: override } = await admin
            .from('manual_overrides')
            .select('*')
            .eq('policy_id', policyId)
            .eq('field_name', 'producer_override')
            .maybeSingle();

        let history: ProducerAuditEntry[] = [];
        if (override?.original_value) {
            try {
                const parsed = JSON.parse(override.original_value);
                if (Array.isArray(parsed)) history = parsed;
            } catch {}
        }

        return NextResponse.json({
            success: true,
            producer_name: override?.new_value || null,
            history,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
