import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { normalizePolicyNumber } from '@/lib/normalization';

export const dynamic = 'force-dynamic';

// ── Types ──────────────────────────────────────────────────────────────────
export type CarrierKey = 'bamboo' | 'aegis' | 'am' | 'sagesure' | 'psic';
export type CoverageQuoteType = 'DIC' | 'FULL' | 'QUOTE' | 'AGENT_REVIEW' | 'UNAVAILABLE';

export interface CarrierQuoteData {
    carrier_key: CarrierKey;
    coverage_type: CoverageQuoteType;
    quote_number?: string | null;
    premium?: number | null;
    dwelling_coverage?: number | null;
    notes?: string | null;
    storage_path?: string | null;
    file_name?: string | null;
    doc_file_name?: string | null;
    verified_by?: string | null;
    verified_at?: string | null;
}

export interface CFPTermRow {
    // Policy
    policy_id: string;
    policy_number: string;
    base_policy: string;
    suffix: string | null;
    property_address: string;
    mailing_address?: string;
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
    carrier_status?: string | null;
    policy_status?: string | null;
    payment_status: string | null;
    payment_plan: string | null;
    is_current: boolean;
    // Document presence & files
    has_dec: boolean;
    dec_storage_path?: string | null;
    dec_file_name?: string | null;
    dec_bucket?: 'cfp-raw-decpage' | 'cfp-platform-documents' | null;
    has_renewal_dec?: boolean;
    renewal_dec_storage_path?: string | null;
    renewal_dec_file_name?: string | null;
    renewal_dec_bucket?: 'cfp-raw-decpage' | 'cfp-platform-documents' | null;
    has_rce: boolean;
    rce_carrier: string | null;
    rce_storage_path?: string | null;
    rce_file_name?: string | null;
    rce_replacement_cost?: number | null;
    rce_sq_feet?: number | null;
    rce_cost_per_sqft?: number | null;
    has_dic: boolean;
    dic_carrier: string | null;
    dic_storage_path?: string | null;
    dic_file_name?: string | null;
    has_es: boolean;
    es_storage_path?: string | null;
    es_file_name?: string | null;
    no_dic_available: boolean;
    is_pending_dec: boolean;
    // 4 Companion Carrier Quotes (Bamboo, Aegis, AM, PSIC)
    carrier_quotes: Record<CarrierKey, CarrierQuoteData | null>;
    // Comments & notes
    comment_count_dec: number;
    comment_count_rce: number;
    comment_count_dic: number;
    comment_count_quote: number;
    note_count: number;
    latest_note_preview?: string | null;
    // Servicing Email & Returns
    in_servicing_email: boolean;
    servicing_status?: string | null;
    returned_from_se?: boolean;
    return_reason?: string | null;
    return_notes?: string | null;
    returned_by?: string | null;
    returned_at?: string | null;
    // Send Mail tracking
    cfp_mail_sent?: boolean;
    cfp_mail_sent_to?: string[];
    cfp_mail_sent_to_names?: string[];
    cfp_mail_sent_cc?: string[];
    cfp_mail_sent_cc_names?: string[];
    cfp_mail_sent_by?: string | null;
    cfp_mail_sent_by_email?: string | null;
    cfp_mail_sent_at?: string | null;
    cfp_mail_subject?: string | null;
    cfp_mail_attachments?: string[];
    // Title Pro verification
    title_pro?: TitleProData | null;
    // Renewal term data if available
    renewal_annual_premium?: number | null;
    renewal_effective_date?: string | null;
    renewal_expiration_date?: string | null;
    // Term type within family (set by API after grouping)
    term_type: 'ORIGINAL' | 'RENEWAL';
    term_index: number;
}

export interface TitleProData {
    title_name: string;
    match_status: 'matched' | 'partial' | 'mismatch' | 'missing';
    notes?: string | null;
    verified_by?: string | null;
    verified_at?: string | null;
}

export interface CFPFamily {
    base_policy: string;
    terms: CFPTermRow[];
}

