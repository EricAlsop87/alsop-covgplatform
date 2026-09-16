import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { DuplicateEngine } from '@/lib/duplicateEngine';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

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

        const minConfidence = typeof body.min_confidence === 'number' ? body.min_confidence : 85;

        logger.info('AutoMerge', `Starting auto-merge for duplicate clients with confidence >= ${minConfidence}%...`);

        // 1. Scan for all duplicate client clusters
        const allDuplicates = await DuplicateEngine.findClientDuplicates();
        const eligibleGroups = allDuplicates.filter(g => g.confidence >= minConfidence);

        if (eligibleGroups.length === 0) {
            return NextResponse.json({
                success: true,
                message: `No duplicate client clusters found with match confidence >= ${minConfidence}%.`,
                merged_count: 0,
                groups: [],
            });
        }

        const mergedGroupSummaries: Array<{
            survivor_id: string;
            survivor_name: string;
            merged_ids: string[];
            confidence: number;
            policies_migrated: number;
            docs_migrated: number;
        }> = [];

        const deletedClientIds = new Set<string>();

        // 2. Execute auto-merging sequentially
        for (const group of eligibleGroups) {
            const survivorId = group.survivor_id;
            const mergedIds = (group.merged_ids || []).filter(id => id && id !== survivorId && !deletedClientIds.has(id));

            if (!survivorId || mergedIds.length === 0 || deletedClientIds.has(survivorId)) {
                continue;
            }

            // Fetch fresh survivor details
            const { data: survivor, error: surErr } = await supabaseAdmin
                .from('clients')
                .select('*')
                .eq('id', survivorId)
                .maybeSingle();

            if (surErr || !survivor) {
                logger.warn('AutoMerge', `Survivor ${survivorId} not found, skipping group.`);
                continue;
            }

            for (const mergedId of mergedIds) {
                if (deletedClientIds.has(mergedId)) continue;

                const { data: duplicate, error: dupErr } = await supabaseAdmin
                    .from('clients')
                    .select('*')
                    .eq('id', mergedId)
                    .maybeSingle();

                if (dupErr || !duplicate) {
                    continue;
                }

                // Check policy and doc counts for logging
                const { data: policiesToMove } = await supabaseAdmin
                    .from('policies')
                    .select('id')
                    .eq('client_id', mergedId);
                const policyCount = policiesToMove?.length || 0;

                const { data: docsToMove } = await supabaseAdmin
                    .from('platform_documents')
                    .select('id')
                    .eq('client_id', mergedId);
                const docCount = docsToMove?.length || 0;

                // Log entry
                const { data: mergeLogEntry } = await supabaseAdmin
                    .from('merge_logs')
                    .insert({
                        entity_type: 'client',
                        survivor_id: survivorId,
                        merged_id: mergedId,
                        performed_by: performed_by || null,
                        merge_details: {
                            status: 'in_progress',
                            auto_merge: true,
                            confidence: group.confidence,
                            reason: group.reason,
                            survivor_state: survivor,
                            duplicate_state: duplicate,
                            pre_merge_policy_count: policyCount,
                        }
                    })
                    .select('id')
                    .single();
                const mergeLogId = mergeLogEntry?.id;

                // Remap relational data to survivor
                await supabaseAdmin
                    .from('policies')
                    .update({ client_id: survivorId })
                    .eq('client_id', mergedId);

                await supabaseAdmin
                    .from('dec_pages')
                    .update({ client_id: survivorId })
                    .eq('client_id', mergedId);

                await supabaseAdmin
                    .from('platform_documents')
                    .update({ client_id: survivorId })
                    .eq('client_id', mergedId);

                await supabaseAdmin
                    .from('policy_flags')
                    .update({ client_id: survivorId })
                    .eq('client_id', mergedId);

                await supabaseAdmin
                    .from('property_enrichments')
                    .update({ client_id: survivorId })
                    .eq('client_id', mergedId);

                await supabaseAdmin
                    .from('activity_events')
                    .update({ client_id: survivorId })
                    .eq('client_id', mergedId);

                await supabaseAdmin
                    .from('notes')
                    .update({ client_id: survivorId })
                    .eq('client_id', mergedId);

                // Consolidate missing contact fields on survivor
                const contactUpdates: Record<string, string> = {};
                if (!survivor.email && duplicate.email) contactUpdates.email = duplicate.email;
                if (!survivor.phone && duplicate.phone) contactUpdates.phone = duplicate.phone;
                if (!survivor.mailing_address_raw && duplicate.mailing_address_raw) {
                    contactUpdates.mailing_address_raw = duplicate.mailing_address_raw;
                    if (duplicate.mailing_address_norm) contactUpdates.mailing_address_norm = duplicate.mailing_address_norm;
                }

                if (Object.keys(contactUpdates).length > 0) {
                    await supabaseAdmin
                        .from('clients')
                        .update(contactUpdates)
                        .eq('id', survivorId);
                }

                // Delete the merged duplicate client record
                const { error: delError } = await supabaseAdmin
                    .from('clients')
                    .delete()
                    .eq('id', mergedId);

                if (!delError) {
                    deletedClientIds.add(mergedId);

                    if (mergeLogId) {
                        await supabaseAdmin
                            .from('merge_logs')
                            .update({
                                merge_details: {
                                    status: 'completed',
                                    auto_merge: true,
                                    confidence: group.confidence,
                                    survivor_state: survivor,
                                    duplicate_state: duplicate,
                                    contact_updates: contactUpdates,
                                }
                            })
                            .eq('id', mergeLogId);
                    }

                    // Activity Event for Dashboard feed
                    const survivorName = survivor.named_insured || 'Unknown';
                    const dupName = duplicate.named_insured || 'Unknown';
                    await supabaseAdmin.from('activity_events').insert({
                        event_type: 'merge.client',
                        title: `Auto-merged duplicate client: ${survivorName}`,
                        detail: `Auto-consolidated "${dupName}" into primary profile "${survivorName}" (${group.confidence}% match confidence).`,
                        client_id: survivorId,
                        meta: {
                            auto_merge: true,
                            survivor_id: survivorId,
                            merged_id: mergedId,
                            confidence: group.confidence,
                            policies_migrated: policyCount,
                            docs_migrated: docCount,
                        },
                    });
                }
            }

            mergedGroupSummaries.push({
                survivor_id: survivorId,
                survivor_name: survivor.named_insured || 'Unknown',
                merged_ids: mergedIds,
                confidence: group.confidence,
                policies_migrated: (group.details.duplicates || []).reduce((acc: number, d: any) => acc + (d.policies || []).length, 0),
                docs_migrated: (group.details.duplicates || []).reduce((acc: number, d: any) => acc + (d.dec_pages || []).length, 0),
            });
        }

        logger.info('AutoMerge', `Auto-merged ${mergedGroupSummaries.length} client groups (${deletedClientIds.size} duplicate profiles removed).`);

        return NextResponse.json({
            success: true,
            message: `Successfully auto-merged ${mergedGroupSummaries.length} duplicate client group(s) (${deletedClientIds.size} duplicate profile(s) consolidated).`,
            merged_groups_count: mergedGroupSummaries.length,
            deleted_clients_count: deletedClientIds.size,
            groups: mergedGroupSummaries,
        });

    } catch (err: any) {
        logger.error('AutoMerge', 'Failed to execute auto-merge:', { error: err instanceof Error ? err.message : String(err) });
        return NextResponse.json({ error: err?.message || 'Internal server error during auto-merge' }, { status: 500 });
    }
}
