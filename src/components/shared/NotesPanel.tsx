'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    MessageSquarePlus, Pin, PinOff, Archive, ArchiveRestore,
    Pencil, Send, X, FileText, AlertCircle, User, Clock, Tag
} from 'lucide-react';
import {
    NoteRow, fetchNotes, fetchClientOnlyNotes, createNote, updateNote,
    getCurrentUserId, getCurrentUserRole, NOTE_TAGS
} from '@/lib/notes';
import styles from './NotesPanel.module.css';

interface NotesPanelProps {
    clientId: string;
    policyId?: string;
    showPolicySections?: boolean;
}

function getRelativeTime(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 172800000) return 'Yesterday';
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function NotesPanel({ clientId, policyId, showPolicySections }: NotesPanelProps) {
    const [notes, setNotes] = useState<NoteRow[]>([]);
    const [clientNotes, setClientNotes] = useState<NoteRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);
    const [newBody, setNewBody] = useState('');
    const [newTags, setNewTags] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editBody, setEditBody] = useState('');
    const [editTags, setEditTags] = useState<string[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    // Pagination & Filtering
    const [limit, setLimit] = useState(20);
    const [selectedTag, setSelectedTag] = useState<string | null>(null);

    const showToast = useCallback((type: 'success' | 'error', msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const loadNotes = useCallback(async () => {
        setLoading(true);
        try {
            if (policyId && showPolicySections) {
                const [policyNotesData, generalNotesData] = await Promise.all([
                    fetchNotes({ policyId, includeArchived: showArchived, limit }),
                    fetchClientOnlyNotes(clientId, showArchived, limit),
                ]);
                setNotes(policyNotesData);
                setClientNotes(generalNotesData);
            } else if (policyId) {
                const data = await fetchNotes({ policyId, includeArchived: showArchived, limit });
                setNotes(data);
            } else {
                const data = await fetchNotes({ clientId, includeArchived: showArchived, limit });
                setNotes(data);
            }
        } catch {
            showToast('error', 'Failed to load notes');
        } finally {
            setLoading(false);
        }
    }, [clientId, policyId, showPolicySections, showArchived, limit, showToast]);

    useEffect(() => {
        loadNotes();
        getCurrentUserId().then(setCurrentUserId);
        getCurrentUserRole().then(setCurrentRole);
    }, [loadNotes]);

    const canEdit = (note: NoteRow) => currentRole === 'admin' || note.author_user_id === currentUserId;

    const handleCreate = async () => {
        if (!newBody.trim()) return;
        setSaving(true);
        try {
            await createNote({
                client_id: clientId,
                policy_id: policyId || null,
                body: newBody.trim(),
                tags: newTags,
            });
            setNewBody('');
            setNewTags([]);
            showToast('success', 'Note added');
            // reset limit to 20 when adding a new note to see it at the top
            setLimit(20);
            await loadNotes();
        } catch (e) {
            showToast('error', e instanceof Error ? e.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdate = async (noteId: string, updates: { body?: string; is_pinned?: boolean; is_archived?: boolean; tags?: string[] }) => {
        try {
            await updateNote(noteId, updates);
            if (updates.body !== undefined) {
                setEditingId(null);
                showToast('success', 'Note updated');
            } else if (updates.is_pinned !== undefined) {
                showToast('success', updates.is_pinned ? 'Pinned' : 'Unpinned');
            } else if (updates.is_archived !== undefined) {
                showToast('success', updates.is_archived ? 'Archived' : 'Restored');
            }
            await loadNotes();
        } catch (e) {
            showToast('error', e instanceof Error ? e.message : 'Not allowed');
        }
    };

    const renderNote = (note: NoteRow) => {
        const tags = Array.isArray(note.meta?.tags) ? note.meta.tags as string[] : [];
        if (selectedTag && !tags.includes(selectedTag)) return null;

        return (
            <div
                key={note.id}
                className={`${styles.note} ${note.is_pinned ? styles.pinned : ''} ${note.is_archived ? styles.archived : ''}`}
            >
                <div className={styles.noteHeader}>
                    <div className={styles.noteAuthor}>
                        <User size={14} className={styles.authorIcon} />
                        <span className={styles.authorName}>{note.author_name || 'System'}</span>
                        {note.is_pinned && <Pin size={12} className={styles.pinIcon} />}
                    </div>

                    {canEdit(note) && (
                        <div className={styles.noteActions}>
                            <button title={note.is_pinned ? 'Unpin' : 'Pin'} onClick={() => handleUpdate(note.id, { is_pinned: !note.is_pinned })} className={styles.noteAction}>
                                {note.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
                            </button>
                            <button title="Edit" onClick={() => { 
                                setEditingId(note.id); 
                                setEditBody(note.body); 
                                setEditTags(Array.isArray(note.meta?.tags) ? note.meta.tags as string[] : []);
                            }} className={styles.noteAction}>
                                <Pencil size={14} />
                            </button>
                            <button title={note.is_archived ? 'Restore' : 'Archive'} onClick={() => handleUpdate(note.id, { is_archived: !note.is_archived })} className={styles.noteAction}>
                                {note.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                            </button>
                        </div>
                    )}
                </div>

                {editingId === note.id ? (
                    <div className={styles.editArea}>
                        <textarea
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            className={styles.textarea}
                            rows={3}
                        />
                        <div className={styles.tagSelector}>
                            {NOTE_TAGS.map(tag => (
                                <span 
                                    key={tag} 
                                    className={`${styles.tagOption} ${editTags.includes(tag) ? styles.tagSelected : ''}`}
                                    onClick={() => {
                                        setEditTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
                                    }}
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                        <div className={styles.editActions}>
                            <button onClick={() => setEditingId(null)} className={styles.cancelBtn}>
                                <X size={14} /> Cancel
                            </button>
                            <button onClick={() => handleUpdate(note.id, { body: editBody.trim(), tags: editTags })} disabled={!editBody.trim()} className={styles.saveBtn}>
                                Save edits
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className={styles.noteBody}>{note.body}</p>
                )}

                <div className={styles.noteFooter}>
                    <div className={styles.tagsContainer}>
                        {tags.map(tag => (
                            <span key={tag} className={styles.tag} onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}>
                                <Tag size={10} /> {tag}
                            </span>
                        ))}
                        {note.policy_id && !policyId && (
                            <span className={styles.policyBadge}>
                                <FileText size={10} /> Policy Notes
                            </span>
                        )}
                        {note.is_archived && <span className={styles.archivedBadge}>Archived</span>}
                    </div>
                    <div className={styles.noteTimeContainer}>
                        <Clock size={12} />
                        <span className={styles.noteTime}>{getRelativeTime(note.updated_at)}</span>
                    </div>
                </div>
            </div>
        );
    };

    const hasMoreNotes = notes.length === limit || clientNotes.length === limit;

    return (
        <div className={styles.container}>
            {toast && (
                <div className={`${styles.toast} ${styles[toast.type]}`}>
                    {toast.type === 'error' ? <AlertCircle size={14} /> : null}
                    {toast.msg}
                </div>
            )}

            <div className={styles.filterBar}>
                <div className={styles.tagsFilter}>
                    <span className={styles.filterLabel}>Filter:</span>
                    <button
                        className={`${styles.filterChip} ${!selectedTag ? styles.activeFilter : ''}`}
                        onClick={() => setSelectedTag(null)}
                    >
                        All
                    </button>
                    {NOTE_TAGS.map(tag => (
                        <button
                            key={tag}
                            className={`${styles.filterChip} ${selectedTag === tag ? styles.activeFilter : ''}`}
                            onClick={() => setSelectedTag(tag)}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
                <label className={styles.toggle}>
                    <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                    Show archived
                </label>
            </div>

            <div className={styles.newNote}>
                <div className={styles.newNoteInputWrapper}>
                    <MessageSquarePlus className={styles.newNoteIcon} size={16} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <textarea
                            value={newBody}
                            onChange={(e) => setNewBody(e.target.value)}
                            placeholder="Write a new note..."
                            className={styles.newNoteTextarea}
                            rows={1}
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = target.scrollHeight + 'px';
                            }}
                        />
                        <div className={styles.tagSelector}>
                            {NOTE_TAGS.map(tag => (
                                <span 
                                    key={tag} 
                                    className={`${styles.tagOption} ${newTags.includes(tag) ? styles.tagSelected : ''}`}
                                    onClick={() => {
                                        setNewTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
                                    }}
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                <button onClick={handleCreate} disabled={saving || !newBody.trim()} className={styles.addBtn}>
                    {saving ? 'Saving...' : 'Post Note'}
                </button>
            </div>

            {loading && notes.length === 0 ? (
                <div className={styles.loadingContainer}>
                    <div className={styles.spinner} />
                    <span>Loading notes...</span>
                </div>
            ) : (
                <div className={styles.notesList}>
                    {showPolicySections && policyId ? (
                        <>
                            <h4 className={styles.sectionLabel}>Policy Notes</h4>
                            {notes.length > 0 ? notes.map(renderNote) : <p className={styles.empty}>No policy notes.</p>}

                            <h4 className={styles.sectionLabel} style={{ marginTop: '2rem' }}>
                                Client Notes <span className={styles.sectionSub}>(General)</span>
                            </h4>
                            {clientNotes.length > 0 ? clientNotes.map(renderNote) : <p className={styles.empty}>No general notes.</p>}
                        </>
                    ) : (
                        notes.length > 0 ? notes.map(renderNote) : <p className={styles.empty}>No notes yet.</p>
                    )}

                    {hasMoreNotes && (
                        <button className={styles.loadMoreBtn} onClick={() => setLimit(l => l + 20)} disabled={loading}>
                            {loading ? 'Loading...' : 'Load older notes'}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