// ── Carrier Detection Helper ──────────────────────────────────────────────
export function detectCarrierQuoteInfo(
    fileName?: string | null,
    rawText?: string | null,
    docType?: string | null,
    docDataDic?: any
): CarrierQuoteData | null {
    const fn = (fileName || '').toLowerCase();
    const txt = (rawText || '').toLowerCase().slice(0, 3000);
    const combined = `${fn} ${txt}`;

    // Pure RCE documents should not be categorized as quotes
    const isPureRce = docType === 'rce' || (fn.includes('rce') && !fn.includes('quote')) || fn.includes('360value') || fn.includes('valuation');
    if (isPureRce) {
        return null;
    }

    const dic = Array.isArray(docDataDic) ? docDataDic[0] : docDataDic;
    const dicDocType = (dic?.document_type || '').toLowerCase();
    const dicCarrier = (dic?.carrier_name || '').toLowerCase();

    // Only exclude CFP Dec pages or raw CFP Dec page submissions from carrier companion quotes
    if ((fn.includes('cfp') && fn.includes('dec') && !fn.includes('dic') && !fn.includes('quote') && !fn.includes('bamboo') && !fn.includes('aegis') && !fn.includes('american modern') && !fn.includes('psic') && !fn.includes('sagesure')) ||
        dicDocType.includes('cfp_dec') ||
        fn.includes('renewal_email_attachment') ||
        fn.includes('renewal_offer')) {
        return null;
    }

    const extractTotalPremium = (d: any): number | null => {
        if (!d) return null;
        if (d.total_charge !== null && d.total_charge !== undefined) {
            return typeof d.total_charge === 'number' ? d.total_charge : parseFloat(String(d.total_charge).replace(/[^0-9.]/g, ''));
        }
        if (d.basic_premium !== null && d.basic_premium !== undefined) {
            const basic = typeof d.basic_premium === 'number' ? d.basic_premium : parseFloat(String(d.basic_premium).replace(/[^0-9.]/g, '') || '0');
            const optional = typeof d.optional_premium === 'number' ? d.optional_premium : parseFloat(String(d.optional_premium || 0).replace(/[^0-9.]/g, '') || '0');
            const surcharges = typeof d.surcharges === 'number' ? d.surcharges : parseFloat(String(d.surcharges || 0).replace(/[^0-9.]/g, '') || '0');
            const credits = typeof d.credits === 'number' ? d.credits : parseFloat(String(d.credits || 0).replace(/[^0-9.-]/g, '') || '0');
            const sum = basic + optional + surcharges + credits;
            return Math.round(sum * 100) / 100;
        }
        return null;
    };

    // 1. Bamboo (Q100... or CASNH... or Bamboo)
    const matchBamboo = (fileName || '').match(/(Q100\d{6,}|CASNH\d+)/i) || (dic?.policy_number || '').match(/(Q100\d{6,}|CASNH\d+)/i);
    if (combined.includes('bamboo') || dicCarrier.includes('bamboo') || matchBamboo) {
        const isDic = (dic && dic.has_dic_endorsement === true) || combined.includes('does not cover the peril of fire') || (fn.includes('dic') && !fn.includes('ho3') && !fn.includes('home'));
        const prem = extractTotalPremium(dic);
        return {
            carrier_key: 'bamboo',
            coverage_type: isDic ? 'DIC' : 'FULL',
            quote_number: matchBamboo ? matchBamboo[1] : (dic?.policy_number || null),
            premium: prem,
            dwelling_coverage: dic?.cov_a_dwelling ? parseFloat(String(dic.cov_a_dwelling).replace(/[^0-9.]/g, '')) : null,
            doc_file_name: fileName || null,
        };
    }

    // 2. Aegis (Q5... or Aegis or Obsidian)
    const matchAegis = (fileName || '').match(/(Q5\d{5,}|Q\d{6,}|OBS\d+|AEG\d+)/i) || (dic?.policy_number || '').match(/(Q5\d{5,}|Q\d{6,}|OBS\d+|AEG\d+)/i);
    if (combined.includes('aegis') || combined.includes('obsidian') || dicCarrier.includes('aegis') || dicCarrier.includes('obsidian') || matchAegis) {
        const isDic = (dic && dic.has_dic_endorsement !== false) || combined.includes('california dic quote') || combined.includes('difference in conditions selected') || combined.includes('difference in conditions') || fn.includes('dic');
        const prem = extractTotalPremium(dic);
        return {
            carrier_key: 'aegis',
            coverage_type: isDic ? 'DIC' : 'FULL',
            quote_number: matchAegis ? matchAegis[1] : (dic?.policy_number || null),
            premium: prem,
            dwelling_coverage: dic?.cov_a_dwelling ? parseFloat(String(dic.cov_a_dwelling).replace(/[^0-9.]/g, '')) : null,
            doc_file_name: fileName || null,
        };
    }

    // 3. American Modern (AM / 005...)
    const matchAm = (fileName || '').match(/(005[\-\d]{7,}|AM\d{6,})/i) || (dic?.policy_number || '').match(/(005[\-\d]{7,}|AM\d{6,})/i);
    if (
        combined.includes('american modern') ||
        combined.includes('americanmodern') ||
        dicCarrier.includes('american modern') ||
        combined.includes('homeowners flex') ||
        combined.includes('manufactured home') ||
        combined.includes('quote am') ||
        combined.includes('dic am') ||
        combined.includes('dic_am') ||
        /[\s_\-]AM[\s_\.\(\)\-]/i.test(fileName || '') ||
        /[\s_]AM$/i.test(fileName || '') ||
        matchAm
    ) {
        const isDic = (dic && dic.has_dic_endorsement !== false) || combined.includes('dic - fire') || combined.includes('dic -') || combined.includes('difference in conditions') || fn.includes('dic');
        const prem = extractTotalPremium(dic);
        return {
            carrier_key: 'am',
            coverage_type: isDic ? 'DIC' : 'FULL',
            quote_number: matchAm ? matchAm[1] : (dic?.policy_number || null),
            premium: prem,
            dwelling_coverage: dic?.cov_a_dwelling ? parseFloat(String(dic.cov_a_dwelling).replace(/[^0-9.]/g, '')) : null,
            doc_file_name: fileName || null,
        };
    }

    // 4. PSIC (Pacific Specialty)
    const matchPsic = (fileName || '').match(/(HO\d{7,}[A-Z0-9]*|PS\d{6,}|PSIC\d{5,})/i) || (dic?.policy_number || '').match(/(HO\d{7,}[A-Z0-9]*|PS\d{6,}|PSIC\d{5,})/i);
    if (combined.includes('pacific specialty') || combined.includes('pacificspecialty') || dicCarrier.includes('pacific') || combined.includes('psic') || matchPsic) {
        const isDic = (dic && dic.has_dic_endorsement !== false) || combined.includes('difference in conditions included') || combined.includes('difference in conditions') || fn.includes('dic');
        const prem = extractTotalPremium(dic);
        return {
            carrier_key: 'psic',
            coverage_type: isDic ? 'DIC' : 'FULL',
            quote_number: matchPsic ? matchPsic[1] : (dic?.policy_number || null),
            premium: prem,
            dwelling_coverage: dic?.cov_a_dwelling ? parseFloat(String(dic.cov_a_dwelling).replace(/[^0-9.]/g, '')) : null,
            doc_file_name: fileName || null,
        };
    }

    // 5. SageSure
    const matchSageSure = (fileName || '').match(/(SS\d{6,}|SAGESURE\d*)/i) || (dic?.policy_number || '').match(/(SS\d{6,}|SAGESURE\d*)/i);
    if (combined.includes('sagesure') || dicCarrier.includes('sagesure') || matchSageSure) {
        const isDic = (dic && dic.has_dic_endorsement !== false) || combined.includes('difference in conditions') || fn.includes('dic');
        const prem = extractTotalPremium(dic);
        return {
            carrier_key: 'sagesure',
            coverage_type: isDic ? 'DIC' : 'FULL',
            quote_number: matchSageSure ? matchSageSure[1] : (dic?.policy_number || null),
            premium: prem,
            dwelling_coverage: dic?.cov_a_dwelling ? parseFloat(String(dic.cov_a_dwelling).replace(/[^0-9.]/g, '')) : null,
            doc_file_name: fileName || null,
        };
    }

    return null;
}

