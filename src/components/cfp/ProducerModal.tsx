'use client';

import React, { useState, useEffect } from 'react';
import { User, Check, X, Clock, History, AlertCircle, Sparkles } from 'lucide-react';
import styles from './ProducerModal.module.scss';
import type { ProducerAuditEntry } from '@/app/api/cfp-summary/producer/route';

interface ProducerModalProps {
    isOpen: boolean;
    onClose: () => void;
    policyId: string;
    policyNumber: string;
    insuredName: string;
    currentProducer: string | null;
    initialHistory?: ProducerAuditEntry[];
    onProducerUpdated: (newProducer: string, history: ProducerAuditEntry[]) => void;
}

const COMMON_PRODUCERS = [
    'John Alsop',
    'MISTY TORREZ',
    'Danielle Self',
    'Sylvia Duran',
    'Roxana Topete',
    'John Dizon',
    'gilda aquino',
    'SUZANNE YNIGUEZ',
    'Giselle Ramos',
    'Maila Castro',
    'Esmeralda Cervantes',
    'Jose Huerta',
    'Denice Santos',
    'Jerome Delfin',
    'Eric Alsop',
];

export function ProducerModal({
    isOpen,
    onClose,
    policyId,
    policyNumber,
    insuredName,
    currentProducer,
    initialHistory = [],
    onProducerUpdated,
}: ProducerModalProps) {
    const [selectedProducer, setSelectedProducer] = useState<string>(currentProducer || '');
    const [customProducer, setCustomProducer] = useState<string>('');
    const [isCustom, setIsCustom] = useState<boolean>(false);
    const [changeNote, setChangeNote] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [history, setHistory] = useState<ProducerAuditEntry[]>(initialHistory);

    useEffect(() => {
        if (isOpen) {
            const current = currentProducer || '';
            setSelectedProducer(current);
            const isMatch = COMMON_PRODUCERS.some(p => p.toLowerCase() === current.toLowerCase());
            if (current && !isMatch) {
                setIsCustom(true);
                setCustomProducer(current);
            } else {
                setIsCustom(false);
                setCustomProducer('');
            }
            setChangeNote('');
            setErrorMsg(null);
            setHistory(initialHistory || []);
        }
    }, [isOpen, currentProducer, initialHistory]);

    if (!isOpen) return null;

    const handleSave = async () => {
        const finalProducer = isCustom ? customProducer.trim() : selectedProducer.trim();
        setSaving(true);
        setErrorMsg(null);

        try {
            const res = await fetch('/api/cfp-summary/producer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    policy_id: policyId,
                    producer_name: finalProducer,
                    previous_producer: currentProducer,
                    note: changeNote,
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to update producer');
            }

            onProducerUpdated(finalProducer, data.history || []);
            onClose();
        } catch (err: any) {
            setErrorMsg(err?.message || 'Error updating producer');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.modalHeader}>
                    <div className={styles.titleGroup}>
                        <div className={styles.headerIcon}>
                            <User size={18} />
                        </div>
                        <div>
                            <h3>Assign / Change Producer</h3>
                            <p>
                                <strong>{policyNumber}</strong> • {insuredName}
                            </p>
                        </div>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className={styles.modalBody}>
                    {errorMsg && (
                        <div className={styles.errorAlert}>
                            <AlertCircle size={15} />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    <div className={styles.formGroup}>
                        <label className={styles.fieldLabel}>Select Producer / Agent</label>
                        {!isCustom ? (
                            <select
                                className={styles.selectInput}
                                value={selectedProducer}
                                onChange={(e) => {
                                    if (e.target.value === '__custom__') {
                                        setIsCustom(true);
                                        setCustomProducer('');
                                    } else {
                                        setSelectedProducer(e.target.value);
                                    }
                                }}
                            >
                                <option value="">— Unassigned (Blank) —</option>
                                {COMMON_PRODUCERS.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                                <option value="__custom__">+ Enter Custom Producer Name...</option>
                            </select>
                        ) : (
                            <div className={styles.customInputGroup}>
                                <input
                                    type="text"
                                    className={styles.textInput}
                                    placeholder="Enter full producer name..."
                                    value={customProducer}
                                    onChange={(e) => setCustomProducer(e.target.value)}
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    className={styles.btnSecondary}
                                    onClick={() => {
                                        setIsCustom(false);
                                        setSelectedProducer(currentProducer || '');
                                    }}
                                >
                                    Select from list
                                </button>
                            </div>
                        )}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.fieldLabel}>Reassignment Reason / Note (Optional)</label>
                        <input
                            type="text"
                            className={styles.textInput}
                            placeholder="e.g. Reassigned to local branch, client transfer, etc."
                            value={changeNote}
                            onChange={(e) => setChangeNote(e.target.value)}
                        />
                    </div>

                    {/* Change & Audit History Trail */}
                    <div className={styles.historySection}>
                        <div className={styles.historyHeader}>
                            <History size={14} color="#64748b" />
                            <span>Producer Assignment History</span>
                        </div>

                        {history && history.length > 0 ? (
                            <div className={styles.historyTimeline}>
                                {history.map((entry, idx) => (
                                    <div key={idx} className={styles.timelineItem}>
                                        <div className={styles.timelineDot} />
                                        <div className={styles.timelineContent}>
                                            <div className={styles.timelineTitle}>
                                                <span className={styles.producerNew}>
                                                    {entry.new_producer || '(Unassigned)'}
                                                </span>
                                                {entry.previous_producer && (
                                                    <span className={styles.producerPrev}>
                                                        from {entry.previous_producer}
                                                    </span>
                                                )}
                                            </div>
                                            <div className={styles.timelineMeta}>
                                                <span>Changed by <strong>{entry.changed_by}</strong></span>
                                                <span>•</span>
                                                <span>{new Date(entry.changed_at).toLocaleString()}</span>
                                            </div>
                                            {entry.note && (
                                                <div className={styles.timelineNote}>"{entry.note}"</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className={styles.emptyHistory}>
                                <Clock size={13} />
                                <span>
                                    {currentProducer
                                        ? `Original baseline: ${currentProducer} (standard sheet)`
                                        : 'No previous manual changes recorded.'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className={styles.modalFooter}>
                    <button type="button" className={styles.btnCancel} onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className={styles.btnSave}
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save Producer'}
                    </button>
                </div>
            </div>
        </div>
    );
}
