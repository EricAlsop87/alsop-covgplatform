import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { normalizePolicyNumber } from '@/lib/normalization';

export const dynamic = 'force-dynamic';

// ── Types ──────────────────────────────────────────────────────────────────
export interface CFPTermRow {
    // Policy
    policy_id: string;
    policy_number: string;
    base_policy: string;
    suffix: string | null;
    property_address: string;
    carrier_name: string;
    has_bamboo_coverage: boolean;
    // Client
    client_id: string;
    named_insured: string;
    // Term
    policy_term_id: string;
    effective_date: string | null;
    expiration_date: string | null;
    annual_premium: number | null;
    payment_status: string | null;
    payment_plan: string | null;
    is_current: boolean;
    // Document presence
    has_dec: boolean;
    has_rce: boolean;
    rce_carrier: string | null;
    has_dic: boolean;
    dic_carrier: string | null;
    has_es: boolean;
    // Term type within family (set by API after grouping)
    term_type: 'ORIGINAL' | 'RENEWAL';
    term_index: number;
}

export interface CFPFamily {
    base_policy: string;
    terms: CFPTermRow[];
}

// ── Carrier Detection Helper ──────────────────────────────────────────────
function detectDocCarrier(fileName?: string | null, rawText?: string | null, docType?: string | null): string | null {
    const fn = (fileName || '').toLowerCase();
    const txt = (rawText || '').toLowerCase().slice(0, 3000);
    const combined = `${fn} ${txt}`;

    // 1. American Modern (AM)
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

    // 2. Aegis (including Obsidian, Aegis Security, Aegis General, Q55 quotes)
    if (
        combined.includes('aegis') ||
        combined.includes('obsidian') ||
        /(?:^|[^0-9])Q55[0-9]{4,}/i.test(fileName || '')
    ) {
        return 'Aegis';
    }

    // 3. SageSure (CASNH, CASNL, CAICH, CAASL, CAICL, etc.)
    if (
        combined.includes('sagesure') ||
        combined.includes('sage sure') ||
        /(?:^|[^A-Za-z0-9])CA[A-Za-z]{3}[0-9]{5,}/.test(fileName || '')
    ) {
        return 'SageSure';
    }

    // 4. PSIC (Pacific Specialty)
    if (
        combined.includes('psic') ||
        combined.includes('pacific specialty') ||
        combined.includes('pacificspecialty')
    ) {
        return 'PSIC';
    }

    // 5. Bamboo
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

export interface CFPSummaryStats {
    total_policies: number;
    total_families: number;
    expiring_this_month: number;
    missing_dec: number;
    uploaded_dec?: number;
    missing_rce: number;
    uploaded_rce?: number;
    missing_dic: number;
    uploaded_dic?: number;
    missing_es: number;
    uploaded_es?: number;
}

// ── GET /api/cfp-summary ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service'] });
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month'); // optional, 1-12
    const search = searchParams.get('search')?.trim() || '';
    const statsOnly = searchParams.get('stats_only') === 'true';

    const admin = getSupabaseAdmin();

    // ── 1. Stats query (always returned) ──────────────────────────────────
    if (statsOnly) {
        const stats = await computeStats(admin);
        return NextResponse.json({ success: true, stats });
    }

    // ── 2. Main data query ────────────────────────────────────────────────
    // Fetch all CFP policy_terms filtered by expiration year/month
    let termsQuery = admin
        .from('policy_terms')
        .select(`
            id,
            policy_id,
            effective_date,
            expiration_date,
            annual_premium,
            payment_status,
            payment_plan,
            is_current,
            dic_exists,
            es_exists,
            policies!inner (
                id,
                policy_number,
                property_address_raw,
                carrier_name,
                client_id,
                clients!inner (
                    id,
                    named_insured
                )
            )
        `)
        .ilike('policies.policy_number', 'CFP %');

    // Year filter
    if (year) {
        const yearNum = parseInt(year, 10);
        const startDate = `${yearNum}-01-01`;
        const endDate = `${yearNum}-12-31`;
        termsQuery = termsQuery
            .gte('expiration_date', startDate)
            .lte('expiration_date', endDate);
    }

    // Month filter (within the year)
    if (year && month) {
        const monthNum = parseInt(month, 10).toString().padStart(2, '0');
        const yearNum = year;
        const startDate = `${yearNum}-${monthNum}-01`;
        // End of month
        const endDate = new Date(parseInt(yearNum), parseInt(month), 0)
            .toISOString().split('T')[0];
        termsQuery = termsQuery
            .gte('expiration_date', startDate)
            .lte('expiration_date', endDate);
    }

    termsQuery = termsQuery.order('expiration_date', { ascending: true });

    const { data: terms, error: termsError } = await termsQuery;
    if (termsError) {
        return NextResponse.json({ success: false, error: termsError.message }, { status: 500 });
    }

    if (!terms || terms.length === 0) {
        return NextResponse.json({ success: true, families: [], total_terms: 0 });
    }

    // ── 3. Gather all policy_ids from result ──────────────────────────────
    const policyIds = [...new Set((terms as any[]).map((t: any) => t.policy_id))];

    // Helper to batch large in() queries in chunks of 150 to respect HTTP URL limits
    const CHUNK_SIZE = 150;
    async function chunkedInQuery<T>(
        table: string,
        select: string,
        inCol: string,
        inValues: string[],
        extraFilter?: (q: any) => any
    ): Promise<T[]> {
        const results: T[] = [];
        for (let i = 0; i < inValues.length; i += CHUNK_SIZE) {
            const chunk = inValues.slice(i, i + CHUNK_SIZE);
            let q = admin.from(table).select(select).in(inCol, chunk);
            if (extraFilter) q = extraFilter(q);
            const { data } = await q;
            if (data) results.push(...(data as T[]));
        }
        return results;
    }

    // ── 4. Check dec_pages (by policy_id) ────────────────────────────────
    const decPages = await chunkedInQuery<{ policy_id: string }>(
        'dec_pages',
        'policy_id',
        'policy_id',
        policyIds
    );
    const policyIdsWithDec = new Set(decPages.map(d => d.policy_id));

    // ── 5. Check platform_documents (by policy_id and doc_type) ──────────
    const docs = await chunkedInQuery<{
        policy_id: string;
        policy_term_id?: string;
        doc_type: string;
        file_name?: string;
        raw_text?: string;
    }>(
        'platform_documents',
        'policy_id, policy_term_id, doc_type, file_name, raw_text',
        'policy_id',
        policyIds,
        q => q.in('doc_type', ['rce', 'dic_dec_page', 'es_doc'])
    );

    // Build per-policy doc sets and carrier maps
    const policyDocTypes: Record<string, Set<string>> = {};
    const policyRceCarrier: Record<string, string> = {};
    const policyDicCarrier: Record<string, string> = {};

    for (const doc of docs) {
        if (!policyDocTypes[doc.policy_id]) {
            policyDocTypes[doc.policy_id] = new Set();
        }
        policyDocTypes[doc.policy_id].add(doc.doc_type);

        const detected = detectDocCarrier(doc.file_name, doc.raw_text, doc.doc_type);
        if (doc.doc_type === 'rce' && detected && !policyRceCarrier[doc.policy_id]) {
            policyRceCarrier[doc.policy_id] = detected;
        } else if (doc.doc_type === 'dic_dec_page' && detected && !policyDicCarrier[doc.policy_id]) {
            policyDicCarrier[doc.policy_id] = detected;
        }
    }

    // ── 5b. Check Bamboo coverage via manual_overrides ───────────────────
    const bambooOverrides = await chunkedInQuery<{ policy_id: string; new_value: string }>(
        'manual_overrides',
        'policy_id, new_value',
        'policy_id',
        policyIds,
        q => q.eq('field_name', 'has_bamboo_coverage')
    );

    const bambooCoverageSet = new Set<string>();
    for (const ov of bambooOverrides) {
        if (ov.new_value === 'true' || ov.new_value === '1') {
            bambooCoverageSet.add(ov.policy_id);
        }
    }

    // ── 6. Build flat rows ────────────────────────────────────────────────
    const rows: CFPTermRow[] = (terms as any[]).map((t: any) => {
        const policy = t.policies;
        const client = policy?.clients;
        const policyId = t.policy_id;
        const docSet = policyDocTypes[policyId] || new Set<string>();

        const { basePolicy, suffix } = normalizePolicyNumber(policy?.policy_number);

        const hasRce = docSet.has('rce');
        const rceCarrier = policyRceCarrier[policyId] || (hasRce ? 'Bamboo' : null);

        const hasDic = docSet.has('dic_dec_page') || !!t.dic_exists;
        const dicFromPn = detectDocCarrier(t.dic_policy_number, null, 'dic_dec_page');
        const dicCarrier = policyDicCarrier[policyId] || dicFromPn || (hasDic ? 'DIC' : null);

        return {
            policy_id: policyId,
            policy_number: policy?.policy_number || '',
            base_policy: basePolicy || policy?.policy_number || '',
            suffix: suffix || null,
            property_address: policy?.property_address_raw || '',
            carrier_name: policy?.carrier_name || '',
            has_bamboo_coverage: bambooCoverageSet.has(policyId),
            client_id: client?.id || '',
            named_insured: client?.named_insured || '',
            policy_term_id: t.id,
            effective_date: t.effective_date,
            expiration_date: t.expiration_date,
            annual_premium: t.annual_premium ? parseFloat(t.annual_premium) : null,
            payment_status: t.payment_status,
            payment_plan: t.payment_plan,
            is_current: t.is_current,
            has_dec: policyIdsWithDec.has(policyId),
            has_rce: hasRce,
            rce_carrier: rceCarrier,
            has_dic: hasDic,
            dic_carrier: dicCarrier,
            has_es: docSet.has('es_doc') || !!t.es_exists,
            term_type: 'ORIGINAL', // Will be recalculated below
            term_index: 0,
        };
    });

    // ── 7. Apply search filter ────────────────────────────────────────────
    let filtered = rows;
    if (search) {
        const q = search.toLowerCase();
        filtered = rows.filter(r =>
            r.policy_number.toLowerCase().includes(q) ||
            r.base_policy.toLowerCase().includes(q) ||
            r.named_insured.toLowerCase().includes(q) ||
            r.property_address.toLowerCase().includes(q)
        );
    }

    // ── 8. Group into families ────────────────────────────────────────────
    const familyMap: Record<string, CFPTermRow[]> = {};
    for (const row of filtered) {
        if (!familyMap[row.base_policy]) {
            familyMap[row.base_policy] = [];
        }
        familyMap[row.base_policy].push(row);
    }

    // Sort terms within each family by effective_date, label ORIGINAL/RENEWAL
    const families: CFPFamily[] = Object.entries(familyMap).map(([base_policy, termRows]) => {
        // Sort by effective_date asc (oldest = ORIGINAL)
        const sorted = [...termRows].sort((a, b) => {
            const da = a.effective_date || '';
            const db = b.effective_date || '';
            return da.localeCompare(db);
        });

        sorted.forEach((row, i) => {
            row.term_index = i;
            row.term_type = i === 0 ? 'ORIGINAL' : 'RENEWAL';
        });

        return { base_policy, terms: sorted };
    });

    // Sort families by earliest expiration_date in the family
    families.sort((a, b) => {
        const ea = a.terms[0]?.expiration_date || '';
        const eb = b.terms[0]?.expiration_date || '';
        return ea.localeCompare(eb);
    });

    return NextResponse.json({
        success: true,
        families,
        total_terms: filtered.length,
        total_families: families.length,
    });
}

