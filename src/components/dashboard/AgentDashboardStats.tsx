'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Flag, ShieldAlert, Home, ZapOff, CalendarClock, FileText, Clock } from 'lucide-react';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import styles from './AgentDashboardStats.module.css';

export function AgentDashboardStats() {
    const router = useRouter();
    const { stats, loading } = useDashboardStats();

    const kpiCards = stats ? [
        {
            title: 'Active Policies',
            value: stats.totalPolicies,
            sublabel: `${stats.pendingReview} pending review`,
            color: '#2243B6',
            bg: 'rgba(34,67,182,0.08)',
            icon: FileText,
            action: '/dashboard',
        },
        {
            title: 'High Priority Flags',
            value: stats.highPolicies,
            sublabel: `${stats.totalHighFlags} total flags`,
            color: '#ef4444',
            bg: 'rgba(239,68,68,0.08)',
            icon: Flag,
            action: '/flags?priority=high',
        },
        {
            title: 'DIC Not on File',
            value: stats.missingDic,
            sublabel: 'Policies without DIC coverage',
            color: '#8b5cf6',
            bg: 'rgba(139,92,246,0.08)',
            icon: ShieldAlert,
            action: '/dashboard?flag=NO_DIC',
        },
        {
            title: 'Other Structures $0',
            value: stats.otherStructures,
            sublabel: 'AI-detected structures, no coverage',
            color: '#f97316',
            bg: 'rgba(249,115,22,0.08)',
            icon: Home,
            action: '/dashboard?flag=OTHER_STRUCTURES_ZERO',
        },
        {
            title: 'Missing Property Data',
            value: stats.unenriched,
            sublabel: 'Missing property insights',
            color: '#3b82f6',
            bg: 'rgba(59,130,246,0.08)',
            icon: ZapOff,
            action: '/dashboard?enrichment=not_enriched',
        },
        {
            title: 'Expiring ≤14 Days',
            value: stats.renewals14Days,
            sublabel: 'Renewing soon',
            color: '#06b6d4',
            bg: 'rgba(6,182,212,0.08)',
            icon: CalendarClock,
            action: '/dashboard?renewal_window=14',
        },
    ] : [];

    if (loading && !stats) {
        return (
            <div className={styles.kpiStrip}>
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className={styles.kpiCard} style={{ opacity: 0.5, pointerEvents: 'none' }}>
                        <div className={`${styles.loadingSkeleton} ${styles.skeletonTitle}`} />
                        <div className={`${styles.loadingSkeleton} ${styles.skeletonValue}`} />
                        <div className={`${styles.loadingSkeleton} ${styles.skeletonSub}`} />
                    </div>
                ))}
            </div>
        );
    }

    if (!stats) return null;

    return (
        <div className={styles.kpiStrip}>
            {kpiCards.map((card, idx) => {
                const Icon = card.icon;
                return (
                    <div
                        key={idx}
                        className={styles.kpiCard}
                        style={{ '--card-color': card.color, '--icon-bg': card.bg } as React.CSSProperties}
                        onClick={() => router.push(card.action)}
                        title={card.title}
                    >
                        <div className={styles.kpiTop}>
                            <span className={styles.kpiTitle}>{card.title}</span>
                            <div className={styles.kpiIcon}>
                                <Icon size={14} />
                            </div>
                        </div>
                        <div className={styles.kpiValue}>{card.value.toLocaleString()}</div>
                        <div className={styles.kpiSub}>{card.sublabel}</div>
                    </div>
                );
            })}
        </div>
    );
}
