'use client';

import React, { useEffect, useState, useMemo, useDeferredValue } from 'react';
import { useRouter } from 'next/navigation';
import {
    FileText, Upload, Loader2, CheckCircle, CheckCircle2, Clock, AlertTriangle,
    XCircle, RefreshCw, Sparkles, Shield, Timer, Merge, ExternalLink,
    Layers, FileUp, Files, Filter, RotateCcw, ArrowRight, FileSearch, Search, X,
    Eye, Download, Calendar, AlertCircle
} from 'lucide-react';
import {
    fetchActivityFeed,
    ActivityFeedItem,
    getDecPageFileDownloadUrl,
    getPlatformDocDownloadUrl
} from '@/lib/api';
import styles from './ActivityTab.module.css';
import { logger } from '@/lib/logger';

import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

interface PreviewDocState {
    title: string;
    subtitle?: string;
    url?: string | null;
    loading: boolean;
    error?: string | null;
    policyId?: string;
    docType?: string;
}

// Module-level in-memory cache for instant 0ms tab switching and revalidation
let globalActivityCache: ActivityFeedItem[] | null = null;
let globalActivityCacheTime = 0;
const CACHE_TTL_MS = 30_000; // 30s fresh cache

const MONTH_NAMES = [
    { value: '1', label: 'Jan', fullName: 'January' },
    { value: '2', label: 'Feb', fullName: 'February' },
    { value: '3', label: 'Mar', fullName: 'March' },
    { value: '4', label: 'Apr', fullName: 'April' },
    { value: '5', label: 'May', fullName: 'May' },
    { value: '6', label: 'Jun', fullName: 'June' },
    { value: '7', label: 'Jul', fullName: 'July' },
    { value: '8', label: 'Aug', fullName: 'August' },
    { value: '9', label: 'Sep', fullName: 'September' },
    { value: '10', label: 'Oct', fullName: 'October' },
    { value: '11', label: 'Nov', fullName: 'November' },
    { value: '12', label: 'Dec', fullName: 'December' },
];

function formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getStatusConfig(status: string): { label: string; cssKey: string } {
    switch (status) {
        case 'parsed':
        case 'done':
            return { label: 'Complete', cssKey: 'done' };
        case 'duplicate':
            return { label: 'Duplicate Found', cssKey: 'queued' };
        case 'queued':
            return { label: 'Queued', cssKey: 'queued' };
        case 'processing':
            return { label: 'Processing', cssKey: 'processing' };
        case 'failed':
            return { label: 'Failed', cssKey: 'failed' };
        default:
            return { label: status.charAt(0).toUpperCase() + status.slice(1), cssKey: '' };
    }
}

function StatusIcon({ status, type, event_type, isResolved }: { status: string; type?: string; event_type?: string; isResolved?: boolean }) {
    if (type === 'document') {
        const isUpload = (event_type || '').startsWith('doc.uploaded.');
        if (isUpload) return <FileText size={14} className={styles.statusIconDoc} />;
        if (event_type === 'document.processed' || isResolved) return <CheckCircle size={14} style={{ color: '#10b981' }} />;
        if (event_type === 'document.failed') return <XCircle size={14} style={{ color: '#ef4444' }} />;
        if (event_type === 'document.needs_review') return <AlertTriangle size={14} style={{ color: '#f59e0b' }} />;
        if (event_type === 'document.no_match') return <AlertTriangle size={14} style={{ color: '#f97316' }} />;
        return <FileText size={14} className={styles.statusIconDoc} />;
    }
    if (type === 'merge') {
        return <Merge size={14} className={styles.statusIconMerge} />;
    }
    switch (status) {
        case 'parsed':
        case 'done':
            return <CheckCircle2 size={14} className={styles.statusIconDone} />;
        case 'duplicate':
            return <Sparkles size={14} className={styles.statusIconProcessing} style={{ color: '#8b5cf6' }} />;
        case 'failed':
            return <XCircle size={14} className={styles.statusIconFailed} />;
        case 'processing':
            return <Loader2 size={14} className={`${styles.statusIconProcessing} ${styles.spinSlow}`} />;
        case 'queued':
            return <Clock size={14} className={styles.statusIconQueued} />;
        default:
            return <AlertTriangle size={14} className={styles.statusIconDefault} />;
    }
}

const DOC_TYPE_LABELS: Record<string, string> = {
    dec_page: 'Declaration Page',
    rce: 'RCE Report',
    dic_dec_page: 'DIC / Full Quote',
    quote: 'DIC / Full Quote',
    invoice: 'Invoice',
    inspection: 'Inspection Report',
    endorsement: 'Endorsement',
    questionnaire: 'Questionnaire',
    other: 'Document',
};

