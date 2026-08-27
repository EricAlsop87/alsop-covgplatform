'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import styles from './DashboardChart.module.css';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';


interface DayBucket {
    date: Date;
    dayLabel: string;      // "Mon", "Tue", etc.
    dateLabel: string;      // "Mar 6"
    count: number;
    isToday: boolean;
    dateStr: string;        // "2026-03-18" for routing
}

function buildDayBuckets(): DayBucket[] {
    const buckets: DayBucket[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start from this week's Monday
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startMonday = new Date(today);
    startMonday.setDate(today.getDate() + mondayOffset);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // 28 days: this week (Mon-Sun) + next 3 weeks
    for (let i = 0; i < 28; i++) {
        const date = new Date(startMonday);
        date.setDate(startMonday.getDate() + i);

        buckets.push({
            date,
            dayLabel: dayNames[date.getDay()],
            dateLabel: `${monthNames[date.getMonth()]} ${date.getDate()}`,
            count: 0,
            isToday: date.getTime() === today.getTime(),
            dateStr: date.toISOString().split('T')[0],
        });
    }
    return buckets;
}

export function DashboardChart() {
    const router = useRouter();
    const [buckets, setBuckets] = useState<DayBucket[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'chart' | 'grid'>(() => {
        if (typeof window === 'undefined') return 'chart';
        return (localStorage.getItem('cfp_renewal_viewMode') as 'chart' | 'grid') || 'chart';
    });
    // 'all' = every upcoming renewal, 'unworked' = exclude already actioned policies
    const [workFilter, setWorkFilter] = useState<'all' | 'unworked'>(() => {
        if (typeof window === 'undefined') return 'all';
        return (localStorage.getItem('cfp_renewal_workFilter') as 'all' | 'unworked') || 'all';
    });

    const handleViewModeChange = (mode: 'chart' | 'grid') => {
        setViewMode(mode);
        try { localStorage.setItem('cfp_renewal_viewMode', mode); } catch {}
    };

    const handleWorkFilterChange = (filter: 'all' | 'unworked') => {
        setWorkFilter(filter);
        try { localStorage.setItem('cfp_renewal_workFilter', filter); } catch {}
    };

    useEffect(() => {
        async function fetchRenewals() {
            setLoading(true);
            const dayBuckets = buildDayBuckets();
            const startDate = dayBuckets[0].date.toISOString().split('T')[0];
            const endDate = new Date(dayBuckets[dayBuckets.length - 1].date);
            endDate.setDate(endDate.getDate() + 1);
            const endDateStr = endDate.toISOString().split('T')[0];

            // Statuses that mean the policy has already been worked/resolved
            const WORKED_STATUSES = ['renewed', 'non_renewed', 'cancelled', 'expired'];

            try {
                let data: { expiration_date: string }[] | null = null;
                let error: { message: string } | null = null;

                if (workFilter === 'unworked') {
                    // Join to policies and exclude already-actioned statuses
                    const result = await supabase
                        .from('policy_terms')
                        .select('expiration_date, policies!inner(status)')
                        .eq('is_current', true)
                        .gte('expiration_date', startDate)
                        .lt('expiration_date', endDateStr)
                        .not('policies.status', 'in', `(${WORKED_STATUSES.join(',')})`);
                    data = result.data as { expiration_date: string }[] | null;
                    error = result.error;
                } else {
                    const result = await supabase
                        .from('policy_terms')
                        .select('expiration_date')
                        .eq('is_current', true)
                        .gte('expiration_date', startDate)
                        .lt('expiration_date', endDateStr);
                    data = result.data;
                    error = result.error;
                }

                if (error) {
                    logger.error('DashboardChart', 'Error fetching renewal data:', error)
                    setBuckets(dayBuckets);
                    setLoading(false);
                    return;
                }

                if (data) {
                    for (const term of data) {
                        if (!term.expiration_date) continue;
                        const expDate = new Date(term.expiration_date + 'T00:00:00');

                        for (const bucket of dayBuckets) {
                            if (expDate.getTime() === bucket.date.getTime()) {
                                bucket.count += 1;
                                break;
                            }
                        }
                    }
                }

                setBuckets(dayBuckets);
            } catch (err) {
                logger.error('DashboardChart', 'Error fetching renewals:', { error: err instanceof Error ? err.message : String(err) })
                setBuckets(dayBuckets);
            }
            setLoading(false);
        }

        fetchRenewals();
    }, [workFilter]);

    const totalRenewals = useMemo(() => buckets.reduce((sum, b) => sum + b.count, 0), [buckets]);
    const maxValue = useMemo(() => Math.max(...buckets.map(b => b.count), 1), [buckets]);

    const thisWeek = buckets.slice(0, 7);
    const nextWeek = buckets.slice(7, 14);
    const thisWeekTotal = thisWeek.reduce((s, b) => s + b.count, 0);
    const nextWeekTotal = nextWeek.reduce((s, b) => s + b.count, 0);

    const handleBarClick = (day: DayBucket) => {
        if (day.count === 0) return;
        // Navigate to /flags filtered to policies expiring on that specific date
        // Use expiration_from and expiration_to for a single-day range
        const nextDay = new Date(day.date);
        nextDay.setDate(nextDay.getDate() + 1);
        const toStr = nextDay.toISOString().split('T')[0];
        router.push(`/dashboard?expiration_from=${day.dateStr}&expiration_to=${toStr}`);
    };

    const renderBar = (day: DayBucket, i: number) => {
        const pct = maxValue > 0 ? (day.count / maxValue) * 100 : 0;
        const isClickable = day.count > 0;
        return (
            <div
                key={i}
                className={`${styles.barGroup} ${day.isToday ? styles.todayGroup : ''} ${isClickable ? styles.clickableBar : ''}`}
                onClick={() => handleBarClick(day)}
            >
                {day.count > 0 && (
                    <div className={styles.barCount}>{day.count}</div>
                )}
                <div className={styles.bars}>
                    <div
                        className={`${styles.bar} ${day.isToday ? styles.todayBar : ''}`}
                        style={{
                            height: `${Math.max(pct, day.count > 0 ? 8 : 2)}%`,
                        }}
                    ></div>
                </div>
                <div className={`${styles.barLabel} ${day.isToday ? styles.todayLabel : ''}`}>
                    {day.dayLabel}
                </div>
                <div className={styles.barDateLabel}>{day.dateLabel}</div>
            </div>
        );
    };

    const getGridLevel = (count: number, max: number) => {
        if (count === 0) return 0;
        if (max === 0) return 0;
        const ratio = count / max;
        if (ratio <= 0.25) return 1;
        if (ratio <= 0.5) return 2;
        if (ratio <= 0.75) return 3;
        return 4;
    };

    const renderGrid = () => {
        // Break 28 buckets into 4 rows of 7 days
        const weeks = [];
        for (let i = 0; i < 4; i++) {
            weeks.push(buckets.slice(i * 7, (i + 1) * 7));
        }

        return (
            <div className={`${styles.gridContainer} ${viewMode === 'grid' ? styles.slideLeft : ''}`}>
                <div className={styles.gridDaysHeader}>
                    {buckets.slice(0, 7).map(day => (
                        <div key={day.dayLabel} className={styles.gridDayName}>{day.dayLabel}</div>
                    ))}
                </div>
                {weeks.map((week, weekIndex) => (
                    <div key={weekIndex} className={styles.gridRow}>
                        {week.map((day, dayIndex) => {
                            const level = getGridLevel(day.count, maxValue);
                            const levelClass = styles[`gridCellLevel${level}`];
                            
                            return (
                                <div
                                    key={dayIndex}
                                    className={`${styles.gridCell} ${levelClass || ''} ${day.isToday ? styles.gridCellToday : ''}`}
                                    onClick={() => handleBarClick(day)}
                                    title={`${day.count} policies renewing on ${day.dateLabel}`}
                                >
                                    <span className={styles.gridCellDate}>{day.dateLabel}</span>
                                    <span className={styles.gridCellCount}>{day.count}</span>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className={styles.chartContainer}>
            <div className={styles.chartHeader}>
                <div className={styles.chartTitle}>
                    <div className={styles.mainTitle}>Upcoming Renewals</div>
                    <div className={styles.subtitle}>
                        {loading ? 'Loading...' : (
                            <>{totalRenewals} {workFilter === 'unworked' ? 'unworked ' : ''}policies expiring in the next 4 weeks</>
                        )}
                    </div>
                </div>
                <div className={styles.headerControls}>
                    <div className={styles.chartLegend}>
                        <div className={styles.legendItem}>
                            <div className={styles.legendDot} style={{ backgroundColor: '#6366f1' }}></div>
                            <span>Renewals</span>
                        </div>
                    </div>
                    {/* Work Filter Toggle */}
                    <div className={styles.viewToggle}>
                        <div
                            className={styles.toggleIndicator}
                            style={{ transform: workFilter === 'unworked' ? 'translateX(100%)' : 'translateX(0)' }}
                        />
                        <button
                            className={`${styles.toggleBtn} ${workFilter === 'all' ? styles.toggleBtnActive : ''}`}
                            onClick={() => handleWorkFilterChange('all')}
                            title="Show all upcoming renewals"
                        >
                            All
                        </button>
                        <button
                            className={`${styles.toggleBtn} ${workFilter === 'unworked' ? styles.toggleBtnActive : ''}`}
                            onClick={() => handleWorkFilterChange('unworked')}
                            title="Show only renewals not yet worked (excluding renewed, non-renewed, cancelled)"
                        >
                            Pending
                        </button>
                    </div>
                    {/* View Toggle */}
                    <div className={styles.viewToggle}>
                        <div
                            className={styles.toggleIndicator}
                            style={{ transform: viewMode === 'grid' ? 'translateX(100%)' : 'translateX(0)' }}
                        />
                        <button
                            className={`${styles.toggleBtn} ${viewMode === 'chart' ? styles.toggleBtnActive : ''}`}
                            onClick={() => handleViewModeChange('chart')}
                        >
                            Chart
                        </button>
                        <button
                            className={`${styles.toggleBtn} ${viewMode === 'grid' ? styles.toggleBtnActive : ''}`}
                            onClick={() => handleViewModeChange('grid')}
                        >
                            Grid
                        </button>
                    </div>
                </div>
            </div>

            {viewMode === 'chart' ? (
                <div className={`${styles.weeksRow} ${styles.slideRight}`}>
                    {/* This Week */}
                    <div className={styles.weekBlock}>
                        <div className={styles.weekLabel}>
                            This Week
                            <span className={styles.weekCount}>{thisWeekTotal}</span>
                        </div>
                        <div className={styles.chart}>
                            {thisWeek.map((day, i) => renderBar(day, i))}
                        </div>
                    </div>

                    {/* Divider */}
                    <div className={styles.weekDivider}></div>

                    {/* Next Week */}
                    <div className={styles.weekBlock}>
                        <div className={styles.weekLabel}>
                            Next Week
                            <span className={styles.weekCount}>{nextWeekTotal}</span>
                        </div>
                        <div className={styles.chart}>
                            {nextWeek.map((day, i) => renderBar(day, i))}
                        </div>
                    </div>
                </div>
            ) : (
                renderGrid()
            )}

            <div className={styles.chartFooter}>
                <span>DAILY RENEWALS · CLICK A BAR TO VIEW POLICIES</span>
            </div>
        </div>
    );
}
