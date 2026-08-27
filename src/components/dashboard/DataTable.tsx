'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card/Card';
import styles from './DataTable.module.scss';
import { clsx } from 'clsx';
import { DashboardPolicy, bulkUpdatePolicyStatus } from '@/lib/api';
import { usePolicies } from '@/hooks/usePolicies';
import { ArrowUpDown, Search, ChevronDown, ChevronUp, Columns, ArrowUp, ArrowDown, EyeOff, X, GripVertical, Flag, ChevronFirst, ChevronLast, Download, Satellite, Zap, MoreVertical, Filter, CircleDot, AlertCircle, CheckSquare, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import { useRouter } from 'next/navigation';
import { FullWorkupModal } from './FullWorkupModal';
import { logger } from '@/lib/logger';


// localStorage keys (v2 — reset to pick up new column order & visibility defaults)
const LS_VISIBLE_COLUMNS = 'cfp_datatable_visibleColumns_v5';
const LS_COLUMN_ORDER = 'cfp_datatable_columnOrder_v5';
const LS_COLUMN_WIDTHS = 'cfp_datatable_columnWidths_v1';
const LS_SELECTED_FLAGS = 'cfp_datatable_selectedFlags';
const LS_SELECTED_STATUSES = 'cfp_datatable_selectedStatuses';
const LS_ENRICHMENT_FILTER = 'cfp_datatable_enrichmentFilter';
const LS_DOC_FILTER = 'cfp_datatable_docFilter';

// Default column widths in pixels — compact defaults for status & indicator columns
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
    policy_number: 140,
    flag_count: 85,
    is_enriched: 95,
    has_dec_page: 95,
    has_rce: 80,
    has_dic: 80,
    has_es: 80,
    named_insured: 180,
    status: 120,
    effective_date: 110,
    expiration_date: 115,
    annual_premium: 125,
    payment_status: 125,
    payment_plan: 115,
    policy_activity: 100,
    property_address: 230,
    mailing_address: 230,
    carrier_name: 120,
    created_at: 110,
};

// All known policy statuses for the status filter
const ALL_STATUSES = [
    { value: 'active', label: 'Active', color: '#22c55e' },
    { value: 'pending_review', label: 'Pending Review', color: '#f59e0b' },
    { value: 'in_progress', label: 'In Progress', color: '#3b82f6' },
    { value: 'reviewed', label: 'Reviewed', color: '#22c55e' },
    { value: 'unknown', label: 'Unknown', color: '#64748b' },
    { value: 'cancelled', label: 'Cancelled', color: '#ef4444' },
    { value: 'expired', label: 'Expired', color: '#ef4444' },
] as const;

// Additional filter dropdown options based on business logic
const PAYMENT_STATUSES = ["Paid in full", "11-pay", "3-pay"];
const PAYMENT_PLANS = ["3 Pay", "11 Pay"];
const POLICY_ACTIVITIES = ["Active", "Cancelled"];

// Helpers
function loadFromStorage<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function saveToStorage(key: string, value: unknown) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch { /* quota exceeded – silently fail */ }
}

// Column definition type
type ColumnDef = { key: keyof DashboardPolicy; label: string; width?: string };

// Policy-centric columns — ordered by agent importance
const INITIAL_COLUMNS: ColumnDef[] = [
    { key: 'policy_number', label: 'Policy #' },
    { key: 'flag_count', label: 'Flags' },
    { key: 'is_enriched', label: 'Property Data' },
    { key: 'has_dec_page', label: 'Dec Page' },
    { key: 'has_rce', label: 'RCE' },
    { key: 'has_dic', label: 'DIC' },
    { key: 'has_es', label: 'E&S' },
    { key: 'named_insured', label: 'Insured Name', width: '200px' },
    { key: 'status', label: 'Status' },
    { key: 'effective_date', label: 'Effective Date' },
    { key: 'expiration_date', label: 'Expiration Date' },
    { key: 'annual_premium', label: 'Annual Premium' },
    { key: 'payment_status', label: 'Payment Status' },
    { key: 'payment_plan', label: 'Payment Plan' },
    { key: 'policy_activity', label: 'Activity' },
    { key: 'property_address', label: 'Property Address', width: '250px' },
    { key: 'mailing_address', label: 'Mailing Address', width: '250px' },
    { key: 'carrier_name', label: 'Carrier' },
    { key: 'created_at', label: 'Date Added' },
];

// All columns visible by default
const DEFAULT_VISIBLE_KEYS = new Set([
    'policy_number', 'flag_count', 'is_enriched', 'has_dec_page', 'has_rce', 'has_dic', 'has_es', 'named_insured', 'status',
    'effective_date', 'expiration_date', 'annual_premium', 'payment_status', 'payment_plan', 'policy_activity',
    'property_address', 'mailing_address', 'carrier_name', 'created_at',
]);

// Column Header Popup Component
interface ColumnPopupProps {
    column: ColumnDef;
    isOpen: boolean;
    onClose: () => void;
    onSort: (direction: 'asc' | 'desc' | null) => void;
    onHide: () => void;
    currentSort: { key: keyof DashboardPolicy; direction: 'asc' | 'desc' } | null;
    columnSearch: string;
    onColumnSearch: (value: string) => void;
    position: { top: number; left: number };
}

