'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card/Card';
import { Eye, AlertTriangle, MessageSquare, ExternalLink, Zap, CheckCircle2 } from 'lucide-react';
import { PolicyReportRow, getLatestReportConfigVersion } from '@/lib/api';
import styles from './AIReport.module.css';

interface AgentReviewPanelProps {
    reportRow?: PolicyReportRow | null;
    reportLink?: string;
}

export function AgentReviewPanel({ reportRow, reportLink }: AgentReviewPanelProps) {
    const ai = reportRow?.ai_insights;
    const [isStale, setIsStale] = useState(false);

    // Check if report is stale (generated before config change)
    useEffect(() => {
        if (!reportRow?.created_at) return;
        getLatestReportConfigVersion().then(config => {
            if (config?.changed_at && reportRow.created_at) {
                setIsStale(new Date(reportRow.created_at) < new Date(config.changed_at));
            }
        });
    }, [reportRow?.created_at]);

    // Merge recommendations + action_items + data_gaps into unified action list
    const actions: Array<{ text: string; type: string; urgency: string }> = [];

    // Recommendations → actions
    (ai?.recommendations || []).forEach((r: any) => {
        actions.push({
            text: r.text,
            type: r.category,
            urgency: r.priority === 1 ? 'now' : r.priority === 2 ? 'before_renewal' : 'future',
        });
    });

    // Action items → actions
    (ai?.action_items || []).forEach((a: any) => {
        // Skip duplicates (if rec text ≈ action item text)
        if (!actions.some(x => x.text.toLowerCase().includes(a.item.toLowerCase().slice(0, 20)))) {
            actions.push({ text: a.item, type: a.type, urgency: a.urgency === 'before_renewal' ? 'before_renewal' : a.urgency === 'at_renewal' ? 'before_renewal' : 'future' });
        }
    });

    // Data gaps → actions (framed as things to verify)
    (ai?.data_gaps || []).forEach((g: any) => {
        actions.push({ text: `${g.field}: ${g.suggestion}`, type: 'verify', urgency: 'before_renewal' });
    });

    // Property observations (agent-only)
    const propertyObs = (ai?.property_observations || []).filter((o: any) => o.discrepancy);
    const internalNotes = ai?.internal_notes || '';
    const hasContent = actions.length > 0 || propertyObs.length > 0 || internalNotes;

    if (!hasContent && !reportRow) {
        return (
            <Card className={styles.container}>
                <div className={styles.header}>
                    <Eye className={styles.aiIcon} size={20} />
                    <h2>Internal Review</h2>
                </div>
                <div className={styles.emptyState}>
                    <p>Generate a report to populate agent suggestions and review data.</p>
                </div>
            </Card>
        );
    }

    const typeIcon = (t: string) => {
        switch (t) {
            case 'verify': return '🔍';
            case 'discuss': return '💬';
            case 'review': return '📋';
            case 'confirm': return '✓';
            case 'update': return '✏️';
            default: return '→';
        }
    };

    // Group actions by urgency
    const grouped = actions.reduce((acc, a) => {
        const key = a.urgency;
        if (!acc[key]) acc[key] = [];
        acc[key].push(a);
        return acc;
    }, {} as Record<string, typeof actions>);

    const nowItems = grouped['now'] || [];
    const beforeRenewalItems = grouped['before_renewal'] || [];
    const futureItems = grouped['future'] || [];

    return (
        <Card className={styles.container}>
            <div className={styles.header}>
                <Zap className={styles.aiIcon} size={18} />
                <h2>Agent Action Items</h2>
                {isStale && (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        fontSize: '0.65rem', fontWeight: 600, color: '#92400e',
                        background: '#fef3c7', border: '1px solid #fde68a',
                        borderRadius: '4px', padding: '0.15rem 0.45rem',
                    }}>
                        ⚠ Report outdated
                    </span>
                )}
                {reportLink && (
                    <a href={reportLink} className={styles.reportLink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={12} />
                        View Client Report
                    </a>
                )}
            </div>

            <div className={styles.boardGrid}>
                {/* ── Column 1: Immediate Action ── */}
                <div className={styles.boardColumn}>
                    <div className={styles.columnHeader} style={{ color: '#ef4444' }}>
                        <span className={styles.urgencyDot} style={{ background: '#ef4444' }} />
                        Immediate Action
                        <span className={styles.countBadge}>{nowItems.length + propertyObs.length}</span>
                    </div>
                    <div className={styles.columnBody}>
                        {nowItems.map((item, idx) => (
                            <div key={idx} className={styles.actionCard}>
                                <span className={styles.actionIcon}>{typeIcon(item.type)}</span>
                                <span className={styles.actionText}>{item.text}</span>
                            </div>
                        ))}
                        
                        {propertyObs.length > 0 && (
                            <div className={styles.conflictGroup}>
                                <div className={styles.sectionDivider}>
                                    <AlertTriangle size={11} />
                                    Data Conflicts
                                </div>
                                {propertyObs.map((obs: any, idx: number) => (
                                    <div key={idx} className={styles.conflictCard}>
                                        <div className={styles.actionText}>{obs.observation}</div>
                                        <div className={styles.conflictDetail}>
                                            <AlertTriangle size={10} />
                                            {obs.discrepancy}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {nowItems.length === 0 && propertyObs.length === 0 && (
                            <div className={styles.emptyCard}>All clear</div>
                        )}
                    </div>
                </div>

                {/* ── Column 2: Before Renewal ── */}
                <div className={styles.boardColumn}>
                    <div className={styles.columnHeader} style={{ color: '#f59e0b' }}>
                        <span className={styles.urgencyDot} style={{ background: '#f59e0b' }} />
                        Before Renewal
                        <span className={styles.countBadge}>{beforeRenewalItems.length}</span>
                    </div>
                    <div className={styles.columnBody}>
                        {beforeRenewalItems.map((item, idx) => (
                            <div key={idx} className={styles.actionCard}>
                                <span className={styles.actionIcon}>{typeIcon(item.type)}</span>
                                <span className={styles.actionText}>{item.text}</span>
                            </div>
                        ))}

                        {beforeRenewalItems.length === 0 && (
                            <div className={styles.emptyCard}>Nothing pending</div>
                        )}
                    </div>
                </div>

                {/* ── Column 3: Review & Notes ── */}
                <div className={styles.boardColumn}>
                    <div className={styles.columnHeader} style={{ color: '#6366f1' }}>
                        <span className={styles.urgencyDot} style={{ background: '#6366f1' }} />
                        Review & Notes
                        <span className={styles.countBadge}>{futureItems.length + (internalNotes ? 1 : 0)}</span>
                    </div>
                    <div className={styles.columnBody}>
                        {futureItems.map((item, idx) => (
                            <div key={idx} className={styles.actionCard}>
                                <span className={styles.actionIcon}>{typeIcon(item.type)}</span>
                                <span className={styles.actionText}>{item.text}</span>
                            </div>
                        ))}

                        {internalNotes && (
                            <div className={styles.notesCard}>
                                <div className={styles.notesHeader}>
                                    <MessageSquare size={11} />
                                    AI Notes
                                </div>
                                {internalNotes}
                            </div>
                        )}

                        {futureItems.length === 0 && !internalNotes && (
                            <div className={styles.emptyCard}>No general notes</div>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}
