import useSWR from 'swr';
import { fetchDashboardPolicies, DashboardPolicy } from '@/lib/api';

const CACHE_KEY = 'dashboard-policies';

export function usePolicies() {
    const { data, error, isLoading, isValidating, mutate } = useSWR<DashboardPolicy[]>(
        CACHE_KEY,
        () => fetchDashboardPolicies(),
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,       // Don't re-fetch if data is < 30s old
            revalidateIfStale: true,        // Background refresh when stale
            errorRetryCount: 2,
            keepPreviousData: true,         // Show old data while revalidating
        }
    );

    return {
        policies: data ?? [],
        loading: isLoading,
        refreshing: isValidating && !isLoading,
        error,
        refresh: () => mutate(),           // Manual refresh
        invalidate: () => mutate(undefined, { revalidate: true }), // Force re-fetch
    };
}

// Export the cache key so other components can invalidate this cache
export { CACHE_KEY as POLICIES_CACHE_KEY };
