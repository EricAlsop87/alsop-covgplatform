"use client";

import React, { useState, useRef, useCallback } from "react";
import { Copy, AlertCircle, CheckCircle2, X, Merge, RefreshCw, Users, ShieldAlert, Search, UserPlus, Loader2, User } from "lucide-react";
import ClientMergeModal from "./ClientMergeModal";
import { supabase } from "@/lib/supabaseClient";
import styles from "./DuplicateReview.module.css";
import { logger } from '@/lib/logger';


export default function DuplicateReview() {
    const [selectedClient, setSelectedClient] = useState<string | null>(null);
    const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null);
    const [isMerging, setIsMerging] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    // Modal State
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [activeMergeGroup, setActiveMergeGroup] = useState<any | null>(null);

    // Live State
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [duplicateClients, setDuplicateClients] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [duplicatePolicies, setDuplicatePolicies] = useState<any[]>([]);

    // ── Manual Merge State ──
    const [manualMergeOpen, setManualMergeOpen] = useState(false);
    const [manualSearchQuery, setManualSearchQuery] = useState("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [manualSearchResults, setManualSearchResults] = useState<any[]>([]);
    const [manualSearchLoading, setManualSearchLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [manualSelectedClients, setManualSelectedClients] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [manualMergeGroup, setManualMergeGroup] = useState<any | null>(null);
    const [manualMergeLoadingModal, setManualMergeLoadingModal] = useState(false);
    const manualSearchRef = useRef<HTMLInputElement>(null);
    const manualDebounceRef = useRef<NodeJS.Timeout | null>(null);

    React.useEffect(() => {
        fetchDuplicates();
    }, []);

    const fetchDuplicates = async (showLoadingSpinner = true) => {
        if (showLoadingSpinner) setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/duplicates/find', {
                headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
            });
            const data = await res.json();
            if (data.success) {
                setDuplicateClients(data.clients || []);
                setDuplicatePolicies(data.policies || []);
            }
        } catch (err) {
            logger.error('DuplicateReview', "Failed to load duplicates:", { error: err instanceof Error ? err.message : String(err) })
        } finally {
            if (showLoadingSpinner) setLoading(false);
        }
    };

    const handleMergeClient = async (survivorId: string, mergedIds: string[], consolidatedFields: Record<string, any> = {}, keepDocs: boolean = true) => {
        setIsMerging(true);
        try {
            for (const mergedId of mergedIds) {
                const { data: { session } } = await supabase.auth.getSession();
                const res = await fetch('/api/merge/clients', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                    },
                    body: JSON.stringify({
                        survivor_id: survivorId,
                        merged_id: mergedId,
                        consolidated_fields: consolidatedFields,
                        keep_documents: keepDocs
                    })
                });
                if (!res.ok) throw new Error("Merge failed");
            }

            // Immediately purge any cluster involving survivorId or any mergedId
            const allInvolvedIds = new Set([survivorId, ...mergedIds]);
            setDuplicateClients(prev => prev.filter(g => {
                const groupIds = [
                    g.survivor_id,
                    ...(g.merged_ids || []),
                    g.details?.survivor?.id,
                    ...(g.details?.duplicates?.map((d: any) => d.id) || [])
                ].filter(Boolean);
                return !groupIds.some((id: string) => allInvolvedIds.has(id));
            }));

            setSelectedClient(null);
            setActiveMergeGroup(null);
            // Also clear manual merge state if applicable
            setManualSelectedClients([]);
            setManualMergeGroup(null);
            setManualMergeOpen(false);

            // Re-fetch fresh duplicate list from backend to keep UI 100% in sync
            await fetchDuplicates(false);
        } catch (err) {
            logger.error('DuplicateReview', String(err))
            alert("Failed to merge client. Please see console.");
        } finally {
            setIsMerging(false);
        }
    };

    const handleMergePolicy = async (groupId: string, survivorId: string, mergedIds: string[]) => {
        setIsMerging(true);
        try {
            for (const mergedId of mergedIds) {
                const { data: { session } } = await supabase.auth.getSession();
                const res = await fetch('/api/merge/policies', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                    },
                    body: JSON.stringify({ survivor_id: survivorId, merged_id: mergedId })
                });
                if (!res.ok) throw new Error("Merge failed");
            }

            const allInvolvedPolicyIds = new Set([survivorId, ...mergedIds]);
            setDuplicatePolicies(prev => prev.filter(p => {
                const policyIds = [
                    p.survivor_id,
                    ...(p.merged_ids || []),
                    p.details?.survivor?.id,
                    ...(p.details?.duplicates?.map((d: any) => d.id) || [])
                ].filter(Boolean);
                return !policyIds.some((id: string) => allInvolvedPolicyIds.has(id));
            }));

            setSelectedPolicy(null);

            // Re-fetch fresh duplicate list from backend
            await fetchDuplicates(false);
        } catch (err) {
            logger.error('DuplicateReview', String(err))
            alert("Failed to merge policy. Please check console.");
        } finally {
            setIsMerging(false);
        }
    };

    // ── Manual Merge: search handler ──
    const handleManualSearch = useCallback((query: string) => {
        setManualSearchQuery(query);
        if (manualDebounceRef.current) clearTimeout(manualDebounceRef.current);

        if (query.trim().length < 2) {
            setManualSearchResults([]);
            return;
        }

        manualDebounceRef.current = setTimeout(async () => {
            setManualSearchLoading(true);
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
                const data = await res.json();
                // Filter out already-selected clients
                const selectedIds = new Set(manualSelectedClients.map((c: any) => c.id));
                const filtered = (data.clients || []).filter((c: any) => !selectedIds.has(c.id));
                setManualSearchResults(filtered);
            } catch (err) {
                logger.error('DuplicateReview', 'Manual merge search error:', { error: err instanceof Error ? err.message : String(err) })
            } finally {
                setManualSearchLoading(false);
            }
        }, 300);
    }, [manualSelectedClients]);

    // ── Manual Merge: add client to selection ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addManualClient = useCallback((client: any) => {
        setManualSelectedClients(prev => {
            if (prev.find((c: any) => c.id === client.id)) return prev;
            return [...prev, client];
        });
        setManualSearchQuery('');
        setManualSearchResults([]);
        setTimeout(() => manualSearchRef.current?.focus(), 50);
    }, []);

    // ── Manual Merge: launch merge modal ──
    const launchManualMerge = useCallback(async () => {
        if (manualSelectedClients.length < 2) return;
        setManualMergeLoadingModal(true);
        try {
            // Dynamically import supabase to fetch full client data
            const { supabase } = await import('@/lib/supabaseClient');
            const selectFields = `id, named_insured, email, phone, mailing_address_raw, mailing_address_norm, created_at,
                policies(id, policy_number, carrier_name, property_address_raw, status, created_at,
                    policy_terms(id, effective_date, expiration_date, annual_premium, is_current),
                    platform_documents(id, doc_type, file_name, created_at)),
                dec_pages(id, policy_number, created_at, submission_id, dec_page_submissions(file_name))`;

            const results = await Promise.all(
                manualSelectedClients.map((c: any) =>
                    supabase.from('clients').select(selectFields).eq('id', c.id).single()
                )
            );

            const fullClients = results
                .filter(r => !r.error && r.data)
                .map(r => r.data);

            if (fullClients.length < 2) {
                alert('Could not load full data for all selected clients.');
                return;
            }

            // Sort by created_at — oldest is survivor
            fullClients.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            setManualMergeGroup({
                survivor: fullClients[0],
                candidates: fullClients.slice(1),
            });
        } catch (err) {
            logger.error('DuplicateReview', 'Failed to load clients for manual merge:', { error: err instanceof Error ? err.message : String(err) })
        } finally {
            setManualMergeLoadingModal(false);
        }
    }, [manualSelectedClients]);

    if (loading) {
        return (
            <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', gap: '0.75rem' }}>
                <RefreshCw className={styles.spinAnimation} size={18} />
                <span>Running duplicate algorithms...</span>
            </div>
        );
    }

    const filteredClients = duplicateClients.filter(group => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const survivorName = String(group.details?.survivor?.named_insured || '').toLowerCase();
        if (survivorName.includes(q)) return true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return group.details?.duplicates?.some((d: any) => String(d.named_insured || '').toLowerCase().includes(q));
    });

    const filteredPolicies = duplicatePolicies.filter(group => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const survivorNum = String(group.details?.survivor?.policy_number || '').toLowerCase();
        if (survivorNum.includes(q)) return true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return group.details?.duplicates?.some((d: any) => String(d.policy_number || '').toLowerCase().includes(q));
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                    type="text"
                    placeholder="Search duplicates by name or policy number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        width: '100%', padding: '0.625rem 0.75rem 0.625rem 2.25rem',
                        background: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)',
                        borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-high)',
                        outline: 'none'
                    }}
                />
            </div>
            
            {/* ── Manual Client Merge Panel ── */}
            <div style={{
                padding: '1rem 1.25rem',
                background: 'var(--bg-surface-raised)',
                border: `1px solid ${manualMergeOpen ? 'rgba(129, 140, 248, 0.3)' : 'var(--border-default)'}`,
                borderRadius: '10px',
                transition: 'all 0.2s',
            }}>
                <div
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                    onClick={() => {
                        setManualMergeOpen(!manualMergeOpen);
                        if (!manualMergeOpen) setTimeout(() => manualSearchRef.current?.focus(), 100);
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <UserPlus size={16} style={{ color: 'var(--accent-primary)' }} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-high)' }}>Manual Client Merge</span>
                        <span style={{
                            fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)',
                            padding: '0.1rem 0.5rem', background: 'var(--bg-surface)', borderRadius: '999px',
                            border: '1px solid var(--border-default)',
                        }}>
                            Search &amp; select any clients
                        </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 500 }}>
                        {manualMergeOpen ? 'Close' : 'Open'}
                    </span>
                </div>

                {manualMergeOpen && (
                    <div style={{ marginTop: '0.75rem' }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                            Search for clients that the automated system didn&apos;t catch. Select 2 or more clients and merge them manually.
                        </p>

                        {/* Selected Clients Chips */}
                        {manualSelectedClients.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
                                {manualSelectedClients.map((c: any) => (
                                    <div key={c.id} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                        padding: '0.25rem 0.6rem', background: 'rgba(129, 140, 248, 0.1)',
                                        border: '1px solid rgba(129, 140, 248, 0.25)', borderRadius: '999px',
                                        fontSize: '0.78rem', fontWeight: 500, color: 'var(--accent-primary)',
                                    }}>
                                        <User size={11} />
                                        {c.name}
                                        <button
                                            onClick={() => setManualSelectedClients(prev => prev.filter((p: any) => p.id !== c.id))}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 0.15rem',
                                                color: 'rgba(129, 140, 248, 0.6)', display: 'flex', alignItems: 'center',
                                            }}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Search Input */}
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                ref={manualSearchRef}
                                type="text"
                                placeholder="Search by name, email, or phone to add clients..."
                                value={manualSearchQuery}
                                onChange={(e) => handleManualSearch(e.target.value)}
                                style={{
                                    width: '100%', padding: '0.55rem 0.75rem 0.55rem 2rem',
                                    background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                                    borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-high)', outline: 'none',
                                }}
                            />
                            {manualSearchLoading && (
                                <Loader2 size={14} style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
                            )}
                        </div>

                        {/* Search Results */}
                        {manualSearchResults.length > 0 && (
                            <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {manualSearchResults.map((result: any) => (
                                    <button
                                        key={result.id}
                                        onClick={() => addManualClient(result)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.65rem',
                                            padding: '0.5rem 0.65rem', background: 'var(--bg-surface)',
                                            border: '1px solid var(--border-default)', borderRadius: '6px',
                                            cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.4)'; e.currentTarget.style.background = 'rgba(129, 140, 248, 0.04)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-surface)'; }}
                                    >
                                        <div style={{
                                            width: 28, height: 28, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                        }}>
                                            <User size={12} style={{ color: 'var(--text-inverse)' }} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-high)' }}>{result.name}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
                                                {result.email && <span>{result.email}</span>}
                                                {result.phone && <span>{result.phone}</span>}
                                            </div>
                                        </div>
                                        <UserPlus size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                                    </button>
                                ))}
                            </div>
                        )}

                        {manualSearchQuery.length >= 2 && !manualSearchLoading && manualSearchResults.length === 0 && (
                            <div style={{ marginTop: '0.4rem', padding: '0.4rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                No clients found matching &quot;{manualSearchQuery}&quot;
                            </div>
                        )}

                        {/* Merge Button */}
                        {manualSelectedClients.length >= 2 && (
                            <button
                                onClick={launchManualMerge}
                                disabled={manualMergeLoadingModal}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    width: '100%', marginTop: '0.75rem', padding: '0.65rem',
                                    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                    color: 'var(--text-inverse)', border: 'none', borderRadius: '8px',
                                    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                    opacity: manualMergeLoadingModal ? 0.7 : 1, transition: 'opacity 0.15s',
                                }}
                            >
                                {manualMergeLoadingModal ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Merge size={16} />}
                                Launch Merge for {manualSelectedClients.length} Clients
                            </button>
                        )}
                    </div>
                )}
            </div>
            
            <div className={styles.workspace}>
            {/* Clients Column */}
            <div className={styles.column}>
                <div className={styles.header}>
                    <h3 className={styles.headerTitle}>
                        <Users size={18} style={{ color: "var(--status-success)" }} />
                        Identified Client Duplicates
                    </h3>
                    {filteredClients.length > 0 && (
                        <span className={styles.badge}>{filteredClients.length} Actionable</span>
                    )}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.5, margin: '-0.75rem 0 0' }}>
                    Multiple client records that refer to the same person. Merging consolidates their contact data and re-parents all policies &amp; documents under a single survivor record.
                </p>

                {filteredClients.length === 0 ? (
                    <div className={styles.emptyState}>
                        <CheckCircle2 size={32} className="icon" />
                        <h4 style={{ color: "var(--text-high)", fontWeight: 600, marginBottom: "0.25rem" }}>All Clear</h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No duplicate clients found matching the search criteria.</p>
                    </div>
                ) : (
                    filteredClients.map((group, groupIdx) => (
                        <div
                            key={group.survivor_id}
                            className={`${styles.card} ${selectedClient === group.survivor_id ? styles.cardActiveClient : ''}`}
                            onClick={() => setSelectedClient(group.survivor_id === selectedClient ? null : group.survivor_id)}
                        >
                            <div className={styles.metaBar}>
                                <div className={styles.confidenceScore}>
                                    <AlertCircle size={14} style={{ color: "var(--status-warning)" }} />
                                    <span>Match Confidence: </span>
                                    <span className={styles.confidenceHigh}>{group.confidence}%</span>
                                </div>
                                <button
                                    className={styles.dismissButton}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDuplicateClients(prev => prev.filter(g => g.survivor_id !== group.survivor_id));
                                    }}
                                >
                                    Dismiss
                                </button>
                            </div>

                            <div className={styles.entityList}>
                                {/* Survivor */}
                                <div className={styles.entityItem}>
                                    <div className={`${styles.iconMarker} ${styles.iconSurvivorClient}`}>S</div>
                                    <div className={styles.entityDetails}>
                                        <div className={styles.entityTitle}>{group.details.survivor.named_insured}</div>
                                        <div className={styles.entitySubtext}>
                                            <span style={{ color: "var(--status-success)", fontWeight: 600 }}>Survivor Record</span>
                                            <span>Age: {new Date(group.details.survivor.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Duplicates */}
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {group.details.duplicates.map((rec: any, i: number) => (
                                    <div key={rec.id} className={styles.entityItem}>
                                        <div className={`${styles.iconMarker} ${styles.iconTarget}`}>{i + 1}</div>
                                        <div className={styles.entityDetails}>
                                            <div className={`${styles.entityTitle} ${styles.targetText}`}>{rec.named_insured}</div>
                                            <div className={styles.entitySubtext}>
                                                <span>Merge Candidate</span>
                                                <span>Age: {new Date(rec.created_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {selectedClient === group.survivor_id && (
                                <div className={styles.actionFooter}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMergeGroup({
                                                survivor_id: group.survivor_id,
                                                merged_ids: group.merged_ids,
                                                survivor: group.details.survivor,
                                                candidates: group.details.duplicates
                                            });
                                        }}
                                        disabled={isMerging}
                                        className={styles.actionButton}
                                    >
                                        <Merge size={16} />
                                        Launch Interactive Consolidation
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Policies Column */}
            <div className={styles.column}>
                <div className={styles.header}>
                    <h3 className={styles.headerTitle}>
                        <ShieldAlert size={18} style={{ color: "var(--status-info)" }} />
                        Suspected Policy Mergers
                    </h3>
                    {filteredPolicies.length > 0 && (
                        <span className={styles.badge}>{filteredPolicies.length} Actionable</span>
                    )}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.5, margin: '-0.75rem 0 0' }}>
                    Separate policy records that share the same base policy number. Binding extracts the sub-term&apos;s data (dates, premiums, documents) and attaches it to the root policy as an additional term.
                </p>

                {filteredPolicies.length === 0 ? (
                    <div className={styles.emptyState}>
                        <CheckCircle2 size={32} className="icon" />
                        <h4 style={{ color: "var(--text-high)", fontWeight: 600, marginBottom: "0.25rem" }}>All Clear</h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No policy variants found matching the search criteria.</p>
                    </div>
                ) : (
                    filteredPolicies.map((group, groupIdx) => (
                        <div
                            key={group.survivor_id}
                            className={`${styles.card} ${selectedPolicy === group.survivor_id ? styles.cardActivePolicy : ''}`}
                            onClick={() => setSelectedPolicy(group.survivor_id === selectedPolicy ? null : group.survivor_id)}
                        >
                            <div className={styles.metaBar}>
                                <div className={styles.confidenceScore}>
                                    <Copy size={13} style={{ color: "var(--status-info)", marginTop: "1px" }} />
                                    <span>{group.reason.replace('Shares identical Base Policy Number: ', 'Base Alignment: ')}</span>
                                </div>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600 }}>{group.confidence}% Match</span>
                            </div>

                            <div className={styles.entityList}>
                                {/* Survivor */}
                                <div className={styles.entityItem}>
                                    <div className={`${styles.iconMarker} ${styles.iconSurvivorPolicy}`}>S</div>
                                    <div className={styles.entityDetails}>
                                        <div className={styles.entityTitle}>{group.details.survivor.policy_number}</div>
                                        <div className={styles.entitySubtext}>
                                            <span style={{ color: "var(--status-info)", fontWeight: 600 }}>Root Policy</span>
                                            <span style={{ maxWidth: '60%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {group.details.survivor.property_address_norm}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Duplicates */}
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {group.details.duplicates.map((rec: any, i: number) => (
                                    <div key={rec.id} className={styles.entityItem}>
                                        <div className={`${styles.iconMarker} ${styles.iconTarget}`}>{i + 1}</div>
                                        <div className={styles.entityDetails}>
                                            <div className={`${styles.entityTitle} ${styles.targetText}`}>{rec.policy_number}</div>
                                            <div className={styles.entitySubtext}>
                                                <span>Sub-Term (Will link to Root)</span>
                                                <span style={{ maxWidth: '40%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {rec.property_address_norm || '-'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {selectedPolicy === group.survivor_id && (
                                <div className={styles.actionFooter}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleMergePolicy(`policy-${groupIdx}`, group.survivor_id, group.merged_ids); }}
                                        disabled={isMerging}
                                        className={`${styles.actionButton} ${styles.actionButtonBlue}`}
                                    >
                                        {isMerging ? <RefreshCw className={styles.spinAnimation} size={16} /> : <Merge size={16} />}
                                        Bind to Root Policy
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Launch Interactive Overlay */}
            {activeMergeGroup && (
                <ClientMergeModal
                    survivor={activeMergeGroup.survivor}
                    candidates={activeMergeGroup.candidates}
                    onClose={() => setActiveMergeGroup(null)}
                    onConfirm={handleMergeClient}
                />
            )}

            {/* Manual Merge Modal */}
            {manualMergeGroup && (
                <ClientMergeModal
                    survivor={manualMergeGroup.survivor}
                    candidates={manualMergeGroup.candidates}
                    onClose={() => setManualMergeGroup(null)}
                    onConfirm={handleMergeClient}
                />
            )}
        </div>
        </div>
    );
}
