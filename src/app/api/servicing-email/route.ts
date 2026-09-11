import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import type { ServicingEmailItem, ServicingEmailResponse, ServicingStatus } from '@/lib/servicingEmail';

export const dynamic = 'force-dynamic';

function detectDocCarrier(fileName?: string | null, rawText?: string | null, docType?: string | null): string | null {
    const fn = (fileName || '').toLowerCase();
    const txt = (rawText || '').toLowerCase().slice(0, 3000);
    const combined = `${fn} ${txt}`;

    if (
        combined.includes('american modern') ||
        combined.includes('americanmodern') ||
        combined.includes('homeowners flex') ||
        combined.includes('rce am') ||
        combined.includes('rcm am') ||
        combined.includes('rce_am') ||
        combined.includes('quote am') ||
        combined.includes('dic am') ||
        combined.includes('dic_am') ||
        /[\s_\-]AM[\s_\.\(\)\-]/i.test(fileName || '') ||
        /[\s_]AM$/i.test(fileName || '') ||
        /(?:^|[^0-9])005[0-9]{6,}/.test(fileName || '')
    ) {
        return 'AM';
    }

    if (
        combined.includes('aegis') ||
        combined.includes('obsidian') ||
        /(?:^|[^0-9])Q55[0-9]{4,}/i.test(fileName || '')
    ) {
        return 'Aegis';
    }

    if (
        combined.includes('sagesure') ||
        combined.includes('sage sure') ||
        /(?:^|[^A-Za-z0-9])CA[A-Za-z]{3}[0-9]{5,}/.test(fileName || '')
    ) {
        return 'SageSure';
    }

    if (
        combined.includes('psic') ||
        combined.includes('pacific specialty') ||
        combined.includes('pacificspecialty')
    ) {
        return 'PSIC';
    }

    if (
        combined.includes('bamboo') ||
        combined.includes('360value') ||
        combined.includes('360 value') ||
        /(?:^|[^A-Za-z0-9])Q100[0-9]{6,}/i.test(fileName || '')
    ) {
        return 'Bamboo';
    }

    if (docType === 'rce') {
        return 'Bamboo';
    }

    return null;
}

