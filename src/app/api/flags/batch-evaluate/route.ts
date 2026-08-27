import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';

/**
 * POST /api/flags/batch-evaluate
 *
 * Re-evaluates flags for all policies linked to a specific CSV import batch.
 * 
 * Strategy:
 *   1. Find all policy IDs linked to the batch via policy_terms.import_batch_id
 *   2. Delete ONLY flags with source='csv_import' for those policies (preserves enrichment & manual flags)
 *   3. Run the full flag evaluation engine on each policy via internal POST to /api/flags/evaluate
 *   4. Return a summary of changes
 *
 * Body: { batch_id: string }
 */

// Allow up to 5 minutes for large batches
export const maxDuration = 300;

const CHUNK_SIZE = 200;  // Policies to process per batch
const IN_CHUNK = 200;    // Max items for .in() queries

export async function POST(request: NextRequest) {
    try {
        const supabaseAdmin = getSupabaseAdmin();

        // 1. Auth
        const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
        if (isAuthError(auth)) return auth;

        // 2. Get batch_id
        const body = await request.json();
        const batchId = body.batch_id;
        if (!batchId) {
            return NextResponse.json({ success: false, error: 'Missing batch_id' }, { status: 400 });
        }

        // 3. Find all policy IDs linked to this batch via policy_terms.import_batch_id
        const policyIds = new Set<string>();
        let page = 0;
        let hasMore = true;
        const PAGE_SIZE = 1000;

        while (hasMore) {
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            const { data: terms, error: termErr } = await supabaseAdmin
                .from('policy_terms')
                .select('policy_id')
                .eq('import_batch_id', batchId)
                .range(from, to);

            if (termErr) {
                logger.error('BatchEval', 'Failed to fetch policy terms', { error: termErr.message });
                return NextResponse.json({ success: false, error: 'Failed to load batch policies' }, { status: 500 });
            }

            if (!terms || terms.length === 0) {
                hasMore = false;
            } else {
                for (const t of terms) {
                    if (t.policy_id) policyIds.add(t.policy_id);
                }
                hasMore = terms.length === PAGE_SIZE;
                page++;
            }
        }

        if (policyIds.size === 0) {
            return NextResponse.json({
                success: false,
                error: 'No policies found for this batch. The batch_id may be incorrect or the import may not have completed.',
            }, { status: 404 });
        }

        const allPolicyIds = [...policyIds];
        logger.info('BatchEval', `Found ${allPolicyIds.length} policies for batch ${batchId}`);

        // 4. Delete ONLY csv_import-sourced flags for these policies
        //    This surgically removes the stale 3-rule flags without touching:
        //    - Enrichment flags (source='system')
        //    - Manually created flags
        //    - Dec page ingestion flags
        let deletedFlagCount = 0;

        for (let i = 0; i < allPolicyIds.length; i += IN_CHUNK) {
            const chunk = allPolicyIds.slice(i, i + IN_CHUNK);
            const { data: deleted, error: delErr } = await supabaseAdmin
                .from('policy_flags')
                .delete()
                .in('policy_id', chunk)
                .eq('source', 'csv_import')
                .select('id');

            if (delErr) {
                logger.warn('BatchEval', 'Failed to delete csv_import flags chunk', { error: delErr.message, chunk: i });
            } else if (deleted) {
                deletedFlagCount += deleted.length;
            }
        }

        logger.info('BatchEval', `Deleted ${deletedFlagCount} stale csv_import flags`);

        // 5. Re-evaluate each policy through the full flag engine
        //    We call the evaluate endpoint internally for each policy
        let evaluated = 0;
        let flagsCreated = 0;
        let flagsRefreshed = 0;
        let flagsResolved = 0;
        const evalErrors: string[] = [];

        // Build the internal URL for the evaluate endpoint
        const baseUrl = request.nextUrl.origin;

        for (let i = 0; i < allPolicyIds.length; i += CHUNK_SIZE) {
            const chunk = allPolicyIds.slice(i, i + CHUNK_SIZE);

            // Process each policy in the chunk
            const promises = chunk.map(async (policyId) => {
                try {
                    const res = await fetch(`${baseUrl}/api/flags/evaluate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ policy_id: policyId }),
                    });

                    if (!res.ok) {
                        const errText = await res.text();
                        evalErrors.push(`Policy ${policyId}: ${errText.slice(0, 100)}`);
                        return;
                    }

                    const result = await res.json();
                    if (result.success && result.summary) {
                        flagsCreated += result.summary.created || 0;
                        flagsRefreshed += result.summary.refreshed || 0;
                        flagsResolved += result.summary.resolved || 0;
                    }
                    evaluated++;
                } catch (err) {
                    evalErrors.push(`Policy ${policyId}: ${err instanceof Error ? err.message : String(err)}`);
                }
            });

            // Process chunk in parallel (up to CHUNK_SIZE concurrent)
            await Promise.all(promises);

            logger.info('BatchEval', `Progress: ${Math.min(i + CHUNK_SIZE, allPolicyIds.length)}/${allPolicyIds.length} policies evaluated`);
        }

        logger.info('BatchEval', 'Batch evaluation complete', {
            batchId,
            totalPolicies: allPolicyIds.length,
            evaluated,
            deletedFlagCount,
            flagsCreated,
            flagsRefreshed,
            flagsResolved,
            errorCount: evalErrors.length,
        });

        return NextResponse.json({
            success: true,
            total_policies: allPolicyIds.length,
            evaluated,
            stale_flags_deleted: deletedFlagCount,
            flags_created: flagsCreated,
            flags_refreshed: flagsRefreshed,
            flags_resolved: flagsResolved,
            errors: evalErrors.length > 0 ? evalErrors.slice(0, 20) : undefined, // Cap error list
            message: `Re-evaluated ${evaluated} of ${allPolicyIds.length} policies. Deleted ${deletedFlagCount} stale CSV flags. Created ${flagsCreated} new flags, refreshed ${flagsRefreshed}, resolved ${flagsResolved}.`,
        });

    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('BatchEval', 'Batch evaluation failed', { error: errMsg });
        return NextResponse.json({ success: false, error: `Batch evaluation failed: ${errMsg}` }, { status: 500 });
    }
}
