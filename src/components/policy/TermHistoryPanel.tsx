'use client';

import React, { useMemo } from 'react';
import { PolicyTermSummary } from '@/lib/api';
import { Clock, DollarSign, Calendar, ShieldCheck, FileText, ArrowRight, GitMerge } from 'lucide-react';
import styles from './TermHistoryPanel.module.css';

interface TermHistoryPanelProps {
    terms: PolicyTermSummary[];
    activeTermId?: string;
    policyNumber?: string;
    onSelectTerm?: (termId: string) => void;
}

/** Format date MM/DD/YYYY */
function fmtDate(d?: string): string {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

/** Format premium */
function fmtPremium(val?: number): string {
    if (val == null) return '—';
    return `$${val.toLocaleString()}`;
}

/** Check if a term period overlaps with today */
function dateOverlapsNow(term: PolicyTermSummary): boolean {
    if (!term.effective_date || !term.expiration_date) return false;
    const now = new Date();
    const start = new Date(term.effective_date + 'T00:00:00');
    const end = new Date(term.expiration_date + 'T23:59:59');
    return now >= start && now <= end;
}

/** Check if a term has expired */
function isExpired(term: PolicyTermSummary): boolean {
    if (!term.expiration_date) return false;
    return new Date() > new Date(term.expiration_date + 'T23:59:59');
}

export function TermHistoryPanel({ terms, activeTermId, policyNumber, onSelectTerm }: TermHistoryPanelProps) {
    // Pre-compute which term is "the" active policy term:
    // Priority: 1) date overlaps today, 2) first is_current in sorted list, 3) first term
    const computedActiveId = useMemo(() => {
        const overlapping = terms.find(dateOverlapsNow);
        if (overlapping) return overlapping.id;
        const current = terms.find(t => t.is_current);
        if (current) return current.id;
        return terms[0]?.id;
    }, [terms]);

    if (!terms || terms.length === 0) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <Clock size={18} />
                    <span>Policy Terms</span>
                    <span className={styles.countBadge}>0</span>
                </div>
                <div className={styles.emptyState}>No policy terms recorded yet</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <Clock size={18} />
                <span>Policy Terms</span>
                {policyNumber && (
                    <span className={styles.policyNumLabel}>{policyNumber}</span>
                )}
                <span className={styles.countBadge}>{terms.length} {terms.length === 1 ? 'term' : 'terms'}</span>
            </div>

            <div className={styles.timeline}>
                {terms.map((term, idx) => {
                    const isTheActiveTerm = term.id === computedActiveId;
                    const expired = isExpired(term);
                    const isSelected = activeTermId === term.id;
                    const termDisplayPolicyNumber = term.carrier_policy_number || term.source_policy_number;
                    const hasDifferentPolicyNumber = !!termDisplayPolicyNumber && termDisplayPolicyNumber !== policyNumber;
 
                    return (
                        <div
                            key={term.id}
                            className={`${styles.termCard} ${isTheActiveTerm ? styles.termCardActive : ''} ${isSelected ? styles.termCardSelected : ''}`}
                            onClick={() => onSelectTerm?.(term.id)}
                        >
                            {/* Timeline connector */}
                            <div className={styles.timelineConnector}>
                                <div className={`${styles.timelineDot} ${isTheActiveTerm ? styles.timelineDotActive : ''}`}>
                                    {isTheActiveTerm && <div className={styles.timelineDotPulse} />}
                                </div>
                                {idx < terms.length - 1 && <div className={styles.timelineLine} />}
                            </div>
 
                            {/* Card content */}
                            <div className={styles.termContent}>
                                {/* Badge row */}
                                <div className={styles.badgeRow}>
                                    {isTheActiveTerm && (
                                        <span className={styles.activeBadge}>
                                            <ShieldCheck size={10} />
                                            Current Active Policy Term
                                        </span>
                                    )}
                                    {expired && !isTheActiveTerm && (
                                        <span className={styles.expiredBadge}>
                                            Expired
                                        </span>
                                    )}
                                    {term.carrier_status && (
                                        <span className={styles.statusChip}>
                                            {term.carrier_status}
                                        </span>
                                    )}
                                    {term.source_dec_page_id && (
                                        <span className={styles.decPageChip}>
                                            <FileText size={9} />
                                            Dec Page
                                        </span>
                                    )}
                                    {hasDifferentPolicyNumber && (
                                        <span className={styles.mergedChip}>
                                            <GitMerge size={9} />
                                            {term.carrier_policy_number ? 'Term Policy No: ' : 'Merged from '}{termDisplayPolicyNumber}
                                        </span>
                                    )}
                                </div>
 
                                {/* Policy number row (when it has a different suffix/variant) */}
                                {hasDifferentPolicyNumber && (
                                    <div className={styles.policyNumberRow}>
                                        <span className={styles.policyNumberVariant}>
                                            {termDisplayPolicyNumber}
                                        </span>
                                    </div>
                                )}

                                {/* Period */}
                                <div className={styles.periodRow}>
                                    <Calendar size={13} />
                                    <span className={styles.dateRange}>
                                        {fmtDate(term.effective_date)}
                                    </span>
                                    <ArrowRight size={11} className={styles.dateArrow} />
                                    <span className={styles.dateRange}>
                                        {fmtDate(term.expiration_date)}
                                    </span>
                                </div>

                                {/* Key data row */}
                                <div className={styles.dataRow}>
                                    <div className={styles.dataPill}>
                                        <DollarSign size={12} />
                                        <span className={styles.dataLabel}>Premium</span>
                                        <span className={styles.dataValue}>{fmtPremium(term.annual_premium)}</span>
                                    </div>
                                    {term.limit_dwelling && (
                                        <div className={styles.dataPill}>
                                            <span className={styles.dataLabel}>Dwelling</span>
                                            <span className={styles.dataValue}>{term.limit_dwelling}</span>
                                        </div>
                                    )}
                                    {term.deductible && (
                                        <div className={styles.dataPill}>
                                            <span className={styles.dataLabel}>Deductible</span>
                                            <span className={styles.dataValue}>{term.deductible}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Property location */}
                                {term.property_location && (
                                    <div className={styles.locationRow}>
                                        {term.property_location}
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
