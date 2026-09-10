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
    // Document presence & files
    has_dec: boolean;
    dec_storage_path?: string | null;
    dec_file_name?: string | null;
    has_rce: boolean;
    rce_carrier: string | null;
    rce_storage_path?: string | null;
    rce_file_name?: string | null;
    has_dic: boolean;
    dic_carrier: string | null;
    dic_storage_path?: string | null;
    dic_file_name?: string | null;
    has_es: boolean;
    es_storage_path?: string | null;
    es_file_name?: string | null;
    no_dic_available: boolean;
    is_pending_dec: boolean;
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
    total_bamboo_pending?: number;
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
    const view = searchParams.get('view') || 'active_cfp'; // 'active_cfp' | 'bamboo_pipeline' | 'all'
    const statsOnly = searchParams.get('stats_only') === 'true';

    const admin = getSupabaseAdmin();

    // ── 1. Stats query (always returned) ──────────────────────────────────
    if (statsOnly) {
        const stats = await computeStats(admin);
        return NextResponse.json({ success: true, stats });
    }

    // ── 2. Main data query ────────────────────────────────────────────────
    // Fetch policy_terms filtered by expiration year/month and view mode
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
                status,
                client_id,
                clients!inner (
                    id,
                    named_insured
                )
            )
        `);

    if (view === 'bamboo_pipeline') {
        termsQuery = termsQuery.eq('policies.status', 'pending_dec');
    } else if (view === 'all') {
        termsQuery = termsQuery.or('policy_number.ilike.CFP %,status.eq.pending_dec', { foreignTable: 'policies' });
    } else {
        // active_cfp (default)
        termsQuery = termsQuery
            .ilike('policies.policy_number', 'CFP %')
            .neq('policies.status', 'pending_dec');
    }

    // Date range filter
    if (year && month) {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const monthNum = m.toString().padStart(2, '0');
        const lastDay = new Date(y, m, 0).getDate();
        const startDate = `${y}-${monthNum}-01`;
        const endDate = `${y}-${monthNum}-${lastDay.toString().padStart(2, '0')}`;
        termsQuery = termsQuery
            .gte('expiration_date', startDate)
            .lte('expiration_date', endDate);
    } else if (year) {
        const yearNum = parseInt(year, 10);
        const startDate = `${yearNum}-01-01`;
        const endDate = `${yearNum}-12-31`;
        termsQuery = termsQuery
            .gte('expiration_date', startDate)
            .lte('expiration_date', endDate);
    }

    termsQuery = termsQuery.order('expiration_date', { ascending: true });

    // Supabase PostgREST defaults to a limit of 1,000 rows.
    // Fetch in paginated chunks to ensure no terms are truncated.
    const allFetchedTerms: any[] = [];
    const PAGE_CHUNK = 1000;
    let pageOffset = 0;
    let keepFetching = true;

    while (keepFetching) {
        const { data: chunkData, error: chunkError } = await termsQuery.range(pageOffset, pageOffset + PAGE_CHUNK - 1);
        if (chunkError) {
            return NextResponse.json({ success: false, error: chunkError.message }, { status: 500 });
        }
        if (chunkData && chunkData.length > 0) {
            allFetchedTerms.push(...chunkData);
            if (chunkData.length < PAGE_CHUNK) {
                keepFetching = false;
            } else {
                pageOffset += PAGE_CHUNK;
            }
        } else {
            keepFetching = false;
        }
    }

    const terms = allFetchedTerms;

    if (!terms || terms.length === 0) {
        return NextResponse.json({ success: true, families: [], total_terms: 0 });
    }

    // ── 3. Gather all policy_ids from result ──────────────────────────────
    const policyIds = [...new Set((terms as any[]).map((t: any) => t.policy_id))];

    // Helper to batch large in() queries in chunks of 250 and run concurrently
    const CHUNK_SIZE = 250;
    async function chunkedInQuery<T>(
        table: string,
        select: string,
        inCol: string,
        inValues: string[],
        extraFilter?: (q: any) => any
    ): Promise<T[]> {
        if (inValues.length === 0) return [];
        const chunks: string[][] = [];
        for (let i = 0; i < inValues.length; i += CHUNK_SIZE) {
            chunks.push(inValues.slice(i, i + CHUNK_SIZE));
        }
        const responses = await Promise.all(
            chunks.map(chunk => {
                let q = admin.from(table).select(select).in(inCol, chunk);
                if (extraFilter) q = extraFilter(q);
                return q;
            })
        );
        const results: T[] = [];
        for (const res of responses) {
            if (res.data) results.push(...(res.data as T[]));
        }
        return results;
    }

    // ── 4. Fetch dec_pages, platform_documents, and overrides in PARALLEL ──
    const [decPages, docs, bambooOverrides] = await Promise.all([
        chunkedInQuery<{
            id: string;
            policy_id: string;
            dec_page_submissions?: any;
        }>(
            'dec_pages',
            'id, policy_id, dec_page_submissions(storage_path, file_name)',
            'policy_id',
            policyIds
        ),
        chunkedInQuery<{
            id: string;
            policy_id: string;
            policy_term_id?: string;
            doc_type: string;
            file_name?: string;
            storage_path?: string;
        }>(
            'platform_documents',
            'id, policy_id, policy_term_id, doc_type, file_name, storage_path',
            'policy_id',
            policyIds,
            q => q.in('doc_type', ['rce', 'dic_dec_page', 'es_doc'])
        ),
        chunkedInQuery<{ policy_id: string; field_name: string; new_value: string }>(
            'manual_overrides',
            'policy_id, field_name, new_value',
            'policy_id',
            policyIds,
            q => q.in('field_name', ['has_bamboo_coverage', 'no_dic_available'])
        ),
    ]);

    const policyDecDocMap: Record<string, { storage_path?: string; file_name?: string }> = {};
    for (const d of decPages) {
        const sub = Array.isArray(d.dec_page_submissions) ? d.dec_page_submissions[0] : d.dec_page_submissions;
        if (!policyDecDocMap[d.policy_id] && sub?.storage_path) {
            policyDecDocMap[d.policy_id] = { storage_path: sub.storage_path, file_name: sub.file_name };
        }
    }
    const policyIdsWithDec = new Set(decPages.map(d => d.policy_id));

    // Build per-policy doc sets, carrier maps, and file storage info
    const policyDocTypes: Record<string, Set<string>> = {};
    const policyRceCarrier: Record<string, string> = {};
    const policyDicCarrier: Record<string, string> = {};
    const policyRceDoc: Record<string, { storage_path?: string; file_name?: string }> = {};
    const policyDicDoc: Record<string, { storage_path?: string; file_name?: string }> = {};
    const policyEsDoc: Record<string, { storage_path?: string; file_name?: string }> = {};

    for (const doc of docs) {
        if (!policyDocTypes[doc.policy_id]) {
            policyDocTypes[doc.policy_id] = new Set();
        }
        policyDocTypes[doc.policy_id].add(doc.doc_type);

        const detected = detectDocCarrier(doc.file_name, null, doc.doc_type);
        if (doc.doc_type === 'rce') {
            if (detected && !policyRceCarrier[doc.policy_id]) {
                policyRceCarrier[doc.policy_id] = detected;
            }
            if (doc.storage_path && !policyRceDoc[doc.policy_id]) {
                policyRceDoc[doc.policy_id] = { storage_path: doc.storage_path, file_name: doc.file_name };
            }
        } else if (doc.doc_type === 'dic_dec_page') {
            if (detected && !policyDicCarrier[doc.policy_id]) {
                policyDicCarrier[doc.policy_id] = detected;
            }
            if (doc.storage_path && !policyDicDoc[doc.policy_id]) {
                policyDicDoc[doc.policy_id] = { storage_path: doc.storage_path, file_name: doc.file_name };
            }
        } else if (doc.doc_type === 'es_doc') {
            if (doc.storage_path && !policyEsDoc[doc.policy_id]) {
                policyEsDoc[doc.policy_id] = { storage_path: doc.storage_path, file_name: doc.file_name };
            }
        }
    }

    const bambooCoverageSet = new Set<string>();
    const noDicAvailableSet = new Set<string>();
    for (const ov of bambooOverrides) {
        if (ov.field_name === 'has_bamboo_coverage' && (ov.new_value === 'true' || ov.new_value === '1')) {
            bambooCoverageSet.add(ov.policy_id);
        } else if (ov.field_name === 'no_dic_available' && (ov.new_value === 'true' || ov.new_value === '1')) {
            noDicAvailableSet.add(ov.policy_id);
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
        const isPendingDec = policy?.status === 'pending_dec';

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
            dec_storage_path: policyDecDocMap[policyId]?.storage_path || null,
            dec_file_name: policyDecDocMap[policyId]?.file_name || null,
            has_rce: hasRce,
            rce_carrier: rceCarrier,
            rce_storage_path: policyRceDoc[policyId]?.storage_path || null,
            rce_file_name: policyRceDoc[policyId]?.file_name || null,
            has_dic: hasDic,
            dic_carrier: dicCarrier,
            dic_storage_path: policyDicDoc[policyId]?.storage_path || null,
            dic_file_name: policyDicDoc[policyId]?.file_name || null,
            has_es: docSet.has('es_doc') || !!t.es_exists,
            es_storage_path: policyEsDoc[policyId]?.storage_path || null,
            es_file_name: policyEsDoc[policyId]?.file_name || null,
            no_dic_available: noDicAvailableSet.has(policyId),
            is_pending_dec: isPendingDec,
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

// ── PATCH /api/cfp-summary — toggle manual overrides (full coverage, no dic) ──
export async function PATCH(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service'] });
    if (isAuthError(auth)) return auth;

    const body = await req.json();
    const { policy_id, has_bamboo_coverage, no_dic_available } = body;

    if (!policy_id) {
        return NextResponse.json({ success: false, error: 'policy_id required' }, { status: 400 });
    }

    const updates: { field_name: string; new_value: string }[] = [];
    if (typeof has_bamboo_coverage === 'boolean') {
        updates.push({ field_name: 'has_bamboo_coverage', new_value: String(has_bamboo_coverage) });
    }
    if (typeof no_dic_available === 'boolean') {
        updates.push({ field_name: 'no_dic_available', new_value: String(no_dic_available) });
    }

    if (updates.length === 0) {
        return NextResponse.json({ success: false, error: 'has_bamboo_coverage or no_dic_available required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Persist via manual_overrides
    for (const u of updates) {
        const { error } = await admin
            .from('manual_overrides')
            .upsert(
                {
                    policy_id,
                    field_name: u.field_name,
                    new_value: u.new_value,
                },
                { onConflict: 'policy_id, field_name' }
            );

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
    }

    return NextResponse.json({ success: true, has_bamboo_coverage, no_dic_available });
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

    // Total active CFP policies (strictly non-pending_dec)
    const { count: total_policies } = await admin
        .from('policies')
        .select('id', { count: 'exact', head: true })
        .ilike('policy_number', 'CFP %')
        .neq('status', 'pending_dec');

    // Total Bamboo in-force pending accounts
    const { count: total_bamboo_pending } = await admin
        .from('policies')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_dec');

    const total = total_policies || 0;

    // Expiring this month (current terms, active CFP only)
    const { count: expiring_this_month } = await admin
        .from('policy_terms')
        .select('id, policies!inner(id, policy_number, status)', { count: 'exact', head: true })
        .eq('is_current', true)
        .gte('expiration_date', monthStart)
        .lte('expiration_date', monthEnd)
        .ilike('policies.policy_number', 'CFP %')
        .neq('policies.status', 'pending_dec');

    // Document counts via exact joins
    const [decRes, rceRes, dicRes, esRes] = await Promise.all([
        admin.from('dec_pages').select('id, policies!inner(policy_number, status)', { count: 'exact', head: true }).ilike('policies.policy_number', 'CFP %').neq('policies.status', 'pending_dec'),
        admin.from('platform_documents').select('id, policies!inner(policy_number, status)', { count: 'exact', head: true }).eq('doc_type', 'rce').ilike('policies.policy_number', 'CFP %').neq('policies.status', 'pending_dec'),
        admin.from('platform_documents').select('id, policies!inner(policy_number, status)', { count: 'exact', head: true }).eq('doc_type', 'dic_dec_page').ilike('policies.policy_number', 'CFP %').neq('policies.status', 'pending_dec'),
        admin.from('platform_documents').select('id, policies!inner(policy_number, status)', { count: 'exact', head: true }).eq('doc_type', 'es_doc').ilike('policies.policy_number', 'CFP %').neq('policies.status', 'pending_dec'),
    ]);

    const hasDec = decRes.count || 0;
    const hasRce = rceRes.count || 0;
    const hasDic = dicRes.count || 0;
    const hasEs = esRes.count || 0;

    return {
        total_policies: total,
        total_bamboo_pending: total_bamboo_pending || 0,
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