function getDocumentActionLabel(activity: ActivityFeedItem): string {
    const fn = (activity.file_path || activity.file_name || activity.meta?.file_name || '').toUpperCase();
    const polNum = (activity.policy_number || '').toUpperCase();
    const isCfp = fn.includes('RENEWAL_EMAIL_ATTACHMENT') ||
                  fn.includes('CFP') ||
                  polNum.startsWith('CFP') ||
                  polNum.startsWith('010') ||
                  polNum.startsWith('020') ||
                  polNum.startsWith('011') ||
                  polNum.startsWith('012') ||
                  activity.bucket === 'cfp-raw-decpage';
    const docLabel = isCfp || activity.doc_type === 'dec_page'
        ? 'Declaration Page'
        : (DOC_TYPE_LABELS[activity.doc_type || ''] || (activity.doc_type && activity.doc_type !== 'other' ? activity.doc_type.toUpperCase() : 'Document'));

    if (activity.policy_id || activity.policy_number) {
        if (activity.event_type === 'document.needs_review' || activity.event_type === 'document.no_match') {
            return `${docLabel} Processed`;
        }
    }

    const isUpload = (activity.event_type || '').startsWith('doc.uploaded.');
    if (isUpload) return `${docLabel} Uploaded`;
    if (activity.event_type === 'document.processed') return `${docLabel} Processed`;
    if (activity.event_type === 'document.needs_review') return `${docLabel} Needs Review`;
    if (activity.event_type === 'document.no_match') return `${docLabel} — No Match`;
    if (activity.event_type === 'document.failed') return `${docLabel} Failed`;
    return activity.title || `${docLabel} Event`;
}

export type ActivityFilterType = 'all' | 'dec' | 'rce' | 'dic' | 'other_docs' | 'merge' | 'issues';

interface FilterOption {
    id: ActivityFilterType;
    label: string;
    icon: React.ReactNode;
    isIssues?: boolean;
}

