'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
    Mail,
    Search,
    Clock,
    CheckCircle2,
    Send,
    RotateCcw,
    AlertCircle,
    XCircle,
    Loader2,
    MessageSquare,
    Inbox,
    FileText,
    ExternalLink,
    Shield,
    Check,
    Copy,
    User,
    ArrowUpRight,
    Sparkles,
} from 'lucide-react';
import styles from './ServicingEmailTable.module.scss';
import {
    ServicingEmailResponse,
    SentEmailItem,
    ReplyThreadItem,
    PendingHandoffItem,
    fetchServicingEmailData,
    updateServicingEmailItem,
} from '@/lib/servicingEmail';
import { SendMailModal, TEAM_RECIPIENTS } from '@/components/cfp/SendMailModal';
import { EmailThreadDrawer } from '@/components/servicing/EmailThreadDrawer';

// Format short date (MM/DD/YY)
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

// Format relative time or time of day
function formatDateTime(dateStr: string | null | undefined): { date: string; time: string; relative: string } {
    if (!dateStr) return { date: '—', time: '', relative: '' };
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return { date: dateStr, time: '', relative: '' };

        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        const date = `${mm}/${dd}/${yy}`;

        const time = d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });

        const diffMinutes = Math.floor((Date.now() - d.getTime()) / 60000);
        let relative = '';
        if (diffMinutes < 1) relative = 'just now';
        else if (diffMinutes < 60) relative = `${diffMinutes}m ago`;
        else if (diffMinutes < 1440) relative = `${Math.floor(diffMinutes / 60)}h ago`;
        else relative = `${Math.floor(diffMinutes / 1440)}d ago`;

        return { date, time, relative };
    } catch {
        return { date: dateStr, time: '', relative: '' };
    }
}

