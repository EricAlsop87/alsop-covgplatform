'use client';

import React from 'react';
import { FileText, CalendarClock, AlertCircle, ShieldAlert, ShieldOff, FileQuestion } from 'lucide-react';
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
    const dicUploaded = stats.uploaded_dic ?? Math.max(0, stats.total_policies - stats.missing_dic);
    const esUploaded = stats.uploaded_es ?? Math.max(0, stats.total_policies - stats.missing_es);

    const cards = [
        {
            title: 'CFP Policies',
            value: stats.total_policies.toLocaleString(),
            sublabel: stats.total_bamboo_pending ? `+ ${stats.total_bamboo_pending.toLocaleString()} Bamboo in-force pending` : 'Total tracked policies',
            uploaded: undefined,
            color: '#2243B6',
            bg: 'rgba(34, 67, 182, 0.1)',
            icon: FileText,
        },
        {
            title: 'Expiring This Month',
            value: stats.expiring_this_month.toLocaleString(),
            sublabel: 'Current terms up for renewal',
            uploaded: undefined,
            color: '#06b6d4',
            bg: 'rgba(6, 182, 212, 0.1)',
            icon: CalendarClock,
        },
        {
            title: 'Missing DEC',
            value: stats.missing_dec.toLocaleString(),
            sublabel: 'Needs Olga to upload DEC',
            uploaded: decUploaded,
            color: '#f59e0b',
            bg: 'rgba(245, 158, 11, 0.1)',
            icon: AlertCircle,
        },
        {
            title: 'Missing RCE',
            value: stats.missing_rce.toLocaleString(),
            sublabel: 'Needs VA to upload RCE',
            uploaded: rceUploaded,
            color: '#8b5cf6',
            bg: 'rgba(139, 92, 246, 0.1)',
            icon: ShieldAlert,
        },
        {
            title: 'Missing DIC',
            value: stats.missing_dic.toLocaleString(),
            sublabel: 'Needs companion DIC doc',
            uploaded: dicUploaded,
            color: '#ec4899',
            bg: 'rgba(236, 72, 153, 0.1)',
            icon: ShieldOff,
        },
        {
            title: 'Missing Quote / E&S',
            value: stats.missing_es.toLocaleString(),
            sublabel: 'Needs Quote/E&S doc',
            uploaded: esUploaded,
            color: '#ef4444',
            bg: 'rgba(239, 68, 68, 0.1)',
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
                                    title={`${card.uploaded.toLocaleString()} documents uploaded on file`}
                                >
                                    <span className={styles.uploadedDot}>●</span>
                                    {card.uploaded.toLocaleString()} uploaded
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
