'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
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

    // Filters
    const [year, setYear] = useState('2026');
    const [month, setMonth] = useState('');
    const [search, setSearch] = useState('');
    const [view, setView] = useState<'active_cfp' | 'bamboo_pipeline' | 'all'>('active_cfp');

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

    // Fetch Data
    const fetchData = useCallback(async () => {
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
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });

            const json = await res.json();
            if (json.success) {
                setFamilies(json.families || []);
                setTotalTerms(json.total_terms || 0);
                setTotalFamilies(json.total_families || 0);
            }
        } catch (err) {
            logger.error('CFPSummary', 'Failed to fetch data', { error: String(err) });
        } finally {
            setDataLoading(false);
        }
    }, [year, month, search, view]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchData();
        }, 200);
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