export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();

    try {
        // 1. Fetch all manual_overrides where field_name = 'servicing_email_item'
        const { data: overrides, error: ovError } = await admin
            .from('manual_overrides')
            .select('policy_id, new_value, created_at, updated_at')
            .eq('field_name', 'servicing_email_item');

        if (ovError) {
            return NextResponse.json({ error: ovError.message }, { status: 500 });
        }

        if (!overrides || overrides.length === 0) {
            return NextResponse.json({
                openItems: [],
                completedItems: [],
                stats: { totalReady: 0, totalEmailed: 0, totalCompleted: 0, totalWillNotProceed: 0 },
            } satisfies ServicingEmailResponse);
        }

        const policyIds = overrides.map(o => o.policy_id);

        // 2. Fetch policies with clients, policy_terms, documents, and dec_pages
        const [
            { data: policies },
            { data: terms },
            { data: docs },
            { data: decPages },
            { data: noDicOverrides },
        ] = await Promise.all([
            admin.from('policies').select('id, policy_number, carrier_name, property_address_raw, property_address_norm, client_id, clients(id, named_insured)').in('id', policyIds),
            admin.from('policy_terms').select('id, policy_id, effective_date, expiration_date, is_current').in('policy_id', policyIds).eq('is_current', true),
            admin.from('platform_documents').select('id, policy_id, doc_type, file_name, storage_path').in('policy_id', policyIds).in('doc_type', ['rce', 'dic_dec_page', 'es_doc']),
            admin.from('dec_pages').select('id, policy_id, dec_page_submissions(storage_path, file_name)').in('policy_id', policyIds),
            admin.from('manual_overrides').select('policy_id, new_value').in('policy_id', policyIds).eq('field_name', 'no_dic_available'),
        ]);

        const policyMap = new Map((policies || []).map(p => [p.id, p]));
        const termsMap = new Map((terms || []).map(t => [t.policy_id, t]));
        const noDicSet = new Set((noDicOverrides || []).filter(o => o.new_value === 'true' || o.new_value === '1').map(o => o.policy_id));

        // Build doc maps
        const policyRce: Record<string, { carrier: string | null; path?: string; name?: string }> = {};
        const policyDic: Record<string, { carrier: string | null; path?: string; name?: string }> = {};
        const policyEs: Record<string, { path?: string; name?: string }> = {};
        const policyDec: Record<string, { path?: string; name?: string }> = {};

        for (const d of docs || []) {
            const detected = detectDocCarrier(d.file_name, null, d.doc_type);
            if (d.doc_type === 'rce' && !policyRce[d.policy_id]) {
                policyRce[d.policy_id] = { carrier: detected, path: d.storage_path, name: d.file_name };
            } else if (d.doc_type === 'dic_dec_page' && !policyDic[d.policy_id]) {
                policyDic[d.policy_id] = { carrier: detected, path: d.storage_path, name: d.file_name };
            } else if (d.doc_type === 'es_doc' && !policyEs[d.policy_id]) {
                policyEs[d.policy_id] = { path: d.storage_path, name: d.file_name };
            }
        }

        for (const dp of decPages || []) {
            const sub = Array.isArray(dp.dec_page_submissions) ? dp.dec_page_submissions[0] : dp.dec_page_submissions;
            if (sub?.storage_path && !policyDec[dp.policy_id]) {
                policyDec[dp.policy_id] = { path: sub.storage_path, name: sub.file_name };
            }
        }

        const items: ServicingEmailItem[] = [];

        for (const ov of overrides) {
            let parsed: any = {};
            try {
                parsed = JSON.parse(ov.new_value);
            } catch {
                parsed = { status: 'ready', assigned_agent: '', notes: '' };
            }

            const pol = policyMap.get(ov.policy_id);
            const client = pol?.clients ? (Array.isArray(pol.clients) ? pol.clients[0] : pol.clients) : null;
            const term = termsMap.get(ov.policy_id);

            const rceInfo = policyRce[ov.policy_id];
            const dicInfo = policyDic[ov.policy_id];
            const esInfo = policyEs[ov.policy_id];
            const decInfo = policyDec[ov.policy_id];

            const item: ServicingEmailItem = {
                policy_id: ov.policy_id,
                policy_number: pol?.policy_number || '—',
                client_id: client?.id || pol?.client_id || '',
                named_insured: client?.named_insured || 'Unknown',
                property_address: pol?.property_address_norm || pol?.property_address_raw || '—',
                carrier_name: pol?.carrier_name || 'California FAIR Plan',
                effective_date: term?.effective_date || null,
                expiration_date: term?.expiration_date || null,
                status: (parsed.status as ServicingStatus) || 'ready',
                assigned_agent: parsed.assigned_agent || '',
                notes: parsed.notes || '',
                va_completed_at: parsed.va_completed_at || ov.created_at,
                va_user_name: parsed.va_user_name || null,
                emailed_at: parsed.emailed_at || null,
                completed_at: parsed.completed_at || null,

                has_rce: !!rceInfo,
                rce_carrier: rceInfo?.carrier || (rceInfo ? 'Uploaded' : null),
                rce_storage_path: rceInfo?.path || null,
                rce_file_name: rceInfo?.name || null,

                has_dic: !!dicInfo,
                dic_carrier: dicInfo?.carrier || (dicInfo ? 'Uploaded' : null),
                dic_storage_path: dicInfo?.path || null,
                dic_file_name: dicInfo?.name || null,
                no_dic_available: noDicSet.has(ov.policy_id),

                has_es: !!esInfo,
                es_storage_path: esInfo?.path || null,
                es_file_name: esInfo?.name || null,

                has_dec: !!decInfo,
                dec_storage_path: decInfo?.path || null,
                dec_file_name: decInfo?.name || null,
            };

            items.push(item);
        }

        // Separate open and completed items
        // Sort open items by near-expiry first (ascending expiration_date)
        const openItems = items
            .filter(i => i.status === 'ready')
            .sort((a, b) => {
                if (a.expiration_date && b.expiration_date) {
                    return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
                }
                if (a.expiration_date) return -1;
                if (b.expiration_date) return 1;
                return new Date(b.va_completed_at).getTime() - new Date(a.va_completed_at).getTime();
            });

        // Completed items sorted newest first
        const completedItems = items
            .filter(i => i.status !== 'ready')
            .sort((a, b) => {
                const timeA = a.completed_at || a.emailed_at || a.va_completed_at;
                const timeB = b.completed_at || b.emailed_at || b.va_completed_at;
                return new Date(timeB).getTime() - new Date(timeA).getTime();
            });

        const stats = {
            totalReady: items.filter(i => i.status === 'ready').length,
            totalEmailed: items.filter(i => i.status === 'emailed_to_agent').length,
            totalCompleted: items.filter(i => i.status === 'completed').length,
            totalWillNotProceed: items.filter(i => i.status === 'will_not_proceed').length,
        };

        return NextResponse.json({
            openItems,
            completedItems,
            stats,
        } satisfies ServicingEmailResponse);
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const { policy_id, notes, assigned_agent } = body;

        if (!policy_id) {
            return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
        }

        // Lookup staff name if available
        let staffName: string | null = null;
        if (auth.user?.id) {
            const { data: acc } = await admin.from('accounts').select('first_name, last_name').eq('id', auth.user.id).single();
            if (acc) staffName = `${acc.first_name || ''} ${acc.last_name || ''}`.trim() || null;
        }

        const payload = {
            status: 'ready',
            assigned_agent: assigned_agent || '',
            notes: notes || '',
            va_completed_at: new Date().toISOString(),
            va_user_name: staffName,
        };

        const { error } = await admin
            .from('manual_overrides')
            .upsert(
                {
                    policy_id,
                    field_name: 'servicing_email_item',
                    new_value: JSON.stringify(payload),
                    actor_id: auth.user?.id || null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'policy_id, field_name' }
            );

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, item: payload });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const { policy_id, status, assigned_agent, notes } = body;

        if (!policy_id) {
            return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
        }

        // Fetch existing
        const { data: existing } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('policy_id', policy_id)
            .eq('field_name', 'servicing_email_item')
            .single();

        let current: any = {};
        if (existing?.new_value) {
            try {
                current = JSON.parse(existing.new_value);
            } catch {
                current = {};
            }
        }

        const nextStatus = status !== undefined ? status : current.status || 'ready';
        const updatedPayload = {
            ...current,
            status: nextStatus,
            assigned_agent: assigned_agent !== undefined ? assigned_agent : current.assigned_agent || '',
            notes: notes !== undefined ? notes : current.notes || '',
            updated_at: new Date().toISOString(),
        };

        if (nextStatus === 'emailed_to_agent' && !current.emailed_at) {
            updatedPayload.emailed_at = new Date().toISOString();
        }
        if (nextStatus === 'completed' && !current.completed_at) {
            updatedPayload.completed_at = new Date().toISOString();
        }
        if (nextStatus === 'ready') {
            // Reopened
            updatedPayload.completed_at = null;
        }

        const { error } = await admin
            .from('manual_overrides')
            .upsert(
                {
                    policy_id,
                    field_name: 'servicing_email_item',
                    new_value: JSON.stringify(updatedPayload),
                    actor_id: auth.user?.id || null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'policy_id, field_name' }
            );

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, item: updatedPayload });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const policy_id = searchParams.get('policy_id');

    if (!policy_id) {
        return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
    }

    const { error } = await admin
        .from('manual_overrides')
        .delete()
        .eq('policy_id', policy_id)
        .eq('field_name', 'servicing_email_item');

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