// ── PATCH /api/cfp-summary — toggle bamboo coverage ───────────────────────
export async function PATCH(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service'] });
    if (isAuthError(auth)) return auth;

    const body = await req.json();
    const { policy_id, has_bamboo_coverage } = body;

    if (!policy_id || typeof has_bamboo_coverage !== 'boolean') {
        return NextResponse.json({ success: false, error: 'policy_id and has_bamboo_coverage required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Persist via manual_overrides
    const { error } = await admin
        .from('manual_overrides')
        .upsert(
            {
                policy_id,
                field_name: 'has_bamboo_coverage',
                new_value: String(has_bamboo_coverage),
            },
            { onConflict: 'policy_id, field_name' }
        );

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, has_bamboo_coverage });
}

// ── Helper: compute stats ─────────────────────────────────────────────────
async function computeStats(admin: ReturnType<typeof getSupabaseAdmin>): Promise<CFPSummaryStats> {
    const today = new Date();
    const thisYear = today.getFullYear();
    const thisMonth = today.getMonth() + 1;
    const monthStr = thisMonth.toString().padStart(2, '0');
    const monthStart = `${thisYear}-${monthStr}-01`;
    const lastDay = new Date(thisYear, thisMonth, 0).getDate();
    const monthEnd = `${thisYear}-${monthStr}-${lastDay.toString().padStart(2, '0')}`;

    // Total CFP policies
    const { count: total_policies } = await admin
        .from('policies')
        .select('id', { count: 'exact', head: true })
        .ilike('policy_number', 'CFP %');

    const total = total_policies || 0;

    // Expiring this month (current terms)
    const { count: expiring_this_month } = await admin
        .from('policy_terms')
        .select('id, policies!inner(id, policy_number)', { count: 'exact', head: true })
        .eq('is_current', true)
        .gte('expiration_date', monthStart)
        .lte('expiration_date', monthEnd)
        .ilike('policies.policy_number', 'CFP %');

    // Document counts via exact joins
    const [decRes, rceRes, dicRes, esRes] = await Promise.all([
        admin.from('dec_pages').select('id, policies!inner(policy_number)', { count: 'exact', head: true }).ilike('policies.policy_number', 'CFP %'),
        admin.from('platform_documents').select('id, policies!inner(policy_number)', { count: 'exact', head: true }).eq('doc_type', 'rce').ilike('policies.policy_number', 'CFP %'),
        admin.from('platform_documents').select('id, policies!inner(policy_number)', { count: 'exact', head: true }).eq('doc_type', 'dic_dec_page').ilike('policies.policy_number', 'CFP %'),
        admin.from('platform_documents').select('id, policies!inner(policy_number)', { count: 'exact', head: true }).eq('doc_type', 'es_doc').ilike('policies.policy_number', 'CFP %'),
    ]);

    const hasDec = decRes.count || 0;
    const hasRce = rceRes.count || 0;
    const hasDic = dicRes.count || 0;
    const hasEs = esRes.count || 0;

    return {
        total_policies: total,
        total_families: total,
        expiring_this_month: expiring_this_month || 0,
        missing_dec: Math.max(0, total - hasDec),
        uploaded_dec: hasDec,
        missing_rce: Math.max(0, total - hasRce),
        uploaded_rce: hasRce,
        missing_dic: Math.max(0, total - hasDic),
        uploaded_dic: hasDic,
        missing_es: Math.max(0, total - hasEs),
        uploaded_es: hasEs,
    };
}
