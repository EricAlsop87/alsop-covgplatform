'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FileCheck2, Clock, RotateCcw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { fetchDecPagesForPolicy, approveDecPage, DecPageSummary } from '@/lib/api';
import { insertActivityEvent } from '@/lib/notes';
import styles from './DecPageReview.module.css';

interface DecPageReviewProps {
    policyId: string;
    onApproved?: () => void;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    approved: { icon: <CheckCircle2 size={14} />, label: 'Approved', cls: 'approved' },
    pending: { icon: <Clock size={14} />, label: 'Pending Review', cls: 'pending' },
    rejected: { icon: <XCircle size={14} />, label: 'Rejected', cls: 'rejected' },
    superseded: { icon: <RotateCcw size={14} />, label: 'Superseded', cls: 'superseded' },
};

export function DecPageReview({ policyId, onApproved }: DecPageReviewProps) {
    const [decPages, setDecPages] = useState<DecPageSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [approving, setApproving] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const showToast = useCallback((type: 'success' | 'error', msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        const data = await fetchDecPagesForPolicy(policyId);
        setDecPages(data);
        setLoading(false);
    }, [policyId]);

    useEffect(() => { load(); }, [load]);

    const handleApprove = async (decPageId: string) => {
        const confirmed = window.confirm(
            'Approving this dec page will:\n\n' +
            '• Overwrite the current policy term with this dec page\'s coverage data (limits, premiums, perils, broker info, etc.)\n' +
            '• Mark any previously approved dec page as "Superseded"\n' +
            '• This becomes the source of truth for the Policy Review tab\n\n' +
            'Continue?'
        );
        if (!confirmed) return;

        setApproving(decPageId);
        try {
            const ok = await approveDecPage(decPageId, policyId);
            if (ok) {
                showToast('success', 'Dec page approved — policy data updated');
                // Insert activity event
                const dp = decPages.find(d => d.id === decPageId);
                await insertActivityEvent({
                    event_type: 'dec.approved',
                    title: 'Dec page approved',
                    detail: dp?.policy_number ? `Policy #${dp.policy_number}` : undefined,
                    policy_id: policyId,
                    meta: { dec_page_id: decPageId },
                });
                await load();
                onApproved?.();
            } else {
                showToast('error', 'Failed to approve — check permissions');
            }
        } catch {
            showToast('error', 'Error approving dec page');
        } finally {
            setApproving(null);
        }
    };

    const formatDate = (ts: string) => {
        try {
            return new Date(ts).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit',
            });
        } catch { return ts; }
    };

    if (loading) return <p className={styles.loading}>Loading dec pages…</p>;
    if (decPages.length === 0) return <p className={styles.empty}>No dec pages uploaded for this policy.</p>;

    return (
        <div className={styles.container}>
            {/* Toast */}
            {toast && (
                <div className={`${styles.toast} ${styles[toast.type]}`}>
                    {toast.type === 'error' && <AlertCircle size={14} />}
                    {toast.msg}
                </div>
            )}

            <h3 className={styles.sectionTitle}>
                <FileCheck2 size={16} />
                Dec Page Review ({decPages.length})
            </h3>
            <p className={styles.subtitle}>
                Approve a dec page to promote its data as the current policy term coverage.
            </p>

            <div className={styles.list}>
                {decPages.map((dp) => {
                    const status = STATUS_CONFIG[dp.review_status] || STATUS_CONFIG.pending;
                    return (
                        <div key={dp.id} className={`${styles.card} ${styles[status.cls]}`}>
                            <div className={styles.cardHeader}>
                                <div className={styles.cardMeta}>
                                    <span className={`${styles.statusBadge} ${styles[status.cls]}`}>
                                        {status.icon} {status.label}
                                    </span>
                                    <span className={styles.date}>{formatDate(dp.created_at)}</span>
                                </div>
                                {dp.review_status === 'pending' && (
                                    <button
                                        className={styles.approveBtn}
                                        onClick={() => handleApprove(dp.id)}
                                        disabled={approving === dp.id}
                                    >
                                        {approving === dp.id ? 'Approving…' : (
                                            <><CheckCircle2 size={14} /> Approve</>
                                        )}
                                    </button>
                                )}
                                {dp.review_status === 'superseded' && (
                                    <button
                                        className={styles.reapproveBtn}
                                        onClick={() => handleApprove(dp.id)}
                                        disabled={approving === dp.id}
                                    >
                                        {approving === dp.id ? 'Approving…' : 'Re-approve'}
                                    </button>
                                )}
                            </div>

                            {/* Key data summary */}
                            <div className={styles.dataGrid}>
                                {dp.policy_period_start && dp.policy_period_end && (
                                    <div className={styles.dataItem}>
                                        <span className={styles.dataLabel}>Period</span>
                                        <span className={styles.dataValue}>{dp.policy_period_start} → {dp.policy_period_end}</span>
                                    </div>
                                )}
                                {dp.limit_dwelling && (
                                    <div className={styles.dataItem}>
                                        <span className={styles.dataLabel}>Dwelling</span>
                                        <span className={styles.dataValue}>{dp.limit_dwelling}</span>
                                    </div>
                                )}
                                {dp.total_annual_premium && (
                                    <div className={styles.dataItem}>
                                        <span className={styles.dataLabel}>Premium</span>
                                        <span className={styles.dataValue}>{dp.total_annual_premium}</span>
                                    </div>
                                )}
                                {dp.deductible && (
                                    <div className={styles.dataItem}>
                                        <span className={styles.dataLabel}>Deductible</span>
                                        <span className={styles.dataValue}>{dp.deductible}</span>
                                    </div>
                                )}
                                {dp.broker_name && (
                                    <div className={styles.dataItem}>
                                        <span className={styles.dataLabel}>Broker</span>
                                        <span className={styles.dataValue}>{dp.broker_name}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
