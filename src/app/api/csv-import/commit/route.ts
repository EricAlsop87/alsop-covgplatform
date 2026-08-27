import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';

// Allow up to 5 minutes for large batch imports
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 500;   // Rows to process per batch
const IN_CHUNK = 200;      // Max items for .in() queries to stay well under URL length limits
const PAGE_SIZE = 1000;    // Supabase default page limit

/** Update progress on the batch record */
async function updateProgress(
    supabase: ReturnType<typeof getSupabaseAdmin>,
    batchId: string,
    pct: number,
    message: string,
) {
    await supabase
        .from('policy_import_batches')
        .update({ progress_pct: Math.round(pct), progress_message: message, updated_at: new Date().toISOString() })
        .eq('id', batchId);
}

// ---------------------------------------------------------------------------
// POST /api/csv-import/commit
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    try {
        const supabaseAdmin = getSupabaseAdmin();

        // 1. Auth
        const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service'] });
        if (isAuthError(auth)) return auth;
        const user = auth.user;

        // 2. Get batch ID
        const body = await request.json();
        const batchId = body.batchId;
        if (!batchId) {
            return NextResponse.json({ success: false, error: 'Missing batchId' }, { status: 400 });
        }

        // 3. Load batch
        const { data: batch, error: batchErr } = await supabaseAdmin
            .from('policy_import_batches')
            .select('*')
            .eq('id', batchId)
            .single();

        if (batchErr || !batch) {
            return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
        }

        if (batch.status === 'completed') {
            return NextResponse.json({ success: false, error: 'Batch already imported' }, { status: 400 });
        }

        // Mark batch as in_progress for resumability
        await supabaseAdmin
            .from('policy_import_batches')
            .update({ status: 'in_progress', progress_pct: 0, progress_message: 'Loading rows…' })
            .eq('id', batchId);

        // 4. Load ALL valid rows (paginated to avoid Supabase 1000-row limit)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let allRows: any[] = [];
        let page = 0;
        let hasMore = true;

        while (hasMore) {
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            const { data: pageRows, error: rowErr } = await supabaseAdmin
                .from('policy_import_rows')
                .select('*')
                .eq('batch_id', batchId)
                .eq('status', 'valid')    // Resumability: only load non-imported rows
                .order('row_number', { ascending: true })
                .range(from, to);

            if (rowErr) {
                logger.error('CSVImport', 'Failed to load rows', { error: rowErr.message, page });
                return NextResponse.json({ success: false, error: 'Failed to load rows' }, { status: 500 });
            }

            if (!pageRows || pageRows.length === 0) {
                hasMore = false;
            } else {
                allRows = allRows.concat(pageRows);
                hasMore = pageRows.length === PAGE_SIZE;
                page++;
            }
        }

        if (allRows.length === 0) {
            // Check if this is a resume where everything is already imported
            const { count } = await supabaseAdmin
                .from('policy_import_rows')
                .select('id', { count: 'exact', head: true })
                .eq('batch_id', batchId)
                .eq('status', 'imported');

            if (count && count > 0) {
                // All rows already imported — just mark as completed
                await supabaseAdmin
                    .from('policy_import_batches')
                    .update({ status: 'completed', imported_count: count, progress_pct: 100, progress_message: 'Complete' })
                    .eq('id', batchId);

                return NextResponse.json({
                    success: true, imported: count, skipped: 0, errors: [],
                    flags_created: 0, new_clients_created: 0, terms_created: 0, terms_updated: 0,
                });
            }

            return NextResponse.json({ success: false, error: 'No valid rows to import' }, { status: 400 });
        }

        logger.info('CSVImport', 'Loaded rows for commit', { batchId, totalRows: allRows.length });
        await updateProgress(supabaseAdmin, batchId, 5, `Loaded ${allRows.length} rows`);

        // 5. Cache existing policies (chunked .in() to avoid URL length issues)
        const policyNumbers = [...new Set(allRows.map((r: { policy_number: string }) => r.policy_number))];
        const policyMap = new Map<string, { id: string; client_id: string }>();

        for (let c = 0; c < policyNumbers.length; c += IN_CHUNK) {
            const chunk = policyNumbers.slice(c, c + IN_CHUNK);
            const { data: existingPolicies } = await supabaseAdmin
                .from('policies')
                .select('id, policy_number, client_id')
                .in('policy_number', chunk);

            if (existingPolicies) {
                for (const p of existingPolicies) {
                    policyMap.set(p.policy_number, { id: p.id, client_id: p.client_id });
                }
            }
        }

        await updateProgress(supabaseAdmin, batchId, 10, 'Checked existing policies');

        // 6. Process in chunks
        let imported = 0;
        let skipped = 0;
        let flagsCreated = 0;
        let newClientsCreated = 0;
        let termsCreated = 0;
        let termsUpdated = 0;
        const errors: string[] = [];
        const now = new Date().toISOString();

        // Collect flag data for batch insertion at the end
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pendingFlags: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pendingActivityEvents: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pendingNotes: any[] = [];

        const totalRows = allRows.length;

        for (let chunkStart = 0; chunkStart < totalRows; chunkStart += CHUNK_SIZE) {
            const chunk = allRows.slice(chunkStart, chunkStart + CHUNK_SIZE);
            const chunkPct = 10 + Math.round(((chunkStart + chunk.length) / totalRows) * 70);
            await updateProgress(supabaseAdmin, batchId, chunkPct,
                `Processing rows ${chunkStart + 1}–${chunkStart + chunk.length} of ${totalRows}`);

            // --- Separate new vs existing policies ---
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newPolicyRows: any[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existingPolicyRows: any[] = [];

            for (const row of chunk) {
                if (policyMap.has(row.policy_number)) {
                    existingPolicyRows.push(row);
                } else {
                    newPolicyRows.push(row);
                }
            }

            // --- Batch-create new clients + policies ---
            // Group new policy rows by insured_name to avoid duplicate client creation
            const newClientsByName = new Map<string, typeof newPolicyRows>();
            for (const row of newPolicyRows) {
                const key = row.insured_name?.toLowerCase() || '';
                if (!newClientsByName.has(key)) {
                    newClientsByName.set(key, []);
                }
                newClientsByName.get(key)!.push(row);
            }

            // Batch insert clients
            if (newClientsByName.size > 0) {
                const clientInserts = [...newClientsByName.entries()].map(([, rows]) => ({
                    created_by_account_id: user.id,
                    named_insured: rows[0].insured_name,
                }));

                let newClients = null;
                const { data: batchNewClients, error: clientErr } = await supabaseAdmin
                    .from('clients')
                    .insert(clientInserts)
                    .select('id, named_insured');

                if (clientErr || !batchNewClients) {
                    logger.warn('CSVImport', `Chunk ${chunkStart}: Bulk client insert failed, falling back to sequential`, { error: clientErr?.message });
                    newClients = [];
                    for (const ins of clientInserts) {
                        const { data: c, error: cErr } = await supabaseAdmin.from('clients').insert(ins).select('id, named_insured').single();
                        if (cErr || !c) {
                            errors.push(`Failed to create client "${ins.named_insured}": ${cErr?.message}`);
                        } else {
                            newClients.push(c);
                        }
                    }
                } else {
                    newClients = batchNewClients;
                }

                if (newClients.length > 0) {
                    newClientsCreated += newClients.length;

                    // Map client name → id
                    const clientNameToId = new Map<string, string>();
                    for (const c of newClients) {
                        clientNameToId.set(c.named_insured?.toLowerCase() || '', c.id);
                    }

                    // Group unique policy numbers for new policies
                    const seenPolicyNumbers = new Set<string>();
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const policyInserts: Record<string, any>[] = [];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const policyRowMap: { row: any; clientId: string }[] = [];

                    for (const row of newPolicyRows) {
                        const clientId = clientNameToId.get(row.insured_name?.toLowerCase() || '');
                        if (!clientId) {
                            errors.push(`Row ${row.row_number}: Could not find created client for "${row.insured_name}"`);
                            skipped++;
                            continue;
                        }

                        if (!seenPolicyNumbers.has(row.policy_number)) {
                            seenPolicyNumbers.add(row.policy_number);
                            policyInserts.push({
                                created_by_account_id: user.id,
                                client_id: clientId,
                                policy_number: row.policy_number,
                            });
                        }
                        policyRowMap.push({ row, clientId });
                    }

                    // Batch insert policies
                    if (policyInserts.length > 0) {
                        let newPolicies = null;
                        const { data: batchPolicies, error: policyErr } = await supabaseAdmin
                            .from('policies')
                            .insert(policyInserts)
                            .select('id, policy_number, client_id');

                        if (policyErr || !batchPolicies) {
                            logger.warn('CSVImport', `Chunk ${chunkStart}: Bulk policy insert failed, falling back to sequential`, { error: policyErr?.message });
                            newPolicies = [];
                            for (const ins of policyInserts) {
                                const { data: p, error: pErr } = await supabaseAdmin.from('policies').insert(ins).select('id, policy_number, client_id').single();
                                if (pErr || !p) {
                                    errors.push(`Failed to create policy ${ins.policy_number}: ${pErr?.message}`);
                                } else {
                                    newPolicies.push(p);
                                }
                            }
                        } else {
                            newPolicies = batchPolicies;
                        }

                        if (newPolicies.length > 0) {
                            // Cache newly created policies
                            for (const p of newPolicies) {
                                policyMap.set(p.policy_number, { id: p.id, client_id: p.client_id });
                            }

                            // Move rows to existingPolicyRows ONLY if they actually got a policy created
                            for (const { row } of policyRowMap) {
                                if (policyMap.has(row.policy_number)) {
                                    existingPolicyRows.push(row);
                                } else {
                                    skipped++;
                                }
                            }
                        } else {
                            skipped += policyRowMap.length;
                        }
                    }
                }
            }

            // --- Batch upsert terms for all rows that now have policies ---
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const termInserts: Record<string, any>[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const termUpdatePairs: { termId: string; payload: Record<string, any> }[] = [];
            const importedRowIds: string[] = [];
            
            // Pre-load all existing terms for this chunk to avoid 500 sequential SELECT queries
            const chunkPolicyIds = [...new Set(existingPolicyRows.map(r => policyMap.get(r.policy_number)?.id).filter(Boolean))] as string[];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existingTermsMap = new Map<string, any>();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const policyTermsResolver = new Map<string, any[]>();
            
            for (let i = 0; i < chunkPolicyIds.length; i += IN_CHUNK) {
                const pChunk = chunkPolicyIds.slice(i, i + IN_CHUNK);
                const { data: chunkTerms } = await supabaseAdmin
                    .from('policy_terms')
                    .select('id, policy_id, effective_date, expiration_date, is_current')
                    .in('policy_id', pChunk);
                    
                if (chunkTerms) {
                    for (const t of chunkTerms) {
                        const matchKey = `${t.policy_id}|${t.effective_date || ''}|${t.expiration_date || ''}`;
                        existingTermsMap.set(matchKey, t);
                        if (!policyTermsResolver.has(t.policy_id)) policyTermsResolver.set(t.policy_id, []);
                        policyTermsResolver.get(t.policy_id)!.push({ ...t, is_db_term: true });
                    }
                }
            }

            for (const row of existingPolicyRows) {
                const existing = policyMap.get(row.policy_number);
                if (!existing) {
                    errors.push(`Row ${row.row_number}: Policy not found after creation`);
                    skipped++;
                    continue;
                }

                const policyId = existing.id;
                const clientId = existing.client_id;
                if (!policyTermsResolver.has(policyId)) policyTermsResolver.set(policyId, []);

                const matchKey = `${policyId}|${row.effective_date || ''}|${row.expiration_date || ''}`;
                const existingTerm = existingTermsMap.get(matchKey);

                const termPayload = {
                    policy_id: policyId,
                    effective_date: row.effective_date || null,
                    expiration_date: row.expiration_date || null,
                    annual_premium: row.annual_premium || null,
                    is_current: false, // Default to false, resolved mathematically below
                    carrier_status: row.carrier_status || null,
                    policy_activity: row.policy_activity || null,
                    payment_status: row.payment_status || null,
                    payment_plan: row.payment_plan || null,
                    cancellation_reason: row.cancellation_reason || null,
                    dic_exists: row.dic_exists || false,
                    sold_by: row.sold_by || null,
                    office: row.office || null,
                    import_batch_id: batchId,
                    updated_at: now,
                };

                if (existingTerm) {
                    termUpdatePairs.push({ termId: existingTerm.id, payload: termPayload });
                    termsUpdated++;
                    
                    // Replace the existing term inside our resolver map with this updated one
                    const terms = policyTermsResolver.get(policyId)!;
                    const idx = terms.findIndex(t => t.id === existingTerm.id);
                    if (idx !== -1) {
                        // Keep ID so we know it's a DB term, but map points to our payload
                        terms[idx] = { ...terms[idx], payloadRef: termPayload };
                    }
                } else {
                    const insertPayload = { ...termPayload, created_at: now };
                    termInserts.push(insertPayload);
                    termsCreated++;
                    
                    // Add the new insert to the resolver
                    policyTermsResolver.get(policyId)!.push({ payloadRef: insertPayload });
                }

                // Collect notes
                if (row.dic_notes) {
                    pendingNotes.push({
                        author_user_id: user.id,
                        client_id: clientId,
                        policy_id: policyId,
                        body: `[DIC] ${row.dic_notes}`,
                        meta: { tag: 'DIC', source: 'csv_import', batch_id: batchId },
                    });
                }

                const legacyParts: string[] = [];
                if (row.notes_text) legacyParts.push(`Notes: ${row.notes_text}`);
                if (row.reason) legacyParts.push(`Reason: ${row.reason}`);
                if (row.activity) legacyParts.push(`Activity: ${row.activity}`);

                if (legacyParts.length > 0) {
                    pendingNotes.push({
                        author_user_id: user.id,
                        client_id: clientId,
                        policy_id: policyId,
                        body: `[Legacy Import]\n${legacyParts.join('\n')}`,
                        meta: { tag: 'legacy', source: 'csv_import', batch_id: batchId },
                    });
                }

                // Collect activity event
                pendingActivityEvents.push({
                    actor_user_id: user.id,
                    event_type: 'import.row',
                    title: 'Policy imported from CSV',
                    detail: `Policy #${row.policy_number} — ${row.insured_name}`,
                    policy_id: policyId,
                    client_id: clientId,
                    meta: { batch_id: batchId, row_index: row.row_number },
                });

                // Collect flags
                collectFlags(row, policyId, clientId, batchId, now, pendingFlags);

                importedRowIds.push(row.id);
                imported++;
            }

            // --- Enforce is_current Rules ---
            const dbTermIdsToUpdateIsCurrent: { id: string, is_current: boolean }[] = [];

            for (const [, terms] of policyTermsResolver.entries()) {
                if (terms.length === 0) continue;
                
                // Sort to find the highest priority term
                terms.sort((a, b) => {
                    // Use payloadRef dates if it's an import/update, otherwise use DB dates
                    const aExp = a.payloadRef?.expiration_date ?? a.expiration_date;
                    const bExp = b.payloadRef?.expiration_date ?? b.expiration_date;
                    const aEff = a.payloadRef?.effective_date ?? a.effective_date;
                    const bEff = b.payloadRef?.effective_date ?? b.effective_date;

                    // 1. Expiration Date descending
                    if (aExp && bExp) {
                        const diff = new Date(bExp).getTime() - new Date(aExp).getTime();
                        if (diff !== 0) return diff;
                    } else if (aExp && !bExp) return -1;
                    else if (!aExp && bExp) return 1;

                    // 2. Effective Date descending
                    if (aEff && bEff) {
                        const diff = new Date(bEff).getTime() - new Date(aEff).getTime();
                        if (diff !== 0) return diff;
                    } else if (aEff && !bEff) return -1;
                    else if (!aEff && bEff) return 1;

                    // Fallback tie-breaker
                    return 0;
                });

                // The first element is the winner
                const winner = terms[0];
                if (winner.payloadRef) {
                    winner.payloadRef.is_current = true;
                } else if (winner.is_db_term && winner.is_current !== true) {
                    dbTermIdsToUpdateIsCurrent.push({ id: winner.id, is_current: true });
                }

                // The rest are losers
                for (let j = 1; j < terms.length; j++) {
                    const loser = terms[j];
                    if (loser.payloadRef) {
                        loser.payloadRef.is_current = false;
                    } else if (loser.is_db_term && loser.is_current !== false) {
                        dbTermIdsToUpdateIsCurrent.push({ id: loser.id, is_current: false });
                    }
                }
            }

            // Batch update any DB terms that weren't directly touched by CSV but need is_current flipped
            if (dbTermIdsToUpdateIsCurrent.length > 0) {
                const toTrue = dbTermIdsToUpdateIsCurrent.filter(x => x.is_current === true).map(x => x.id);
                const toFalse = dbTermIdsToUpdateIsCurrent.filter(x => x.is_current === false).map(x => x.id);
                
                if (toTrue.length > 0) {
                    for (let i = 0; i < toTrue.length; i += IN_CHUNK) {
                        await supabaseAdmin.from('policy_terms')
                            .update({ is_current: true })
                            .in('id', toTrue.slice(i, i + IN_CHUNK));
                    }
                }
                if (toFalse.length > 0) {
                    for (let i = 0; i < toFalse.length; i += IN_CHUNK) {
                        await supabaseAdmin.from('policy_terms')
                            .update({ is_current: false })
                            .in('id', toFalse.slice(i, i + IN_CHUNK));
                    }
                }
            }

            // Batch insert new terms
            if (termInserts.length > 0) {
                const { error: termErr } = await supabaseAdmin
                    .from('policy_terms')
                    .insert(termInserts);
                if (termErr) {
                    logger.warn('CSVImport', 'Batch term insert failed, trying sequential', { error: termErr.message });
                    for (const ins of termInserts) {
                        const { error: singleErr } = await supabaseAdmin.from('policy_terms').insert(ins);
                        if (singleErr) {
                            errors.push(`Failed to insert term for policy (ID: ${ins.policy_id}): ${singleErr.message}`);
                            termsCreated--; // Revert eagerly incremented counter
                        }
                    }
                }
            }

            // Batch update existing terms using bulk upsert
            if (termUpdatePairs.length > 0) {
                const updatePayloads = termUpdatePairs.map(({ termId, payload }) => ({ ...payload, id: termId }));
                
                // Chunk the upserts as well just to be safe
                for (let i = 0; i < updatePayloads.length; i += IN_CHUNK) {
                    const chunk = updatePayloads.slice(i, i + IN_CHUNK);
                    const { error: updErr } = await supabaseAdmin
                        .from('policy_terms')
                        .upsert(chunk);
                        
                    if (updErr) {
                        logger.warn('CSVImport', 'Batch term update failed, trying sequential', { error: updErr.message });
                        for (const payload of chunk) {
                            const { error: singleErr } = await supabaseAdmin.from('policy_terms').upsert(payload);
                            if (singleErr) {
                                errors.push(`Failed to update term (ID: ${payload.id}): ${singleErr.message}`);
                                termsUpdated--; // Revert eagerly incremented counter
                            }
                        }
                    }
                }
            }

            // Batch mark import rows as imported
            if (importedRowIds.length > 0) {
                for (let i = 0; i < importedRowIds.length; i += IN_CHUNK) {
                    const idChunk = importedRowIds.slice(i, i + IN_CHUNK);
                    await supabaseAdmin
                        .from('policy_import_rows')
                        .update({ status: 'imported' })
                        .in('id', idChunk);
                }
            }
        }

        // 7. Batch insert collected notes
        await updateProgress(supabaseAdmin, batchId, 82, 'Saving notes…');
        if (pendingNotes.length > 0) {
            for (let i = 0; i < pendingNotes.length; i += IN_CHUNK) {
                const chunk = pendingNotes.slice(i, i + IN_CHUNK);
                const { error: noteErr } = await supabaseAdmin.from('notes').insert(chunk);
                if (noteErr) {
                    logger.warn('CSVImport', 'Note batch insert failed, trying sequential', { error: noteErr.message, chunk: i });
                    for (const note of chunk) {
                        await supabaseAdmin.from('notes').insert(note);
                    }
                }
            }
        }

        // 8. Batch insert collected activity events
        await updateProgress(supabaseAdmin, batchId, 88, 'Recording activity…');
        if (pendingActivityEvents.length > 0) {
            for (let i = 0; i < pendingActivityEvents.length; i += IN_CHUNK) {
                const chunk = pendingActivityEvents.slice(i, i + IN_CHUNK);
                const { error: actErr } = await supabaseAdmin.from('activity_events').insert(chunk);
                if (actErr) {
                    logger.warn('CSVImport', 'Activity batch insert failed, trying sequential', { error: actErr.message, chunk: i });
                    for (const act of chunk) {
                        await supabaseAdmin.from('activity_events').insert(act);
                    }
                }
            }
        }

        // 9. Batch insert collected flags (deduplicated)
        await updateProgress(supabaseAdmin, batchId, 93, 'Evaluating flags…');
        if (pendingFlags.length > 0) {
            // Deduplicate by flag_key
            const uniqueFlags = new Map<string, typeof pendingFlags[0]>();
            for (const f of pendingFlags) {
                if (!uniqueFlags.has(f.flag_key)) {
                    uniqueFlags.set(f.flag_key, f);
                }
            }

            const flagsToInsert = [...uniqueFlags.values()];

            // Check which flags already exist in DB
            const flagKeys = flagsToInsert.map(f => f.flag_key);
            const existingFlagKeys = new Set<string>();

            for (let i = 0; i < flagKeys.length; i += IN_CHUNK) {
                const chunk = flagKeys.slice(i, i + IN_CHUNK);
                const { data: existingFlags } = await supabaseAdmin
                    .from('policy_flags')
                    .select('flag_key')
                    .in('flag_key', chunk)
                    .eq('status', 'open');

                if (existingFlags) {
                    for (const f of existingFlags) {
                        existingFlagKeys.add(f.flag_key);
                    }
                }
            }

            // Insert only new flags
            const newFlags = flagsToInsert.filter(f => !existingFlagKeys.has(f.flag_key));

            if (newFlags.length > 0) {
                for (let i = 0; i < newFlags.length; i += IN_CHUNK) {
                    const chunk = newFlags.slice(i, i + IN_CHUNK);
                    const { error: flagErr } = await supabaseAdmin.from('policy_flags').insert(chunk);
                    if (flagErr) {
                        logger.warn('CSVImport', 'Flag batch insert failed, trying sequential', { error: flagErr.message, chunk: i });
                        for (const flag of chunk) {
                            const { error: singleErr } = await supabaseAdmin.from('policy_flags').insert(flag);
                            if (!singleErr) {
                                flagsCreated++;
                            }
                        }
                    } else {
                        flagsCreated += chunk.length;
                    }
                }
            }
        }

        // 10. Mark batch completed
        await updateProgress(supabaseAdmin, batchId, 100, 'Complete');
        await supabaseAdmin
            .from('policy_import_batches')
            .update({
                status: 'completed',
                imported_count: imported,
                progress_pct: 100,
                progress_message: 'Complete',
                updated_at: now,
            })
            .eq('id', batchId);

        // 11. Batch-level activity event
        try {
            await supabaseAdmin.from('activity_events').insert({
                actor_user_id: user.id,
                event_type: 'import.batch_complete',
                title: 'CSV Import Completed',
                detail: `Imported ${imported} policies (${newClientsCreated} new clients, ${flagsCreated} flags created, ${skipped} skipped)`,
                meta: {
                    batch_id: batchId,
                    imported,
                    skipped,
                    flags_created: flagsCreated,
                    new_clients: newClientsCreated,
                    terms_created: termsCreated,
                    terms_updated: termsUpdated,
                },
            });
        } catch {
            logger.warn('CSVImport', 'Batch activity event failed (non-fatal)');
        }

        logger.info('CSVImport', 'Commit complete', { batchId, imported, skipped, flagsCreated, errorCount: errors.length });

        return NextResponse.json({
            success: true,
            imported,
            skipped,
            errors,
            flags_created: flagsCreated,
            new_clients_created: newClientsCreated,
            terms_created: termsCreated,
            terms_updated: termsUpdated,
        });

    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('CSVImport', 'Commit error', { error: errMsg, stack: err instanceof Error ? err.stack : undefined });
        return NextResponse.json({ success: false, error: `Import failed: ${errMsg}` }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// Flag collection helper (no DB calls — just builds the array)
// ---------------------------------------------------------------------------

function collectFlags(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    row: any,
    policyId: string,
    clientId: string,
    batchId: string,
    now: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pendingFlags: any[],
) {
    // RENEWAL_UPCOMING — expiration within 21 days
    if (row.expiration_date) {
        const expDate = new Date(row.expiration_date);
        const daysUntil = Math.floor((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 21) {
            pendingFlags.push({
                flag_key: `policy:${policyId}:RENEWAL_UPCOMING:`,
                code: 'RENEWAL_UPCOMING',
                severity: 'high',
                title: 'Renewal Upcoming',
                message: `Policy expires in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}.`,
                status: 'open',
                source: 'csv_import',
                category: 'renewal',
                policy_id: policyId,
                client_id: clientId,
                rule_version: '1.0.0',
                first_seen_at: now,
                last_seen_at: now,
                times_seen: 1,
                created_at: now,
                updated_at: now,
            });
        }
    }

    // ECM_PREMIUM_MISSING_OR_ZERO — no premium or $0
    if (!row.annual_premium || Number(row.annual_premium) <= 0) {
        pendingFlags.push({
            flag_key: `policy:${policyId}:ECM_PREMIUM_MISSING_OR_ZERO:`,
            code: 'ECM_PREMIUM_MISSING_OR_ZERO',
            severity: 'high',
            title: 'Premium Missing or Zero',
            message: 'Annual premium is missing or $0.',
            status: 'open',
            source: 'csv_import',
            category: 'data_quality',
            policy_id: policyId,
            client_id: clientId,
            rule_version: '1.0.0',
            first_seen_at: now,
            last_seen_at: now,
            times_seen: 1,
            created_at: now,
            updated_at: now,
        });
    }

    // NO_DIC — DIC not on file
    if (row.dic_exists === false) {
        pendingFlags.push({
            flag_key: `policy:${policyId}:NO_DIC:`,
            code: 'NO_DIC',
            severity: 'high',
            title: 'DIC Not on File',
            message: 'DIC coverage is not on file for this policy.',
            status: 'open',
            source: 'csv_import',
            category: 'dic',
            policy_id: policyId,
            client_id: clientId,
            rule_version: '1.0.0',
            first_seen_at: now,
            last_seen_at: now,
            times_seen: 1,
            created_at: now,
            updated_at: now,
        });
    }
}
