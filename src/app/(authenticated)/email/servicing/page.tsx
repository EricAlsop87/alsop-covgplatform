'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
    Mail,
    Search,
    Clock,
    CheckCircle2,
    Send,
    Copy,
    Check,
    RotateCcw,
    AlertCircle,
    XCircle,
    Loader2,
    Plus,
    MessageSquare,
    Inbox,
    CheckCheck,
    X,
    FileText,
    Undo2,
    AlertTriangle,
    Calendar,
} from 'lucide-react';
import styles from './ServicingEmailTable.module.scss';
import {
    ServicingEmailItem,
    ServicingStatus,
    ServicingOutcome,
    SERVICING_OUTCOMES,
    ServicingEmailResponse,
    fetchServicingEmailData,
    updateServicingEmailItem,
    addToServicingEmail,
    returnPolicyToVA,
} from '@/lib/servicingEmail';
import {
    getPlatformDocDownloadUrl,
    getDecPageFileDownloadUrl,
} from '@/lib/api';
import { getActiveAgents, findAgentByName } from '@/lib/agentsDirectory';
import { SendToAgentModal } from '@/components/servicing/SendToAgentModal';
import { EmailThreadDrawer } from '@/components/servicing/EmailThreadDrawer';

const EXP_MONTH_NAMES = [
    { value: '', label: 'All Expiry Months' },
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

// Days until expiration calculation
function getDaysUntilExpiration(expDateStr: string | null): number | null {
    if (!expDateStr) return null;
    const exp = new Date(expDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = exp.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Compact date format (MM/dd/yy e.g. 09/06/26)
function formatDateShort(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return `${mm}/${dd}/${yy}`;
    } catch {
        return dateStr;
    }
}

// Helper to get renewal cycle date (uses effective_date of the renewal term e.g. 2026-10-29, or expiration_date)
function getItemRenewalDate(item: ServicingEmailItem): Date | null {
    const dateStr = item.effective_date || item.expiration_date;
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

export default function ServicingEmailPage() {
    const agentsList = useMemo(() => getActiveAgents(), []);

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ServicingEmailResponse>({
        openItems: [],
        completedItems: [],
        stats: { totalReady: 0, totalEmailed: 0, totalEmailNotNeeded: 0, totalCompleted: 0, totalWillNotProceed: 0 },
    });
    const [activeTab, setActiveTab] = useState<'open' | 'completed' | 'replies'>('open');
    const [openSubFilter, setOpenSubFilter] = useState<'all' | 'needs_email' | 'actioned'>('all');
    const [hasNotesFilter, setHasNotesFilter] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // Expiration Cycle Filter states
    const [expYear, setExpYear] = useState('2026');
    const [expMonth, setExpMonth] = useState('');

    // Modal / Drawer States
    const [sendModalItem, setSendModalItem] = useState<ServicingEmailItem | null>(null);
    const [threadDrawerItem, setThreadDrawerItem] = useState<ServicingEmailItem | null>(null);

    // Return to VA Modal state
    const [returnModalItem, setReturnModalItem] = useState<ServicingEmailItem | null>(null);
    const [returnReason, setReturnReason] = useState('Missing DIC Dec Page');
    const [returnNotes, setReturnNotes] = useState('');
    const [returning, setReturning] = useState(false);

    // Global Search states
    const [globalResults, setGlobalResults] = useState<any[]>([]);
    const [isGlobalSearching, setIsGlobalSearching] = useState(false);
    const [showGlobalPopup, setShowGlobalPopup] = useState(false);
    const searchWrapperRef = useRef<HTMLDivElement>(null);

    // Inline field local states for fast editing and autosave
    const [editingNotes, setEditingNotes] = useState<{ [policyId: string]: string }>({});

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

    const handleConfirmReturn = async () => {
        if (!returnModalItem) return;
        setReturning(true);
        try {
            await returnPolicyToVA({
                policy_id: returnModalItem.policy_id,
                reason: returnReason,
                custom_notes: returnNotes.trim() || undefined,
            });
            setReturnModalItem(null);
            setReturnNotes('');
            setReturnReason('Missing DIC Dec Page');
            await loadData();
        } catch (err) {
            console.error('Failed to return policy to VA:', err);
        } finally {
            setReturning(false);
        }
    };

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

    // Items filtered by Renewal Cycle Year and Month
    const periodOpenItems = useMemo(() => {
        return data.openItems.filter(item => {
            const d = getItemRenewalDate(item);
            if (!d) return !expYear && !expMonth;
            if (expYear && String(d.getFullYear()) !== expYear) return false;
            if (expMonth && String(d.getMonth() + 1) !== expMonth) return false;
            return true;
        });
    }, [data.openItems, expYear, expMonth]);

    const periodCompletedItems = useMemo(() => {
        return data.completedItems.filter(item => {
            const d = getItemRenewalDate(item);
            if (!d) return !expYear && !expMonth;
            if (expYear && String(d.getFullYear()) !== expYear) return false;
            if (expMonth && String(d.getMonth() + 1) !== expMonth) return false;
            return true;
        });
    }, [data.completedItems, expYear, expMonth]);

    // Period-filtered dynamic stats for tab badges and filter counts
    const periodStats = useMemo(() => {
        const open = periodOpenItems;
        const completed = periodCompletedItems;
        const all = [...open, ...completed];
        return {
            totalOpen: open.length,
            totalReady: open.filter(i => i.status === 'ready').length,
            totalEmailed: open.filter(i => i.status === 'emailed_to_agent').length,
            totalActioned: open.filter(
                i => i.status === 'emailed_to_agent' || i.status === 'email_not_needed'
            ).length,
            totalEmailNotNeeded: open.filter(i => i.status === 'email_not_needed').length,
            totalReplies: all.filter(i => i.has_agent_reply).length,
            totalCompleted: completed.filter(i => i.status === 'completed').length,
            totalWillNotProceed: completed.filter(i => i.status === 'will_not_proceed').length,
            totalCompletedTab: completed.length,
            totalWithNotes: all.filter(i => (i.notes || '').trim().length > 0).length,
        };
    }, [periodOpenItems, periodCompletedItems]);

    // Filter items according to active tab, sub-filter, notes filter, and search query
    const filteredItems = useMemo(() => {
        let list: ServicingEmailItem[] = [];
        if (activeTab === 'open') {
            if (openSubFilter === 'needs_email') {
                list = periodOpenItems.filter(i => i.status === 'ready');
            } else if (openSubFilter === 'actioned') {
                list = periodOpenItems.filter(
                    i => i.status === 'emailed_to_agent' || i.status === 'email_not_needed'
                );
            } else {
                list = periodOpenItems;
            }
        } else if (activeTab === 'completed') {
            list = periodCompletedItems;
        } else if (activeTab === 'replies') {
            const all = [...periodOpenItems, ...periodCompletedItems];
            list = all.filter(i => i.has_agent_reply);
        }

        if (hasNotesFilter) {
            list = list.filter(item => (item.notes || '').trim().length > 0);
        }

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
    }, [activeTab, openSubFilter, hasNotesFilter, periodOpenItems, periodCompletedItems, searchQuery]);

    // Separate Ready vs Actioned for Open dual view
    const readyItems = useMemo(
        () => filteredItems.filter(i => i.status === 'ready'),
        [filteredItems]
    );
    const actionedItems = useMemo(
        () =>
            filteredItems.filter(
                i => i.status === 'emailed_to_agent' || i.status === 'email_not_needed'
            ),
        [filteredItems]
    );

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
            `Expiration Date: ${formatDateShort(item.expiration_date)}`,
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

    // Select Agent from Dropdown
    const handleSelectAgent = async (policyId: string, agentFullName: string) => {
        const agent = findAgentByName(agentFullName);
        try {
            await updateServicingEmailItem(policyId, {
                assigned_agent: agentFullName,
            });
            setData(prev => {
                const updateItem = (item: ServicingEmailItem) =>
                    item.policy_id === policyId
                        ? {
                              ...item,
                              assigned_agent: agentFullName,
                              assigned_agent_email: agent?.email || null,
                          }
                        : item;
                return {
                    ...prev,
                    openItems: prev.openItems.map(updateItem),
                    completedItems: prev.completedItems.map(updateItem),
                };
            });
        } catch (err) {
            console.error('Failed to save agent:', err);
        }
    };

    // Save notes
    const handleSaveNotes = async (policyId: string, value: string) => {
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
        }
    };

    // Change status
    const handleStatusChange = async (item: ServicingEmailItem, newStatus: ServicingStatus) => {
        try {
            await updateServicingEmailItem(item.policy_id, { status: newStatus });
            await loadData();
        } catch (err) {
            console.error('Failed to change status:', err);
        }
    };

    // Change outcome
    const handleOutcomeChange = async (
        item: ServicingEmailItem,
        newOutcome: ServicingOutcome
    ) => {
        const toggledOutcome = item.outcome === newOutcome ? null : newOutcome;
        let nextStatus: ServicingStatus = item.status;

        if (toggledOutcome === 'renewed') {
            nextStatus = 'completed';
        } else if (toggledOutcome === 'cancelled') {
            nextStatus = 'will_not_proceed';
        } else if (toggledOutcome === 'new_policy') {
            nextStatus = 'completed';
        } else if (toggledOutcome === 'requested_changes') {
            nextStatus =
                item.status === 'completed' || item.status === 'will_not_proceed'
                    ? 'ready'
                    : item.status;
        } else if (!toggledOutcome) {
            if (item.status === 'completed' || item.status === 'will_not_proceed') {
                nextStatus = 'ready';
            }
        }

        // Optimistic UI update
        setData(prev => {
            const updateList = (list: ServicingEmailItem[]) =>
                list.map(i =>
                    i.policy_id === item.policy_id
                        ? { ...i, outcome: toggledOutcome, status: nextStatus }
                        : i
                );
            return {
                ...prev,
                openItems: updateList(prev.openItems),
                completedItems: updateList(prev.completedItems),
            };
        });

        try {
            await updateServicingEmailItem(item.policy_id, {
                status: nextStatus,
                outcome: toggledOutcome,
            });
            await loadData();
        } catch (err) {
            console.error('Failed to update outcome:', err);
            await loadData();
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

    // Render Table Rows for a set of items
    const renderTableRows = (itemsToRender: ServicingEmailItem[]) => {
        return itemsToRender.map(item => {
            const daysLeft = getDaysUntilExpiration(item.expiration_date);
            const notesVal =
                editingNotes[item.policy_id] !== undefined
                    ? editingNotes[item.policy_id]
                    : item.notes || '';

            return (
                <tr key={item.policy_id}>
                    {/* Date Completed by VA with Sender */}
                    <td className={styles.alignCenter} style={{ width: '85px', minWidth: '80px' }}>
                        <div className={styles.dateCell}>
                            <span className={styles.dateMain}>
                                {formatDateShort(item.va_completed_at)}
                            </span>
                            <span
                                className={styles.dateSub}
                                title={`Sent by ${item.va_user_name || 'VA'} at ${formatDateShort(item.va_completed_at)}`}
                            >
                                {item.va_user_name ? `by ${item.va_user_name}` : 'by VA'}
                            </span>
                        </div>
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
                                href={`/policy/${item.policy_id}`}
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

                    {/* Property Address - wrapped downward */}
                    <td>
                        <div className={styles.addrCell}>
                            <span className={styles.addrText} title={item.property_address}>
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
                    <td className={styles.alignCenter}>
                        <div className={styles.expCell}>
                            <span className={styles.expDate}>
                                {formatDateShort(item.expiration_date)}
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
                                        : `⚡ ${daysLeft}d left`}
                                </span>
                            )}
                        </div>
                    </td>

                    {/* Assigned Agent Selector (Compact First Name / Nickname) */}
                    <td className={styles.alignCenter} style={{ width: '115px' }}>
                        <div className={styles.agentDisplay}>
                            <select
                                className={styles.agentSelectDropdown}
                                value={item.assigned_agent || ''}
                                onChange={e =>
                                    handleSelectAgent(item.policy_id, e.target.value)
                                }
                                title={
                                    item.assigned_agent
                                        ? `Assigned: ${item.assigned_agent} (${item.assigned_agent_email || ''})`
                                        : 'Select Assigned Agent'
                                }
                            >
                                <option value="">-- Agent --</option>
                                {['CSR', 'EA', 'Sales', 'Managers', 'Support'].map(team => {
                                    const teamMembers = agentsList.filter(
                                        a => a.team === team
                                    );
                                    if (teamMembers.length === 0) return null;
                                    return (
                                        <optgroup key={team} label={`── ${team} ──`}>
                                            {teamMembers.map(a => (
                                                <option
                                                    key={a.email}
                                                    value={a.fullName}
                                                >
                                                    {a.nickname || a.fullName.split(' ')[0]}
                                                </option>
                                            ))}
                                        </optgroup>
                                    );
                                })}
                            </select>
                        </div>
                    </td>

                    {/* Status Dropdown (Ready to Send, Emailed to Agent, Email Not Needed) */}
                    <td className={styles.alignCenter} style={{ width: '145px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                            {item.status === 'completed' ? (
                                <span
                                    className={`${styles.statusSelect} ${styles.completed}`}
                                >
                                    ✓ Completed
                                </span>
                            ) : item.status === 'will_not_proceed' ? (
                                <span
                                    className={`${styles.statusSelect} ${styles.willNotProceed}`}
                                >
                                    Will Not Proceed
                                </span>
                            ) : (
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
                                            : item.status === 'email_not_needed'
                                            ? styles.emailNotNeeded
                                            : ''
                                    }`}
                                >
                                    <option value="ready">Ready to Send</option>
                                    <option value="emailed_to_agent">Emailed to Agent</option>
                                    <option value="email_not_needed">Email Not Needed</option>
                                </select>
                            )}

                            {/* Agent Reply Notification Pill */}
                            {item.has_agent_reply && (
                                <button
                                    type="button"
                                    className={styles.replyBadge}
                                    onClick={() => setThreadDrawerItem(item)}
                                    title={item.last_reply_text || 'New reply from agent'}
                                >
                                    <MessageSquare size={10} />
                                    <span>
                                        Reply: {item.last_reply_from || 'Agent'}
                                    </span>
                                </button>
                            )}
                        </div>
                    </td>

                    {/* Remarks / Notes - Larger Textarea */}
                    <td>
                        <textarea
                            rows={2}
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
                        />
                    </td>

                    {/* Actions Column (Vertical Stack) */}
                    <td>
                        <div className={styles.actionBtnsVertical}>
                            {/* Send Email to Agent Button */}
                            {item.status !== 'completed' && item.status !== 'will_not_proceed' && (
                                <button
                                    type="button"
                                    className={styles.sendEmailBtn}
                                    onClick={() => setSendModalItem(item)}
                                    title="Send renewal package email with Quote, RCE, and DIC attachments"
                                >
                                    <Send size={10} /> Send Email
                                </button>
                            )}

                            {/* Message Thread Drawer Button */}
                            <button
                                type="button"
                                className={`${styles.threadBtn} ${
                                    item.has_agent_reply ? styles.hasReply : ''
                                }`}
                                onClick={() => setThreadDrawerItem(item)}
                                title="View email conversation thread and agent replies"
                            >
                                <MessageSquare size={10} /> Thread
                            </button>

                            {/* Copy Info Button */}
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
                                        <Check size={10} /> Copied!
                                    </>
                                ) : (
                                    <>
                                        <Copy size={10} /> Copy Info
                                    </>
                                )}
                            </button>

                            {/* Return to VA Button (Removes from Servicing and returns to CFP Summary with reason) */}
                            {item.status !== 'completed' && item.status !== 'will_not_proceed' && (
                                <button
                                    type="button"
                                    className={styles.returnToVaBtn}
                                    onClick={() => {
                                        setReturnModalItem(item);
                                        setReturnReason('Missing DIC Dec Page');
                                        setReturnNotes('');
                                    }}
                                    title="Return policy to CFP Summary / VA to request missing documents or revisions"
                                >
                                    <Undo2 size={10} /> Return
                                </button>
                            )}

                            {/* Reopen Action for Completed Tab */}
                            {(item.status === 'completed' || item.status === 'will_not_proceed') && (
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

                    {/* Dedicated Outcome Column */}
                    <td>
                        <div className={styles.outcomeCol}>
                            <div className={styles.outcomeBtnGroup}>
                                {SERVICING_OUTCOMES.map(opt => {
                                    const isSelected = item.outcome === opt.id;
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            className={`${styles.outcomeOptionBtn} ${
                                                isSelected ? styles.activeOutcome : ''
                                            }`}
                                            style={{
                                                background: isSelected ? opt.badgeBg : opt.btnBg,
                                                color: isSelected ? opt.badgeColor : opt.btnColor,
                                                borderColor: isSelected ? opt.badgeColor : opt.btnBorder,
                                            }}
                                            onClick={() => handleOutcomeChange(item, opt.id)}
                                            title={opt.description}
                                        >
                                            {isSelected ? (
                                                <Check size={10} />
                                            ) : (
                                                <span
                                                    style={{
                                                        width: 7,
                                                        height: 7,
                                                        borderRadius: '50%',
                                                        background: opt.btnColor,
                                                        display: 'inline-block',
                                                    }}
                                                />
                                            )}
                                            <span>{opt.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </td>
                </tr>
            );
        });
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
                        Dispatch completed renewal packages with Quote, RCE, and DIC attachments directly to agents and track live replies.
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
                    <span className={styles.kpiValue}>{periodStats.totalReady}</span>
                    <span className={styles.kpiSub}>Sorted by nearest expiry first</span>
                </div>

                <div className={`${styles.kpiCard} ${styles.kpiEmailed}`}>
                    <div className={styles.kpiTop}>
                        <span className={styles.kpiTitle}>Email Sent</span>
                        <Send size={18} className={styles.kpiIcon} />
                    </div>
                    <span className={styles.kpiValue}>{periodStats.totalEmailed}</span>
                    <span className={styles.kpiSub}>Dispatched to assigned agents</span>
                </div>

                <div className={`${styles.kpiCard} ${styles.kpiCompleted}`}>
                    <div className={styles.kpiTop}>
                        <span className={styles.kpiTitle}>Completed / Done</span>
                        <CheckCircle2 size={18} className={styles.kpiIcon} />
                    </div>
                    <span className={styles.kpiValue}>{periodStats.totalCompleted}</span>
                    <span className={styles.kpiSub}>Handoff finalized</span>
                </div>

                <div className={`${styles.kpiCard} ${styles.kpiWillNotProceed}`}>
                    <div className={styles.kpiTop}>
                        <span className={styles.kpiTitle}>Will Not Proceed</span>
                        <XCircle size={18} className={styles.kpiIcon} />
                    </div>
                    <span className={styles.kpiValue}>{periodStats.totalWillNotProceed}</span>
                    <span className={styles.kpiSub}>Archived or cancelled</span>
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

                    {/* Expiration Date / Renewal Cycle Filter Group */}
                    <div className={styles.expiryFilterGroup}>
                        <div className={styles.filterSelectWrapper} title="Filter policies by expiration year">
                            <Calendar size={13} style={{ color: '#64748b' }} />
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Year:</span>
                            <select
                                className={styles.filterSelect}
                                value={expYear}
                                onChange={e => setExpYear(e.target.value)}
                            >
                                <option value="">All Years</option>
                                <option value="2026">2026</option>
                                <option value="2025">2025</option>
                                <option value="2027">2027</option>
                            </select>
                        </div>

                        <div className={styles.filterSelectWrapper} title="Filter policies by expiration month (renewal cycle)">
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Expiry:</span>
                            <select
                                className={styles.filterSelect}
                                value={expMonth}
                                onChange={e => setExpMonth(e.target.value)}
                            >
                                {EXP_MONTH_NAMES.map(m => (
                                    <option key={m.value} value={m.value}>
                                        {m.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Tab Switcher */}
                    <div className={styles.tabSwitcher}>
                        <button
                            type="button"
                            className={`${styles.tabBtn} ${activeTab === 'open' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('open')}
                        >
                            <span>Open / In Progress</span>
                            <span className={styles.tabBadge}>{periodStats.totalOpen}</span>
                        </button>

                        <button
                            type="button"
                            className={`${styles.tabBtn} ${activeTab === 'replies' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('replies')}
                            title="Filter policies that have incoming agent replies"
                        >
                            <MessageSquare size={13} style={{ color: periodStats.totalReplies > 0 ? '#10b981' : undefined }} />
                            <span>Agent Replies</span>
                            <span
                                className={styles.tabBadge}
                                style={{
                                    background: periodStats.totalReplies > 0 ? '#10b981' : undefined,
                                    color: periodStats.totalReplies > 0 ? '#ffffff' : undefined,
                                }}
                            >
                                {periodStats.totalReplies}
                            </span>
                        </button>

                        <button
                            type="button"
                            className={`${styles.tabBtn} ${activeTab === 'completed' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('completed')}
                        >
                            <span>Completed / Done</span>
                            <span className={styles.tabBadge}>
                                {periodStats.totalCompletedTab}
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

                {/* Sub-Filter Pills and Notes Filter for Open View */}
                {activeTab === 'open' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Filter Section:</span>
                            <button
                                type="button"
                                className={`${styles.tabBtn} ${openSubFilter === 'all' ? styles.activeTab : ''}`}
                                onClick={() => setOpenSubFilter('all')}
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                            >
                                All Open ({periodStats.totalOpen})
                            </button>
                            <button
                                type="button"
                                className={`${styles.tabBtn} ${openSubFilter === 'needs_email' ? styles.activeTab : ''}`}
                                onClick={() => setOpenSubFilter('needs_email')}
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                            >
                                <Clock size={11} /> Needs Emailing ({periodStats.totalReady})
                            </button>
                            <button
                                type="button"
                                className={`${styles.tabBtn} ${openSubFilter === 'actioned' ? styles.activeTab : ''}`}
                                onClick={() => setOpenSubFilter('actioned')}
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                            >
                                <Send size={11} /> Actioned / Emailed to Agent ({periodStats.totalActioned})
                            </button>
                        </div>

                        {/* Has Remarks / Notes Filter Toggle */}
                        <button
                            type="button"
                            className={`${styles.filterPill} ${hasNotesFilter ? styles.activeFilterPill : ''}`}
                            onClick={() => setHasNotesFilter(prev => !prev)}
                            title="Toggle filter to show only policies that have remarks or notes"
                        >
                            <FileText size={12} />
                            <span>Has Remarks / Notes</span>
                            {periodStats.totalWithNotes > 0 && (
                                <span className={styles.filterPillCount}>{periodStats.totalWithNotes}</span>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* ── Table Cards ── */}
            {loading ? (
                <div className={styles.tableCard}>
                    <div className={styles.loadingState}>
                        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary, #2243B6)' }} />
                        <span>Loading Servicing Email items...</span>
                    </div>
                </div>
            ) : filteredItems.length === 0 ? (
                <div className={styles.tableCard}>
                    <div className={styles.emptyState}>
                        <Mail size={40} />
                        <h3>No policies in this view</h3>
                        <p>
                            {searchQuery
                                ? `No policies match "${searchQuery}". Try clearing search.`
                                : hasNotesFilter
                                ? 'No policies with notes found in this tab. Click "Has Remarks / Notes" to turn off filter.'
                                : activeTab === 'replies'
                                ? 'No agent replies have been logged yet. When an agent replies or you simulate a reply in the thread, it will appear here.'
                                : activeTab === 'open'
                                ? 'No policies currently in this open view.'
                                : 'No completed or archived servicing emails found.'}
                        </p>
                    </div>
                </div>
            ) : activeTab === 'open' && openSubFilter === 'all' ? (
                /* Dual Section Layout for Open Tab: 1. Needs Emailing, 2. Actioned */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Section 1: Needs Emailing / Ready to Send */}
                    <div className={styles.tableCard}>
                        <div className={styles.sectionHeader}>
                            <div className={styles.sectionTitle}>
                                <Clock size={14} style={{ color: '#f59e0b' }} />
                                <span>Needs Emailing / Ready to Send</span>
                            </div>
                            <span className={styles.sectionCountBadge}>{readyItems.length} policies</span>
                        </div>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th className={styles.alignCenter} style={{ width: '85px' }}>Date</th>
                                        <th style={{ width: '90px' }}>Documents</th>
                                        <th style={{ width: '115px' }}>Policy Number</th>
                                        <th style={{ width: '120px' }}>Named Insured</th>
                                        <th style={{ width: '150px' }}>Property Address</th>
                                        <th className={styles.alignCenter} style={{ width: '85px' }}>Expiration</th>
                                        <th className={styles.alignCenter} style={{ width: '115px' }}>Agent</th>
                                        <th className={styles.alignCenter} style={{ width: '145px' }}>Status</th>
                                        <th style={{ width: '110px' }}>Remarks</th>
                                        <th className={styles.alignCenter} style={{ width: '80px' }}>Actions</th>
                                        <th style={{ width: '120px' }}>Outcome</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {readyItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.8125rem' }}>
                                                No pending policies need emailing. All caught up!
                                            </td>
                                        </tr>
                                    ) : (
                                        renderTableRows(readyItems)
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Section 2: Actioned / Emailed to Agent */}
                    <div className={styles.tableCard}>
                        <div className={styles.sectionHeader} style={{ background: '#f5f3ff', borderBottomColor: '#ddd6fe' }}>
                            <div className={styles.sectionTitle} style={{ color: '#6d28d9' }}>
                                <Send size={14} style={{ color: '#8b5cf6' }} />
                                <span>Actioned — Emailed to Agent (Awaiting Outcome / Resolution)</span>
                            </div>
                            <span className={styles.sectionCountBadge} style={{ background: '#ede9fe', color: '#6d28d9' }}>
                                {actionedItems.length} policies
                            </span>
                        </div>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th className={styles.alignCenter} style={{ width: '85px' }}>Date</th>
                                        <th style={{ width: '90px' }}>Documents</th>
                                        <th style={{ width: '115px' }}>Policy Number</th>
                                        <th style={{ width: '120px' }}>Named Insured</th>
                                        <th style={{ width: '150px' }}>Property Address</th>
                                        <th className={styles.alignCenter} style={{ width: '85px' }}>Expiration</th>
                                        <th className={styles.alignCenter} style={{ width: '115px' }}>Agent</th>
                                        <th className={styles.alignCenter} style={{ width: '145px' }}>Status</th>
                                        <th style={{ width: '110px' }}>Remarks</th>
                                        <th className={styles.alignCenter} style={{ width: '80px' }}>Actions</th>
                                        <th style={{ width: '120px' }}>Outcome</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {actionedItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.8125rem' }}>
                                                No actioned policies currently awaiting agent reply or resolution.
                                            </td>
                                        </tr>
                                    ) : (
                                        renderTableRows(actionedItems)
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                /* Single Table View (for filtered, completed, or replies view) */
                <div className={styles.tableCard}>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.alignCenter} style={{ width: '85px' }}>Date</th>
                                    <th style={{ width: '90px' }}>Documents</th>
                                    <th style={{ width: '115px' }}>Policy Number</th>
                                    <th style={{ width: '120px' }}>Named Insured</th>
                                    <th style={{ width: '150px' }}>Property Address</th>
                                    <th className={styles.alignCenter} style={{ width: '85px' }}>Expiration</th>
                                    <th className={styles.alignCenter} style={{ width: '115px' }}>Agent</th>
                                    <th className={styles.alignCenter} style={{ width: '145px' }}>Status</th>
                                    <th style={{ width: '110px' }}>Remarks</th>
                                    <th className={styles.alignCenter} style={{ width: '80px' }}>Actions</th>
                                    <th style={{ width: '120px' }}>Outcome</th>
                                </tr>
                            </thead>
                            <tbody>{renderTableRows(filteredItems)}</tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Send to Agent Modal ── */}
            {sendModalItem && (
                <SendToAgentModal
                    item={sendModalItem}
                    onClose={() => setSendModalItem(null)}
                    onSuccess={async () => {
                        await loadData();
                    }}
                />
            )}

            {/* ── Conversation Thread Drawer ── */}
            {threadDrawerItem && (
                <EmailThreadDrawer
                    item={threadDrawerItem}
                    onClose={() => {
                        setThreadDrawerItem(null);
                        loadData();
                    }}
                    onStatusChange={async newStatus => {
                        await updateServicingEmailItem(threadDrawerItem.policy_id, {
                            status: newStatus as ServicingStatus,
                        });
                        await loadData();
                    }}
                />
            )}

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
                                            Open in Tab
                                        </a>
                                        <a
                                            href={previewDoc.url}
                                            download={previewDoc.fileName || 'document.pdf'}
                                            className={styles.copyBtn}
                                            style={{ textDecoration: 'none' }}
                                        >
                                            Download
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

            {/* ── Return to VA / CFP Summary Modal ── */}
            {returnModalItem && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        padding: '1rem',
                    }}
                    onClick={() => !returning && setReturnModalItem(null)}
                >
                    <div
                        style={{
                            backgroundColor: '#ffffff',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
                            maxWidth: '520px',
                            width: '100%',
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
                                borderBottom: '1px solid #fee2e2',
                                backgroundColor: '#fef2f2',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '6px',
                                        background: '#fee2e2',
                                        color: '#dc2626',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Undo2 size={18} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#991b1b', margin: 0 }}>
                                        Return Policy to CFP Summary
                                    </h3>
                                    <span style={{ fontSize: '0.75rem', color: '#b91c1c' }}>
                                        Kicks policy back to VA queue with requested action
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => !returning && setReturnModalItem(null)}
                                className={styles.copyBtn}
                                disabled={returning}
                                style={{ padding: '0.35rem' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Policy Info Card */}
                            <div
                                style={{
                                    padding: '0.75rem 1rem',
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.25rem',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#0f172a' }}>
                                        {returnModalItem.policy_number}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        {returnModalItem.carrier_name}
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.8125rem', color: '#334155', fontWeight: 600 }}>
                                    {returnModalItem.named_insured}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    {returnModalItem.property_address}
                                </span>
                            </div>

                            {/* Reason Selector */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a' }}>
                                    Select Reason for Return:
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                                    {[
                                        'Missing DIC Dec Page',
                                        'Missing / Incorrect RCE',
                                        'Missing Quote',
                                        'Quote Needs Revision',
                                        'Accidentally Sent to SE',
                                        'Other',
                                    ].map(r => (
                                        <button
                                            key={r}
                                            type="button"
                                            onClick={() => setReturnReason(r)}
                                            style={{
                                                padding: '0.5rem 0.6rem',
                                                fontSize: '0.75rem',
                                                fontWeight: returnReason === r ? 700 : 500,
                                                textAlign: 'left',
                                                borderRadius: '6px',
                                                border:
                                                    returnReason === r
                                                        ? '2px solid #dc2626'
                                                        : '1px solid #cbd5e1',
                                                background:
                                                    returnReason === r ? '#fef2f2' : '#ffffff',
                                                color:
                                                    returnReason === r ? '#991b1b' : '#334155',
                                                cursor: 'pointer',
                                                transition: 'all 0.12s ease',
                                            }}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Additional Instructions textarea */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a' }}>
                                    Specific Instructions / Notes for VA (Optional):
                                </label>
                                <textarea
                                    rows={3}
                                    value={returnNotes}
                                    onChange={e => setReturnNotes(e.target.value)}
                                    placeholder="e.g. Please upload the 2026 Aegis DIC dec page and re-send to Servicing..."
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        padding: '0.5rem 0.75rem',
                                        fontSize: '0.8125rem',
                                        borderRadius: '6px',
                                        border: '1px solid #cbd5e1',
                                        background: '#f8fafc',
                                        resize: 'vertical',
                                        fontFamily: 'inherit',
                                    }}
                                />
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                gap: '0.5rem',
                                padding: '0.85rem 1.25rem',
                                borderTop: '1px solid #e2e8f0',
                                backgroundColor: '#f8fafc',
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => !returning && setReturnModalItem(null)}
                                disabled={returning}
                                style={{
                                    padding: '0.45rem 0.85rem',
                                    fontSize: '0.8125rem',
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    color: '#475569',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmReturn}
                                disabled={returning}
                                style={{
                                    padding: '0.45rem 1rem',
                                    fontSize: '0.8125rem',
                                    fontWeight: 700,
                                    borderRadius: '6px',
                                    border: '1px solid #dc2626',
                                    background: '#dc2626',
                                    color: '#ffffff',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                }}
                            >
                                {returning ? (
                                    <>
                                        <Loader2 size={13} className="animate-spin" />
                                        <span>Returning...</span>
                                    </>
                                ) : (
                                    <>
                                        <Undo2 size={13} />
                                        <span>Confirm Return to VA</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
