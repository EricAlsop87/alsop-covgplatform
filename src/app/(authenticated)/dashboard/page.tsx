'use client';

import { useState, useMemo, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AgentDashboardStats } from '@/components/dashboard/AgentDashboardStats';
import { DataTable } from '@/components/dashboard/DataTable';
import { DashboardChart } from '@/components/dashboard/DashboardChart';
import { LineChartKPI } from '@/components/dashboard/LineChartKPI';
import { ActivityTab } from '@/components/dashboard/ActivityTab';
import { CSVUploadModal } from '@/components/dashboard/CSVUploadModal';
import { BatchEnrichModal } from '@/components/dashboard/BatchEnrichModal';
import { Tabs } from '@/components/ui/Tabs/Tabs';
import Link from 'next/link';
import { Button } from '@/components/ui/Button/Button';
import { Upload, Zap, BarChart2, ChevronDown, FileUp } from 'lucide-react';
import { useSidebar } from '@/components/layout/SidebarContext';

const tabs = [
    { id: 'activity', label: 'ACTIVITY' },
];

export default function DashboardPage() {
    return (
        <Suspense fallback={
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading dashboard...
            </div>
        }>
            <DashboardContent />
        </Suspense>
    );
}

function DashboardContent() {
    const searchParams = useSearchParams();
    const [isCSVModalOpen, setIsCSVModalOpen] = useState(false);
    const [isEnrichModalOpen, setIsEnrichModalOpen] = useState(false);
    const [selectedTablePolicyIds, setSelectedTablePolicyIds] = useState<string[]>([]);
    const tableSectionRef = useRef<HTMLDivElement>(null);
    const { isMobile } = useSidebar();
    const [analyticsOpen, setAnalyticsOpen] = useState(true);

    // Read URL params for drill-down filtering
    const expirationFrom = searchParams.get('expiration_from') || '';
    const expirationTo = searchParams.get('expiration_to') || '';
    const statusFilter = searchParams.get('status') || '';
    const renewalWindow = searchParams.get('renewal_window') || '';
    const searchInit = searchParams.get('search') || '';

    const enrichmentFilter = searchParams.get('enrichment') || '';
    const flagFilter = searchParams.get('flag') || '';

    // Compute expiration filter from URL params
    const expirationFilter = useMemo(() => {
        if (renewalWindow) {
            const today = new Date();
            const future = new Date(today);
            future.setDate(future.getDate() + parseInt(renewalWindow));
            return {
                from: today.toISOString().split('T')[0],
                to: future.toISOString().split('T')[0],
            };
        }
        if (expirationFrom || expirationTo) {
            return { from: expirationFrom || undefined, to: expirationTo || undefined };
        }
        return undefined;
    }, [expirationFrom, expirationTo, renewalWindow]);

    const hasDrillDownFilters = !!(expirationFrom || expirationTo || statusFilter || renewalWindow || searchInit || enrichmentFilter || flagFilter);

    const [activeTab, setActiveTab] = useState('activity');

    // Human-readable flag names (match the flag rule registry)
    const FLAG_LABELS: Record<string, string> = {
        'NO_DIC': 'DIC Not on File',
        'OTHER_STRUCTURES_ZERO': 'Other Structures $0',
        'MISSING_POLICY_NUMBER': 'Missing Policy Number',
        'MISSING_PROPERTY_LOCATION': 'Missing Property Location',
        'MISSING_DWELLING_LIMIT': 'Missing Dwelling Limit',
        'MISSING_ORDINANCE_OR_LAW': 'Missing Ordinance or Law',
        'MISSING_EXTENDED_DWELLING': 'Missing Extended Dwelling Coverage',
        'MISSING_DWELLING_REPLACEMENT_COST': 'Missing Dwelling Replacement Cost',
        'MISSING_PERSONAL_PROPERTY_REPLACEMENT_COST': 'Missing Personal Property RC',
        'MISSING_FENCES_COVERAGE': 'Missing Fences Coverage',
        'MISSING_PERSONAL_PROPERTY': 'Missing Personal Property',
        'MISSING_OTHER_STRUCTURES': 'Missing Other Structures',
        'SEVERE_UNDERINSURANCE_ESTIMATE': 'Severe Underinsurance (Modeled Estimate)',
        'DWELLING_RC_INCLUDED_LOW_ORDINANCE': 'RC Included, Low Ordinance/Law',
        'FAIR_RENTAL_VALUE_ZERO_OR_MISSING': 'Fair Rental Value Zero or Missing',
        'LOSS_OF_USE_ZERO_OR_MISSING': 'Loss of Use Zero or Missing',
        'INFLATION_GUARD_NOT_INCLUDED': 'Inflation Guard Not Included',
        'DUPLICATE_ID_IN_TABLE': 'Possible Duplicate Policy',
        'MISSING_PERILS_INSURED': 'Missing Perils Insured Against',
        'MISSING_DEBRIS_REMOVAL': 'Missing Debris Removal',
    };

    // Build a human-readable filter label
    const filterLabel = useMemo(() => {
        if (flagFilter) return FLAG_LABELS[flagFilter] || flagFilter;
        if (renewalWindow) return `Renewing in ${renewalWindow} days`;
        if (expirationFrom && expirationTo) {
            const from = new Date(expirationFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const to = new Date(expirationTo);
            to.setDate(to.getDate() - 1);
            const toStr = to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return from === toStr ? `Expiring on ${from}` : `Expiring ${from} – ${toStr}`;
        }
        if (statusFilter === 'pending_review') return 'Pending review';
        if (statusFilter) return `Status: ${statusFilter}`;
        if (enrichmentFilter === 'not_enriched') return 'Missing Property Data';
        return '';
    }, [expirationFrom, expirationTo, statusFilter, renewalWindow, enrichmentFilter, flagFilter]);

    // Smooth scroll to table when drill-downs fire (not needed anymore since table is at top)
    useEffect(() => {
        if (hasDrillDownFilters && tableSectionRef.current) {
            const timer = setTimeout(() => {
                tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [hasDrillDownFilters]);

    return (
        <main>
            <div style={{ padding: isMobile ? '0.5rem 0' : '1.5rem 1.5rem 2rem' }}>

                {/* ── Page header ── */}
                <header style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'flex-start' : 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    marginBottom: '1.25rem',
                }}>
                    <div>
                        <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-high)', marginBottom: '0.2rem' }}>
                            Agent Dashboard
                        </h1>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Overview of all policies and their status
                        </p>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                        <Link href="/upload-document">
                            <Button size="sm" variant="primary">
                                <FileUp style={{ width: 13, height: 13, marginRight: 5 }} />
                                Upload Document
                            </Button>
                        </Link>
                        <Button variant="outline" size="sm" onClick={() => setIsCSVModalOpen(true)}>
                            <Upload style={{ width: 13, height: 13, marginRight: 5 }} />
                            Upload CSV
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setIsEnrichModalOpen(true)} style={{ color: 'var(--text-muted)' }}>
                            <Zap style={{ width: 13, height: 13, marginRight: 5 }} />
                            Fetch Property Data &amp; Analyze
                        </Button>
                    </div>
                </header>

                {/* ── Compact KPI strip ── */}
                <AgentDashboardStats />

                {/* ── Collapsible analytics section (above table, default open) ── */}
                <div style={{ marginTop: '1.5rem' }}>
                    <button
                        onClick={() => setAnalyticsOpen(v => !v)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            width: '100%', padding: '0.75rem 1rem',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: analyticsOpen ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)',
                            color: 'var(--text-mid)', fontSize: '0.82rem', fontWeight: 600,
                            cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                        }}
                    >
                        <BarChart2 size={15} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                        Analytics &amp; Renewal Charts
                        <ChevronDown
                            size={15}
                            style={{
                                marginLeft: 'auto', color: 'var(--text-muted)',
                                transform: analyticsOpen ? 'rotate(180deg)' : 'none',
                                transition: 'transform 0.2s',
                            }}
                        />
                    </button>
                    {analyticsOpen && (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                            gap: '1.25rem',
                            padding: '1.25rem',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderTop: 'none',
                            borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
                        }}>
                            <div style={{
                                background: 'var(--bg-surface-raised)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--border-default)',
                                padding: '1.25rem',
                                overflow: 'hidden',
                            }}>
                                <DashboardChart />
                            </div>
                            <LineChartKPI />
                        </div>
                    )}
                </div>

                {/* ── Policy table ── */}
                <div ref={tableSectionRef} style={{
                    marginTop: '1.25rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid var(--border-default)',
                    }}>
                        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-high)' }}>
                            All Active Policies
                            {filterLabel && (
                                <span style={{
                                    marginLeft: '0.625rem',
                                    fontSize: '0.72rem',
                                    fontWeight: 500,
                                    color: 'var(--accent-primary)',
                                    background: 'var(--accent-primary-muted)',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '999px',
                                }}>
                                    {filterLabel}
                                </span>
                            )}
                        </h2>
                    </div>
                    <div style={{ padding: '0.75rem 1.25rem 1.25rem' }}>
                        <DataTable
                            initialSearch={searchInit}
                            initialExpirationFilter={expirationFilter}
                            initialStatusFilter={statusFilter}
                            initialFlagFilter={flagFilter || undefined}
                            filterLabel={filterLabel}
                            onSelectionChange={setSelectedTablePolicyIds}
                        />
                    </div>
                </div>

                {/* ── Activity tab (secondary) ── */}
                <div style={{ marginTop: '1.25rem' }}>
                    <Tabs tabs={tabs} defaultTab="activity" onChange={setActiveTab} />
                    {activeTab === 'activity' && <ActivityTab />}
                </div>

            </div>

            <CSVUploadModal isOpen={isCSVModalOpen} onClose={() => setIsCSVModalOpen(false)} />
            <BatchEnrichModal
                isOpen={isEnrichModalOpen}
                onClose={() => setIsEnrichModalOpen(false)}
                selectedPolicyIds={selectedTablePolicyIds}
            />
        </main>
    );
}
