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
    // "john kijik" → match clients whose name contains BOTH "john" AND "kijik"
    const tokens = q.split(/\s+/).filter(t => t.length >= 2);
    if (tokens.length === 0) {
        return NextResponse.json({ clients: [], policies: [] });
    }

    // Build client query — each token must appear in named_insured
    let clientQuery = supabase
        .from('clients')
        .select('id, named_insured, email, phone');

    for (const token of tokens) {
        const safeToken = token.replace(/[%_,().*+?^${}|\[\]\\]/g, '');
        if (safeToken.length >= 2) {
            clientQuery = clientQuery.ilike('named_insured', `%${safeToken}%`);
        }
    }

    const clientsPromise = clientQuery.limit(10);

    // For policies, use the full query as a single pattern (policy numbers are structured)
    // Sanitize: strip PostgREST operators and special chars to prevent filter injection
    const sanitized = q.replace(/[%_,().*+?^${}|\[\]\\]/g, '');
    const pattern = `%${sanitized}%`;
    const policiesPromise = supabase
        .from('policies')
        .select('id, policy_number, property_address_raw, carrier_name, client_id, clients(named_insured)')
        .or(`policy_number.ilike."${pattern}",property_address_raw.ilike."${pattern}"`)
        .limit(5);

    const [clientsRes, policiesRes] = await Promise.all([clientsPromise, policiesPromise]);

    const clients = (clientsRes.data || []).map((c: any) => ({
        id: c.id,
        name: c.named_insured || 'Unknown',
        email: c.email || null,
        phone: c.phone || null,
        type: 'client' as const,
    }));

    const policies = (policiesRes.data || []).map((p: any) => ({
        id: p.id,
        policyNumber: p.policy_number || '—',
        address: p.property_address_raw || '—',
        carrier: p.carrier_name || '—',
        clientName: p.clients?.named_insured || '—',
        type: 'policy' as const,
    }));

    return NextResponse.json({ clients, policies });
}
