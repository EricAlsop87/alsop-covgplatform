import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { fetchCFPSummaryData, isTermHasRce, isTermRceUnable, isCancelledTerm, type CFPFamily } from '@/app/api/cfp-summary/route';

export const dynamic = 'force-dynamic';

export interface MonthlyMatrixRow {
    month: number;
    monthName: string;
    totalUniquePolicies: number;
    decUploaded: number;
    decNotUploaded: number;
    rceUploaded: number;
    rceNotUploaded: number;
    rceUnable?: number;
    rcePending?: number;
    rceNotUploadedForDec: number;
    totalWithAddress: number;
    totalNoAddress: number;
    quotedCount: number;
    forQuotingCount: number;
    unquotableCount: number;
    archivedCount?: number;
}

export interface MonthlyMatrixTotals {
    totalUniquePolicies: number;
    decUploaded: number;
    decNotUploaded: number;
    rceUploaded: number;
    rceNotUploaded: number;
    rceUnable?: number;
    rcePending?: number;
    rceNotUploadedForDec: number;
    totalWithAddress: number;
    totalNoAddress: number;
    quotedCount: number;
    forQuotingCount: number;
    unquotableCount: number;
    archivedCount?: number;
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// In-memory cache for fast responses (60s TTL)
const matrixCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 60_000;

function computeStatsForFamilies(families: CFPFamily[], targetMonthStr?: string | null, targetYear?: string | null) {
    const policyMap = new Map<string, {
        hasDec: boolean;
        hasRce: boolean;
        isRceUnable: boolean;
        hasAddress: boolean;
        isQuoted: boolean;
    }>();

    let archivedCount = 0;

    for (const f of families) {
        // Find terms that match the target month and year
        const allMatchingTerms = f.terms.filter(t => {
            if (!t.expiration_date) return false;
            const parts = t.expiration_date.split('-');
            if (targetMonthStr && parts.length >= 2 && parts[1] !== targetMonthStr) return false;
            if (targetYear && parts.length >= 1 && parts[0] !== targetYear) return false;
            return true;
        });

        if (allMatchingTerms.length === 0) continue;

        // Active terms: exclude cancelled/archived policies
        const activeTerms = allMatchingTerms.filter(t => !isCancelledTerm(t));

        if (activeTerms.length === 0) {
            // All terms in this month/year are cancelled/archived
            archivedCount++;
            continue;
        }

        let hasDec = false;
        let hasRce = false;
        let isRceUnable = false;
        let hasAddress = false;
        let isQuoted = false;

        for (const t of activeTerms) {
            if (t.has_dec || t.has_renewal_dec) hasDec = true;
            if (isTermHasRce(t)) hasRce = true;
            if (isTermRceUnable(t)) isRceUnable = true;

            const addr = t.property_address || '';
            if (addr && addr.trim().length > 3 && addr.trim() !== '—' && addr.trim().toLowerCase() !== 'unknown') {
                hasAddress = true;
            }

            const quotes = Object.values(t.carrier_quotes || {});
            const hasRealQuote = quotes.some(q => q && (q.coverage_type === 'DIC' || (q.coverage_type === 'FULL' && !!(q.storage_path || q.file_name)) || q.coverage_type === 'QUOTE'));
            if (hasRealQuote || t.has_dic || t.has_es) {
                isQuoted = true;
            }
        }

        // Active family-level fallback for DEC / RCE from non-cancelled terms
        if (!hasDec && f.terms.some(t => !isCancelledTerm(t) && t.has_renewal_dec)) hasDec = true;
        if (!hasRce && f.terms.some(t => !isCancelledTerm(t) && isTermHasRce(t))) hasRce = true;

        policyMap.set(f.base_policy, {
            hasDec,
            hasRce,
            isRceUnable: !hasRce && isRceUnable,
            hasAddress,
            isQuoted,
        });
    }

    const uniquePolicies = Array.from(policyMap.values());
    let decUploaded = 0;
    let decNotUploaded = 0;
    let rceUploaded = 0;
    let rceNotUploaded = 0;
    let rceUnable = 0;
    let rcePending = 0;
    let rceNotUploadedForDec = 0;
    let totalWithAddress = 0;
    let totalNoAddress = 0;
    let quotedCount = 0;
    let unquotableCount = 0;

    for (const item of uniquePolicies) {
        if (item.hasDec) {
            decUploaded++;
            if (!item.hasRce) {
                rceNotUploadedForDec++;
            }
        } else {
            decNotUploaded++;
        }

        if (item.hasRce) {
            rceUploaded++;
        } else if (item.isRceUnable) {
            rceUnable++;
        } else {
            rceNotUploaded++;
            rcePending++;
        }

        if (item.hasAddress) totalWithAddress++;
        else totalNoAddress++;

        if (item.isQuoted) quotedCount++;
        if (!item.hasDec && !item.hasAddress) unquotableCount++;
    }

    const forQuotingCount = Math.max(0, totalWithAddress - quotedCount);

    return {
        totalUniquePolicies: uniquePolicies.length,
        decUploaded,
        decNotUploaded,
        rceUploaded,
        rceNotUploaded,
        rceUnable,
        rcePending,
        rceNotUploadedForDec,
        totalWithAddress,
        totalNoAddress,
        quotedCount,
        forQuotingCount,
        unquotableCount,
        archivedCount,
    };
}

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
        const queryYear = (year && year !== 'all' && year !== '') ? year : null;
        const result = await fetchCFPSummaryData({ year: queryYear, view: 'active_cfp' }, admin);

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error || 'Failed to fetch CFP data' }, { status: 500 });
        }

        const families = result.families || [];

        const matrix: MonthlyMatrixRow[] = [];
        for (let m = 1; m <= 12; m++) {
            const mStr = String(m).padStart(2, '0');
            const monthName = MONTH_NAMES[m - 1];
            const stats = computeStatsForFamilies(families, mStr, queryYear);

            matrix.push({
                month: m,
                monthName,
                ...stats,
            });
        }

        const totals: MonthlyMatrixTotals = computeStatsForFamilies(families, null, queryYear);

        const responseData = {
            success: true,
            year,
            matrix,
            totals,
        };

        matrixCache.set(cacheKey, {
            data: responseData,
            timestamp: Date.now(),
        });

        return NextResponse.json(responseData);
    } catch (err: any) {
        console.error('[CFP Monthly Matrix] Error generating matrix:', err);
        return NextResponse.json(
            { success: false, error: err?.message || 'Internal server error generating monthly matrix' },
            { status: 500 }
        );
    }
}
