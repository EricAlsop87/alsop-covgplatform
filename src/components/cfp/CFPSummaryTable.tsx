'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
    Search,
    ExternalLink,
    Check,
    X,
    Layers,
    Loader2,
    Calendar,
    RotateCcw,
    Download,
    GripVertical,
    SlidersHorizontal,
} from 'lucide-react';
import type { CFPFamily, CFPTermRow } from '@/app/api/cfp-summary/route';
import styles from './CFPSummaryTable.module.scss';
import { supabase } from '@/lib/supabaseClient';
import { exportCFPToExcel } from '@/lib/cfpExport';

export type CFPColumnKey =
    | 'policy'
    | 'insured'
    | 'address'
    | 'effective'
    | 'expiration'
    | 'premium'
    | 'dec'
    | 'rce'
    | 'dic'
    | 'quote'
    | 'bamboo'
    | 'action';

interface ColumnDef {
    key: CFPColumnKey;
    label: string;
    width: number;
    minWidth: number;
    align?: 'left' | 'center' | 'right';
}

const DEFAULT_COLUMNS: ColumnDef[] = [
    { key: 'policy', label: 'Policy #', width: 175, minWidth: 120, align: 'left' },
    { key: 'insured', label: 'Named Insured', width: 150, minWidth: 100, align: 'left' },
    { key: 'address', label: 'Property Address', width: 200, minWidth: 120, align: 'left' },
    { key: 'effective', label: 'Effective', width: 95, minWidth: 80, align: 'left' },
    { key: 'expiration', label: 'Expiration', width: 95, minWidth: 80, align: 'left' },
    { key: 'premium', label: 'Premium', width: 90, minWidth: 70, align: 'left' },
    { key: 'dec', label: 'DEC Page', width: 85, minWidth: 70, align: 'center' },
    { key: 'rce', label: 'RCE', width: 100, minWidth: 75, align: 'center' },
    { key: 'dic', label: 'DIC', width: 100, minWidth: 75, align: 'center' },
    { key: 'quote', label: 'Quote / E&S', width: 95, minWidth: 70, align: 'center' },
    { key: 'bamboo', label: 'Bamboo Coverage', width: 125, minWidth: 90, align: 'center' },
    { key: 'action', label: 'Action', width: 75, minWidth: 60, align: 'center' },
];

