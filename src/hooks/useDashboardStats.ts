import useSWR from 'swr';
import { supabase } from '@/lib/supabaseClient';

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
 * Fetch dashboard stats via the Postgres RPC function `get_dashboard_stats()`.
 *
 * This replaced the previous approach that downloaded ALL policies, flags,
 * and enrichments to the browser and computed counts client-side.
 * The RPC function computes everything server-side in a single call.
 *
 * Migration: docs/migrations/009_dashboard_stats_rpc.sql
 */
async function fetchDashboardStats(): Promise<DashboardStats> {
    const { data, error } = await supabase.rpc('get_dashboard_stats');

    if (error) {
        throw new Error(`Dashboard stats RPC failed: ${error.message}`);
    }

    // The RPC returns a JSON object directly — Supabase parses it for us
    const stats = data as DashboardStats;

    return {
        totalPolicies: stats.totalPolicies ?? 0,
        pendingReview: stats.pendingReview ?? 0,
        highPolicies: stats.highPolicies ?? 0,
        totalHighFlags: stats.totalHighFlags ?? 0,
        missingDic: stats.missingDic ?? 0,
        unenriched: stats.unenriched ?? 0,
        otherStructures: stats.otherStructures ?? 0,
        renewals14Days: stats.renewals14Days ?? 0,
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
