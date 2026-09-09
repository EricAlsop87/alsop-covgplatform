'use client';

import React, { useState } from 'react';
import { GitMerge, X, AlertTriangle, Loader2, CheckCircle2, Shield, FileText, MapPin, Calendar, DollarSign, Flag } from 'lucide-react';
import { DashboardPolicy } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/Toast/Toast';
import styles from './PolicyMergeModal.module.css';

interface PolicyMergeModalProps {
    policyA: DashboardPolicy;
    policyB: DashboardPolicy;
    onClose: () => void;
    onSuccess: () => void;
}

function formatShortDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}-${dd}-${yy}`;
}

export function PolicyMergeModal({ policyA, policyB, onClose, onSuccess }: PolicyMergeModalProps) {
    const toast = useToast();

    // Default survivor: pick the one with an address, or policyA if both/neither have one
    const defaultSurvivorId = (() => {
        const hasAddrA = Boolean(policyA.property_address && policyA.property_address.trim() && policyA.property_address !== '—');
        const hasAddrB = Boolean(policyB.property_address && policyB.property_address.trim() && policyB.property_address !== '—');
        if (hasAddrA && !hasAddrB) return policyA.id;
        if (!hasAddrA && hasAddrB) return policyB.id;
        return policyA.id;
    })();

    const [survivorId, setSurvivorId] = useState<string>(defaultSurvivorId);
    const [isMerging, setIsMerging] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const survivorPolicy = survivorId === policyA.id ? policyA : policyB;
    const duplicatePolicy = survivorId === policyA.id ? policyB : policyA;

    const handleConfirmMerge = async () => {
        setIsMerging(true);
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch('/api/merge/policies', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    survivor_id: survivorPolicy.id,
                    merged_id: duplicatePolicy.id,
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to merge policies');
            }

            toast.success(`Successfully merged policy records into ${survivorPolicy.policy_number}!`);
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred during merge.');
        } finally {
            setIsMerging(false);
        }
    };

    const renderCard = (policy: DashboardPolicy) => {
        const isSurvivor = policy.id === survivorId;
        const hasAddress = Boolean(policy.property_address && policy.property_address.trim() && policy.property_address !== '—');

        return (
            <div
                key={policy.id}
                className={`${styles.policyCard} ${isSurvivor ? styles.selectedCard : ''}`}
                onClick={() => setSurvivorId(policy.id)}
            >
                <div className={styles.cardHeader}>
                    <label className={styles.radioLabel} onClick={(e) => e.stopPropagation()}>
                        <input
                            type="radio"
                            name="survivorSelect"
                            checked={isSurvivor}
                            onChange={() => setSurvivorId(policy.id)}
                            style={{ accentColor: '#6366f1', width: 16, height: 16, cursor: 'pointer' }}
                        />
                        {isSurvivor ? 'Primary Record' : 'Duplicate Record'}
                    </label>
                    <span className={isSurvivor ? styles.badgePrimary : styles.badgeDuplicate}>
                        {isSurvivor ? '✓ KEEPER' : 'WILL BE MERGED'}
                    </span>
                </div>

                <div className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Policy Number</span>
                    <span className={styles.policyNumberLarge}>{policy.policy_number}</span>
                    {policy.carrier_policy_number && policy.carrier_policy_number !== policy.policy_number && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Carrier #: {policy.carrier_policy_number}
                        </span>
                    )}
                </div>

                <div className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Property Address</span>
                    <span className={styles.fieldValue} style={!hasAddress ? { color: 'var(--text-muted)', fontStyle: 'italic' } : {}}>
                        {hasAddress ? policy.property_address : 'No address on file'}
                    </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Term Period</span>
                        <span className={styles.fieldValue} style={{ fontSize: '0.8rem' }}>
                            {formatShortDate(policy.effective_date)} to {formatShortDate(policy.expiration_date)}
                        </span>
                    </div>

                    <div className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Annual Premium</span>
                        <span className={styles.fieldValue} style={{ fontWeight: 600 }}>
                            {policy.annual_premium || '—'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Flags</span>
                        <span className={styles.fieldValue} style={{ fontSize: '0.8rem' }}>
                            {policy.flag_count > 0 ? (
                                <span style={{ color: '#f87171', fontWeight: 600 }}>⚑ {policy.flag_count} Open</span>
                            ) : (
                                <span style={{ color: '#4ade80' }}>✓ None</span>
                            )}
                        </span>
                    </div>

                    <div className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Status</span>
                        <span className={styles.fieldValue} style={{ textTransform: 'capitalize', fontSize: '0.8rem' }}>
                            {policy.status || 'unknown'}
                        </span>
                    </div>
                </div>

                <div className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Files On File</span>
                    <div className={styles.docTags}>
                        {policy.has_dec_page && <span className={styles.docTag} style={{ borderColor: '#3b82f6', color: '#60a5fa' }}>Dec Page</span>}
                        {policy.has_rce && <span className={styles.docTag} style={{ borderColor: '#10b981', color: '#34d399' }}>RCE Quote</span>}
                        {policy.has_dic && <span className={styles.docTag} style={{ borderColor: '#f97316', color: '#fb923c' }}>DIC Quote</span>}
                        {policy.has_es && <span className={styles.docTag} style={{ borderColor: '#8b5cf6', color: '#a78bfa' }}>E&S Doc</span>}
                        {!policy.has_dec_page && !policy.has_rce && !policy.has_dic && !policy.has_es && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No attached documents detected</span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.titleRow}>
                        <div className={styles.iconWrapper}>
                            <GitMerge size={20} />
                        </div>
                        <div>
                            <h2 className={styles.title}>Merge Policies</h2>
                            <p className={styles.subtitle}>Consolidate duplicate policy records under this client into one.</p>
                        </div>
                    </div>
                    <button className={styles.closeButton} onClick={onClose} disabled={isMerging}>
                        <X size={18} />
                    </button>
                </div>

                <div className={styles.body}>
                    <div className={styles.instruction}>
                        Select which policy record you want to keep as the primary record:
                    </div>

                    <div className={styles.cardsGrid}>
                        {renderCard(policyA)}
                        {renderCard(policyB)}
                    </div>

                    <div className={styles.alertBox}>
                        <strong>🛡️ Safe Merge Process:</strong>
                        <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <li>All uploaded files (Dec pages, RCE quotes, DIC policies) from the duplicate will be moved to <strong>{survivorPolicy.policy_number}</strong>.</li>
                            <li>Terms, property enrichments, and open flags will be safely transferred.</li>
                            <li>If the primary policy is missing an address, the address from the duplicate will automatically be carried over.</li>
                            <li>The duplicate policy row will be removed. <strong>No documents will ever be deleted.</strong></li>
                        </ul>
                    </div>

                    {error && (
                        <div className={styles.errorMessage}>
                            <AlertTriangle size={15} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'middle' }} />
                            {error}
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    <button className={styles.cancelBtn} onClick={onClose} disabled={isMerging}>
                        Cancel
                    </button>
                    <button className={styles.mergeBtn} onClick={handleConfirmMerge} disabled={isMerging}>
                        {isMerging ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Merging Policies...
                            </>
                        ) : (
                            <>
                                <GitMerge size={16} />
                                Merge Into {survivorPolicy.policy_number}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
