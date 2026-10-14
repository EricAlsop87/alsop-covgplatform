'use client';

import React, { useState, useEffect } from 'react';
import {
    FileText,
    Check,
    AlertCircle,
    X,
    Copy,
    Loader2,
    DollarSign,
    Trash2,
    Home,
    Eye,
    Calculator,
} from 'lucide-react';
import type { CFPTermRow } from '@/app/api/cfp-summary/route';
import type { RceValuationData } from '@/app/api/cfp-summary/rce-valuation/route';
import styles from './RceValuationModal.module.scss';
import { supabase } from '@/lib/supabaseClient';

const VALUATION_PROVIDERS = [
    'Bamboo',
    'Aegis',
    'AM',
    '360Value',
    'CoreLogic',
    'SageSure',
    'PSIC',
    'Other',
];

interface RceValuationModalProps {
    term: CFPTermRow;
    onClose: () => void;
    onSaveSuccess: (policyId: string, updatedData: RceValuationData | null) => void;
    onPreviewDoc?: (docInfo: {
        title: string;
        subtitle?: string;
        docType: 'dec' | 'rce' | 'dic' | 'quote';
        storagePath?: string | null;
        bucket: 'cfp-platform-documents' | 'cfp-raw-decpage';
        fileName?: string | null;
        policyId: string;
    }) => void;
}

