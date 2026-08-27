import useSWR from 'swr';
import { fetchFlaggedPoliciesGrouped, FlaggedPolicyGroup } from '@/lib/api';

const CACHE_KEY = 'flagged-policies';

export function useFlags() {
    const { data, error, isLoading, isValidating, mutate } = useSWR<FlaggedPolicyGroup[]>(
        CACHE_KEY,
        () => fetchFlaggedPoliciesGrouped(),
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,
            revalidateIfStale: true,
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );

    return {
        groups: data ?? [],
        loading: isLoading,
        refreshing: isValidating && !isLoading,
        error,
        refresh: () => mutate(),
        invalidate: () => mutate(undefined, { revalidate: true }),
    };
}

export { CACHE_KEY as FLAGS_CACHE_KEY };
