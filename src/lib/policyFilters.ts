/**
 * Shared policy filter constants.
 * Every query that touches policies or flags should use these
 * to ensure consistent numbers across Dashboard, Flags, and DataTable.
 */

/** Statuses that are NOT actionable by agents */
export const INACTIVE_STATUSES = ['expired', 'cancelled', 'non_renewed'] as const;

/** Demo / seed client to always exclude from real data views */
export const DEMO_CLIENT_ID = '00000000-0000-4000-a000-000000000001';

/**
 * Flag codes that are scoped to the **client** (not the policy).
 * These should stay open even when all of a client's policies become inactive,
 * because the client may still obtain a new policy in the future.
 */
export const CLIENT_LEVEL_FLAG_CODES = [
    'MISSING_CONTACT_INFO',
    'MISSING_EMAIL',
    'MISSING_PHONE',
] as const;

/** Supabase filter fragment: `status NOT IN (expired, cancelled, non_renewed)` */
export const ACTIVE_STATUS_FILTER = `(${INACTIVE_STATUSES.join(',')})` as const;
