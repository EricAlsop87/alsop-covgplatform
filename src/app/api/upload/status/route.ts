import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const ids = searchParams.get('ids');
        if (!ids) {
            return NextResponse.json({ success: false, message: 'Missing ids' }, { status: 400 });
        }

        const idArray = ids.split(',').filter(Boolean);
        if (idArray.length === 0) {
            return NextResponse.json({ success: true, data: [] });
        }

        // Must authenticate to prevent polling abuse, even though we use admin for DB read
        const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
        if (isAuthError(auth)) return auth;
        const user = auth.user;

        const admin = getSupabaseAdmin();
        const { data, error } = await admin
            .from('dec_page_submissions')
            .select('id, status, error_message, file_name, processing_step')
            .in('id', idArray)
            .eq('account_id', user.id); // Security: only their own submissions

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });

    } catch (err) {
        return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
    }
}
