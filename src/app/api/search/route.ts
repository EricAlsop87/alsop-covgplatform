import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

/**
 * GET /api/search?q=<query>
 *
 * Global search across clients and policies.
 * Returns up to 5 clients + 5 policies matching the query.
 */
export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const q = req.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
        return NextResponse.json({ clients: [], policies: [] });
    }

    const supabase = getSupabaseAdmin();

    // Tokenize query into individual words for better matching
    const tokens = q.split(/\s+/).filter(t => t.length >= 2);
    if (tokens.length === 0) {
        return NextResponse.json({ clients: [], policies: [] });
    }

    const sanitized = q.replace(/[%_,().*+?^${}|\[\]\\]/g, '');
    const pattern = `%${sanitized}%`;

    // 1. Direct client query by name, email, or phone
    let clientQuery = supabase
        .from('clients')
        .select('id, named_insured, email, phone');

    // If query has multiple tokens, match named_insured with all tokens
    // Or if query looks like email/phone, match directly
    if (q.includes('@')) {
        clientQuery = clientQuery.ilike('email', pattern);
    } else {
        const hasDigitsOnly = /^\d[\d\s-]*$/.test(q);
        if (hasDigitsOnly && sanitized.length >= 4) {
            clientQuery = clientQuery.or(`phone.ilike."${pattern}",named_insured.ilike."${pattern}"`);
        } else {
            for (const token of tokens) {
                const safeToken = token.replace(/[%_,().*+?^${}|\[\]\\]/g, '');
                if (safeToken.length >= 2) {
                    clientQuery = clientQuery.ilike('named_insured', `%${safeToken}%`);
                }
            }
        }
    }

    const clientsPromise = clientQuery.limit(10);

    // 2. Policies query (by policy number or property address) with document presence
    const policiesPromise = supabase
        .from('policies')
        .select(`
            id,
            policy_number,
            property_address_raw,
            carrier_name,
            client_id,
            clients(id, named_insured, email, phone),
            platform_documents(id, doc_type),
            dec_pages(id)
        `)
        .or(`policy_number.ilike."${pattern}",property_address_raw.ilike."${pattern}"`)
        .limit(10);

    const [clientsRes, policiesRes] = await Promise.all([clientsPromise, policiesPromise]);

    const clientMap = new Map<string, any>();

    // Add direct client matches
    for (const c of clientsRes.data || []) {
        clientMap.set(c.id, {
            id: c.id,
            name: c.named_insured || 'Unknown',
            email: c.email || null,
            phone: c.phone || null,
            type: 'client' as const,
        });
    }

    // Also include clients found via matching policies (e.g. searching by policy number)
    for (const p of (policiesRes.data || []) as any[]) {
        const clientObj = Array.isArray(p.clients) ? p.clients[0] : p.clients;
        if (clientObj?.id && !clientMap.has(clientObj.id)) {
            clientMap.set(clientObj.id, {
                id: clientObj.id,
                name: clientObj.named_insured || 'Unknown',
                email: clientObj.email || null,
                phone: clientObj.phone || null,
                type: 'client' as const,
            });
        }
    }

    const clients = Array.from(clientMap.values()).slice(0, 10);

    const policies = ((policiesRes.data || []) as any[]).slice(0, 5).map((p: any) => {
        const clientObj = Array.isArray(p.clients) ? p.clients[0] : p.clients;
        const docs = p.platform_documents || [];
        const decs = p.dec_pages || [];
        const totalDocs = docs.length + decs.length;
        const hasDec = decs.length > 0;
        const hasRce = docs.some((d: any) => d.doc_type === 'rce');
        const hasDic = docs.some((d: any) => d.doc_type === 'dic_dec_page');
        const docTypes: string[] = [];
        if (hasDec) docTypes.push('DEC');
        if (hasRce) docTypes.push('RCE');
        if (hasDic) docTypes.push('DIC');

        return {
            id: p.id,
            policyNumber: p.policy_number || '—',
            address: p.property_address_raw || '—',
            carrier: p.carrier_name || '—',
            clientName: clientObj?.named_insured || '—',
            totalDocs,
            docTypes,
            type: 'policy' as const,
        };
    });

    return NextResponse.json({ clients, policies });
}
