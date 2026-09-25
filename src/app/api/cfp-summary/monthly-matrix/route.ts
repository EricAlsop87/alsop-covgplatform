import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { normalizePolicyNumber } from '@/lib/normalization';
import { detectCarrierQuoteInfo } from '@/app/api/cfp-summary/route';

export const dynamic = 'force-dynamic';

export interface MonthlyMatrixRow {
    month: number;
    monthName: string;
    totalUniquePolicies: number;
    decUploaded: number;
    rceUploaded: number;
    totalWithAddress: number;
    totalNoAddress: number;
    quotedCount: number;
    unquotableCount: number;
}

export interface MonthlyMatrixTotals {
    totalUniquePolicies: number;
    decUploaded: number;
    rceUploaded: number;
    totalWithAddress: number;
    totalNoAddress: number;
    quotedCount: number;
    unquotableCount: number;
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// In-memory cache for fast responses (60s TTL)
const matrixCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 60_000;

export async function GET(req: NextRequest) {
    const authResult = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent', 'user'] });
    if (isAuthError(authResult)) {
        return authResult;
    }

    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year') || String(new Date().getFullYear());
    const cacheKey = `matrix_${year}`;

    const cached = matrixCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return NextResponse.json(cached.data);
    }

    const admin = getSupabaseAdmin();

