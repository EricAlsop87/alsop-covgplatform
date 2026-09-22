import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import type {
    ServicingEmailItem,
    ServicingEmailResponse,
    ServicingStatus,
    SentEmailItem,
    ReplyThreadItem,
    PendingHandoffItem,
} from '@/lib/servicingEmail';

export const dynamic = 'force-dynamic';

function detectDocCarrier(fileName?: string | null, rawText?: string | null, docType?: string | null): string | null {
    const fn = (fileName || '').toLowerCase();
    const txt = (rawText || '').toLowerCase().slice(0, 5000);
    const combined = `${fn} ${txt}`;

    // 1. Aegis
    if (
        combined.includes('aegis') ||
        combined.includes('webservices@aegis') ||
        combined.includes('obsidian') ||
        /(?:^|[^0-9])Q5[0-9]{5,}/i.test(fileName || '')
    ) {
        return 'Aegis';
    }

    // 2. American Modern
    if (
        combined.includes('american modern') ||
        combined.includes('americanmodern') ||
        combined.includes('homeowners flex') ||
        combined.includes('manufactured home') ||
        combined.includes('cotality') ||
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

    // 3. PSIC (Pacific Specialty)
    if (
        combined.includes('psic') ||
        combined.includes('pacific specialty') ||
        combined.includes('pacificspecialty') ||
        /(?:^|[^0-9])HO62[0-9]{6,}/i.test(fileName || '') ||
        /(?:^|[^0-9])HO6[0-9]{6,}/i.test(fileName || '')
    ) {
        return 'PSIC';
    }

    // 4. SageSure
    if (
        combined.includes('sagesure')
    ) {
        return 'SageSure';
    }

    // 5. Bamboo
    if (
        combined.includes('bamboo') ||
        combined.includes('guidewire@bamboo') ||
        combined.includes('bambooinsurance') ||
        combined.includes('casnh') ||
        /(?:^|[^A-Za-z0-9])Q100[0-9]{5,}/i.test(fileName || '')
    ) {
        return 'Bamboo';
    }

    if (docType === 'rce' && (combined.includes('360value') || combined.includes('360 value'))) {
        return '360Value';
    }

    return null;
}

export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();

    try {
        // 1. Fetch all manual_overrides where field_name in relevant set
        const { data: overrides, error: ovError } = await admin
            .from('manual_overrides')
            .select('policy_id, field_name, new_value, created_at, updated_at')
            .in('field_name', ['servicing_email_item', 'cfp_mail_sent', 'servicing_email_thread', 'no_dic_available']);

        if (ovError) {
            return NextResponse.json({ error: ovError.message }, { status: 500 });
        }

        if (!overrides || overrides.length === 0) {
            return NextResponse.json({
                sentItems: [],
                replyItems: [],
                pendingItems: [],
                openItems: [],
                completedItems: [],
                stats: {
                    totalSent: 0,
                    totalReplies: 0,
                    unreadReplies: 0,
                    pendingHandoffs: 0,
                    totalReady: 0,
                    totalEmailed: 0,
                    totalEmailNotNeeded: 0,
                    totalCompleted: 0,
                    totalWillNotProceed: 0,
                },
            } satisfies ServicingEmailResponse);
        }

        const policyIds = Array.from(new Set(overrides.map(o => o.policy_id).filter(Boolean)));

        if (policyIds.length === 0) {
            return NextResponse.json({
                sentItems: [],
                replyItems: [],
                pendingItems: [],
                openItems: [],
                completedItems: [],
                stats: {
                    totalSent: 0,
                    totalReplies: 0,
                    unreadReplies: 0,
                    pendingHandoffs: 0,
                    totalReady: 0,
                    totalEmailed: 0,
                    totalEmailNotNeeded: 0,
                    totalCompleted: 0,
                    totalWillNotProceed: 0,
                },
            } satisfies ServicingEmailResponse);
        }

        // 2. Fetch policies with clients, policy_terms, documents, and dec_pages
        const [
            { data: policies },
            { data: terms },
            { data: docs },
            { data: decPages },
        ] = await Promise.all([
            admin.from('policies').select('id, policy_number, carrier_name, property_address_raw, property_address_norm, client_id, created_at, clients(id, named_insured)').in('id', policyIds),
            admin.from('policy_terms').select('id, policy_id, effective_date, expiration_date, is_current').in('policy_id', policyIds).eq('is_current', true),
            admin.from('platform_documents').select('id, policy_id, doc_type, file_name, storage_path').in('policy_id', policyIds).in('doc_type', ['rce', 'dic_dec_page', 'es_doc']),
            admin.from('dec_pages').select('id, policy_id, dec_page_submissions(storage_path, file_name)').in('policy_id', policyIds),
        ]);

        const policyMap = new Map((policies || []).map(p => [p.id, p]));
        const termsMap = new Map((terms || []).map(t => [t.policy_id, t]));

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

        // Group overrides by policy_id
        const itemOvMap = new Map<string, { val: any; created_at: string; updated_at: string }>();
        const sentOvMap = new Map<string, { val: any; created_at: string; updated_at: string }>();
        const threadOvMap = new Map<string, any[]>();
        const noDicSet = new Set<string>();

        for (const ov of overrides) {
            if (ov.field_name === 'servicing_email_item') {
                try {
                    itemOvMap.set(ov.policy_id, { val: JSON.parse(ov.new_value), created_at: ov.created_at, updated_at: ov.updated_at });
                } catch {
                    itemOvMap.set(ov.policy_id, { val: { status: 'ready', assigned_agent: '', notes: '' }, created_at: ov.created_at, updated_at: ov.updated_at });
                }
            } else if (ov.field_name === 'cfp_mail_sent') {
                try {
                    sentOvMap.set(ov.policy_id, { val: JSON.parse(ov.new_value), created_at: ov.created_at, updated_at: ov.updated_at });
                } catch {
                    sentOvMap.set(ov.policy_id, { val: {}, created_at: ov.created_at, updated_at: ov.updated_at });
                }
            } else if (ov.field_name === 'servicing_email_thread') {
                try {
                    const parsed = JSON.parse(ov.new_value);
                    if (Array.isArray(parsed)) threadOvMap.set(ov.policy_id, parsed);
                } catch {}
            } else if (ov.field_name === 'no_dic_available') {
                if (ov.new_value === 'true' || ov.new_value === '1') {
                    noDicSet.add(ov.policy_id);
                }
            }
        }

        const legacyItems: ServicingEmailItem[] = [];
        const sentItems: SentEmailItem[] = [];
        const replyItems: ReplyThreadItem[] = [];
        const pendingItems: PendingHandoffItem[] = [];

        for (const policyId of policyIds) {
            const pol = policyMap.get(policyId);
            if (!pol) continue;

            const client = pol?.clients ? (Array.isArray(pol.clients) ? pol.clients[0] : pol.clients) : null;
            const term = termsMap.get(policyId);
            const rceInfo = policyRce[policyId];
            const dicInfo = policyDic[policyId];
            const esInfo = policyEs[policyId];
            const decInfo = policyDec[policyId];

            const itemOv = itemOvMap.get(policyId);
            const sentOv = sentOvMap.get(policyId);
            const threadMessages = threadOvMap.get(policyId) || [];

            const itemData = itemOv?.val || {};
            const sentData = sentOv?.val || {};

            // Calculate reply info
            const inboundMessages = threadMessages.filter(m => m.direction === 'inbound');
            const hasReply = inboundMessages.length > 0 || !!itemData.has_agent_reply;
            const isUnreadReply = inboundMessages.some(m => !m.isRead) || (itemData.has_agent_reply && inboundMessages.length === 0);
            const lastInbound = inboundMessages[inboundMessages.length - 1];
            const lastReplyAt = lastInbound?.sentAt || itemData.last_reply_at || null;
            const lastReplyFrom = lastInbound?.senderName || lastInbound?.senderEmail || itemData.last_reply_from || null;
            const lastReplyText = lastInbound?.bodyText || itemData.last_reply_text || null;

            // Legacy ServicingEmailItem
            if (itemOv) {
                const legacyItem: ServicingEmailItem = {
                    policy_id: policyId,
                    policy_number: pol.policy_number || '—',
                    client_id: client?.id || pol.client_id || '',
                    named_insured: client?.named_insured || 'Unknown',
                    property_address: pol.property_address_norm || pol.property_address_raw || '—',
                    carrier_name: pol.carrier_name || 'California FAIR Plan',
                    effective_date: term?.effective_date || null,
                    expiration_date: term?.expiration_date || null,
                    status: (itemData.status as ServicingStatus) || 'ready',
                    outcome: itemData.outcome || null,
                    assigned_agent: itemData.assigned_agent || (sentData.sent_to_names?.[0] || ''),
                    assigned_agent_email: itemData.assigned_agent_email || (sentData.sent_to?.[0] || null),
                    notes: itemData.notes || '',
                    va_completed_at: itemData.va_completed_at || itemOv.created_at,
                    va_user_name: itemData.va_user_name || sentData.sent_by || null,
                    emailed_at: itemData.emailed_at || sentData.sent_at || null,
                    completed_at: itemData.completed_at || null,
                    has_agent_reply: hasReply,
                    last_reply_at: lastReplyAt,
                    last_reply_text: lastReplyText,
                    last_reply_from: lastReplyFrom,

                    has_rce: !!rceInfo,
                    rce_carrier: rceInfo?.carrier || (rceInfo ? 'Uploaded' : null),
                    rce_storage_path: rceInfo?.path || null,
                    rce_file_name: rceInfo?.name || null,

                    has_dic: !!dicInfo,
                    dic_carrier: dicInfo?.carrier || (dicInfo ? 'Uploaded' : null),
                    dic_storage_path: dicInfo?.path || null,
                    dic_file_name: dicInfo?.name || null,
                    no_dic_available: noDicSet.has(policyId),

                    has_es: !!esInfo,
                    es_storage_path: esInfo?.path || null,
                    es_file_name: esInfo?.name || null,

                    has_dec: !!decInfo,
                    dec_storage_path: decInfo?.path || null,
                    dec_file_name: decInfo?.name || null,
                };
                legacyItems.push(legacyItem);
            }

            // 1. Sent Box Item
            if (sentOv || itemData.status === 'emailed_to_agent' || itemData.emailed_at) {
                const sentAt = sentData.sent_at || itemData.emailed_at || sentOv?.created_at || itemOv?.updated_at || new Date().toISOString();
                const sentBy = sentData.sent_by || itemData.va_user_name || 'VA Staff';
                const sentTo = sentData.sent_to || (itemData.assigned_agent_email ? [itemData.assigned_agent_email] : []);
                const sentToNames = sentData.sent_to_names || (itemData.assigned_agent ? [itemData.assigned_agent] : []);
                const subject = sentData.subject || (client?.named_insured ? `${client.named_insured} - CFP Servicing Renewal Package` : 'CFP Servicing Renewal Package');

                sentItems.push({
                    id: policyId,
                    policy_id: policyId,
                    policy_number: pol.policy_number || '—',
                    client_id: client?.id || pol.client_id || '',
                    named_insured: client?.named_insured || 'Unknown',
                    property_address: pol.property_address_norm || pol.property_address_raw || '—',
                    carrier_name: pol.carrier_name || 'California FAIR Plan',
                    sent_at: sentAt,
                    sent_by: sentBy,
                    sent_by_email: sentData.sent_by_email || null,
                    sent_to: sentTo,
                    sent_to_names: sentToNames,
                    subject: subject,
                    has_dec: !!decInfo,
                    has_rce: !!rceInfo,
                    rce_carrier: rceInfo?.carrier || null,
                    has_dic: !!dicInfo,
                    dic_carrier: dicInfo?.carrier || null,
                    has_es: !!esInfo,
                    carrier_quotes: sentData.carrier_quotes || null,
                    has_reply: hasReply,
                    last_reply_at: lastReplyAt,
                    last_reply_from: lastReplyFrom,
                    last_reply_text: lastReplyText,
                    is_unread_reply: isUnreadReply,
                    total_messages: threadMessages.length || 1,
                });
            }

            // 2. Reply Thread Item
            if (hasReply) {
                replyItems.push({
                    id: policyId,
                    policy_id: policyId,
                    policy_number: pol.policy_number || '—',
                    client_id: client?.id || pol.client_id || '',
                    named_insured: client?.named_insured || 'Unknown',
                    property_address: pol.property_address_norm || pol.property_address_raw || '—',
                    carrier_name: pol.carrier_name || 'California FAIR Plan',
                    subject: sentData.subject || (client?.named_insured ? `${client.named_insured} - CFP Servicing Renewal Package` : 'CFP Servicing Renewal Package'),
                    last_reply_at: lastReplyAt || new Date().toISOString(),
                    last_reply_from: lastReplyFrom || 'Manager',
                    last_reply_from_email: lastInbound?.senderEmail || itemData.assigned_agent_email || null,
                    last_reply_text: lastReplyText || 'New response received from manager.',
                    is_unread: isUnreadReply,
                    total_messages: threadMessages.length || 1,
                    sent_to: sentData.sent_to || (itemData.assigned_agent_email ? [itemData.assigned_agent_email] : []),
                    sent_to_names: sentData.sent_to_names || (itemData.assigned_agent ? [itemData.assigned_agent] : []),
                });
            }

            // 3. Pending Handoff Item
            if (itemOv && (itemData.status === 'ready' || !itemData.status) && !sentOv && itemData.status !== 'completed' && itemData.status !== 'will_not_proceed') {
                pendingItems.push({
                    policy_id: policyId,
                    policy_number: pol.policy_number || '—',
                    client_id: client?.id || pol.client_id || '',
                    named_insured: client?.named_insured || 'Unknown',
                    property_address: pol.property_address_norm || pol.property_address_raw || '—',
                    carrier_name: pol.carrier_name || 'California FAIR Plan',
                    expiration_date: term?.expiration_date || null,
                    has_dec: !!decInfo,
                    has_rce: !!rceInfo,
                    rce_carrier: rceInfo?.carrier || null,
                    has_dic: !!dicInfo,
                    dic_carrier: dicInfo?.carrier || null,
                    has_es: !!esInfo,
                    ready_since: itemData.va_completed_at || itemOv.created_at,
                    notes: itemData.notes || '',
                });
            }
        }

        // Sort sentItems newest first
        sentItems.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

        // Sort replyItems newest reply first
        replyItems.sort((a, b) => new Date(b.last_reply_at).getTime() - new Date(a.last_reply_at).getTime());

        // Sort pendingItems by near-expiry ascending, then ready_since descending
        pendingItems.sort((a, b) => {
            if (a.expiration_date && b.expiration_date) {
                return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
            }
            if (a.expiration_date) return -1;
            if (b.expiration_date) return 1;
            return new Date(b.ready_since).getTime() - new Date(a.ready_since).getTime();
        });

        // Legacy sort
        const openItems = legacyItems
            .filter(i => i.status === 'ready' || i.status === 'emailed_to_agent' || i.status === 'email_not_needed')
            .sort((a, b) => {
                if (a.expiration_date && b.expiration_date) {
                    return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
                }
                if (a.expiration_date) return -1;
                if (b.expiration_date) return 1;
                return new Date(b.va_completed_at).getTime() - new Date(a.va_completed_at).getTime();
            });

        const completedItems = legacyItems
            .filter(i => i.status === 'completed' || i.status === 'will_not_proceed')
            .sort((a, b) => {
                const timeA = a.completed_at || a.emailed_at || a.va_completed_at;
                const timeB = b.completed_at || b.emailed_at || b.va_completed_at;
                return new Date(timeB).getTime() - new Date(timeA).getTime();
            });

        const stats = {
            totalSent: sentItems.length,
            totalReplies: replyItems.length,
            unreadReplies: replyItems.filter(r => r.is_unread).length,
            pendingHandoffs: pendingItems.length,
            totalReady: legacyItems.filter(i => i.status === 'ready').length,
            totalEmailed: legacyItems.filter(i => i.status === 'emailed_to_agent').length,
            totalEmailNotNeeded: legacyItems.filter(i => i.status === 'email_not_needed').length,
            totalCompleted: legacyItems.filter(i => i.status === 'completed').length,
            totalWillNotProceed: legacyItems.filter(i => i.status === 'will_not_proceed').length,
        };

        return NextResponse.json({
            sentItems,
            replyItems,
            pendingItems,
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

        // Clean up any previous return info if it was re-sent
        await admin
            .from('manual_overrides')
            .delete()
            .eq('policy_id', policy_id)
            .eq('field_name', 'servicing_return_info');

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
        const { policy_id, status, assigned_agent, notes, outcome } = body;

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

        // Determine next status based on status or outcome
        let nextStatus = status !== undefined ? status : current.status || 'ready';
        let nextOutcome = outcome !== undefined ? outcome : current.outcome || null;

        if (outcome === 'renewed' && status === undefined) {
            nextStatus = 'completed';
        } else if (outcome === 'cancelled' && status === undefined) {
            nextStatus = 'will_not_proceed';
        } else if (outcome === 'new_policy' && status === undefined) {
            nextStatus = 'completed';
        }

        const updatedPayload = {
            ...current,
            status: nextStatus,
            outcome: nextOutcome,
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
