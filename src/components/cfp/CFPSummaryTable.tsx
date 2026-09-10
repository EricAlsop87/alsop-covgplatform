'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
    Search,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    Check,
    X,
    Filter,
    Layers,
    Loader2,
    Calendar,
    RotateCcw,
    Download,
} from 'lucide-react';
import type { CFPFamily, CFPTermRow } from '@/app/api/cfp-summary/route';
import styles from './CFPSummaryTable.module.scss';
import { supabase } from '@/lib/supabaseClient';
import { exportCFPToExcel } from '@/lib/cfpExport';

interface CFPSummaryTableProps {
    families: CFPFamily[];
    loading: boolean;
    year: string;
    month: string;
    search: string;
    onYearChange: (y: string) => void;
    onMonthChange: (m: string) => void;
    onSearchChange: (s: string) => void;
    onRefresh: () => void;
    totalTerms: number;
    totalFamilies: number;
}

type DocFilterType = 'all' | 'missing_dec' | 'missing_rce' | 'missing_dic' | 'missing_es' | 'has_bamboo' | 'missing_bamboo';

const MONTH_NAMES = [
    { value: '', label: 'All Months' },
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
];

function renderCarrierBadge(carrier: string | null | undefined, docName: 'RCE' | 'DIC') {
    if (!carrier) {
        return (
            <span className={`${styles.docBadge} ${styles.no}`} title={`Missing ${docName}`}>
                <X size={13} /> None
            </span>
        );
    }

    const cLower = carrier.toLowerCase();
    let badgeClass = styles.other;
    if (cLower === 'bamboo') badgeClass = styles.bamboo;
    else if (cLower === 'am' || cLower === 'american modern') badgeClass = styles.am;
    else if (cLower === 'aegis') badgeClass = styles.aegis;
    else if (cLower === 'sagesure') badgeClass = styles.sagesure;
    else if (cLower === 'psic') badgeClass = styles.psic;

    const displayLabel = carrier === 'AM' ? 'AM' : carrier;

    return (
        <span className={`${styles.carrierBadge} ${badgeClass}`} title={`${docName} uploaded: ${carrier}`}>
            <Check size={12} /> {displayLabel}
        </span>
    );
}

