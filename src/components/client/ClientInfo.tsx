'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Mail, Phone, FileText, ArrowLeft, MapPin, GitMerge, Pencil, Save, X, Loader2, CheckCircle, Flag as FlagIcon, Search, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button/Button';
import { getClientById, updateClient, ClientRow } from '@/lib/api';
import { insertActivityEvent } from '@/lib/notes';
import { supabase } from '@/lib/supabaseClient';
import { useRecentlyVisited } from '@/hooks/useRecentlyVisited';
import { useToast } from '@/components/ui/Toast/Toast';
import ClientMergeModal from '@/components/admin/ClientMergeModal';
import styles from './ClientInfo.module.css';
import { logger } from '@/lib/logger';


interface ClientInfoProps {
    clientId: string;
}

export function ClientInfo({ clientId }: ClientInfoProps) {
    const router = useRouter();
    const [client, setClient] = useState<ClientRow | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const { addVisit } = useRecentlyVisited();
    const toast = useToast();

    // Edit mode state
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [editForm, setEditForm] = useState({
        named_insured: '',
        email: '',
        phone: '',
        mailing_address_raw: '',
    });

    const [flagCount, setFlagCount] = useState(0);

    // ── Merge state ──
    const [isMergeSearchOpen, setIsMergeSearchOpen] = useState(false);
    const [mergeSearchQuery, setMergeSearchQuery] = useState('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [mergeSearchResults, setMergeSearchResults] = useState<any[]>([]);
    const [mergeSearchLoading, setMergeSearchLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [mergeTarget, setMergeTarget] = useState<any | null>(null);
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
    const [isMerging, setIsMerging] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [currentClientFull, setCurrentClientFull] = useState<any | null>(null);
    const mergeSearchRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const result = await getClientById(clientId);
                setClient(result);

                // Record visit with the real client name
                if (result) {
                    addVisit({
                        id: clientId,
                        type: 'client',
                        label: result.named_insured || 'Client',
                        href: `/client/${clientId}`,
                    });
                }

                // Fetch open flag count for this client
                const { count } = await supabase
                    .from('policy_flags')
                    .select('*', { count: 'exact', head: true })
                    .eq('client_id', clientId)
                    .eq('status', 'open');
                setFlagCount(count ?? 0);
            } catch (error) {
                logger.error('ClientInfo', 'Error loading client data:', { error: error instanceof Error ? error.message : String(error) })
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [clientId]);

    const enterEditMode = () => {
        if (!client) return;
        setEditForm({
            named_insured: client.named_insured || '',
            email: client.email || '',
            phone: client.phone || '',
            mailing_address_raw: client.mailing_address_raw || '',
        });
        setSaveMessage(null);
        setIsEditing(true);
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setSaveMessage(null);
    };

    const handleSave = async () => {
        if (!client) return;
        setSaving(true);
        setSaveMessage(null);

        // Determine what changed
        const changes: Record<string, string> = {};
        const changedFields: string[] = [];
        if (editForm.named_insured !== (client.named_insured || '')) {
            changes.named_insured = editForm.named_insured;
            changedFields.push('named_insured');
        }
        if (editForm.email !== (client.email || '')) {
            changes.email = editForm.email;
            changedFields.push('email');
        }
        if (editForm.phone !== (client.phone || '')) {
            changes.phone = editForm.phone;
            changedFields.push('phone');
        }
        if (editForm.mailing_address_raw !== (client.mailing_address_raw || '')) {
            changes.mailing_address_raw = editForm.mailing_address_raw;
            changedFields.push('mailing_address_raw');
        }

        if (changedFields.length === 0) {
            setIsEditing(false);
            setSaving(false);
            return;
        }

        const result = await updateClient(clientId, changes);
        if (result.success) {
            // Log activity event
            await insertActivityEvent({
                event_type: 'client.updated',
                title: 'Client profile updated',
                detail: `Updated: ${changedFields.join(', ')}`,
                client_id: clientId,
                meta: { changed_fields: changedFields },
            });

            // Reload client data
            const refreshed = await getClientById(clientId);
            setClient(refreshed);
            setIsEditing(false);
            setSaveMessage({ type: 'success', text: 'Client saved successfully' });
            setTimeout(() => setSaveMessage(null), 3000);
        } else {
            setSaveMessage({ type: 'error', text: result.error || 'Failed to save' });
        }
        setSaving(false);
    };

    // ── Merge: search for clients to merge with ──
    const handleMergeSearchChange = useCallback((query: string) => {
        setMergeSearchQuery(query);
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (query.trim().length < 2) {
            setMergeSearchResults([]);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setMergeSearchLoading(true);
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
                const data = await res.json();
                // Filter out the current client from results
                const filtered = (data.clients || []).filter((c: any) => c.id !== clientId);
                setMergeSearchResults(filtered);
            } catch (err) {
                logger.error('ClientInfo', 'Merge search error:', { error: err instanceof Error ? err.message : String(err) })
            } finally {
                setMergeSearchLoading(false);
            }
        }, 300);
    }, [clientId]);

    // ── Merge: load full client data for merge modal ──
    const handleSelectMergeTarget = useCallback(async (targetId: string) => {
        setMergeSearchLoading(true);
        try {
            // Fetch full data for both clients (with policies, terms, dec_pages)
            const selectFields = `id, named_insured, email, phone, mailing_address_raw, mailing_address_norm, created_at,
                policies(id, policy_number, carrier_name, property_address_raw, status, created_at,
                    policy_terms(id, effective_date, expiration_date, annual_premium, is_current)),
                dec_pages(id)`;

            const [currentRes, targetRes] = await Promise.all([
                supabase.from('clients').select(selectFields).eq('id', clientId).single(),
                supabase.from('clients').select(selectFields).eq('id', targetId).single(),
            ]);

            if (currentRes.error || !currentRes.data || targetRes.error || !targetRes.data) {
                toast.error('Failed to load client data for merge');
                return;
            }

            setCurrentClientFull(currentRes.data);
            setMergeTarget(targetRes.data);
            setIsMergeModalOpen(true);
            setIsMergeSearchOpen(false);
            setMergeSearchQuery('');
            setMergeSearchResults([]);
        } catch (err) {
            logger.error('ClientInfo', 'Failed to load merge target:', { error: err instanceof Error ? err.message : String(err) })
            alert('Failed to load full client data for merge. Check console.');
        } finally {
            setMergeSearchLoading(false);
        }
    }, [clientId, toast]);

    // ── Merge: execute the merge ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMergeConfirm = useCallback(async (survivorId: string, mergedIds: string[], consolidatedFields: Record<string, any>, keepDocs: boolean) => {
        setIsMerging(true);
        try {
            for (const mergedId of mergedIds) {
                const res = await fetch('/api/merge/clients', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        survivor_id: survivorId,
                        merged_id: mergedId,
                        consolidated_fields: consolidatedFields,
                        keep_documents: keepDocs,
                    }),
                });
                if (!res.ok) throw new Error('Merge failed');
            }

            toast.success('Clients merged successfully!');
            setIsMergeModalOpen(false);
            setMergeTarget(null);
            setCurrentClientFull(null);

            // If we are the survivor, refresh. If we were merged away, redirect.
            if (survivorId === clientId) {
                const refreshed = await getClientById(clientId);
                setClient(refreshed);
            } else {
                router.push(`/client/${survivorId}`);
            }
        } catch (err) {
            logger.error('ClientInfo', 'Merge failed:', { error: err instanceof Error ? err.message : String(err) })
            alert('Merge failed. Check console for details.');
        } finally {
            setIsMerging(false);
        }
    }, [clientId, toast, router]);

    const clientName = client?.named_insured || 'Client Name';
    const clientEmail = client?.email || 'Not on file';
    const clientPhone = client?.phone || 'Not on file';
    const mailingAddress = client?.mailing_address_raw || 'Address not available';

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.back()}
                        className={styles.backButton}
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                </div>
                <div className={styles.card}>
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                        Loading client information...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.back()}
                    className={styles.backButton}
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
            </div>

            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <div className={styles.iconWrapper}>
                        <User className={styles.icon} />
                    </div>
                    <div style={{ flex: 1 }}>
                        {isEditing ? (
                            <input
                                type="text"
                                value={editForm.named_insured}
                                onChange={(e) => setEditForm(f => ({ ...f, named_insured: e.target.value }))}
                                style={{
                                    fontSize: '1.25rem',
                                    fontWeight: 700,
                                    color: 'var(--text-high)',
                                    background: 'var(--bg-surface-raised)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '6px',
                                    padding: '0.35rem 0.75rem',
                                    width: '100%',
                                    outline: 'none',
                                }}
                                placeholder="Named Insured"
                            />
                        ) : (
                            <>
                                <h1 className={styles.title}>{clientName}</h1>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <p className={styles.subtitle}>Client ID: {clientId}</p>
                                    {flagCount > 0 && (
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            padding: '0.15rem 0.5rem',
                                            borderRadius: '999px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            background: 'rgba(239, 68, 68, 0.12)',
                                            color: '#f87171',
                                            border: '1px solid rgba(239, 68, 68, 0.2)',
                                        }}>
                                            <FlagIcon size={11} />
                                            {flagCount} Open {flagCount === 1 ? 'Flag' : 'Flags'}
                                        </span>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className={styles.actions}>
                    {isEditing ? (
                        <>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleSave}
                                disabled={saving}
                                className={styles.actionButton}
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {saving ? 'Saving...' : 'Save Changes'}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={cancelEdit}
                                disabled={saving}
                                className={styles.actionButton}
                            >
                                <X className="w-4 h-4" />
                                Cancel
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={enterEditMode}
                                className={styles.actionButton}
                            >
                                <Pencil className="w-4 h-4" />
                                Edit Client
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setIsMergeSearchOpen(!isMergeSearchOpen);
                                    setMergeSearchQuery('');
                                    setMergeSearchResults([]);
                                    setTimeout(() => mergeSearchRef.current?.focus(), 100);
                                }}
                                className={styles.actionButton}
                                style={isMergeSearchOpen ? { background: 'rgba(129, 140, 248, 0.1)', color: '#818cf8', borderColor: 'rgba(129, 140, 248, 0.3)' } : undefined}
                            >
                                <GitMerge className="w-4 h-4" />
                                {isMergeSearchOpen ? 'Cancel Merge' : 'Merge Client Profile'}
                            </Button>
                        </>
                    )}
                </div>

                {/* ── Merge Search Panel ── */}
                {isMergeSearchOpen && (
                    <div style={{
                        padding: '1rem',
                        margin: '0 0 1rem',
                        background: 'var(--bg-surface-raised)',
                        border: '1px solid rgba(129, 140, 248, 0.2)',
                        borderRadius: 'var(--radius-md)',
                    }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#818cf8', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <GitMerge size={13} />
                            Find a client to merge with {clientName}
                        </div>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                ref={mergeSearchRef}
                                type="text"
                                placeholder="Search by name, email, or phone..."
                                value={mergeSearchQuery}
                                onChange={(e) => handleMergeSearchChange(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.55rem 0.75rem 0.55rem 2rem',
                                    background: 'var(--bg-surface)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '6px',
                                    fontSize: '0.85rem',
                                    color: 'var(--text-high)',
                                    outline: 'none',
                                }}
                            />
                            {mergeSearchLoading && (
                                <Loader2 size={14} style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
                            )}
                        </div>

                        {/* Search Results */}
                        {mergeSearchResults.length > 0 && (
                            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                {mergeSearchResults.map((result: any) => (
                                    <button
                                        key={result.id}
                                        onClick={() => handleSelectMergeTarget(result.id)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.6rem 0.75rem',
                                            background: 'var(--bg-surface)',
                                            border: '1px solid var(--border-default)',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            width: '100%',
                                            textAlign: 'left',
                                            transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.4)';
                                            e.currentTarget.style.background = 'rgba(129, 140, 248, 0.05)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = 'var(--border-default)';
                                            e.currentTarget.style.background = 'var(--bg-surface)';
                                        }}
                                    >
                                        <div style={{
                                            width: 32, height: 32, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #818cf8, #6366f1)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0,
                                        }}>
                                            <User size={14} style={{ color: '#fff' }} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-high)' }}>
                                                {result.name}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem' }}>
                                                {result.email && <span>{result.email}</span>}
                                                {result.phone && <span>{result.phone}</span>}
                                            </div>
                                        </div>
                                        <GitMerge size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
                                    </button>
                                ))}
                            </div>
                        )}

                        {mergeSearchQuery.length >= 2 && !mergeSearchLoading && mergeSearchResults.length === 0 && (
                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                No other clients found matching &quot;{mergeSearchQuery}&quot;
                            </div>
                        )}
                    </div>
                )}

                {/* Toast message */}
                {saveMessage && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        marginBottom: '1rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        background: saveMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: saveMessage.type === 'success' ? '#10b981' : '#ef4444',
                        border: `1px solid ${saveMessage.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                    }}>
                        {saveMessage.type === 'success' && <CheckCircle size={16} />}
                        {saveMessage.text}
                    </div>
                )}

                <div className={styles.grid}>
                    <div className={styles.infoItem}>
                        <div className={styles.infoIcon}>
                            <Mail />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div className={styles.infoLabel}>Email</div>
                            {isEditing ? (
                                <input
                                    type="email"
                                    value={editForm.email}
                                    onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                                    placeholder="Email address"
                                    style={{
                                        color: 'var(--text-high)',
                                        background: 'var(--bg-surface-raised)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: '6px',
                                        padding: '0.35rem 0.75rem',
                                        width: '100%',
                                        fontSize: '0.875rem',
                                        outline: 'none',
                                    }}
                                />
                            ) : clientEmail === 'Not on file' ? (
                                <button
                                    onClick={enterEditMode}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#818cf8',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem',
                                        fontWeight: 500,
                                        padding: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                    }}
                                >
                                    + Add Email
                                </button>
                            ) : (
                                <div className={styles.infoValue}>{clientEmail}</div>
                            )}
                        </div>
                    </div>

                    <div className={styles.infoItem}>
                        <div className={styles.infoIcon}>
                            <Phone />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div className={styles.infoLabel}>Phone</div>
                            {isEditing ? (
                                <input
                                    type="tel"
                                    value={editForm.phone}
                                    onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                                    placeholder="Phone number"
                                    style={{
                                        color: 'var(--text-high)',
                                        background: 'var(--bg-surface-raised)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: '6px',
                                        padding: '0.35rem 0.75rem',
                                        width: '100%',
                                        fontSize: '0.875rem',
                                        outline: 'none',
                                    }}
                                />
                            ) : clientPhone === 'Not on file' ? (
                                <button
                                    onClick={enterEditMode}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#818cf8',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem',
                                        fontWeight: 500,
                                        padding: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                    }}
                                >
                                    + Add Phone
                                </button>
                            ) : (
                                <div className={styles.infoValue}>{clientPhone}</div>
                            )}
                        </div>
                    </div>

                    <div className={styles.infoItem}>
                        <div className={styles.infoIcon}>
                            <FileText />
                        </div>
                        <div>
                            <div className={styles.infoLabel}>Client Type</div>
                            <div className={styles.infoValue}>{client?.insured_type === 'person' ? 'Individual' : client?.insured_type === 'business' ? 'Business' : (client?.insured_type || 'Individual')}</div>
                        </div>
                    </div>

                    <div className={styles.infoItem}>
                        <div className={styles.infoIcon}>
                            <MapPin />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div className={styles.infoLabel}>Mailing Address</div>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={editForm.mailing_address_raw}
                                    onChange={(e) => setEditForm(f => ({ ...f, mailing_address_raw: e.target.value }))}
                                    placeholder="Mailing address"
                                    style={{
                                        color: 'var(--text-high)',
                                        background: 'var(--bg-surface-raised)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: '6px',
                                        padding: '0.35rem 0.75rem',
                                        width: '100%',
                                        fontSize: '0.875rem',
                                        outline: 'none',
                                    }}
                                />
                            ) : (
                                <div className={styles.infoValue}>{mailingAddress}</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Merge Modal ── */}
            {isMergeModalOpen && currentClientFull && mergeTarget && (
                <ClientMergeModal
                    survivor={currentClientFull}
                    candidates={[mergeTarget]}
                    onClose={() => {
                        setIsMergeModalOpen(false);
                        setMergeTarget(null);
                        setCurrentClientFull(null);
                    }}
                    onConfirm={handleMergeConfirm}
                />
            )}
        </div>
    );
}
