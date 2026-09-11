'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
    Mail,
    Search,
    Clock,
    CheckCircle2,
    Send,
    FileText,
    Copy,
    Check,
    ExternalLink,
    RotateCcw,
    AlertCircle,
    XCircle,
    Loader2,
    Download,
    X,
    Plus,
} from 'lucide-react';
import styles from './ServicingEmailTable.module.scss';
import {
    ServicingEmailItem,
    ServicingStatus,
    ServicingEmailResponse,
    fetchServicingEmailData,
    updateServicingEmailItem,
    addToServicingEmail,
} from '@/lib/servicingEmail';
import {
    getPlatformDocDownloadUrl,
    getDecPageFileDownloadUrl,
} from '@/lib/api';

// Days until expiration calculation
function getDaysUntilExpiration(expDateStr: string | null): number | null {
    if (!expDateStr) return null;
    const exp = new Date(expDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = exp.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    } catch {
        return dateStr;
    }
}

export default function ServicingEmailPage() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ServicingEmailResponse>({
        openItems: [],
        completedItems: [],
        stats: { totalReady: 0, totalEmailed: 0, totalCompleted: 0, totalWillNotProceed: 0 },
    });

    const [activeTab, setActiveTab] = useState<'open' | 'completed'>('open');
    const [searchQuery, setSearchQuery] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // Global Search states
    const [globalResults, setGlobalResults] = useState<any[]>([]);
    const [isGlobalSearching, setIsGlobalSearching] = useState(false);
    const [showGlobalPopup, setShowGlobalPopup] = useState(false);
    const searchWrapperRef = useRef<HTMLDivElement>(null);

    // Inline field local states for fast editing and autosave
    const [editingAgent, setEditingAgent] = useState<{ [policyId: string]: string }>({});
    const [editingNotes, setEditingNotes] = useState<{ [policyId: string]: string }>({});
    const [, setSavingField] = useState<{ [key: string]: boolean }>({});

    // Document preview modal
    interface DocPreviewState {
        title: string;
        subtitle?: string;
        fileName?: string;
        policyId?: string;
        docType?: 'rce' | 'dic' | 'quote' | 'dec';
        url: string | null;
        loading: boolean;
        error: string | null;
    }
    const [previewDoc, setPreviewDoc] = useState<DocPreviewState | null>(null);

    // Load servicing email queue
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchServicingEmailData();
            setData(res);
        } catch (err) {
            console.error('Failed to load servicing email queue:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Close global search popup on click outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
                setShowGlobalPopup(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Global policy search when searching
    useEffect(() => {
        const query = searchQuery.trim();
        if (!query || query.length < 2) {
            setGlobalResults([]);
            setShowGlobalPopup(false);
            return;
        }

        const timer = setTimeout(async () => {
            setIsGlobalSearching(true);
            try {
                const res = await fetch(`/api/cfp-summary?search=${encodeURIComponent(query)}`);
                if (res.ok) {
                    const json = await res.json();
                    const allTerms: any[] = [];
                    (json.families || []).forEach((f: any) => {
                        (f.terms || []).forEach((t: any) => {
                            allTerms.push(t);
                        });
                    });
                    setGlobalResults(allTerms.slice(0, 6));
                    setShowGlobalPopup(true);
                }
            } catch (err) {
                console.error('Global search error:', err);
            } finally {
                setIsGlobalSearching(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Filter items according to active tab and search query
    const filteredItems = useMemo(() => {
        const list = activeTab === 'open' ? data.openItems : data.completedItems;
        const q = searchQuery.toLowerCase().trim();
        if (!q) return list;

        return list.filter(item => {
            return (
                (item.policy_number || '').toLowerCase().includes(q) ||
                (item.named_insured || '').toLowerCase().includes(q) ||
                (item.property_address || '').toLowerCase().includes(q) ||
                (item.assigned_agent || '').toLowerCase().includes(q) ||
                (item.notes || '').toLowerCase().includes(q) ||
                (item.carrier_name || '').toLowerCase().includes(q)
            );
        });
    }, [activeTab, data.openItems, data.completedItems, searchQuery]);

    // Copy formatted text helper
    const handleCopyText = (text: string, key: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => {
            setCopiedKey(prev => (prev === key ? null : prev));
        }, 1500);
    };

    // Copy full formatted email info
    const handleCopyEmailInfo = (item: ServicingEmailItem) => {
        const rceStatus = item.rce_carrier || (item.has_rce ? 'Yes' : 'Missing');
        const dicStatus = item.no_dic_available
            ? 'No Available DIC'
            : (item.dic_carrier || (item.has_dic ? 'Yes' : 'Missing'));
        const quoteStatus = item.has_es ? 'Yes' : 'Missing';

        const text = [
            `Policy: ${item.policy_number}`,
            `Named Insured: ${item.named_insured}`,
            `Property Address: ${item.property_address}`,
            `Carrier: ${item.carrier_name}`,
            `Expiration Date: ${formatDate(item.expiration_date)}`,
            `Assigned Agent: ${item.assigned_agent || 'Unassigned'}`,
            `Documents:`,
            `  • Quote / E&S: ${quoteStatus}`,
            `  • RCE: ${rceStatus}`,
            `  • DIC: ${dicStatus}`,
            item.notes ? `Remarks: ${item.notes}` : '',
        ]
            .filter(Boolean)
            .join('\n');

        handleCopyText(text, `full_email_${item.policy_id}`);
    };

    // Save assigned agent
    const handleSaveAgent = async (policyId: string, value: string) => {
        setSavingField(prev => ({ ...prev, [`agent_${policyId}`]: true }));
        try {
            await updateServicingEmailItem(policyId, { assigned_agent: value.slice(0, 30) });
            setData(prev => {
                const updateItem = (item: ServicingEmailItem) =>
                    item.policy_id === policyId ? { ...item, assigned_agent: value } : item;
                return {
                    ...prev,
                    openItems: prev.openItems.map(updateItem),
                    completedItems: prev.completedItems.map(updateItem),
                };
            });
        } catch (err) {
            console.error('Failed to save agent:', err);
        } finally {
            setSavingField(prev => ({ ...prev, [`agent_${policyId}`]: false }));
        }
    };

    // Save notes
    const handleSaveNotes = async (policyId: string, value: string) => {
        setSavingField(prev => ({ ...prev, [`notes_${policyId}`]: true }));
        try {
            await updateServicingEmailItem(policyId, { notes: value });
            setData(prev => {
                const updateItem = (item: ServicingEmailItem) =>
                    item.policy_id === policyId ? { ...item, notes: value } : item;
                return {
                    ...prev,
                    openItems: prev.openItems.map(updateItem),
                    completedItems: prev.completedItems.map(updateItem),
                };
            });
        } catch (err) {
            console.error('Failed to save notes:', err);
        } finally {
            setSavingField(prev => ({ ...prev, [`notes_${policyId}`]: false }));
        }
    };

    // Change status
    const handleStatusChange = async (item: ServicingEmailItem, newStatus: ServicingStatus) => {
        try {
            await updateServicingEmailItem(item.policy_id, { status: newStatus });
            // Refresh data to re-sort and update counts
            await loadData();
        } catch (err) {
            console.error('Failed to change status:', err);
        }
    };

    // Add to Servicing Email from Global Search
    const handleAddFromGlobalSearch = async (term: any) => {
        try {
            await addToServicingEmail(term.policy_id);
            setShowGlobalPopup(false);
            setSearchQuery('');
            await loadData();
        } catch (err) {
            console.error('Failed to add policy to queue:', err);
        }
    };

    // Document preview handler
    const handleOpenDocPreview = async (
        title: string,
        storagePath: string | null | undefined,
        fileName: string | null | undefined,
        bucket: 'cfp-platform-documents' | 'cfp-raw-decpage',
        docType: 'rce' | 'dic' | 'quote' | 'dec',
        policyId: string
    ) => {
        setPreviewDoc({
            title,
            fileName: fileName || undefined,
            policyId,
            docType,
            url: null,
            loading: true,
            error: null,
        });

        try {
            if (!storagePath) {
                setPreviewDoc(prev =>
                    prev
                        ? {
                              ...prev,
                              loading: false,
                              error: 'Document record exists, but file is not uploaded yet.',
                          }
                        : null
                );
                return;
            }

            let url: string | null = null;
            if (bucket === 'cfp-raw-decpage') {
                url = await getDecPageFileDownloadUrl(storagePath);
            } else {
                url = await getPlatformDocDownloadUrl(storagePath, bucket);
            }

            if (!url) {
                setPreviewDoc(prev =>
                    prev
                        ? {
                              ...prev,
                              loading: false,
                              error: 'Could not generate a secure preview URL.',
                          }
                        : null
                );
                return;
            }

            setPreviewDoc(prev => (prev ? { ...prev, url, loading: false, error: null } : null));
        } catch (err) {
            setPreviewDoc(prev =>
                prev
                    ? {
                          ...prev,
                          loading: false,
                          error: err instanceof Error ? err.message : 'Error previewing document',
                      }
                    : null
            );
        }
    };

    return (
        <div className={styles.container}>
            {/* ── Page Header ── */}
            <div className={styles.headerRow}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.pageTitle}>
                        <Mail size={24} style={{ color: 'var(--color-primary, #2243B6)' }} />
                        Servicing Email Hub
                    </h1>
                    <p className={styles.pageSubtitle}>
                        Review and dispatch completed VA quotes, RCEs, and DIC documents to assigned agents.
                    </p>
                </div>

                <div className={styles.topSubNav}>
                    <Link href="/email/servicing" className={`${styles.subNavLink} ${styles.active}`}>
                        Servicing Email Queue
                    </Link>
                    <Link href="/email" className={styles.subNavLink}>
                        Email Center & Studio
                    </Link>
                </div>
            </div>

            {/* ── KPI Strip ── */}
            <div className={styles.kpiStrip}>
                <div className={`${styles.kpiCard} ${styles.kpiReady}`}>
                    <div className={styles.kpiTop}>
                        <span className={styles.kpiTitle}>Ready to Send</span>
                        <Clock size={18} className={styles.kpiIcon} />
                    </div>
                    <span className={styles.kpiValue}>{data.stats.totalReady}</span>
                    <span className={styles.kpiSub}>Sorted by nearest expiry first</span>
                </div>

                <div className={`${styles.kpiCard} ${styles.kpiEmailed}`}>
                    <div className={styles.kpiTop}>
                        <span className={styles.kpiTitle}>Emailed to Agent</span>
                        <Send size={18} className={styles.kpiIcon} />
                    </div>
                    <span className={styles.kpiValue}>{data.stats.totalEmailed}</span>
                    <span className={styles.kpiSub}>Awaiting final agent reply/bind</span>
                </div>

                <div className={`${styles.kpiCard} ${styles.kpiCompleted}`}>
                    <div className={styles.kpiTop}>
                        <span className={styles.kpiTitle}>Completed / Done</span>
                        <CheckCircle2 size={18} className={styles.kpiIcon} />
                    </div>
                    <span className={styles.kpiValue}>{data.stats.totalCompleted}</span>
                    <span className={styles.kpiSub}>Handoff finalized</span>
                </div>

                <div className={`${styles.kpiCard} ${styles.kpiWillNotProceed}`}>
                    <div className={styles.kpiTop}>
                        <span className={styles.kpiTitle}>Will Not Proceed</span>
                        <XCircle size={18} className={styles.kpiIcon} />
                    </div>
                    <span className={styles.kpiValue}>{data.stats.totalWillNotProceed}</span>
                    <span className={styles.kpiSub}>Archived or discarded</span>
                </div>
            </div>

            {/* ── Toolbar: Search & Tab Switcher ── */}
            <div className={styles.toolbarCard}>
                <div className={styles.toolbarRow}>
                    {/* Search with Global Lookup Fallback */}
                    <div className={styles.searchWrapper} ref={searchWrapperRef}>
                        <Search size={15} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder="Search queue (Policy #, Insured, Address, Agent)..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onFocus={() => {
                                if (globalResults.length > 0) setShowGlobalPopup(true);
                            }}
                            className={styles.searchInput}
                        />

                        {/* Global Search Results Popup */}
                        {showGlobalPopup && searchQuery.trim().length >= 2 && (
                            <div className={styles.globalSearchPopup}>
                                <div style={{ padding: '0.35rem 0.5rem', fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                    Global Policy Lookup (Click to Queue for SE)
                                </div>
                                {isGlobalSearching ? (
                                    <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: '#64748b' }}>
                                        <Loader2 size={14} className="animate-spin" style={{ display: 'inline', marginRight: '6px' }} />
                                        Searching all policies...
                                    </div>
                                ) : globalResults.length === 0 ? (
                                    <div className={styles.globalSearchNotFound}>
                                        <span>No matching policies found for <strong>&quot;{searchQuery}&quot;</strong></span>
                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                            Try searching by Insured Name, Property Address, or Full CFP #.
                                        </span>
                                    </div>
                                ) : (
                                    globalResults.map(res => (
                                        <div key={res.policy_id} className={styles.globalSearchItem}>
                                            <div className={styles.globalItemInfo}>
                                                <span className={styles.globalItemPn}>
                                                    {res.policy_number || 'Pending'}
                                                    {res.in_servicing_email && (
                                                        <span style={{ marginLeft: '6px', fontSize: '0.6875rem', color: '#059669', background: '#dcfce7', padding: '1px 5px', borderRadius: '4px' }}>
                                                            ✓ Already in SE
                                                        </span>
                                                    )}
                                                </span>
                                                <span className={styles.globalItemDetails}>
                                                    {res.named_insured || 'Unknown'} • {res.property_address || '—'}
                                                </span>
                                            </div>
                                            {!res.in_servicing_email && (
                                                <button
                                                    type="button"
                                                    className={styles.copyEmailBtn}
                                                    onClick={() => handleAddFromGlobalSearch(res)}
                                                >
                                                    <Plus size={11} /> Add to SE
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Tab Switcher */}
                    <div className={styles.tabSwitcher}>
                        <button
                            type="button"
                            className={`${styles.tabBtn} ${activeTab === 'open' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('open')}
                        >
                            <span>Open / Ready to Send to Agent</span>
                            <span className={styles.tabBadge}>{data.stats.totalReady}</span>
                        </button>
                        <button
                            type="button"
                            className={`${styles.tabBtn} ${activeTab === 'completed' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('completed')}
                        >
                            <span>Completed / Done</span>
                            <span className={styles.tabBadge}>
                                {data.stats.totalEmailed + data.stats.totalCompleted + data.stats.totalWillNotProceed}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={loadData}
                            className={styles.copyBtn}
                            title="Refresh servicing email list"
                            style={{ marginLeft: '0.5rem', padding: '0.45rem 0.65rem' }}
                        >
                            <RotateCcw size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Table Card ── */}
            <div className={styles.tableCard}>
                {loading ? (
                    <div className={styles.loadingState}>
                        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary, #2243B6)' }} />
                        <span>Loading Servicing Email items...</span>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Mail size={40} />
                        <h3>No policies in this view</h3>
                        <p>
                            {searchQuery
                                ? `No policies match "${searchQuery}". Try clearing search.`
                                : activeTab === 'open'
                                ? 'No policies are currently marked as "Ready for Servicing Email". Virtual Assistants can send policies here directly from the CFP Summary page.'
                                : 'No completed or archived servicing emails found.'}
                        </p>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Date Added</th>
                                    <th>Documents (Quote / RCE / DIC)</th>
                                    <th>Policy Number</th>
                                    <th>Named Insured</th>
                                    <th>Property Address</th>
                                    <th>Expiration Date</th>
                                    <th>Assigned Agent</th>
                                    <th>Status</th>
                                    <th>Remarks / Notes</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.map(item => {
                                    const daysLeft = getDaysUntilExpiration(item.expiration_date);
                                    const agentVal =
                                        editingAgent[item.policy_id] !== undefined
                                            ? editingAgent[item.policy_id]
                                            : item.assigned_agent || '';
                                    const notesVal =
                                        editingNotes[item.policy_id] !== undefined
                                            ? editingNotes[item.policy_id]
                                            : item.notes || '';

                                    return (
                                        <tr key={item.policy_id}>
                                            {/* Date Completed by VA */}
                                            <td>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                    {formatDate(item.va_completed_at)}
                                                </span>
                                            </td>

                                            {/* Document Badges */}
                                            <td>
                                                <div className={styles.docGroup}>
                                                    {/* Quote Badge */}
                                                    {item.has_es ? (
                                                        <button
                                                            type="button"
                                                            className={`${styles.docBadge} ${styles.genericDoc}`}
                                                            onClick={() =>
                                                                handleOpenDocPreview(
                                                                    `Quote — ${item.policy_number}`,
                                                                    item.es_storage_path,
                                                                    item.es_file_name,
                                                                    'cfp-platform-documents',
                                                                    'quote',
                                                                    item.policy_id
                                                                )
                                                            }
                                                            title="Click to preview Quote"
                                                        >
                                                            <Check size={11} /> Quote
                                                        </button>
                                                    ) : (
                                                        <span className={`${styles.docBadge} ${styles.missingDoc}`}>
                                                            Missing Quote
                                                        </span>
                                                    )}

                                                    {/* RCE Badge */}
                                                    {item.has_rce ? (
                                                        <button
                                                            type="button"
                                                            className={`${styles.docBadge} ${
                                                                item.rce_carrier === 'Bamboo'
                                                                    ? styles.bamboo
                                                                    : item.rce_carrier === 'AM'
                                                                    ? styles.am
                                                                    : item.rce_carrier === 'Aegis'
                                                                    ? styles.aegis
                                                                    : styles.genericDoc
                                                            }`}
                                                            onClick={() =>
                                                                handleOpenDocPreview(
                                                                    `RCE (${item.rce_carrier || 'Uploaded'}) — ${item.policy_number}`,
                                                                    item.rce_storage_path,
                                                                    item.rce_file_name,
                                                                    'cfp-platform-documents',
                                                                    'rce',
                                                                    item.policy_id
                                                                )
                                                            }
                                                            title={`Click to preview RCE (${item.rce_carrier || 'Doc'})`}
                                                        >
                                                            <Check size={11} /> RCE: {item.rce_carrier || 'Doc'}
                                                        </button>
                                                    ) : (
                                                        <span className={`${styles.docBadge} ${styles.missingDoc}`}>
                                                            Missing RCE
                                                        </span>
                                                    )}

                                                    {/* DIC Badge */}
                                                    {item.no_dic_available ? (
                                                        <span
                                                            className={styles.docBadge}
                                                            style={{ background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }}
                                                            title="No Available DIC in all carriers"
                                                        >
                                                            No DIC
                                                        </span>
                                                    ) : item.has_dic ? (
                                                        <button
                                                            type="button"
                                                            className={`${styles.docBadge} ${
                                                                item.dic_carrier === 'Bamboo'
                                                                    ? styles.bamboo
                                                                    : item.dic_carrier === 'AM'
                                                                    ? styles.am
                                                                    : item.dic_carrier === 'Aegis'
                                                                    ? styles.aegis
                                                                    : item.dic_carrier === 'SageSure'
                                                                    ? styles.sagesure
                                                                    : styles.genericDoc
                                                            }`}
                                                            onClick={() =>
                                                                handleOpenDocPreview(
                                                                    `DIC (${item.dic_carrier || 'Uploaded'}) — ${item.policy_number}`,
                                                                    item.dic_storage_path,
                                                                    item.dic_file_name,
                                                                    'cfp-platform-documents',
                                                                    'dic',
                                                                    item.policy_id
                                                                )
                                                            }
                                                            title={`Click to preview DIC (${item.dic_carrier || 'Doc'})`}
                                                        >
                                                            <Check size={11} /> DIC: {item.dic_carrier || 'Doc'}
                                                        </button>
                                                    ) : (
                                                        <span className={`${styles.docBadge} ${styles.missingDoc}`}>
                                                            Missing DIC
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Policy Number */}
                                            <td>
                                                <div className={styles.pnCell}>
                                                    <Link
                                                        href={`/policies/${item.policy_id}`}
                                                        className={styles.pnLink}
                                                        target="_blank"
                                                    >
                                                        {item.policy_number}
                                                    </Link>
                                                    <button
                                                        type="button"
                                                        className={styles.copyBtn}
                                                        onClick={() =>
                                                            handleCopyText(
                                                                item.policy_number,
                                                                `pn_${item.policy_id}`
                                                            )
                                                        }
                                                        title="Copy Policy #"
                                                    >
                                                        {copiedKey === `pn_${item.policy_id}` ? (
                                                            <Check size={11} style={{ color: '#16a34a' }} />
                                                        ) : (
                                                            <Copy size={11} />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>

                                            {/* Named Insured */}
                                            <td>
                                                <div className={styles.pnCell}>
                                                    <span style={{ fontWeight: 600 }}>{item.named_insured}</span>
                                                    <button
                                                        type="button"
                                                        className={styles.copyBtn}
                                                        onClick={() =>
                                                            handleCopyText(
                                                                item.named_insured,
                                                                `ins_${item.policy_id}`
                                                            )
                                                        }
                                                        title="Copy Insured Name"
                                                    >
                                                        {copiedKey === `ins_${item.policy_id}` ? (
                                                            <Check size={11} style={{ color: '#16a34a' }} />
                                                        ) : (
                                                            <Copy size={11} />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>

                                            {/* Property Address */}
                                            <td>
                                                <div className={styles.pnCell}>
                                                    <span
                                                        style={{
                                                            maxWidth: '220px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            display: 'inline-block',
                                                        }}
                                                        title={item.property_address}
                                                    >
                                                        {item.property_address}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className={styles.copyBtn}
                                                        onClick={() =>
                                                            handleCopyText(
                                                                item.property_address,
                                                                `addr_${item.policy_id}`
                                                            )
                                                        }
                                                        title="Copy Property Address"
                                                    >
                                                        {copiedKey === `addr_${item.policy_id}` ? (
                                                            <Check size={11} style={{ color: '#16a34a' }} />
                                                        ) : (
                                                            <Copy size={11} />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>

                                            {/* Expiration Date with Near-Expiry Badges */}
                                            <td>
                                                <div className={styles.expCell}>
                                                    <span className={styles.expDate}>
                                                        {formatDate(item.expiration_date)}
                                                    </span>
                                                    {daysLeft !== null && (
                                                        <span
                                                            className={`${styles.urgencyBadge} ${
                                                                daysLeft <= 30
                                                                    ? styles.urgentRed
                                                                    : daysLeft <= 60
                                                                    ? styles.urgentYellow
                                                                    : styles.normal
                                                            }`}
                                                        >
                                                            {daysLeft < 0
                                                                ? `Expired (${Math.abs(daysLeft)}d ago)`
                                                                : `⚡ ${daysLeft} days left`}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Assigned Agent */}
                                            <td>
                                                <input
                                                    type="text"
                                                    value={agentVal}
                                                    maxLength={30}
                                                    placeholder="Assign agent..."
                                                    className={styles.agentInput}
                                                    onChange={e =>
                                                        setEditingAgent(prev => ({
                                                            ...prev,
                                                            [item.policy_id]: e.target.value,
                                                        }))
                                                    }
                                                    onBlur={e =>
                                                        handleSaveAgent(item.policy_id, e.target.value)
                                                    }
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            (e.target as HTMLInputElement).blur();
                                                        }
                                                    }}
                                                />
                                            </td>

                                            {/* Status Dropdown */}
                                            <td>
                                                <select
                                                    value={item.status}
                                                    onChange={e =>
                                                        handleStatusChange(
                                                            item,
                                                            e.target.value as ServicingStatus
                                                        )
                                                    }
                                                    className={`${styles.statusSelect} ${
                                                        item.status === 'ready'
                                                            ? styles.ready
                                                            : item.status === 'emailed_to_agent'
                                                            ? styles.emailed
                                                            : item.status === 'completed'
                                                            ? styles.completed
                                                            : styles.willNotProceed
                                                    }`}
                                                >
                                                    <option value="ready">Ready to Send</option>
                                                    <option value="emailed_to_agent">Emailed to Agent</option>
                                                    <option value="completed">Completed</option>
                                                    <option value="will_not_proceed">Will Not Proceed</option>
                                                </select>
                                            </td>

                                            {/* Remarks / Notes */}
                                            <td>
                                                <input
                                                    type="text"
                                                    value={notesVal}
                                                    placeholder="Add remarks / note..."
                                                    className={styles.notesInput}
                                                    onChange={e =>
                                                        setEditingNotes(prev => ({
                                                            ...prev,
                                                            [item.policy_id]: e.target.value,
                                                        }))
                                                    }
                                                    onBlur={e =>
                                                        handleSaveNotes(item.policy_id, e.target.value)
                                                    }
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            (e.target as HTMLInputElement).blur();
                                                        }
                                                    }}
                                                />
                                            </td>

                                            {/* Actions */}
                                            <td>
                                                <div className={styles.actionBtns}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyEmailInfo(item)}
                                                        className={`${styles.copyEmailBtn} ${
                                                            copiedKey === `full_email_${item.policy_id}`
                                                                ? styles.copied
                                                                : ''
                                                        }`}
                                                        title="Copy complete email dispatch summary to clipboard"
                                                    >
                                                        {copiedKey === `full_email_${item.policy_id}` ? (
                                                            <>
                                                                <Check size={11} /> Copied!
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Copy size={11} /> Copy Info
                                                            </>
                                                        )}
                                                    </button>

                                                    <Link
                                                        href={`/policies/${item.policy_id}`}
                                                        target="_blank"
                                                        className={styles.viewPolicyBtn}
                                                        title="Open policy page in new tab"
                                                    >
                                                        <ExternalLink size={11} /> View
                                                    </Link>

                                                    {activeTab === 'completed' && (
                                                        <button
                                                            type="button"
                                                            className={styles.reopenBtn}
                                                            onClick={() =>
                                                                handleStatusChange(item, 'ready')
                                                            }
                                                            title="Reopen and return to Ready to Send queue"
                                                        >
                                                            <RotateCcw size={10} /> Reopen
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Document Preview Modal ── */}
            {previewDoc && (
                <div
                    className={styles.previewOverlay}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.65)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        padding: '1.5rem',
                    }}
                    onClick={() => setPreviewDoc(null)}
                >
                    <div
                        style={{
                            backgroundColor: '#ffffff',
                            borderRadius: '12px',
                            width: '100%',
                            maxWidth: '900px',
                            height: '85vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                            overflow: 'hidden',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '1rem 1.25rem',
                                borderBottom: '1px solid #e2e8f0',
                                backgroundColor: '#f8fafc',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileText size={18} style={{ color: 'var(--color-primary, #2243B6)' }} />
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                                    {previewDoc.title}
                                </h3>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {previewDoc.url && (
                                    <>
                                        <a
                                            href={previewDoc.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={styles.copyEmailBtn}
                                            style={{ textDecoration: 'none' }}
                                        >
                                            <ExternalLink size={12} /> Open in Tab
                                        </a>
                                        <a
                                            href={previewDoc.url}
                                            download={previewDoc.fileName || 'document.pdf'}
                                            className={styles.viewPolicyBtn}
                                            style={{ textDecoration: 'none' }}
                                        >
                                            <Download size={12} /> Download
                                        </a>
                                    </>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setPreviewDoc(null)}
                                    className={styles.copyBtn}
                                    style={{ padding: '0.35rem' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div style={{ flex: 1, position: 'relative', backgroundColor: '#f1f5f9' }}>
                            {previewDoc.loading ? (
                                <div className={styles.loadingState}>
                                    <Loader2 size={36} className="animate-spin" style={{ color: 'var(--color-primary, #2243B6)' }} />
                                    <span>Loading document preview...</span>
                                </div>
                            ) : previewDoc.error ? (
                                <div className={styles.emptyState}>
                                    <AlertCircle size={36} style={{ color: '#ef4444' }} />
                                    <h3>Unable to load document</h3>
                                    <p>{previewDoc.error}</p>
                                </div>
                            ) : previewDoc.url ? (
                                <iframe
                                    src={previewDoc.url}
                                    style={{ width: '100%', height: '100%', border: 'none' }}
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
