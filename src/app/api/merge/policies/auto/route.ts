import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { DuplicateEngine } from '@/lib/duplicateEngine';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { executePolicyMerge } from '@/lib/policyMerge';

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const supabaseAdmin = getSupabaseAdmin();
    const performed_by = auth.user.id;

    try {
        let body: any = {};
        try {
            body = await req.json();
        } catch {
            // body is optional
        }

        const minConfidence = typeof body.min_confidence === 'number' ? body.min_confidence : 100;

        logger.info('AutoBind', `Starting auto-bind for suspected policy mergers with confidence >= ${minConfidence}%...`);

        // 1. Scan for policy duplicate groups
        const allDuplicates = await DuplicateEngine.findPolicyDuplicates();
        const eligibleGroups = allDuplicates.filter(g => g.confidence >= minConfidence);

        if (eligibleGroups.length === 0) {
            return NextResponse.json({
                success: true,
                message: `No suspected policy mergers found with match confidence >= ${minConfidence}%.`,
                merged_groups_count: 0,
                total_policies_merged: 0,
                groups: [],
            });
        }

        const mergedGroupSummaries: Array<{
            survivor_id: string;
            survivor_policy_number: string;
            merged_ids: string[];
            confidence: number;
            terms_migrated: number;
        }> = [];

        const deletedPolicyIds = new Set<string>();
        let totalPoliciesMerged = 0;

        // 2. Execute auto-merging sequentially
        for (const group of eligibleGroups) {
            const survivorId = group.survivor_id;
            const mergedIds = (group.merged_ids || []).filter(id => id && id !== survivorId && !deletedPolicyIds.has(id));

            if (!survivorId || mergedIds.length === 0 || deletedPolicyIds.has(survivorId)) {
                continue;
            }

            let groupTermsMigrated = 0;
            const successfullyMergedIds: string[] = [];

            for (const mergedId of mergedIds) {
                if (deletedPolicyIds.has(mergedId)) continue;

                try {
                    const result = await executePolicyMerge(supabaseAdmin, survivorId, mergedId, performed_by);
                    if (result.success) {
                        deletedPolicyIds.add(mergedId);
                        successfullyMergedIds.push(mergedId);
                        groupTermsMigrated += result.terms_migrated || 0;
                        totalPoliciesMerged++;
                    } else {
                        logger.warn('AutoBind', `Failed to merge policy ${mergedId} into ${survivorId}: ${result.error}`);
                    }
                } catch (err: any) {
                    logger.error('AutoBind', `Exception merging policy ${mergedId} into ${survivorId}:`, err);
                }
            }

            if (successfullyMergedIds.length > 0) {
                mergedGroupSummaries.push({
                    survivor_id: survivorId,
                    survivor_policy_number: group.details?.survivor?.policy_number || '',
                    merged_ids: successfullyMergedIds,
                    confidence: group.confidence,
                    terms_migrated: groupTermsMigrated,
                });
            }
        }

        logger.info('AutoBind', `Completed auto-bind: ${mergedGroupSummaries.length} groups, ${totalPoliciesMerged} policies merged.`);

        return NextResponse.json({
            success: true,
            message: `Successfully bound ${mergedGroupSummaries.length} policy groups (${totalPoliciesMerged} sub-term records linked to root policies).`,
            merged_groups_count: mergedGroupSummaries.length,
            total_policies_merged: totalPoliciesMerged,
            groups: mergedGroupSummaries,
        });

    } catch (error: any) {
        logger.error('AutoBind', 'Error during auto-bind policies:', error);
        return NextResponse.json({ error: error.message || 'Server error during policy auto-bind' }, { status: 500 });
    }
}