export function ActivityTab() {
    const router = useRouter();
    const [activities, setActivities] = useState<ActivityFeedItem[]>(() => globalActivityCache || []);
    const [loading, setLoading] = useState(() => !globalActivityCache);
    const [refreshing, setRefreshing] = useState(false);
    const [visibleCount, setVisibleCount] = useState(30);

    // Dynamic current date defaults
    const currentYearStr = String(new Date().getFullYear());
    const currentMonthStr = String(new Date().getMonth() + 1);

    // Filters with localStorage memory persistence and current month/year defaults
    const [selectedFilter, setSelectedFilterState] = useState<ActivityFilterType>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('ccn_activity_filter_type') as ActivityFilterType;
            if (saved) return saved;
        }
        return 'all';
    });

    const [selectedYear, setSelectedYearState] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('ccn_activity_selected_year');
            if (saved !== null) return saved;
        }
        return currentYearStr;
    });

    const [selectedMonth, setSelectedMonthState] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('ccn_activity_selected_month');
            if (saved !== null) return saved;
        }
        return currentMonthStr;
    });

    const setSelectedFilter = (val: ActivityFilterType) => {
        setSelectedFilterState(val);
        if (typeof window !== 'undefined') {
            localStorage.setItem('ccn_activity_filter_type', val);
        }
    };

    const setSelectedYear = (val: string) => {
        setSelectedYearState(val);
        if (typeof window !== 'undefined') {
            localStorage.setItem('ccn_activity_selected_year', val);
        }
    };

    const setSelectedMonth = (val: string) => {
        setSelectedMonthState(val);
        if (typeof window !== 'undefined') {
            localStorage.setItem('ccn_activity_selected_month', val);
        }
    };

    const [searchQuery, setSearchQuery] = useState('');
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [previewDoc, setPreviewDoc] = useState<PreviewDocState | null>(null);

    const loadActivities = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else if (!globalActivityCache) setLoading(true);
        try {
            // Fetch recent activities (350 items provides comprehensive coverage with fast parallel queries)
            const data = await fetchActivityFeed(350);
            globalActivityCache = data;
            globalActivityCacheTime = Date.now();
            setActivities(data);
        } catch (err) {
            logger.error('ActivityTab', 'Activity feed error:', { error: err instanceof Error ? err.message : String(err) });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (!globalActivityCache || Date.now() - globalActivityCacheTime > CACHE_TTL_MS) {
            loadActivities();
        }
    }, []);

    // Reset pagination window when filters or search change
    useEffect(() => {
        setVisibleCount(30);
    }, [selectedFilter, selectedYear, selectedMonth, deferredSearchQuery]);

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

    // Handle document preview loading with multi-tier storage path resolution
    const handlePreviewDoc = async (activity: ActivityFeedItem) => {
        const title = activity.file_name ||
            (activity.type === 'upload' ? 'California FAIR Plan Dec Page' : activity.title || 'Document');
        const subtitle = [
            activity.policy_number ? `Policy: ${activity.policy_number}` : '',
            activity.insured_name ? `(${activity.insured_name})` : ''
        ].filter(Boolean).join(' ');

        setPreviewDoc({
            title,
            subtitle,
            url: null,
            loading: true,
            error: null,
            policyId: activity.policy_id,
            docType: activity.doc_type,
        });

        try {
            let storagePath = activity.storage_path || activity.file_path;
            let bucket = activity.bucket || (activity.type === 'upload' ? 'cfp-raw-decpage' : 'cfp-platform-documents');
            let resolvedFileName = activity.file_name;

            // Tier 1: Try document_id lookup in platform_documents
            if (!storagePath && activity.document_id) {
                const { data: pDoc } = await supabase
                    .from('platform_documents')
                    .select('storage_path, file_name, doc_type')
                    .eq('id', activity.document_id)
                    .maybeSingle();
                if (pDoc?.storage_path) {
                    storagePath = pDoc.storage_path;
                    bucket = 'cfp-platform-documents';
                    if (!resolvedFileName && pDoc.file_name) resolvedFileName = pDoc.file_name;
                }
            }

            // Tier 2: Try activity.id lookup in platform_documents & dec_page_submissions
            if (!storagePath && activity.id) {
                const { data: pDoc } = await supabase
                    .from('platform_documents')
                    .select('storage_path, file_name, doc_type')
                    .eq('id', activity.id)
                    .maybeSingle();
                if (pDoc?.storage_path) {
                    storagePath = pDoc.storage_path;
                    bucket = 'cfp-platform-documents';
                    if (!resolvedFileName && pDoc.file_name) resolvedFileName = pDoc.file_name;
                } else {
                    const { data: dSub } = await supabase
                        .from('dec_page_submissions')
                        .select('storage_path, file_path, file_name')
                        .eq('id', activity.id)
                        .maybeSingle();
                    if (dSub?.storage_path || dSub?.file_path) {
                        storagePath = dSub.storage_path || dSub.file_path;
                        bucket = 'cfp-raw-decpage';
                        if (!resolvedFileName && dSub.file_name) resolvedFileName = dSub.file_name;
                    }
                }
            }

            // Tier 3: Try policy_id lookup for matching platform documents or dec page
            if (!storagePath && activity.policy_id) {
                const { data: pDocs } = await supabase
                    .from('platform_documents')
                    .select('storage_path, file_name, doc_type')
                    .eq('policy_id', activity.policy_id)
                    .not('storage_path', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (pDocs && pDocs.length > 0) {
                    const matchingDoc = (activity.doc_type ? pDocs.find(d => d.doc_type === activity.doc_type) : null) || pDocs[0];
                    if (matchingDoc?.storage_path) {
                        storagePath = matchingDoc.storage_path;
                        bucket = 'cfp-platform-documents';
                        if (!resolvedFileName && matchingDoc.file_name) resolvedFileName = matchingDoc.file_name;
                    }
                }

                if (!storagePath) {
                    const { data: dSubs } = await supabase
                        .from('dec_pages')
                        .select('submission_id, dec_page_submissions(storage_path, file_path, file_name)')
                        .eq('policy_id', activity.policy_id)
                        .limit(1)
                        .maybeSingle();
                    const dSub = Array.isArray((dSubs as any)?.dec_page_submissions) ? (dSubs as any)?.dec_page_submissions[0] : (dSubs as any)?.dec_page_submissions;
                    if (dSub?.storage_path || dSub?.file_path) {
                        storagePath = dSub.storage_path || dSub.file_path;
                        bucket = 'cfp-raw-decpage';
                        if (!resolvedFileName && dSub.file_name) resolvedFileName = dSub.file_name;
                    }
                }
            }

            if (!storagePath) {
                setPreviewDoc(prev => prev ? {
                    ...prev,
                    loading: false,
                    error: 'Document record is logged in the system, but the file has not been uploaded to cloud storage yet.',
                } : null);
                return;
            }

            let url: string | null = null;
            if (bucket === 'cfp-raw-decpage' || activity.type === 'upload') {
                url = await getDecPageFileDownloadUrl(storagePath);
            } else {
                url = await getPlatformDocDownloadUrl(storagePath, bucket);
            }

            if (!url) {
                setPreviewDoc(prev => prev ? {
                    ...prev,
                    loading: false,
                    error: 'Could not generate a secure preview URL for this document.',
                } : null);
                return;
            }

            setPreviewDoc(prev => prev ? {
                ...prev,
                title: resolvedFileName || prev.title,
                url,
                loading: false,
                error: null,
            } : null);
        } catch (err) {
            setPreviewDoc(prev => prev ? {
                ...prev,
                loading: false,
                error: err instanceof Error ? err.message : 'An error occurred while loading the preview.',
            } : null);
        }
    };

    // Extract available years dynamically from activity dates
    const availableYears = useMemo(() => {
        const yearsSet = new Set<string>();
        activities.forEach(a => {
            if (a.created_at) {
                const yr = new Date(a.created_at).getFullYear().toString();
                if (yr && !isNaN(Number(yr))) yearsSet.add(yr);
            }
        });
        const arr = Array.from(yearsSet).sort((a, b) => Number(b) - Number(a));
        if (!arr.includes('2026')) {
            arr.unshift('2026');
        }
        return arr;
    }, [activities]);

    // Compute month counts for the selected year (or all years)
    const monthCounts = useMemo(() => {
        const countsMap: Record<string, number> = {};
        for (let m = 1; m <= 12; m++) {
            countsMap[String(m)] = 0;
        }

        activities.forEach(a => {
            if (!a.created_at) return;
            const d = new Date(a.created_at);
            const yr = d.getFullYear().toString();
            const mo = String(d.getMonth() + 1);

            if (selectedYear === 'all' || selectedYear === yr) {
                countsMap[mo] = (countsMap[mo] || 0) + 1;
            }
        });

        return countsMap;
    }, [activities, selectedYear]);

    // Available months in dropdown: Starting from June 2026 (month >= 6) and sorted latest to oldest
    const availableMonths = useMemo(() => {
        const validMonths = MONTH_NAMES.filter(m => {
            const mNum = parseInt(m.value, 10);
            if (selectedYear === '2026') {
                return mNum >= 6; // June 2026 onwards
            }
            return (monthCounts[m.value] || 0) > 0;
        });

        // Sort descending by month number (September, August, July, June)
        return validMonths.sort((a, b) => parseInt(b.value, 10) - parseInt(a.value, 10));
    }, [selectedYear, monthCounts]);

    // Activities filtered by date (Year + Month)
    const dateFilteredActivities = useMemo(() => {
        return activities.filter(a => {
            if (!a.created_at) return true;
            const d = new Date(a.created_at);
            const yr = d.getFullYear().toString();
            const mo = d.getMonth() + 1;
            const moStr = String(mo);

            if (selectedYear !== 'all' && yr !== selectedYear) return false;

            if (selectedMonth === 'all') {
                if (selectedYear === '2026') {
                    // Start from June 2026 onwards by default
                    return mo >= 6;
                }
                return true;
            }

            return moStr === selectedMonth;
        });
    }, [activities, selectedYear, selectedMonth]);

    // Filter counts (based on date-filtered activities)
    const counts = useMemo(() => {
        return {
            all: dateFilteredActivities.length,
            dec: dateFilteredActivities.filter(a => a.type === 'upload').length,
            rce: dateFilteredActivities.filter(a => a.type === 'document' && a.doc_type === 'rce').length,
            dic: dateFilteredActivities.filter(a => a.type === 'document' && (a.doc_type === 'dic_dec_page' || a.doc_type === 'quote')).length,
            other_docs: dateFilteredActivities.filter(a => a.type === 'document' && a.doc_type !== 'rce' && a.doc_type !== 'dic_dec_page' && a.doc_type !== 'quote').length,
            merge: dateFilteredActivities.filter(a => a.type === 'merge').length,
            issues: dateFilteredActivities.filter(a => {
                if (a.status === 'failed' || (a.event_type || '').includes('failed')) return true;
                const isAssigned = Boolean(a.policy_id || a.policy_number);
                if (!isAssigned && (
                    (a.event_type || '').includes('needs_review') ||
                    (a.event_type || '').includes('no_match') ||
                    a.match_status === 'needs_review' ||
                    a.match_status === 'no_match'
                )) return true;
                return false;
            }).length,
        };
    }, [dateFilteredActivities]);

    // Final filtered activities list with category filter and search query
    const filteredActivities = useMemo(() => {
        let list = dateFilteredActivities;
        if (selectedFilter === 'dec') list = list.filter(a => a.type === 'upload');
        else if (selectedFilter === 'rce') list = list.filter(a => a.type === 'document' && a.doc_type === 'rce');
        else if (selectedFilter === 'dic') list = list.filter(a => a.type === 'document' && (a.doc_type === 'dic_dec_page' || a.doc_type === 'quote'));
        else if (selectedFilter === 'other_docs') list = list.filter(a => a.type === 'document' && a.doc_type !== 'rce' && a.doc_type !== 'dic_dec_page' && a.doc_type !== 'quote');
        else if (selectedFilter === 'merge') list = list.filter(a => a.type === 'merge');
        else if (selectedFilter === 'issues') {
            list = list.filter(a => {
                if (a.status === 'failed' || (a.event_type || '').includes('failed')) return true;
                const isAssigned = Boolean(a.policy_id || a.policy_number);
                if (!isAssigned && (
                    (a.event_type || '').includes('needs_review') ||
                    (a.event_type || '').includes('no_match') ||
                    a.match_status === 'needs_review' ||
                    a.match_status === 'no_match'
                )) return true;
                return false;
            });
        }

        const q = deferredSearchQuery.trim().toLowerCase();
        if (q) {
            list = list.filter(a => {
                const polNum = (a.policy_number || a.meta?.policy_number || '').toLowerCase();
                const insName = (a.insured_name || a.meta?.insured_name || a.meta?.named_insured || '').toLowerCase();
                const fileName = (a.file_name || a.file_path || a.meta?.file_name || '').toLowerCase();
                const title = (a.title || '').toLowerCase();
                const detail = (a.detail || '').toLowerCase();
                const addr = (a.meta?.address || a.meta?.property_address || '').toLowerCase();
                return polNum.includes(q) ||
                    insName.includes(q) ||
                    fileName.includes(q) ||
                    title.includes(q) ||
                    detail.includes(q) ||
                    addr.includes(q);
            });
        }

        return list;
    }, [dateFilteredActivities, selectedFilter, deferredSearchQuery]);

    const visibleActivities = useMemo(() => {
        return filteredActivities.slice(0, visibleCount);
    }, [filteredActivities, visibleCount]);
    const hasMore = filteredActivities.length > visibleCount;

    const filterOptions: FilterOption[] = [
        { id: 'all', label: 'All', icon: <Layers size={12} /> },
        { id: 'dec', label: 'Dec Pages', icon: <FileText size={12} /> },
        { id: 'rce', label: 'RCE Reports', icon: <FileUp size={12} /> },
        { id: 'dic', label: 'Quotes & DICs', icon: <Shield size={12} /> },
        ...(counts.other_docs > 0 ? [{ id: 'other_docs' as const, label: 'Other Docs', icon: <Files size={12} /> }] : []),
        ...(counts.merge > 0 ? [{ id: 'merge' as const, label: 'Consolidations', icon: <Merge size={12} /> }] : []),
        ...(counts.issues > 0 ? [{ id: 'issues' as const, label: 'Needs Review', icon: <AlertTriangle size={12} />, isIssues: true }] : []),
    ];

    const hasActiveDateFilter = selectedYear !== '2026' || selectedMonth !== 'all';

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>Recent Activity & Document History</h2>
                    <span className={styles.subtitle}>
                        Complete log of uploaded Declaration Pages, RCEs, Quotes, and platform operations.
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        className={styles.refreshButton}
                        onClick={() => loadActivities(true)}
                        disabled={refreshing}
                        title="Refresh activity feed"
                    >
                        <RefreshCw size={14} className={refreshing ? styles.spinSlow : ''} />
                        {refreshing ? 'Refreshing…' : 'Refresh'}
                    </button>
                    <span className={styles.count}>
                        {selectedFilter === 'all' && !searchQuery.trim() && !hasActiveDateFilter
                            ? `${dateFilteredActivities.length} uploads (June – Sep 2026)`
                            : `${filteredActivities.length} of ${activities.length} total events`}
                    </span>
                </div>
            </div>

            {/* Search Bar & Period Filter Row */}
            {!loading && activities.length > 0 && (
                <div className={styles.controlsRow}>
                    <div className={styles.topControlRow}>
                        <div className={styles.searchWrapper}>
                            <Search size={14} className={styles.searchIcon} />
                            <input
                                type="text"
                                className={styles.searchInput}
                                placeholder="Search by CFP #, insured name, or file name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    className={styles.searchClearBtn}
                                    onClick={() => setSearchQuery('')}
                                    title="Clear search"
                                    type="button"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        {/* Clean Month & Year Dropdown Selectors */}
                        <div className={styles.periodFilterGroup}>
                            <div className={styles.periodSelectWrapper}>
                                <Calendar size={13} className={styles.periodSelectIcon} />
                                <span className={styles.periodSelectLabel}>Month:</span>
                                <select
                                    className={styles.periodSelect}
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                >
                                    <option value="all">
                                        All Months {selectedYear === '2026' ? '(June – Present)' : ''} ({dateFilteredActivities.length})
                                    </option>
                                    {availableMonths.map(m => {
                                        const count = monthCounts[m.value] || 0;
                                        return (
                                            <option key={m.value} value={m.value}>
                                                {m.fullName} {selectedYear !== 'all' ? selectedYear : ''} ({count} uploads)
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            <div className={styles.periodSelectWrapper}>
                                <span className={styles.periodSelectLabel}>Year:</span>
                                <select
                                    className={styles.periodSelect}
                                    value={selectedYear}
                                    onChange={(e) => {
                                        setSelectedYear(e.target.value);
                                        setSelectedMonth('all');
                                    }}
                                >
                                    {availableYears.map(yr => (
                                        <option key={yr} value={yr}>{yr}</option>
                                    ))}
                                    <option value="all">All Years</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className={styles.filterBar}>
                        {filterOptions.map(opt => {
                            const count = counts[opt.id];
                            const isActive = selectedFilter === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => {
                                        setSelectedFilter(opt.id);
                                    }}
                                    className={[
                                        styles.filterPill,
                                        isActive ? styles.filterPillActive : '',
                                        opt.isIssues ? styles.filterPillIssues : '',
                                    ].filter(Boolean).join(' ')}
                                >
                                    {opt.icon}
                                    <span>{opt.label}</span>
                                    <span className={styles.filterBadge}>{count}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Content States */}
            {loading ? (
                <div className={styles.loadingState}>
                    <Loader2 className={styles.spinner} />
                    <span>Loading activity and upload history...</span>
                </div>
            ) : activities.length === 0 ? (
                <div className={styles.emptyState}>
                    <Upload className={styles.emptyIcon} />
                    <p>No recent uploads found. Submit a declaration or document to see activity here.</p>
                </div>
            ) : filteredActivities.length === 0 ? (
                <div className={styles.emptyFilterState}>
                    <Filter size={24} style={{ opacity: 0.5, color: 'var(--text-muted)' }} />
                    <p>
                        {searchQuery.trim()
                            ? `No activity found matching "${searchQuery}"${selectedFilter !== 'all' ? ` in ${filterOptions.find(o => o.id === selectedFilter)?.label}` : ''}.`
                            : `No activity found for the selected filters.`}
                    </p>
                    <button
                        className={styles.clearFilterBtn}
                        onClick={() => {
                            setSelectedFilter('all');
                            setSelectedYear('all');
                            setSelectedMonth('all');
                            setSearchQuery('');
                        }}
                    >
                        <RotateCcw size={12} style={{ marginRight: 4 }} />
                        Reset All Filters (Show All {activities.length} Events)
                    </button>
                </div>
            ) : (
                <>
                    <div className={styles.timeline}>
                        {visibleActivities.map((activity, idx) => {
                            const sc = getStatusConfig(activity.status);
                            const isDone = activity.status === 'parsed' || activity.status === 'done';
                            const isFailed = activity.status === 'failed';

                            const isMerge = activity.type === 'merge';
                            const isDoc = activity.type === 'document';
                            const isUpload = activity.type === 'upload';
                            const isAssigned = Boolean(activity.policy_id || activity.policy_number);
                            const hasViewableDoc = isUpload || isDoc || !!activity.storage_path || !!activity.file_path;
                            const isDocUpload = isDoc && (activity.event_type || '').startsWith('doc.uploaded.');
                            const isDocProcessed = isDoc && (activity.event_type === 'document.processed' || isAssigned);
                            const isDocNeedsAction = isDoc && !isAssigned && (activity.event_type === 'document.needs_review' || activity.event_type === 'document.no_match' || activity.match_status === 'needs_review' || activity.match_status === 'no_match');
                            const isDocFailed = isDoc && activity.event_type === 'document.failed';
                            const rowClass = [
                                styles.row,
                                isMerge ? styles.rowMerge : '',
                                isDoc ? styles.rowDoc : '',
                            ].filter(Boolean).join(' ');

                            return (
                                <div key={`${activity.id}-${idx}`} className={rowClass}>
                                    {/* Status icon */}
                                    <div className={styles.statusCol}>
                                        <StatusIcon status={activity.status} type={activity.type} event_type={activity.event_type} isResolved={isAssigned} />
                                    </div>

                                    {/* Main info */}
                                    <div className={styles.mainCol}>
                                        {/* Status badge — only for non-complete states */}
                                        {!isDone && (
                                            <>
                                                <span className={`${styles.statusLabel} ${styles[sc.cssKey] || ''}`}>
                                                    {sc.label}
                                                </span>
                                                <span className={styles.divider}>—</span>
                                            </>
                                        )}

                                        {/* Action description */}
                                        <span className={`${styles.actionText} ${isMerge ? styles.actionTextMerge : ''} ${isDoc ? styles.actionTextDoc : ''}`}>
                                            {isMerge ? 'Client Records Consolidated' : isDoc ? getDocumentActionLabel(activity) : 'Dec Page Uploaded'}
                                        </span>

                                        {/* Client link */}
                                        {activity.insured_name && (
                                            <>
                                                <span className={styles.divider}>·</span>
                                                <span
                                                    className={styles.clickableLink}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        activity.client_id && router.push(`/client/${activity.client_id}`);
                                                    }}
                                                >
                                                    {activity.insured_name}
                                                </span>
                                            </>
                                        )}
                                        {activity.policy_number && (
                                            <>
                                                <span className={styles.divider}>·</span>
                                                <span
                                                    className={styles.clickableLink}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        activity.policy_id && router.push(`/policy/${activity.policy_id}`);
                                                    }}
                                                >
                                                    {activity.policy_number}
                                                </span>
                                            </>
                                        )}

                                        {/* View Document Button */}
                                        {hasViewableDoc && (
                                            <>
                                                <span className={styles.divider}>·</span>
                                                <button
                                                    type="button"
                                                    className={styles.viewDocBtn}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handlePreviewDoc(activity);
                                                    }}
                                                    title="View and preview uploaded document"
                                                >
                                                    <Eye size={12} />
                                                    <span>View</span>
                                                </button>
                                            </>
                                        )}

                                        {/* "Review & Assign" button for unassigned document types needing attention */}
                                        {isDoc && !isAssigned && (isDocNeedsAction || activity.match_status === 'needs_review' || activity.match_status === 'no_match' || (activity.event_type || '').includes('needs_review') || (activity.event_type || '').includes('no_match')) && (
                                            <>
                                                <span className={styles.divider}>·</span>
                                                <button
                                                    type="button"
                                                    className={styles.reviewActionBtn}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (activity.document_id) {
                                                            router.push(`/upload-document?reassign=${activity.document_id}`);
                                                        } else {
                                                            router.push('/admin/submissions?tab=review');
                                                        }
                                                    }}
                                                    title="Review and assign document to policy/client"
                                                >
                                                    <FileSearch size={11} />
                                                    Review & Assign
                                                    <ArrowRight size={10} />
                                                </button>
                                            </>
                                        )}

                                        {/* "Retry / Review" button for failed document processing */}
                                        {((isDoc && isDocFailed) || isFailed) && (
                                            <>
                                                <span className={styles.divider}>·</span>
                                                <button
                                                    type="button"
                                                    className={styles.failedActionBtn}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (activity.document_id) {
                                                            router.push(`/upload-document?reassign=${activity.document_id}`);
                                                        } else {
                                                            router.push('/admin/submissions');
                                                        }
                                                    }}
                                                    title="Inspect failed document"
                                                >
                                                    <RefreshCw size={10} />
                                                    Review & Retry
                                                </button>
                                            </>
                                        )}

                                        {/* "View RCE Data" verification link for processed RCE documents */}
                                        {isDoc && activity.policy_id && (isDocProcessed || isDocUpload) && activity.doc_type === 'rce' && (
                                            <>
                                                <span className={styles.divider}>·</span>
                                                <span
                                                    className={styles.viewDataLink}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/policy/${activity.policy_id}?tab=rce`);
                                                    }}
                                                >
                                                    <ExternalLink size={10} />
                                                    View RCE Data
                                                </span>
                                            </>
                                        )}

                                        {/* "Reassign" link for RCE upload events */}
                                        {isDoc && activity.document_id && activity.doc_type === 'rce' && !isDocNeedsAction && activity.match_status !== 'needs_review' && (
                                            <>
                                                <span className={styles.divider}>·</span>
                                                <span
                                                    className={styles.reassignLink}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/upload-document?reassign=${activity.document_id}`);
                                                    }}
                                                >
                                                    <RefreshCw size={10} />
                                                    Reassign RCE
                                                </span>
                                            </>
                                        )}

                                        {/* Detail text for merge events */}
                                        {isMerge && activity.detail && (
                                            <div className={styles.detailText}>{activity.detail}</div>
                                        )}

                                        {/* Detail text for document events */}
                                        {isDoc && activity.detail && (
                                            <div className={styles.detailText}>
                                                {((activity.file_path || activity.meta?.file_name || '').toUpperCase().includes('RENEWAL_EMAIL_ATTACHMENT') || (activity.file_path || activity.meta?.file_name || '').toUpperCase().includes('CFP') || activity.doc_type === 'dec_page') && activity.detail.includes('DIC Carrier')
                                                    ? 'A California FAIR Plan Declaration Page was successfully uploaded and applied.'
                                                    : activity.detail}
                                            </div>
                                        )}

                                        {/* File name hint for document uploads */}
                                        {activity.file_name && (
                                            <div className={styles.detailText} style={{ opacity: 0.75 }}>
                                                📄 {activity.file_name}
                                            </div>
                                        )}
                                    </div>

                                    {/* Supporting context for completed items */}
                                    <div className={styles.uploaderCol}>
                                        <span>{activity.uploaded_by}</span>
                                        {activity.type === 'upload' && isDone && (
                                            <span className={styles.successHints}>
                                                {activity.is_enriched ? (
                                                    <><Sparkles size={10} /><span>Data Checked</span></>
                                                ) : (
                                                    (new Date().getTime() - new Date(activity.created_at).getTime() > 120_000) ? (
                                                        <><Sparkles size={10} style={{ opacity: 0.4 }} /><span style={{ opacity: 0.6 }}>No Property Data</span></>
                                                    ) : (
                                                        <><Loader2 size={10} className={styles.spinSlow} /><span style={{ opacity: 0.6 }}>Fetching Data…</span></>
                                                    )
                                                )}
                                                {activity.flags_checked ? (
                                                    <><Shield size={10} /><span>Flags checked</span></>
                                                ) : (
                                                    <><Shield size={10} style={{ opacity: 0.4 }} /><span style={{ opacity: 0.6 }}>Pending</span></>
                                                )}
                                                {activity.processing_time_seconds != null && (
                                                    <>
                                                        <Timer size={10} />
                                                        <span>{activity.processing_time_seconds}s</span>
                                                    </>
                                                )}
                                            </span>
                                        )}
                                        {isDoc && isDocProcessed && (
                                            <span className={styles.successHints}>
                                                <><CheckCircle size={10} style={{ color: '#10b981' }} /><span>Matched</span></>
                                                {activity.match_confidence != null && activity.match_confidence > 0 && (
                                                    <span style={{ opacity: 0.7 }}>{Math.round(activity.match_confidence * 100)}%</span>
                                                )}
                                            </span>
                                        )}
                                    </div>

                                    {/* Error details if failed */}
                                    {isFailed && activity.error_message && (
                                        <div className={styles.errorCol}>
                                            <AlertTriangle size={12} />
                                            <span>{activity.error_message}</span>
                                        </div>
                                    )}

                                    {/* Timestamp */}
                                    <div className={styles.timeCol}>
                                        {formatTimeAgo(activity.created_at)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Progressive Pagination Controls */}
                    {hasMore && (
                        <div className={styles.showMoreRow}>
                            <button
                                className={styles.showMoreBtn}
                                onClick={() => setVisibleCount(prev => prev + 50)}
                            >
                                Load More (+50) · Showing {visibleActivities.length} of {filteredActivities.length}
                            </button>
                            {filteredActivities.length > visibleCount && (
                                <button
                                    className={styles.showMoreBtn}
                                    style={{ marginLeft: 8 }}
                                    onClick={() => setVisibleCount(filteredActivities.length)}
                                >
                                    Show All ({filteredActivities.length})
                                </button>
                            )}
                        </div>
                    )}
                    {visibleCount > 30 && filteredActivities.length > 30 && (
                        <div className={styles.showMoreRow} style={{ marginTop: hasMore ? 8 : 0 }}>
                            <button
                                className={styles.showMoreBtn}
                                onClick={() => setVisibleCount(30)}
                            >
                                Show Fewer (30)
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* ── Document Preview Modal ── */}
            {previewDoc && (
                <div
                    className={styles.previewModalBackdrop}
                    onClick={() => setPreviewDoc(null)}
                >
                    <div
                        className={styles.previewModalContainer}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className={styles.previewModalHeader}>
                            <div className={styles.previewModalTitleCol}>
                                <div className={styles.previewModalTitleRow}>
                                    <FileText size={18} className={styles.previewModalIcon} />
                                    <h3 className={styles.previewModalTitle}>{previewDoc.title}</h3>
                                </div>
                                {previewDoc.subtitle && (
                                    <span className={styles.previewModalSubtitle}>{previewDoc.subtitle}</span>
                                )}
                            </div>
                            <div className={styles.previewModalActions}>
                                {previewDoc.url && (
                                    <>
                                        <a
                                            href={previewDoc.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={styles.previewModalBtn}
                                            title="Open full document in new browser tab"
                                        >
                                            <ExternalLink size={14} />
                                            <span>Open</span>
                                        </a>
                                        <a
                                            href={previewDoc.url}
                                            download
                                            className={styles.previewModalBtn}
                                            title="Download document file"
                                        >
                                            <Download size={14} />
                                            <span>Download</span>
                                        </a>
                                    </>
                                )}
                                <button
                                    type="button"
                                    className={styles.previewModalCloseBtn}
                                    onClick={() => setPreviewDoc(null)}
                                    title="Close preview (Esc)"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className={styles.previewModalBody}>
                            {previewDoc.loading ? (
                                <div className={styles.previewLoading}>
                                    <Loader2 size={36} className={styles.spinSlow} />
                                    <span>Generating secure document preview...</span>
                                </div>
                            ) : previewDoc.error ? (
                                <div className={styles.previewError}>
                                    <AlertCircle size={36} style={{ color: '#ef4444' }} />
                                    <span className={styles.previewErrorTitle}>Unable to load document preview</span>
                                    <span className={styles.previewErrorMessage}>{previewDoc.error}</span>
                                    {previewDoc.policyId && (
                                        <Link
                                            href={`/upload-document?policy_id=${previewDoc.policyId}&doc_type=${previewDoc.docType || 'rce'}`}
                                            className={styles.previewRetryBtn}
                                            onClick={() => setPreviewDoc(null)}
                                        >
                                            <Upload size={13} />
                                            Upload / Attach Document
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
