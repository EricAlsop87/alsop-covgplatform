import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { executePolicyMerge } from '@/lib/policyMerge';

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const supabaseAdmin = getSupabaseAdmin();
    try {
        const body = await req.json();
        const { survivor_id, merged_id } = body;
        const performed_by = auth.user.id;

        if (!survivor_id || !merged_id) {
            return NextResponse.json({ error: 'survivor_id and merged_id are required' }, { status: 400 });
        }

        const result = await executePolicyMerge(supabaseAdmin, survivor_id, merged_id, performed_by);
        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Failed to merge policy' }, { status: 400 });
        }

        return NextResponse.json({ success: true, survivor_id: result.survivor_id, terms_migrated: result.terms_migrated });
    } catch (error: any) {
        logger.error('Merge', 'Policy Merge Transaction Error:', error);
        return NextResponse.json({ error: error.message || 'Server error during merge transaction' }, { status: 500 });
    }
}