const DEFAULT_COLUMN_KEYS = DEFAULT_COLUMNS.map(c => c.key);
const DEFAULT_COLUMN_WIDTHS: Record<CFPColumnKey, number> = Object.fromEntries(
    DEFAULT_COLUMNS.map(c => [c.key, c.width])
) as Record<CFPColumnKey, number>;

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
    const [docFilter, setDocFilter] = useState<DocFilterType>('all');
    const [togglingPolicyId, setTogglingPolicyId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 25;

    // ── Column Reorder & Resize State ─────────────────────────────────────
    const [columnOrder, setColumnOrder] = useState<CFPColumnKey[]>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('cfp_summary_column_order');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length === DEFAULT_COLUMN_KEYS.length) {
                        return parsed;
                    }
                }
            } catch {}
        }
        return DEFAULT_COLUMN_KEYS;
    });

    const [columnWidths, setColumnWidths] = useState<Record<CFPColumnKey, number>>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('cfp_summary_column_widths');
                if (saved) {
                    return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) };
                }
            } catch {}
        }
        return DEFAULT_COLUMN_WIDTHS;
    });

    // Column resizing drag state
    const [resizingColumn, setResizingColumn] = useState<{
        key: CFPColumnKey;
        startX: number;
        startWidth: number;
    } | null>(null);

    // Column reorder drag state
    const [draggedColumnKey, setDraggedColumnKey] = useState<CFPColumnKey | null>(null);
    const [dragOverColumnKey, setDragOverColumnKey] = useState<CFPColumnKey | null>(null);

    // Handle mouse move for column resizing
    useEffect(() => {
        if (!resizingColumn) return;

        const handleMouseMove = (e: MouseEvent) => {
            const delta = e.clientX - resizingColumn.startX;
            const colDef = DEFAULT_COLUMNS.find(c => c.key === resizingColumn.key);
            const minW = colDef?.minWidth || 60;
            const newWidth = Math.max(minW, Math.min(800, resizingColumn.startWidth + delta));

            setColumnWidths(prev => {
                const updated = { ...prev, [resizingColumn.key]: newWidth };
                try {
                    localStorage.setItem('cfp_summary_column_widths', JSON.stringify(updated));
                } catch {}
                return updated;
            });
        };

        const handleMouseUp = () => {
            setResizingColumn(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [resizingColumn]);

    // Resize Start Handler
    const handleResizeStart = (e: React.MouseEvent, columnKey: CFPColumnKey) => {
        e.stopPropagation();
        e.preventDefault();
        setResizingColumn({
            key: columnKey,
            startX: e.clientX,
            startWidth: columnWidths[columnKey] || DEFAULT_COLUMN_WIDTHS[columnKey] || 100,
        });
    };

    // Column Drag & Drop Reorder Handlers
    const handleDragStart = (e: React.DragEvent, colKey: CFPColumnKey) => {
        if (resizingColumn) return;
        setDraggedColumnKey(colKey);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', colKey);
    };

    const handleDragOver = (e: React.DragEvent, colKey: CFPColumnKey) => {
        if (!draggedColumnKey || draggedColumnKey === colKey) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverColumnKey(colKey);
    };

    const handleDragLeave = () => {
        setDragOverColumnKey(null);
    };

    const handleDrop = (e: React.DragEvent, targetKey: CFPColumnKey) => {
        e.preventDefault();
        if (!draggedColumnKey || draggedColumnKey === targetKey) {
            setDraggedColumnKey(null);
            setDragOverColumnKey(null);
            return;
        }

        const newOrder = [...columnOrder];
        const dragIdx = newOrder.indexOf(draggedColumnKey);
        const targetIdx = newOrder.indexOf(targetKey);

        if (dragIdx !== -1 && targetIdx !== -1) {
            newOrder.splice(dragIdx, 1);
            newOrder.splice(targetIdx, 0, draggedColumnKey);
            setColumnOrder(newOrder);
            try {
                localStorage.setItem('cfp_summary_column_order', JSON.stringify(newOrder));
            } catch {}
        }

        setDraggedColumnKey(null);
        setDragOverColumnKey(null);
    };

    // Reset Column Order & Widths
    const handleResetColumns = () => {
        setColumnOrder(DEFAULT_COLUMN_KEYS);
        setColumnWidths(DEFAULT_COLUMN_WIDTHS);
        try {
            localStorage.removeItem('cfp_summary_column_order');
            localStorage.removeItem('cfp_summary_column_widths');
        } catch {}
    };

    // Sync initialFamilies to local state
    useEffect(() => {
        setFamilies(initialFamilies);
        setCurrentPage(1);
    }, [initialFamilies]);

    // Flatten all policy terms into a clean single list
    const allTerms = useMemo(() => {
        return families.flatMap(f => f.terms);
    }, [families]);

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

    // Filter terms based on docFilter pill
    const filteredTerms = useMemo(() => {
        if (docFilter === 'all') return allTerms;

        return allTerms.filter(t => {
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
    }, [allTerms, docFilter]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredTerms.length / PAGE_SIZE));
    const paginatedTerms = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredTerms.slice(start, start + PAGE_SIZE);
    }, [filteredTerms, currentPage]);

    const [isExporting, setIsExporting] = useState(false);

    // Export currently filtered policies to Excel (.xlsx)
    const handleExportExcel = async () => {
        if (filteredTerms.length === 0 || isExporting) return;
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

            await exportCFPToExcel(filteredTerms, desc);
        } catch (err) {
            console.error('Failed to export to Excel:', err);
        } finally {
            setIsExporting(false);
        }
    };

    // Total table width calculated from sum of columnWidths
    const totalTableWidth = useMemo(() => {
        return columnOrder.reduce((sum, key) => sum + (columnWidths[key] || DEFAULT_COLUMN_WIDTHS[key]), 0);
    }, [columnOrder, columnWidths]);

    // Render individual cell content by column key
    const renderCell = (colKey: CFPColumnKey, term: CFPTermRow) => {
        switch (colKey) {
            case 'policy':
                return (
                    <div className={styles.policyNumberCell}>
                        <span className={styles.cellText} title={term.policy_number}>
                            {term.policy_number}
                        </span>
                        {term.suffix && (
                            <span className={`${styles.typeBadge} ${styles.renewal}`} style={{ flexShrink: 0 }}>
                                {term.suffix}
                            </span>
                        )}
                    </div>
                );

            case 'insured':
                return term.client_id ? (
                    <Link
                        href={`/client/${term.client_id}`}
                        className={`${styles.linkButton} ${styles.cellText}`}
                        target="_blank"
                        title={term.named_insured || 'Unknown'}
                    >
                        {term.named_insured || 'Unknown'}
                    </Link>
                ) : (
                    <span className={styles.cellText} title={term.named_insured || '—'}>
                        {term.named_insured || '—'}
                    </span>
                );

            case 'address':
                return (
                    <span className={styles.cellText} title={term.property_address || '—'}>
                        {term.property_address || '—'}
                    </span>
                );

            case 'effective':
                return (
                    <span className={styles.cellText} title={term.effective_date || '—'}>
                        {term.effective_date || '—'}
                    </span>
                );

            case 'expiration':
                return (
                    <strong className={styles.cellText} title={term.expiration_date || '—'}>
                        {term.expiration_date || '—'}
                    </strong>
                );

            case 'premium':
                return (
                    <span className={styles.cellText}>
                        {term.annual_premium
                            ? `$${term.annual_premium.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                              })}`
                            : '—'}
                    </span>
                );

            case 'dec':
                return term.has_dec ? (
                    <span className={`${styles.docBadge} ${styles.yes}`} title="DEC Page on file">
                        <Check size={13} /> DEC
                    </span>
                ) : (
                    <span className={`${styles.docBadge} ${styles.no}`} title="Missing DEC Page">
                        <X size={13} /> None
                    </span>
                );

            case 'rce':
                return renderCarrierBadge(term.rce_carrier, 'RCE');

            case 'dic':
                return renderCarrierBadge(term.dic_carrier, 'DIC');

            case 'quote':
                return term.has_es ? (
                    <span className={`${styles.docBadge} ${styles.yes}`} title="Quote / E&S document on file">
                        <Check size={13} /> Quote
                    </span>
                ) : (
                    <span className={`${styles.docBadge} ${styles.no}`} title="Missing Quote/E&S">
                        <X size={13} /> None
                    </span>
                );

            case 'bamboo':
                return (
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
                );

            case 'action':
                return (
                    <Link
                        href={`/policy/${term.policy_id}`}
                        className={styles.linkButton}
                        target="_blank"
                        title="Open policy in new tab"
                    >
                        <span>View</span>
                        <ExternalLink size={12} />
                    </Link>
                );

            default:
                return null;
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

                    {/* Right side controls: Export, Layout & refresh */}
                    <div className={styles.filterGroup}>
                        <button
                            type="button"
                            className={styles.exportBtn}
                            onClick={handleExportExcel}
                            disabled={isExporting || filteredTerms.length === 0}
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
                            onClick={handleResetColumns}
                            title="Reset column widths and order to system defaults"
                        >
                            <SlidersHorizontal size={12} style={{ display: 'inline', marginRight: '4px' }} />
                            Reset Columns
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

                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            💡 <em>Drag headers to reorder • Drag column edges to resize</em>
                        </span>
                        <span className={styles.countsBadge}>
                            Showing <strong>{filteredTerms.length}</strong> policies
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Table Card ── */}
            <div className={styles.tableCard}>
                <div className={styles.tableScroll}>
                    <table className={styles.table} style={{ width: `${totalTableWidth}px`, minWidth: '100%' }}>
                        {/* Colgroup to enforce exact column widths */}
                        <colgroup>
                            {columnOrder.map((colKey) => (
                                <col
                                    key={colKey}
                                    style={{
                                        width: `${columnWidths[colKey] || DEFAULT_COLUMN_WIDTHS[colKey]}px`,
                                    }}
                                />
                            ))}
                        </colgroup>

                        <thead>
                            <tr>
                                {columnOrder.map((colKey) => {
                                    const colDef = DEFAULT_COLUMNS.find(c => c.key === colKey)!;
                                    const width = columnWidths[colKey] || colDef.width;
                                    const isDragging = draggedColumnKey === colKey;
                                    const isDragOver = dragOverColumnKey === colKey;

                                    return (
                                        <th
                                            key={colKey}
                                            style={{
                                                width: `${width}px`,
                                                textAlign: colDef.align || 'left',
                                            }}
                                            className={`${isDragOver ? styles.dragOver : ''} ${
                                                isDragging ? styles.isDragging : ''
                                            }`}
                                            draggable={!resizingColumn}
                                            onDragStart={(e) => handleDragStart(e, colKey)}
                                            onDragOver={(e) => handleDragOver(e, colKey)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, colKey)}
                                        >
                                            <div
                                                className={styles.thInner}
                                                style={{
                                                    justifyContent:
                                                        colDef.align === 'center'
                                                            ? 'center'
                                                            : colDef.align === 'right'
                                                            ? 'flex-end'
                                                            : 'flex-start',
                                                }}
                                                title="Drag to reorder column"
                                            >
                                                <GripVertical
                                                    size={11}
                                                    style={{ opacity: 0.4, flexShrink: 0 }}
                                                />
                                                <span>{colDef.label}</span>
                                            </div>

                                            {/* Drag to resize column width handle */}
                                            <div
                                                className={`${styles.colResizer} ${
                                                    resizingColumn?.key === colKey
                                                        ? styles.colResizerActive
                                                        : ''
                                                }`}
                                                onMouseDown={(e) => handleResizeStart(e, colKey)}
                                                onClick={(e) => e.stopPropagation()}
                                                title="Drag to resize column width"
                                            />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>

                        <tbody>
                            {loading && allTerms.length === 0 ? (
                                <tr>
                                    <td colSpan={columnOrder.length}>
                                        <div className={styles.emptyState}>
                                            <Loader2 size={28} className="animate-spin text-primary" />
                                            <span>Loading CFP policies...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedTerms.length === 0 ? (
                                <tr>
                                    <td colSpan={columnOrder.length}>
                                        <div className={styles.emptyState}>
                                            <Layers size={32} />
                                            <span>No CFP policies match the selected filters.</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedTerms.map((term) => (
                                    <tr
                                        key={term.policy_term_id}
                                        className={styles.termRow}
                                    >
                                        {columnOrder.map((colKey) => {
                                            const colDef = DEFAULT_COLUMNS.find(c => c.key === colKey)!;
                                            return (
                                                <td
                                                    key={colKey}
                                                    style={{
                                                        textAlign: colDef.align || 'left',
                                                    }}
                                                >
                                                    {renderCell(colKey, term)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))
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
