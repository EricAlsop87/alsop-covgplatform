import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service'] });
    if (isAuthError(auth)) return auth;

    const url = new URL(req.url);
    const windowDays = parseInt(url.searchParams.get('window') || '60', 10);

    const today = new Date();
    const windowDate = new Date();
    windowDate.setDate(today.getDate() + windowDays);

    const todayStr = today.toISOString().split('T')[0];
    const windowDateStr = windowDate.toISOString().split('T')[0];

    const admin = getSupabaseAdmin();
    
    const { data, error } = await admin
        .from('policy_terms')
        .select(`
            policy_id, 
            carrier_policy_number, 
            effective_date, 
            expiration_date, 
            annual_premium, 
            payment_status, 
            payment_plan,
            policies!inner (
                id, 
                policy_number,
                clients!inner (
                    id, 
                    named_insured, 
                    email, 
                    phone, 
                    mailing_address_raw
                )
            )
        `)
        .eq('is_current', true)
        .gte('expiration_date', todayStr)
        .lte('expiration_date', windowDateStr)
        .order('expiration_date', { ascending: true });

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Fetch document records to determine RCE status and download URL
    const policyIds = (data || []).map((t: any) => t.policy_id);
    let rceMap: Record<string, { has_rce: boolean; rce_url?: string }> = {};

    if (policyIds.length > 0) {
        const { data: docs } = await admin
            .from('platform_documents')
            .select('policy_id, document_type, storage_path, file_name')
            .in('policy_id', policyIds);

        if (docs) {
            for (const doc of docs) {
                if (doc.document_type?.toLowerCase()?.includes('rce') || doc.file_name?.toLowerCase()?.includes('rce')) {
                    const { data: signed } = await admin.storage
                        .from('documents')
                        .createSignedUrl(doc.storage_path, 3600);
                    
                    rceMap[doc.policy_id] = {
                        has_rce: true,
                        rce_url: signed?.signedUrl || undefined,
                    };
                }
            }
        }
    }

    const enrichedData = (data || []).map((item: any) => ({
        ...item,
        has_rce: rceMap[item.policy_id]?.has_rce || false,
        rce_url: rceMap[item.policy_id]?.rce_url || null,
    }));

    return NextResponse.json({ success: true, data: enrichedData });
}
