'use client';

import React, { useState, useEffect } from 'react';
import {
    Building,
    Check,
    CheckCircle2,
    AlertCircle,
    AlertTriangle,
    X,
    Copy,
    Loader2,
    ShieldCheck,
    Trash2,
} from 'lucide-react';
import type { CFPTermRow, TitleProData } from '@/app/api/cfp-summary/route';
import styles from './TitleProModal.module.scss';
import { supabase } from '@/lib/supabaseClient';

interface TitleProModalProps {
    term: CFPTermRow;
    onClose: () => void;
    onSaveSuccess: (policyId: string, updatedData: TitleProData | null) => void;
}

export function TitleProModal({ term, onClose, onSaveSuccess }: TitleProModalProps) {
    const existing = term.title_pro;

    const [titleName, setTitleName] = useState<string>(existing?.title_name || '');
    const [matchStatus, setMatchStatus] = useState<'matched' | 'partial' | 'mismatch'>(
        existing?.match_status || 'matched'
    );
    const [notes, setNotes] = useState<string>(existing?.notes || '');
    const [saving, setSaving] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [copiedInsured, setCopiedInsured] = useState(false);
    const [copiedAddress, setCopiedAddress] = useState(false);

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleCopy = (text: string, type: 'insured' | 'address') => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        if (type === 'insured') {
            setCopiedInsured(true);
            setTimeout(() => setCopiedInsured(false), 1500);
        } else {
            setCopiedAddress(true);
            setTimeout(() => setCopiedAddress(false), 1500);
        }
    };

    const handleSameAsInsured = () => {
        if (term.named_insured) {
            setTitleName(term.named_insured);
            setMatchStatus('matched');
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSaving(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch('/api/cfp-summary/title-pro', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    policy_id: term.policy_id,
                    title_name: titleName.trim() || term.named_insured || '',
                    match_status: matchStatus,
                    notes: notes.trim(),
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to save Title Pro verification');
            }

            onSaveSuccess(term.policy_id, data.title_pro);
            onClose();
        } catch (err: any) {
            setError(err.message || 'An error occurred while saving');
        } finally {
            setSaving(false);
        }
    };

    const handleClear = async () => {
        if (!confirm('Are you sure you want to remove the Title Pro verification for this policy?')) {
            return;
        }

        setError(null);
        setClearing(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch(`/api/cfp-summary/title-pro?policy_id=${term.policy_id}`, {
                method: 'DELETE',
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to clear Title Pro verification');
            }

            onSaveSuccess(term.policy_id, null);
            onClose();
        } catch (err: any) {
            setError(err.message || 'An error occurred while removing verification');
        } finally {
            setClearing(false);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.modalHeader}>
                    <div className={styles.modalHeaderInfo}>
                        <div className={styles.modalTitleRow}>
                            <Building size={18} className={styles.modalIcon} />
                            <h3 className={styles.modalTitle}>Title Pro Verification</h3>
                        </div>
                        <span className={styles.modalSubtitle}>
                            CFP Policy: <strong>{term.policy_number}</strong>
                        </span>
                    </div>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        title="Close (Esc)"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSave}>
                    <div className={styles.modalBody}>
                        {/* Reference Card: Policy Named Insured & Property Address */}
                        <div className={styles.infoCard}>
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>Named Insured:</span>
                                <div className={styles.infoValue}>
                                    <span>{term.named_insured || '—'}</span>
                                    {term.named_insured && (
                                        <button
                                            type="button"
                                            className={`${styles.copyMiniBtn} ${copiedInsured ? styles.copied : ''}`}
                                            onClick={() => handleCopy(term.named_insured, 'insured')}
                                            title="Copy Named Insured"
                                        >
                                            {copiedInsured ? <Check size={10} /> : <Copy size={10} />}
                                            <span>{copiedInsured ? 'Copied' : 'Copy'}</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>Property Address:</span>
                                <div className={styles.infoValue}>
                                    <span>{term.property_address || '—'}</span>
                                    {term.property_address && (
                                        <button
                                            type="button"
                                            className={`${styles.copyMiniBtn} ${copiedAddress ? styles.copied : ''}`}
                                            onClick={() => handleCopy(term.property_address, 'address')}
                                            title="Copy Property Address for Title Pro search"
                                        >
                                            {copiedAddress ? <Check size={10} /> : <Copy size={10} />}
                                            <span>{copiedAddress ? 'Copied' : 'Copy'}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Name on Title Input */}
                        <div className={styles.formGroup}>
                            <div className={styles.formLabelRow}>
                                <label className={styles.formLabel} htmlFor="title_name_input">
                                    Name on Title Pro Record
                                </label>
                                {term.named_insured && (
                                    <button
                                        type="button"
                                        className={styles.sameAsBtn}
                                        onClick={handleSameAsInsured}
                                        title="Fill with Named Insured"
                                    >
                                        <Check size={11} /> Same as Insured
                                    </button>
                                )}
                            </div>
                            <input
                                id="title_name_input"
                                type="text"
                                className={styles.inputField}
                                placeholder="e.g. John Doe & Jane Doe, or Doe Family Living Trust"
                                value={titleName}
                                onChange={e => setTitleName(e.target.value)}
                                autoFocus
                            />
                        </div>

                        {/* Verification Match Status */}
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Title Match Status</label>
                            <div className={styles.statusCards}>
                                <div
                                    className={`${styles.statusCard} ${styles.matched} ${matchStatus === 'matched' ? styles.active : ''}`}
                                    onClick={() => setMatchStatus('matched')}
                                >
                                    <div className={styles.statusCardIcon}>
                                        <CheckCircle2 size={16} />
                                    </div>
                                    <span className={styles.statusCardTitle}>Matched</span>
                                    <span className={styles.statusCardDesc}>Names match</span>
                                </div>

                                <div
                                    className={`${styles.statusCard} ${styles.partial} ${matchStatus === 'partial' ? styles.active : ''}`}
                                    onClick={() => setMatchStatus('partial')}
                                >
                                    <div className={styles.statusCardIcon}>
                                        <AlertTriangle size={16} />
                                    </div>
                                    <span className={styles.statusCardTitle}>Trust / LLC</span>
                                    <span className={styles.statusCardDesc}>Entity / Co-owner</span>
                                </div>

                                <div
                                    className={`${styles.statusCard} ${styles.mismatch} ${matchStatus === 'mismatch' ? styles.active : ''}`}
                                    onClick={() => setMatchStatus('mismatch')}
                                >
                                    <div className={styles.statusCardIcon}>
                                        <AlertCircle size={16} />
                                    </div>
                                    <span className={styles.statusCardTitle}>Mismatch</span>
                                    <span className={styles.statusCardDesc}>Different name</span>
                                </div>
                            </div>
                        </div>

                        {/* Internal Notes */}
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel} htmlFor="title_notes_input">
                                Notes / Remarks (Optional)
                            </label>
                            <textarea
                                id="title_notes_input"
                                className={styles.textareaField}
                                placeholder="e.g. Title held under John Smith Trust; wife Jane added on policy"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                            />
                        </div>

                        {/* Existing Audit Meta */}
                        {existing && (
                            <div className={styles.auditMeta}>
                                <ShieldCheck size={14} />
                                <span>
                                    Last verified by <strong>{existing.verified_by || 'Staff'}</strong>
                                    {existing.verified_at && (
                                        <> on {new Date(existing.verified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                                    )}
                                </span>
                            </div>
                        )}

                        {/* Error message */}
                        {error && (
                            <div style={{ color: '#ef4444', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <AlertCircle size={14} />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className={styles.modalFooter}>
                        <div className={styles.footerLeft}>
                            {existing && (
                                <button
                                    type="button"
                                    className={styles.clearBtn}
                                    onClick={handleClear}
                                    disabled={clearing || saving}
                                    title="Delete Title Pro record for this policy"
                                >
                                    {clearing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                    <span>Remove</span>
                                </button>
                            )}
                        </div>
                        <div className={styles.footerRight}>
                            <button
                                type="button"
                                className={styles.cancelBtn}
                                onClick={onClose}
                                disabled={saving || clearing}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className={styles.saveBtn}
                                disabled={saving || clearing}
                            >
                                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                <span>Save</span>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
