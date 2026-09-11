'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    MessageSquare,
    X,
    Send,
    Pencil,
    CheckCircle2,
    RotateCcw,
    Loader2,
    FileText,
    Shield,
    Check,
} from 'lucide-react';
import {
    NoteRow,
    DocNoteTag,
    fetchDocNotes,
    createNote,
    updateNote,
    getCurrentUserId,
    getCurrentUserRole,
} from '@/lib/notes';
import styles from './DocCommentPopover.module.scss';

interface DocCommentPopoverProps {
    policyId: string;
    clientId: string;
    docType: DocNoteTag | null; // null = General policy note
    policyNumber: string;
    trigger: React.ReactNode;
    onCommentChange?: () => void;
}

function getRelativeTime(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 172800000) return 'Yesterday';
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function DocCommentPopover({
    policyId,
    clientId,
    docType,
    policyNumber,
    trigger,
    onCommentChange,
}: DocCommentPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [notes, setNotes] = useState<NoteRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentRole, setCurrentRole] = useState<string | null>(null);

    // New comment state
    const [newBody, setNewBody] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Editing state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editBody, setEditBody] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);

    // Popover positioning
    const triggerRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    const loadNotes = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchDocNotes(policyId, docType, false);
            setNotes(data);
        } catch (err) {
            console.error('Failed to load document comments:', err);
        } finally {
            setLoading(false);
        }
    }, [policyId, docType]);

    // Calculate popover positioning relative to trigger
    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const popoverWidth = 360;
        const popoverHeight = 420;

        let left = rect.left;
        let top = rect.bottom + 6;

        // Prevent right overflow
        if (left + popoverWidth > window.innerWidth - 16) {
            left = window.innerWidth - popoverWidth - 16;
        }
        if (left < 16) left = 16;

        // Prevent bottom overflow (flip above if needed)
        if (top + popoverHeight > window.innerHeight - 16) {
            top = Math.max(16, rect.top - popoverHeight - 6);
        }

        setPopoverPos({ top, left });
    }, []);

    const handleOpen = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setIsOpen(true);
        loadNotes();
        getCurrentUserId().then(setCurrentUserId);
        getCurrentUserRole().then(setCurrentRole);
    };

    const handleClose = () => {
        setIsOpen(false);
        setEditingId(null);
        setNewBody('');
    };

    useEffect(() => {
        if (isOpen) {
            updatePosition();
            const handleScrollOrResize = () => updatePosition();
            window.addEventListener('resize', handleScrollOrResize);
            window.addEventListener('scroll', handleScrollOrResize, true);
            return () => {
                window.removeEventListener('resize', handleScrollOrResize);
                window.removeEventListener('scroll', handleScrollOrResize, true);
            };
        }
    }, [isOpen, updatePosition]);

    // Handle outside click & escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };
        const handleClickOutside = (e: MouseEvent) => {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(e.target as Node) &&
                triggerRef.current &&
                !triggerRef.current.contains(e.target as Node)
            ) {
                handleClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    // Submit new comment
    const handleAddComment = async () => {
        if (!newBody.trim() || submitting) return;
        setSubmitting(true);
        try {
            const tags = docType ? [docType] : ['General'];
            await createNote({
                client_id: clientId,
                policy_id: policyId,
                body: newBody.trim().slice(0, 500),
                tags,
            });
            setNewBody('');
            await loadNotes();
            onCommentChange?.();
        } catch (err) {
            console.error('Failed to create comment:', err);
        } finally {
            setSubmitting(false);
        }
    };

    // Save edited comment
    const handleSaveEdit = async (noteId: string) => {
        if (!editBody.trim() || savingEdit) return;
        setSavingEdit(true);
        try {
            await updateNote(noteId, { body: editBody.trim().slice(0, 500) });
            setEditingId(null);
            await loadNotes();
            onCommentChange?.();
        } catch (err) {
            console.error('Failed to update comment:', err);
        } finally {
            setSavingEdit(false);
        }
    };

    // Toggle resolved
    const handleToggleResolve = async (noteId: string, currentResolved: boolean) => {
        try {
            await updateNote(noteId, { is_resolved: !currentResolved });
            await loadNotes();
            onCommentChange?.();
        } catch (err) {
            console.error('Failed to toggle resolve state:', err);
        }
    };

    const docTitle = docType ? `${docType} Remarks` : 'Policy Notes';

    return (
        <>
            <div
                ref={triggerRef}
                onClick={handleOpen}
                style={{ display: 'inline-flex', alignItems: 'center' }}
            >
                {trigger}
            </div>

            {isOpen &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div className={styles.popoverOverlay}>
                        <div
                            ref={popoverRef}
                            className={styles.popoverContainer}
                            style={{
                                top: `${popoverPos.top}px`,
                                left: `${popoverPos.left}px`,
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className={styles.popoverHeader}>
                                <div className={styles.headerTitleGroup}>
                                    <MessageSquare size={16} className={styles.headerIcon} />
                                    <div>
                                        <h4 className={styles.headerTitle}>{docTitle}</h4>
                                        <span className={styles.headerSubtitle}>{policyNumber}</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className={styles.closeBtn}
                                    onClick={handleClose}
                                    title="Close"
                                >
                                    <X size={15} />
                                </button>
                            </div>

                            {/* Comment List */}
                            <div className={styles.commentList}>
                                {loading ? (
                                    <div className={styles.loadingState}>
                                        <Loader2 size={16} className="animate-spin" />
                                        <span>Loading comments...</span>
                                    </div>
                                ) : notes.length === 0 ? (
                                    <div className={styles.emptyState}>
                                        <FileText size={24} />
                                        <p>No comments or remarks yet.</p>
                                        <span>Leave remarks below to track progress or notes.</span>
                                    </div>
                                ) : (
                                    notes.map((n) => {
                                        const isAuthor =
                                            currentUserId && n.author_user_id === currentUserId;
                                        const canEdit = isAuthor || currentRole === 'admin';
                                        const isResolved = !!n.meta?.is_resolved;

                                        return (
                                            <div
                                                key={n.id}
                                                className={`${styles.commentCard} ${
                                                    isResolved ? styles.isResolved : ''
                                                }`}
                                            >
                                                <div className={styles.commentCardHeader}>
                                                    <div className={styles.authorGroup}>
                                                        <span className={styles.authorName}>
                                                            {n.author_name || 'Staff Member'}
                                                        </span>
                                                        <span className={styles.commentTime}>
                                                            • {getRelativeTime(n.created_at)}
                                                        </span>
                                                        {isResolved && (
                                                            <span className={styles.resolvedBadge}>
                                                                <Check size={10} /> Resolved
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className={styles.commentActions}>
                                                        {/* Resolve/Reopen toggle */}
                                                        <button
                                                            type="button"
                                                            className={`${styles.actionIconBtn} ${
                                                                isResolved
                                                                    ? styles.reopenBtn
                                                                    : styles.resolveBtn
                                                                }`}
                                                            onClick={() =>
                                                                handleToggleResolve(n.id, isResolved)
                                                            }
                                                            title={
                                                                isResolved
                                                                    ? 'Reopen comment'
                                                                    : 'Mark as resolved'
                                                            }
                                                        >
                                                            {isResolved ? (
                                                                <>
                                                                    <RotateCcw size={11} /> Reopen
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <CheckCircle2 size={11} /> Resolve
                                                                </>
                                                            )}
                                                        </button>

                                                        {/* Edit button (Author or Admin only) */}
                                                        {canEdit && editingId !== n.id && (
                                                            <button
                                                                type="button"
                                                                className={styles.actionIconBtn}
                                                                onClick={() => {
                                                                    setEditingId(n.id);
                                                                    setEditBody(n.body);
                                                                }}
                                                                title="Edit your comment"
                                                            >
                                                                <Pencil size={11} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Body or Edit Box */}
                                                {editingId === n.id ? (
                                                    <div className={styles.editArea}>
                                                        <textarea
                                                            value={editBody}
                                                            onChange={(e) =>
                                                                setEditBody(e.target.value.slice(0, 500))
                                                            }
                                                            className={styles.editTextarea}
                                                            rows={3}
                                                            maxLength={500}
                                                            autoFocus
                                                        />
                                                        <div className={styles.editActions}>
                                                            <span className={styles.charCount}>
                                                                {editBody.length}/500
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className={`${styles.btnSmall} ${styles.btnCancel}`}
                                                                onClick={() => setEditingId(null)}
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={
                                                                    !editBody.trim() || savingEdit
                                                                }
                                                                className={`${styles.btnSmall} ${styles.btnSave}`}
                                                                onClick={() =>
                                                                    handleSaveEdit(n.id)
                                                                }
                                                            >
                                                                Save
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className={styles.commentBody}>{n.body}</p>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Add New Comment / Reply Input */}
                            <div className={styles.inputSection}>
                                <div className={styles.inputRow}>
                                    <textarea
                                        value={newBody}
                                        onChange={(e) =>
                                            setNewBody(e.target.value.slice(0, 500))
                                        }
                                        placeholder={`Add a remark or note (max 500 chars)...`}
                                        className={styles.commentTextarea}
                                        maxLength={500}
                                        onKeyDown={(e) => {
                                            if (
                                                (e.ctrlKey || e.metaKey) &&
                                                e.key === 'Enter'
                                            ) {
                                                e.preventDefault();
                                                handleAddComment();
                                            }
                                        }}
                                    />
                                    <button
                                        type="button"
                                        disabled={!newBody.trim() || submitting}
                                        onClick={handleAddComment}
                                        className={styles.sendBtn}
                                        title="Send remark (Ctrl+Enter)"
                                    >
                                        <Send size={13} />
                                    </button>
                                </div>
                                <div className={styles.charCount}>{newBody.length}/500</div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