export function CFPSummaryTable({
    families: initialFamilies,
    loading,
    year,
    month,
    search,
    onYearChange,
    onMonthChange,
    onSearchChange,
    onRefresh,
    totalTerms,
    totalFamilies,
}: CFPSummaryTableProps) {
    // Local copy of families to support optimistic updates for Bamboo toggle
    const [families, setFamilies] = useState<CFPFamily[]>(initialFamilies);
    const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
    const [docFilter, setDocFilter] = useState<DocFilterType>('all');
    const [togglingPolicyId, setTogglingPolicyId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 25;

    // Sync initialFamilies to local state
    useEffect(() => {
        setFamilies(initialFamilies);
        // By default expand all multi-term families
        const multi = new Set<string>();
        initialFamilies.forEach(f => {
            if (f.terms.length > 1) {
                multi.add(f.base_policy);
            }
        });
        setExpandedFamilies(multi);
        setCurrentPage(1);
    }, [initialFamilies]);

    // Toggle family accordion
    const toggleFamily = (basePolicy: string) => {
        setExpandedFamilies(prev => {
            const next = new Set(prev);
            if (next.has(basePolicy)) {
                next.delete(basePolicy);
            } else {
                next.add(basePolicy);
            }
            return next;
        });
    };

    // Expand / Collapse all
    const handleExpandAll = () => {
        const all = new Set(families.map(f => f.base_policy));
        setExpandedFamilies(all);
    };

    const handleCollapseAll = () => {
        setExpandedFamilies(new Set());
    };

    // Toggle Bamboo Coverage via PATCH API with optimistic update
    const handleToggleBamboo = async (policyId: string, currentVal: boolean) => {
        const newVal = !currentVal;
        setTogglingPolicyId(policyId);

        // Optimistic update
        setFamilies(prev =>
            prev.map(f => ({
                ...f,
                terms: f.terms.map(t =>
                    t.policy_id === policyId ? { ...t, has_bamboo_coverage: newVal } : t
                ),
            }))
        );

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch('/api/cfp-summary', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    policy_id: policyId,
                    has_bamboo_coverage: newVal,
                }),
            });

            if (!res.ok) {
                // Revert on failure
                setFamilies(prev =>
                    prev.map(f => ({
                        ...f,
                        terms: f.terms.map(t =>
                            t.policy_id === policyId ? { ...t, has_bamboo_coverage: currentVal } : t
                        ),
                    }))
                );
            }
        } catch {
            // Revert on failure
            setFamilies(prev =>
                prev.map(f => ({
                    ...f,
                    terms: f.terms.map(t =>
                        t.policy_id === policyId ? { ...t, has_bamboo_coverage: currentVal } : t
                    ),
                }))
            );
        } finally {
            setTogglingPolicyId(null);
        }
    };

    // Filter families based on docFilter pill
    const filteredFamilies = useMemo(() => {
        if (docFilter === 'all') return families;

        return families
            .map(f => {
                const matchingTerms = f.terms.filter(t => {
                    switch (docFilter) {
                        case 'missing_dec':
                            return !t.has_dec;
                        case 'missing_rce':
                            return !t.has_rce;
                        case 'missing_dic':
                            return !t.has_dic;
                        case 'missing_es':
                            return !t.has_es;
                        case 'has_bamboo':
                            return t.has_bamboo_coverage;
                        case 'missing_bamboo':
                            return !t.has_bamboo_coverage;
                        default:
                            return true;
                    }
                });

                if (matchingTerms.length === 0) return null;
                return { ...f, terms: matchingTerms };
            })
            .filter((f): f is CFPFamily => f !== null);
    }, [families, docFilter]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredFamilies.length / PAGE_SIZE));
    const paginatedFamilies = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredFamilies.slice(start, start + PAGE_SIZE);
    }, [filteredFamilies, currentPage]);

    const [isExporting, setIsExporting] = useState(false);

    // Export currently filtered families to Excel (.xlsx)
    const handleExportExcel = async () => {
        if (filteredFamilies.length === 0 || isExporting) return;
        setIsExporting(true);
        try {
            const parts: string[] = [];
            if (year) parts.push(`Year_${year}`);
            if (month) {
                const mLabel = MONTH_NAMES.find(m => m.value === month)?.label || `Month_${month}`;
                parts.push(mLabel);
            }
            if (docFilter !== 'all') parts.push(docFilter);
            if (search) parts.push(`Search_${search.slice(0, 10)}`);
            const desc = parts.length > 0 ? parts.join('_') : 'All';

            await exportCFPToExcel(filteredFamilies, desc);
        } catch (err) {
            console.error('Failed to export to Excel:', err);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className={styles.tableContainer}>
            {/* ── Controls Card ── */}
            <div className={styles.controlsCard}>
                <div className={styles.controlsRow}>
                    <div className={styles.filterGroup}>
                        {/* Year Filter */}
                        <div className={styles.selectWrapper}>
                            <Calendar size={14} />
                            <span>Year:</span>
                            <select
                                className={styles.selectInput}
                                value={year}
                                onChange={e => {
                                    onYearChange(e.target.value);
                                    setCurrentPage(1);
                                }}
                            >
                                <option value="2027">2027</option>
                                <option value="2026">2026</option>
                                <option value="2025">2025</option>
                                <option value="2024">2024</option>
                                <option value="">All Years</option>
                            </select>
                        </div>

                        {/* Month Filter */}
                        <div className={styles.selectWrapper}>
                            <span>Month:</span>
                            <select
                                className={styles.selectInput}
                                value={month}
                                onChange={e => {
                                    onMonthChange(e.target.value);
                                    setCurrentPage(1);
                                }}
                            >
                                {MONTH_NAMES.map(m => (
                                    <option key={m.value} value={m.value}>
                                        {m.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Search Input */}
                        <div className={styles.searchBox}>
                            <Search size={14} className={styles.searchIcon} />
                            <input
                                type="text"
                                className={styles.searchInput}
                                placeholder="Search policy #, insured, address..."
                                value={search}
                                onChange={e => {
                                    onSearchChange(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                        </div>
                    </div>

                    {/* Right side controls: Export, Expand/Collapse & refresh */}
                    <div className={styles.filterGroup}>
                        <button
                            type="button"
                            className={styles.exportBtn}
                            onClick={handleExportExcel}
                            disabled={isExporting || filteredFamilies.length === 0}
                            title="Export currently filtered policies to Excel (.xlsx)"
                        >
                            {isExporting ? (
                                <>
                                    <Loader2 size={13} className="animate-spin" />
                                    <span>Exporting...</span>
                                </>
                            ) : (
                                <>
                                    <Download size={13} />
                                    <span>Export to Excel</span>
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            className={styles.filterPill}
                            onClick={handleExpandAll}
                            title="Expand all families"
                        >
                            Expand All
                        </button>
                        <button
                            type="button"
                            className={styles.filterPill}
                            onClick={handleCollapseAll}
                            title="Collapse all families"
                        >
                            Collapse All
                        </button>
                        <button
                            type="button"
                            className={styles.filterPill}
                            onClick={onRefresh}
                            title="Refresh data"
                        >
                            <RotateCcw size={12} style={{ display: 'inline', marginRight: '4px' }} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Filter Pills */}
                <div className={styles.filterPills}>
                    <span className={styles.pillLabel}>Quick Filter:</span>
                    <button
                        type="button"
                        className={`${styles.filterPill} ${docFilter === 'all' ? styles.active : ''}`}
                        onClick={() => { setDocFilter('all'); setCurrentPage(1); }}
                    >
                        All
                    </button>
                    <button
                        type="button"
                        className={`${styles.filterPill} ${docFilter === 'missing_dec' ? styles.active : ''}`}
                        onClick={() => { setDocFilter('missing_dec'); setCurrentPage(1); }}
                    >
                        Missing DEC
                    </button>
                    <button
                        type="button"
                        className={`${styles.filterPill} ${docFilter === 'missing_rce' ? styles.active : ''}`}
                        onClick={() => { setDocFilter('missing_rce'); setCurrentPage(1); }}
                    >
                        Missing RCE
                    </button>
                    <button
                        type="button"
                        className={`${styles.filterPill} ${docFilter === 'missing_dic' ? styles.active : ''}`}
                        onClick={() => { setDocFilter('missing_dic'); setCurrentPage(1); }}
                    >
                        Missing DIC
                    </button>
                    <button
                        type="button"
                        className={`${styles.filterPill} ${docFilter === 'missing_es' ? styles.active : ''}`}
                        onClick={() => { setDocFilter('missing_es'); setCurrentPage(1); }}
                    >
                        Missing Quote/E&S
                    </button>
                    <button
                        type="button"
                        className={`${styles.filterPill} ${docFilter === 'has_bamboo' ? styles.active : ''}`}
                        onClick={() => { setDocFilter('has_bamboo'); setCurrentPage(1); }}
                    >
                        Bamboo Full Coverage: Yes
                    </button>

                    <div style={{ marginLeft: 'auto' }}>
                        <span className={styles.countsBadge}>
                            Showing <strong>{filteredFamilies.length}</strong> families ({totalTerms} terms total)
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Table Card ── */}
            <div className={styles.tableCard}>
                <div className={styles.tableScroll}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th style={{ minWidth: 200 }}>Policy / Family</th>
                                <th style={{ minWidth: 160 }}>Named Insured</th>
                                <th style={{ minWidth: 220 }}>Property Address</th>
                                <th style={{ minWidth: 100 }}>Effective</th>
                                <th style={{ minWidth: 100 }}>Expiration</th>
                                <th style={{ minWidth: 90 }}>Premium</th>
                                <th style={{ minWidth: 80, textAlign: 'center' }}>DEC Page</th>
                                <th style={{ minWidth: 80, textAlign: 'center' }}>RCE</th>
                                <th style={{ minWidth: 80, textAlign: 'center' }}>DIC</th>
                                <th style={{ minWidth: 90, textAlign: 'center' }}>Quote / E&S</th>
                                <th style={{ minWidth: 120, textAlign: 'center' }}>Bamboo Coverage</th>
                                <th style={{ minWidth: 90, textAlign: 'center' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && families.length === 0 ? (
                                <tr>
                                    <td colSpan={12}>
                                        <div className={styles.emptyState}>
                                            <Loader2 size={28} className="animate-spin text-primary" />
                                            <span>Loading CFP policy families...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedFamilies.length === 0 ? (
                                <tr>
                                    <td colSpan={12}>
                                        <div className={styles.emptyState}>
                                            <Layers size={32} />
                                            <span>No CFP policies match the selected filters.</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedFamilies.map(family => {
                                    const isMultiTerm = family.terms.length > 1;
                                    const isExpanded = expandedFamilies.has(family.base_policy);
                                    const primaryTerm = family.terms[family.terms.length - 1] || family.terms[0];

                                    return (
                                        <React.Fragment key={family.base_policy}>
                                            {/* Family Header Row (only shown if multi-term) */}
                                            {isMultiTerm && (
                                                <tr
                                                    className={styles.familyHeaderRow}
                                                    onClick={() => toggleFamily(family.base_policy)}
                                                >
                                                    <td colSpan={12}>
                                                        <div className={styles.familyCell}>
                                                            {isExpanded ? (
                                                                <ChevronDown size={16} />
                                                            ) : (
                                                                <ChevronRight size={16} />
                                                            )}
                                                            <span className={styles.familyTitle}>
                                                                {family.base_policy}
                                                            </span>
                                                            <span className={styles.termCountBadge}>
                                                                {family.terms.length} terms in family
                                                            </span>
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                                                                {primaryTerm.named_insured} — {primaryTerm.property_address}
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}

                                            {/* Term Rows: if multi-term, render children if expanded; if single-term, render directly */}
                                            {(!isMultiTerm || isExpanded) &&
                                                family.terms.map((term, index) => (
                                                    <tr
                                                        key={term.policy_term_id}
                                                        className={`${styles.termRow} ${isMultiTerm ? styles.childRow : ''}`}
                                                    >
                                                        {/* Policy Number & Badge */}
                                                        <td>
                                                            <div className={styles.policyNumberCell}>
                                                                {isMultiTerm && (
                                                                    <span style={{ color: 'var(--text-muted)', marginRight: '2px' }}>
                                                                        ↳
                                                                    </span>
                                                                )}
                                                                <span>{term.policy_number}</span>
                                                                <span
                                                                    className={`${styles.typeBadge} ${
                                                                        term.term_type === 'ORIGINAL'
                                                                            ? styles.original
                                                                            : styles.renewal
                                                                    }`}
                                                                >
                                                                    {term.term_type}
                                                                </span>
                                                                {term.is_current && (
                                                                    <span className={styles.currentBadge}>
                                                                        Current
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>

                                                        {/* Named Insured */}
                                                        <td>
                                                            {term.client_id ? (
                                                                <Link
                                                                    href={`/client/${term.client_id}`}
                                                                    className={styles.linkButton}
                                                                    target="_blank"
                                                                >
                                                                    {term.named_insured || 'Unknown'}
                                                                </Link>
                                                            ) : (
                                                                <span>{term.named_insured || '—'}</span>
                                                            )}
                                                        </td>

                                                        {/* Property Address */}
                                                        <td>
                                                            <span title={term.property_address}>
                                                                {term.property_address || '—'}
                                                            </span>
                                                        </td>

                                                        {/* Effective Date */}
                                                        <td>
                                                            {term.effective_date || '—'}
                                                        </td>

                                                        {/* Expiration Date */}
                                                        <td>
                                                            <strong>{term.expiration_date || '—'}</strong>
                                                        </td>

                                                        {/* Annual Premium */}
                                                        <td>
                                                            {term.annual_premium
                                                                ? `$${term.annual_premium.toLocaleString(undefined, {
                                                                      minimumFractionDigits: 2,
                                                                      maximumFractionDigits: 2,
                                                                  })}`
                                                                : '—'}
                                                        </td>

                                                        {/* DEC Page */}
                                                        <td style={{ textAlign: 'center' }}>
                                                            {term.has_dec ? (
                                                                <span className={`${styles.docBadge} ${styles.yes}`} title="DEC Page on file">
                                                                    <Check size={13} /> DEC
                                                                </span>
                                                            ) : (
                                                                <span className={`${styles.docBadge} ${styles.no}`} title="Missing DEC Page">
                                                                    <X size={13} /> None
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* RCE */}
                                                        <td style={{ textAlign: 'center' }}>
                                                            {renderCarrierBadge(term.rce_carrier, 'RCE')}
                                                        </td>

                                                        {/* DIC */}
                                                        <td style={{ textAlign: 'center' }}>
                                                            {renderCarrierBadge(term.dic_carrier, 'DIC')}
                                                        </td>

                                                        {/* Quote / E&S */}
                                                        <td style={{ textAlign: 'center' }}>
                                                            {term.has_es ? (
                                                                <span className={`${styles.docBadge} ${styles.yes}`} title="Quote / E&S document on file">
                                                                    <Check size={13} /> Quote
                                                                </span>
                                                            ) : (
                                                                <span className={`${styles.docBadge} ${styles.no}`} title="Missing Quote/E&S">
                                                                    <X size={13} /> None
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Bamboo Coverage Toggle */}
                                                        <td style={{ textAlign: 'center' }}>
                                                            <button
                                                                type="button"
                                                                disabled={togglingPolicyId === term.policy_id}
                                                                onClick={() =>
                                                                    handleToggleBamboo(
                                                                        term.policy_id,
                                                                        term.has_bamboo_coverage
                                                                    )
                                                                }
                                                                className={`${styles.bambooToggle} ${
                                                                    term.has_bamboo_coverage
                                                                        ? styles.active
                                                                        : styles.inactive
                                                                }`}
                                                                title="Click to toggle Bamboo full coverage"
                                                            >
                                                                {term.has_bamboo_coverage ? (
                                                                    <>
                                                                        <Check size={12} /> Yes
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <X size={12} /> No
                                                                    </>
                                                                )}
                                                            </button>
                                                        </td>

                                                        {/* View Policy */}
                                                        <td style={{ textAlign: 'center' }}>
                                                            <Link
                                                                href={`/policy/${term.policy_id}`}
                                                                className={styles.linkButton}
                                                                target="_blank"
                                                                title="Open policy in new tab"
                                                            >
                                                                <span>View</span>
                                                                <ExternalLink size={12} />
                                                            </Link>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ── Pagination ── */}
                {totalPages > 1 && (
                    <div className={styles.paginationRow}>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                            Page {currentPage} of {totalPages}
                        </span>
                        <div className={styles.pageButtons}>
                            <button
                                type="button"
                                className={styles.pageBtn}
                                disabled={currentPage <= 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                className={styles.pageBtn}
                                disabled={currentPage >= totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