    try {
        // High-performance parallel execution: 4 term range chunks + docs + decs + overrides simultaneously
        const buildTermsQuery = () => {
            let q = admin
                .from('policy_terms')
                .select(`
                    id,
                    policy_id,
                    effective_date,
                    expiration_date,
                    annual_premium,
                    carrier_policy_number,
                    carrier_status,
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
                            named_insured,
                            mailing_address_raw
                        )
                    )
                `)
                .or('policy_number.ilike.CFP %,policy_number.ilike.CEA %,policy_number.ilike.COM %,policy_number.ilike.DIV %,policy_number.ilike.DWG %', { foreignTable: 'policies' })
                .neq('policies.status', 'pending_dec')
                .order('expiration_date', { ascending: true });

            if (year && year !== 'all' && year !== '') {
                const yearNum = parseInt(year, 10);
                const startDate = `${yearNum}-01-01`;
                const endDate = `${yearNum}-12-31`;
                q = q.gte('expiration_date', startDate).lte('expiration_date', endDate);
            }
            return q;
        };

        const [
            chunk0,
            chunk1,
            chunk2,
            chunk3,
            decPagesRes,
            docsRes,
            overridesRes
        ] = await Promise.all([
            buildTermsQuery().range(0, 999),
            buildTermsQuery().range(1000, 1999),
            buildTermsQuery().range(2000, 2999),
            buildTermsQuery().range(3000, 3999),
            admin
                .from('dec_pages')
                .select('id, policy_id, policy_term_id, policy_number, property_location, mailing_address, total_annual_premium, dec_page_submissions(storage_path, file_name, bucket)')
                .limit(5000),
            admin
                .from('platform_documents')
                .select('id, policy_id, policy_term_id, doc_type, file_name, storage_path, bucket, extracted_address, raw_text, doc_data_dic(carrier_name, policy_number, document_type, has_dic_endorsement, rce_replacement_cost), doc_data_rce(replacement_cost, sq_feet)')
                .in('doc_type', ['rce', 'dic_dec_page', 'es_doc', 'other'])
                .limit(5000),
            admin
                .from('manual_overrides')
                .select('policy_id, field_name, new_value')
                .in('field_name', ['has_bamboo_coverage', 'no_dic_available', 'carrier_quote_bamboo', 'carrier_quote_aegis', 'carrier_quote_am', 'carrier_quote_sagesure', 'carrier_quote_psic', 'rce_valuation', 'rce_replacement_cost'])
                .limit(5000)
        ]);

        const allTerms: any[] = [
            ...(chunk0.data || []),
            ...(chunk1.data || []),
            ...(chunk2.data || []),
            ...(chunk3.data || [])
        ];

        const decPages = decPagesRes.data || [];
        const docs = docsRes.data || [];
        const overrides = overridesRes.data || [];

        // Build lookups in memory
        const termsByPolicy: Record<string, any[]> = {};
        for (const t of allTerms) {
            if (!termsByPolicy[t.policy_id]) termsByPolicy[t.policy_id] = [];
            termsByPolicy[t.policy_id].push(t);
        }

        const termDecDocMap: Record<string, { storage_path?: string; file_name?: string }> = {};
        const policyDecDocMap: Record<string, { storage_path?: string; file_name?: string }> = {};
        const policyRenewalDecDocMap: Record<string, { storage_path?: string; file_name?: string }> = {};
        const policyAddressMap: Record<string, string> = {};
        const termAddressMap: Record<string, string> = {};

        for (const d of decPages) {
            const addr = d.property_location || d.mailing_address;
            if (addr) {
                if (d.policy_id && !policyAddressMap[d.policy_id]) policyAddressMap[d.policy_id] = addr;
                if (d.policy_term_id && !termAddressMap[d.policy_term_id]) termAddressMap[d.policy_term_id] = addr;
            }
            const sub = Array.isArray(d.dec_page_submissions) ? d.dec_page_submissions[0] : d.dec_page_submissions;
            if (sub?.storage_path) {
                const docInfo = { storage_path: sub.storage_path, file_name: sub.file_name };
                if (d.policy_id) policyDecDocMap[d.policy_id] = docInfo;
                if (d.policy_term_id) termDecDocMap[d.policy_term_id] = docInfo;
                else if (d.policy_id && (termsByPolicy[d.policy_id] || []).length === 1) {
                    termDecDocMap[termsByPolicy[d.policy_id][0].id] = docInfo;
                }
                const subFn = (sub.file_name || '').toLowerCase();
                if (subFn.includes('renewal') && d.policy_id) {
                    policyRenewalDecDocMap[d.policy_id] = docInfo;
                }
            }
        }

        const policyDocTypes: Record<string, Set<string>> = {};
        const policyRceDoc: Record<string, boolean> = {};
        const autoQuotes: Record<string, boolean> = {};

        for (const doc of docs) {
            if (doc.extracted_address) {
                if (doc.policy_id && !policyAddressMap[doc.policy_id]) policyAddressMap[doc.policy_id] = doc.extracted_address;
                if (doc.policy_term_id && !termAddressMap[doc.policy_term_id]) termAddressMap[doc.policy_term_id] = doc.extracted_address;
            }
            const fn = (doc.file_name || '').toLowerCase();
            const dic = Array.isArray(doc.doc_data_dic) ? doc.doc_data_dic[0] : doc.doc_data_dic;
            const rce = Array.isArray(doc.doc_data_rce) ? doc.doc_data_rce[0] : doc.doc_data_rce;

            const isCfpDecDoc = (
                doc.doc_type === 'dec_page' ||
                fn.includes('renewal_email_attachment') ||
                fn.includes('renewal_offer') ||
                (fn.includes('cfp') && !fn.includes('bamboo') && !fn.includes('aegis') && !fn.includes('quote') && !fn.includes('dic'))
            );

            if (isCfpDecDoc && doc.storage_path) {
                const docInfo = { storage_path: doc.storage_path, file_name: doc.file_name };
                if (doc.policy_id) policyDecDocMap[doc.policy_id] = docInfo;
                if (doc.policy_term_id) termDecDocMap[doc.policy_term_id] = docInfo;
                else if (doc.policy_id && (termsByPolicy[doc.policy_id] || []).length === 1) {
                    termDecDocMap[termsByPolicy[doc.policy_id][0].id] = docInfo;
                }
                if (fn.includes('renewal') && doc.policy_id) {
                    policyRenewalDecDocMap[doc.policy_id] = docInfo;
                }
                continue;
            }

            const pid = doc.policy_id;
            if (pid) {
                if (!policyDocTypes[pid]) policyDocTypes[pid] = new Set<string>();
                policyDocTypes[pid].add(doc.doc_type);

                if (doc.doc_type === 'rce' || (fn.includes('rce') && !fn.includes('quote')) || !!rce || !!dic?.rce_replacement_cost) {
                    policyRceDoc[pid] = true;
                }

                const detectedQuote = detectCarrierQuoteInfo(doc.file_name, doc.raw_text, doc.doc_type, doc.doc_data_dic);
                if (detectedQuote && (detectedQuote.coverage_type === 'DIC' || detectedQuote.coverage_type === 'FULL' || detectedQuote.coverage_type === 'QUOTE')) {
                    autoQuotes[pid] = true;
                }
            }
        }

        const bambooCoverageSet = new Set<string>();
        const quotedOverrides = new Set<string>();
        const manualRceSet = new Set<string>();

        for (const ov of overrides) {
            if (ov.field_name === 'has_bamboo_coverage' && ov.new_value === 'true') {
                bambooCoverageSet.add(ov.policy_id);
            }
            if (ov.field_name.startsWith('carrier_quote_')) {
                quotedOverrides.add(ov.policy_id);
            }
            if (ov.field_name === 'rce_valuation' || ov.field_name === 'rce_replacement_cost') {
                manualRceSet.add(ov.policy_id);
            }
        }

        function getMonthStr(dateStr: string | null) {
            if (!dateStr) return null;
            const parts = String(dateStr).split('-');
            return parts.length >= 2 ? parts[1] : null;
        }

        function getYearStr(dateStr: string | null) {
            if (!dateStr) return null;
            const parts = String(dateStr).split('-');
            return parts.length >= 1 ? parts[0] : null;
        }

        // Build 12-month matrix
        const matrix: MonthlyMatrixRow[] = [];

        for (let m = 1; m <= 12; m++) {
            const mStr = String(m).padStart(2, '0');
            const monthName = MONTH_NAMES[m - 1];

            const monthTerms = allTerms.filter((t: any) => {
                const expM = getMonthStr(t.expiration_date);
                if (expM !== mStr) return false;

                if (year && year !== 'all' && year !== '') {
                    const expY = getYearStr(t.expiration_date);
                    return expY === year;
                }
                return true;
            });

            // Deduplicate by Base Policy (Family Level)
            const policyMap = new Map<string, {
                policyId: string;
                hasDec: boolean;
                hasRce: boolean;
                hasAddress: boolean;
                isQuoted: boolean;
            }>();

            for (const t of monthTerms) {
                const polObj: any = Array.isArray(t.policies) ? t.policies[0] : t.policies;
                const pid = t.policy_id;
                const tid = t.id;

                let termPolicyNum = t.carrier_policy_number || polObj?.policy_number || '';
                const { basePolicy } = normalizePolicyNumber(termPolicyNum);
                const key = basePolicy || polObj?.policy_number || pid;

                const hasDec = !!termDecDocMap[tid] || (!!policyDecDocMap[pid] && (t.is_current || (termsByPolicy[pid] || []).length === 1)) || !!policyRenewalDecDocMap[pid];
                const hasRce = !!policyRceDoc[pid] || manualRceSet.has(pid) || (policyDocTypes[pid]?.has('rce') ?? false);
                const rawAddr = polObj?.property_address_raw || termAddressMap[tid] || policyAddressMap[pid] || '';
                const hasAddress = !!rawAddr && rawAddr.trim().length > 3 && rawAddr.trim() !== '—' && rawAddr.trim().toLowerCase() !== 'unknown';
                const isQuoted = bambooCoverageSet.has(pid) || quotedOverrides.has(pid) || !!autoQuotes[pid] || !!t.dic_exists || !!t.es_exists;

                if (!policyMap.has(key)) {
                    policyMap.set(key, {
                        policyId: pid,
                        hasDec,
                        hasRce,
                        hasAddress,
                        isQuoted,
                    });
                } else {
                    const existing = policyMap.get(key)!;
                    if (hasDec) existing.hasDec = true;
                    if (hasRce) existing.hasRce = true;
                    if (hasAddress) existing.hasAddress = true;
                    if (isQuoted) existing.isQuoted = true;
                }
            }

            const uniquePolicies = Array.from(policyMap.values());

            let decUploaded = 0;
            let rceUploaded = 0;
            let totalWithAddress = 0;
            let totalNoAddress = 0;
            let quotedCount = 0;
            let unquotableCount = 0;

            for (const item of uniquePolicies) {
                if (item.hasDec) decUploaded++;
                if (item.hasRce) rceUploaded++;
                if (item.hasAddress) totalWithAddress++;
                else totalNoAddress++;
                if (item.isQuoted) quotedCount++;
                if (!item.hasDec && !item.hasAddress) unquotableCount++;
            }

            matrix.push({
                month: m,
                monthName,
                totalUniquePolicies: uniquePolicies.length,
                decUploaded,
                rceUploaded,
                totalWithAddress,
                totalNoAddress,
                quotedCount,
                unquotableCount,
            });
        }

        // Global deduplication across all terms for true annual totals
        const globalPolicyMap = new Map<string, {
            policyId: string;
            hasDec: boolean;
            hasRce: boolean;
            hasAddress: boolean;
            isQuoted: boolean;
        }>();

        for (const t of allTerms) {
            const polObj: any = Array.isArray(t.policies) ? t.policies[0] : t.policies;
            const pid = t.policy_id;
            const tid = t.id;

            let termPolicyNum = t.carrier_policy_number || polObj?.policy_number || '';
            const { basePolicy } = normalizePolicyNumber(termPolicyNum);
            const key = basePolicy || polObj?.policy_number || pid;

            const hasDec = !!termDecDocMap[tid] || (!!policyDecDocMap[pid] && (t.is_current || (termsByPolicy[pid] || []).length === 1)) || !!policyRenewalDecDocMap[pid];
            const hasRce = !!policyRceDoc[pid] || manualRceSet.has(pid) || (policyDocTypes[pid]?.has('rce') ?? false);
            const rawAddr = polObj?.property_address_raw || termAddressMap[tid] || policyAddressMap[pid] || '';
            const hasAddress = !!rawAddr && rawAddr.trim().length > 3 && rawAddr.trim() !== '—' && rawAddr.trim().toLowerCase() !== 'unknown';
            const isQuoted = bambooCoverageSet.has(pid) || quotedOverrides.has(pid) || !!autoQuotes[pid] || !!t.dic_exists || !!t.es_exists;

            if (!globalPolicyMap.has(key)) {
                globalPolicyMap.set(key, {
                    policyId: pid,
                    hasDec,
                    hasRce,
                    hasAddress,
                    isQuoted,
                });
            } else {
                const existing = globalPolicyMap.get(key)!;
                if (hasDec) existing.hasDec = true;
                if (hasRce) existing.hasRce = true;
                if (hasAddress) existing.hasAddress = true;
                if (isQuoted) existing.isQuoted = true;
            }
        }

        const globalUniqueList = Array.from(globalPolicyMap.values());
        let globalDecUploaded = 0;
        let globalRceUploaded = 0;
        let globalWithAddress = 0;
        let globalNoAddress = 0;
        let globalQuotedCount = 0;
        let globalUnquotableCount = 0;

        for (const item of globalUniqueList) {
            if (item.hasDec) globalDecUploaded++;
            if (item.hasRce) globalRceUploaded++;
            if (item.hasAddress) globalWithAddress++;
            else globalNoAddress++;
            if (item.isQuoted) globalQuotedCount++;
            if (!item.hasDec && !item.hasAddress) globalUnquotableCount++;
        }

        const totals: MonthlyMatrixTotals = {
            totalUniquePolicies: globalUniqueList.length,
            decUploaded: globalDecUploaded,
            rceUploaded: globalRceUploaded,
            totalWithAddress: globalWithAddress,
            totalNoAddress: globalNoAddress,
            quotedCount: globalQuotedCount,
            unquotableCount: globalUnquotableCount,
        };

        const responsePayload = {
            success: true,
            year,
            matrix,
            totals,
        };

        matrixCache.set(cacheKey, { data: responsePayload, timestamp: Date.now() });

        return NextResponse.json(responsePayload);
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
