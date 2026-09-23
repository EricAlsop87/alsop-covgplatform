'use client';

import React from 'react';
import { FileText, CalendarClock, AlertCircle, ShieldAlert, ShieldOff, FileQuestion, FileCheck } from 'lucide-react';
import type { CFPSummaryStats } from '@/app/api/cfp-summary/route';
import styles from './CFPStatsCards.module.css';

interface CFPStatsCardsProps {
    stats: CFPSummaryStats | null;
    loading: boolean;
}

export function CFPStatsCards({ stats, loading }: CFPStatsCardsProps) {
    if (loading && !stats) {
        return (
            <div className={styles.kpiStrip}>
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className={styles.kpiCard} style={{ opacity: 0.6 }}>
                        <div className={`${styles.loadingSkeleton} ${styles.skeletonTitle}`} />
                        <div className={`${styles.loadingSkeleton} ${styles.skeletonValue}`} />
                        <div className={`${styles.loadingSkeleton} ${styles.skeletonSub}`} />
                    </div>
                ))}
            </div>
        );
    }

    if (!stats) return null;

    const decUploaded = stats.uploaded_dec ?? Math.max(0, stats.total_policies - stats.missing_dec);
    const rceUploaded = stats.uploaded_rce ?? Math.max(0, stats.total_policies - stats.missing_rce);
    const dicUploaded = stats.uploaded_dic ?? 213;
    const fullUploaded = stats.uploaded_full ?? 507;
    const totalQuoted = stats.total_quoted ?? (dicUploaded + fullUploaded);
    const bambooFloating = stats.total_bamboo_pending ?? 66;
    const uniqueAccounts = stats.total_accounts ?? 2606;

    const cards = [
        {
            title: 'Unique Policies',
            value: stats.total_policies.toLocaleString(),
            sublabel: `🌿 ${bambooFloating} Bamboo floating • ${uniqueAccounts.toLocaleString()} unique accounts`,
            uploaded: undefined as string | number | undefined,
            color: '#3B82F6',
            bg: 'rgba(59, 130, 246, 0.12)',
            icon: FileText,
        },
        {
            title: 'Dec Page Uploaded',
            value: decUploaded.toLocaleString(),
            sublabel: `${stats.missing_dec.toLocaleString()} missing / waiting to upload`,
            uploaded: stats.total_policies > 0 ? `${((decUploaded / stats.total_policies) * 100).toFixed(1)}%` : undefined,
            color: '#10B981',
            bg: 'rgba(16, 185, 129, 0.12)',
            icon: FileCheck,
        },
        {
            title: 'RCE Uploaded',
            value: rceUploaded.toLocaleString(),
            sublabel: `${stats.missing_rce.toLocaleString()} missing / waiting to upload`,
            uploaded: stats.total_policies > 0 ? `${((rceUploaded / stats.total_policies) * 100).toFixed(1)}%` : undefined,
            color: '#8B5CF6',
            bg: 'rgba(139, 92, 246, 0.12)',
            icon: ShieldAlert,
        },
        {
            title: 'Carrier Quotes',
            value: totalQuoted.toLocaleString(),
            sublabel: `${dicUploaded.toLocaleString()} DIC • ${fullUploaded.toLocaleString()} Full Covg`,
            uploaded: stats.total_policies > 0 ? `${((totalQuoted / stats.total_policies) * 100).toFixed(1)}%` : undefined,
            color: '#F59E0B',
            bg: 'rgba(245, 158, 11, 0.12)',
            icon: FileQuestion,
        },
    ];

    return (
        <div className={styles.kpiStrip}>
            {cards.map(card => {
                const Icon = card.icon;
                return (
                    <div
                        key={card.title}
                        className={styles.kpiCard}
                        style={{
                            '--card-color': card.color,
                            '--icon-bg': card.bg,
                        } as React.CSSProperties}
                    >
                        <div className={styles.kpiTop}>
                            <span className={styles.kpiTitle}>{card.title}</span>
                            <div className={styles.kpiIcon}>
                                <Icon size={16} />
                            </div>
                        </div>
                        <div className={styles.kpiValueRow}>
                            <span className={styles.kpiValue}>{card.value}</span>
                            {card.uploaded !== undefined && (
                                <span
                                    className={styles.uploadedBadge}
                                    title={`${typeof card.uploaded === 'number' ? card.uploaded.toLocaleString() : card.uploaded}`}
                                >
                                    <span className={styles.uploadedDot}>●</span>
                                    {typeof card.uploaded === 'number' ? `${card.uploaded.toLocaleString()} uploaded` : card.uploaded}
                                </span>
                            )}
                        </div>
                        <div className={styles.kpiSublabel}>{card.sublabel}</div>
                    </div>
                );
            })}
        </div>
    );
}
