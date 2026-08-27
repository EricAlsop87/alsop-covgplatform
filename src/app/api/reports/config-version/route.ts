import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

/**
 * GET /api/reports/config-version
 * Returns the latest report config changelog version for stale report detection.
 */
export async function GET() {
    try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
            .from('report_config_changelog')
            .select('version_number, changed_at')
            .order('changed_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) {
            return NextResponse.json({ version_number: 0, changed_at: null });
        }

        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ version_number: 0, changed_at: null });
    }
}
