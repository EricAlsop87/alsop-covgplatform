import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { DOC_NOTE_TAGS } from '@/lib/notes';

export const dynamic = 'force-dynamic';

async function attachAuthorNames(admin: ReturnType<typeof getSupabaseAdmin>, notes: any[]) {
    const authorIds = Array.from(new Set(notes.map(n => n.author_user_id).filter(Boolean))) as string[];
    if (authorIds.length > 0) {
        const { data: accounts } = await admin
            .from('accounts')
            .select('id, first_name, last_name, email')
            .in('id', authorIds);

        if (accounts) {
            const nameMap = new Map(
                accounts.map(a => [
                    a.id,
                    `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email || 'Staff'
                ])
            );
            for (const n of notes) {
                if (n.author_user_id) {
                    n.author_name = nameMap.get(n.author_user_id) || null;
                }
            }
        }
    }
}

// GET /api/notes?policyId=...&clientId=...&docTag=...&includeArchived=...
export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent', 'customer'] });
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    const policyId = searchParams.get('policyId');
    const clientId = searchParams.get('clientId');
    const docTag = searchParams.get('docTag');
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    try {
        let query = admin
            .from('notes')
            .select('*')
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(limit);

        if (policyId) query = query.eq('policy_id', policyId);
        if (clientId) query = query.eq('client_id', clientId);
        if (!includeArchived) query = query.eq('is_archived', false);

        const { data, error } = await query;
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        let notes = data || [];

        // Filter by docTag if specified
        if (docTag === '__general__' || docTag === 'general' || (docTag === null && searchParams.has('docTag'))) {
            // General policy notes (notes without any DOC_NOTE_TAGS)
            notes = notes.filter(n => {
                const tags = (n.meta?.tags as string[]) || [];
                return !tags.some(t => (DOC_NOTE_TAGS as readonly string[]).includes(t));
            });
        } else if (docTag && docTag !== 'all') {
            notes = notes.filter(n => {
                const tags = (n.meta?.tags as string[]) || [];
                return tags.includes(docTag);
            });
        }

        await attachAuthorNames(admin, notes);

        return NextResponse.json({ success: true, notes });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}

// POST /api/notes
export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const userId = auth.user.id;

    try {
        const body = await req.json();
        const { client_id, policy_id, body: noteBody, tags } = body;

        if (!client_id && !policy_id) {
            return NextResponse.json({ error: 'client_id or policy_id is required' }, { status: 400 });
        }

        if (!noteBody || !noteBody.trim()) {
            return NextResponse.json({ error: 'Note body is required' }, { status: 400 });
        }

        const metaPayload: Record<string, unknown> = {};
        if (Array.isArray(tags)) {
            metaPayload.tags = tags;
        }

        const { data, error } = await admin
            .from('notes')
            .insert({
                client_id: client_id || null,
                policy_id: policy_id || null,
                body: noteBody.trim(),
                author_user_id: userId,
                meta: metaPayload,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Attach author name
        const notes = [data];
        await attachAuthorNames(admin, notes);

        // Record activity event
        try {
            await admin.from('activity_events').insert({
                actor_user_id: userId,
                event_type: 'note.added',
                title: 'Note added',
                detail: noteBody.trim().slice(0, 100),
                client_id: client_id || null,
                policy_id: policy_id || null,
                meta: { note_id: data.id, tags },
            });
        } catch {}

        return NextResponse.json({ success: true, note: notes[0] });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}

// PATCH /api/notes
export async function PATCH(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const userId = auth.user.id;

    try {
        const body = await req.json();
        const { id, body: noteBody, is_pinned, is_archived, is_resolved, tags } = body;

        if (!id) {
            return NextResponse.json({ error: 'Note id is required' }, { status: 400 });
        }

        const now = new Date().toISOString();
        const updatePayload: Record<string, unknown> = { updated_at: now };

        if (typeof noteBody === 'string') updatePayload.body = noteBody.trim();
        if (typeof is_pinned === 'boolean') updatePayload.is_pinned = is_pinned;
        if (typeof is_archived === 'boolean') updatePayload.is_archived = is_archived;

        if (tags !== undefined || is_resolved !== undefined) {
            const { data: existing } = await admin.from('notes').select('meta').eq('id', id).maybeSingle();
            const existingMeta = (existing?.meta as Record<string, unknown>) || {};
            const newMeta = { ...existingMeta };

            if (tags !== undefined) newMeta.tags = tags;
            if (is_resolved !== undefined) {
                newMeta.is_resolved = is_resolved;
                if (is_resolved) {
                    newMeta.resolved_by = userId;
                    newMeta.resolved_at = now;
                } else {
                    delete newMeta.resolved_by;
                    delete newMeta.resolved_at;
                }
            }
            updatePayload.meta = newMeta;
        }

        const { data, error } = await admin
            .from('notes')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const notes = [data];
        await attachAuthorNames(admin, notes);

        return NextResponse.json({ success: true, note: notes[0] });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
