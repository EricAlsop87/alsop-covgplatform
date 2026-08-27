'use client';

import React, { useState, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FlaggedPolicyGroup } from '@/lib/api';
import { useFlags } from '@/hooks/useFlags';
import { Button } from '@/components/ui/Button/Button';
import { ErrorState } from '@/components/shared/ErrorState';
import {
    Flag,
    CheckCircle,
    AlertCircle,
    AlertTriangle,
    Info,
    Search,
    Clock,
    Shield,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    RefreshCw,
    Building2,
    User,
    Calendar,
    Filter,
    X,
} from 'lucide-react';
import styles from './page.module.css';

// ─── Constants ───

const PRIORITY_COLORS: Record<string, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#3b82f6',
};

const PRIORITY_ICONS: Record<string, React.ReactNode> = {
    high: <AlertCircle size={13} />,
    medium: <AlertTriangle size={13} />,
    low: <Info size={13} />,
};

const RENEWAL_FILTERS = [
    { key: '7', label: '7 days' },
    { key: '14', label: '14 days' },
    { key: '21', label: '21 days' },
    { key: '30', label: '30 days' },
];

// ─── Helpers ───

function formatDate(d?: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

function daysUntil(d?: string | null): number | null {
    if (!d) return null;
    const diff = (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return Math.ceil(diff);
}

function expirationClass(d?: string | null): string {
    const days = daysUntil(d);
    if (days === null) return '';
    if (days < 0) return styles.expired;
    if (days <= 14) return styles.expiringSoon;
    if (days <= 30) return styles.expiringModerate;
    return '';
}

const ROWS_PER_PAGE = 50;

// ─── Memoized Policy Row ───

interface PolicyRowProps {
    group: FlaggedPolicyGroup;
    isExpanded: boolean;
    onToggle: (id: string) => void;
    onNavigate: (id: string) => void;
}

const PolicyRow = React.memo(function PolicyRow({ group, isExpanded, onToggle, onNavigate }: PolicyRowProps) {
    const sevColor = PRIORITY_COLORS[group.max_severity] || '#64748b';
    const preview = group.flags.slice(0, 3);
    const daysLeft = daysUntil(group.expiration_date);

    return (
        <div className={`${styles.policyRow} ${isExpanded ? styles.policyRowExpanded : ''}`}>
            {/* Main row */}
            <div className={styles.policyRowMain}>
                <div className={styles.policyRowLeft} style={{ borderLeftColor: sevColor }} />
                <button
                    className={styles.expandBtn}
                    onClick={() => onToggle(group.policy_id)}
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div
                    className={styles.policyRowBody}
                    onClick={() => onNavigate(group.policy_id)}
                >
                    <div className={styles.policyMeta}>
                        <span className={styles.policyNumber}>
                            <Shield size={12} /> {group.policy_number}
                        </span>
                        <span className={styles.insuredName}>{group.named_insured}</span>
                        {group.carrier_name && (
                            <span className={styles.carrierName}>{group.carrier_name}</span>
                        )}
                        {group.office && (
                            <span className={styles.officeBadge}>
                                <Building2 size={11} /> {group.office}
                            </span>
                        )}
                        {group.sold_by && (
                            <span className={styles.agentBadge}>
                                <User size={11} /> {group.sold_by}
                            </span>
                        )}
                        <span className={`${styles.expDate} ${expirationClass(group.expiration_date)}`}>
                            <Clock size={11} />
                            {group.expiration_date
                                ? `Rnwl ${formatDate(group.expiration_date)}${daysLeft !== null ? ` (${daysLeft < 0 ? 'expired' : `${daysLeft}d`})` : ''}`
                                : 'No expiration'}
                        </span>
                    </div>
                    <div className={styles.policyFlags}>
                        <div className={styles.sevCounts}>
                            <span className={styles.totalBadge}>{group.total_flags} {group.total_flags === 1 ? 'flag' : 'flags'}</span>
                            {group.high_count > 0 && (
                                <span className={styles.sevMini} style={{ color: PRIORITY_COLORS.high }}>
                                    {PRIORITY_ICONS.high} {group.high_count}
                                </span>
                            )}
                            {group.medium_count > 0 && (
                                <span className={styles.sevMini} style={{ color: PRIORITY_COLORS.medium }}>
                                    {PRIORITY_ICONS.medium} {group.medium_count}
                                </span>
                            )}
                        </div>
                        <div className={styles.flagPreview}>
                            {preview.map((f, fi) => (
                                <span
                                    key={`${f.id}-preview-${fi}`}
                                    className={styles.previewChip}
                                    style={{ borderLeftColor: PRIORITY_COLORS[f.severity] || '#64748b' }}
                                >
                                    {f.title}
                                </span>
                            ))}
                            {group.flags.length > 3 && (
                                <span className={styles.moreChip}>+{group.flags.length - 3} more</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
                <div className={styles.expandedPanel}>
                    <div className={styles.expandedHeader}>
                        <span>All open flags for {group.policy_number}</span>
                        <button
                            className={styles.openPolicyBtn}
                            onClick={() => onNavigate(group.policy_id)}
                        >
                            Open Policy <ExternalLink size={12} />
                        </button>
                    </div>
                    <div className={styles.expandedFlags}>
                        {group.flags.map((f, fi) => (
                            <div key={`${f.id}-detail-${fi}`} className={styles.expandedFlagRow}>
                                <span
                                    className={styles.flagSevBadge}
                                    style={{ backgroundColor: `${PRIORITY_COLORS[f.severity]}18`, color: PRIORITY_COLORS[f.severity] }}
                                >
                                    {PRIORITY_ICONS[f.severity]} {f.severity}
                                </span>
                                <span className={styles.flagTitle}>{f.title}</span>
                                {f.category && (
                                    <span className={styles.flagCat}>{f.category.replace(/_/g, ' ')}</span>
                                )}
                                {f.message && (
                                    <span className={styles.flagMsg}>{f.message}</span>
                                )}
                                {f.client_id && !f.policy_term_id && !f.policy_id && (
                                    <span className={styles.clientFlagTag}>Client Flag</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

// ─── Main Component ───

export default function FlagsPage() {
    return (
        <Suspense fallback={
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading flags...
            </div>
        }>
            <FlagsContent />
        </Suspense>
    );
}

function FlagsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const { groups, loading, refresh, error } = useFlags();

    // Filters — initialized from URL query params
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const [priorityFilter, setPriorityFilter] = useState(searchParams.get('priority') || '');
    const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '');
    const [officeFilter, setOfficeFilter] = useState(searchParams.get('office') || '');
    const [renewalDays, setRenewalDays] = useState(searchParams.get('renewal_window') || '');
    const [codeFilter, setCodeFilter] = useState(searchParams.get('code') || '');
    const [expirationFrom, setExpirationFrom] = useState(searchParams.get('expiration_from') || '');
    const [expirationTo, setExpirationTo] = useState(searchParams.get('expiration_to') || '');

    // Extract available offices + categories for filter dropdowns
    const { offices, categories } = useMemo(() => {
        const officeSet = new Set<string>();
        const catSet = new Set<string>();
        for (const g of groups) {
            if (g.office) officeSet.add(g.office);
            for (const f of g.flags) {
                if (f.category) catSet.add(f.category);
            }
        }
        return {
            offices: Array.from(officeSet).sort(),
            categories: Array.from(catSet).sort(),
        };
    }, [groups]);

    // Filtered groups
    const filtered = useMemo(() => {
        return groups.filter(g => {
            // Search
            if (searchTerm) {
                const q = searchTerm.toLowerCase();
                const matches =
                    g.policy_number.toLowerCase().includes(q) ||
                    g.named_insured.toLowerCase().includes(q) ||
                    (g.carrier_name || '').toLowerCase().includes(q);
                if (!matches) return false;
            }

            // Priority
            if (priorityFilter && g.max_severity !== priorityFilter) {
                // Also check if any flag in the group matches the priority
                const hasMatchingPriority = g.flags.some(f => f.severity === priorityFilter);
                if (!hasMatchingPriority) return false;
            }

            // Category
            if (categoryFilter) {
                const hasMatchingCat = g.flags.some(f => f.category === categoryFilter);
                if (!hasMatchingCat) return false;
            }

            // Office
            if (officeFilter && g.office !== officeFilter) return false;

            // Flag code (e.g. ?code=NO_DIC)
            if (codeFilter) {
                const hasMatchingCode = g.flags.some(f => f.code === codeFilter);
                if (!hasMatchingCode) return false;
            }

            // Renewal date window
            if (renewalDays) {
                const days = daysUntil(g.expiration_date);
                if (days === null || days < 0) return false;
                if (days > parseInt(renewalDays)) return false;
            }

            // Exact expiration date range (from chart bar clicks)
            if (expirationFrom || expirationTo) {
                if (!g.expiration_date) return false;
                const expMs = new Date(g.expiration_date).getTime();
                if (expirationFrom && expMs < new Date(expirationFrom).getTime()) return false;
                if (expirationTo && expMs >= new Date(expirationTo).getTime()) return false;
            }

            return true;
        });
    }, [groups, searchTerm, priorityFilter, categoryFilter, officeFilter, codeFilter, renewalDays, expirationFrom, expirationTo]);

    // Global totals (always from unfiltered for the summary bar)
    const totalFlags = groups.reduce((sum, g) => sum + g.total_flags, 0);
    
    const policiesWithHigh = groups.filter(g => g.high_count > 0).length;
    const totalHigh = groups.reduce((sum, g) => sum + g.high_count, 0);
    
    const policiesWithMedium = groups.filter(g => g.medium_count > 0).length;
    const totalMedium = groups.reduce((sum, g) => sum + g.medium_count, 0);
    
    const policiesWithLow = groups.filter(g => g.low_count > 0).length;
    const totalLow = groups.reduce((sum, g) => sum + g.low_count, 0);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
    const paginatedRows = useMemo(() => {
        const start = (currentPage - 1) * ROWS_PER_PAGE;
        return filtered.slice(start, start + ROWS_PER_PAGE);
    }, [filtered, currentPage]);

    // Reset page when filters change
    const prevFilteredLen = React.useRef(filtered.length);
    if (filtered.length !== prevFilteredLen.current) {
        prevFilteredLen.current = filtered.length;
        if (currentPage !== 1) setCurrentPage(1);
    }

    const toggleExpand = useCallback((id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const navigateToPolicy = useCallback((id: string) => {
        router.push(`/policy/${id}?tab=flags`);
    }, [router]);

    const hasActiveFilters = searchTerm || priorityFilter || categoryFilter || officeFilter || codeFilter || renewalDays || expirationFrom || expirationTo;
    const clearFilters = () => {
        setSearchTerm('');
        setPriorityFilter('');
        setCodeFilter('');
        setCategoryFilter('');
        setOfficeFilter('');
        setRenewalDays('');
        setExpirationFrom('');
        setExpirationTo('');
        // Also clear URL params
        router.replace('/flags');
    };

    if (error) {
        return (
            <div className={styles.flagsPage}>
                <div style={{ marginTop: '10vh' }}>
                    <ErrorState message="Failed to load flagged policies. Please try again." onRetry={refresh} />
                </div>
            </div>
        );
    }

    return (
        <div className={styles.flagsPage}>
            {/* Header */}
            <div className={styles.pageHeader}>
                <div className={styles.headerLeft}>
                    <Flag size={22} />
                    <h1>Flagged Active Policies</h1>
                    <span className={styles.flagCount}>
                        {filtered.length} {filtered.length === 1 ? 'policy' : 'policies'} · {totalFlags} flags · active only
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push('/flags/definitions')}
                        style={{
                            borderColor: 'var(--accent-primary)',
                            color: 'var(--accent-primary)',
                            fontWeight: 600,
                            gap: '0.375rem',
                        }}
                    >
                        <Shield size={14} /> Flag Definitions
                    </Button>
                    <Button variant="ghost" size="sm" onClick={refresh}>
                        <RefreshCw size={14} style={{ marginRight: '0.375rem' }} /> Refresh
                    </Button>
                </div>
            </div>

            {/* Priority summary */}
            <div className={styles.severitySummary}>
                <button
                    className={`${styles.sevCard} ${priorityFilter === 'high' ? styles.activeSevCard : ''}`}
                    style={{ borderLeftColor: PRIORITY_COLORS.high }}
                    onClick={() => setPriorityFilter(priorityFilter === 'high' ? '' : 'high')}
                >
                    <AlertCircle size={16} color={PRIORITY_COLORS.high} />
                    <span className={styles.sevValue}>{policiesWithHigh}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span className={styles.sevLabel}>Policies (High)</span>
                        <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{totalHigh} flags</span>
                    </div>
                </button>
                <button
                    className={`${styles.sevCard} ${priorityFilter === 'medium' ? styles.activeSevCard : ''}`}
                    style={{ borderLeftColor: PRIORITY_COLORS.medium }}
                    onClick={() => setPriorityFilter(priorityFilter === 'medium' ? '' : 'medium')}
                >
                    <AlertTriangle size={16} color={PRIORITY_COLORS.medium} />
                    <span className={styles.sevValue}>{policiesWithMedium}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span className={styles.sevLabel}>Policies (Medium)</span>
                        <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{totalMedium} flags</span>
                    </div>
                </button>
                <button
                    className={`${styles.sevCard} ${priorityFilter === 'low' ? styles.activeSevCard : ''}`}
                    style={{ borderLeftColor: PRIORITY_COLORS.low }}
                    onClick={() => setPriorityFilter(priorityFilter === 'low' ? '' : 'low')}
                >
                    <Info size={16} color={PRIORITY_COLORS.low} />
                    <span className={styles.sevValue}>{policiesWithLow}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span className={styles.sevLabel}>Policies (Low)</span>
                        <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{totalLow} flags</span>
                    </div>
                </button>
            </div>

            {/* Toolbar */}
            <div className={styles.toolbar}>
                <div className={styles.filterRow}>
                    <div className={styles.searchBox}>
                        <Search size={14} />
                        <input
                            type="text"
                            placeholder="Search by policy #, insured, carrier..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            aria-label="Search flags by policy number, insured name, or carrier"
                        />
                    </div>
                    <select
                        className={styles.filterSelect}
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        aria-label="Filter by category"
                    >
                        <option value="">All Categories</option>
                        {categories.map(c => (
                            <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                        ))}
                    </select>
                    {offices.length > 1 && (
                        <select
                            className={styles.filterSelect}
                            value={officeFilter}
                            onChange={(e) => setOfficeFilter(e.target.value)}
                            aria-label="Filter by office"
                        >
                            <option value="">All Offices</option>
                            {offices.map(o => (
                                <option key={o} value={o}>{o}</option>
                            ))}
                        </select>
                    )}
                </div>
                <div className={styles.renewalChips}>
                    <Calendar size={13} className={styles.chipIcon} />
                    <span className={styles.chipLabel}>Expiring in:</span>
                    {RENEWAL_FILTERS.map(rf => (
                        <button
                            key={rf.key}
                            className={`${styles.chip} ${renewalDays === rf.key ? styles.chipActive : ''}`}
                            onClick={() => setRenewalDays(renewalDays === rf.key ? '' : rf.key)}
                        >
                            {rf.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Active filter chips */}
            {hasActiveFilters && (
                <div className={styles.activeFilters}>
                    <Filter size={13} className={styles.activeFilterIcon} />
                    {searchTerm && (
                        <button className={styles.activeChip} onClick={() => setSearchTerm('')}>
                            Search: &ldquo;{searchTerm}&rdquo; <X size={11} />
                        </button>
                    )}
                    {priorityFilter && (
                        <button className={styles.activeChip} onClick={() => setPriorityFilter('')}>
                            Priority: {priorityFilter} <X size={11} />
                        </button>
                    )}
                    {categoryFilter && (
                        <button className={styles.activeChip} onClick={() => setCategoryFilter('')}>
                            Category: {categoryFilter.replace(/_/g, ' ')} <X size={11} />
                        </button>
                    )}
                    {officeFilter && (
                        <button className={styles.activeChip} onClick={() => setOfficeFilter('')}>
                            Office: {officeFilter} <X size={11} />
                        </button>
                    )}
                    {codeFilter && (
                        <button className={styles.activeChip} onClick={() => setCodeFilter('')}>
                            Flag: {codeFilter} <X size={11} />
                        </button>
                    )}
                    {renewalDays && (
                        <button className={styles.activeChip} onClick={() => setRenewalDays('')}>
                            Renewing in {renewalDays} days <X size={11} />
                        </button>
                    )}
                    {(expirationFrom || expirationTo) && (
                        <button className={styles.activeChip} onClick={() => { setExpirationFrom(''); setExpirationTo(''); }}>
                            Expiry: {expirationFrom ? formatDate(expirationFrom) : '...'} – {expirationTo ? formatDate(expirationTo) : '...'} <X size={11} />
                        </button>
                    )}
                    <button className={styles.clearAllBtn} onClick={clearFilters}>
                        Clear All <X size={12} />
                    </button>
                </div>
            )}

            {/* Policy list */}
            <div className={styles.policyList}>
                {loading ? (
                    <div className={styles.loadingState}>Loading flagged policies...</div>
                ) : filtered.length === 0 ? (
                    <div className={styles.emptyState}>
                        <CheckCircle size={32} />
                        <h3>{hasActiveFilters ? 'No flagged policies match your filters' : 'You\'re all caught up!'}</h3>
                        <p>
                            {hasActiveFilters
                                ? 'Try adjusting your search or filter criteria.'
                                : 'No open flags found across your policies.'}
                        </p>
                        {hasActiveFilters && (
                            <button className={styles.clearFiltersBtn} onClick={clearFilters}>
                                Clear all filters
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {paginatedRows.map((group) => (
                            <PolicyRow
                                key={group.policy_id}
                                group={group}
                                isExpanded={expandedIds.has(group.policy_id)}
                                onToggle={toggleExpand}
                                onNavigate={navigateToPolicy}
                            />
                        ))}

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className={styles.pagination}>
                                <button
                                    className={styles.pageBtn}
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => p - 1)}
                                >
                                    ← Previous
                                </button>
                                <span className={styles.pageInfo}>
                                    Page {currentPage} of {totalPages} · Showing {((currentPage - 1) * ROWS_PER_PAGE) + 1}–{Math.min(currentPage * ROWS_PER_PAGE, filtered.length)} of {filtered.length}
                                </span>
                                <button
                                    className={styles.pageBtn}
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(p => p + 1)}
                                >
                                    Next →
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
