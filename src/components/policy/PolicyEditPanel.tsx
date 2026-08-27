'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, Save, Loader2, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import { updatePolicy, updatePolicyTerm, PolicyDetail } from '@/lib/api';
import { insertActivityEvent } from '@/lib/notes';
import { supabase } from '@/lib/supabaseClient';
import styles from './PolicyEditPanel.module.css';

interface PolicyEditPanelProps {
    policyDetail: PolicyDetail;
    onClose: () => void;
    onSaved: () => void;
}

function parseCurrency(value: string): number | null {
    const cleaned = value.replace(/[$,\s]/g, '');
    if (cleaned === '') return null;
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

export function PolicyEditPanel({ policyDetail, onClose, onSaved }: PolicyEditPanelProps) {
    const router = useRouter();
    const panelRef = useRef<HTMLDivElement>(null);

    // Policy header form
    const [policyForm, setPolicyForm] = useState({
        policy_number: policyDetail.policy_number || '',
        carrier_name: policyDetail.carrier_name || '',
        property_address_raw: policyDetail.property_address || '',
        status: policyDetail.status || '',
    });

    // Current term form
    const [termForm, setTermForm] = useState({
        effective_date: policyDetail.effective_date || '',
        expiration_date: policyDetail.expiration_date || '',
        annual_premium: policyDetail.annual_premium_raw != null ? String(policyDetail.annual_premium_raw) : '',
        policy_activity: policyDetail.policy_activity || '',
        carrier_status: policyDetail.carrier_status || '',
        payment_status: policyDetail.payment_status || '',
        payment_plan: policyDetail.payment_plan || '',
        cancellation_reason: policyDetail.cancellation_reason || '',
        dic_exists: policyDetail.dic_exists ?? false,
        dic_policy_number: policyDetail.dic_policy_number || '',
        dic_limit_dwelling: policyDetail.dic_limit_dwelling || '',
        dic_limit_other_structures: policyDetail.dic_limit_other_structures || '',
        dic_limit_personal_property: policyDetail.dic_limit_personal_property || '',
        dic_limit_loss_of_use: policyDetail.dic_limit_loss_of_use || '',
        dic_deductible: policyDetail.dic_deductible || '',
        dic_annual_premium_raw: policyDetail.dic_annual_premium_raw != null ? String(policyDetail.dic_annual_premium_raw) : '',
        sold_by: policyDetail.sold_by || '',
        office: policyDetail.office || '',
        is_current: policyDetail.is_current ?? true,
    });

    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const [dicError, setDicError] = useState(false);

    // ── Delete Policy state ──
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [deleteOrphanedClient, setDeleteOrphanedClient] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    // ── Dirty check ──
    const isDirty = useCallback(() => {
        if (policyForm.policy_number !== (policyDetail.policy_number || '')) return true;
        if (policyForm.carrier_name !== (policyDetail.carrier_name || '')) return true;
        if (policyForm.property_address_raw !== (policyDetail.property_address || '')) return true;
        if (policyForm.status !== (policyDetail.status || '')) return true;
        if (termForm.effective_date !== (policyDetail.effective_date || '')) return true;
        if (termForm.expiration_date !== (policyDetail.expiration_date || '')) return true;
        if (termForm.annual_premium !== (policyDetail.annual_premium_raw != null ? String(policyDetail.annual_premium_raw) : '')) return true;
        if (termForm.policy_activity !== (policyDetail.policy_activity || '')) return true;
        if (termForm.carrier_status !== (policyDetail.carrier_status || '')) return true;
        if (termForm.payment_status !== (policyDetail.payment_status || '')) return true;
        if (termForm.payment_plan !== (policyDetail.payment_plan || '')) return true;
        if (termForm.cancellation_reason !== (policyDetail.cancellation_reason || '')) return true;
        if (termForm.dic_exists !== (policyDetail.dic_exists ?? false)) return true;
        if (termForm.dic_policy_number !== (policyDetail.dic_policy_number || '')) return true;
        if (termForm.sold_by !== (policyDetail.sold_by || '')) return true;
        if (termForm.office !== (policyDetail.office || '')) return true;
        if (termForm.is_current !== (policyDetail.is_current ?? true)) return true;
        return false;
    }, [policyForm, termForm, policyDetail]);

    // ── Unsaved changes close handler ──
    const handleClose = useCallback(() => {
        if (isDirty()) {
            setShowUnsavedDialog(true);
        } else {
            onClose();
        }
    }, [isDirty, onClose]);

    // ── Escape key ──
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                handleClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleClose]);

    // ── Overlay click — only close if mousedown target IS the overlay ──
    const overlayMouseDownTarget = useRef<EventTarget | null>(null);
    const handleOverlayMouseDown = (e: React.MouseEvent) => {
        overlayMouseDownTarget.current = e.target;
    };
    const handleOverlayMouseUp = (e: React.MouseEvent) => {
        // Only close if mousedown AND mouseup both happened on the overlay itself
        if (overlayMouseDownTarget.current === e.currentTarget && e.target === e.currentTarget) {
            handleClose();
        }
        overlayMouseDownTarget.current = null;
    };

    // ── DIC validation ──
    useEffect(() => {
        if (termForm.dic_exists && !termForm.dic_policy_number.trim()) {
            setDicError(true);
        } else {
            setDicError(false);
        }
    }, [termForm.dic_exists, termForm.dic_policy_number]);

    // ── Save ──
    const handleSave = async () => {
        // DIC validation
        if (termForm.dic_exists && !termForm.dic_policy_number.trim()) {
            setMessage({ type: 'error', text: 'DIC policy number is required when DIC coverage is enabled.' });
            setDicError(true);
            return;
        }

        setSaving(true);
        setMessage(null);

        const policyChanges: Record<string, string> = {};
        const policyChangedFields: string[] = [];
        if (policyForm.policy_number !== (policyDetail.policy_number || '')) {
            policyChanges.policy_number = policyForm.policy_number;
            policyChangedFields.push('policy_number');
        }
        if (policyForm.carrier_name !== (policyDetail.carrier_name || '')) {
            policyChanges.carrier_name = policyForm.carrier_name;
            policyChangedFields.push('carrier_name');
        }
        if (policyForm.property_address_raw !== (policyDetail.property_address || '')) {
            policyChanges.property_address_raw = policyForm.property_address_raw;
            policyChangedFields.push('property_address');
        }
        if (policyForm.status !== (policyDetail.status || '')) {
            policyChanges.status = policyForm.status;
            policyChangedFields.push('status');
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const termChanges: Record<string, any> = {};
        const termChangedFields: string[] = [];

        if (termForm.effective_date !== (policyDetail.effective_date || '')) {
            if (termForm.effective_date && isNaN(Date.parse(termForm.effective_date))) {
                setMessage({ type: 'error', text: 'Invalid effective date format' });
                setSaving(false);
                return;
            }
            termChanges.effective_date = termForm.effective_date || null;
            termChangedFields.push('effective_date');
        }
        if (termForm.expiration_date !== (policyDetail.expiration_date || '')) {
            if (termForm.expiration_date && isNaN(Date.parse(termForm.expiration_date))) {
                setMessage({ type: 'error', text: 'Invalid expiration date format' });
                setSaving(false);
                return;
            }
            termChanges.expiration_date = termForm.expiration_date || null;
            termChangedFields.push('expiration_date');
        }

        const premiumRawStr = String(policyDetail.annual_premium_raw ?? '');
        if (termForm.annual_premium !== premiumRawStr) {
            if (termForm.annual_premium) {
                const parsed = parseCurrency(termForm.annual_premium);
                if (parsed === null) {
                    setMessage({ type: 'error', text: 'Invalid premium value. Enter a number like 1234.56 or $1,234.56' });
                    setSaving(false);
                    return;
                }
                termChanges.annual_premium = parsed;
            } else {
                termChanges.annual_premium = null;
            }
            termChangedFields.push('annual_premium');
        }

        if (termForm.policy_activity !== (policyDetail.policy_activity || '')) {
            termChanges.policy_activity = termForm.policy_activity || null;
            termChangedFields.push('policy_activity');
        }
        if (termForm.carrier_status !== (policyDetail.carrier_status || '')) {
            termChanges.carrier_status = termForm.carrier_status || null;
            termChangedFields.push('carrier_status');
        }
        if (termForm.payment_status !== (policyDetail.payment_status || '')) {
            termChanges.payment_status = termForm.payment_status || null;
            termChangedFields.push('payment_status');
        }
        if (termForm.payment_plan !== (policyDetail.payment_plan || '')) {
            termChanges.payment_plan = termForm.payment_plan || null;
            termChangedFields.push('payment_plan');
        }
        if (termForm.cancellation_reason !== (policyDetail.cancellation_reason || '')) {
            termChanges.cancellation_reason = termForm.cancellation_reason || null;
            termChangedFields.push('cancellation_reason');
        }
        if (termForm.dic_exists !== (policyDetail.dic_exists ?? false)) {
            termChanges.dic_exists = termForm.dic_exists;
            termChangedFields.push('dic_exists');
        }
        if (termForm.dic_policy_number !== (policyDetail.dic_policy_number || '')) {
            termChanges.dic_policy_number = termForm.dic_policy_number || null;
            termChangedFields.push('dic_policy_number');
        }
        // DIC coverage fields
        if (termForm.dic_limit_dwelling !== (policyDetail.dic_limit_dwelling || '')) {
            termChanges.dic_limit_dwelling = termForm.dic_limit_dwelling || null;
            termChangedFields.push('dic_limit_dwelling');
        }
        if (termForm.dic_limit_other_structures !== (policyDetail.dic_limit_other_structures || '')) {
            termChanges.dic_limit_other_structures = termForm.dic_limit_other_structures || null;
            termChangedFields.push('dic_limit_other_structures');
        }
        if (termForm.dic_limit_personal_property !== (policyDetail.dic_limit_personal_property || '')) {
            termChanges.dic_limit_personal_property = termForm.dic_limit_personal_property || null;
            termChangedFields.push('dic_limit_personal_property');
        }
        if (termForm.dic_limit_loss_of_use !== (policyDetail.dic_limit_loss_of_use || '')) {
            termChanges.dic_limit_loss_of_use = termForm.dic_limit_loss_of_use || null;
            termChangedFields.push('dic_limit_loss_of_use');
        }
        if (termForm.dic_deductible !== (policyDetail.dic_deductible || '')) {
            termChanges.dic_deductible = termForm.dic_deductible || null;
            termChangedFields.push('dic_deductible');
        }
        const dicPremiumRaw = policyDetail.dic_annual_premium_raw != null ? String(policyDetail.dic_annual_premium_raw) : '';
        if (termForm.dic_annual_premium_raw !== dicPremiumRaw) {
            const parsed = parseCurrency(termForm.dic_annual_premium_raw);
            termChanges.dic_annual_premium_raw = parsed;
            termChangedFields.push('dic_annual_premium_raw');
        }
        if (termForm.sold_by !== (policyDetail.sold_by || '')) {
            termChanges.sold_by = termForm.sold_by || null;
            termChangedFields.push('sold_by');
        }
        if (termForm.office !== (policyDetail.office || '')) {
            termChanges.office = termForm.office || null;
            termChangedFields.push('office');
        }
        if (termForm.is_current !== (policyDetail.is_current ?? true)) {
            termChanges.is_current = termForm.is_current;
            termChangedFields.push('is_current');
        }

        if (policyChangedFields.length === 0 && termChangedFields.length === 0) {
            onClose();
            return;
        }

        if (policyChangedFields.length > 0) {
            const result = await updatePolicy(policyDetail.id, policyChanges);
            if (!result.success) {
                setMessage({ type: 'error', text: `Policy save failed: ${result.error}` });
                setSaving(false);
                return;
            }
            await insertActivityEvent({
                event_type: 'policy.updated',
                title: 'Policy updated',
                detail: `Updated: ${policyChangedFields.join(', ')}`,
                policy_id: policyDetail.id,
                client_id: policyDetail.client_id,
                meta: { changed_fields: policyChangedFields },
            });
        }

        if (termChangedFields.length > 0 && policyDetail.policy_term_id) {
            const result = await updatePolicyTerm(policyDetail.policy_term_id, termChanges);
            if (!result.success) {
                setMessage({ type: 'error', text: `Term save failed: ${result.error}` });
                setSaving(false);
                return;
            }
            await insertActivityEvent({
                event_type: 'policy_term.updated',
                title: 'Policy term updated',
                detail: `Updated: ${termChangedFields.join(', ')}`,
                policy_id: policyDetail.id,
                client_id: policyDetail.client_id,
                meta: { changed_fields: termChangedFields },
            });
        }

        setSaving(false);
        setMessage({ type: 'success', text: 'Saved successfully' });
        setTimeout(() => {
            onSaved();
        }, 600);
    };

    return (
        <div
            className={styles.overlay}
            onMouseDown={handleOverlayMouseDown}
            onMouseUp={handleOverlayMouseUp}
        >
            <div className={styles.panel} ref={panelRef} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.panelHeader}>
                    <h2 className={styles.panelTitle}>Edit Policy</h2>
                    <button className={styles.closeBtn} onClick={handleClose}><X size={20} /></button>
                </div>

                {/* Toast */}
                {message && (
                    <div className={message.type === 'success' ? styles.toastSuccess : styles.toastError}>
                        {message.type === 'success' && <CheckCircle size={16} />}
                        {message.type === 'error' && <AlertTriangle size={16} />}
                        {message.text}
                    </div>
                )}

                <div className={styles.scrollBody}>
                    {/* POLICY HEADER SECTION */}
                    <div className={styles.section}>
                        <div className={styles.sectionTitle}>
                            Policy Header
                            <span className={styles.sectionDivider} />
                        </div>

                        <div className={styles.fieldGroup}>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel}>Policy Number</label>
                                <input
                                    className={styles.fieldInput}
                                    value={policyForm.policy_number}
                                    onChange={(e) => setPolicyForm(f => ({ ...f, policy_number: e.target.value }))}
                                />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel}>Carrier Name</label>
                                <input
                                    className={styles.fieldInput}
                                    value={policyForm.carrier_name}
                                    onChange={(e) => setPolicyForm(f => ({ ...f, carrier_name: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className={styles.fieldGroupFull}>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel}>Property Address</label>
                                <input
                                    className={styles.fieldInput}
                                    value={policyForm.property_address_raw}
                                    onChange={(e) => setPolicyForm(f => ({ ...f, property_address_raw: e.target.value }))}
                                    placeholder="e.g. 1742 HAPPY TRL, TOPANGA, CA 90290"
                                />
                            </div>
                        </div>
                        <div className={styles.fieldGroupFull}>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel}>Status</label>
                                <select
                                    className={styles.fieldSelect}
                                    value={policyForm.status}
                                    onChange={(e) => setPolicyForm(f => ({ ...f, status: e.target.value }))}
                                >
                                    <option value="active">Active</option>
                                    <option value="pending_review">Pending Review</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="reviewed">Reviewed</option>
                                    <option value="unknown">Unknown</option>
                                    <option value="cancelled">Cancelled</option>
                                    <option value="expired">Expired</option>
                                    <option value="non_renewed">Non-Renewed</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* CURRENT TERM SECTION */}
                    {policyDetail.policy_term_id ? (
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>
                                Current Term
                                <span className={styles.sectionDivider} />
                            </div>

                            {/* Dates & Premium */}
                            <div className={styles.groupCard}>
                                <div className={styles.groupLabel}>Dates & Premium</div>
                                <div className={styles.fieldGroup}>
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Effective Date</label>
                                        <input
                                            type="date"
                                            className={styles.fieldInput}
                                            value={termForm.effective_date}
                                            onChange={(e) => setTermForm(f => ({ ...f, effective_date: e.target.value }))}
                                        />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Expiration Date</label>
                                        <input
                                            type="date"
                                            className={styles.fieldInput}
                                            value={termForm.expiration_date}
                                            onChange={(e) => setTermForm(f => ({ ...f, expiration_date: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className={styles.fieldGroup}>
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Annual Premium</label>
                                        <input
                                            className={styles.fieldInput}
                                            value={termForm.annual_premium}
                                            onChange={(e) => setTermForm(f => ({ ...f, annual_premium: e.target.value }))}
                                            placeholder="e.g. 1234.56 or $1,234.56"
                                        />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Policy Activity</label>
                                        <select
                                            className={styles.fieldSelect}
                                            value={termForm.policy_activity}
                                            onChange={(e) => setTermForm(f => ({ ...f, policy_activity: e.target.value }))}
                                        >
                                            <option value="">— Select —</option>
                                            <option value="Active">Active</option>
                                            <option value="Cancelled">Cancelled</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Status & Billing */}
                            <div className={styles.groupCard}>
                                <div className={styles.groupLabel}>Status & Billing</div>
                                <div className={styles.fieldGroup}>
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Carrier Status</label>
                                        <select
                                            className={styles.fieldSelect}
                                            value={termForm.carrier_status}
                                            onChange={(e) => setTermForm(f => ({ ...f, carrier_status: e.target.value }))}
                                        >
                                            <option value="">— Select —</option>
                                            <option value="InForce">InForce</option>
                                            <option value="Cancelled">Cancelled</option>
                                        </select>
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Payment Status</label>
                                        <select
                                            className={styles.fieldSelect}
                                            value={termForm.payment_status}
                                            onChange={(e) => setTermForm(f => ({ ...f, payment_status: e.target.value }))}
                                        >
                                            <option value="">— Select —</option>
                                            <option value="Paid in full">Paid in full</option>
                                            <option value="11-pay">11-pay</option>
                                            <option value="3-pay">3-pay</option>
                                        </select>
                                    </div>
                                </div>
                                <div className={styles.fieldGroup}>
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Payment Plan</label>
                                        <select
                                            className={styles.fieldSelect}
                                            value={termForm.payment_plan}
                                            onChange={(e) => setTermForm(f => ({ ...f, payment_plan: e.target.value }))}
                                        >
                                            <option value="">— Select —</option>
                                            <option value="3 Pay">3 Pay</option>
                                            <option value="11 Pay">11 Pay</option>
                                        </select>
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Cancellation Reason</label>
                                        <select
                                            className={styles.fieldSelect}
                                            value={termForm.cancellation_reason}
                                            onChange={(e) => setTermForm(f => ({ ...f, cancellation_reason: e.target.value }))}
                                        >
                                            <option value="">— Select —</option>
                                            <option value="Non-Pay">Non-Pay</option>
                                            <option value="Property Sold">Property Sold</option>
                                            <option value="Insured Elsewhere">Insured Elsewhere</option>
                                            <option value="Rewritten">Rewritten</option>
                                            <option value="Insured's Request">Insured's Request</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Agency & Assignment */}
                            <div className={styles.groupCard}>
                                <div className={styles.groupLabel}>Agency & Assignment</div>
                                <div className={styles.fieldGroup}>
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Sold By</label>
                                        <input
                                            className={styles.fieldInput}
                                            value={termForm.sold_by}
                                            onChange={(e) => setTermForm(f => ({ ...f, sold_by: e.target.value }))}
                                        />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Office</label>
                                        <select
                                            className={styles.fieldSelect}
                                            value={termForm.office}
                                            onChange={(e) => setTermForm(f => ({ ...f, office: e.target.value }))}
                                        >
                                            <option value="">— Select —</option>
                                            <option value="Rancho">Rancho</option>
                                            <option value="Montebello">Montebello</option>
                                            <option value="Chino">Chino</option>
                                            <option value="Montclair">Montclair</option>
                                            <option value="Rancho/AV">Rancho/AV</option>
                                            <option value="Claremont">Claremont</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* DIC & Toggles */}
                            <div className={styles.groupCard}>
                                <div className={styles.groupLabel}>DIC Coverage & Term</div>
                                <div className={styles.toggle}>
                                    <button
                                        type="button"
                                        className={styles.toggleSwitch}
                                        data-active={termForm.dic_exists}
                                        onClick={() => setTermForm(f => ({ ...f, dic_exists: !f.dic_exists }))}
                                    >
                                        <span className={styles.toggleKnob} />
                                    </button>
                                    <span className={styles.toggleLabel}>DIC Coverage Exists</span>
                                </div>

                                {termForm.dic_exists && (
                                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <div className={styles.field}>
                                            <label className={`${styles.fieldLabel} ${dicError ? styles.fieldLabelError : ''}`}>
                                                DIC Policy Number {dicError && <span className={styles.requiredBadge}>Required</span>}
                                            </label>
                                            <input
                                                className={`${styles.fieldInput} ${dicError ? styles.fieldInputError : ''}`}
                                                value={termForm.dic_policy_number}
                                                onChange={(e) => setTermForm(f => ({ ...f, dic_policy_number: e.target.value }))}
                                                placeholder="Enter associated DIC policy number"
                                            />
                                        </div>

                                        <div className={styles.groupLabel} style={{ fontSize: '0.7rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>DIC Coverage Limits</div>
                                        <div className={styles.row}>
                                            <div className={styles.field}>
                                                <label className={styles.fieldLabel}>DIC Dwelling</label>
                                                <input className={styles.fieldInput} value={termForm.dic_limit_dwelling} onChange={(e) => setTermForm(f => ({ ...f, dic_limit_dwelling: e.target.value }))} placeholder="$0" />
                                            </div>
                                            <div className={styles.field}>
                                                <label className={styles.fieldLabel}>DIC Other Structures</label>
                                                <input className={styles.fieldInput} value={termForm.dic_limit_other_structures} onChange={(e) => setTermForm(f => ({ ...f, dic_limit_other_structures: e.target.value }))} placeholder="$0" />
                                            </div>
                                        </div>
                                        <div className={styles.row}>
                                            <div className={styles.field}>
                                                <label className={styles.fieldLabel}>DIC Personal Property</label>
                                                <input className={styles.fieldInput} value={termForm.dic_limit_personal_property} onChange={(e) => setTermForm(f => ({ ...f, dic_limit_personal_property: e.target.value }))} placeholder="$0" />
                                            </div>
                                            <div className={styles.field}>
                                                <label className={styles.fieldLabel}>DIC Loss of Use</label>
                                                <input className={styles.fieldInput} value={termForm.dic_limit_loss_of_use} onChange={(e) => setTermForm(f => ({ ...f, dic_limit_loss_of_use: e.target.value }))} placeholder="$0" />
                                            </div>
                                        </div>
                                        <div className={styles.row}>
                                            <div className={styles.field}>
                                                <label className={styles.fieldLabel}>DIC Deductible</label>
                                                <input className={styles.fieldInput} value={termForm.dic_deductible} onChange={(e) => setTermForm(f => ({ ...f, dic_deductible: e.target.value }))} placeholder="$0" />
                                            </div>
                                            <div className={styles.field}>
                                                <label className={styles.fieldLabel}>DIC Annual Premium</label>
                                                <input className={styles.fieldInput} value={termForm.dic_annual_premium_raw} onChange={(e) => setTermForm(f => ({ ...f, dic_annual_premium_raw: e.target.value }))} placeholder="$0" />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className={styles.toggle} style={{ marginTop: '0.75rem' }}>
                                    <button
                                        type="button"
                                        className={styles.toggleSwitch}
                                        data-active={termForm.is_current}
                                        onClick={() => setTermForm(f => ({ ...f, is_current: !f.is_current }))}
                                    >
                                        <span className={styles.toggleKnob} />
                                    </button>
                                    <span className={styles.toggleLabel}>Is Current Term</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>
                                Current Term
                                <span className={styles.sectionDivider} />
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                No current term found for this policy. Term data will be available once a declaration or CSV import is processed.
                            </p>
                        </div>
                    )}
                </div>

                {/* ── Danger Zone ── */}
                <div className={styles.section} style={{ borderTop: '1px solid var(--semantic-error, #ef4444)', marginTop: '1.5rem', paddingTop: '1.5rem' }}>
                    <div className={styles.sectionTitle} style={{ color: 'var(--semantic-error, #ef4444)' }}>
                        <Trash2 size={14} /> Danger Zone
                        <span className={styles.sectionDivider} />
                    </div>
                    <p style={{ color: 'var(--text-mid)', fontSize: '0.82rem', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                        Permanently delete this policy and all associated data (dec pages, flags, enrichments, reports, documents, notes, activity). This action <strong>cannot be undone</strong>.
                    </p>
                    <button
                        type="button"
                        onClick={() => setShowDeleteDialog(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.5rem 1rem', borderRadius: '7px', fontSize: '0.82rem', fontWeight: 600,
                            background: 'rgba(239, 68, 68, 0.1)', color: 'var(--semantic-error, #ef4444)',
                            border: '1px solid rgba(239, 68, 68, 0.3)', cursor: 'pointer',
                        }}
                    >
                        <Trash2 size={14} />
                        Delete This Policy
                    </button>
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || dicError}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleClose} disabled={saving}>
                        Cancel
                    </Button>
                </div>
            </div>

            {/* Unsaved Changes Dialog */}
            {showUnsavedDialog && (
                <div className={styles.confirmOverlay} onClick={() => setShowUnsavedDialog(false)}>
                    <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
                        <AlertTriangle size={24} style={{ color: '#f59e0b' }} />
                        <h3 className={styles.confirmTitle}>Unsaved Changes</h3>
                        <p className={styles.confirmText}>You have unsaved changes. What would you like to do?</p>
                        <div className={styles.confirmActions}>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                    setShowUnsavedDialog(false);
                                    handleSave();
                                }}
                            >
                                <Save size={14} className="mr-1.5" />
                                Save Changes
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setShowUnsavedDialog(false);
                                    onClose();
                                }}
                                style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                            >
                                Discard
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setShowUnsavedDialog(false)}>
                                Keep Editing
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Policy Confirmation Dialog */}
            {showDeleteDialog && (
                <div className={styles.confirmOverlay} onClick={() => { if (!deleting) setShowDeleteDialog(false); }}>
                    <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <Trash2 size={28} style={{ color: '#ef4444' }} />
                        <h3 className={styles.confirmTitle} style={{ color: '#ef4444' }}>Delete Policy Permanently</h3>
                        <p className={styles.confirmText}>
                            You are about to permanently delete policy <strong>{policyDetail.policy_number}</strong> and all associated data including dec pages, flags, enrichments, reports, uploaded documents, notes, and activity logs.
                        </p>
                        <p className={styles.confirmText} style={{ fontWeight: 600 }}>
                            This action cannot be undone.
                        </p>

                        <div style={{ margin: '0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                type="checkbox"
                                id="delete-orphan-client"
                                checked={deleteOrphanedClient}
                                onChange={e => setDeleteOrphanedClient(e.target.checked)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <label htmlFor="delete-orphan-client" style={{ fontSize: '0.82rem', color: 'var(--text-mid)', cursor: 'pointer' }}>
                                Also delete the client record if it has no other policies
                            </label>
                        </div>

                        <div style={{ margin: '0.75rem 0' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-mid)', display: 'block', marginBottom: '0.3rem' }}>
                                Type <strong>DELETE</strong> to confirm:
                            </label>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)}
                                placeholder="DELETE"
                                disabled={deleting}
                                style={{
                                    width: '100%', padding: '0.5rem 0.75rem',
                                    background: 'var(--bg-surface-raised, #fff)',
                                    border: '1px solid var(--border-default, #ddd)',
                                    borderRadius: '6px', fontSize: '0.85rem',
                                    color: 'var(--text-high)',
                                }}
                            />
                        </div>

                        <div className={styles.confirmActions}>
                            <button
                                disabled={deleteConfirmText !== 'DELETE' || deleting}
                                onClick={async () => {
                                    setDeleting(true);
                                    try {
                                        const { data: { session } } = await supabase.auth.getSession();
                                        const token = session?.access_token;
                                        const res = await fetch('/api/policies/delete', {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                                            },
                                            body: JSON.stringify({
                                                policy_id: policyDetail.id,
                                                delete_orphaned_client: deleteOrphanedClient,
                                            }),
                                        });
                                        const result = await res.json();
                                        if (result.success) {
                                            router.push('/dashboard');
                                        } else {
                                            setMessage({ type: 'error', text: result.error || 'Failed to delete policy' });
                                            setShowDeleteDialog(false);
                                        }
                                    } catch (err: any) {
                                        setMessage({ type: 'error', text: err.message || 'Failed to delete policy' });
                                        setShowDeleteDialog(false);
                                    } finally {
                                        setDeleting(false);
                                    }
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    padding: '0.5rem 1rem', borderRadius: '7px', fontSize: '0.82rem', fontWeight: 600,
                                    background: deleteConfirmText === 'DELETE' && !deleting ? '#ef4444' : 'rgba(239,68,68,0.2)',
                                    color: deleteConfirmText === 'DELETE' && !deleting ? '#fff' : 'rgba(239,68,68,0.5)',
                                    border: 'none', cursor: deleteConfirmText === 'DELETE' && !deleting ? 'pointer' : 'not-allowed',
                                }}
                            >
                                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                {deleting ? 'Deleting...' : 'Permanently Delete Policy'}
                            </button>
                            <Button variant="ghost" size="sm" onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(''); }} disabled={deleting}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
