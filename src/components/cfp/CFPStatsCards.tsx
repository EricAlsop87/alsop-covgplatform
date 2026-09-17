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
    const dicUploaded = stats.uploaded_dic ?? Math.max(0, stats.total_policies - stats.missing_dic);
    const esUploaded = stats.uploaded_es ?? Math.max(0, stats.total_policies - stats.missing_es);
    const totalDecOverall = stats.total_dec_uploaded_overall ?? decUploaded;
    const totalDecSubmissions = stats.total_dec_submissions ?? totalDecOverall;

    const cards = [
        {
            title: 'CFP Policies',
            value: stats.total_policies.toLocaleString(),
            sublabel: stats.total_bamboo_pending ? `+ ${stats.total_bamboo_pending.toLocaleString()} Bamboo in-force pending` : 'Total tracked policies',
            uploaded: undefined as string | number | undefined,
            color: '#3B82F6',
            bg: 'rgba(59, 130, 246, 0.12)',
            icon: FileText,
        },
        {
            title: 'Expiring This Month',
            value: stats.expiring_this_month.toLocaleString(),
            sublabel: 'Current terms up for renewal',
            uploaded: undefined as string | number | undefined,
            color: '#06B6D4',
            bg: 'rgba(6, 182, 212, 0.12)',
            icon: CalendarClock,
        },
        {
            title: 'Total DEC Uploads',
            value: decUploaded.toLocaleString(),
            sublabel: `${stats.missing_dec.toLocaleString()} missing on active CFP`,
            uploaded: totalDecOverall > decUploaded ? `${totalDecOverall.toLocaleString()} platform total` : `${totalDecSubmissions.toLocaleString()} submitted`,
            color: '#10B981',
            bg: 'rgba(16, 185, 129, 0.12)',
            icon: FileCheck,
        },
        {
            title: 'Missing RCE',
            value: stats.missing_rce.toLocaleString(),
            sublabel: 'Awaiting RCE document',
            uploaded: rceUploaded,
            color: '#A855F7',
            bg: 'rgba(168, 85, 247, 0.12)',
            icon: ShieldAlert,
        },
        {
            title: 'Missing DIC',
            value: stats.missing_dic.toLocaleString(),
            sublabel: 'Needs companion DIC doc',
            uploaded: dicUploaded,
            color: '#EC4899',
            bg: 'rgba(236, 72, 153, 0.12)',
            icon: ShieldOff,
        },
        {
            title: 'Missing Quote / E&S',
            value: stats.missing_es.toLocaleString(),
            sublabel: 'Needs Quote/E&S doc',
            uploaded: esUploaded,
            color: '#F43F5E',
            bg: 'rgba(244, 63, 94, 0.12)',
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
