import { supabase } from './supabaseClient';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

export const NOTE_TAGS = ['Underwriting', 'Billing', 'General', 'Renewal', 'Claim'];

export interface NoteRow {
    id: string;
    created_at: string;
    updated_at: string;
    author_user_id: string | null;
    author_name?: string | null;
    client_id: string;
    policy_id: string | null;
    body: string;
    is_pinned: boolean;
    is_archived: boolean;
    meta: Record<string, unknown>;
}

export interface ActivityEventRow {
    id: string;
    created_at: string;
    actor_user_id: string | null;
    event_type: string;
    title: string | null;
    detail: string | null;
    client_id: string | null;
    policy_id: string | null;
    submission_id: string | null;
    dec_page_id: string | null;
    meta: Record<string, unknown>;
    actor_name?: string | null;
}

// ---------------------------------------------------------------------------
// Auth helper — get current user ID
// ---------------------------------------------------------------------------

export async function getCurrentUserId(): Promise<string | null> {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
}

export async function getCurrentUserRole(): Promise<string | null> {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    const { data } = await supabase
        .from('accounts')
        .select('role')
        .eq('id', userId)
        .single();
    return data?.role ?? null;
}

// ---------------------------------------------------------------------------
// Notes CRUD
// ---------------------------------------------------------------------------

async function attachAuthorNamesToNotes(notes: NoteRow[]) {
    const authorIds = [...new Set(notes.map(n => n.author_user_id).filter(Boolean))] as string[];
    if (authorIds.length > 0) {
        const { data: accounts } = await supabase
            .from('accounts')
            .select('id, first_name, last_name')
            .in('id', authorIds);

        if (accounts) {
            const nameMap = new Map(accounts.map(a => [a.id, `${a.first_name || ''} ${a.last_name || ''}`.trim()]));
            for (const n of notes) {
                if (n.author_user_id) {
                    n.author_name = nameMap.get(n.author_user_id) || null;
                }
            }
        }
    }
}

export async function fetchNotes(opts: {
    clientId?: string;
    policyId?: string;
    includeArchived?: boolean;
    limit?: number;
    offset?: number;
}): Promise<NoteRow[]> {
    try {
        let query = supabase
            .from('notes')
            .select('*')
            .order('is_pinned', { ascending: false })
            .order('updated_at', { ascending: false });

        if (opts.clientId) query = query.eq('client_id', opts.clientId);
        if (opts.policyId) query = query.eq('policy_id', opts.policyId);
        if (!opts.includeArchived) query = query.eq('is_archived', false);

        if (opts.limit) query = query.limit(opts.limit);
        if (opts.offset) query = query.range(opts.offset, opts.offset + (opts.limit || 20) - 1);

        const { data, error } = await query;
        if (error) {
            logger.error('Notes', 'Error fetching notes', { message: error.message });
            return [];
        }

        const notes = (data || []) as NoteRow[];
        await attachAuthorNamesToNotes(notes);
        return notes;
    } catch (err) {
        logger.error('Notes', 'Unexpected error', { error: String(err) });
        return [];
    }
}

/**
 * Fetch notes for a client that have NO policy_id set (general client notes).
 */
export async function fetchClientOnlyNotes(clientId: string, includeArchived = false, limit?: number, offset?: number): Promise<NoteRow[]> {
    try {
        let query = supabase
            .from('notes')
            .select('*')
            .eq('client_id', clientId)
            .is('policy_id', null)
            .order('is_pinned', { ascending: false })
            .order('updated_at', { ascending: false });

        if (!includeArchived) {
            query = query.eq('is_archived', false);
        }

        if (limit) query = query.limit(limit);
        if (offset) query = query.range(offset, offset + (limit || 20) - 1);

        const { data, error } = await query;
        if (error) {
            logger.error('Notes', 'Error fetching client-only notes', { message: error.message });
            return [];
        }

        const notes = (data || []) as NoteRow[];
        await attachAuthorNamesToNotes(notes);
        return notes;
    } catch (err) {
        logger.error('Notes', 'Unexpected error', { error: String(err) });
        return [];
    }
}

export async function createNote(fields: {
    client_id: string;
    policy_id?: string | null;
    body: string;
    tags?: string[];
}): Promise<NoteRow | null> {
    const userId = await getCurrentUserId();
    const metaPayload: Record<string, unknown> = {};
    if (fields.tags) {
        metaPayload.tags = fields.tags;
    }

    const { data, error } = await supabase
        .from('notes')
        .insert({
            client_id: fields.client_id,
            policy_id: fields.policy_id || null,
            body: fields.body,
            author_user_id: userId,
            meta: metaPayload,
        })
        .select()
        .single();

    if (error) {
        logger.error('Notes', 'Error creating note', { message: error.message });
        throw new Error(error.message);
    }

    // Fire activity event (non-blocking)
    insertActivityEvent({
        event_type: 'note.added',
        title: 'Note added',
        client_id: fields.client_id,
        policy_id: fields.policy_id || null,
        meta: { note_id: data.id },
    }).catch(() => { });

    return data as NoteRow;
}

