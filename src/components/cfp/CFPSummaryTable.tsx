'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
    Filter,
    FileText,
    AlertCircle,
    ShieldAlert,
    ShieldOff,
    FileQuestion,
    Plus,
    Copy,
    ChevronLeft,
    ChevronRight,
    MoveHorizontal,
    Pin,
    PinOff,
} from 'lucide-react';
import type { CFPFamily, CFPTermRow } from '@/app/api/cfp-summary/route';
import styles from './CFPSummaryTable.module.scss';
import { supabase } from '@/lib/supabaseClient';
import { exportCFPToExcel } from '@/lib/cfpExport';
import {
    getPlatformDocDownloadUrl,
    getDecPageFileDownloadUrl,
    fetchDecPageFilesByPolicyId,
    fetchPlatformDocumentsByPolicyId,
} from '@/lib/api';

export interface ColumnFilters {
    policy?: string;
    insured?: string;
    address?: string;
    dec?: string;
    rce?: string;
    dic?: string;
    quote?: string;
    bamboo?: string;
}

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
    | 'bamboo';

interface ColumnDef {
    key: CFPColumnKey;
    label: string;
    width: number;
    minWidth: number;
    align?: 'left' | 'center' | 'right';
}

const DEFAULT_COLUMNS: ColumnDef[] = [
    { key: 'policy', label: 'CFP Number', width: 180, minWidth: 130, align: 'left' },
    { key: 'insured', label: 'Named Insured', width: 155, minWidth: 100, align: 'left' },
    { key: 'address', label: 'Property Address', width: 210, minWidth: 120, align: 'left' },
    { key: 'effective', label: 'Effective', width: 95, minWidth: 80, align: 'left' },
    { key: 'expiration', label: 'Expiration', width: 95, minWidth: 80, align: 'left' },
    { key: 'premium', label: 'Premium', width: 95, minWidth: 70, align: 'left' },
    { key: 'dec', label: 'DEC Page', width: 85, minWidth: 70, align: 'center' },
    { key: 'rce', label: 'RCE', width: 100, minWidth: 75, align: 'center' },
    { key: 'dic', label: 'DIC', width: 100, minWidth: 75, align: 'center' },
    { key: 'quote', label: 'Quote / E&S', width: 95, minWidth: 70, align: 'center' },
    { key: 'bamboo', label: 'Bamboo Coverage', width: 130, minWidth: 90, align: 'center' },
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
    view?: 'active_cfp' | 'bamboo_pipeline' | 'all';
    onYearChange: (y: string) => void;
    onMonthChange: (m: string) => void;
    onSearchChange: (s: string) => void;
    onViewChange?: (v: 'active_cfp' | 'bamboo_pipeline' | 'all') => void;
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

function renderCarrierBadge(
    carrier: string | null | undefined,
    docName: 'RCE' | 'DIC',
    policyId?: string,
    onPreview?: () => void
) {
    if (!carrier) {
        return (
            <Link
                href={`/upload-document?policy_id=${policyId || ''}&doc_type=${docName.toLowerCase()}`}
                className={`${styles.docBadge} ${styles.no}`}
                title={`Missing ${docName} — click to upload`}
                target="_blank"
            >
                <Plus size={12} /> None
            </Link>
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
        <button
            type="button"
            className={`${styles.carrierBadge} ${badgeClass} ${styles.clickableBadge}`}
            onClick={(e) => {
                e.stopPropagation();
                onPreview?.();
            }}
            title={`Click to preview ${docName} (${displayLabel})`}
        >
            <Check size={12} /> {displayLabel}
        </button>
    );
}

export function CFPSummaryTable({
    families: initialFamilies,
    loading,
    year,
    month,
    search,
    view = 'active_cfp',
    onYearChange,
    onMonthChange,
    onSearchChange,
    onViewChange,
    onRefresh,
    totalTerms,
    totalFamilies,
}: CFPSummaryTableProps) {
    // Local copy of families to support optimistic updates for Bamboo toggle
    const [families, setFamilies] = useState<CFPFamily[]>(initialFamilies);

    // Synchronize local families state when initialFamilies prop updates (e.g. Month, Year, Search or View changes)
    useEffect(() => {
        setFamilies(initialFamilies);
    }, [initialFamilies]);

    const [docFilter, setDocFilter] = useState<DocFilterType>('all');
    const [togglingPolicyId, setTogglingPolicyId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 25;

    // Feedback state for quick copy buttons
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const handleCopy = (text: string, key: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => {
            setCopiedKey(prev => (prev === key ? null : prev));
        }, 1500);
    };

    // ── Document Preview Modal State ──────────────────────────────────────
    interface DocPreviewState {
        title: string;
        subtitle?: string;
        fileName?: string;
        policyId?: string;
        docType?: 'dec' | 'rce' | 'dic' | 'quote';
        url: string | null;
        loading: boolean;
        error: string | null;
    }

    const [previewDoc, setPreviewDoc] = useState<DocPreviewState | null>(null);

    const handlePreviewDoc = async (opts: {
        title: string;
        subtitle?: string;
        docType: 'dec' | 'rce' | 'dic' | 'quote';
        storagePath?: string | null;
        bucket: 'cfp-platform-documents' | 'cfp-raw-decpage';
        fileName?: string | null;
        policyId: string;
    }) => {
        setPreviewDoc({
            title: opts.title,
            subtitle: opts.subtitle,
            fileName: opts.fileName || undefined,
            policyId: opts.policyId,
            docType: opts.docType,
            url: null,
            loading: true,
            error: null,
        });

        try {
            let path = opts.storagePath;
            let bucket = opts.bucket;

            // If storagePath not present on row, try finding it dynamically
            if (!path) {
                if (opts.docType === 'dec') {
                    const decFiles = await fetchDecPageFilesByPolicyId(opts.policyId);
                    if (decFiles.length > 0 && decFiles[0].storage_path) {
                        path = decFiles[0].storage_path;
                        bucket = 'cfp-raw-decpage';
                    }
                } else {
                    const platDocs = await fetchPlatformDocumentsByPolicyId(opts.policyId);
                    const targetDocType = opts.docType === 'rce' ? 'rce' : (opts.docType === 'dic' ? 'dic_dec_page' : 'es_doc');
                    const match = platDocs.find(d => d.doc_type === targetDocType && d.storage_path);
                    if (match?.storage_path) {
                        path = match.storage_path;
                        bucket = 'cfp-platform-documents';
                    }
                }
            }

            if (!path) {
                setPreviewDoc(prev => prev ? {
                    ...prev,
                    loading: false,
                    error: 'Document record is logged in the system, but the file has not been uploaded to cloud storage yet.',
                } : null);
                return;
            }

            let url: string | null = null;
            if (bucket === 'cfp-raw-decpage') {
                url = await getDecPageFileDownloadUrl(path);
            } else {
                url = await getPlatformDocDownloadUrl(path, bucket);
            }

            if (!url) {
                setPreviewDoc(prev => prev ? {
                    ...prev,
                    loading: false,
                    error: 'Could not generate a secure preview link for this document.',
                } : null);
                return;
            }

            setPreviewDoc(prev => prev ? {
                ...prev,
                url,
                loading: false,
                error: null,
            } : null);
        } catch (err) {
            setPreviewDoc(prev => prev ? {
                ...prev,
                loading: false,
                error: err instanceof Error ? err.message : 'An error occurred while loading the document preview.',
            } : null);
        }
    };

    // Close preview modal on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && previewDoc) {
                setPreviewDoc(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [previewDoc]);

    // ── Column-Specific Filters State ─────────────────────────────────────
    const [showColumnFilters, setShowColumnFilters] = useState(true);
    const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});

    const activeFilterCount = useMemo(() => {
        return Object.values(columnFilters).filter(Boolean).length;
    }, [columnFilters]);

    const handleColumnFilterChange = (key: keyof ColumnFilters, value: string) => {
        setColumnFilters(prev => ({
            ...prev,
            [key]: value || undefined,
        }));
        setCurrentPage(1);
    };

    const handleClearColumnFilters = () => {
        setColumnFilters({});
        setCurrentPage(1);
    };

    // ── Column Reorder & Resize State ─────────────────────────────────────
    const [columnOrder, setColumnOrder] = useState<CFPColumnKey[]>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('cfp_summary_column_order');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed)) {
                        const filtered = parsed.filter((k: string): k is CFPColumnKey =>
                            DEFAULT_COLUMN_KEYS.includes(k as CFPColumnKey)
                        );
                        if (filtered.length === DEFAULT_COLUMN_KEYS.length) {
                            return filtered;
                        }
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

    // Filter terms based on docFilter pill AND column-specific filters
    const filteredTerms = useMemo(() => {
        let result = allTerms;

        // 1. DocFilter pill
        if (docFilter !== 'all') {
            result = result.filter(t => {
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
        }

        // 2. Column-specific filters
        if (columnFilters.policy) {
            if (columnFilters.policy === 'available') {
                result = result.filter(t => 
                    !t.is_pending_dec && 
                    !!t.policy_number && 
                    !t.policy_number.toLowerCase().includes('pending') && 
                    t.policy_number.trim() !== '' && 
                    t.policy_number.trim() !== '—'
                );
            } else if (columnFilters.policy === 'not_available') {
                result = result.filter(t => 
                    t.is_pending_dec || 
                    !t.policy_number || 
                    t.policy_number.toLowerCase().includes('pending') || 
                    t.policy_number.trim() === '' || 
                    t.policy_number.trim() === '—'
                );
            }
        }

        if (columnFilters.insured) {
            if (columnFilters.insured === 'available') {
                result = result.filter(t => 
                    !!t.named_insured && 
                    t.named_insured.trim() !== '' && 
                    t.named_insured.trim() !== '—' && 
                    t.named_insured.trim().toLowerCase() !== 'unknown'
                );
            } else if (columnFilters.insured === 'not_available') {
                result = result.filter(t => 
                    !t.named_insured || 
                    t.named_insured.trim() === '' || 
                    t.named_insured.trim() === '—' || 
                    t.named_insured.trim().toLowerCase() === 'unknown'
                );
            }
        }

        if (columnFilters.address) {
            if (columnFilters.address === 'available') {
                result = result.filter(t => 
                    !!t.property_address && 
                    t.property_address.trim() !== '' && 
                    t.property_address.trim() !== '—' && 
                    t.property_address.trim().toLowerCase() !== 'unknown'
                );
            } else if (columnFilters.address === 'not_available') {
                result = result.filter(t => 
                    !t.property_address || 
                    t.property_address.trim() === '' || 
                    t.property_address.trim() === '—' || 
                    t.property_address.trim().toLowerCase() === 'unknown'
                );
            }
        }

        if (columnFilters.dec) {
            if (columnFilters.dec === 'uploaded') {
                result = result.filter(t => t.has_dec);
            } else if (columnFilters.dec === 'missing') {
                result = result.filter(t => !t.has_dec);
            }
        }

        if (columnFilters.rce) {
            if (columnFilters.rce === 'has_rce') {
                result = result.filter(t => t.has_rce || !!t.rce_carrier);
            } else if (columnFilters.rce === 'missing') {
                result = result.filter(t => !t.has_rce && !t.rce_carrier);
            } else if (columnFilters.rce === 'Bamboo') {
                result = result.filter(t => t.rce_carrier?.toLowerCase() === 'bamboo');
            } else if (columnFilters.rce === 'AM') {
                result = result.filter(t => {
                    const c = t.rce_carrier?.toLowerCase();
                    return c === 'am' || c === 'american modern';
                });
            } else if (columnFilters.rce === 'Aegis') {
                result = result.filter(t => t.rce_carrier?.toLowerCase() === 'aegis');
            } else if (columnFilters.rce === 'SageSure') {
                result = result.filter(t => t.rce_carrier?.toLowerCase() === 'sagesure');
            } else if (columnFilters.rce === 'PSIC') {
                result = result.filter(t => t.rce_carrier?.toLowerCase() === 'psic');
            } else if (columnFilters.rce === 'Other') {
                result = result.filter(t => {
                    if (!t.rce_carrier) return false;
                    const c = t.rce_carrier.toLowerCase();
                    return !['bamboo', 'am', 'american modern', 'aegis', 'sagesure', 'psic'].includes(c);
                });
            }
        }

        if (columnFilters.dic) {
            if (columnFilters.dic === 'has_dic') {
                result = result.filter(t => t.has_dic || !!t.dic_carrier);
            } else if (columnFilters.dic === 'missing') {
                result = result.filter(t => !t.has_dic && !t.dic_carrier);
            } else if (columnFilters.dic === 'Bamboo') {
                result = result.filter(t => t.dic_carrier?.toLowerCase() === 'bamboo');
            } else if (columnFilters.dic === 'AM') {
                result = result.filter(t => {
                    const c = t.dic_carrier?.toLowerCase();
                    return c === 'am' || c === 'american modern';
                });
            } else if (columnFilters.dic === 'Aegis') {
                result = result.filter(t => t.dic_carrier?.toLowerCase() === 'aegis');
            } else if (columnFilters.dic === 'SageSure') {
                result = result.filter(t => t.dic_carrier?.toLowerCase() === 'sagesure');
            } else if (columnFilters.dic === 'PSIC') {
                result = result.filter(t => t.dic_carrier?.toLowerCase() === 'psic');
            } else if (columnFilters.dic === 'Other') {
                result = result.filter(t => {
                    if (!t.dic_carrier) return false;
                    const c = t.dic_carrier.toLowerCase();
                    return !['bamboo', 'am', 'american modern', 'aegis', 'sagesure', 'psic'].includes(c);
                });
            }
        }

        if (columnFilters.quote) {
            if (columnFilters.quote === 'uploaded') {
                result = result.filter(t => t.has_es);
            } else if (columnFilters.quote === 'missing') {
                result = result.filter(t => !t.has_es);
            }
        }

        if (columnFilters.bamboo) {
            if (columnFilters.bamboo === 'yes') {
                result = result.filter(t => t.has_bamboo_coverage);
            } else if (columnFilters.bamboo === 'no') {
                result = result.filter(t => !t.has_bamboo_coverage);
            }
        }

        return result;
    }, [allTerms, docFilter, columnFilters]);

    // Quick summary statistics for the filtered month & year
    const periodStats = useMemo(() => {
        const total = allTerms.length;
        let decAvailable = 0;
        let rceAvailable = 0;
        let dicAvailable = 0;
        let quoteAvailable = 0;

        for (const t of allTerms) {
            if (t.has_dec) decAvailable++;
            if (t.has_rce || t.rce_carrier) rceAvailable++;
            if (t.has_dic || t.dic_carrier) dicAvailable++;
            if (t.has_es) quoteAvailable++;
        }

        return {
            total,
            decAvailable,
            decMissing: Math.max(0, total - decAvailable),
            rceAvailable,
            rceMissing: Math.max(0, total - rceAvailable),
            dicAvailable,
            dicMissing: Math.max(0, total - dicAvailable),
            quoteAvailable,
            quoteMissing: Math.max(0, total - quoteAvailable),
        };
    }, [allTerms]);

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
            if (columnFilters.policy) parts.push(`Policy_${columnFilters.policy}`);
            if (columnFilters.insured) parts.push(`Insured_${columnFilters.insured}`);
            if (columnFilters.address) parts.push(`Address_${columnFilters.address}`);
            if (columnFilters.rce) parts.push(`RCE_${columnFilters.rce}`);
            if (columnFilters.dic) parts.push(`DIC_${columnFilters.dic}`);
            if (columnFilters.dec) parts.push(`DEC_${columnFilters.dec}`);
            if (columnFilters.bamboo) parts.push(`Bamboo_${columnFilters.bamboo}`);
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

    // ── Table Horizontal Scroll & Pan Navigation ────────────────────────
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const topScrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [scrollProgress, setScrollProgress] = useState(0); // 0 to 100
    const [maxScrollLeft, setMaxScrollLeft] = useState(0);
    const [freezePolicyColumn, setFreezePolicyColumn] = useState(true);

    // Mouse drag-to-scroll state
    const [isDraggingTable, setIsDraggingTable] = useState(false);
    const dragStartX = useRef(0);
    const dragStartScrollLeft = useRef(0);
    const isDraggingActive = useRef(false);

    // Synchronize and update scroll status indicators
    const updateScrollState = useCallback(() => {
        const el = tableScrollRef.current;
        if (!el) return;
        const maxScroll = el.scrollWidth - el.clientWidth;
        setMaxScrollLeft(Math.max(0, maxScroll));
        setCanScrollLeft(el.scrollLeft > 6);
        setCanScrollRight(el.scrollLeft < maxScroll - 6);
        if (maxScroll > 0) {
            setScrollProgress(Math.min(100, Math.max(0, (el.scrollLeft / maxScroll) * 100)));
        } else {
            setScrollProgress(0);
        }
    }, []);

    // Main table scroll handler
    const handleTableScroll = useCallback(() => {
        updateScrollState();
        if (topScrollRef.current && tableScrollRef.current) {
            if (Math.abs(topScrollRef.current.scrollLeft - tableScrollRef.current.scrollLeft) > 1) {
                topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
            }
        }
    }, [updateScrollState]);

    // Top scrollbar scroll handler
    const handleTopScroll = useCallback(() => {
        if (tableScrollRef.current && topScrollRef.current) {
            if (Math.abs(tableScrollRef.current.scrollLeft - topScrollRef.current.scrollLeft) > 1) {
                tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
            }
        }
    }, []);

    // Scroll by direction or amount
    const scrollTable = useCallback((direction: 'left' | 'right', amount?: number) => {
        const el = tableScrollRef.current;
        if (!el) return;
        const scrollAmount = amount || Math.max(320, el.clientWidth * 0.45);
        el.scrollBy({
            left: direction === 'right' ? scrollAmount : -scrollAmount,
            behavior: 'smooth',
        });
    }, []);

    // Scroll to preset column groups
    const scrollToPreset = useCallback((preset: 'start' | 'middle' | 'end') => {
        const el = tableScrollRef.current;
        if (!el) return;
        let target = 0;
        if (preset === 'middle') target = (el.scrollWidth - el.clientWidth) * 0.5;
        if (preset === 'end') target = el.scrollWidth - el.clientWidth;
        el.scrollTo({ left: target, behavior: 'smooth' });
    }, []);

    // Handle range slider scrubber
    const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const percent = Number(e.target.value);
        setScrollProgress(percent);
        const el = tableScrollRef.current;
        if (!el) return;
        const maxScroll = el.scrollWidth - el.clientWidth;
        el.scrollLeft = (percent / 100) * maxScroll;
    }, []);

    // Mouse drag-to-scroll handlers
    const handleMouseDownTable = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0 || resizingColumn) return;
        const target = e.target as HTMLElement;
        if (
            target.closest('button') ||
            target.closest('a') ||
            target.closest('input') ||
            target.closest('select') ||
            target.closest(`.${styles.colResizer}`) ||
            target.closest(`.${styles.thInner}`)
        ) {
            return;
        }
        const el = tableScrollRef.current;
        if (!el) return;

        dragStartX.current = e.clientX;
        dragStartScrollLeft.current = el.scrollLeft;
        isDraggingActive.current = true;
        setIsDraggingTable(true);
    }, [resizingColumn]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingActive.current) return;
            const el = tableScrollRef.current;
            if (!el) return;
            const deltaX = e.clientX - dragStartX.current;
            el.scrollLeft = dragStartScrollLeft.current - deltaX;
        };

        const handleMouseUp = () => {
            if (isDraggingActive.current) {
                isDraggingActive.current = false;
                setIsDraggingTable(false);
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    // Auto-update scroll state on window resize or column width changes
    useEffect(() => {
        updateScrollState();
        const handleResize = () => updateScrollState();
        window.addEventListener('resize', handleResize);

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined' && tableScrollRef.current) {
            observer = new ResizeObserver(() => updateScrollState());
            observer.observe(tableScrollRef.current);
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            if (observer) observer.disconnect();
        };
    }, [updateScrollState, totalTableWidth, columnOrder, columnWidths]);

    // Render individual cell content by column key
    const renderCell = (colKey: CFPColumnKey, term: CFPTermRow) => {
        switch (colKey) {
            case 'policy':
                if (term.is_pending_dec) {
                    return (
                        <div className={styles.policyNumberCell}>
                            <span
                                className={`${styles.carrierBadge} ${styles.bamboo}`}
                                style={{ background: '#fef3c7', color: '#b45309', borderColor: '#fde68a' }}
                                title="Bamboo in-force policy waiting for Olga to upload CFP DEC page"
                            >
                                Pending DEC
                            </span>
                        </div>
                    );
                }

                return (
                    <div className={styles.policyNumberCell}>
                        <Link
                            href={`/policy/${term.policy_id}`}
                            className={styles.policyLink}
                            target="_blank"
                            title={`Open policy ${term.policy_number} in new tab`}
                        >
                            <span className={styles.cellText}>{term.policy_number}</span>
                            <ExternalLink size={12} className={styles.linkIcon} />
                        </Link>
                        {term.policy_number && (
                            <button
                                type="button"
                                className={`${styles.copyBtn} ${copiedKey === `policy-${term.policy_term_id}` ? styles.copied : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(term.policy_number, `policy-${term.policy_term_id}`);
                                }}
                                title="Copy Policy #"
                            >
                                {copiedKey === `policy-${term.policy_term_id}` ? (
                                    <Check size={11} style={{ color: '#16a34a' }} />
                                ) : (
                                    <Copy size={11} />
                                )}
                            </button>
                        )}
                    </div>
                );

            case 'insured':
                const insuredText = term.named_insured || 'Unknown';
                const canCopyInsured = !!term.named_insured && term.named_insured !== '—' && term.named_insured !== 'Unknown';
                return (
                    <div className={styles.copyableCell}>
                        {term.client_id ? (
                            <Link
                                href={`/client/${term.client_id}`}
                                className={`${styles.linkButton} ${styles.cellText}`}
                                target="_blank"
                                title={insuredText}
                            >
                                {insuredText}
                            </Link>
                        ) : (
                            <span className={styles.cellText} title={insuredText}>
                                {insuredText}
                            </span>
                        )}
                        {canCopyInsured && (
                            <button
                                type="button"
                                className={`${styles.copyBtn} ${copiedKey === `insured-${term.policy_term_id}` ? styles.copied : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(term.named_insured!, `insured-${term.policy_term_id}`);
                                }}
                                title="Copy Insured Name"
                            >
                                {copiedKey === `insured-${term.policy_term_id}` ? (
                                    <Check size={11} style={{ color: '#16a34a' }} />
                                ) : (
                                    <Copy size={11} />
                                )}
                            </button>
                        )}
                    </div>
                );

            case 'address':
                const addressText = term.property_address || '—';
                const canCopyAddress = !!term.property_address && term.property_address !== '—' && term.property_address !== 'Unknown';
                return (
                    <div className={styles.copyableCell}>
                        <span className={styles.cellText} title={addressText}>
                            {addressText}
                        </span>
                        {canCopyAddress && (
                            <button
                                type="button"
                                className={`${styles.copyBtn} ${copiedKey === `address-${term.policy_term_id}` ? styles.copied : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(term.property_address!, `address-${term.policy_term_id}`);
                                }}
                                title="Copy Property Address"
                            >
                                {copiedKey === `address-${term.policy_term_id}` ? (
                                    <Check size={11} style={{ color: '#16a34a' }} />
                                ) : (
                                    <Copy size={11} />
                                )}
                            </button>
                        )}
                    </div>
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
                    <button
                        type="button"
                        className={`${styles.docBadge} ${styles.yes} ${styles.clickableBadge}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            handlePreviewDoc({
                                title: `DEC Page — ${term.policy_number}`,
                                subtitle: term.named_insured || undefined,
                                docType: 'dec',
                                storagePath: term.dec_storage_path,
                                bucket: 'cfp-raw-decpage',
                                fileName: term.dec_file_name || `${term.policy_number}_DEC.pdf`,
                                policyId: term.policy_id,
                            });
                        }}
                        title="Click to preview DEC Page"
                    >
                        <Check size={13} /> DEC
                    </button>
                ) : (
                    <Link
                        href={`/upload-document?policy_id=${term.policy_id}&doc_type=dec_page`}
                        className={`${styles.docBadge} ${styles.no}`}
                        title="Missing DEC Page — click to upload"
                        target="_blank"
                    >
                        <Plus size={12} /> None
                    </Link>
                );

            case 'rce':
                return renderCarrierBadge(
                    term.rce_carrier,
                    'RCE',
                    term.policy_id,
                    () => {
                        handlePreviewDoc({
                            title: `RCE Document — ${term.rce_carrier || 'Uploaded'} (${term.policy_number})`,
                            subtitle: term.named_insured || undefined,
                            docType: 'rce',
                            storagePath: term.rce_storage_path,
                            bucket: 'cfp-platform-documents',
                            fileName: term.rce_file_name || `${term.policy_number}_RCE.pdf`,
                            policyId: term.policy_id,
                        });
                    }
                );

            case 'dic':
                return renderCarrierBadge(
                    term.dic_carrier,
                    'DIC',
                    term.policy_id,
                    () => {
                        handlePreviewDoc({
                            title: `DIC Document — ${term.dic_carrier || 'Uploaded'} (${term.policy_number})`,
                            subtitle: term.named_insured || undefined,
                            docType: 'dic',
                            storagePath: term.dic_storage_path,
                            bucket: 'cfp-platform-documents',
                            fileName: term.dic_file_name || `${term.policy_number}_DIC.pdf`,
                            policyId: term.policy_id,
                        });
                    }
                );

            case 'quote':
                return term.has_es ? (
                    <button
                        type="button"
                        className={`${styles.docBadge} ${styles.yes} ${styles.clickableBadge}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            handlePreviewDoc({
                                title: `Quote / E&S Document — ${term.policy_number}`,
                                subtitle: term.named_insured || undefined,
                                docType: 'quote',
                                storagePath: term.es_storage_path,
                                bucket: 'cfp-platform-documents',
                                fileName: term.es_file_name || `${term.policy_number}_Quote.pdf`,
                                policyId: term.policy_id,
                            });
                        }}
                        title="Click to preview Quote / E&S document"
                    >
                        <Check size={13} /> Quote
                    </button>
                ) : (
                    <Link
                        href={`/upload-document?policy_id=${term.policy_id}&doc_type=quote`}
                        className={`${styles.docBadge} ${styles.no}`}
                        title="Missing Quote/E&S — click to upload"
                        target="_blank"
                    >
                        <Plus size={12} /> None
                    </Link>
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


            default:
                return null;
        }
    };

    // Render individual column filter control for the filter row
    const renderFilterCell = (colKey: CFPColumnKey) => {
        switch (colKey) {
            case 'policy':
                return (
                    <select
                        value={columnFilters.policy || ''}
                        onChange={e => handleColumnFilterChange('policy', e.target.value)}
                        className={`${styles.columnFilterSelect} ${columnFilters.policy ? styles.activeFilter : ''}`}
                    >
                        <option value="">All CFP #</option>
                        <option value="available">Available</option>
                        <option value="not_available">Not Available</option>
                    </select>
                );
            case 'insured':
                return (
                    <select
                        value={columnFilters.insured || ''}
                        onChange={e => handleColumnFilterChange('insured', e.target.value)}
                        className={`${styles.columnFilterSelect} ${columnFilters.insured ? styles.activeFilter : ''}`}
                    >
                        <option value="">All Insured</option>
                        <option value="available">Available</option>
                        <option value="not_available">Not Available</option>
                    </select>
                );
            case 'address':
                return (
                    <select
                        value={columnFilters.address || ''}
                        onChange={e => handleColumnFilterChange('address', e.target.value)}
                        className={`${styles.columnFilterSelect} ${columnFilters.address ? styles.activeFilter : ''}`}
                    >
                        <option value="">All Addresses</option>
                        <option value="available">Available</option>
                        <option value="not_available">Not Available</option>
                    </select>
                );
            case 'dec':
                return (
                    <select
                        value={columnFilters.dec || ''}
                        onChange={e => handleColumnFilterChange('dec', e.target.value)}
                        className={`${styles.columnFilterSelect} ${columnFilters.dec ? styles.activeFilter : ''}`}
                    >
                        <option value="">All DEC</option>
                        <option value="uploaded">DEC (Uploaded)</option>
                        <option value="missing">Missing (None)</option>
                    </select>
                );
            case 'rce':
                return (
                    <select
                        value={columnFilters.rce || ''}
                        onChange={e => handleColumnFilterChange('rce', e.target.value)}
                        className={`${styles.columnFilterSelect} ${columnFilters.rce ? styles.activeFilter : ''}`}
                    >
                        <option value="">All RCE</option>
                        <option value="has_rce">Uploaded (Any)</option>
                        <option value="missing">Missing (None)</option>
                        <option value="Bamboo">Bamboo</option>
                        <option value="AM">AM (American Modern)</option>
                        <option value="Aegis">Aegis</option>
                        <option value="SageSure">SageSure</option>
                        <option value="PSIC">PSIC</option>
                        <option value="Other">Other Carrier</option>
                    </select>
                );
            case 'dic':
                return (
                    <select
                        value={columnFilters.dic || ''}
                        onChange={e => handleColumnFilterChange('dic', e.target.value)}
                        className={`${styles.columnFilterSelect} ${columnFilters.dic ? styles.activeFilter : ''}`}
                    >
                        <option value="">All DIC</option>
                        <option value="has_dic">Uploaded (Any)</option>
                        <option value="missing">Missing (None)</option>
                        <option value="Bamboo">Bamboo</option>
                        <option value="AM">AM (American Modern)</option>
                        <option value="Aegis">Aegis</option>
                        <option value="SageSure">SageSure</option>
                        <option value="PSIC">PSIC</option>
                        <option value="Other">Other Carrier</option>
                    </select>
                );
            case 'quote':
                return (
                    <select
                        value={columnFilters.quote || ''}
                        onChange={e => handleColumnFilterChange('quote', e.target.value)}
                        className={`${styles.columnFilterSelect} ${columnFilters.quote ? styles.activeFilter : ''}`}
                    >
                        <option value="">All Quote</option>
                        <option value="uploaded">Quote (Uploaded)</option>
                        <option value="missing">Missing (None)</option>
                    </select>
                );
            case 'bamboo':
                return (
                    <select
                        value={columnFilters.bamboo || ''}
                        onChange={e => handleColumnFilterChange('bamboo', e.target.value)}
                        className={`${styles.columnFilterSelect} ${columnFilters.bamboo ? styles.activeFilter : ''}`}
                    >
                        <option value="">All</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                    </select>
                );
            default:
                return null;
        }
    };

    return (
        <div className={styles.tableContainer}>
            {/* ── View Switcher Tabs ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <button
                    type="button"
                    onClick={() => {
                        onViewChange?.('active_cfp');
                        setCurrentPage(1);
                    }}
                    className={`${styles.filterPill} ${view === 'active_cfp' ? styles.active : ''}`}
                    style={{ fontSize: '0.8125rem', padding: '0.35rem 0.85rem', fontWeight: 600 }}
                >
                    Official CFP Policies
                </button>
                <button
                    type="button"
                    onClick={() => {
                        onViewChange?.('bamboo_pipeline');
                        setCurrentPage(1);
                    }}
                    className={`${styles.filterPill} ${view === 'bamboo_pipeline' ? styles.active : ''}`}
                    style={{ fontSize: '0.8125rem', padding: '0.35rem 0.85rem', fontWeight: 600 }}
                >
                    🌿 Bamboo In-Force Pipeline (Pending DEC)
                </button>
                <button
                    type="button"
                    onClick={() => {
                        onViewChange?.('all');
                        setCurrentPage(1);
                    }}
                    className={`${styles.filterPill} ${view === 'all' ? styles.active : ''}`}
                    style={{ fontSize: '0.8125rem', padding: '0.35rem 0.85rem', fontWeight: 600 }}
                >
                    Combined All
                </button>
            </div>

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
                            className={`${styles.filterPill} ${showColumnFilters ? styles.active : ''}`}
                            onClick={() => setShowColumnFilters(prev => !prev)}
                            title="Toggle column-specific filters row"
                        >
                            <Filter size={12} style={{ display: 'inline', marginRight: '4px' }} />
                            Column Filters
                            {activeFilterCount > 0 && (
                                <span className={styles.filterBadgeCount}>{activeFilterCount}</span>
                            )}
                        </button>

                        {activeFilterCount > 0 && (
                            <button
                                type="button"
                                className={styles.filterPill}
                                onClick={handleClearColumnFilters}
                                title="Clear all column filters"
                                style={{ color: '#dc2626', borderColor: 'rgba(220, 38, 38, 0.3)' }}
                            >
                                <RotateCcw size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                Clear Filters ({activeFilterCount})
                            </button>
                        )}

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

                {/* ── Quick Summary Card for Filtered Month and Year ── */}
                <div className={styles.periodSummaryStrip}>
                    <div className={styles.periodSummaryHeader}>
                        <div className={styles.periodSummaryTitle}>
                            <span>
                                📅 {month ? `${MONTH_NAMES.find(m => m.value === month)?.label} ` : ''}
                                {year ? year : 'All Years'} Summary
                            </span>
                        </div>
                        <span className={styles.miniCardSub}>
                            Live snapshot for selected month & year
                        </span>
                    </div>

                    <div className={styles.periodSummaryCards}>
                        {/* 1. Total Policies */}
                        <div className={`${styles.summaryMiniCard} ${styles.cardPolicies}`}>
                            <div className={styles.miniCardTop}>
                                <span className={styles.miniCardLabel}>Total Policies</span>
                                <FileText size={13} className={styles.miniCardIcon} />
                            </div>
                            <span className={styles.miniCardValue}>{periodStats.total.toLocaleString()}</span>
                            <span className={styles.miniCardSub}>
                                in {month ? `${MONTH_NAMES.find(m => m.value === month)?.label} ` : ''}{year || 'all years'}
                            </span>
                        </div>

                        {/* 2. DEC Page */}
                        <div className={`${styles.summaryMiniCard} ${styles.cardDec}`}>
                            <div className={styles.miniCardTop}>
                                <span className={styles.miniCardLabel}>DEC Page</span>
                                <AlertCircle size={13} className={styles.miniCardIcon} />
                            </div>
                            <div className={styles.miniCardMetrics}>
                                <span className={styles.metricAvail} title="DEC pages on file">
                                    <Check size={11} /> {periodStats.decAvailable.toLocaleString()} available
                                </span>
                                <span 
                                    className={styles.metricMissing} 
                                    title="Click to filter by Missing DEC"
                                    onClick={() => { setDocFilter('missing_dec'); setCurrentPage(1); }}
                                >
                                    <X size={11} /> {periodStats.decMissing.toLocaleString()} missing
                                </span>
                            </div>
                            <div className={styles.miniProgressBar}>
                                <div 
                                    className={styles.miniProgressFill} 
                                    style={{ width: `${periodStats.total > 0 ? (periodStats.decAvailable / periodStats.total) * 100 : 0}%` }} 
                                />
                            </div>
                        </div>

                        {/* 3. RCE */}
                        <div className={`${styles.summaryMiniCard} ${styles.cardRce}`}>
                            <div className={styles.miniCardTop}>
                                <span className={styles.miniCardLabel}>RCE Document</span>
                                <ShieldAlert size={13} className={styles.miniCardIcon} />
                            </div>
                            <div className={styles.miniCardMetrics}>
                                <span className={styles.metricAvail} title="RCE documents on file">
                                    <Check size={11} /> {periodStats.rceAvailable.toLocaleString()} available
                                </span>
                                <span 
                                    className={styles.metricMissing} 
                                    title="Click to filter by Missing RCE"
                                    onClick={() => { setDocFilter('missing_rce'); setCurrentPage(1); }}
                                >
                                    <X size={11} /> {periodStats.rceMissing.toLocaleString()} missing
                                </span>
                            </div>
                            <div className={styles.miniProgressBar}>
                                <div 
                                    className={styles.miniProgressFill} 
                                    style={{ width: `${periodStats.total > 0 ? (periodStats.rceAvailable / periodStats.total) * 100 : 0}%` }} 
                                />
                            </div>
                        </div>

                        {/* 4. DIC */}
                        <div className={`${styles.summaryMiniCard} ${styles.cardDic}`}>
                            <div className={styles.miniCardTop}>
                                <span className={styles.miniCardLabel}>DIC Policy / Doc</span>
                                <ShieldOff size={13} className={styles.miniCardIcon} />
                            </div>
                            <div className={styles.miniCardMetrics}>
                                <span className={styles.metricAvail} title="DIC documents on file">
                                    <Check size={11} /> {periodStats.dicAvailable.toLocaleString()} available
                                </span>
                                <span 
                                    className={styles.metricMissing} 
                                    title="Click to filter by Missing DIC"
                                    onClick={() => { setDocFilter('missing_dic'); setCurrentPage(1); }}
                                >
                                    <X size={11} /> {periodStats.dicMissing.toLocaleString()} missing
                                </span>
                            </div>
                            <div className={styles.miniProgressBar}>
                                <div 
                                    className={styles.miniProgressFill} 
                                    style={{ width: `${periodStats.total > 0 ? (periodStats.dicAvailable / periodStats.total) * 100 : 0}%` }} 
                                />
                            </div>
                        </div>

                        {/* 5. Quote / E&S */}
                        <div className={`${styles.summaryMiniCard} ${styles.cardQuote}`}>
                            <div className={styles.miniCardTop}>
                                <span className={styles.miniCardLabel}>Quote / E&S</span>
                                <FileQuestion size={13} className={styles.miniCardIcon} />
                            </div>
                            <div className={styles.miniCardMetrics}>
                                <span className={styles.metricAvail} title="Quote/E&S documents on file">
                                    <Check size={11} /> {periodStats.quoteAvailable.toLocaleString()} available
                                </span>
                                <span 
                                    className={styles.metricMissing} 
                                    title="Click to filter by Missing Quote/E&S"
                                    onClick={() => { setDocFilter('missing_es'); setCurrentPage(1); }}
                                >
                                    <X size={11} /> {periodStats.quoteMissing.toLocaleString()} missing
                                </span>
                            </div>
                            <div className={styles.miniProgressBar}>
                                <div 
                                    className={styles.miniProgressFill} 
                                    style={{ width: `${periodStats.total > 0 ? (periodStats.quoteAvailable / periodStats.total) * 100 : 0}%` }} 
                                />
                            </div>
                        </div>
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

            {/* ── Table Navigation & Pan Strip ── */}
            <div className={styles.tableNavStrip}>
                <div className={styles.tableNavControls}>
                    <span className={styles.tableNavLabel} title="Move the table horizontally across columns">
                        <MoveHorizontal size={14} style={{ color: 'var(--color-primary, #2243B6)' }} />
                        <span>Move Table:</span>
                    </span>

                    <button
                        type="button"
                        className={styles.navMoveBtn}
                        onClick={() => scrollTable('left')}
                        disabled={!canScrollLeft}
                        title="Move table left (view policy & insured details)"
                    >
                        <ChevronLeft size={16} />
                        <span>Left</span>
                    </button>

                    <div className={styles.sliderContainer} title="Drag slider or click to scroll table horizontally">
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(scrollProgress)}
                            onChange={handleSliderChange}
                            className={styles.horizontalSlider}
                            aria-label="Table horizontal scroll position"
                        />
                    </div>

                    <button
                        type="button"
                        className={styles.navMoveBtn}
                        onClick={() => scrollTable('right')}
                        disabled={!canScrollRight}
                        title="Move table right (view DEC, RCE, DIC, Quote & Bamboo coverages)"
                    >
                        <span>Right</span>
                        <ChevronRight size={16} />
                    </button>
                </div>

                {/* Quick Jump Column Presets */}
                <div className={styles.navPresets}>
                    <span className={styles.presetLabel}>Jump to:</span>
                    <button
                        type="button"
                        className={`${styles.presetBtn} ${scrollProgress < 20 ? styles.presetActive : ''}`}
                        onClick={() => scrollToPreset('start')}
                        title="Scroll to CFP Number and Named Insured"
                    >
                        Policy & Insured
                    </button>
                    <button
                        type="button"
                        className={`${styles.presetBtn} ${scrollProgress >= 20 && scrollProgress <= 70 ? styles.presetActive : ''}`}
                        onClick={() => scrollToPreset('middle')}
                        title="Scroll to Property Address, Effective & Expiration Dates"
                    >
                        Address & Dates
                    </button>
                    <button
                        type="button"
                        className={`${styles.presetBtn} ${scrollProgress > 70 ? styles.presetActive : ''}`}
                        onClick={() => scrollToPreset('end')}
                        title="Scroll to DEC Page, RCE, DIC, Quote/E&S & Bamboo Coverage"
                    >
                        Documents & Bamboo 🌿
                    </button>
                </div>

                <div className={styles.navRightGroup}>
                    <button
                        type="button"
                        className={`${styles.freezeBtn} ${freezePolicyColumn ? styles.freezeActive : ''}`}
                        onClick={() => setFreezePolicyColumn(prev => !prev)}
                        title={freezePolicyColumn ? "First column pinned to left edge while scrolling. Click to unfreeze." : "Pin first column to left edge while scrolling."}
                    >
                        {freezePolicyColumn ? <Pin size={13} style={{ color: 'var(--color-primary, #2243B6)' }} /> : <PinOff size={13} />}
                        <span>{freezePolicyColumn ? 'Policy # Pinned' : 'Pin Policy #'}</span>
                    </button>

                    <span className={styles.columnStatusBadge}>
                        {canScrollRight ? (
                            scrollProgress < 20 
                                ? '👉 Move right for DEC, RCE, DIC, Bamboo' 
                                : `Column ${Math.min(columnOrder.length, Math.round((scrollProgress / 100) * 6) + 1)} of ${columnOrder.length}`
                        ) : (
                            '✓ Showing all coverages'
                        )}
                    </span>
                </div>
            </div>

            {/* ── Table Card ── */}
            <div className={styles.tableCard}>
                {/* Top Synchronized Scrollbar */}
                {maxScrollLeft > 0 && (
                    <div
                        ref={topScrollRef}
                        className={styles.topScrollTrack}
                        onScroll={handleTopScroll}
                        title="Scroll table horizontally"
                    >
                        <div style={{ width: `${totalTableWidth}px`, height: '1px' }} />
                    </div>
                )}

                {/* Floating Navigation Edge Arrows */}
                {canScrollLeft && (
                    <button
                        type="button"
                        className={`${styles.floatingEdgeBtn} ${styles.floatingLeftBtn}`}
                        onClick={() => scrollTable('left')}
                        title="Scroll table left (Policy & Insured)"
                    >
                        <ChevronLeft size={20} />
                    </button>
                )}

                {canScrollRight && (
                    <button
                        type="button"
                        className={`${styles.floatingEdgeBtn} ${styles.floatingRightBtn}`}
                        onClick={() => scrollTable('right')}
                        title="Scroll table right (DEC, RCE, DIC, Bamboo coverages)"
                    >
                        <ChevronRight size={20} />
                    </button>
                )}

                <div
                    ref={tableScrollRef}
                    className={`${styles.tableScroll} ${isDraggingTable ? styles.isDraggingTable : ''}`}
                    onScroll={handleTableScroll}
                    onMouseDown={handleMouseDownTable}
                >
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
                                {columnOrder.map((colKey, colIndex) => {
                                    const colDef = DEFAULT_COLUMNS.find(c => c.key === colKey)!;
                                    const width = columnWidths[colKey] || colDef.width;
                                    const isDragging = draggedColumnKey === colKey;
                                    const isDragOver = dragOverColumnKey === colKey;
                                    const isSticky = freezePolicyColumn && colIndex === 0;

                                    return (
                                        <th
                                            key={colKey}
                                            style={{
                                                width: `${width}px`,
                                                textAlign: colDef.align || 'left',
                                                ...(isSticky ? {
                                                    position: 'sticky',
                                                    left: 0,
                                                    zIndex: 15,
                                                    backgroundColor: 'var(--bg-surface-subtle)',
                                                    boxShadow: canScrollLeft ? '3px 0 8px rgba(0, 0, 0, 0.12)' : 'none',
                                                } : {}),
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
                                                {columnFilters[colKey as keyof ColumnFilters] && (
                                                    <span
                                                        style={{
                                                            width: 6,
                                                            height: 6,
                                                            borderRadius: '50%',
                                                            backgroundColor: 'var(--color-primary, #2243B6)',
                                                            display: 'inline-block',
                                                            marginLeft: 4,
                                                            flexShrink: 0,
                                                        }}
                                                        title="Filter active on this column"
                                                    />
                                                )}
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

                            {/* Column Filter Row */}
                            {showColumnFilters && (
                                <tr className={styles.filterRow}>
                                    {columnOrder.map((colKey, colIndex) => {
                                        const colDef = DEFAULT_COLUMNS.find(c => c.key === colKey)!;
                                        const width = columnWidths[colKey] || colDef.width;
                                        const isSticky = freezePolicyColumn && colIndex === 0;
                                        return (
                                            <th
                                                key={`filter-${colKey}`}
                                                style={{
                                                    width: `${width}px`,
                                                    textAlign: colDef.align || 'left',
                                                    ...(isSticky ? {
                                                        position: 'sticky',
                                                        left: 0,
                                                        zIndex: 14,
                                                        backgroundColor: 'var(--bg-surface-subtle)',
                                                        boxShadow: canScrollLeft ? '3px 0 8px rgba(0, 0, 0, 0.12)' : 'none',
                                                    } : {}),
                                                }}
                                            >
                                                {renderFilterCell(colKey)}
                                            </th>
                                        );
                                    })}
                                </tr>
                            )}
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
                                        {columnOrder.map((colKey, colIndex) => {
                                            const colDef = DEFAULT_COLUMNS.find(c => c.key === colKey)!;
                                            const isSticky = freezePolicyColumn && colIndex === 0;
                                            return (
                                                <td
                                                    key={colKey}
                                                    style={{
                                                        textAlign: colDef.align || 'left',
                                                        ...(isSticky ? {
                                                            position: 'sticky',
                                                            left: 0,
                                                            zIndex: 2,
                                                            backgroundColor: 'var(--bg-surface)',
                                                            boxShadow: canScrollLeft ? '3px 0 8px rgba(0, 0, 0, 0.08)' : 'none',
                                                        } : {}),
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

            {/* ── Document Preview Modal ── */}
            {previewDoc && (
                <div className={styles.previewOverlay} onClick={() => setPreviewDoc(null)}>
                    <div className={styles.previewModal} onClick={e => e.stopPropagation()}>
                        <div className={styles.previewHeader}>
                            <div className={styles.previewHeaderInfo}>
                                <div className={styles.previewTitleRow}>
                                    <FileText size={18} className={styles.previewIcon} />
                                    <h3 className={styles.previewTitle}>{previewDoc.title}</h3>
                                </div>
                                {previewDoc.subtitle && (
                                    <span className={styles.previewSubtitle}>{previewDoc.subtitle}</span>
                                )}
                            </div>
                            <div className={styles.previewActions}>
                                {previewDoc.url && (
                                    <>
                                        <a
                                            href={previewDoc.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={styles.previewActionBtn}
                                            title="Open in new browser tab"
                                        >
                                            <ExternalLink size={14} />
                                            <span>Open in Tab</span>
                                        </a>
                                        <a
                                            href={previewDoc.url}
                                            download={previewDoc.fileName || 'document.pdf'}
                                            className={styles.previewActionBtn}
                                            title="Download document file"
                                        >
                                            <Download size={14} />
                                            <span>Download</span>
                                        </a>
                                    </>
                                )}
                                <button
                                    type="button"
                                    className={styles.previewCloseBtn}
                                    onClick={() => setPreviewDoc(null)}
                                    title="Close preview (Esc)"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        <div className={styles.previewBody}>
                            {previewDoc.loading ? (
                                <div className={styles.previewLoading}>
                                    <Loader2 size={36} className="animate-spin text-primary" />
                                    <span>Loading document preview...</span>
                                </div>
                            ) : previewDoc.error ? (
                                <div className={styles.previewError}>
                                    <AlertCircle size={36} style={{ color: '#ef4444' }} />
                                    <span style={{ fontWeight: 600, color: 'var(--text-high)' }}>Unable to load document</span>
                                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{previewDoc.error}</span>
                                    {previewDoc.policyId && (
                                        <Link
                                            href={`/upload-document?policy_id=${previewDoc.policyId}&doc_type=${previewDoc.docType || 'rce'}`}
                                            target="_blank"
                                            className={styles.previewRetryBtn}
                                        >
                                            Upload Document
                                        </Link>
                                    )}
                                </div>
                            ) : previewDoc.url ? (
                                <iframe
                                    src={previewDoc.url}
                                    className={styles.previewIframe}
                                    title={previewDoc.title}
                                />
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

