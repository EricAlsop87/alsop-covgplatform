import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

// ---------------------------------------------------------------------------
// GET /api/csv-import/progress?batchId=...
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
    try {
        const supabaseAdmin = getSupabaseAdmin();

        // Auth
        const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service'] });
        if (isAuthError(auth)) return auth;

        const batchId = request.nextUrl.searchParams.get('batchId');
        if (!batchId) {
            return NextResponse.json({ error: 'Missing batchId' }, { status: 400 });
        }

        const { data: batch, error: batchErr } = await supabaseAdmin
            .from('policy_import_batches')
            .select('status, progress_pct, progress_message')
            .eq('id', batchId)
            .single();

        if (batchErr || !batch) {
            return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
        }

        return NextResponse.json({
            status: batch.status,
            progress_pct: batch.progress_pct ?? 0,
            progress_message: batch.progress_message ?? '',
        });
    } catch {
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
