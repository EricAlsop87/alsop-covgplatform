'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Info,
    X,
    Mail,
    UserCheck,
    Clock,
    Send,
    Paperclip,
    FileText,
    Users,
} from 'lucide-react';
import type { CFPTermRow } from '@/app/api/cfp-summary/route';
import styles from './SentMailInfoPopover.module.scss';

interface SentMailInfoPopoverProps {
    term: CFPTermRow;
    onResend: () => void;
}

function formatSentDate(isoString?: string | null): { full: string; relative: string } {
    if (!isoString) return { full: '—', relative: '' };
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return { full: isoString, relative: '' };

        const full = d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });

        const diff = Date.now() - d.getTime();
        let relative = '';
        if (diff < 60000) relative = 'Just now';
        else if (diff < 3600000) relative = `${Math.floor(diff / 60000)}m ago`;
        else if (diff < 86400000) relative = `${Math.floor(diff / 3600000)}h ago`;
        else if (diff < 172800000) relative = 'Yesterday';
        else relative = `${Math.floor(diff / 86400000)}d ago`;

        return { full, relative: relative ? `(${relative})` : '' };
    } catch {
        return { full: isoString || '—', relative: '' };
    }
}

export function SentMailInfoPopover({ term, onResend }: SentMailInfoPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const popoverWidth = 330;
        const popoverHeight = 360;

        let left = rect.left - popoverWidth / 2 + rect.width / 2;
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

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setIsOpen(prev => !prev);
    };

    const handleClose = (e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        setIsOpen(false);
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

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        const handleClickOutside = (e: MouseEvent) => {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(e.target as Node) &&
                triggerRef.current &&
                !triggerRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const { full: formattedSentAt, relative: relativeSentAt } = formatSentDate(term.cfp_mail_sent_at);
    const toNames = term.cfp_mail_sent_to_names && term.cfp_mail_sent_to_names.length > 0
        ? term.cfp_mail_sent_to_names
        : term.cfp_mail_sent_to || [];
    const ccNames = term.cfp_mail_sent_cc_names && term.cfp_mail_sent_cc_names.length > 0
        ? term.cfp_mail_sent_cc_names
        : term.cfp_mail_sent_cc || [];

    const attachments = term.cfp_mail_attachments || [];

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className={styles.infoTriggerBtn}
                onClick={handleToggle}
                title="Quick Sent Mail Details (Click to view recipients & timestamp)"
            >
                <Info size={11} />
            </button>

            {isOpen &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div className={styles.popoverOverlay} onClick={() => setIsOpen(false)}>
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
                                    <Mail size={15} className={styles.headerIcon} />
                                    <div>
                                        <h4 className={styles.headerTitle}>Sent Mail Record</h4>
                                        <span className={styles.headerSubtitle} title={`${term.policy_number} • ${term.named_insured}`}>
                                            {term.policy_number} &bull; {term.named_insured}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className={styles.closeBtn}
                                    onClick={handleClose}
                                    title="Close"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className={styles.popoverBody}>
                                {/* Primary TO */}
                                <div className={styles.infoRow}>
                                    <span className={styles.infoLabel}>
                                        <UserCheck size={12} /> Primary Recipients (TO)
                                    </span>
                                    <div className={styles.tagPillsWrap}>
                                        {toNames.length > 0 ? (
                                            toNames.map((name, i) => (
                                                <span key={i} className={`${styles.recipientPill} ${styles.toPill}`}>
                                                    {name}
                                                </span>
                                            ))
                                        ) : (
                                            <span className={styles.infoValue}>Team</span>
                                        )}
                                    </div>
                                </div>

                                {/* Copied CC */}
                                {ccNames.length > 0 && (
                                    <div className={styles.infoRow}>
                                        <span className={styles.infoLabel}>
                                            <Users size={12} /> Copied (CC)
                                        </span>
                                        <div className={styles.tagPillsWrap}>
                                            {ccNames.map((name, i) => (
                                                <span key={i} className={`${styles.recipientPill} ${styles.ccPill}`}>
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Timestamp */}
                                <div className={styles.infoRow}>
                                    <span className={styles.infoLabel}>
                                        <Clock size={12} /> Date &amp; Time Sent
                                    </span>
                                    <span className={styles.infoValue}>
                                        {formattedSentAt} {relativeSentAt && <span style={{ color: '#64748b', fontSize: '0.7rem' }}>{relativeSentAt}</span>}
                                    </span>
                                </div>

                                {/* Sent By */}
                                {term.cfp_mail_sent_by && (
                                    <div className={styles.infoRow}>
                                        <span className={styles.infoLabel}>
                                            <UserCheck size={12} /> Sent By
                                        </span>
                                        <span className={styles.infoValue}>{term.cfp_mail_sent_by}</span>
                                    </div>
                                )}

                                {/* Subject Line */}
                                {term.cfp_mail_subject && (
                                    <div className={styles.infoRow}>
                                        <span className={styles.infoLabel}>
                                            <FileText size={12} /> Subject
                                        </span>
                                        <span className={styles.infoValue} style={{ fontSize: '0.72rem', color: '#334155' }}>
                                            {term.cfp_mail_subject}
                                        </span>
                                    </div>
                                )}

                                {/* Attachments */}
                                {attachments.length > 0 && (
                                    <div className={styles.infoRow}>
                                        <span className={styles.infoLabel}>
                                            <Paperclip size={12} /> Attached Files ({attachments.length})
                                        </span>
                                        <div className={styles.tagPillsWrap}>
                                            {attachments.map((att, i) => (
                                                <span key={i} className={styles.attachmentItem} title={att}>
                                                    {att}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className={styles.popoverFooter}>
                                <button
                                    type="button"
                                    className={styles.resendBtn}
                                    onClick={(e) => {
                                        handleClose(e);
                                        onResend();
                                    }}
                                    title="Open email modal to re-send or modify"
                                >
                                    <Send size={12} />
                                    <span>Re-send Mail</span>
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
