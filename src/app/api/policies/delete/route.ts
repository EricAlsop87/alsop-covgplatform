import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';


/**
 * DELETE /api/policies/delete
 *
 * Permanently deletes a policy and ALL related child data.
 * Optionally deletes the orphaned client record if that client has
 * no other policies remaining.
 *
 * Body: { policy_id: string, delete_orphaned_client?: boolean }
 */
export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service'] });
    if (isAuthError(auth)) return auth;

    try {
        const { policy_id, delete_orphaned_client } = await req.json();

        if (!policy_id) {
            return NextResponse.json(
                { success: false, error: 'policy_id is required' },
                { status: 400 }
            );
        }

        const supabase = getSupabaseAdmin();

        // ── 1. Fetch the policy to confirm it exists and capture metadata ──
        const { data: policy, error: policyError } = await supabase
            .from('policies')
            .select('id, policy_number, client_id, property_address_raw')
            .eq('id', policy_id)
            .single();

        if (policyError || !policy) {
            return NextResponse.json(
                { success: false, error: 'Policy not found' },
                { status: 404 }
            );
        }

        const clientId = policy.client_id;
        const policyNumber = policy.policy_number || 'Unknown';
        const deletionSummary: string[] = [];

        // ── 2. Delete child data in dependency order ──

        // 2a. Flag Events (depends on policy_flags)
        const { error: flagEventsErr } = await supabase
            .from('flag_events')
            .delete()
            .eq('policy_id', policy_id);
        if (!flagEventsErr) deletionSummary.push('flag_events');

        // 2b. Policy Flags
        const { error: flagsErr } = await supabase
            .from('policy_flags')
            .delete()
            .eq('policy_id', policy_id);
        if (!flagsErr) deletionSummary.push('policy_flags');

        // 2c. Dec Pages
        const { error: decPagesErr } = await supabase
            .from('dec_pages')
            .delete()
            .eq('policy_id', policy_id);
        if (!decPagesErr) deletionSummary.push('dec_pages');

        // 2d. Dec Page Submissions
        const { error: subErr } = await supabase
            .from('dec_page_submissions')
            .delete()
            .eq('policy_id', policy_id);
        if (!subErr) deletionSummary.push('dec_page_submissions');

        // 2e. Platform Documents (RCE, DIC uploads, etc.)
        const { error: docsErr } = await supabase
            .from('platform_documents')
            .delete()
            .eq('policy_id', policy_id);
        if (!docsErr) deletionSummary.push('platform_documents');

        // 2f. Property Enrichments
        const { error: enrichErr } = await supabase
            .from('property_enrichments')
            .delete()
            .eq('policy_id', policy_id);
        if (!enrichErr) deletionSummary.push('property_enrichments');

        // 2g. Policy Reports
        const { error: reportsErr } = await supabase
            .from('policy_reports')
            .delete()
            .eq('policy_id', policy_id);
        if (!reportsErr) deletionSummary.push('policy_reports');

        // 2h. Activity Events
        const { error: activityErr } = await supabase
            .from('activity_events')
            .delete()
            .eq('policy_id', policy_id);
        if (!activityErr) deletionSummary.push('activity_events');

        // 2i. Notes
        const { error: notesErr } = await supabase
            .from('notes')
            .delete()
            .eq('policy_id', policy_id);
        if (!notesErr) deletionSummary.push('notes');

        // 2j. Manual Overrides
        const { error: overridesErr } = await supabase
            .from('manual_overrides')
            .delete()
            .eq('policy_id', policy_id);
        if (!overridesErr) deletionSummary.push('manual_overrides');

        // ── 3. Delete the policy record itself ──
        const { error: delPolicyErr } = await supabase
            .from('policies')
            .delete()
            .eq('id', policy_id);

        if (delPolicyErr) {
            return NextResponse.json(
                { success: false, error: `Failed to delete policy: ${delPolicyErr.message}` },
                { status: 500 }
            );
        }
        deletionSummary.push('policies');

        // ── 4. Optionally delete orphaned client ──
        let clientDeleted = false;
        if (delete_orphaned_client && clientId) {
            // Check if the client has any OTHER policies
            const { data: remainingPolicies } = await supabase
                .from('policies')
                .select('id')
                .eq('client_id', clientId)
                .limit(1);

            if (!remainingPolicies || remainingPolicies.length === 0) {
                // Client has no remaining policies — safe to delete

                // Delete client-level notes
                await supabase.from('notes').delete().eq('client_id', clientId);

                // Delete client-level activity events
                await supabase.from('activity_events').delete().eq('client_id', clientId);

                // Delete the client record
                const { error: delClientErr } = await supabase
                    .from('clients')
                    .delete()
                    .eq('id', clientId);

                if (!delClientErr) {
                    clientDeleted = true;
                    deletionSummary.push('clients (orphaned)');
                }
            }
        }

        return NextResponse.json({
            success: true,
            deleted_policy_id: policy_id,
            deleted_policy_number: policyNumber,
            client_deleted: clientDeleted,
            tables_cleaned: deletionSummary,
        });

    } catch (err: any) {
        logger.error('Delete', '[DELETE POLICY] Unexpected error:', err)
        return NextResponse.json(
            { success: false, error: err.message || 'Unknown server error' },
            { status: 500 }
        );
    }
}
