'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    fetchFlagsByPolicyId,
    fetchFlagsByClientId,
    fetchFlagEvents,
    fetchManualFlagDefinitions,
    resolveFlag,
    dismissFlag,
    unresolveFlag,
    createManualFlag,
    runFlagCheck,
    PolicyFlagRow,
    FlagEventRow,
    FlagDefinitionRow,
} from '@/lib/api';
import { Button } from '@/components/ui/Button/Button';
import {
    Flag,
    CheckCircle,
    RotateCcw,
    Plus,
    X,
    AlertTriangle,
    Info,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    XCircle,
    Clock,
    History,
    Shield,
    User,
    Zap,
    RefreshCw,
    Loader,
    Filter,
    Search,
} from 'lucide-react';
import styles from './PolicyFlags.module.scss';
import { logger } from '@/lib/logger';


interface PolicyFlagsProps {
    policyId: string;
    clientId?: string;
}

const PRIORITY_ICONS: Record<string, React.ReactNode> = {
    high: <AlertCircle size={14} />,
    medium: <AlertTriangle size={14} />,
    low: <Info size={14} />,
};

const PRIORITY_COLORS: Record<string, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#3b82f6',
};

const SOURCE_LABELS: Record<string, string> = {
    system: 'System',
    user: 'Manual',
    ai: 'AI',
    rule: 'Rule',
};

