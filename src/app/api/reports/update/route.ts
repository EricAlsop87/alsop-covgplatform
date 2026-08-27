import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';


/**
 * PATCH /api/reports/update
 *
 * Update the ai_insights JSONB on an existing report.
 * Used by the report edit flow to save agent edits.
 *
 * Body: { reportId: string, ai_insights: object }
 */
export async function PATCH(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    try {
        const body = await req.json();
        const { reportId, ai_insights } = body;

        if (!reportId || !ai_insights) {
            return NextResponse.json(
                { error: 'reportId and ai_insights are required' },
                { status: 400 }
            );
        }

        const supabase = getSupabaseAdmin();

        const { data, error } = await supabase
            .from('policy_reports')
            .update({
                ai_insights,
                updated_at: new Date().toISOString(),
            })
            .eq('id', reportId)
            .select()
            .single();

        if (error) {
            logger.error('Update', 'Failed to update report:', { error: error.message })
            return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
        }

        return NextResponse.json({ success: true, report: data });
    } catch (err: any) {
        logger.error('Update', 'Error updating report:', err)
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
