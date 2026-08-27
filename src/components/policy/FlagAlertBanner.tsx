'use client';

import React from 'react';
import { Flag, AlertCircle, AlertTriangle, Info, ArrowRight } from 'lucide-react';
import { PolicyFlagRow } from '@/lib/api';
import styles from './FlagAlertBanner.module.css';

interface FlagAlertBannerProps {
    flags: PolicyFlagRow[];
    onViewFlags: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#3b82f6',
};

const PRIORITY_ORDER: Record<string, number> = {
    high: 0,
    medium: 1,
    low: 2,
};

export function FlagAlertBanner({ flags, onViewFlags }: FlagAlertBannerProps) {
    // Only show open flags
    const openFlags = flags.filter(
        f => (!f.status && !f.resolved_at) || f.status === 'open'
    );

    if (openFlags.length === 0) return null;

    // Severity counts
    const counts: Record<string, number> = {};
    openFlags.forEach(f => {
        counts[f.severity] = (counts[f.severity] || 0) + 1;
    });

    // Determine highest severity for accent color
    const hasCritical = false; // No more critical tier
    const hasHigh = (counts['high'] || 0) > 0;
    const hasMedium = (counts['medium'] || 0) > 0;

    const highestPriority = hasHigh
        ? 'high'
        : hasMedium
            ? 'medium'
            : 'low';

    // Accent bar class
    const accentClass = {
        high: styles.accentBarCritical,
        medium: styles.accentBarHigh,
        low: styles.accentBarInfo,
    }[highestPriority];

    // Banner severity class — drives entire theme
    const severityMap: Record<string, string> = {
        high: styles.bannerCritical,
        medium: styles.bannerHigh,
        low: styles.bannerInfo,
    };

    const bannerClass = [styles.banner, severityMap[highestPriority] || styles.bannerCritical]
        .filter(Boolean)
        .join(' ');

    // Severity chips to render
    const chipEntries = Object.entries(counts)
        .sort((a, b) => (PRIORITY_ORDER[a[0]] ?? 99) - (PRIORITY_ORDER[b[0]] ?? 99));

    const chipClass: Record<string, string> = {
        high: styles.chipCritical,
        medium: styles.chipHigh,
        low: styles.chipInfo,
    };

    const chipIcon: Record<string, React.ReactNode> = {
        high: <AlertCircle size={11} />,
        medium: <AlertTriangle size={11} />,
        low: <Info size={11} />,
    };

    // Top flag previews — sorted by severity, show up to 3
    const sortedFlags = [...openFlags].sort(
        (a, b) => (PRIORITY_ORDER[a.severity] ?? 99) - (PRIORITY_ORDER[b.severity] ?? 99)
    );
    const previewFlags = sortedFlags.slice(0, 3);
    const remainingCount = openFlags.length - previewFlags.length;

    return (
        <div 
            className={bannerClass}
            onClick={onViewFlags}
            style={{ cursor: 'pointer' }}
            title="View all flags"
        >
            <div className={`${styles.accentBar} ${accentClass}`} />

            <div className={styles.body}>
                <div className={styles.bodyLeft}>
                    {/* Count Badge */}
                    <div className={styles.countBadge}>
                        <Flag size={18} className={styles.countIcon} />
                        <span className={styles.countNumber}>{openFlags.length}</span>
                    </div>

                    {/* Info Area */}
                    <div className={styles.infoArea}>
                        <div className={styles.infoTopRow}>
                            <span className={styles.infoTitle}>
                                {openFlags.length === 1 ? '1 Open Flag' : `${openFlags.length} Open Flags`}
                            </span>

                            {/* Severity chips */}
                            <div className={styles.severityChips}>
                                {chipEntries.map(([sev, count]) => (
                                    <span
                                        key={sev}
                                        className={`${styles.severityChip} ${chipClass[sev] || ''}`}
                                    >
                                        {chipIcon[sev]}
                                        {count} {sev}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Flag title previews */}
                        <div className={styles.flagPreviews}>
                            {previewFlags.map((f, i) => (
                                <React.Fragment key={f.id}>
                                    {i > 0 && <span className={styles.previewSeparator}>·</span>}
                                    <span className={styles.flagPreview}>
                                        <span
                                            className={styles.flagPreviewDot}
                                            style={{ background: PRIORITY_COLORS[f.severity] || '#64748b' }}
                                        />
                                        <span className={styles.flagPreviewText}>{f.title}</span>
                                    </span>
                                </React.Fragment>
                            ))}
                            {remainingCount > 0 && (
                                <span className={styles.flagPreviewMore}>
                                    +{remainingCount} more
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* CTA */}
                <button className={styles.ctaButton} onClick={onViewFlags}>
                    View All Flags
                    <ArrowRight size={14} />
                </button>
            </div>
        </div>
    );
}