export async function updateNote(
    noteId: string,
    updates: { body?: string; is_pinned?: boolean; is_archived?: boolean; tags?: string[] }
): Promise<boolean> {
    const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
    delete payload.tags; // handled separately below

    if (updates.tags) {
        // Fetch existing meta to avoid overwriting other keys
        const { data: existing } = await supabase.from('notes').select('meta').eq('id', noteId).single();
        const existingMeta = (existing?.meta as Record<string, unknown>) || {};
        payload.meta = { ...existingMeta, tags: updates.tags };
    }
    const { error, data } = await supabase
        .from('notes')
        .update(payload)
        .eq('id', noteId)
        .select('client_id, policy_id')
        .single();

    if (error) {
        logger.error('Notes', 'Error updating note', { message: error.message });
        throw new Error(error.message);
    }

    // Activity events for specific actions
    const noteData = data as { client_id: string; policy_id: string | null };
    if (updates.body !== undefined) {
        insertActivityEvent({
            event_type: 'note.edited',
            title: 'Note edited',
            client_id: noteData.client_id,
            policy_id: noteData.policy_id,
            meta: { note_id: noteId },
        }).catch(() => { });
    }
    if (updates.is_archived !== undefined) {
        insertActivityEvent({
            event_type: updates.is_archived ? 'note.archived' : 'note.unarchived',
            title: updates.is_archived ? 'Note archived' : 'Note restored',
            client_id: noteData.client_id,
            policy_id: noteData.policy_id,
            meta: { note_id: noteId },
        }).catch(() => { });
    }
    if (updates.is_pinned !== undefined) {
        insertActivityEvent({
            event_type: updates.is_pinned ? 'note.pinned' : 'note.unpinned',
            title: updates.is_pinned ? 'Note pinned' : 'Note unpinned',
            client_id: noteData.client_id,
            policy_id: noteData.policy_id,
            meta: { note_id: noteId },
        }).catch(() => { });
    }

    return true;
}

// ---------------------------------------------------------------------------
// Activity Events
// ---------------------------------------------------------------------------

export async function insertActivityEvent(fields: {
    event_type: string;
    title?: string | null;
    detail?: string | null;
    client_id?: string | null;
    policy_id?: string | null;
    submission_id?: string | null;
    dec_page_id?: string | null;
    meta?: Record<string, unknown>;
}): Promise<void> {
    // Guard: the activity_events table has a CHECK constraint requiring at least
    // one entity ID. Skip silently if none is provided to avoid constraint errors.
    const hasEntity = fields.client_id || fields.policy_id || fields.submission_id || fields.dec_page_id;
    if (!hasEntity) {
        logger.warn('Activity', 'Skipping activity event — no entity ID provided', {
            event_type: fields.event_type,
        });
        return;
    }

    const userId = await getCurrentUserId();
    const { error } = await supabase
        .from('activity_events')
        .insert({
            actor_user_id: userId,
            event_type: fields.event_type,
            title: fields.title || null,
            detail: fields.detail || null,
            client_id: fields.client_id || null,
            policy_id: fields.policy_id || null,
            submission_id: fields.submission_id || null,
            dec_page_id: fields.dec_page_id || null,
            meta: fields.meta || {},
        });

    if (error) {
        logger.error('Activity', 'Error inserting activity event', { message: error.message });
    }
}

export async function fetchActivityEvents(opts: {
    clientId?: string;
    policyId?: string;
    limit?: number;
}): Promise<ActivityEventRow[]> {
    try {
        let query = supabase
            .from('activity_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(opts.limit || 50);

        if (opts.clientId) {
            query = query.eq('client_id', opts.clientId);
        }
        if (opts.policyId) {
            query = query.eq('policy_id', opts.policyId);
        }

        const { data, error } = await query;
        if (error) {
            logger.error('Activity', 'Error fetching activity events', { message: error.message });
            return [];
        }

        const events = (data || []) as ActivityEventRow[];

        // Batch-lookup actor names from accounts
        const actorIds = [...new Set(events.map(e => e.actor_user_id).filter(Boolean))] as string[];
        if (actorIds.length > 0) {
            const { data: accounts } = await supabase
                .from('accounts')
                .select('id, first_name')
                .in('id', actorIds);

            if (accounts) {
                const nameMap = new Map(accounts.map(a => [a.id, a.first_name]));
                for (const e of events) {
                    if (e.actor_user_id) {
                        e.actor_name = nameMap.get(e.actor_user_id) || null;
                    }
                }
            }
        }

        return events;
    } catch (err) {
        logger.error('Activity', 'Unexpected error', { error: String(err) });
        return [];
    }
}