export default function ServicingEmailHubPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState<ServicingEmailResponse>({
        sentItems: [],
        replyItems: [],
        pendingItems: [],
        openItems: [],
        completedItems: [],
        stats: {
            totalSent: 0,
            totalReplies: 0,
            unreadReplies: 0,
            pendingHandoffs: 0,
            totalReady: 0,
            totalEmailed: 0,
            totalEmailNotNeeded: 0,
            totalCompleted: 0,
            totalWillNotProceed: 0,
        },
    });

    const [activeTab, setActiveTab] = useState<'sent' | 'replies' | 'pending'>('sent');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedManagerFilter, setSelectedManagerFilter] = useState('');
    const [copiedPn, setCopiedPn] = useState<string | null>(null);

    // Modals
    const [selectedTermForSendMail, setSelectedTermForSendMail] = useState<any | null>(null);
    const [isSendMailOpen, setIsSendMailOpen] = useState(false);
    const [selectedItemForThread, setSelectedItemForThread] = useState<any | null>(null);
    const [isThreadDrawerOpen, setIsThreadDrawerOpen] = useState(false);

    // Load data
    const loadData = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        else setRefreshing(true);
        try {
            const res = await fetchServicingEmailData();
            setData(res);
        } catch (err) {
            console.error('Error fetching servicing email hub data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCopyPn = (pn: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(pn);
        setCopiedPn(pn);
        setTimeout(() => setCopiedPn(null), 1500);
    };

    // Open Send Mail Modal
    const handleOpenSendMail = (item: any) => {
        // Construct term format required by SendMailModal
        const termPayload = {
            policy_id: item.policy_id,
            policy_number: item.policy_number,
            client_id: item.client_id,
            property_address: item.property_address,
            carrier_name: item.carrier_name || 'California FAIR Plan',
            has_dec: !!item.has_dec,
            has_rce: !!item.has_rce,
            rce_carrier: item.rce_carrier,
            has_dic: !!item.has_dic,
            dic_carrier: item.dic_carrier,
            has_es: !!item.has_es,
            carrier_quotes: item.carrier_quotes || null,
            expiration_date: item.expiration_date || null,
        };
        setSelectedTermForSendMail(termPayload);
        setIsSendMailOpen(true);
    };

    const handleSendMailSuccess = async () => {
        setIsSendMailOpen(false);
        await loadData(true);
    };

    // Open Thread Drawer
    const handleOpenThread = (item: any) => {
        setSelectedItemForThread({
            policy_id: item.policy_id,
            policy_number: item.policy_number,
            named_insured: item.named_insured,
            property_address: item.property_address,
            carrier_name: item.carrier_name,
            assigned_agent: item.sent_to_names?.[0] || item.assigned_agent || '',
            assigned_agent_email: item.sent_to?.[0] || item.assigned_agent_email || null,
            status: item.status,
        });
        setIsThreadDrawerOpen(true);
    };

    const handleStatusChange = async (status: string) => {
        if (!selectedItemForThread?.policy_id) return;
        try {
            await updateServicingEmailItem(selectedItemForThread.policy_id, { status: status as any });
            await loadData(true);
        } catch (err) {
            console.error('Error updating status:', err);
        }
    };

    // Filtering logic
    const filteredSentItems = useMemo(() => {
        let items = data.sentItems || [];
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            items = items.filter(i =>
                (i.policy_number || '').toLowerCase().includes(q) ||
                (i.named_insured || '').toLowerCase().includes(q) ||
                (i.property_address || '').toLowerCase().includes(q) ||
                (i.sent_by || '').toLowerCase().includes(q) ||
                (i.sent_to_names || []).some(n => n.toLowerCase().includes(q))
            );
        }
        if (selectedManagerFilter) {
            items = items.filter(i =>
                (i.sent_to_names || []).some(n => n.toLowerCase().includes(selectedManagerFilter.toLowerCase()))
            );
        }
        return items;
    }, [data.sentItems, searchQuery, selectedManagerFilter]);

    const filteredReplyItems = useMemo(() => {
        let items = data.replyItems || [];
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            items = items.filter(i =>
                (i.policy_number || '').toLowerCase().includes(q) ||
                (i.named_insured || '').toLowerCase().includes(q) ||
                (i.property_address || '').toLowerCase().includes(q) ||
                (i.last_reply_from || '').toLowerCase().includes(q) ||
                (i.last_reply_text || '').toLowerCase().includes(q)
            );
        }
        return items;
    }, [data.replyItems, searchQuery]);

    const filteredPendingItems = useMemo(() => {
        let items = data.pendingItems || [];
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            items = items.filter(i =>
                (i.policy_number || '').toLowerCase().includes(q) ||
                (i.named_insured || '').toLowerCase().includes(q) ||
                (i.property_address || '').toLowerCase().includes(q) ||
                (i.notes || '').toLowerCase().includes(q)
            );
        }
        return items;
    }, [data.pendingItems, searchQuery]);

    const totalSentCount = data.stats?.totalSent ?? data.sentItems?.length ?? 0;
    const totalRepliesCount = data.stats?.totalReplies ?? data.replyItems?.length ?? 0;
    const unreadRepliesCount = data.stats?.unreadReplies ?? (data.replyItems || []).filter(r => r.is_unread).length ?? 0;
    const pendingHandoffsCount = data.stats?.pendingHandoffs ?? data.pendingItems?.length ?? 0;

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.headerRow}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.pageTitle}>
                        <Mail size={24} style={{ color: 'var(--color-primary, #2243B6)' }} />
                        Email Center &bull; Sent &amp; Replies Hub
                    </h1>
                    <p className={styles.pageSubtitle}>
                        Centralized outbox of quote handoffs sent by VAs to Managers, live thread replies, and pending quotes ready to dispatch.
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                        type="button"
                        className={styles.actionBtnSecondary}
                        onClick={() => loadData(true)}
                        disabled={refreshing || loading}
                    >
                        <RotateCcw size={14} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Refreshing...' : 'Refresh Hub'}
                    </button>
                    <Link href="/cfp-summary" className={styles.actionBtnPrimary}>
                        <Sparkles size={14} /> Open CFP Quoting Dashboard
                    </Link>
                </div>
            </div>

            {/* KPI Metric Strip */}
            <div className={styles.kpiStrip}>
                <div
                    className={`${styles.kpiCard} ${activeTab === 'sent' ? styles.kpiEmailed : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setActiveTab('sent')}
                >
                    <div className={styles.kpiTop}>
                        <span className={styles.kpiTitle}>Sent Emails (Outbox)</span>
                        <Send size={18} className={styles.kpiIcon} />
                    </div>
                    <div className={styles.kpiValue}>{totalSentCount}</div>
                    <div className={styles.kpiSub}>Dispatched to Managers</div>
                </div>

                <div
                    className={`${styles.kpiCard} ${activeTab === 'replies' ? styles.kpiReady : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setActiveTab('replies')}
                >
                    <div className={styles.kpiTop}>
                        <span className={styles.kpiTitle}>Manager Replies</span>
                        <MessageSquare size={18} className={styles.kpiIcon} />
                    </div>
                    <div className={styles.kpiValue}>{totalRepliesCount}</div>
                    <div className={styles.kpiSub}>Active Manager Threads</div>
                </div>

                <div
                    className={`${styles.kpiCard} ${unreadRepliesCount > 0 ? styles.kpiWillNotProceed : ''}`}
                    style={{ cursor: 'pointer', borderColor: unreadRepliesCount > 0 ? '#ef4444' : undefined }}
                    onClick={() => setActiveTab('replies')}
                >
                    <div className={styles.kpiTop}>
                        <span className={styles.kpiTitle} style={{ color: unreadRepliesCount > 0 ? '#b91c1c' : undefined }}>
                            Unread Replies
                        </span>
                        <AlertCircle size={18} style={{ color: unreadRepliesCount > 0 ? '#ef4444' : '#64748b' }} />
                    </div>
                    <div className={styles.kpiValue} style={{ color: unreadRepliesCount > 0 ? '#b91c1c' : undefined }}>
                        {unreadRepliesCount}
                    </div>
                    <div className={styles.kpiSub}>
                        {unreadRepliesCount > 0 ? 'Requires VA Attention' : 'All replies read'}
                    </div>
                </div>

                <div
                    className={`${styles.kpiCard} ${activeTab === 'pending' ? styles.kpiCompleted : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setActiveTab('pending')}
                >
                    <div className={styles.kpiTop}>
                        <span className={styles.kpiTitle}>Pending Handoffs</span>
                        <Clock size={18} className={styles.kpiIcon} />
                    </div>
                    <div className={styles.kpiValue}>{pendingHandoffsCount}</div>
                    <div className={styles.kpiSub}>Quotes Ready to Send</div>
                </div>
            </div>

            {/* Toolbar & Tabs */}
            <div className={styles.toolbarCard}>
                <div className={styles.toolbarRow}>
                    {/* Tab Buttons */}
                    <div className={styles.tabSwitcher}>
                        <button
                            type="button"
                            className={`${styles.tabBtn} ${activeTab === 'sent' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('sent')}
                        >
                            <Send size={14} />
                            <span>Sent Box</span>
                            <span className={styles.tabBadge}>{totalSentCount}</span>
                        </button>
                        <button
                            type="button"
                            className={`${styles.tabBtn} ${activeTab === 'replies' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('replies')}
                        >
                            <MessageSquare size={14} />
                            <span>Replies &amp; Threads</span>
                            <span className={styles.tabBadge}>
                                {totalRepliesCount}
                                {unreadRepliesCount > 0 && ` (${unreadRepliesCount} new)`}
                            </span>
                        </button>
                        <button
                            type="button"
                            className={`${styles.tabBtn} ${activeTab === 'pending' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('pending')}
                        >
                            <Clock size={14} />
                            <span>Pending Handoffs</span>
                            <span className={styles.tabBadge}>{pendingHandoffsCount}</span>
                        </button>
                    </div>

                    {/* Search & Manager Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <div className={styles.searchWrapper}>
                            <Search size={15} className={styles.searchIcon} />
                            <input
                                type="text"
                                className={styles.searchInput}
                                placeholder="Search by Policy #, Insured, Address, VA, Manager..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {activeTab === 'sent' && (
                            <div className={styles.filterSelectWrapper}>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Manager:</span>
                                <select
                                    className={styles.filterSelect}
                                    value={selectedManagerFilter}
                                    onChange={e => setSelectedManagerFilter(e.target.value)}
                                >
                                    <option value="">All Managers</option>
                                    {TEAM_RECIPIENTS.map(mgr => (
                                        <option key={mgr.id} value={mgr.name.split(' ')[0]}>
                                            {mgr.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            {loading ? (
                <div className={styles.loadingState}>
                    <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary, #2243B6)' }} />
                    <div>Loading Email Hub data...</div>
                </div>
            ) : (
                <div className={styles.tableCard}>
                    {/* ═══════════ TAB 1: SENT BOX ═══════════ */}
                    {activeTab === 'sent' && (
                        <div className={styles.tableWrapper}>
                            {filteredSentItems.length === 0 ? (
                                <div className={styles.emptyStateContainer}>
                                    <Send size={40} className={styles.emptyIcon} />
                                    <div className={styles.emptyTitle}>No Sent Emails Found</div>
                                    <div className={styles.emptySubtitle}>
                                        {searchQuery || selectedManagerFilter
                                            ? 'No sent emails match your search or filter criteria.'
                                            : 'No quote handoff emails have been sent yet. Check "Pending Handoffs" to dispatch ready packages.'}
                                    </div>
                                    {pendingHandoffsCount > 0 && (
                                        <button
                                            type="button"
                                            className={styles.actionBtnPrimary}
                                            onClick={() => setActiveTab('pending')}
                                        >
                                            View {pendingHandoffsCount} Pending Handoffs
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.alignCenter} style={{ width: '100px' }}>Sent Date</th>
                                            <th className={styles.alignLeft} style={{ width: '150px' }}>Policy #</th>
                                            <th className={styles.alignLeft}>Named Insured &amp; Address</th>
                                            <th className={styles.alignLeft} style={{ width: '120px' }}>Sent By (VA)</th>
                                            <th className={styles.alignLeft} style={{ width: '180px' }}>Sent To (Managers)</th>
                                            <th className={styles.alignLeft} style={{ width: '160px' }}>Documents Package</th>
                                            <th className={styles.alignLeft} style={{ width: '140px' }}>Reply Status</th>
                                            <th className={styles.alignRight} style={{ width: '150px' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSentItems.map(item => {
                                            const timeMeta = formatDateTime(item.sent_at);
                                            return (
                                                <tr key={item.id}>
                                                    {/* Sent Date */}
                                                    <td className={styles.alignCenter}>
                                                        <div className={styles.dateCell}>
                                                            <span className={styles.dateMain}>{timeMeta.date}</span>
                                                            <span className={styles.dateSub}>{timeMeta.time}</span>
                                                            <span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>
                                                                {timeMeta.relative}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Policy # */}
                                                    <td className={styles.alignLeft}>
                                                        <div className={styles.pnCell}>
                                                            <Link
                                                                href={`/policies/${item.policy_id}`}
                                                                className={styles.pnLink}
                                                                title="View Policy Details"
                                                            >
                                                                {item.policy_number}
                                                            </Link>
                                                            <button
                                                                type="button"
                                                                className={styles.copyBtn}
                                                                title="Copy Policy Number"
                                                                onClick={e => handleCopyPn(item.policy_number, e)}
                                                            >
                                                                {copiedPn === item.policy_number ? (
                                                                    <Check size={12} style={{ color: '#16a34a' }} />
                                                                ) : (
                                                                    <Copy size={12} />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </td>

                                                    {/* Named Insured & Address */}
                                                    <td className={styles.alignLeft}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                                            <strong style={{ color: '#0f172a', fontSize: '0.78rem' }}>
                                                                {item.named_insured || 'Unknown Insured'}
                                                            </strong>
                                                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                                                                {item.property_address || '—'}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Sent By */}
                                                    <td className={styles.alignLeft}>
                                                        <span className={styles.senderTag}>
                                                            <User size={12} style={{ color: '#64748b' }} />
                                                            {item.sent_by || 'VA Staff'}
                                                        </span>
                                                    </td>

                                                    {/* Sent To */}
                                                    <td className={styles.alignLeft}>
                                                        <div className={styles.recipientBadgeList}>
                                                            {item.sent_to_names && item.sent_to_names.length > 0 ? (
                                                                item.sent_to_names.map((name, idx) => (
                                                                    <span key={idx} className={styles.managerBadge}>
                                                                        <span className={styles.managerAvatar}>
                                                                            {name.charAt(0).toUpperCase()}
                                                                        </span>
                                                                        {name}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>
                                                                    {item.sent_to?.[0] || 'Managers'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Documents Package */}
                                                    <td className={styles.alignLeft}>
                                                        <div className={styles.docPillList}>
                                                            {item.has_dec && (
                                                                <span className={`${styles.docPill} ${styles.docReady}`}>
                                                                    <FileText size={10} /> CFP Dec
                                                                </span>
                                                            )}
                                                            {item.has_rce && (
                                                                <span className={`${styles.docPill} ${styles.docReady}`}>
                                                                    <FileText size={10} /> {item.rce_carrier || 'RCE'}
                                                                </span>
                                                            )}
                                                            {item.has_dic && (
                                                                <span className={`${styles.docPill} ${styles.docQuote}`}>
                                                                    <Shield size={10} /> {item.dic_carrier || 'DIC'}
                                                                </span>
                                                            )}
                                                            {!item.has_dec && !item.has_rce && !item.has_dic && (
                                                                <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>—</span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Reply Status */}
                                                    <td className={styles.alignLeft}>
                                                        {item.is_unread_reply ? (
                                                            <span className={`${styles.replyStatusPill} ${styles.unreadReply}`}>
                                                                <span className={styles.unreadDot} /> New Reply
                                                            </span>
                                                        ) : item.has_reply ? (
                                                            <span className={`${styles.replyStatusPill} ${styles.hasReply}`}>
                                                                <MessageSquare size={11} /> Replied ({item.total_messages})
                                                            </span>
                                                        ) : (
                                                            <span className={`${styles.replyStatusPill} ${styles.awaitingReply}`}>
                                                                <Clock size={11} /> Awaiting Reply
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Actions */}
                                                    <td className={styles.alignRight}>
                                                        <div className={styles.actionBtnGroup} style={{ justifyContent: 'flex-end' }}>
                                                            <button
                                                                type="button"
                                                                className={styles.actionBtnSecondary}
                                                                title="View Message Thread"
                                                                onClick={() => handleOpenThread(item)}
                                                            >
                                                                <MessageSquare size={13} /> Thread
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={styles.actionBtnSecondary}
                                                                title="Re-send Email"
                                                                onClick={() => handleOpenSendMail(item)}
                                                            >
                                                                <Send size={13} /> Re-send
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {/* ═══════════ TAB 2: REPLIES & THREADS ═══════════ */}
                    {activeTab === 'replies' && (
                        <div className={styles.tableWrapper}>
                            {filteredReplyItems.length === 0 ? (
                                <div className={styles.emptyStateContainer}>
                                    <MessageSquare size={40} className={styles.emptyIcon} />
                                    <div className={styles.emptyTitle}>No Inbound Replies Yet</div>
                                    <div className={styles.emptySubtitle}>
                                        When a Manager replies to an email or a test reply is simulated, it will appear here instantly with full conversation history.
                                    </div>
                                </div>
                            ) : (
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.alignCenter} style={{ width: '100px' }}>Last Reply</th>
                                            <th className={styles.alignLeft} style={{ width: '150px' }}>Policy #</th>
                                            <th className={styles.alignLeft} style={{ width: '200px' }}>Named Insured</th>
                                            <th className={styles.alignLeft} style={{ width: '140px' }}>Manager Replied</th>
                                            <th className={styles.alignLeft}>Latest Message Snippet</th>
                                            <th className={styles.alignCenter} style={{ width: '100px' }}>Status</th>
                                            <th className={styles.alignRight} style={{ width: '160px' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredReplyItems.map(reply => {
                                            const timeMeta = formatDateTime(reply.last_reply_at);
                                            return (
                                                <tr key={reply.id}>
                                                    {/* Last Reply Time */}
                                                    <td className={styles.alignCenter}>
                                                        <div className={styles.dateCell}>
                                                            <span className={styles.dateMain}>{timeMeta.date}</span>
                                                            <span className={styles.dateSub}>{timeMeta.time}</span>
                                                            <span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>
                                                                {timeMeta.relative}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Policy # */}
                                                    <td className={styles.alignLeft}>
                                                        <div className={styles.pnCell}>
                                                            <Link
                                                                href={`/policies/${reply.policy_id}`}
                                                                className={styles.pnLink}
                                                            >
                                                                {reply.policy_number}
                                                            </Link>
                                                        </div>
                                                    </td>

                                                    {/* Named Insured */}
                                                    <td className={styles.alignLeft}>
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <strong style={{ color: '#0f172a', fontSize: '0.78rem' }}>
                                                                {reply.named_insured || 'Unknown Insured'}
                                                            </strong>
                                                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                                                                {reply.property_address || '—'}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Manager */}
                                                    <td className={styles.alignLeft}>
                                                        <span className={styles.managerBadge}>
                                                            <span className={styles.managerAvatar}>
                                                                {reply.last_reply_from.charAt(0).toUpperCase()}
                                                            </span>
                                                            {reply.last_reply_from}
                                                        </span>
                                                    </td>

                                                    {/* Message Snippet */}
                                                    <td className={styles.alignLeft}>
                                                        <div className={styles.replySnippetBox}>
                                                            &ldquo;{reply.last_reply_text}&rdquo;
                                                        </div>
                                                    </td>

                                                    {/* Read Status */}
                                                    <td className={styles.alignCenter}>
                                                        {reply.is_unread ? (
                                                            <span className={`${styles.replyStatusPill} ${styles.unreadReply}`}>
                                                                <span className={styles.unreadDot} /> Unread
                                                            </span>
                                                        ) : (
                                                            <span className={`${styles.replyStatusPill} ${styles.hasReply}`}>
                                                                <Check size={12} /> Read
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Actions */}
                                                    <td className={styles.alignRight}>
                                                        <div className={styles.actionBtnGroup} style={{ justifyContent: 'flex-end' }}>
                                                            <button
                                                                type="button"
                                                                className={styles.actionBtnPrimary}
                                                                onClick={() => handleOpenThread(reply)}
                                                            >
                                                                <MessageSquare size={13} /> Open Thread
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {/* ═══════════ TAB 3: PENDING HANDOFFS ═══════════ */}
                    {activeTab === 'pending' && (
                        <div className={styles.tableWrapper}>
                            {filteredPendingItems.length === 0 ? (
                                <div className={styles.emptyStateContainer}>
                                    <CheckCircle2 size={40} className={styles.emptyIcon} style={{ color: '#10b981' }} />
                                    <div className={styles.emptyTitle}>All Caught Up!</div>
                                    <div className={styles.emptySubtitle}>
                                        There are no pending CFP quote handoffs waiting to be sent to managers.
                                    </div>
                                    <Link href="/cfp-summary" className={styles.actionBtnPrimary}>
                                        Process New Policies in CFP Dashboard
                                    </Link>
                                </div>
                            ) : (
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.alignCenter} style={{ width: '100px' }}>Ready Since</th>
                                            <th className={styles.alignLeft} style={{ width: '150px' }}>Policy #</th>
                                            <th className={styles.alignLeft}>Named Insured &amp; Property Address</th>
                                            <th className={styles.alignCenter} style={{ width: '110px' }}>Expiration Date</th>
                                            <th className={styles.alignLeft} style={{ width: '170px' }}>Documents Ready</th>
                                            <th className={styles.alignLeft}>VA Notes</th>
                                            <th className={styles.alignRight} style={{ width: '140px' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredPendingItems.map(item => {
                                            const timeMeta = formatDateTime(item.ready_since);
                                            return (
                                                <tr key={item.policy_id}>
                                                    {/* Ready Since */}
                                                    <td className={styles.alignCenter}>
                                                        <div className={styles.dateCell}>
                                                            <span className={styles.dateMain}>{timeMeta.date}</span>
                                                            <span className={styles.dateSub}>{timeMeta.relative}</span>
                                                        </div>
                                                    </td>

                                                    {/* Policy # */}
                                                    <td className={styles.alignLeft}>
                                                        <div className={styles.pnCell}>
                                                            <Link
                                                                href={`/policies/${item.policy_id}`}
                                                                className={styles.pnLink}
                                                            >
                                                                {item.policy_number}
                                                            </Link>
                                                            <button
                                                                type="button"
                                                                className={styles.copyBtn}
                                                                onClick={e => handleCopyPn(item.policy_number, e)}
                                                            >
                                                                {copiedPn === item.policy_number ? (
                                                                    <Check size={12} style={{ color: '#16a34a' }} />
                                                                ) : (
                                                                    <Copy size={12} />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </td>

                                                    {/* Insured & Address */}
                                                    <td className={styles.alignLeft}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                                            <strong style={{ color: '#0f172a', fontSize: '0.78rem' }}>
                                                                {item.named_insured || 'Unknown Insured'}
                                                            </strong>
                                                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                                                                {item.property_address || '—'}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Expiration Date */}
                                                    <td className={styles.alignCenter}>
                                                        <span style={{ fontWeight: 600, fontSize: '0.75rem' }}>
                                                            {formatDateShort(item.expiration_date)}
                                                        </span>
                                                    </td>

                                                    {/* Documents Ready */}
                                                    <td className={styles.alignLeft}>
                                                        <div className={styles.docPillList}>
                                                            {item.has_dec && (
                                                                <span className={`${styles.docPill} ${styles.docReady}`}>
                                                                    <FileText size={10} /> Dec
                                                                </span>
                                                            )}
                                                            {item.has_rce && (
                                                                <span className={`${styles.docPill} ${styles.docReady}`}>
                                                                    <FileText size={10} /> {item.rce_carrier || 'RCE'}
                                                                </span>
                                                            )}
                                                            {item.has_dic && (
                                                                <span className={`${styles.docPill} ${styles.docQuote}`}>
                                                                    <Shield size={10} /> {item.dic_carrier || 'DIC'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Notes */}
                                                    <td className={styles.alignLeft}>
                                                        <span style={{ color: '#475569', fontSize: '0.75rem' }}>
                                                            {item.notes || 'Ready for manager review'}
                                                        </span>
                                                    </td>

                                                    {/* Action */}
                                                    <td className={styles.alignRight}>
                                                        <button
                                                            type="button"
                                                            className={styles.actionBtnPrimary}
                                                            onClick={() => handleOpenSendMail(item)}
                                                        >
                                                            <Send size={13} /> Send Mail
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Modals & Drawers */}
            {isSendMailOpen && selectedTermForSendMail && (
                <SendMailModal
                    term={selectedTermForSendMail}
                    isOpen={isSendMailOpen}
                    onClose={() => setIsSendMailOpen(false)}
                    onSentSuccess={handleSendMailSuccess}
                />
            )}

            {isThreadDrawerOpen && selectedItemForThread && (
                <EmailThreadDrawer
                    item={selectedItemForThread}
                    onClose={() => setIsThreadDrawerOpen(false)}
                    onStatusChange={handleStatusChange}
                />
            )}
        </div>
    );
}
