'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CFPStatsCards } from '@/components/cfp/CFPStatsCards';
import { CFPSummaryTable } from '@/components/cfp/CFPSummaryTable';
import type { CFPFamily, CFPSummaryStats } from '@/app/api/cfp-summary/route';
import { ShieldCheck, FileSpreadsheet } from 'lucide-react';
import { logger } from '@/lib/logger';

export default function CFPSummaryPage() {
    return (
        <Suspense
            fallback={
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading CFP Summary...
                </div>
            }
        >
            <CFPSummaryContent />
        </Suspense>
    );
}

function CFPSummaryContent() {
    const [stats, setStats] = useState<CFPSummaryStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);

    const [families, setFamilies] = useState<CFPFamily[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [totalTerms, setTotalTerms] = useState(0);
    const [totalFamilies, setTotalFamilies] = useState(0);

    const abortControllerRef = useRef<AbortController | null>(null);
    const requestIdRef = useRef(0);

    // Dynamic current date defaults
    const currentYearStr = String(new Date().getFullYear());
    const currentMonthStr = String(new Date().getMonth() + 1);

    // Filters with localStorage memory persistence and current month/year defaults
    const [year, setYearState] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('ccn_cfp_summary_year');
            if (saved !== null) return saved;
        }
        return currentYearStr;
    });

    const [month, setMonthState] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('ccn_cfp_summary_month');
            if (saved !== null) return saved;
        }
        return currentMonthStr;
    });

    const [search, setSearch] = useState('');
    const [view, setViewState] = useState<'active_cfp' | 'bamboo_pipeline' | 'all'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('ccn_cfp_summary_view');
            if (saved === 'active_cfp' || saved === 'bamboo_pipeline' || saved === 'all') return saved;
        }
        return 'active_cfp';
    });

    const setYear = useCallback((newYear: string) => {
        setYearState(newYear);
        if (typeof window !== 'undefined') {
            localStorage.setItem('ccn_cfp_summary_year', newYear);
        }
    }, []);

    const setMonth = useCallback((newMonth: string) => {
        setMonthState(newMonth);
        if (typeof window !== 'undefined') {
            localStorage.setItem('ccn_cfp_summary_month', newMonth);
        }
    }, []);

    const setView = useCallback((newView: 'active_cfp' | 'bamboo_pipeline' | 'all') => {
        setViewState(newView);
        if (typeof window !== 'undefined') {
            localStorage.setItem('ccn_cfp_summary_view', newView);
        }
    }, []);

    // Fetch Stats
    const fetchStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch('/api/cfp-summary?stats_only=true', {
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });

            const json = await res.json();
            if (json.success) {
                setStats(json.stats);
            }
        } catch (err) {
            logger.error('CFPSummary', 'Failed to fetch stats', { error: String(err) });
        } finally {
            setStatsLoading(false);
        }
    }, []);

    // Fetch Data with cancellation and sequence tracking
    const fetchData = useCallback(async () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const currentRequestId = ++requestIdRef.current;

        setDataLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const params = new URLSearchParams();
            if (year) params.set('year', year);
            if (month) params.set('month', month);
            if (search) params.set('search', search);
            if (view) params.set('view', view);

            const res = await fetch(`/api/cfp-summary?${params.toString()}`, {
                signal: controller.signal,
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });

            const json = await res.json();
            if (currentRequestId === requestIdRef.current && json.success) {
                setFamilies(json.families || []);
                setTotalTerms(json.total_terms || 0);
                setTotalFamilies(json.total_families || 0);
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') return; // Cancelled normally
            logger.error('CFPSummary', 'Failed to fetch data', { error: String(err) });
        } finally {
            if (currentRequestId === requestIdRef.current) {
                setDataLoading(false);
            }
        }
    }, [year, month, search, view]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchData();
        }, 150);
        return () => clearTimeout(timer);
    }, [fetchData]);

    return (
        <div style={{ padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
                        <div
                            style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '8px',
                                background: 'rgba(34, 67, 182, 0.1)',
                                color: 'var(--color-primary, #2243B6)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <FileSpreadsheet size={20} />
                        </div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-high)', letterSpacing: '-0.02em', margin: 0 }}>
                            CFP Summary
                        </h1>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Overview of California FAIR Plan policy families, renewal chains, and required document tracking.
                    </p>
                </div>
            </div>

            {/* KPI Summary Cards */}
            <CFPStatsCards stats={stats} loading={statsLoading} />

            {/* Main Interactive Table */}
            <CFPSummaryTable
                families={families}
                loading={dataLoading}
                year={year}
                month={month}
                search={search}
                view={view}
                onYearChange={setYear}
                onMonthChange={setMonth}
                onSearchChange={setSearch}
                onViewChange={setView}
                onRefresh={() => {
                    fetchStats();
                    fetchData();
                }}
                totalTerms={totalTerms}
                totalFamilies={totalFamilies}
            />
        </div>
    );
}
