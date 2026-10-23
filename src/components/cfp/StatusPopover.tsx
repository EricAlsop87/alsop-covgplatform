'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Loader2, Check, AlertOctagon, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import styles from './StatusPopover.module.scss';

export interface StatusPopoverProps {
    policyId: string;
    policyTermId?: string;
    policyNumber: string;
    currentStatus?: string | null;
    isPendingDec?: boolean;
    onStatusUpdated: (policyId: string, newStatus: string) => void;
}

interface StatusDefinition {
    label: string;
    value: string;
    bg: string;
    color: string;
    border: string;
}

const STATUS_OPTIONS: StatusDefinition[] = [
    { label: 'CANCELLED', value: 'CANCELLED', bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
    { label: 'ACTIVE', value: 'ACTIVE', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
    { label: 'INFORCE', value: 'INFORCE', bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
    { label: 'RENEW', value: 'RENEW', bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
    { label: 'ENDORSE', value: 'ENDORSE', bg: '#f3e8ff', color: '#6b21a8', border: '#e9d5ff' },
    { label: 'REINSTATE', value: 'REINSTATE', bg: '#ccfbf1', color: '#115e59', border: '#99f6e4' },
    { label: 'REWRITE', value: 'REWRITE', bg: '#ffedd5', color: '#9a3412', border: '#fed7aa' },
    { label: 'NONRENEW', value: 'NONRENEW', bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
    { label: 'PENDING DEC', value: 'PENDING DEC', bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
];

export function getStatusBadgeStyle(statusStr: string, isPendingDec?: boolean): React.CSSProperties {
    const sLower = (statusStr || '').toLowerCase();
    let badgeStyle: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '0.2rem 0.5rem',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
    };

    if (sLower.includes('cancel')) {
        badgeStyle = { ...badgeStyle, background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' };
    } else if (sLower.includes('nonrenew') || sLower.includes('non-renew')) {
        badgeStyle = { ...badgeStyle, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' };
    } else if (sLower === 'new') {
        badgeStyle = { ...badgeStyle, background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' };
    } else if (sLower === 'renew') {
        badgeStyle = { ...badgeStyle, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' };
    } else if (sLower === 'endorse') {
        badgeStyle = { ...badgeStyle, background: '#f3e8ff', color: '#6b21a8', border: '1px solid #e9d5ff' };
    } else if (sLower === 'reinstate') {
        badgeStyle = { ...badgeStyle, background: '#ccfbf1', color: '#115e59', border: '1px solid #99f6e4' };
    } else if (sLower === 'rewrite') {
        badgeStyle = { ...badgeStyle, background: '#ffedd5', color: '#9a3412', border: '1px solid #fed7aa' };
    } else if (isPendingDec) {
        badgeStyle = { ...badgeStyle, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' };
    } else {
        badgeStyle = { ...badgeStyle, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' };
    }

    return badgeStyle;
}

export function StatusPopover({
    policyId,
    policyTermId,
    policyNumber,
    currentStatus,
    isPendingDec,
    onStatusUpdated,
}: StatusPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [statusVal, setStatusVal] = useState<string>(
        currentStatus || (isPendingDec ? 'Pending DEC' : 'Active')
    );

    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    useEffect(() => {
        if (currentStatus) {
            setStatusVal(currentStatus);
        }
    }, [currentStatus]);

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const popoverWidth = 280;
        const popoverHeight = 310;

        let left = rect.left - popoverWidth / 2 + rect.width / 2;
        let top = rect.bottom + 6;

        if (left + popoverWidth > window.innerWidth - 16) {
            left = window.innerWidth - popoverWidth - 16;
        }
        if (left < 16) left = 16;

        if (top + popoverHeight > window.innerHeight - 16) {
            top = Math.max(16, rect.top - popoverHeight - 6);
        }

        setPopoverPos({ top, left });
    }, []);

    const handleOpen = (e: React.MouseEvent) => {
        e.stopPropagation();
        updatePosition();
        setIsOpen(prev => !prev);
    };

    // Close on click outside or escape key
    useEffect(() => {
        if (!isOpen) return;

        const handleOutsideClick = (e: MouseEvent) => {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(e.target as Node) &&
                triggerRef.current &&
                !triggerRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);

        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [isOpen, updatePosition]);

    const handleSelectStatus = async (newStatus: string) => {
        const cleanStatus = newStatus.trim();
        setStatusVal(cleanStatus);
        onStatusUpdated(policyId, cleanStatus);
        setSaving(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            await fetch('/api/cfp-summary/status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                },
                body: JSON.stringify({
                    policy_id: policyId,
                    policy_term_id: policyTermId,
                    carrier_status: cleanStatus,
                }),
            });
        } catch (err) {
            console.error('Failed to persist carrier status:', err);
        } finally {
            setSaving(false);
            setIsOpen(false);
        }
    };

    const isCurrentCancelled = statusVal.toLowerCase().includes('cancel');
    const badgeStyle = getStatusBadgeStyle(statusVal, isPendingDec);

    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <button
                ref={triggerRef}
                type="button"
                className={styles.statusTriggerBtn}
                onClick={handleOpen}
                title={`Status: ${statusVal} (Click to change status or mark Cancelled)`}
            >
                <span style={badgeStyle}>
                    {statusVal}
                    <ChevronDown size={11} className={styles.caretIcon} />
                </span>
            </button>

            {isOpen && typeof document !== 'undefined' && createPortal(
                <>
                    <div className={styles.popoverOverlay} onClick={() => setIsOpen(false)} />
                    <div
                        ref={popoverRef}
                        className={styles.popoverCard}
                        style={{ top: `${popoverPos.top}px`, left: `${popoverPos.left}px` }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className={styles.popoverHeader}>
                            <div className={styles.popoverTitle}>
                                <span>Policy Status</span>
                                <span className={styles.policyNumBadge}>{policyNumber}</span>
                            </div>
                            <button
                                type="button"
                                className={styles.closeBtn}
                                onClick={() => setIsOpen(false)}
                                title="Close"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Fast 1-Click Action for Quoting Team */}
                        {!isCurrentCancelled ? (
                            <div>
                                <button
                                    type="button"
                                    className={styles.cancelledActionBtn}
                                    onClick={() => handleSelectStatus('CANCELLED')}
                                    disabled={saving}
                                >
                                    <AlertOctagon size={14} />
                                    <span>Mark as CANCELLED (No Quote)</span>
                                </button>
                                <p className={styles.actionHelpText}>
                                    Easily marks policy as Cancelled so the team knows <strong>no quoting is needed</strong>.
                                </p>
                            </div>
                        ) : (
                            <div>
                                <button
                                    type="button"
                                    className={styles.activeActionBtn}
                                    onClick={() => handleSelectStatus('ACTIVE')}
                                    disabled={saving}
                                >
                                    <CheckCircle2 size={14} />
                                    <span>Restore to ACTIVE (Needs Quoting)</span>
                                </button>
                                <p className={styles.actionHelpText}>
                                    Currently marked Cancelled (No Quote Needed). Click to reactivate.
                                </p>
                            </div>
                        )}

                        <div className={styles.sectionDivider}>
                            <span>Or Select Status</span>
                        </div>

                        <div className={styles.statusGrid}>
                            {STATUS_OPTIONS.map(opt => {
                                const isSelected = opt.value.toLowerCase() === statusVal.toLowerCase();
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        className={`${styles.statusOptionBtn} ${isSelected ? styles.selected : ''}`}
                                        style={{
                                            background: opt.bg,
                                            color: opt.color,
                                            borderColor: opt.border,
                                        }}
                                        onClick={() => handleSelectStatus(opt.value)}
                                        disabled={saving}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>

                        {saving && (
                            <div className={styles.savingRow}>
                                <Loader2 size={13} className="animate-spin" />
                                <span>Updating status...</span>
                            </div>
                        )}
                    </div>
                </>,
                document.body
            )}
        </div>
    );
}