export function RceValuationModal({
    term,
    onClose,
    onSaveSuccess,
    onPreviewDoc,
}: RceValuationModalProps) {
    const isInitiallyUnable = term.rce_carrier === 'Unavailable' || (
        !term.rce_replacement_cost &&
        !term.has_rce &&
        term.carrier_quotes?.bamboo?.coverage_type === 'UNAVAILABLE' &&
        term.carrier_quotes?.aegis?.coverage_type === 'UNAVAILABLE' &&
        term.carrier_quotes?.psic?.coverage_type === 'UNAVAILABLE'
    );
    const [status, setStatus] = useState<'available' | 'unavailable'>(
        isInitiallyUnable ? 'unavailable' : 'available'
    );
    const [replacementCost, setReplacementCost] = useState<string>(
        term.rce_replacement_cost ? String(Math.round(Number(term.rce_replacement_cost))) : ''
    );
    const [carrier, setCarrier] = useState<string>(
        term.rce_carrier && term.rce_carrier !== 'Unavailable' ? term.rce_carrier : 'Bamboo'
    );
    const [sqFeet, setSqFeet] = useState<string>(
        term.rce_sq_feet ? String(term.rce_sq_feet) : ''
    );
    const [costPerSqft, setCostPerSqft] = useState<string>(
        term.rce_cost_per_sqft ? String(term.rce_cost_per_sqft) : ''
    );
    const [notes, setNotes] = useState<string>(() => {
        if (term.carrier_quotes) {
            const bNote = term.carrier_quotes.bamboo?.notes;
            const aNote = term.carrier_quotes.aegis?.notes;
            const pNote = term.carrier_quotes.psic?.notes;
            if (isInitiallyUnable && (bNote || aNote || pNote)) {
                const parts: string[] = [];
                if (bNote) parts.push(`Bamboo: ${bNote}`);
                if (aNote) parts.push(`Aegis: ${aNote}`);
                if (pNote) parts.push(`PSIC: ${pNote}`);
                return parts.join('\n');
            }
        }
        return '';
    });
    const [saving, setSaving] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [copiedInsured, setCopiedInsured] = useState(false);
    const [copiedAddress, setCopiedAddress] = useState(false);

    // Auto-calculate cost per sqft when replacement cost or sqft changes
    const handleCostChange = (val: string) => {
        setReplacementCost(val);
        const costNum = parseFloat(val.replace(/[^0-9.]/g, ''));
        const sqftNum = parseFloat(sqFeet.replace(/[^0-9.]/g, ''));
        if (!isNaN(costNum) && !isNaN(sqftNum) && sqftNum > 0) {
            setCostPerSqft(String(Math.round(costNum / sqftNum)));
        }
    };

    const handleSqftChange = (val: string) => {
        setSqFeet(val);
        const costNum = parseFloat(replacementCost.replace(/[^0-9.]/g, ''));
        const sqftNum = parseFloat(val.replace(/[^0-9.]/g, ''));
        if (!isNaN(costNum) && !isNaN(sqftNum) && sqftNum > 0) {
            setCostPerSqft(String(Math.round(costNum / sqftNum)));
        }
    };

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

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSaving(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch('/api/cfp-summary/rce-valuation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    policy_id: term.policy_id,
                    replacement_cost: status === 'unavailable'
                        ? null
                        : (replacementCost ? parseFloat(replacementCost.replace(/[^0-9.]/g, '')) : null),
                    carrier: status === 'unavailable' ? 'Unavailable' : carrier.trim(),
                    sq_feet: status === 'unavailable' ? null : (sqFeet ? parseFloat(sqFeet.replace(/[^0-9.]/g, '')) : null),
                    cost_per_sqft: status === 'unavailable' ? null : (costPerSqft ? parseFloat(costPerSqft.replace(/[^0-9.]/g, '')) : null),
                    notes: notes.slice(0, 500).trim(),
                    storage_path: term.rce_storage_path || null,
                    file_name: term.rce_file_name || null,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to save RCE valuation');
            }

            onSaveSuccess(term.policy_id, data.rce_valuation);
            onClose();
        } catch (err: any) {
            setError(err.message || 'An error occurred while saving RCE valuation');
        } finally {
            setSaving(false);
        }
    };

    const handleClear = async () => {
        if (!confirm('Are you sure you want to remove the RCE valuation for this policy?')) {
            return;
        }

        setError(null);
        setClearing(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch(
                `/api/cfp-summary/rce-valuation?policy_id=${term.policy_id}`,
                {
                    method: 'DELETE',
                    headers: {
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                }
            );

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to clear RCE valuation');
            }

            onSaveSuccess(term.policy_id, null);
            onClose();
        } catch (err: any) {
            setError(err.message || 'An error occurred while removing RCE valuation');
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
                            <span className={styles.rceBadgeTag}>
                                RCE Valuation
                            </span>
                            <h3 className={styles.modalTitle}>Replacement Cost Valuation</h3>
                        </div>
                        <span className={styles.modalSubtitle}>
                            {term.policy_number} • {term.named_insured || 'Insured'}
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

                {/* Context Information & Quick Copy Banner */}
                <div className={styles.contextBanner}>
                    <div className={styles.contextRow}>
                        <span className={styles.contextLabel}>Named Insured:</span>
                        <div className={styles.contextValueWithCopy}>
                            <span className={styles.contextValue}>
                                {term.named_insured || '—'}
                            </span>
                            {term.named_insured && (
                                <button
                                    type="button"
                                    className={`${styles.copyMiniBtn} ${copiedInsured ? styles.copied : ''}`}
                                    onClick={() => handleCopy(term.named_insured, 'insured')}
                                    title="Copy insured name"
                                >
                                    {copiedInsured ? <Check size={11} /> : <Copy size={11} />}
                                    <span>{copiedInsured ? 'Copied' : 'Copy'}</span>
                                </button>
                            )}
                        </div>
                    </div>
                    <div className={styles.contextRow}>
                        <span className={styles.contextLabel}>Property Address:</span>
                        <div className={styles.contextValueWithCopy}>
                            <span className={styles.contextValue} title={term.property_address}>
                                {term.property_address
                                    ? term.property_address.length > 38
                                        ? `${term.property_address.slice(0, 38)}...`
                                        : term.property_address
                                    : '—'}
                            </span>
                            {term.property_address && (
                                <button
                                    type="button"
                                    className={`${styles.copyMiniBtn} ${copiedAddress ? styles.copied : ''}`}
                                    onClick={() => handleCopy(term.property_address, 'address')}
                                    title="Copy property address"
                                >
                                    {copiedAddress ? <Check size={11} /> : <Copy size={11} />}
                                    <span>{copiedAddress ? 'Copied' : 'Copy'}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Form */}
                <form onSubmit={handleSave} className={styles.modalForm}>
                    {error && (
                        <div className={styles.errorAlert}>
                            <AlertCircle size={15} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Status Toggle Cards */}
                    <div className={styles.statusGrid}>
                        <div
                            className={`${styles.statusCard} ${styles.available} ${status === 'available' ? styles.active : ''}`}
                            onClick={() => setStatus('available')}
                        >
                            <span className={styles.statusCardTitle}>
                                🟢 RCE Obtained
                            </span>
                            <span className={styles.statusCardSub}>
                                Valuation & replacement cost available
                            </span>
                        </div>
                        <div
                            className={`${styles.statusCard} ${styles.unavailable} ${status === 'unavailable' ? styles.active : ''}`}
                            onClick={() => setStatus('unavailable')}
                        >
                            <span className={styles.statusCardTitle}>
                                🔴 Unable to Obtain RCE
                            </span>
                            <span className={styles.statusCardSub}>
                                3 carriers declined / risk ineligible
                            </span>
                        </div>
                    </div>

                    {status === 'unavailable' && (
                        <div className={styles.unavailableBanner}>
                            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <strong>Marked as Unable to Obtain RCE</strong>
                                <p style={{ margin: '0.25rem 0 0 0', opacity: 0.9 }}>
                                    All 3 companion carriers (Bamboo, Aegis, PSIC) are unable to quote or risk is ineligible. This policy will be counted and flagged as unquotable.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Attached RCE PDF Document (if any) */}
                    {term.rce_storage_path && (
                        <div className={styles.docAttachmentCard}>
                            <div className={styles.docCardLeft}>
                                <FileText size={20} className={styles.docCardIcon} />
                                <div className={styles.docCardText}>
                                    <span className={styles.docFileName}>
                                        {term.rce_file_name || 'RCE_Document.pdf'}
                                    </span>
                                    <span className={styles.docSubtext}>
                                        Attached RCE Document ({term.rce_carrier || 'Valuation Provider'})
                                    </span>
                                </div>
                            </div>
                            {onPreviewDoc && (
                                <button
                                    type="button"
                                    className={styles.docPreviewBtn}
                                    onClick={() =>
                                        onPreviewDoc({
                                            title: `RCE Document — ${term.rce_carrier || 'Uploaded'} (${term.policy_number})`,
                                            subtitle: term.named_insured || undefined,
                                            docType: 'rce',
                                            storagePath: term.rce_storage_path,
                                            bucket: 'cfp-platform-documents',
                                            fileName: term.rce_file_name || `${term.policy_number}_RCE.pdf`,
                                            policyId: term.policy_id,
                                        })
                                    }
                                >
                                    <Eye size={12} />
                                    <span>Preview PDF</span>
                                </button>
                            )}
                        </div>
                    )}

                    {status === 'available' && (
                        <>
                            {/* Replacement Cost & Carrier / Provider */}
                            <div className={styles.formRow2}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>
                                        Replacement Cost ($) *
                                    </label>
                                    <div className={styles.inputWrapper}>
                                        <DollarSign size={15} className={styles.inputIcon} />
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. 625183"
                                            value={replacementCost}
                                            onChange={e => handleCostChange(e.target.value)}
                                            className={`${styles.textInput} ${styles.hasIcon}`}
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>
                                        Valuation Provider
                                    </label>
                                    <div className={styles.inputWrapper}>
                                        <select
                                            value={carrier}
                                            onChange={e => setCarrier(e.target.value)}
                                            className={styles.selectInput}
                                        >
                                            {VALUATION_PROVIDERS.map(p => (
                                                <option key={p} value={p}>
                                                    {p}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Square Feet & Cost per Sq Ft */}
                            <div className={styles.formRow2}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>
                                        Living Area (Sq Ft)
                                    </label>
                                    <div className={styles.inputWrapper}>
                                        <Home size={15} className={styles.inputIcon} />
                                        <input
                                            type="text"
                                            placeholder="e.g. 2375"
                                            value={sqFeet}
                                            onChange={e => handleSqftChange(e.target.value)}
                                            className={`${styles.textInput} ${styles.hasIcon}`}
                                        />
                                    </div>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>
                                        Cost / Sq Ft ($/sqft)
                                    </label>
                                    <div className={styles.inputWrapper}>
                                        <Calculator size={15} className={styles.inputIcon} />
                                        <input
                                            type="text"
                                            placeholder="Auto-calculated or manual"
                                            value={costPerSqft}
                                            onChange={e => setCostPerSqft(e.target.value)}
                                            className={`${styles.textInput} ${styles.hasIcon}`}
                                        />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Remarks / Notes */}
                    <div className={styles.formGroup}>
                        <label className={styles.formLabel}>
                            {status === 'unavailable'
                                ? 'Decline / Ineligibility Reason (from carrier portals)'
                                : 'Remarks / Notes (Optional)'}
                        </label>
                        <textarea
                            placeholder={status === 'unavailable'
                                ? 'e.g. Moratorium in area, snow accumulation weight risk, brush score too high...'
                                : 'e.g. Grade: Above Average, 1991 build, 3 bed / 3 bath...'}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className={styles.textareaInput}
                            rows={status === 'unavailable' ? 3 : 2}
                        />
                    </div>

                    {/* Footer */}
                    <div className={styles.modalFooter}>
                        <div className={styles.footerLeft}>
                            {term.rce_replacement_cost || term.rce_carrier === 'Unavailable' ? (
                                <button
                                    type="button"
                                    className={styles.clearBtn}
                                    onClick={handleClear}
                                    disabled={clearing || saving}
                                >
                                    {clearing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                    <span>Remove Valuation</span>
                                </button>
                            ) : null}
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
                                disabled={saving || clearing || !replacementCost.trim()}
                            >
                                {saving ? (
                                    <>
                                        <Loader2 size={13} className="animate-spin" />
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <Check size={13} />
                                        <span>Save Valuation</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
