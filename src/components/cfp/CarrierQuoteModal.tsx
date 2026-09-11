'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    FileText,
    Check,
    CheckCircle2,
    AlertCircle,
    X,
    Copy,
    Loader2,
    ShieldCheck,
    Trash2,
    Upload,
    ExternalLink,
    Ban,
    DollarSign,
} from 'lucide-react';
import type { CFPTermRow, CarrierKey, CarrierQuoteData, CoverageQuoteType } from '@/app/api/cfp-summary/route';
import styles from './CarrierQuoteModal.module.scss';
import { supabase } from '@/lib/supabaseClient';

const CARRIER_NAMES: Record<CarrierKey, string> = {
    bamboo: 'Bamboo Insurance',
    aegis: 'Aegis Security / General',
    am: 'American Modern (AM)',
    sagesure: 'SageSure Insurance',
    psic: 'Pacific Specialty (PSIC)',
};

interface CarrierQuoteModalProps {
    term: CFPTermRow;
    carrierKey: CarrierKey;
    onClose: () => void;
    onSaveSuccess: (policyId: string, carrierKey: CarrierKey, updatedData: CarrierQuoteData | null) => void;
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

export function CarrierQuoteModal({
    term,
    carrierKey,
    onClose,
    onSaveSuccess,
    onPreviewDoc,
}: CarrierQuoteModalProps) {
    const existing = term.carrier_quotes?.[carrierKey];

    const [coverageType, setCoverageType] = useState<CoverageQuoteType>(
        existing?.coverage_type || 'DIC'
    );
    const [quoteNumber, setQuoteNumber] = useState<string>(existing?.quote_number || '');
    const [premium, setPremium] = useState<string>(
        existing?.premium ? String(existing.premium) : ''
    );
    const [notes, setNotes] = useState<string>(existing?.notes || '');
    const [saving, setSaving] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [copiedInsured, setCopiedInsured] = useState(false);
    const [copiedAddress, setCopiedAddress] = useState(false);
    const [copiedQuoteNum, setCopiedQuoteNum] = useState(false);

    const carrierName = CARRIER_NAMES[carrierKey] || carrierKey.toUpperCase();

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleCopy = (text: string, type: 'insured' | 'address' | 'quoteNum') => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        if (type === 'insured') {
            setCopiedInsured(true);
            setTimeout(() => setCopiedInsured(false), 1500);
        } else if (type === 'address') {
            setCopiedAddress(true);
            setTimeout(() => setCopiedAddress(false), 1500);
        } else {
            setCopiedQuoteNum(true);
            setTimeout(() => setCopiedQuoteNum(false), 1500);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSaving(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch('/api/cfp-summary/carrier-quote', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    policy_id: term.policy_id,
                    carrier_key: carrierKey,
                    coverage_type: coverageType,
                    quote_number: quoteNumber.trim(),
                    premium: premium ? parseFloat(premium) : null,
                    notes: notes.slice(0, 500).trim(),
                    storage_path: existing?.storage_path || null,
                    file_name: existing?.file_name || null,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to save carrier quote');
            }

            onSaveSuccess(term.policy_id, carrierKey, data.carrier_quote);
            onClose();
        } catch (err: any) {
            setError(err.message || 'An error occurred while saving quote');
        } finally {
            setSaving(false);
        }
    };

    const handleClear = async () => {
        if (!confirm(`Are you sure you want to remove the ${carrierName} quote for this policy?`)) {
            return;
        }

        setError(null);
        setClearing(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch(
                `/api/cfp-summary/carrier-quote?policy_id=${term.policy_id}&carrier_key=${carrierKey}`,
                {
                    method: 'DELETE',
                    headers: {
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                }
            );

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to clear carrier quote');
            }

            onSaveSuccess(term.policy_id, carrierKey, null);
            onClose();
        } catch (err: any) {
            setError(err.message || 'An error occurred while removing quote');
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
                            <span className={`${styles.carrierBadgeTag} ${styles[carrierKey]}`}>
                                {carrierKey.toUpperCase()}
                            </span>
                            <h3 className={styles.modalTitle}>{carrierName}</h3>
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
                                            title="Copy Property Address for Carrier Portal"
                                        >
                                            {copiedAddress ? <Check size={10} /> : <Copy size={10} />}
                                            <span>{copiedAddress ? 'Copied' : 'Copy'}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Coverage Type Selector */}
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Coverage & Quote Option</label>
                            <div className={styles.coverageGrid}>
                                <div
                                    className={`${styles.coverageCard} ${styles.dic} ${coverageType === 'DIC' ? styles.active : ''}`}
                                    onClick={() => setCoverageType('DIC')}
                                >
                                    <span className={styles.cardTitle}>🔵 DIC</span>
                                    <span className={styles.cardSubtitle}>Companion to CFP</span>
                                </div>

                                <div
                                    className={`${styles.coverageCard} ${styles.full} ${coverageType === 'FULL' ? styles.active : ''}`}
                                    onClick={() => setCoverageType('FULL')}
                                >
                                    <span className={styles.cardTitle}>🟢 FULL</span>
                                    <span className={styles.cardSubtitle}>Standalone / E&S</span>
                                </div>

                                <div
                                    className={`${styles.coverageCard} ${styles.quote} ${coverageType === 'QUOTE' ? styles.active : ''}`}
                                    onClick={() => setCoverageType('QUOTE')}
                                >
                                    <span className={styles.cardTitle}>🟣 Quote</span>
                                    <span className={styles.cardSubtitle}>Standard / General</span>
                                </div>

                                <div
                                    className={`${styles.coverageCard} ${styles.unavailable} ${coverageType === 'UNAVAILABLE' ? styles.active : ''}`}
                                    onClick={() => setCoverageType('UNAVAILABLE')}
                                >
                                    <span className={styles.cardTitle}>🔴 Unable</span>
                                    <span className={styles.cardSubtitle}>✕ No Option</span>
                                </div>
                            </div>
                        </div>

                        {/* If Quoted (DIC or FULL): Show Quote # and Premium */}
                        {coverageType !== 'UNAVAILABLE' && (
                            <div className={styles.inputRow}>
                                <div className={styles.formGroup}>
                                    <div className={styles.formLabelRow}>
                                        <label className={styles.formLabel} htmlFor="carrier_quote_num_input">
                                            Quote Number
                                        </label>
                                    </div>
                                    <div className={styles.inputFieldWrapper}>
                                        <input
                                            id="carrier_quote_num_input"
                                            type="text"
                                            className={`${styles.inputField} ${quoteNumber ? styles.inputFieldWithAction : ''}`}
                                            placeholder="e.g. Q1002897503"
                                            value={quoteNumber}
                                            onChange={e => setQuoteNumber(e.target.value)}
                                            autoFocus
                                        />
                                        {quoteNumber && (
                                            <button
                                                type="button"
                                                className={`${styles.inputActionBtn} ${copiedQuoteNum ? styles.copied : ''}`}
                                                onClick={() => handleCopy(quoteNumber, 'quoteNum')}
                                                title="Copy Quote Number"
                                            >
                                                {copiedQuoteNum ? <Check size={10} /> : <Copy size={10} />}
                                                <span>{copiedQuoteNum ? 'Copied' : 'Copy'}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel} htmlFor="carrier_premium_input">
                                        Annual Premium ($)
                                    </label>
                                    <input
                                        id="carrier_premium_input"
                                        type="number"
                                        step="0.01"
                                        className={styles.inputField}
                                        placeholder="e.g. 1420.00"
                                        value={premium}
                                        onChange={e => setPremium(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Underwriting Remarks / Decline Reason Notes */}
                        <div className={styles.formGroup}>
                            <div className={styles.formLabelRow}>
                                <label className={styles.formLabel} htmlFor="carrier_notes_input">
                                    {coverageType === 'UNAVAILABLE'
                                        ? 'Decline / Ineligibility Reason (from carrier portal)'
                                        : 'Underwriting Remarks / Notes (Optional)'}
                                </label>
                                <span className={styles.charCount}>{notes.length}/500</span>
                            </div>
                            <textarea
                                id="carrier_notes_input"
                                className={styles.textareaField}
                                maxLength={500}
                                placeholder={
                                    coverageType === 'UNAVAILABLE'
                                        ? 'e.g. Brush score 92 exceeds guidelines; carrier has no option for Full or DIC'
                                        : 'e.g. Quoted HO-3 surplus lines with $2,500 deductible'
                                }
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                            />
                        </div>

                        {/* Attached Document Reference or Upload Shortcut */}
                        {existing?.storage_path ? (
                            <div className={styles.docAttachmentBox}>
                                <div className={styles.docAttachmentInfo}>
                                    <FileText size={15} style={{ color: 'var(--color-primary)' }} />
                                    <span>{existing.file_name || 'Attached Quote Document'}</span>
                                </div>
                                <button
                                    type="button"
                                    className={styles.docActionBtn}
                                    onClick={() => {
                                        onClose();
                                        onPreviewDoc?.({
                                            title: `${carrierName} Quote Document — ${term.policy_number}`,
                                            subtitle: term.named_insured || undefined,
                                            docType: coverageType === 'FULL' ? 'quote' : 'dic',
                                            storagePath: existing.storage_path,
                                            bucket: 'cfp-platform-documents',
                                            fileName: existing.file_name || `${carrierKey}_Quote.pdf`,
                                            policyId: term.policy_id,
                                        });
                                    }}
                                >
                                    <ExternalLink size={12} /> Preview PDF
                                </button>
                            </div>
                        ) : (
                            <div className={styles.docAttachmentBox}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                    No PDF file uploaded for this carrier quote yet.
                                </span>
                                <Link
                                    href={`/upload-document?policy_id=${term.policy_id}&doc_type=${coverageType === 'FULL' ? 'es_doc' : 'dic'}`}
                                    className={styles.docActionBtn}
                                    target="_blank"
                                >
                                    <Upload size={12} /> Upload PDF
                                </Link>
                            </div>
                        )}

                        {/* Audit Meta */}
                        {existing?.verified_by && (
                            <div className={styles.auditMeta}>
                                <ShieldCheck size={14} />
                                <span>
                                    Last updated by <strong>{existing.verified_by}</strong>
                                    {existing.verified_at && (
                                        <> on {new Date(existing.verified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                                    )}
                                </span>
                            </div>
                        )}

                        {/* Error Message */}
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
                                    title="Reset carrier quote"
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
                                <span>Save Quote</span>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