function ColumnPopup({
    column,
    isOpen,
    onClose,
    onSort,
    onHide,
    currentSort,
    columnSearch,
    onColumnSearch,
    position
}: ColumnPopupProps) {
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const isCurrentlySorted = currentSort?.key === column.key;
    const currentDirection = isCurrentlySorted ? currentSort.direction : null;

    return (
        <div
            ref={popupRef}
            className={styles.columnPopup}
            style={{ top: position.top, left: position.left }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className={styles.popupHeader}>
                <span className={styles.popupTitle}>{column.label}</span>
                <button className={styles.popupClose} onClick={onClose}>
                    <X size={14} />
                </button>
            </div>

            {/* Sort Section */}
            <div className={styles.popupSection}>
                <div className={styles.popupSectionTitle}>Sort</div>
                <button
                    className={clsx(styles.popupOption, currentDirection === 'asc' && styles.popupOptionActive)}
                    onClick={() => onSort('asc')}
                >
                    <ArrowUp size={14} />
                    <span>Sort A → Z</span>
                </button>
                <button
                    className={clsx(styles.popupOption, currentDirection === 'desc' && styles.popupOptionActive)}
                    onClick={() => onSort('desc')}
                >
                    <ArrowDown size={14} />
                    <span>Sort Z → A</span>
                </button>
                {isCurrentlySorted && (
                    <button
                        className={styles.popupOption}
                        onClick={() => onSort(null)}
                    >
                        <X size={14} />
                        <span>Clear Sort</span>
                    </button>
                )}
            </div>

            {/* Search Section */}
            <div className={styles.popupSection}>
                <div className={styles.popupSectionTitle}>Search in "{column.label}"</div>
                <div className={styles.popupSearchContainer}>
                    <Search size={14} className={styles.popupSearchIcon} />
                    <input
                        type="text"
                        placeholder="Type to filter..."
                        className={styles.popupSearchInput}
                        value={columnSearch}
                        onChange={(e) => onColumnSearch(e.target.value)}
                        aria-label={`Search in ${column.label}`}
                        autoFocus
                    />
                    {columnSearch && (
                        <button
                            className={styles.popupSearchClear}
                            onClick={() => onColumnSearch('')}
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* Actions Section */}
            <div className={styles.popupSection}>
                <button className={styles.popupOption} onClick={onHide}>
                    <EyeOff size={14} />
                    <span>Hide Column</span>
                </button>
            </div>
        </div>
    );
}

interface DataTableProps {
    initialSearch?: string;
    initialExpirationFilter?: { from?: string; to?: string };
    initialStatusFilter?: string;
    initialFlagFilter?: string;
    filterLabel?: string;
    onSelectionChange?: (selectedIds: string[]) => void;
}

export function DataTable({ initialSearch, initialExpirationFilter, initialStatusFilter, initialFlagFilter, filterLabel, onSelectionChange }: DataTableProps = {}) {
    const router = useRouter();
    const { policies: swrData, loading: swrLoading, error: swrError, refresh: swrRefresh } = usePolicies();
    const [data, setData] = useState<DashboardPolicy[]>([]);
    const loading = swrLoading;
    const [error, setError] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: keyof DashboardPolicy; direction: 'asc' | 'desc' } | null>(
        { key: 'created_at', direction: 'desc' }
    );
    const [searchQuery, setSearchQuery] = useState(initialSearch || '');

    // Track whether localStorage preferences have been loaded
    const [prefsLoaded, setPrefsLoaded] = useState(false);

    // Column Order State (for drag-and-drop reordering)
    const [columnOrder, setColumnOrder] = useState<ColumnDef[]>(INITIAL_COLUMNS);
    const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

    // Column Widths State (persisted per agent)
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS);
    const [resizingColumn, setResizingColumn] = useState<{ key: string; startX: number; startWidth: number } | null>(null);

    // Column Visibility State
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(DEFAULT_VISIBLE_KEYS);
    const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);

    // Column Popup State
    const [activeColumnPopup, setActiveColumnPopup] = useState<string | null>(null);
    const [columnSearchQueries, setColumnSearchQueries] = useState<Record<string, string>>({});
    const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });

    // Refs for click-outside detection
    const flagMenuRef = useRef<HTMLDivElement>(null);
    const columnMenuRef = useRef<HTMLDivElement>(null);
    const rowsPerPageMenuRef = useRef<HTMLDivElement>(null);
    const rowsPerPageMenuTopRef = useRef<HTMLDivElement>(null);

    // Bulk Selection State
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

    // Sync selectedRows up to parent
    useEffect(() => {
        if (onSelectionChange) {
            onSelectionChange(Array.from(selectedRows));
        }
    }, [selectedRows, onSelectionChange]);

    const [isWorkupOpen, setIsWorkupOpen] = useState(false);
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);

    const handleBulkMarkReviewed = async () => {
        setIsBulkUpdating(true);
        try {
            const success = await bulkUpdatePolicyStatus(Array.from(selectedRows), 'reviewed');
            if (success) {
                setSelectedRows(new Set());
                swrRefresh();
            } else {
                alert('Failed to bulk update policies.');
            }
        } finally {
            setIsBulkUpdating(false);
        }
    };

    // Outside clicks for popupsing State
    const [allFlags, setAllFlags] = useState<string[]>([]);
    const [selectedFlags, setSelectedFlags] = useState<Set<string>>(
        initialFlagFilter ? new Set([initialFlagFilter]) : new Set()
    );
    const [isFlagMenuOpen, setIsFlagMenuOpen] = useState(false);
    const [flagSeverityFilter, setFlagSeverityFilter] = useState<string>('all');
    const [flagSearch, setFlagSearch] = useState('');

    // Status Filtering State
    const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
    const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
    const statusMenuRef = useRef<HTMLDivElement>(null);

    // Enrichment Filtering State
    const [enrichmentFilter, setEnrichmentFilter] = useState<'all' | 'enriched' | 'not_enriched'>('all');
    const [isEnrichmentMenuOpen, setIsEnrichmentMenuOpen] = useState(false);
    const enrichmentMenuRef = useRef<HTMLDivElement>(null);

    // Document Presence Filter State
    const [selectedDocFilters, setSelectedDocFilters] = useState<Set<string>>(new Set());
    const [isDocFilterMenuOpen, setIsDocFilterMenuOpen] = useState(false);
    const docFilterMenuRef = useRef<HTMLDivElement>(null);

    // Dynamic Policy Filter States
    const [selectedPaymentStatuses, setSelectedPaymentStatuses] = useState<Set<string>>(new Set());
    const [isPaymentStatusMenuOpen, setIsPaymentStatusMenuOpen] = useState(false);
    const paymentStatusMenuRef = useRef<HTMLDivElement>(null);

    const [selectedPaymentPlans, setSelectedPaymentPlans] = useState<Set<string>>(new Set());
    const [isPaymentPlanMenuOpen, setIsPaymentPlanMenuOpen] = useState(false);
    const paymentPlanMenuRef = useRef<HTMLDivElement>(null);

    const [selectedPolicyActivities, setSelectedPolicyActivities] = useState<Set<string>>(new Set());
    const [isPolicyActivityMenuOpen, setIsPolicyActivityMenuOpen] = useState(false);
    const policyActivityMenuRef = useRef<HTMLDivElement>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [isRowsPerPageMenuOpen, setIsRowsPerPageMenuOpen] = useState(false);

    // Column Resize Handler
    const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
        e.stopPropagation();
        e.preventDefault();
        const currentWidth = columnWidths[columnKey] || DEFAULT_COLUMN_WIDTHS[columnKey] || 120;
        setResizingColumn({
            key: columnKey,
            startX: e.clientX,
            startWidth: currentWidth,
        });
    };

    useEffect(() => {
        if (!resizingColumn) return;

        const handleMouseMove = (e: MouseEvent) => {
            const delta = e.clientX - resizingColumn.startX;
            const newWidth = Math.max(50, Math.min(800, resizingColumn.startWidth + delta));
            setColumnWidths(prev => ({
                ...prev,
                [resizingColumn.key]: newWidth,
            }));
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

    // Reset Table Widths and Column Layout to System Defaults
    const handleResetLayout = () => {
        setColumnOrder(INITIAL_COLUMNS);
        setVisibleColumns(new Set(DEFAULT_VISIBLE_KEYS));
        setColumnWidths(DEFAULT_COLUMN_WIDTHS);
        saveToStorage(LS_COLUMN_ORDER, INITIAL_COLUMNS.map(c => c.key));
        saveToStorage(LS_VISIBLE_COLUMNS, Array.from(DEFAULT_VISIBLE_KEYS));
        saveToStorage(LS_COLUMN_WIDTHS, DEFAULT_COLUMN_WIDTHS);
    };

    // --- Load preferences from localStorage on mount ---
    useEffect(() => {
        // Visible columns
        const savedVisible = loadFromStorage<string[] | null>(LS_VISIBLE_COLUMNS, null);
        if (savedVisible) setVisibleColumns(new Set(savedVisible));

        // Column order (stored as key strings — rebuild ColumnDef from INITIAL_COLUMNS)
        const savedOrder = loadFromStorage<string[] | null>(LS_COLUMN_ORDER, null);
        if (savedOrder) {
            const colMap = new Map(INITIAL_COLUMNS.map(c => [c.key, c]));
            const restored: ColumnDef[] = [];
            savedOrder.forEach(key => {
                const col = colMap.get(key as keyof DashboardPolicy);
                if (col) restored.push(col);
            });
            // Append any new columns that weren't in saved order
            INITIAL_COLUMNS.forEach(c => {
                if (!restored.find(r => r.key === c.key)) restored.push(c);
            });
            setColumnOrder(restored);
        }

        // Column widths
        const savedWidths = loadFromStorage<Record<string, number> | null>(LS_COLUMN_WIDTHS, null);
        if (savedWidths) {
            setColumnWidths(prev => ({ ...prev, ...savedWidths }));
        }

        // Selected flags — skip restore if URL provides an initial flag filter
        if (!initialFlagFilter) {
            const savedFlags = loadFromStorage<string[] | null>(LS_SELECTED_FLAGS, null);
            if (savedFlags) setSelectedFlags(new Set(savedFlags));
        }

        // Selected statuses
        const savedStatuses = loadFromStorage<string[] | null>(LS_SELECTED_STATUSES, null);
        if (savedStatuses) setSelectedStatuses(new Set(savedStatuses));

        // Enrichment filter
        const savedEnrichment = loadFromStorage<string | null>(LS_ENRICHMENT_FILTER, null);
        if (savedEnrichment && ['all', 'enriched', 'not_enriched'].includes(savedEnrichment)) {
            setEnrichmentFilter(savedEnrichment as 'all' | 'enriched' | 'not_enriched');
        }

        // Document filters
        const savedDocFilters = loadFromStorage<string[] | null>(LS_DOC_FILTER, null);
        if (savedDocFilters) setSelectedDocFilters(new Set(savedDocFilters));

        setPrefsLoaded(true);
    }, []);

    // --- Save preferences to localStorage on change ---
    useEffect(() => {
        if (!prefsLoaded) return;
        saveToStorage(LS_VISIBLE_COLUMNS, Array.from(visibleColumns));
    }, [visibleColumns, prefsLoaded]);

    useEffect(() => {
        if (!prefsLoaded) return;
        saveToStorage(LS_COLUMN_ORDER, columnOrder.map(c => c.key));
    }, [columnOrder, prefsLoaded]);

    useEffect(() => {
        if (!prefsLoaded) return;
        saveToStorage(LS_COLUMN_WIDTHS, columnWidths);
    }, [columnWidths, prefsLoaded]);

    useEffect(() => {
        if (!prefsLoaded) return;
        saveToStorage(LS_SELECTED_FLAGS, Array.from(selectedFlags));
    }, [selectedFlags, prefsLoaded]);

    useEffect(() => {
        if (!prefsLoaded) return;
        saveToStorage(LS_SELECTED_STATUSES, Array.from(selectedStatuses));
    }, [selectedStatuses, prefsLoaded]);

    useEffect(() => {
        if (!prefsLoaded) return;
        saveToStorage(LS_ENRICHMENT_FILTER, enrichmentFilter);
    }, [enrichmentFilter, prefsLoaded]);

    useEffect(() => {
        if (!prefsLoaded) return;
        saveToStorage(LS_DOC_FILTER, Array.from(selectedDocFilters));
    }, [selectedDocFilters, prefsLoaded]);

    // Sync SWR data into local state (for flag extraction & error handling)
    useEffect(() => {
        if (swrData && swrData.length > 0) {
            setData(swrData);
            const codes = new Set<string>();
            swrData.forEach(p => {
                if (p.flags) p.flags.forEach(f => codes.add(f.code));
            });
            setAllFlags(Array.from(codes).sort());
            setError(null);
        } else if (!swrLoading && swrData && swrData.length === 0) {
            setData([]);
            setError('No policies found. Upload and process declarations to see data here.');
        }
        if (swrError) {
            setError(`Failed to fetch data: ${swrError.message}`);
        }
    }, [swrData, swrLoading, swrError]);

    // Listen for background dec page parsing completions to auto-refresh via SWR
    useEffect(() => {
        const handleDecPageParsed = () => {
            logger.info('DataTable', '[DataTable] Dec page parsed, auto-refreshing via SWR...')
            swrRefresh();
        };
        window.addEventListener('decPageParsed', handleDecPageParsed);
        return () => window.removeEventListener('decPageParsed', handleDecPageParsed);
    }, [swrRefresh]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedFlags, selectedStatuses, enrichmentFilter, selectedDocFilters, columnSearchQueries]);

    // Click-outside handler for Status, Columns, and Rows-per-page menus
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (isFlagMenuOpen && flagMenuRef.current && !flagMenuRef.current.contains(e.target as Node)) {
                setIsFlagMenuOpen(false);
            }
            if (isColumnMenuOpen && columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
                setIsColumnMenuOpen(false);
            }
            if (isStatusMenuOpen && statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
                setIsStatusMenuOpen(false);
            }
            if (isEnrichmentMenuOpen && enrichmentMenuRef.current && !enrichmentMenuRef.current.contains(e.target as Node)) {
                setIsEnrichmentMenuOpen(false);
            }
            if (isPaymentStatusMenuOpen && paymentStatusMenuRef.current && !paymentStatusMenuRef.current.contains(e.target as Node)) {
                setIsPaymentStatusMenuOpen(false);
            }
            if (isPaymentPlanMenuOpen && paymentPlanMenuRef.current && !paymentPlanMenuRef.current.contains(e.target as Node)) {
                setIsPaymentPlanMenuOpen(false);
            }
            if (isPolicyActivityMenuOpen && policyActivityMenuRef.current && !policyActivityMenuRef.current.contains(e.target as Node)) {
                setIsPolicyActivityMenuOpen(false);
            }
            if (isDocFilterMenuOpen && docFilterMenuRef.current && !docFilterMenuRef.current.contains(e.target as Node)) {
                setIsDocFilterMenuOpen(false);
            }
            if (isRowsPerPageMenuOpen && rowsPerPageMenuRef.current && !rowsPerPageMenuRef.current.contains(e.target as Node) && rowsPerPageMenuTopRef.current && !rowsPerPageMenuTopRef.current.contains(e.target as Node)) {
                setIsRowsPerPageMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isFlagMenuOpen, isColumnMenuOpen, isStatusMenuOpen, isEnrichmentMenuOpen, isDocFilterMenuOpen, isRowsPerPageMenuOpen, isPaymentStatusMenuOpen, isPaymentPlanMenuOpen, isPolicyActivityMenuOpen]);

    const handleSort = (key: keyof DashboardPolicy, direction: 'asc' | 'desc' | null) => {
        if (direction === null) {
            setSortConfig(null);
        } else {
            setSortConfig({ key, direction });
        }
    };

    // Single-click sort cycling: none → asc → desc → none
    const handleHeaderSortClick = (key: keyof DashboardPolicy) => {
        if (!sortConfig || sortConfig.key !== key) {
            setSortConfig({ key, direction: 'asc' });
        } else if (sortConfig.direction === 'asc') {
            setSortConfig({ key, direction: 'desc' });
        } else {
            setSortConfig(null);
        }
    };

    const toggleColumn = (key: string) => {
        const newSet = new Set(visibleColumns);
        if (newSet.has(key)) {
            newSet.delete(key);
        } else {
            newSet.add(key);
        }
        setVisibleColumns(newSet);
    };

    const toggleFlag = (flag: string) => {
        const newSet = new Set(selectedFlags);
        if (newSet.has(flag)) {
            newSet.delete(flag);
        } else {
            newSet.add(flag);
        }
        setSelectedFlags(newSet);
    };

    const toggleStatus = (status: string) => {
        const newSet = new Set(selectedStatuses);
        if (newSet.has(status)) {
            newSet.delete(status);
        } else {
            newSet.add(status);
        }
        setSelectedStatuses(newSet);
    };

    const togglePaymentStatus = (val: string) => {
        const newSet = new Set(selectedPaymentStatuses);
        if (newSet.has(val)) newSet.delete(val); else newSet.add(val);
        setSelectedPaymentStatuses(newSet);
    };

    const togglePaymentPlan = (val: string) => {
        const newSet = new Set(selectedPaymentPlans);
        if (newSet.has(val)) newSet.delete(val); else newSet.add(val);
        setSelectedPaymentPlans(newSet);
    };

    const togglePolicyActivity = (val: string) => {
        const newSet = new Set(selectedPolicyActivities);
        if (newSet.has(val)) newSet.delete(val); else newSet.add(val);
        setSelectedPolicyActivities(newSet);
    };

    // Right-click or kebab icon opens column popup
    const handleColumnHeaderClick = (e: React.MouseEvent, columnKey: string) => {
        e.stopPropagation();
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).closest('th')!.getBoundingClientRect();
        setPopupPosition({
            top: rect.bottom + 8,
            left: Math.min(rect.left, window.innerWidth - 280)
        });
        setActiveColumnPopup(activeColumnPopup === columnKey ? null : columnKey);
    };

    const handleColumnSearch = (columnKey: string, value: string) => {
        setColumnSearchQueries(prev => ({
            ...prev,
            [columnKey]: value
        }));
    };

    // Check if any filters are active (for the active filters bar)
    const hasActiveFilters = selectedFlags.size > 0 || flagSeverityFilter !== 'all' || selectedStatuses.size > 0 || selectedPaymentStatuses.size > 0 || selectedPaymentPlans.size > 0 || selectedPolicyActivities.size > 0 || enrichmentFilter !== 'all' || selectedDocFilters.size > 0 || Object.values(columnSearchQueries).some(v => v);

    const clearAllFilters = () => {
        setSelectedFlags(new Set());
        setFlagSeverityFilter('all');
        setSelectedStatuses(new Set());
        setSelectedPaymentStatuses(new Set());
        setSelectedPaymentPlans(new Set());
        setSelectedPolicyActivities(new Set());
        setEnrichmentFilter('all');
        setSelectedDocFilters(new Set());
        setColumnSearchQueries({});
        setSearchQuery('');
    };

    // Export CSV - exports currently filtered & sorted data
    const exportCSV = () => {
        const headers = orderedVisibleColumns.map(col => col.label);
        const rows = sortedData.map(row =>
            orderedVisibleColumns.map(col => {
                const val = row[col.key];
                if (col.key === 'flag_count' && row.flags) {
                    return row.flags.map((f: { title: string }) => f.title).join('; ');
                }
                if (val === null || val === undefined) return '';
                return String(val).replace(/"/g, '""');
            })
        );

        const csv = [
            headers.join(','),
            ...rows.map(r => r.map(v => `"${v}"`).join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `policies_export_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // Drag and Drop handlers for column reordering
    const handleDragStart = (e: React.DragEvent, columnKey: string) => {
        setDraggedColumn(columnKey);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, columnKey: string) => {
        e.preventDefault();
        if (draggedColumn && draggedColumn !== columnKey) {
            setDragOverColumn(columnKey);
        }
    };

    const handleDragEnd = () => {
        if (draggedColumn && dragOverColumn) {
            const newOrder = [...columnOrder];
            const draggedIndex = newOrder.findIndex(c => c.key === draggedColumn);
            const targetIndex = newOrder.findIndex(c => c.key === dragOverColumn);

            if (draggedIndex !== -1 && targetIndex !== -1) {
                const [removed] = newOrder.splice(draggedIndex, 1);
                newOrder.splice(targetIndex, 0, removed);
                setColumnOrder(newOrder);
            }
        }
        setDraggedColumn(null);
        setDragOverColumn(null);
    };

    // Move column in the column menu
    const moveColumn = (columnKey: string, direction: 'up' | 'down') => {
        const newOrder = [...columnOrder];
        const index = newOrder.findIndex(c => c.key === columnKey);
        if (direction === 'up' && index > 0) {
            [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
        } else if (direction === 'down' && index < newOrder.length - 1) {
            [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
        }
        setColumnOrder(newOrder);
    };

    const filteredData = useMemo(() => {
        let result = data;

        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            result = result.filter(item => {
                return Object.values(item).some(val =>
                    val && String(val).toLowerCase().includes(lowerQuery)
                );
            });
        }

        Object.entries(columnSearchQueries).forEach(([columnKey, query]) => {
            if (query) {
                const lowerQuery = query.toLowerCase();
                result = result.filter(item => {
                    const val = item[columnKey as keyof DashboardPolicy];
                    if (Array.isArray(val)) {
                        return val.some(v => String(v).toLowerCase().includes(lowerQuery));
                    }
                    return val && String(val).toLowerCase().includes(lowerQuery);
                });
            }
        });

        // Flag severity filter
        if (flagSeverityFilter !== 'all') {
            result = result.filter(item =>
                item.flags?.some(f => f.severity === flagSeverityFilter)
            );
        }

        // Flag code filter (multi-select, stackable)
        if (selectedFlags.size > 0) {
            result = result.filter(item =>
                item.flags?.some(f => selectedFlags.has(f.code))
            );
        }

        // Expiration date range filter (from dashboard drill-down)
        if (initialExpirationFilter?.from || initialExpirationFilter?.to) {
            result = result.filter(item => {
                if (!item.expiration_date) return false;
                const expMs = new Date(item.expiration_date).getTime();
                if (initialExpirationFilter.from && expMs < new Date(initialExpirationFilter.from).getTime()) return false;
                if (initialExpirationFilter.to && expMs >= new Date(initialExpirationFilter.to).getTime()) return false;
                return true;
            });
        }

        // Status filter (from dashboard drill-down)
        if (initialStatusFilter) {
            if (initialStatusFilter === 'pending_review') {
                result = result.filter(item =>
                    item.status === 'pending_review' || item.status === 'unknown'
                );
            } else {
                result = result.filter(item => item.status === initialStatusFilter);
            }
        }

        // Status filter (from status pill multi-select)
        if (selectedStatuses.size > 0) {
            result = result.filter(item => selectedStatuses.has(item.status));
        }

        if (selectedPaymentStatuses.size > 0) {
            result = result.filter(item => item.payment_status && selectedPaymentStatuses.has(item.payment_status));
        }

        if (selectedPaymentPlans.size > 0) {
            result = result.filter(item => item.payment_plan && selectedPaymentPlans.has(item.payment_plan));
        }

        if (selectedPolicyActivities.size > 0) {
            result = result.filter(item => item.policy_activity && selectedPolicyActivities.has(item.policy_activity));
        }

        // Enrichment filter
        if (enrichmentFilter === 'enriched') {
            result = result.filter(item => item.is_enriched);
        } else if (enrichmentFilter === 'not_enriched') {
            result = result.filter(item => !item.is_enriched);
        }

        // Document presence filter
        if (selectedDocFilters.size > 0) {
            result = result.filter(item => {
                for (const f of selectedDocFilters) {
                    switch (f) {
                        case 'has_dec': if (!item.has_dec_page) return false; break;
                        case 'no_dec': if (item.has_dec_page) return false; break;
                        case 'has_rce': if (!item.has_rce) return false; break;
                        case 'no_rce': if (item.has_rce) return false; break;
                        case 'has_dic': if (!item.has_dic) return false; break;
                        case 'no_dic': if (item.has_dic) return false; break;
                        case 'has_es': if (!item.has_es) return false; break;
                        case 'no_es': if (item.has_es) return false; break;
                    }
                }
                return true;
            });
        }

        return result;
    }, [data, searchQuery, selectedFlags, selectedStatuses, selectedPaymentStatuses, selectedPaymentPlans, selectedPolicyActivities, enrichmentFilter, selectedDocFilters, flagSeverityFilter, columnSearchQueries, initialExpirationFilter, initialStatusFilter]);

    const sortedData = useMemo(() => {
        if (!sortConfig) return filteredData;
        return [...filteredData].sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];

            if (aVal === undefined || aVal === null) return 1;
            if (bVal === undefined || bVal === null) return -1;

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredData, sortConfig]);

    const totalPages = Math.ceil(sortedData.length / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedData = sortedData.slice(startIndex, startIndex + rowsPerPage);

    const activeColumnFilters = Object.values(columnSearchQueries).filter(v => v).length;

    // Get visible columns in the current order
    const orderedVisibleColumns = columnOrder.filter(col => visibleColumns.has(col.key));

    // Bulk selection helpers
    const allPageSelected = paginatedData.length > 0 && paginatedData.every(row => selectedRows.has(row.id));
    const somePageSelected = paginatedData.some(row => selectedRows.has(row.id));

    const toggleSelectRow = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const next = new Set(selectedRows);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedRows(next);
    };

    const toggleSelectAllPage = () => {
        if (allPageSelected) {
            const next = new Set(selectedRows);
            paginatedData.forEach(row => next.delete(row.id));
            setSelectedRows(next);
        } else {
            const next = new Set(selectedRows);
            paginatedData.forEach(row => next.add(row.id));
            setSelectedRows(next);
        }
    };

    const exportSelectedCSV = () => {
        const selectedData = sortedData.filter(row => selectedRows.has(row.id));
        const headers = orderedVisibleColumns.map(col => col.label);
        const rows = selectedData.map(row =>
            orderedVisibleColumns.map(col => {
                const val = row[col.key];
                if (col.key === 'flag_count' && row.flags) {
                    return row.flags.map((f: { title: string }) => f.title).join('; ');
                }
                if (val === null || val === undefined) return '';
                return String(val).replace(/"/g, '""');
            })
        );
        const csv = [
            headers.join(','),
            ...rows.map(r => r.map(v => `"${v}"`).join(','))
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `policies_selected_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <>
        <div className="w-full">
            {/* Drill-down filter chips */}
            {filterLabel && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.625rem',
                    padding: '0.625rem 0.875rem',
                    marginBottom: '0.625rem',
                    background: 'var(--accent-primary-muted)',
                    border: '1px solid var(--accent-primary)',
                    borderRadius: 'var(--radius-lg)',
                    fontSize: '0.8rem',
                }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>

                    <span style={{ fontWeight: 600, color: 'var(--text-high)', fontSize: '0.8rem' }}>
                        Filtered:
                    </span>

                    <button
                        onClick={() => router.push('/dashboard')}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            padding: '0.25rem 0.625rem',
                            fontWeight: 600,
                            color: 'var(--accent-primary)',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--accent-primary)',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 150ms ease',
                        }}
                    >
                        {filterLabel}
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>

                    <span style={{
                        marginLeft: 'auto',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                    }}>
                        Showing {filteredData.length} of {data.length} policies
                    </span>
                </div>
            )}
            {/* Controls Bar */}
            <div className={styles.controlsBar}>
                <div className={styles.searchContainer}>
                    <Search className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Search all columns..."
                        className={styles.searchInput}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button className={styles.searchClear} onClick={() => setSearchQuery('')}>
                            <X size={14} />
                        </button>
                    )}
                </div>

                <div className={styles.controlButtons}>
                    {/* Status Filter Pill */}
                    <div style={{ position: 'relative' }} ref={statusMenuRef}>
                        <button
                            onClick={() => setIsStatusMenuOpen(prev => !prev)}
                            className={clsx(
                                styles.pillButton,
                                selectedStatuses.size > 0 && styles.pillButtonActive
                            )}
                        >
                            <CircleDot size={16} />
                            <span>Status</span>
                            {selectedStatuses.size > 0 && (
                                <span className={styles.pillBadge}>{selectedStatuses.size}</span>
                            )}
                            <ChevronDown size={14} />
                        </button>

                        {isStatusMenuOpen && (
                            <div className={styles.dropdownMenu}>
                                <div className={styles.dropdownHeader}>
                                    <span>Filter by Status</span>
                                    {selectedStatuses.size > 0 && (
                                        <button onClick={() => setSelectedStatuses(new Set())} className={styles.clearLink}>
                                            clear all
                                        </button>
                                    )}
                                </div>
                                <div className={styles.statusGrid}>
                                    {ALL_STATUSES.map(s => (
                                        <button
                                            key={s.value}
                                            className={clsx(
                                                styles.statusChip,
                                                selectedStatuses.has(s.value) && styles.statusChipActive
                                            )}
                                            onClick={() => toggleStatus(s.value)}
                                        >
                                            <span className={styles.statusDot} style={{ backgroundColor: s.color }} />
                                            <span>{s.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Flag Filter Pill */}
                    <div style={{ position: 'relative' }} ref={flagMenuRef}>
                        <button
                            onClick={() => setIsFlagMenuOpen(prev => !prev)}
                            className={clsx(
                                styles.pillButton,
                                (selectedFlags.size > 0 || flagSeverityFilter !== 'all') && styles.pillButtonActive
                            )}
                        >
                            <Flag size={16} />
                            <span>Flags</span>
                            {(selectedFlags.size > 0 || flagSeverityFilter !== 'all') && (
                                <span className={styles.pillBadge}>{selectedFlags.size + (flagSeverityFilter !== 'all' ? 1 : 0)}</span>
                            )}
                            <ChevronDown size={14} />
                        </button>

                        {isFlagMenuOpen && (
                            <div className={styles.dropdownMenu}>
                                <div className={styles.dropdownHeader}>
                                    <span>Filter by Flags</span>
                                    {(selectedFlags.size > 0 || flagSeverityFilter !== 'all') && (
                                        <button onClick={() => { setSelectedFlags(new Set()); setFlagSeverityFilter('all'); }} className={styles.clearLink}>
                                            clear all
                                        </button>
                                    )}
                                </div>

                                {/* Priority chips */}
                                <div className={styles.severitySection}>
                                    <div className={styles.severitySectionLabel}>PRIORITY</div>
                                    <div className={styles.severityChips}>
                                        {['all', 'high', 'medium', 'low'].map(sev => (
                                            <button
                                                key={sev}
                                                className={clsx(
                                                    styles.severityChip,
                                                    flagSeverityFilter === sev && styles[`severityChip_${sev}`]
                                                )}
                                                onClick={() => setFlagSeverityFilter(sev)}
                                            >
                                                {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Flag code search */}
                                <div className={styles.flagSearchSection}>
                                    <input
                                        type="text"
                                        placeholder="Search flag types..."
                                        value={flagSearch}
                                        onChange={e => setFlagSearch(e.target.value)}
                                        className={styles.flagSearchInput}
                                    />
                                </div>

                                {/* Flag code checkboxes */}
                                <div className={styles.flagCheckboxList}>
                                    {allFlags.filter(f => !flagSearch || f.toLowerCase().includes(flagSearch.toLowerCase())).length === 0 && (
                                        <div className={styles.dropdownEmpty}>No flags found</div>
                                    )}
                                    {allFlags
                                        .filter(f => !flagSearch || f.toLowerCase().includes(flagSearch.toLowerCase()))
                                        .map(flag => (
                                            <label key={flag} className={styles.dropdownItem}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedFlags.has(flag)}
                                                    onChange={() => toggleFlag(flag)}
                                                />
                                                <span>{flag.replace(/_/g, ' ').toLowerCase()}</span>
                                            </label>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Enrichment Filter Pill */}
                    <div style={{ position: 'relative' }} ref={enrichmentMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsEnrichmentMenuOpen(prev => !prev)}
                            className={clsx(
                                styles.pillButton,
                                enrichmentFilter !== 'all' && styles.pillButtonActive
                            )}
                        >
                            <Satellite size={16} />
                            <span>Property Data</span>
                            {enrichmentFilter !== 'all' && (
                                <span className={styles.pillBadge}>1</span>
                            )}
                            <ChevronDown size={14} />
                        </button>

                        {isEnrichmentMenuOpen && (
                            <div className={styles.dropdownMenu} style={{ minWidth: '190px' }}>
                                <div className={styles.dropdownHeader}>
                                    <span>Property Data</span>
                                </div>
                                {[
                                    { value: 'all' as const, label: 'All Policies' },
                                    { value: 'enriched' as const, label: 'Has Property Data' },
                                    { value: 'not_enriched' as const, label: 'Missing Property Data' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        className={clsx(
                                            styles.popupOption,
                                            enrichmentFilter === opt.value && styles.popupOptionActive
                                        )}
                                        onClick={() => {
                                            setEnrichmentFilter(opt.value);
                                            setIsEnrichmentMenuOpen(false);
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Documents Filter Pill */}
                    <div style={{ position: 'relative' }} ref={docFilterMenuRef}>
                        <button
                            onClick={() => setIsDocFilterMenuOpen(prev => !prev)}
                            className={clsx(
                                styles.pillButton,
                                selectedDocFilters.size > 0 && styles.pillButtonActive
                            )}
                        >
                            <Filter size={16} />
                            <span>Documents</span>
                            {selectedDocFilters.size > 0 && (
                                <span className={styles.pillBadge}>{selectedDocFilters.size}</span>
                            )}
                            <ChevronDown size={14} />
                        </button>

                        {isDocFilterMenuOpen && (
                            <div className={styles.dropdownMenu} style={{ minWidth: '210px' }}>
                                <div className={styles.dropdownHeader}>
                                    <span>Filter by Documents</span>
                                    {selectedDocFilters.size > 0 && (
                                        <button onClick={() => setSelectedDocFilters(new Set())} className={styles.clearLink}>
                                            clear all
                                        </button>
                                    )}
                                </div>
                                {[
                                    { value: 'has_dec', label: '✅ Has Dec Page' },
                                    { value: 'no_dec', label: '❌ Missing Dec Page' },
                                    { value: 'has_rce', label: '✅ Has RCE' },
                                    { value: 'no_rce', label: '❌ Missing RCE' },
                                    { value: 'has_dic', label: '✅ Has DIC' },
                                    { value: 'no_dic', label: '❌ Missing DIC' },
                                    { value: 'has_es', label: '✅ Has E&S' },
                                    { value: 'no_es', label: '❌ Missing E&S' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        className={clsx(
                                            styles.popupOption,
                                            selectedDocFilters.has(opt.value) && styles.popupOptionActive
                                        )}
                                        onClick={() => {
                                            const next = new Set(selectedDocFilters);
                                            if (next.has(opt.value)) next.delete(opt.value);
                                            else next.add(opt.value);
                                            setSelectedDocFilters(next);
                                        }}
                                    >
                                        <CheckSquare size={14} style={{ opacity: selectedDocFilters.has(opt.value) ? 1 : 0.3 }} />
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Policy Activity Filter Pill */}
                    <div style={{ position: 'relative' }} ref={policyActivityMenuRef}>
                        <button
                            onClick={() => setIsPolicyActivityMenuOpen(prev => !prev)}
                            className={clsx(
                                styles.pillButton,
                                selectedPolicyActivities.size > 0 && styles.pillButtonActive
                            )}
                        >
                            <AlertCircle size={16} />
                            <span>Activity</span>
                            {selectedPolicyActivities.size > 0 && (
                                <span className={styles.pillBadge}>{selectedPolicyActivities.size}</span>
                            )}
                            <ChevronDown size={14} />
                        </button>

                        {isPolicyActivityMenuOpen && (
                            <div className={styles.dropdownMenu}>
                                <div className={styles.dropdownHeader}>
                                    <span>Filter by Activity</span>
                                    {selectedPolicyActivities.size > 0 && (
                                        <button onClick={() => setSelectedPolicyActivities(new Set())} className={styles.clearLink}>
                                            clear all
                                        </button>
                                    )}
                                </div>
                                <div className={styles.flagCheckboxList}>
                                    {POLICY_ACTIVITIES.map(activity => (
                                        <label key={activity} className={styles.dropdownItem}>
                                            <input
                                                type="checkbox"
                                                checked={selectedPolicyActivities.has(activity)}
                                                onChange={() => togglePolicyActivity(activity)}
                                            />
                                            <span>{activity}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Payment Status Filter Pill */}
                    <div style={{ position: 'relative' }} ref={paymentStatusMenuRef}>
                        <button
                            onClick={() => setIsPaymentStatusMenuOpen(prev => !prev)}
                            className={clsx(
                                styles.pillButton,
                                selectedPaymentStatuses.size > 0 && styles.pillButtonActive
                            )}
                        >
                            <CheckSquare size={16} />
                            <span>Payment Status</span>
                            {selectedPaymentStatuses.size > 0 && (
                                <span className={styles.pillBadge}>{selectedPaymentStatuses.size}</span>
                            )}
                            <ChevronDown size={14} />
                        </button>

                        {isPaymentStatusMenuOpen && (
                            <div className={styles.dropdownMenu}>
                                <div className={styles.dropdownHeader}>
                                    <span>Filter by Payment</span>
                                    {selectedPaymentStatuses.size > 0 && (
                                        <button onClick={() => setSelectedPaymentStatuses(new Set())} className={styles.clearLink}>
                                            clear all
                                        </button>
                                    )}
                                </div>
                                <div className={styles.flagCheckboxList}>
                                    {PAYMENT_STATUSES.map(status => (
                                        <label key={status} className={styles.dropdownItem}>
                                            <input
                                                type="checkbox"
                                                checked={selectedPaymentStatuses.has(status)}
                                                onChange={() => togglePaymentStatus(status)}
                                            />
                                            <span>{status}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Payment Plan Filter Pill */}
                    <div style={{ position: 'relative' }} ref={paymentPlanMenuRef}>
                        <button
                            onClick={() => setIsPaymentPlanMenuOpen(prev => !prev)}
                            className={clsx(
                                styles.pillButton,
                                selectedPaymentPlans.size > 0 && styles.pillButtonActive
                            )}
                        >
                            <CheckSquare size={16} />
                            <span>Payment Plan</span>
                            {selectedPaymentPlans.size > 0 && (
                                <span className={styles.pillBadge}>{selectedPaymentPlans.size}</span>
                            )}
                            <ChevronDown size={14} />
                        </button>

                        {isPaymentPlanMenuOpen && (
                            <div className={styles.dropdownMenu}>
                                <div className={styles.dropdownHeader}>
                                    <span>Filter by Plan</span>
                                    {selectedPaymentPlans.size > 0 && (
                                        <button onClick={() => setSelectedPaymentPlans(new Set())} className={styles.clearLink}>
                                            clear all
                                        </button>
                                    )}
                                </div>
                                <div className={styles.flagCheckboxList}>
                                    {PAYMENT_PLANS.map(plan => (
                                        <label key={plan} className={styles.dropdownItem}>
                                            <input
                                                type="checkbox"
                                                checked={selectedPaymentPlans.has(plan)}
                                                onChange={() => togglePaymentPlan(plan)}
                                            />
                                            <span>{plan}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Columns */}
                    <div style={{ position: 'relative' }} ref={columnMenuRef}>
                        <button
                            onClick={() => setIsColumnMenuOpen(prev => !prev)}
                            className={styles.pillButton}
                        >
                            <Columns size={16} />
                            <span>Columns</span>
                            <ChevronDown size={14} />
                        </button>

                        {isColumnMenuOpen && (
                            <div className={clsx(styles.dropdownMenu, styles.dropdownMenuRight, styles.columnDropdown)}>
                                <div className={styles.dropdownHeader}>
                                    <span>Manage Columns</span>
                                    <span className={styles.dropdownHint}>Drag to reorder</span>
                                </div>
                                {columnOrder.map((col, index) => (
                                    <div
                                        key={col.key}
                                        className={clsx(
                                            styles.columnItem,
                                            dragOverColumn === col.key && styles.columnItemDragOver
                                        )}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, col.key)}
                                        onDragOver={(e) => handleDragOver(e, col.key)}
                                        onDragEnd={handleDragEnd}
                                        onClick={(e) => {
                                            // Only toggle if the click wasn't on a button or the drag handle
                                            const target = e.target as HTMLElement;
                                            if (!target.closest('button') && !target.closest('.' + styles.dragHandle)) {
                                                toggleColumn(col.key);
                                            }
                                        }}
                                    >
                                        <div className={styles.columnItemLeft}>
                                            <GripVertical size={14} className={styles.dragHandle} />
                                            <input
                                                type="checkbox"
                                                checked={visibleColumns.has(col.key)}
                                                onChange={() => toggleColumn(col.key)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            <span>{col.label}</span>
                                        </div>
                                        <div className={styles.columnItemArrows}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); moveColumn(col.key, 'up'); }}
                                                disabled={index === 0}
                                                className={styles.arrowBtn}
                                            >
                                                <ChevronUp size={12} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); moveColumn(col.key, 'down'); }}
                                                disabled={index === columnOrder.length - 1}
                                                className={styles.arrowBtn}
                                            >
                                                <ChevronDown size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <div style={{ padding: '0.4rem 0.5rem', borderTop: '1px solid var(--border-default)', marginTop: '0.25rem' }}>
                                    <button
                                        onClick={handleResetLayout}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.35rem',
                                            width: '100%', padding: '0.4rem 0.6rem',
                                            fontSize: '0.72rem', fontWeight: 600,
                                            color: 'var(--accent-primary)', background: 'transparent',
                                            border: 'none', borderRadius: '4px',
                                            cursor: 'pointer', textAlign: 'left',
                                        }}
                                        title="Reset column widths, visibility, and ordering to system default"
                                    >
                                        <RotateCcw size={12} />
                                        <span>Reset Widths &amp; Order</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Export CSV */}
                    <button
                        onClick={exportCSV}
                        className={styles.pillButton}
                        title="Export filtered data as CSV"
                    >
                        <Download size={16} />
                        <span>Export CSV</span>
                    </button>
                </div>
            </div>

            {/* Active Filters Bar */}
            {hasActiveFilters && (
                <div className={styles.activeFiltersBar}>
                    <Filter size={14} className={styles.activeFiltersIcon} />
                    <div className={styles.activeFiltersChips}>
                        {/* Status chips */}
                        {Array.from(selectedStatuses).map(status => {
                            const statusInfo = ALL_STATUSES.find(s => s.value === status);
                            return (
                                <span key={`status-${status}`} className={styles.filterChip}>
                                    <span className={styles.filterChipDot} style={{ backgroundColor: statusInfo?.color || '#64748b' }} />
                                    {statusInfo?.label || status}
                                    <button onClick={() => toggleStatus(status)} className={styles.filterChipX}><X size={11} /></button>
                                </span>
                            );
                        })}
                        {/* Priority chip */}
                        {flagSeverityFilter !== 'all' && (
                            <span className={styles.filterChip}>
                                Priority: {flagSeverityFilter.charAt(0).toUpperCase() + flagSeverityFilter.slice(1)}
                                <button onClick={() => setFlagSeverityFilter('all')} className={styles.filterChipX}><X size={11} /></button>
                            </span>
                        )}
                        {/* Flag chips */}
                        {Array.from(selectedFlags).map(flag => (
                            <span key={`flag-${flag}`} className={styles.filterChip}>
                                {flag.replace(/_/g, ' ').toLowerCase()}
                                <button onClick={() => toggleFlag(flag)} className={styles.filterChipX}><X size={11} /></button>
                            </span>
                        ))}
                        {/* Enrichment chip */}
                        {enrichmentFilter !== 'all' && (
                            <span className={styles.filterChip}>
                                {enrichmentFilter === 'enriched' ? 'Has Property Data' : 'Missing Property Data'}
                                <button onClick={() => setEnrichmentFilter('all')} className={styles.filterChipX}><X size={11} /></button>
                            </span>
                        )}
                        {/* Document filter chips */}
                        {Array.from(selectedDocFilters).map(f => {
                            const labels: Record<string, string> = {
                                has_dec: 'Has Dec Page', no_dec: 'Missing Dec Page',
                                has_rce: 'Has RCE', no_rce: 'Missing RCE',
                                has_dic: 'Has DIC', no_dic: 'Missing DIC',
                                has_es: 'Has E&S', no_es: 'Missing E&S',
                            };
                            return (
                                <span key={`doc-${f}`} className={styles.filterChip}>
                                    {labels[f] || f}
                                    <button onClick={() => {
                                        const next = new Set(selectedDocFilters);
                                        next.delete(f);
                                        setSelectedDocFilters(next);
                                    }} className={styles.filterChipX}><X size={11} /></button>
                                </span>
                            );
                        })}
                        {/* Column search chips */}
                        {Object.entries(columnSearchQueries).filter(([, v]) => v).map(([key, value]) => {
                            const col = columnOrder.find(c => c.key === key);
                            return (
                                <span key={`col-${key}`} className={styles.filterChip}>
                                    {col?.label || key}: &ldquo;{value}&rdquo;
                                    <button onClick={() => handleColumnSearch(key, '')} className={styles.filterChipX}><X size={11} /></button>
                                </span>
                            );
                        })}
                    </div>
                    <button className={styles.clearAllLink} onClick={clearAllFilters}>Clear all</button>
                    <span className={styles.filterResultCount}>
                        {filteredData.length} of {data.length}
                    </span>
                </div>
            )}

            {/* Bulk Action Bar */}
            {selectedRows.size > 0 && (
                <div className={styles.bulkActionBar}>
                    <span>{selectedRows.size} selected</span>
                    <button
                        onClick={exportSelectedCSV}
                        className={styles.pillButton}
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                    >
                        <Download size={14} />
                        <span>Export Selected</span>
                    </button>
                    <button
                        onClick={() => setIsWorkupOpen(true)}
                        className={styles.pillButton}
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                    >
                        <Zap size={14} />
                        <span>Full Analysis</span>
                    </button>
                    <button onClick={() => setSelectedRows(new Set())} className={styles.bulkClearBtn}>
                        <X size={14} /> Clear
                    </button>
                </div>
            )}

            <Card className={styles.container}>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead className={styles.thead}>
                            <tr>
                                <th className={styles.th} style={{ width: 40, minWidth: 40 }}>
                                    <input
                                        type="checkbox"
                                        checked={allPageSelected}
                                        ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                                        onChange={toggleSelectAllPage}
                                        style={{ accentColor: 'var(--accent-primary)', cursor: 'pointer', width: 16, height: 16 }}
                                    />
                                </th>
                                {orderedVisibleColumns.map((col) => {
                                    const colWidth = columnWidths[col.key] || DEFAULT_COLUMN_WIDTHS[col.key] || 120;
                                    return (
                                        <th
                                            key={col.key}
                                            className={clsx(
                                                styles.th,
                                                styles.thClickable,
                                                columnSearchQueries[col.key] && styles.thFiltered,
                                                draggedColumn === col.key && styles.thDragging,
                                                resizingColumn?.key === col.key && styles.thResizing
                                            )}
                                            onClick={() => handleHeaderSortClick(col.key as keyof DashboardPolicy)}
                                            style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                                            draggable={!resizingColumn}
                                            onDragStart={(e) => handleDragStart(e, col.key)}
                                            onDragOver={(e) => handleDragOver(e, col.key)}
                                            onDragEnd={handleDragEnd}
                                        >
                                            <div className={styles.thInner}>
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</span>
                                                <div className={styles.sortIcon}>
                                                    {sortConfig?.key === col.key ? (
                                                        sortConfig.direction === 'asc'
                                                            ? <ArrowUp size={14} className={styles.sortActive} />
                                                            : <ArrowDown size={14} className={styles.sortActive} />
                                                    ) : (
                                                        <ArrowUpDown size={12} className={styles.sortInactive} />
                                                    )}
                                                </div>
                                                {columnSearchQueries[col.key] && (
                                                    <div className={styles.columnFilterIndicator}>
                                                        <Search size={10} />
                                                    </div>
                                                )}
                                                <button
                                                    className={styles.headerKebab}
                                                    onClick={(e) => handleColumnHeaderClick(e, col.key)}
                                                    title="Column options"
                                                >
                                                    <MoreVertical size={14} />
                                                </button>
                                            </div>

                                            {/* Drag to resize column width handle */}
                                            <div
                                                className={clsx(styles.colResizer, resizingColumn?.key === col.key && styles.colResizerActive)}
                                                onMouseDown={(e) => handleResizeStart(e, col.key)}
                                                onClick={(e) => e.stopPropagation()}
                                                title="Drag to resize column width"
                                            />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedData.map((row, idx) => {
                                const tooltipParts = [];
                                if (row.annual_premium) tooltipParts.push(`Premium: $${Number(row.annual_premium).toLocaleString()}`);
                                if (row.flag_count > 0) tooltipParts.push(`${row.flag_count} flag${row.flag_count > 1 ? 's' : ''}`);
                                tooltipParts.push(row.is_enriched ? 'Property Data Checked ✓' : 'Missing Property Data');
                                if (row.expiration_date) {
                                    const d = new Date(row.expiration_date);
                                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                                    const dd = String(d.getDate()).padStart(2, '0');
                                    const yy = String(d.getFullYear()).slice(-2);
                                    tooltipParts.push(`Exp: ${mm}-${dd}-${yy}`);
                                }
                                const tooltip = tooltipParts.join(' · ') || undefined;

                                return (
                                <tr
                                    key={`${row.id}-${idx}`}
                                    className={`${styles.tr} cursor-pointer`}
                                    onClick={() => router.push(`/policy/${row.id}`)}
                                    title={tooltip}
                                    style={selectedRows.has(row.id) ? { background: 'rgba(99, 102, 241, 0.06)' } : undefined}
                                >
                                    <td className={styles.td} style={{ width: 40, minWidth: 40, maxWidth: 40 }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedRows.has(row.id)}
                                            onChange={() => {}}
                                            onClick={(e) => toggleSelectRow(row.id, e)}
                                            style={{ accentColor: 'var(--accent-primary)', cursor: 'pointer', width: 16, height: 16 }}
                                        />
                                    </td>
                                    {orderedVisibleColumns.map(col => {
                                        const colWidth = columnWidths[col.key] || DEFAULT_COLUMN_WIDTHS[col.key] || 120;
                                        return (
                                        <td
                                            key={col.key}
                                            className={styles.td}
                                            style={{
                                                width: colWidth,
                                                minWidth: colWidth,
                                                maxWidth: colWidth,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {col.key === 'policy_number' ? (
                                                <span className="font-medium text-blue-600">{row[col.key]}</span>
                                            ) : col.key === 'named_insured' ? (
                                                <span
                                                    className={styles.clientLink}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/client/${row.client_id}`);
                                                    }}
                                                >
                                                    {row.named_insured}
                                                </span>
                                            ) : col.key === 'status' ? (
                                                <span className={clsx(
                                                    styles.badge,
                                                    row.status === 'unknown' && styles.badgeGray,
                                                    row.status === 'active' && styles.badgeApproved,
                                                    row.status === 'expired' && styles.badgeRejected,
                                                    row.status === 'pending' && styles.badgePending,
                                                    row.status === 'pending_review' && styles.badgePending,
                                                    row.status === 'in_progress' && styles.badgePending,
                                                    row.status === 'reviewed' && styles.badgeApproved,
                                                    row.status === 'cancelled' && styles.badgeRejected,
                                                    row.status === 'non_renewed' && styles.badgeGray,
                                                )}>
                                                    {row.status?.replace(/_/g, ' ')}
                                                </span>
                                            ) : col.key === 'flag_count' ? (
                                                (() => {
                                                    const flags = row.flags as Array<{ code: string; title: string; severity: string }> | undefined;
                                                    const count = flags?.length || row.flag_count || 0;
                                                    if (count === 0) return <span className={styles.flagCountNone}>—</span>;

                                                    // Determine highest priority for coloring
                                                    const sevOrder = ['high', 'medium', 'low'];
                                                    const highest = flags
                                                        ? sevOrder.find(s => flags.some(f => f.severity === s)) || 'low'
                                                        : (row.highest_severity || 'low');

                                                    // Build tooltip with all flag titles
                                                    const tip = flags
                                                        ? flags.map(f => f.title).join('\n')
                                                        : `${count} flag${count > 1 ? 's' : ''}`;

                                                    return (
                                                        <span
                                                            className={clsx(
                                                                styles.flagCompactBadge,
                                                                highest === 'high' && styles.flagCompactCritical,
                                                                highest === 'medium' && styles.flagCompactWarning,
                                                                highest === 'low' && styles.flagCompactInfo,
                                                            )}
                                                            title={tip}
                                                        >
                                                            <Flag size={12} />
                                                            <span>{count}</span>
                                                        </span>
                                                    );
                                                })()
                                            ) : col.key === 'is_enriched' ? (
                                                row.is_enriched ? (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#22c55e', fontSize: '0.75rem', fontWeight: 500 }}>
                                                        <Satellite size={12} />
                                                        ✓
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#475569', fontSize: '0.75rem' }}>—</span>
                                                )
                                            ) : (col.key === 'has_dec_page' || col.key === 'has_rce' || col.key === 'has_dic' || col.key === 'has_es') ? (
                                                row[col.key] ? (
                                                    <span style={{ display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: 'rgba(34,197,94,0.12)', color: '#16a34a', lineHeight: 1.4 }}>Yes</span>
                                                ) : (
                                                    <span style={{ display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: 'rgba(239,68,68,0.10)', color: '#dc2626', lineHeight: 1.4 }}>No</span>
                                                )
                                            ) : (col.key === 'effective_date' || col.key === 'expiration_date') && row[col.key] ? (
                                                (() => {
                                                    const d = new Date(row[col.key] as string);
                                                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                                                    const dd = String(d.getDate()).padStart(2, '0');
                                                    const yy = String(d.getFullYear()).slice(-2);
                                                    return `${mm}-${dd}-${yy}`;
                                                })()
                                            ) : col.key === 'created_at' && row[col.key] ? (
                                                (() => {
                                                    const d = new Date(row[col.key] as string);
                                                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                                                    const dd = String(d.getDate()).padStart(2, '0');
                                                    const yy = String(d.getFullYear()).slice(-2);
                                                    return `${mm}-${dd}-${yy}`;
                                                })()
                                            ) : (
                                                (row[col.key] ?? '') as React.ReactNode
                                            )}
                                        </td>
                                        );
                                    })}
                                </tr>
                                );
                            })}
                            {loading && (
                                <>
                                    {Array.from({ length: 8 }).map((_, i) => (
                                        <tr key={`skel-${i}`} className={styles.tr} style={{ pointerEvents: 'none' }}>
                                            <td className={styles.td} style={{ width: 40, minWidth: 40, maxWidth: 40 }}>
                                                <div style={{
                                                    width: 16, height: 16, borderRadius: 3,
                                                    background: 'var(--bg-elevated, #1e293b)',
                                                    animation: 'shimmer 1.5s ease-in-out infinite',
                                                    animationDelay: `${i * 0.07}s`,
                                                }} />
                                            </td>
                                            {orderedVisibleColumns.map((col, ci) => {
                                                const colWidth = columnWidths[col.key] || DEFAULT_COLUMN_WIDTHS[col.key] || 120;
                                                return (
                                                <td key={col.key} className={styles.td} style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}>
                                                    <div style={{
                                                        height: 14,
                                                        width: ci === 0 ? '60%' : ci === 1 ? '80%' : '50%',
                                                        borderRadius: 4,
                                                        background: 'var(--bg-elevated, #1e293b)',
                                                        opacity: 1 - (i * 0.08),
                                                        animation: 'shimmer 1.5s ease-in-out infinite',
                                                        animationDelay: `${i * 0.07 + ci * 0.03}s`,
                                                    }} />
                                                </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                    <tr>
                                        <td colSpan={orderedVisibleColumns.length + 1} style={{
                                            padding: '0.75rem 1rem',
                                            textAlign: 'center',
                                            fontSize: '0.75rem',
                                            color: 'var(--text-muted)',
                                            letterSpacing: '0.02em',
                                            borderTop: '1px solid var(--border-subtle)',
                                        }}>
                                            Loading policies…
                                        </td>
                                    </tr>
                                    <style>{`
                                        @keyframes shimmer {
                                            0%, 100% { opacity: 0.15; }
                                            50% { opacity: 0.35; }
                                        }
                                    `}</style>
                                </>
                            )}
                            {!loading && error && (
                                <tr>
                                    <td colSpan={orderedVisibleColumns.length + 1} style={{
                                        padding: '2.5rem 1rem',
                                        textAlign: 'center',
                                    }}>
                                        <div style={{
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', gap: '0.5rem',
                                        }}>
                                            <AlertCircle size={28} style={{ color: '#ef4444', opacity: 0.8 }} />
                                            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#ef4444' }}>
                                                Unable to load policies
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                Please refresh the page or contact support if this persists.
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!loading && !error && paginatedData.length === 0 && (
                                <tr>
                                    <td colSpan={orderedVisibleColumns.length + 1} style={{
                                        padding: '2.5rem 1rem',
                                        textAlign: 'center',
                                    }}>
                                        <div style={{
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', gap: '0.5rem',
                                        }}>
                                            <Search size={24} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                                            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                                No policies match your current filters
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Column Header Popups */}
            {orderedVisibleColumns.map(col => (
                <ColumnPopup
                    key={col.key}
                    column={col}
                    isOpen={activeColumnPopup === col.key}
                    onClose={() => setActiveColumnPopup(null)}
                    onSort={(direction) => handleSort(col.key, direction)}
                    onHide={() => {
                        toggleColumn(col.key);
                        setActiveColumnPopup(null);
                    }}
                    currentSort={sortConfig}
                    columnSearch={columnSearchQueries[col.key] || ''}
                    onColumnSearch={(value) => handleColumnSearch(col.key, value)}
                    position={popupPosition}
                />
            ))}

            {/* Pagination Controls */}
            <div className={styles.paginationBar}>
                <div className={styles.paginationInfo}>
                    Showing <strong>{sortedData.length === 0 ? 0 : startIndex + 1}</strong>–<strong>{Math.min(startIndex + rowsPerPage, sortedData.length)}</strong> of <strong>{sortedData.length}</strong> results
                </div>

                <div className={styles.paginationControls}>
                    <div className={styles.rowsPerPage} ref={rowsPerPageMenuRef}>
                        <button
                            className={styles.rowsPerPageButton}
                            onClick={() => setIsRowsPerPageMenuOpen(prev => !prev)}
                        >
                            <span>{rowsPerPage} per page</span>
                            <ChevronDown size={14} />
                        </button>

                        {isRowsPerPageMenuOpen && (
                            <div className={styles.rowsPerPageMenu}>
                                {[5, 10, 25, 50, 100].map(option => (
                                    <button
                                        key={option}
                                        className={clsx(
                                            styles.rowsPerPageOption,
                                            rowsPerPage === option && styles.rowsPerPageOptionActive
                                        )}
                                        onClick={() => {
                                            setRowsPerPage(option);
                                            setCurrentPage(1);
                                            setIsRowsPerPageMenuOpen(false);
                                        }}
                                    >
                                        {option}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <span className={styles.pageIndicator}>
                        Page {currentPage} of {Math.max(1, totalPages)}
                    </span>

                    <div className={styles.pageButtons}>
                        <button
                            className={styles.pageButton}
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(1)}
                            title="First page"
                        >
                            <ChevronFirst size={16} />
                        </button>
                        <button
                            className={styles.pageButton}
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        >
                            Previous
                        </button>
                        <button
                            className={styles.pageButton}
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        >
                            Next
                        </button>
                        <button
                            className={styles.pageButton}
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage(totalPages)}
                            title="Last page"
                        >
                            <ChevronLast size={16} />
                        </button>
                    </div>
                </div>
            </div>


        </div>

            {/* Floating Bulk Action Bar */}
            {selectedRows.size > 0 && (
                <div style={{
                    position: 'fixed',
                    bottom: '2rem',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--bg-surface-raised)',
                    border: '1px solid var(--accent-primary)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    zIndex: 100,
                    animation: 'slideUp 0.3s ease-out'
                }}>
                    <style>{`
                        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
                    `}</style>
                    <span style={{ fontWeight: 600, color: 'var(--text-high)' }}>
                        {selectedRows.size} policy{selectedRows.size !== 1 && 's'} selected
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem', borderLeft: '1px solid var(--border-default)', paddingLeft: '1rem' }}>
                        <Button 
                            variant="primary" 
                            size="sm" 
                            onClick={() => setIsWorkupOpen(true)}
                        >
                            Open Worksheets
                        </Button>
                        <Button 
                            variant="secondary" 
                            size="sm"
                            disabled={isBulkUpdating}
                            onClick={handleBulkMarkReviewed}
                        >
                            <CheckSquare size={14} style={{ marginRight: '0.25rem' }} />
                            {isBulkUpdating ? 'Updating...' : 'Mark as Reviewed'}
                        </Button>
                        <button
                            onClick={() => setSelectedRows(new Set())}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '0.5rem', padding: '0.25rem' }}
                            title="Clear Selection"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Full Workup Modal */}
            <FullWorkupModal
                isOpen={isWorkupOpen}
                onClose={() => { setIsWorkupOpen(false); setSelectedRows(new Set()); }}
                policyIds={Array.from(selectedRows)}
                onComplete={() => {
                    // Refresh table data via SWR cache
                    swrRefresh();
                }}
            />
        </>
    );
}