function formatDate(d?: string | null) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function FlagCard({
    flag,
    onResolve,
    onDismiss,
    onUnresolve,
    loading,
}: {
    flag: PolicyFlagRow;
    onResolve: (id: string) => void;
    onDismiss: (id: string) => void;
    onUnresolve: (id: string) => void;
    loading: string | null;
}) {
    const [showHistory, setShowHistory] = useState(false);
    const [events, setEvents] = useState<FlagEventRow[]>([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [dismissMode, setDismissMode] = useState(false);
    const [dismissReason, setDismissReason] = useState('');

    // Old schema: no status column — use resolved_at to infer
    const effectiveStatus = flag.status || (flag.resolved_at ? 'resolved' : 'open');
    const isOpen = effectiveStatus === 'open';
    const isResolved = effectiveStatus === 'resolved';
    const isDismissed = effectiveStatus === 'dismissed';
    const isLoading = loading === flag.id;
    const sevColor = PRIORITY_COLORS[flag.severity] || '#64748b';

    const loadHistory = async () => {
        if (events.length > 0) {
            setShowHistory(!showHistory);
            return;
        }
        setEventsLoading(true);
        const data = await fetchFlagEvents(flag.id);
        setEvents(data);
        setEventsLoading(false);
        setShowHistory(true);
    };

    const handleDismissSubmit = () => {
        onDismiss(flag.id);
        setDismissMode(false);
        setDismissReason('');
    };

    return (
        <div className={`${styles.flagCard} ${!isOpen ? styles.flagInactive : ''}`}>
            <div className={styles.flagCardLeft} style={{ borderLeftColor: sevColor }} />

            <div className={styles.flagCardBody}>
                {/* Top row: severity + title + date */}
                <div className={styles.flagCardTopRow}>
                    <div className={styles.flagCardTopLeft}>
                        <span className={styles.severityBadge} style={{ backgroundColor: `${sevColor}18`, color: sevColor }}>
                            {PRIORITY_ICONS[flag.severity]}
                            <span>{flag.severity}</span>
                        </span>
                        <span className={styles.flagTitle}>{flag.title}</span>
                        {isResolved && (
                            <span className={styles.statusResolved}>
                                <CheckCircle size={11} /> Resolved
                            </span>
                        )}
                        {isDismissed && (
                            <span className={styles.statusDismissed}>
                                <XCircle size={11} /> Dismissed
                            </span>
                        )}
                        {(flag.times_seen || 0) > 1 && (
                            <span className={styles.timesSeenBadge}>×{flag.times_seen}</span>
                        )}
                    </div>
                    <span className={styles.flagDateRight}>
                        <Clock size={11} /> {formatDate(flag.first_seen_at || flag.created_at)}
                    </span>
                </div>

                {/* Message + action buttons row */}
                <div className={styles.flagBodyRow}>
                    <div className={styles.flagBodyLeft}>
                        {flag.message && <span className={styles.flagMessage}>{flag.message}</span>}
                        <span className={styles.codeBadge}>{flag.code}</span>
                        {flag.resolved_at && <span className={styles.flagMetaInline}>Resolved {formatDate(flag.resolved_at)}</span>}
                        {flag.dismissed_at && <span className={styles.flagMetaInline}>Dismissed {formatDate(flag.dismissed_at)}</span>}
                        {flag.dismiss_reason && <span className={styles.dismissReason}>({flag.dismiss_reason})</span>}
                    </div>
                    <div className={styles.flagActionsInline}>
                        {isOpen && !dismissMode && (
                            <>
                                <Button variant="ghost" size="sm" onClick={() => onResolve(flag.id)} disabled={isLoading} className={styles.actionBtn}>
                                    <CheckCircle size={12} /> Resolve
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDismissMode(true)} disabled={isLoading} className={styles.actionBtn}>
                                    <XCircle size={12} /> Dismiss
                                </Button>
                            </>
                        )}
                        {isResolved && (
                            <Button variant="ghost" size="sm" onClick={() => onUnresolve(flag.id)} disabled={isLoading} className={styles.actionBtn}>
                                <RotateCcw size={12} /> Reopen
                            </Button>
                        )}
                        {flag.action_path && (
                            <a href={flag.action_path} className={styles.actionLink}>
                                <ExternalLink size={12} /> Go to issue
                            </a>
                        )}
                        <Button variant="ghost" size="sm" onClick={loadHistory} className={styles.historyBtn}>
                            <History size={12} /> {showHistory ? 'Hide' : 'History'}
                        </Button>
                    </div>
                </div>

                {/* Dismiss input mode */}
                {dismissMode && (
                    <div className={styles.dismissForm}>
                        <input
                            type="text"
                            placeholder="Reason for dismissing (optional)..."
                            value={dismissReason}
                            onChange={(e) => setDismissReason(e.target.value)}
                            className={styles.dismissInput}
                            autoFocus
                        />
                        <div className={styles.dismissActions}>
                            <Button variant="primary" size="sm" onClick={handleDismissSubmit} disabled={isLoading}>
                                Dismiss
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDismissMode(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {/* History panel */}
                {showHistory && (
                    <div className={styles.historyPanel}>
                        {eventsLoading ? (
                            <div className={styles.historyLoading}>Loading history...</div>
                        ) : events.length === 0 ? (
                            <div className={styles.historyEmpty}>No events recorded.</div>
                        ) : (
                            events.map(evt => (
                                <div key={evt.id} className={styles.historyRow}>
                                    <span className={styles.eventType}>{evt.event_type}</span>
                                    {evt.note && <span className={styles.eventNote}>{evt.note}</span>}
                                    <span className={styles.eventDate}>{formatDate(evt.created_at)}</span>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function FlagSection({
    title,
    icon,
    flags,
    onResolve,
    onDismiss,
    onUnresolve,
    loading,
}: {
    title: string;
    icon: React.ReactNode;
    flags: PolicyFlagRow[];
    onResolve: (id: string) => void;
    onDismiss: (id: string) => void;
    onUnresolve: (id: string) => void;
    loading: string | null;
}) {
    const [showInactive, setShowInactive] = useState(false);
    // Treat null/undefined status as 'open' (old schema compatibility)
    const isOpen = (f: PolicyFlagRow) => (!f.status && !f.resolved_at) || f.status === 'open';
    const active = flags.filter(isOpen);
    const inactive = flags.filter(f => !isOpen(f));

    if (flags.length === 0) return null;

    return (
        <div className={styles.section}>
            <div className={styles.sectionHeader}>
                {icon}
                <h3>{title}</h3>
                <span className={styles.sectionCount}>
                    {active.length} open
                    {inactive.length > 0 && ` · ${inactive.length} closed`}
                </span>
            </div>

            {active.length === 0 && (
                <div className={styles.sectionEmpty}>
                    <CheckCircle size={16} /> No open flags
                </div>
            )}

            {active.map(f => (
                <FlagCard
                    key={f.id}
                    flag={f}
                    onResolve={onResolve}
                    onDismiss={onDismiss}
                    onUnresolve={onUnresolve}
                    loading={loading}
                />
            ))}

            {inactive.length > 0 && (
                <>
                    <button
                        className={styles.inactiveToggle}
                        onClick={() => setShowInactive(!showInactive)}
                    >
                        {showInactive ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {inactive.length} resolved/dismissed
                    </button>
                    {showInactive && inactive.map(f => (
                        <FlagCard
                            key={f.id}
                            flag={f}
                            onResolve={onResolve}
                            onDismiss={onDismiss}
                            onUnresolve={onUnresolve}
                            loading={loading}
                        />
                    ))}
                </>
            )}
        </div>
    );
}

export function PolicyFlags({ policyId, clientId }: PolicyFlagsProps) {
    const [policyFlags, setPolicyFlags] = useState<PolicyFlagRow[]>([]);
    const [clientFlags, setClientFlags] = useState<PolicyFlagRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [manualDefs, setManualDefs] = useState<FlagDefinitionRow[]>([]);
    const [addForm, setAddForm] = useState({
        code: 'MANUAL_FLAG',
        title: '',
        message: '',
        scope: 'policy' as 'policy' | 'client',
    });
    const [flagCheckRunning, setFlagCheckRunning] = useState(false);
    const [flagCheckResult, setFlagCheckResult] = useState<string | null>(null);

    const loadFlags = useCallback(async () => {
        setLoading(true);
        try {
            const pf = await fetchFlagsByPolicyId(policyId);
            setPolicyFlags(pf);

            if (clientId) {
                const cf = await fetchFlagsByClientId(clientId);
                // Filter out flags that also have this policy_id (already shown in policy section)
                setClientFlags(cf.filter(f => !f.policy_id || f.policy_id !== policyId));
            }
        } catch (error) {
            logger.error('PolicyFlags', 'Error loading flags:', { error: error instanceof Error ? error.message : String(error) })
        } finally {
            setLoading(false);
        }
    }, [policyId, clientId]);

    useEffect(() => {
        loadFlags();
    }, [loadFlags]);

    // Separate policy-level vs term-level flags
    const policyOnlyFlags = policyFlags.filter(f => !f.policy_term_id);
    const termFlags = policyFlags.filter(f => !!f.policy_term_id);

    // ── Filter state ──
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
    const [showCodeDropdown, setShowCodeDropdown] = useState(false);
    const [codeSearch, setCodeSearch] = useState('');

    // Collect all unique codes from all flags
    const allFlags = [...policyFlags, ...clientFlags];
    const uniqueCodes = Array.from(new Set(allFlags.map(f => f.code).filter(Boolean))).sort();

    // Apply filters
    const applyFilters = (flags: PolicyFlagRow[]): PolicyFlagRow[] => {
        let result = flags;
        if (priorityFilter !== 'all') {
            result = result.filter(f => f.severity === priorityFilter);
        }
        if (selectedCodes.size > 0) {
            result = result.filter(f => selectedCodes.has(f.code));
        }
        return result;
    };

    const filteredPolicyOnlyFlags = applyFilters(policyOnlyFlags);
    const filteredTermFlags = applyFilters(termFlags);
    const filteredClientFlags = applyFilters(clientFlags);
    const hasActiveFilters = priorityFilter !== 'all' || selectedCodes.size > 0;
    const filteredCodes = codeSearch
        ? uniqueCodes.filter(c => c.toLowerCase().includes(codeSearch.toLowerCase()))
        : uniqueCodes;

    const toggleCode = (code: string) => {
        setSelectedCodes(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const clearFilters = () => {
        setPriorityFilter('all');
        setSelectedCodes(new Set());
    };

    // Total open counts — treat null/missing status as 'open' (old schema)
    const isOpen = (f: PolicyFlagRow) => (!f.status && !f.resolved_at) || f.status === 'open';
    const totalOpen = allFlags.filter(isOpen).length;
    const criticalCount = allFlags.filter(f => isOpen(f) && f.severity === 'high').length;

    const handleResolve = async (flagId: string) => {
        setActionLoading(flagId);
        const ok = await resolveFlag(flagId);
        if (ok) await loadFlags();
        setActionLoading(null);
    };

    const handleDismiss = async (flagId: string) => {
        setActionLoading(flagId);
        const ok = await dismissFlag(flagId);
        if (ok) await loadFlags();
        setActionLoading(null);
    };

    const handleUnresolve = async (flagId: string) => {
        setActionLoading(flagId);
        const ok = await unresolveFlag(flagId);
        if (ok) await loadFlags();
        setActionLoading(null);
    };

    const openAddForm = async () => {
        const defs = await fetchManualFlagDefinitions();
        setManualDefs(defs);
        setShowAddForm(true);
    };

    const handleAddFlag = async () => {
        if (!addForm.title.trim()) return;
        setActionLoading('add');

        const def = manualDefs.find(d => d.code === addForm.code);
        const result = await createManualFlag({
            code: addForm.code,
            severity: def?.default_severity || 'low',
            title: addForm.title,
            message: addForm.message || undefined,
            policy_id: addForm.scope === 'policy' ? policyId : null,
            client_id: addForm.scope === 'client' && clientId ? clientId : null,
            category: 'manual',
        });

        if (result) {
            setShowAddForm(false);
            setAddForm({ code: 'MANUAL_FLAG', title: '', message: '', scope: 'policy' });
            await loadFlags();
        }
        setActionLoading(null);
    };

    const handleFlagCheck = async () => {
        setFlagCheckRunning(true);
        setFlagCheckResult(null);
        try {
            const result = await runFlagCheck(policyId);
            // The API now returns a detailed message with fired/created/errors info
            setFlagCheckResult(result.message || (result.success ? 'Flag check complete' : 'Flag check failed'));
            await loadFlags();
        } catch {
            setFlagCheckResult('Error running flag check');
        } finally {
            setFlagCheckRunning(false);
            setTimeout(() => setFlagCheckResult(null), 8000);
        }
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingState}>Loading flags...</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Summary banner */}
            <div className={styles.summaryBanner}>
                <div className={styles.summaryLeft}>
                    <Flag size={20} />
                    <h2>Flags</h2>
                    <span className={styles.totalBadge}>
                        {totalOpen} open
                    </span>
                    {criticalCount > 0 && (
                        <span className={styles.criticalBadge}>
                            <AlertCircle size={13} /> {criticalCount} high priority
                        </span>
                    )}
                </div>
                <div className={styles.bannerActions}>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleFlagCheck}
                        disabled={flagCheckRunning}
                        className={styles.flagCheckBtn}
                    >
                        {flagCheckRunning ? <Loader size={14} className={styles.spinning} /> : <RefreshCw size={14} />}
                        {flagCheckRunning ? 'Checking...' : 'Run Flag Check'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={openAddForm} className={styles.addButton}>
                        <Plus size={14} /> Add Manual Flag
                    </Button>
                </div>
            </div>

            {/* Flag check result toast */}
            {flagCheckResult && (
                <div className={styles.flagCheckToast}>
                    <CheckCircle size={14} />
                    {flagCheckResult}
                </div>
            )}

            {/* ── Filter Bar ── */}
            {allFlags.length > 0 && (
                <div className={styles.filterBar}>
                    {/* Severity chips */}
                    <div className={styles.filterGroup}>
                        {['all', 'high', 'medium', 'low'].map(sev => (
                            <button
                                key={sev}
                                className={`${styles.filterChip} ${priorityFilter === sev ? styles.filterChipActive : ''} ${sev !== 'all' ? styles[`filterChip_${sev}`] || '' : ''}`}
                                onClick={() => setPriorityFilter(sev)}
                            >
                                {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Code multi-select */}
                    <div className={styles.filterCodeWrap}>
                        <button
                            className={`${styles.filterCodeBtn} ${selectedCodes.size > 0 ? styles.filterCodeBtnActive : ''}`}
                            onClick={() => setShowCodeDropdown(prev => !prev)}
                        >
                            <Filter size={13} />
                            Flag type
                            {selectedCodes.size > 0 && (
                                <span className={styles.filterCodeCount}>{selectedCodes.size}</span>
                            )}
                            <ChevronDown size={12} />
                        </button>
                        {showCodeDropdown && (
                            <div className={styles.filterCodeDropdown}>
                                <div className={styles.filterCodeSearch}>
                                    <Search size={12} />
                                    <input
                                        type="text"
                                        placeholder="Search flags..."
                                        value={codeSearch}
                                        onChange={e => setCodeSearch(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <div className={styles.filterCodeList}>
                                    {filteredCodes.map(code => (
                                        <label key={code} className={styles.filterCodeItem}>
                                            <input
                                                type="checkbox"
                                                checked={selectedCodes.has(code)}
                                                onChange={() => toggleCode(code)}
                                            />
                                            <span>{code.replace(/_/g, ' ')}</span>
                                        </label>
                                    ))}
                                    {filteredCodes.length === 0 && (
                                        <div className={styles.filterCodeEmpty}>No matching flags</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Clear all filters */}
                    {hasActiveFilters && (
                        <button className={styles.filterClearBtn} onClick={clearFilters}>
                            <X size={12} /> Clear filters
                        </button>
                    )}
                </div>
            )}

            {/* Manual flag form */}
            {showAddForm && (
                <div className={styles.addFormCard}>
                    <div className={styles.addFormHeader}>
                        <span>Add Manual Flag</span>
                        <button className={styles.closeBtn} onClick={() => setShowAddForm(false)}>
                            <X size={16} />
                        </button>
                    </div>
                    <div className={styles.formGrid}>
                        <div className={styles.formField}>
                            <label>Scope</label>
                            <select
                                value={addForm.scope}
                                onChange={e => setAddForm(f => ({ ...f, scope: e.target.value as 'policy' | 'client' }))}
                                className={styles.select}
                            >
                                <option value="policy">Policy</option>
                                {clientId && <option value="client">Client</option>}
                            </select>
                        </div>
                        <div className={styles.formField}>
                            <label>Type</label>
                            <select
                                value={addForm.code}
                                onChange={e => setAddForm(f => ({ ...f, code: e.target.value }))}
                                className={styles.select}
                            >
                                {manualDefs.length === 0 ? (
                                    <option value="MANUAL_FLAG">Manual Flag</option>
                                ) : (
                                    manualDefs
                                        .filter(d => d.entity_scope === addForm.scope || d.entity_scope === 'any')
                                        .map(d => (
                                            <option key={d.code} value={d.code}>{d.label}</option>
                                        ))
                                )}
                            </select>
                        </div>
                        <div className={`${styles.formField} ${styles.fullWidth}`}>
                            <label>Title *</label>
                            <input
                                type="text"
                                placeholder="Short descriptive title"
                                value={addForm.title}
                                onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                                className={styles.input}
                            />
                        </div>
                        <div className={`${styles.formField} ${styles.fullWidth}`}>
                            <label>Message</label>
                            <textarea
                                placeholder="Optional details..."
                                value={addForm.message}
                                onChange={e => setAddForm(f => ({ ...f, message: e.target.value }))}
                                className={styles.textarea}
                                rows={2}
                            />
                        </div>
                    </div>
                    <div className={styles.formActions}>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleAddFlag}
                            disabled={!addForm.title.trim() || actionLoading === 'add'}
                        >
                            Create Flag
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {/* No flags at all */}
            {totalOpen === 0 && policyFlags.length === 0 && clientFlags.length === 0 && !showAddForm && (
                <div className={styles.emptyState}>
                    <CheckCircle size={24} />
                    <p>No flags on this policy or client.</p>
                </div>
            )}

            {/* Sections */}
            <FlagSection
                title="Policy Flags"
                icon={<Shield size={16} />}
                flags={filteredPolicyOnlyFlags}
                onResolve={handleResolve}
                onDismiss={handleDismiss}
                onUnresolve={handleUnresolve}
                loading={actionLoading}
            />

            <FlagSection
                title="Current Term Flags"
                icon={<Flag size={16} />}
                flags={filteredTermFlags}
                onResolve={handleResolve}
                onDismiss={handleDismiss}
                onUnresolve={handleUnresolve}
                loading={actionLoading}
            />

            <FlagSection
                title="Client Flags"
                icon={<User size={16} />}
                flags={filteredClientFlags}
                onResolve={handleResolve}
                onDismiss={handleDismiss}
                onUnresolve={handleUnresolve}
                loading={actionLoading}
            />
        </div>
    );
}