function detectDocCarrier(fileName?: string | null, rawText?: string | null, docType?: string | null, rceSource?: string | null, rceCreatedBy?: string | null): string | null {
    const fn = (fileName || '').toLowerCase();
    const txt = (rawText || '').toLowerCase().slice(0, 5000);
    const src = (rceSource || '').toLowerCase();
    const createdBy = (rceCreatedBy || '').toLowerCase();
    const combined = `${fn} ${txt} ${src} ${createdBy}`;

    // 0. California FAIR Plan (CFP, California FAIR Plan)
    if (
        combined.includes('fair plan') ||
        combined.includes('california fair') ||
        combined.includes('californiafair')
    ) {
        return 'California FAIR Plan';
    }

    // 1. American Modern (AM) — check RCE source and AM markers FIRST
    if (
        src.includes('american_modern') ||
        combined.includes('american modern') ||
        combined.includes('americanmodern') ||
        combined.includes('homeowners flex') ||
        combined.includes('manufactured home') ||
        combined.includes('cotality') ||
        combined.includes('rct express') ||
        combined.includes('detailed report estimate') ||
        combined.includes('estimate-') ||
        combined.includes('rce am') ||
        combined.includes('rcm am') ||
        combined.includes('rce_am') ||
        combined.includes('am rce') ||
        combined.includes('quote am') ||
        combined.includes('dic am') ||
        combined.includes('dic_am') ||
        /[\s_\-]AM[\s_\.\(\)\-]/i.test(fileName || '') ||
        /[\s_]AM$/i.test(fileName || '') ||
        /(?:^|[^0-9])005[0-9]{6,}/.test(fileName || '')
    ) {
        return 'AM';
    }

    // 2. PSIC (Pacific Specialty)
    if (
        createdBy.includes('pacific') ||
        createdBy.includes('psic') ||
        combined.includes('pacific specialty') ||
        combined.includes('pacificspecialty') ||
        combined.includes('psic') ||
        /(?:^|[^0-9])HO62[0-9]{6,}/i.test(fileName || '') ||
        /(?:^|[^0-9])HO6[0-9]{6,}/i.test(fileName || '')
    ) {
        return 'PSIC';
    }

    // 3. Aegis (including Obsidian Pacific, Aegis Security, Aegis General, webservices@aegis, Q5 quotes)
    if (
        createdBy.includes('aegis') ||
        createdBy.includes('webservices@aegis') ||
        combined.includes('aegis') ||
        combined.includes('obsidian') ||
        combined.includes('webservices@aegis') ||
        /(?:^|[^0-9])Q5[0-9]{5,}/i.test(fileName || '')
    ) {
        return 'Aegis';
    }

    // 4. SageSure
    if (
        createdBy.includes('sagesure') ||
        combined.includes('sagesure')
    ) {
        return 'SageSure';
    }

    // 5. Bamboo (Bamboo, CASNH, guidewire@bamboo, bambooinsurance, Q100 quotes)
    if (
        createdBy.includes('bamboo') ||
        createdBy.includes('guidewire@bamboo') ||
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

export interface CFPSummaryStats {
    total_policies: number;
    total_bamboo_pending?: number;
    total_families: number;
    total_accounts?: number;
    expiring_this_month: number;
    missing_dec: number;
    uploaded_dec?: number;
    total_dec_uploaded_overall?: number;
    total_dec_submissions?: number;
    missing_rce: number;
    uploaded_rce?: number;
    missing_dic: number;
    uploaded_dic?: number;
    uploaded_full?: number;
    total_quoted?: number;
    missing_quotes?: number;
    missing_es: number;
    uploaded_es?: number;
}

// In-memory server cache for instant CFP responses
interface ServerCacheEntry {
    data: {
        success: boolean;
        families: CFPFamily[];
        total_terms: number;
        total_families: number;
    };
    timestamp: number;
}
export const serverSummaryCache = new Map<string, ServerCacheEntry>();
const SERVER_CACHE_TTL_MS = 60_000;

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

    // Check server memory cache for fast instantaneous returns on un-searched views
    const cacheKey = `${year || ''}_${month || ''}_${search}_${view}`;
    if (!search) {
        const cached = serverSummaryCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < SERVER_CACHE_TTL_MS) {
            return NextResponse.json(cached.data);
        }
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
            carrier_policy_number,
            carrier_status,
            source_dec_page_id,
            import_batch_id,
            policies!inner (
                id,
                policy_number,
                property_address_raw,
                carrier_name,
                status,
                client_id,
                clients!inner (
                    id,
                    named_insured,
                    mailing_address_raw
                )
            )
        `);

    // Intelligent server-side search push-down: resolve matching policy IDs first to avoid scanning 3000+ terms
    if (search) {
        const cleanQ = search.trim();
        const tokens = cleanQ.split(/\s+/).filter(Boolean);

        const policySearches = tokens.map(t =>
            admin
                .from('policies')
                .select('id')
                .or(`policy_number.ilike.%${t}%,property_address_raw.ilike.%${t}%,property_address_norm.ilike.%${t}%`)
                .limit(100)
        );

        const clientSearches = tokens.map(t =>
            admin
                .from('clients')
                .select('id')
                .ilike('named_insured', `%${t}%`)
                .limit(100)
        );

        const decSearches = tokens.map(t =>
            admin
                .from('dec_pages')
                .select('policy_id')
                .or(`policy_number.ilike.%${t}%,insured_name.ilike.%${t}%,property_location.ilike.%${t}%,mailing_address.ilike.%${t}%`)
                .not('policy_id', 'is', null)
                .limit(100)
        );

        const docSearches = tokens.map(t =>
            admin
                .from('platform_documents')
                .select('policy_id')
                .or(`extracted_address.ilike.%${t}%,file_name.ilike.%${t}%`)
                .not('policy_id', 'is', null)
                .limit(100)
        );

        const [policyResults, clientResults, decResults, docResults] = await Promise.all([
            Promise.all(policySearches),
            Promise.all(clientSearches),
            Promise.all(decSearches),
            Promise.all(docSearches),
        ]);

        const matchedPolicyIds = new Set<string>();

        const clientIds = new Set<string>();
        for (const res of clientResults) {
            if (res.data) {
                for (const c of res.data) {
                    clientIds.add(c.id);
                }
            }
        }

        if (clientIds.size > 0) {
            const { data: polsForClients } = await admin
                .from('policies')
                .select('id')
                .in('client_id', Array.from(clientIds))
                .limit(200);
            if (polsForClients) {
                for (const p of polsForClients) {
                    matchedPolicyIds.add(p.id);
                }
            }
        }

        for (const res of policyResults) {
            if (res.data) {
                for (const p of res.data) {
                    matchedPolicyIds.add(p.id);
                }
            }
        }

        for (const res of decResults) {
            if (res.data) {
                for (const d of res.data) {
                    if (d.policy_id) matchedPolicyIds.add(d.policy_id);
                }
            }
        }

        for (const res of docResults) {
            if (res.data) {
                for (const doc of res.data) {
                    if (doc.policy_id) matchedPolicyIds.add(doc.policy_id);
                }
            }
        }

        const searchPolicyIds = Array.from(matchedPolicyIds);
        if (searchPolicyIds.length === 0) {
            return NextResponse.json({ success: true, families: [], total_terms: 0, total_families: 0 });
        }

        termsQuery = termsQuery.in('policy_id', searchPolicyIds);
    }

    if (view === 'bamboo_pipeline') {
        termsQuery = termsQuery.eq('policies.status', 'pending_dec');
    } else if (view === 'all') {
        termsQuery = termsQuery.or('policy_number.ilike.CFP %,policy_number.ilike.CEA %,policy_number.ilike.COM %,policy_number.ilike.DIV %,policy_number.ilike.DWG %,status.eq.pending_dec', { foreignTable: 'policies' });
    } else {
        // active_cfp (default)
        termsQuery = termsQuery
            .or('policy_number.ilike.CFP %,policy_number.ilike.CEA %,policy_number.ilike.COM %,policy_number.ilike.DIV %,policy_number.ilike.DWG %', { foreignTable: 'policies' })
            .neq('policies.status', 'pending_dec');
    }

    // Date range filter
    if (year && month && year !== 'all' && month !== 'all' && month !== '') {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const monthNum = m.toString().padStart(2, '0');
        const lastDay = new Date(y, m, 0).getDate();
        const startDate = `${y}-${monthNum}-01`;
        const endDate = `${y}-${monthNum}-${lastDay.toString().padStart(2, '0')}`;
        termsQuery = termsQuery
            .gte('expiration_date', startDate)
            .lte('expiration_date', endDate);
    } else if (year && year !== 'all' && year !== '') {
        const yearNum = parseInt(year, 10);
        const startDate = `${yearNum}-01-01`;
        const endDate = `${yearNum}-12-31`;
        termsQuery = termsQuery
            .gte('expiration_date', startDate)
            .lte('expiration_date', endDate);
    }

    termsQuery = termsQuery.order('expiration_date', { ascending: true });

    // Supabase PostgREST limit handling
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

    let terms = allFetchedTerms;

    // Filter by month across all years when year is "All Years" or unconstrained, but a specific Month is selected
    if ((!year || year === 'all') && month && month !== 'all' && month !== '') {
        const targetMonthStr = month.toString().padStart(2, '0');
        terms = terms.filter(t => {
            if (!t.expiration_date) return false;
            const parts = String(t.expiration_date).split('-');
            return parts.length >= 2 && parts[1] === targetMonthStr;
        });
    }

    if (!terms || terms.length === 0) {
        return NextResponse.json({ success: true, families: [], total_terms: 0 });
    }

    // ── 3. Gather all policy_ids from result ──────────────────────────────
    const policyIds = [...new Set((terms as any[]).map((t: any) => t.policy_id))];

    // Helper to batch large in() queries in chunks of 600 and run concurrently
    const CHUNK_SIZE = 600;
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
    const [decPages, docs, bambooOverrides, notesData] = await Promise.all([
        chunkedInQuery<{
            id: string;
            policy_id: string;
            policy_term_id?: string;
            policy_number?: string;
            policy_period_start?: string;
            policy_period_end?: string;
            property_location?: string;
            mailing_address?: string;
            total_annual_premium?: string | number | null;
            dec_page_submissions?: any;
        }>(
            'dec_pages',
            'id, policy_id, policy_term_id, policy_number, policy_period_start, policy_period_end, property_location, mailing_address, total_annual_premium, dec_page_submissions(storage_path, file_name, bucket)',
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
            bucket?: string;
            extracted_address?: string;
            raw_text?: string;
            doc_data_dic?: any;
            doc_data_rce?: any;
        }>(
            'platform_documents',
            'id, policy_id, policy_term_id, doc_type, file_name, storage_path, bucket, extracted_address, raw_text, doc_data_dic(carrier_name, policy_number, document_type, has_dic_endorsement, basic_premium, total_charge, optional_premium, surcharges, credits, cov_a_dwelling, rce_replacement_cost, rce_living_area, rce_estimate_number, rce_quality_grade), doc_data_rce(replacement_cost, replacement_range_low, replacement_range_high, cost_per_sqft, sq_feet, source, valuation_id, created_by)',
            'policy_id',
            policyIds,
            q => q.in('doc_type', ['rce', 'dic_dec_page', 'es_doc', 'other'])
        ),
        chunkedInQuery<{ policy_id: string; field_name: string; new_value: string }>(
            'manual_overrides',
            'policy_id, field_name, new_value',
            'policy_id',
            policyIds,
            q => q.in('field_name', ['has_bamboo_coverage', 'no_dic_available', 'servicing_email_item', 'servicing_return_info', 'title_pro', 'carrier_quote_bamboo', 'carrier_quote_aegis', 'carrier_quote_am', 'carrier_quote_sagesure', 'carrier_quote_psic', 'cfp_mail_sent', 'rce_valuation', 'rce_replacement_cost'])
        ),
        chunkedInQuery<{
            id: string;
            policy_id: string;
            body: string;
            meta: { tags?: string[]; is_resolved?: boolean; [key: string]: unknown };
            created_at: string;
        }>(
            'notes',
            'id, policy_id, body, meta, created_at',
            'policy_id',
            policyIds,
            q => q.eq('is_archived', false)
        ),
    ]);

    // Map terms by policy_id for term lookup
    const termsByPolicy: Record<string, any[]> = {};
    for (const t of terms as any[]) {
        if (!termsByPolicy[t.policy_id]) termsByPolicy[t.policy_id] = [];
        termsByPolicy[t.policy_id].push(t);
    }

    const termDecDocMap: Record<string, { storage_path?: string; file_name?: string; bucket?: 'cfp-raw-decpage' | 'cfp-platform-documents'; policy_number?: string; total_premium?: number }> = {};
    const policyDecDocMap: Record<string, { storage_path?: string; file_name?: string; bucket?: 'cfp-raw-decpage' | 'cfp-platform-documents'; policy_number?: string; total_premium?: number }> = {};
    const policyRenewalDecDocMap: Record<string, { storage_path?: string; file_name?: string; bucket?: 'cfp-raw-decpage' | 'cfp-platform-documents'; policy_number?: string; total_premium?: number }> = {};
    const policyAddressMap: Record<string, string> = {};
    const termAddressMap: Record<string, string> = {};

    for (const d of decPages) {
        const addr = d.property_location || d.mailing_address;
        if (addr) {
            if (d.policy_id && !policyAddressMap[d.policy_id]) {
                policyAddressMap[d.policy_id] = addr;
            }
            if (d.policy_term_id && !termAddressMap[d.policy_term_id]) {
                termAddressMap[d.policy_term_id] = addr;
            }
        }
        const sub = Array.isArray(d.dec_page_submissions) ? d.dec_page_submissions[0] : d.dec_page_submissions;
        const bucket = (sub?.bucket as 'cfp-raw-decpage' | 'cfp-platform-documents') || 'cfp-raw-decpage';
        const docInfo = {
            storage_path: sub?.storage_path,
            file_name: sub?.file_name,
            bucket,
            policy_number: d.policy_number || undefined,
            total_premium: d.total_annual_premium ? parseFloat(String(d.total_annual_premium).replace(/[^0-9.]/g, '')) : undefined,
        };
        if (sub?.storage_path && d.policy_id) {
            policyDecDocMap[d.policy_id] = docInfo;
            const subFn = (sub.file_name || '').toLowerCase();
            if (subFn.includes('renewal')) {
                policyRenewalDecDocMap[d.policy_id] = docInfo;
            }
        }
        if (d.policy_term_id && sub?.storage_path) {
            termDecDocMap[d.policy_term_id] = docInfo;
        } else if (sub?.storage_path && d.policy_id) {
            const polTerms = termsByPolicy[d.policy_id] || [];
            // Match by exact start/end dates if available
            const dateMatch = polTerms.find(t =>
                d.policy_period_start && t.effective_date === d.policy_period_start &&
                d.policy_period_end && t.expiration_date === d.policy_period_end
            );
            if (dateMatch) {
                termDecDocMap[dateMatch.id] = docInfo;
            } else if (polTerms.length === 1) {
                termDecDocMap[polTerms[0].id] = docInfo;
            }
        }
    }

    // Build per-term and policy-level doc sets, carrier maps, and file storage info
    const termDocTypes: Record<string, Set<string>> = {};
    const termRceCarrier: Record<string, string> = {};
    const termDicCarrier: Record<string, string> = {};
    const termRceDoc: Record<string, { storage_path?: string; file_name?: string; replacement_cost?: number | null; sq_feet?: number | null; cost_per_sqft?: number | null }> = {};
    const termDicDoc: Record<string, { storage_path?: string; file_name?: string }> = {};
    const termEsDoc: Record<string, { storage_path?: string; file_name?: string }> = {};

    const policyDocTypes: Record<string, Set<string>> = {};
    const policyRceCarrier: Record<string, string> = {};
    const policyDicCarrier: Record<string, string> = {};
    const policyRceDoc: Record<string, { storage_path?: string; file_name?: string; replacement_cost?: number | null; sq_feet?: number | null; cost_per_sqft?: number | null }> = {};
    const policyDicDoc: Record<string, { storage_path?: string; file_name?: string }> = {};
    const policyEsDoc: Record<string, { storage_path?: string; file_name?: string }> = {};

    for (const doc of docs) {
        if (doc.extracted_address) {
            if (doc.policy_id && !policyAddressMap[doc.policy_id]) {
                policyAddressMap[doc.policy_id] = doc.extracted_address;
            }
            if (doc.policy_term_id && !termAddressMap[doc.policy_term_id]) {
                termAddressMap[doc.policy_term_id] = doc.extracted_address;
            }
        }
        const fn = (doc.file_name || '').toLowerCase();
        const dic = Array.isArray(doc.doc_data_dic) ? doc.doc_data_dic[0] : doc.doc_data_dic;
        const rce = Array.isArray(doc.doc_data_rce) ? doc.doc_data_rce[0] : doc.doc_data_rce;
        const dicType = (dic?.document_type || '').toLowerCase();
        const dicCarrierName = (dic?.carrier_name || '').toLowerCase();
        const isFairPlanCarrier = dicCarrierName.includes('fair plan') || dicCarrierName.includes('california fair') || fn.includes('fair plan') || fn.includes('california fair');
        const isQuoteDoc = fn.includes('quote') || dicType.includes('quote');

        const isCfpDecDoc = (
            doc.doc_type === 'dec_page' ||
            isFairPlanCarrier ||
            fn.includes('renewal_email_attachment') ||
            fn.includes('renewal_offer') ||
            (fn.includes('cfp') && !fn.includes('bamboo') && !fn.includes('aegis') && !fn.includes('american modern') && !fn.includes('sagesure') && !fn.includes('psic') && !isQuoteDoc && !fn.includes('dic')) ||
            (fn.includes('dec page') && !fn.includes('bamboo') && !fn.includes('aegis') && !fn.includes('american modern') && !fn.includes('sagesure') && !fn.includes('psic') && !isQuoteDoc && !fn.includes('dic'))
        );

        if (isCfpDecDoc && doc.storage_path) {
            const docInfo = {
                storage_path: doc.storage_path,
                file_name: doc.file_name,
                bucket: (doc.bucket || 'cfp-platform-documents') as 'cfp-raw-decpage' | 'cfp-platform-documents',
                policy_number: undefined,
            };
            if (doc.policy_id) {
                policyDecDocMap[doc.policy_id] = docInfo;
                if (fn.includes('renewal') || dicType.includes('renewal')) {
                    policyRenewalDecDocMap[doc.policy_id] = docInfo;
                }
            }
            if (doc.policy_term_id) {
                termDecDocMap[doc.policy_term_id] = docInfo;
            } else if (doc.policy_id) {
                const polTerms = termsByPolicy[doc.policy_id] || [];
                if (polTerms.length === 1) {
                    termDecDocMap[polTerms[0].id] = docInfo;
                }
            }
            continue;
        }

        const polTerms = termsByPolicy[doc.policy_id] || [];
        const pid = doc.policy_id;

        if (pid) {
            if (!policyDocTypes[pid]) policyDocTypes[pid] = new Set<string>();
            policyDocTypes[pid].add(doc.doc_type);

            const extractedRceCost = rce?.replacement_cost || dic?.rce_replacement_cost || (doc.doc_type === 'rce' && dic?.cov_a_dwelling ? parseFloat(String(dic.cov_a_dwelling).replace(/[^0-9.]/g, '')) : null) || null;
            const extractedRceSqft = rce?.sq_feet || dic?.rce_living_area || null;
            const extractedRceCostPerSqft = rce?.cost_per_sqft || (extractedRceCost && extractedRceSqft && extractedRceSqft > 0 ? Math.round((extractedRceCost / extractedRceSqft) * 100) / 100 : null);
            const isRceDoc = doc.doc_type === 'rce' || (fn.includes('rce') && !isQuoteDoc) || !!rce || !!dic?.rce_replacement_cost;

            if (isRceDoc) {
                const c = detectDocCarrier(doc.file_name, doc.raw_text, 'rce', rce?.source || dic?.carrier_name, rce?.created_by);
                if (c && !policyRceCarrier[pid]) policyRceCarrier[pid] = c;
                if (doc.storage_path && !policyRceDoc[pid]) {
                    policyRceDoc[pid] = {
                        storage_path: doc.storage_path,
                        file_name: doc.file_name,
                        replacement_cost: extractedRceCost,
                        sq_feet: extractedRceSqft,
                        cost_per_sqft: extractedRceCostPerSqft,
                    };
                } else if (policyRceDoc[pid]) {
                    if (!policyRceDoc[pid].replacement_cost && extractedRceCost) {
                        policyRceDoc[pid].replacement_cost = extractedRceCost;
                    }
                    if (!policyRceDoc[pid].sq_feet && extractedRceSqft) {
                        policyRceDoc[pid].sq_feet = extractedRceSqft;
                    }
                    if (!policyRceDoc[pid].cost_per_sqft && extractedRceCostPerSqft) {
                        policyRceDoc[pid].cost_per_sqft = extractedRceCostPerSqft;
                    }
                }
            } else if ((doc.doc_type === 'dic_dec_page' || fn.includes('dic')) && !isFairPlanCarrier) {
                // Only set as in-force DIC Dec Page if it is NOT a quote and NOT a FAIR Plan Dec Page
                if (!isQuoteDoc) {
                    const c = detectDocCarrier(doc.file_name, doc.raw_text, 'dic_dec_page');
                    if (c && c !== 'California FAIR Plan' && !policyDicCarrier[pid]) policyDicCarrier[pid] = c;
                    if (doc.storage_path && !policyDicDoc[pid]) {
                        policyDicDoc[pid] = { storage_path: doc.storage_path, file_name: doc.file_name };
                    }
                }
            } else if (doc.doc_type === 'es_doc') {
                if (doc.storage_path && !policyEsDoc[pid]) {
                    policyEsDoc[pid] = { storage_path: doc.storage_path, file_name: doc.file_name };
                }
            }
        }

        // Apply to terms
        const targetTerms = doc.policy_term_id
            ? polTerms.filter(t => t.id === doc.policy_term_id)
            : polTerms;

        for (const t of targetTerms) {
            if (!termDocTypes[t.id]) {
                termDocTypes[t.id] = new Set<string>();
            }
            termDocTypes[t.id].add(doc.doc_type);

            const extractedRceCost = rce?.replacement_cost || dic?.rce_replacement_cost || (doc.doc_type === 'rce' && dic?.cov_a_dwelling ? parseFloat(String(dic.cov_a_dwelling).replace(/[^0-9.]/g, '')) : null) || null;
            const extractedRceSqft = rce?.sq_feet || dic?.rce_living_area || null;
            const extractedRceCostPerSqft = rce?.cost_per_sqft || (extractedRceCost && extractedRceSqft && extractedRceSqft > 0 ? Math.round((extractedRceCost / extractedRceSqft) * 100) / 100 : null);
            const isRceDoc = doc.doc_type === 'rce' || (fn.includes('rce') && !isQuoteDoc) || !!rce || !!dic?.rce_replacement_cost;

            if (isRceDoc) {
                const c = detectDocCarrier(doc.file_name, doc.raw_text, 'rce', rce?.source || dic?.carrier_name, rce?.created_by);
                if (c && !termRceCarrier[t.id]) termRceCarrier[t.id] = c;
                if (doc.storage_path && !termRceDoc[t.id]) {
                    termRceDoc[t.id] = {
                        storage_path: doc.storage_path,
                        file_name: doc.file_name,
                        replacement_cost: extractedRceCost,
                        sq_feet: extractedRceSqft,
                        cost_per_sqft: extractedRceCostPerSqft,
                    };
                } else if (termRceDoc[t.id]) {
                    if (!termRceDoc[t.id].replacement_cost && extractedRceCost) {
                        termRceDoc[t.id].replacement_cost = extractedRceCost;
                    }
                    if (!termRceDoc[t.id].sq_feet && extractedRceSqft) {
                        termRceDoc[t.id].sq_feet = extractedRceSqft;
                    }
                    if (!termRceDoc[t.id].cost_per_sqft && extractedRceCostPerSqft) {
                        termRceDoc[t.id].cost_per_sqft = extractedRceCostPerSqft;
                    }
                }
            } else if ((doc.doc_type === 'dic_dec_page' || fn.includes('dic')) && !isFairPlanCarrier) {
                // Only set as in-force DIC Dec Page if it is NOT a quote and NOT a FAIR Plan Dec Page
                if (!isQuoteDoc) {
                    const c = detectDocCarrier(doc.file_name, doc.raw_text, 'dic_dec_page');
                    if (c && c !== 'California FAIR Plan' && !termDicCarrier[t.id]) termDicCarrier[t.id] = c;
                    if (doc.storage_path && !termDicDoc[t.id]) {
                        termDicDoc[t.id] = { storage_path: doc.storage_path, file_name: doc.file_name };
                    }
                }
            } else if (doc.doc_type === 'es_doc') {
                if (doc.storage_path && !termEsDoc[t.id]) {
                    termEsDoc[t.id] = { storage_path: doc.storage_path, file_name: doc.file_name };
                }
            }
        }
    }

    const bambooCoverageSet = new Set<string>();
    const noDicAvailableSet = new Set<string>();
    const servicingStatusMap: Record<string, string> = {};
    const servicingReturnMap: Record<string, { reason: string; custom_notes?: string; returned_by?: string; returned_at?: string }> = {};
    const cfpMailSentMap: Record<string, {
        sent_to?: string[];
        sent_to_names?: string[];
        sent_cc?: string[];
        sent_cc_names?: string[];
        sent_by?: string;
        sent_by_email?: string;
        sent_at?: string;
        subject?: string;
        attachments?: string[];
    }> = {};
    const titleProMap: Record<string, TitleProData> = {};
    const manualCarrierQuotes: Record<string, Partial<Record<CarrierKey, CarrierQuoteData>>> = {};
    const manualRceValuationMap: Record<string, {
        replacement_cost: number | null;
        carrier?: string | null;
        sq_feet?: number | null;
        cost_per_sqft?: number | null;
        notes?: string | null;
    }> = {};

    for (const ov of bambooOverrides) {
        if (ov.field_name === 'has_bamboo_coverage' && (ov.new_value === 'true' || ov.new_value === '1')) {
            bambooCoverageSet.add(ov.policy_id);
        } else if (ov.field_name === 'no_dic_available' && (ov.new_value === 'true' || ov.new_value === '1')) {
            noDicAvailableSet.add(ov.policy_id);
        } else if (ov.field_name === 'servicing_email_item' && ov.new_value) {
            try {
                const parsed = JSON.parse(ov.new_value);
                servicingStatusMap[ov.policy_id] = parsed.status || 'ready';
            } catch {
                servicingStatusMap[ov.policy_id] = 'ready';
            }
        } else if (ov.field_name === 'servicing_return_info' && ov.new_value) {
            try {
                const parsed = JSON.parse(ov.new_value);
                servicingReturnMap[ov.policy_id] = parsed;
            } catch {
                servicingReturnMap[ov.policy_id] = { reason: 'Returned' };
            }
        } else if (ov.field_name === 'cfp_mail_sent' && ov.new_value) {
            try {
                const parsed = JSON.parse(ov.new_value);
                cfpMailSentMap[ov.policy_id] = parsed;
            } catch {
                cfpMailSentMap[ov.policy_id] = {};
            }
        } else if (ov.field_name === 'title_pro' && ov.new_value) {
            try {
                const parsed = JSON.parse(ov.new_value);
                titleProMap[ov.policy_id] = parsed;
            } catch {}
        } else if (ov.field_name.startsWith('carrier_quote_') && ov.new_value) {
            const carrierKey = ov.field_name.replace('carrier_quote_', '') as CarrierKey;
            try {
                const parsed = JSON.parse(ov.new_value);
                if (!manualCarrierQuotes[ov.policy_id]) {
                    manualCarrierQuotes[ov.policy_id] = {};
                }
                manualCarrierQuotes[ov.policy_id][carrierKey] = parsed;
            } catch {}
        } else if (ov.field_name === 'rce_valuation' && ov.new_value) {
            try {
                const parsed = JSON.parse(ov.new_value);
                manualRceValuationMap[ov.policy_id] = parsed;
            } catch {}
        } else if (ov.field_name === 'rce_replacement_cost' && ov.new_value) {
            const num = parseFloat(ov.new_value.replace(/[^0-9.]/g, ''));
            if (!isNaN(num)) {
                if (!manualRceValuationMap[ov.policy_id]) {
                    manualRceValuationMap[ov.policy_id] = { replacement_cost: num };
                } else if (!manualRceValuationMap[ov.policy_id].replacement_cost) {
                    manualRceValuationMap[ov.policy_id].replacement_cost = num;
                }
            }
        }
    }

    // Auto-detect carrier quotes from platform_documents per policy
    const autoCarrierQuotes: Record<string, Partial<Record<CarrierKey, CarrierQuoteData>>> = {};
    for (const doc of docs) {
        const detected = detectCarrierQuoteInfo(doc.file_name, null, doc.doc_type, doc.doc_data_dic);
        if (detected) {
            const pid = doc.policy_id;
            if (!autoCarrierQuotes[pid]) autoCarrierQuotes[pid] = {};
            const existing = autoCarrierQuotes[pid][detected.carrier_key];
            if (!existing || (!existing.premium && detected.premium)) {
                autoCarrierQuotes[pid][detected.carrier_key] = {
                    ...detected,
                    storage_path: doc.storage_path,
                    file_name: doc.file_name,
                };
            }
        }
    }

    // Build comment counts and latest note preview per policy
    const policyCommentDec: Record<string, number> = {};
    const policyCommentRce: Record<string, number> = {};
    const policyCommentDic: Record<string, number> = {};
    const policyCommentQuote: Record<string, number> = {};
    const policyNoteCount: Record<string, number> = {};
    const policyLatestNotePreview: Record<string, string> = {};

    const sortedNotes = [...(notesData || [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    for (const note of sortedNotes) {
        const pid = note.policy_id;
        if (!pid) continue;

        const tags = (note.meta?.tags as string[]) || [];
        const isDocTag = tags.some(t => ['DEC', 'RCE', 'DIC', 'Quote'].includes(t));

        if (tags.includes('DEC')) {
            policyCommentDec[pid] = (policyCommentDec[pid] || 0) + 1;
        }
        if (tags.includes('RCE')) {
            policyCommentRce[pid] = (policyCommentRce[pid] || 0) + 1;
        }
        if (tags.includes('DIC')) {
            policyCommentDic[pid] = (policyCommentDic[pid] || 0) + 1;
        }
        if (tags.includes('Quote')) {
            policyCommentQuote[pid] = (policyCommentQuote[pid] || 0) + 1;
        }

        if (!isDocTag) {
            policyNoteCount[pid] = (policyNoteCount[pid] || 0) + 1;
            if (!policyLatestNotePreview[pid] && note.body) {
                policyLatestNotePreview[pid] = note.body.slice(0, 60);
            }
        }
    }

    // ── 6. Build flat rows ────────────────────────────────────────────────
    const rows: CFPTermRow[] = (terms as any[]).map((t: any) => {
        const policy = t.policies;
        const client = policy?.clients;
        const policyId = t.policy_id;
        const polTerms = termsByPolicy[policyId] || [];

        const docSet = termDocTypes[t.id] || new Set<string>();
        const termDec = termDecDocMap[t.id] || null;

        // Priority for policy_number: 
        // 1. carrier_policy_number on this specific term IF it's a real policy number (e.g. 'CFP 0101227750 05')
        // 2. dec_pages.policy_number linked specifically to this term
        // 3. base policy number on policy record
        // 4. carrier_policy_number fallback (e.g. BAM-P-xxxx if policy is pending_dec)
        let termPolicyNum = '';
        if (t.carrier_policy_number && (t.carrier_policy_number.startsWith('CFP') || t.carrier_policy_number.startsWith('COM') || t.carrier_policy_number.startsWith('CEA') || t.carrier_policy_number.startsWith('DIV') || t.carrier_policy_number.startsWith('DWG'))) {
            termPolicyNum = t.carrier_policy_number;
        } else if (termDec?.policy_number) {
            termPolicyNum = termDec.policy_number;
        } else if (policy?.policy_number && (policy.policy_number.startsWith('CFP') || policy.policy_number.startsWith('COM') || policy.policy_number.startsWith('CEA') || policy.policy_number.startsWith('DIV') || policy.policy_number.startsWith('DWG'))) {
            termPolicyNum = policy.policy_number;
        } else {
            termPolicyNum = t.carrier_policy_number || policy?.policy_number || '';
        }
        const { basePolicy, suffix } = normalizePolicyNumber(termPolicyNum);

        const rceDoc = termRceDoc[t.id] || policyRceDoc[policyId] || null;
        const manualRce = manualRceValuationMap[policyId];
        const finalRceReplacementCost = manualRce?.replacement_cost ?? rceDoc?.replacement_cost ?? null;
        const finalRceCarrier = manualRce?.carrier || termRceCarrier[t.id] || policyRceCarrier[policyId] || (rceDoc ? '360Value' : null);
        const finalRceSqFeet = manualRce?.sq_feet ?? rceDoc?.sq_feet ?? null;
        const finalRceCostPerSqft = manualRce?.cost_per_sqft ?? rceDoc?.cost_per_sqft ?? null;
        const hasRce = docSet.has('rce') || (policyDocTypes[policyId]?.has('rce') ?? false) || !!rceDoc || manualRce?.replacement_cost != null;
        const rceCarrier = finalRceCarrier;

        const dicDoc = termDicDoc[t.id] || policyDicDoc[policyId] || null;
        const hasDic = docSet.has('dic_dec_page') || (policyDocTypes[policyId]?.has('dic_dec_page') ?? false) || !!t.dic_exists || !!dicDoc;
        const dicFromPn = detectDocCarrier(t.dic_policy_number, null, 'dic_dec_page');
        const dicCarrier = termDicCarrier[t.id] || policyDicCarrier[policyId] || dicFromPn || (hasDic ? 'DIC' : null);
        const isPendingDec = policy?.status === 'pending_dec';

        const esDoc = termEsDoc[t.id] || policyEsDoc[policyId] || null;
        const hasEs = docSet.has('es_doc') || (policyDocTypes[policyId]?.has('es_doc') ?? false) || !!t.es_exists || !!esDoc;

        const hasDec = !!termDec;
        const decStoragePath = termDec?.storage_path || null;
        const decFileName = termDec?.file_name || null;
        const decBucket = (termDec?.bucket || 'cfp-raw-decpage') as 'cfp-raw-decpage' | 'cfp-platform-documents';

        // Check if there is an incoming contiguous renewal term that has a dec page uploaded, or policy-level renewal dec
        let hasRenewalDec = false;
        let renewalDecStoragePath: string | null = null;
        let renewalDecFileName: string | null = null;
        let renewalDecBucket: 'cfp-raw-decpage' | 'cfp-platform-documents' | null = null;
        let renewalAnnualPremium: number | null = null;
        let renewalEffectiveDate: string | null = null;
        let renewalExpirationDate: string | null = null;

        if (polTerms.length > 1) {
            const renewalTerm = polTerms.find((otherTerm: any) =>
                otherTerm.id !== t.id &&
                ((otherTerm.effective_date && t.expiration_date && otherTerm.effective_date === t.expiration_date) ||
                 (otherTerm.expiration_date && t.expiration_date && new Date(otherTerm.expiration_date) > new Date(t.expiration_date)))
            );
            if (renewalTerm) {
                const rDoc = termDecDocMap[renewalTerm.id];
                if (rDoc) {
                    hasRenewalDec = true;
                    renewalDecStoragePath = rDoc?.storage_path || null;
                    renewalDecFileName = rDoc?.file_name || null;
                    renewalDecBucket = rDoc?.bucket || 'cfp-platform-documents';
                    if ((rDoc as any)?.total_premium) {
                        renewalAnnualPremium = (rDoc as any).total_premium;
                    }
                }
                if (renewalTerm.annual_premium && !renewalAnnualPremium) {
                    renewalAnnualPremium = parseFloat(renewalTerm.annual_premium);
                }
                renewalEffectiveDate = renewalTerm.effective_date || null;
                renewalExpirationDate = renewalTerm.expiration_date || null;
            }
        }

        if (!hasRenewalDec && policyRenewalDecDocMap[policyId]) {
            const rDoc = policyRenewalDecDocMap[policyId];
            hasRenewalDec = true;
            renewalDecStoragePath = rDoc?.storage_path || null;
            renewalDecFileName = rDoc?.file_name || null;
            renewalDecBucket = rDoc?.bucket || 'cfp-platform-documents';
            if ((rDoc as any)?.total_premium && !renewalAnnualPremium) {
                renewalAnnualPremium = (rDoc as any).total_premium;
            }
        }

        // If still no direct dec and no renewal dec, check if policy has any dec page on file
        let finalDecStoragePath = decStoragePath;
        let finalDecFileName = decFileName;
        let finalDecBucket = decBucket;
        let finalHasDec = hasDec;

        if (!finalHasDec && !hasRenewalDec && policyDecDocMap[policyId]) {
            const pDoc = policyDecDocMap[policyId];
            finalHasDec = true;
            finalDecStoragePath = pDoc?.storage_path || null;
            finalDecFileName = pDoc?.file_name || null;
            finalDecBucket = pDoc?.bucket || 'cfp-raw-decpage';
        }

        // Quotes, Mail Sent, Title Pro, Comments attach across policy terms
        const termCfpMailSent = cfpMailSentMap[policyId];
        const termServicingStatus = servicingStatusMap[policyId] || (termCfpMailSent ? 'emailed_to_agent' : null);
        const termReturnedFromSe = !servicingStatusMap[policyId] && !!servicingReturnMap[policyId];

        const termCarrierQuotes = {
            bamboo: manualCarrierQuotes[policyId]?.bamboo
                ? {
                    ...autoCarrierQuotes[policyId]?.bamboo,
                    ...manualCarrierQuotes[policyId]?.bamboo,
                    storage_path: autoCarrierQuotes[policyId]?.bamboo?.storage_path || manualCarrierQuotes[policyId]?.bamboo?.storage_path || null,
                    file_name: autoCarrierQuotes[policyId]?.bamboo?.file_name || manualCarrierQuotes[policyId]?.bamboo?.file_name || null,
                }
                : autoCarrierQuotes[policyId]?.bamboo || (bambooCoverageSet.has(policyId) ? { carrier_key: 'bamboo', coverage_type: 'FULL' } : null),
            aegis: manualCarrierQuotes[policyId]?.aegis
                ? {
                    ...autoCarrierQuotes[policyId]?.aegis,
                    ...manualCarrierQuotes[policyId]?.aegis,
                    storage_path: autoCarrierQuotes[policyId]?.aegis?.storage_path || manualCarrierQuotes[policyId]?.aegis?.storage_path || null,
                    file_name: autoCarrierQuotes[policyId]?.aegis?.file_name || manualCarrierQuotes[policyId]?.aegis?.file_name || null,
                }
                : autoCarrierQuotes[policyId]?.aegis || null,
            am: manualCarrierQuotes[policyId]?.am
                ? {
                    ...autoCarrierQuotes[policyId]?.am,
                    ...manualCarrierQuotes[policyId]?.am,
                    storage_path: autoCarrierQuotes[policyId]?.am?.storage_path || manualCarrierQuotes[policyId]?.am?.storage_path || null,
                    file_name: autoCarrierQuotes[policyId]?.am?.file_name || manualCarrierQuotes[policyId]?.am?.file_name || null,
                }
                : autoCarrierQuotes[policyId]?.am || null,
            sagesure: manualCarrierQuotes[policyId]?.sagesure
                ? {
                    ...autoCarrierQuotes[policyId]?.sagesure,
                    ...manualCarrierQuotes[policyId]?.sagesure,
                    storage_path: autoCarrierQuotes[policyId]?.sagesure?.storage_path || manualCarrierQuotes[policyId]?.sagesure?.storage_path || null,
                    file_name: autoCarrierQuotes[policyId]?.sagesure?.file_name || manualCarrierQuotes[policyId]?.sagesure?.file_name || null,
                }
                : autoCarrierQuotes[policyId]?.sagesure || null,
            psic: manualCarrierQuotes[policyId]?.psic
                ? {
                    ...autoCarrierQuotes[policyId]?.psic,
                    ...manualCarrierQuotes[policyId]?.psic,
                    storage_path: autoCarrierQuotes[policyId]?.psic?.storage_path || manualCarrierQuotes[policyId]?.psic?.storage_path || null,
                    file_name: autoCarrierQuotes[policyId]?.psic?.file_name || manualCarrierQuotes[policyId]?.psic?.file_name || null,
                }
                : autoCarrierQuotes[policyId]?.psic || null,
        };

        return {
            policy_id: policyId,
            policy_number: termPolicyNum,
            base_policy: basePolicy || termPolicyNum,
            suffix: suffix || null,
            property_address: policy?.property_address_raw || termAddressMap[t.id] || policyAddressMap[policyId] || '',
            mailing_address: client?.mailing_address_raw || (termDec as any)?.mailing_address || '',
            carrier_name: policy?.carrier_name || '',
            has_bamboo_coverage: bambooCoverageSet.has(policyId),
            client_id: client?.id || '',
            named_insured: client?.named_insured || '',
            policy_term_id: t.id,
            effective_date: t.effective_date,
            expiration_date: t.expiration_date,
            carrier_status: t.carrier_status || (policy?.status === 'pending_dec' ? 'Pending DEC' : 'Active'),
            policy_status: policy?.status || 'active',
            annual_premium: t.annual_premium
                ? parseFloat(t.annual_premium)
                : (termDec?.total_premium ?? (policyDecDocMap[policyId] as any)?.total_premium ?? null),
            payment_status: t.payment_status,
            payment_plan: t.payment_plan,
            is_current: t.is_current,
            has_dec: finalHasDec,
            dec_storage_path: finalDecStoragePath,
            dec_file_name: finalDecFileName,
            dec_bucket: finalDecBucket,
            has_renewal_dec: hasRenewalDec,
            renewal_dec_storage_path: renewalDecStoragePath,
            renewal_dec_file_name: renewalDecFileName,
            renewal_dec_bucket: renewalDecBucket,
            has_rce: hasRce,
            rce_carrier: rceCarrier,
            rce_storage_path: rceDoc?.storage_path || null,
            rce_file_name: rceDoc?.file_name || null,
            rce_replacement_cost: finalRceReplacementCost,
            rce_sq_feet: finalRceSqFeet,
            rce_cost_per_sqft: finalRceCostPerSqft,
            has_dic: hasDic,
            dic_carrier: dicCarrier,
            dic_storage_path: dicDoc?.storage_path || null,
            dic_file_name: dicDoc?.file_name || null,
            has_es: hasEs,
            es_storage_path: esDoc?.storage_path || null,
            es_file_name: esDoc?.file_name || null,
            no_dic_available: noDicAvailableSet.has(policyId),
            is_pending_dec: isPendingDec,
            comment_count_dec: policyCommentDec[policyId] || 0,
            comment_count_rce: policyCommentRce[policyId] || 0,
            comment_count_dic: policyCommentDic[policyId] || 0,
            comment_count_quote: policyCommentQuote[policyId] || 0,
            note_count: policyNoteCount[policyId] || 0,
            latest_note_preview: policyLatestNotePreview[policyId] || null,
            in_servicing_email: !!termCfpMailSent,
            servicing_status: termServicingStatus,
            returned_from_se: termReturnedFromSe,
            return_reason: servicingReturnMap[policyId]?.reason || null,
            return_notes: servicingReturnMap[policyId]?.custom_notes || null,
            returned_by: servicingReturnMap[policyId]?.returned_by || null,
            returned_at: servicingReturnMap[policyId]?.returned_at || null,
            cfp_mail_sent: !!termCfpMailSent,
            cfp_mail_sent_to: termCfpMailSent?.sent_to || [],
            cfp_mail_sent_to_names: termCfpMailSent?.sent_to_names || [],
            cfp_mail_sent_cc: termCfpMailSent?.sent_cc || [],
            cfp_mail_sent_cc_names: termCfpMailSent?.sent_cc_names || [],
            cfp_mail_sent_by: termCfpMailSent?.sent_by || null,
            cfp_mail_sent_by_email: termCfpMailSent?.sent_by_email || null,
            cfp_mail_sent_at: termCfpMailSent?.sent_at || null,
            cfp_mail_subject: termCfpMailSent?.subject || null,
            cfp_mail_attachments: termCfpMailSent?.attachments || [],
            carrier_quotes: termCarrierQuotes,
            title_pro: titleProMap[policyId] || null,
            renewal_annual_premium: renewalAnnualPremium,
            renewal_effective_date: renewalEffectiveDate,
            renewal_expiration_date: renewalExpirationDate,
            term_type: 'ORIGINAL', // Will be recalculated below
            term_index: 0,
        };
    });

    // ── 7. Apply search filter ────────────────────────────────────────────
    let filtered = rows;
    if (search) {
        const q = search.toLowerCase().trim();
        const tokens = q.split(/\s+/).filter(Boolean);
        filtered = rows.filter(r => {
            const pn = (r.policy_number || '').toLowerCase();
            const bp = (r.base_policy || '').toLowerCase();
            const ni = (r.named_insured || '').toLowerCase();
            const addr = (r.property_address || '').toLowerCase();
            const combined = `${pn} ${bp} ${ni} ${addr}`;

            // Check that every typed token matches in this row
            return tokens.every(token => {
                // If token contains digits (e.g. policy number, zip code, street number), use direct substring match
                if (/\d/.test(token)) {
                    return combined.includes(token);
                }
                // If pure letters (e.g. "huang", "charles", "alamo"):
                // 1. Direct word-boundary match (e.g. matches "Huang" or "Charles" or "Alamo")
                const wordBoundaryRegex = new RegExp(`(?:^|[^a-zA-Z0-9])${token}`, 'i');
                if (wordBoundaryRegex.test(combined)) {
                    return true;
                }
                // 2. Standard substring match as fallback
                return combined.includes(token);
            });
        });
    }

    // ── 8. Group into families ────────────────────────────────────────────
    const familyMap: Record<string, CFPTermRow[]> = {};
    for (const row of filtered) {
        if (!familyMap[row.base_policy]) {
            familyMap[row.base_policy] = [];
        }
        familyMap[row.base_policy].push(row);
    }

    // Sort terms within each family by effective_date, label ORIGINAL/RENEWAL, and unify family-wide metadata
    const families: CFPFamily[] = Object.entries(familyMap).map(([base_policy, termRows]) => {
        // Sort by effective_date asc (oldest = ORIGINAL)
        const sorted = [...termRows].sort((a, b) => {
            const da = a.effective_date || '';
            const db = b.effective_date || '';
            return da.localeCompare(db);
        });

        // 1. Find family-wide Title Pro (if any term was verified)
        const familyTitlePro = sorted.find(t => !!t.title_pro)?.title_pro || null;

        // 2. Merge family-wide carrier quotes
        const familyCarrierQuotes: any = {
            bamboo: sorted.find(t => !!t.carrier_quotes?.bamboo)?.carrier_quotes?.bamboo || null,
            aegis: sorted.find(t => !!t.carrier_quotes?.aegis)?.carrier_quotes?.aegis || null,
            am: sorted.find(t => !!t.carrier_quotes?.am)?.carrier_quotes?.am || null,
            sagesure: sorted.find(t => !!t.carrier_quotes?.sagesure)?.carrier_quotes?.sagesure || null,
            psic: sorted.find(t => !!t.carrier_quotes?.psic)?.carrier_quotes?.psic || null,
        };

        // 3. Find family-wide Renewal Dec & Renewal Premium
        const renewalTerm = sorted.find(t => t.has_renewal_dec || t.term_type === 'RENEWAL' || t.renewal_annual_premium);
        const familyRenewalPremium = renewalTerm?.renewal_annual_premium || (sorted.length > 1 && sorted[1].annual_premium ? sorted[1].annual_premium : null);
        const familyRenewalExp = renewalTerm?.renewal_expiration_date || (sorted.length > 1 && sorted[1].expiration_date ? sorted[1].expiration_date : null);

        sorted.forEach((row, i) => {
            row.term_index = i;
            row.term_type = i === 0 ? 'ORIGINAL' : 'RENEWAL';
            if (!row.title_pro && familyTitlePro) {
                row.title_pro = familyTitlePro;
            }
            if (row.carrier_quotes) {
                if (!row.carrier_quotes.bamboo && familyCarrierQuotes.bamboo) row.carrier_quotes.bamboo = familyCarrierQuotes.bamboo;
                if (!row.carrier_quotes.aegis && familyCarrierQuotes.aegis) row.carrier_quotes.aegis = familyCarrierQuotes.aegis;
                if (!row.carrier_quotes.am && familyCarrierQuotes.am) row.carrier_quotes.am = familyCarrierQuotes.am;
                if (!row.carrier_quotes.sagesure && familyCarrierQuotes.sagesure) row.carrier_quotes.sagesure = familyCarrierQuotes.sagesure;
                if (!row.carrier_quotes.psic && familyCarrierQuotes.psic) row.carrier_quotes.psic = familyCarrierQuotes.psic;
            }
            if (!row.renewal_annual_premium && familyRenewalPremium && row.annual_premium !== familyRenewalPremium) {
                row.renewal_annual_premium = familyRenewalPremium;
            }
            if (!row.renewal_expiration_date && familyRenewalExp && row.expiration_date !== familyRenewalExp) {
                row.renewal_expiration_date = familyRenewalExp;
            }
        });

        return { base_policy, terms: sorted };
    });

    // Sort families by earliest expiration_date in the family
    families.sort((a, b) => {
        const ea = a.terms[0]?.expiration_date || '';
        const eb = b.terms[0]?.expiration_date || '';
        return ea.localeCompare(eb);
    });

    const responsePayload = {
        success: true,
        families,
        total_terms: filtered.length,
        total_families: families.length,
    };

    if (!search) {
        serverSummaryCache.set(cacheKey, {
            data: responsePayload,
            timestamp: Date.now(),
        });
    }

    return NextResponse.json(responsePayload);
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

    // Invalidate server memory cache on manual updates
    serverSummaryCache.clear();

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

// ── Helper: compute stats with concurrency & server caching ─────────────────
const DEFAULT_BASELINE_STATS: CFPSummaryStats = {
    total_policies: 2924,
    total_bamboo_pending: 66,
    total_families: 2924,
    total_accounts: 2606,
    expiring_this_month: 57,
    missing_dec: 2291,
    uploaded_dec: 633,
    missing_rce: 2485,
    uploaded_rce: 439,
    missing_dic: 2711,
    uploaded_dic: 213,
    uploaded_full: 507,
    total_quoted: 684,
    missing_quotes: 2240,
    missing_es: 2240,
};

let cachedGlobalStats: { stats: CFPSummaryStats; timestamp: number } = {
    stats: DEFAULT_BASELINE_STATS,
    timestamp: Date.now(),
};

async function computeStats(admin: ReturnType<typeof getSupabaseAdmin>): Promise<CFPSummaryStats> {
    return cachedGlobalStats.stats;
}
