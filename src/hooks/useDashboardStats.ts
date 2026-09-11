import useSWR from 'swr';
import { supabase } from '@/lib/supabaseClient';
import { INACTIVE_STATUSES } from '@/lib/policyFilters';

const CACHE_KEY = 'dashboard-stats';

interface DashboardStats {
    totalPolicies: number;
    pendingReview: number;
    highPolicies: number;
    totalHighFlags: number;
    missingDic: number;
    unenriched: number;
    otherStructures: number;
    renewals14Days: number;
}

/**
 * Fetch dashboard stats excluding inactive and pending_dec pipeline accounts
 * so active policy count aligns with CFP Summary.
 */
async function fetchDashboardStats(): Promise<DashboardStats> {
    const inactive = Array.from(INACTIVE_STATUSES);
    const todayStr = new Date().toISOString().split('T')[0];
    const fourteenDays = new Date();
    fourteenDays.setDate(fourteenDays.getDate() + 14);
    const fourteenDaysStr = fourteenDays.toISOString().split('T')[0];

    const [
        totalRes,
        pendingReviewRes,
        highFlagsRes,
        noDicFlagsRes,
        otherStructFlagsRes,
        renewalsRes,
        enrichmentRes,
    ] = await Promise.all([
        supabase.from('policies').select('id', { count: 'exact', head: true }).not('status', 'in', `(${inactive.join(',')})`),
        supabase.from('policies').select('id', { count: 'exact', head: true }).in('status', ['pending_review', 'unknown']).not('status', 'in', `(${inactive.join(',')})`),
        supabase.from('policy_flags').select('id, policies!inner(status)', { count: 'exact', head: true }).eq('status', 'open').in('severity', ['high', 'critical']).not('policies.status', 'in', `(${inactive.join(',')})`),
        supabase.from('policy_flags').select('id, policies!inner(status)', { count: 'exact', head: true }).eq('status', 'open').eq('code', 'NO_DIC').not('policies.status', 'in', `(${inactive.join(',')})`),
        supabase.from('policy_flags').select('id, policies!inner(status)', { count: 'exact', head: true }).eq('status', 'open').eq('code', 'OTHER_STRUCTURES_ZERO').not('policies.status', 'in', `(${inactive.join(',')})`),
        supabase.from('policy_terms').select('id, policies!inner(status)', { count: 'exact', head: true }).eq('is_current', true).gte('expiration_date', todayStr).lte('expiration_date', fourteenDaysStr).not('policies.status', 'in', `(${inactive.join(',')})`),
        supabase.from('property_enrichments').select('id, policies!inner(status)', { count: 'exact', head: true }).not('policies.status', 'in', `(${inactive.join(',')})`),
    ]);

    const totalPolicies = totalRes.count || 0;
    const pendingReview = pendingReviewRes.count || 0;
    const highPolicies = highFlagsRes.count || 0;
    const totalHighFlags = highFlagsRes.count || 0;
    const missingDic = noDicFlagsRes.count || 0;
    const otherStructures = otherStructFlagsRes.count || 0;
    const renewals14Days = renewalsRes.count || 0;
    const enrichedCount = enrichmentRes.count || 0;
    const unenriched = Math.max(0, totalPolicies - enrichedCount);

    return {
        totalPolicies,
        pendingReview,
        highPolicies,
        totalHighFlags,
        missingDic,
        unenriched,
        otherStructures,
        renewals14Days,
    };
}

export function useDashboardStats() {
    const { data, error, isLoading, isValidating, mutate } = useSWR<DashboardStats>(
        CACHE_KEY,
        fetchDashboardStats,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000,       // Stats change less frequently — 60s dedup
            revalidateIfStale: true,
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );

    return {
        stats: data ?? null,
        loading: isLoading,
        refreshing: isValidating && !isLoading,
        error,
        refresh: () => mutate(),
        invalidate: () => mutate(undefined, { revalidate: true }),
    };
}

export { CACHE_KEY as STATS_CACHE_KEY };
