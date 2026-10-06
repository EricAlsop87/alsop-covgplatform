import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { serverSummaryCache } from '../route';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cfp-summary/scenario-alert?policy_id=...
 * Returns the current saved scenario alert for a policy from manual_overrides.
 */
export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const policyId = searchParams.get('policy_id');

    if (!policyId) {
        return NextResponse.json({ success: false, error: 'Missing policy_id parameter' }, { status: 400 });
    }

    try {
        const admin = getSupabaseAdmin();
        const { data: override, error } = await admin
            .from('manual_overrides')
            .select('new_value, updated_at')
            .eq('policy_id', policyId)
            .eq('field_name', 'scenario_alert')
            .maybeSingle();

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        if (!override || !override.new_value) {
            return NextResponse.json({ success: true, scenario_alert: null });
        }

        try {
            const parsed = JSON.parse(override.new_value);
            return NextResponse.json({ success: true, scenario_alert: parsed, updated_at: override.updated_at });
        } catch {
            return NextResponse.json({ success: true, scenario_alert: null });
        }
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
    }
}

/**
 * POST /api/cfp-summary/scenario-alert
 * Saves or clears scenario alert data for a policy in manual_overrides.
 */
export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    try {
        const body = await req.json();
        const { policy_id, scenario_alert } = body;

        if (!policy_id) {
            return NextResponse.json({ success: false, error: 'Missing policy_id' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();
        const now = new Date().toISOString();

        if (!scenario_alert || (Array.isArray(scenario_alert.scenarios) && scenario_alert.scenarios.length === 0 && !scenario_alert.vaRemarks)) {
            // Delete override or set empty
            await admin
                .from('manual_overrides')
                .delete()
                .eq('policy_id', policy_id)
                .eq('field_name', 'scenario_alert');

            // Invalidate server cache so summary returns updated state
            serverSummaryCache.clear();

            return NextResponse.json({ success: true, scenario_alert: null, message: 'Scenario alert cleared' });
        }

        const payloadToSave = {
            ...scenario_alert,
            updatedAt: now,
            updatedBy: auth.user.email || 'staff',
        };

        const { error: upsertErr } = await admin.from('manual_overrides').upsert(
            {
                policy_id,
                field_name: 'scenario_alert',
                new_value: JSON.stringify(payloadToSave),
                updated_at: now,
            },
            { onConflict: 'policy_id, field_name' }
        );

        if (upsertErr) {
            return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
        }

        // Invalidate server cache so summary returns updated state
        serverSummaryCache.clear();

        return NextResponse.json({
            success: true,
            scenario_alert: payloadToSave,
            message: 'Scenario alert saved successfully',
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message || 'Failed to save scenario alert' }, { status: 500 });
    }
}
