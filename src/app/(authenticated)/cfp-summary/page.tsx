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

// Dynamic current date defaults
const currentYearStr = String(new Date().getFullYear());
const currentMonthStr = String(new Date().getMonth() + 1);

// In-memory cache for 0ms instantaneous page transitions & SWR revalidation
interface CacheEntry {
    families: CFPFamily[];
    total_terms: number;
    total_families: number;
    timestamp: number;
}
const globalCFPCache = new Map<string, CacheEntry>();
let globalCFPStats: CFPSummaryStats | null = null;
let globalCFPStatsTime = 0;
const CACHE_TTL_MS = 45_000; // 45s cache

function CFPSummaryContent() {
    const [stats, setStats] = useState<CFPSummaryStats | null>(() => globalCFPStats);
    const [statsLoading, setStatsLoading] = useState(() => !globalCFPStats);

    const abortControllerRef = useRef<AbortController | null>(null);
    const requestIdRef = useRef(0);

    // Filters with current month/year defaults covering today's date
    const [year, setYearState] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('ccn_cfp_summary_year');
            if (saved && saved !== 'all' && saved !== '' && saved !== 'undefined') return saved;
        }
        return currentYearStr;
    });

    const [month, setMonthState] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('ccn_cfp_summary_month');
            if (saved && saved !== 'all' && saved !== '' && saved !== 'undefined') return saved;
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

    const initialCacheKey = `${year || currentYearStr}_${month || currentMonthStr}__${view}`;
    const initialCached = globalCFPCache.get(initialCacheKey);

    const [families, setFamilies] = useState<CFPFamily[]>(() => initialCached?.families || []);
    const [dataLoading, setDataLoading] = useState(() => !initialCached);
    const [totalTerms, setTotalTerms] = useState(() => initialCached?.total_terms || 0);
    const [totalFamilies, setTotalFamilies] = useState(() => initialCached?.total_families || 0);

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

    // Fetch Stats with caching
    const fetchStats = useCallback(async () => {
        if (globalCFPStats && Date.now() - globalCFPStatsTime < CACHE_TTL_MS) {
            setStats(globalCFPStats);
            setStatsLoading(false);
            return;
        }

        if (!globalCFPStats) setStatsLoading(true);
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
                globalCFPStats = json.stats;
                globalCFPStatsTime = Date.now();
                setStats(json.stats);
            }
        } catch (err) {
            logger.error('CFPSummary', 'Failed to fetch stats', { error: String(err) });
        } finally {
            setStatsLoading(false);
        }
    }, []);

    // Fetch Data with cancellation, SWR cache, and sequence tracking
    const fetchData = useCallback(async () => {
        const cacheKey = `${year}_${month}_${search}_${view}`;
        const cached = globalCFPCache.get(cacheKey);

        if (cached) {
            setFamilies(cached.families);
            setTotalTerms(cached.total_terms);
            setTotalFamilies(cached.total_families);
            setDataLoading(false);
            // If cache is fresh, skip background fetch
            if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
                return;
            }
        } else {
            setDataLoading(true);
        }

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const currentRequestId = ++requestIdRef.current;

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
                const fams = json.families || [];
                const totTerms = json.total_terms || 0;
                const totFams = json.total_families || 0;

                globalCFPCache.set(cacheKey, {
                    families: fams,
                    total_terms: totTerms,
                    total_families: totFams,
                    timestamp: Date.now(),
                });

                setFamilies(fams);
                setTotalTerms(totTerms);
                setTotalFamilies(totFams);
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
        }, 100);
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
