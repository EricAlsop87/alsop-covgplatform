'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    X,
    AlertTriangle,
    CheckSquare,
    Square,
    Copy,
    Check,
    Save,
    Loader2,
    Mail,
    FileText,
    ShieldAlert,
    Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import styles from './ScenarioAlertModal.module.scss';
import type { CFPTermRow } from '@/app/api/cfp-summary/route';
import {
    SCENARIO_DEFINITIONS,
    type ScenarioType,
    generateCompositeClientEmail,
    type PolicyScenarioData,
} from '@/lib/scenarioEmailTemplates';
import { toTitleCase } from './SendMailModal';

export interface ScenarioAlertData {
    scenarios: ScenarioType[];
    otherStructureTypes?: string[];
    otherStructureCoverage?: number | null;
    propertyFeatures?: string[];
    customTitle?: string;
    customDetails?: string;
    vaRemarks?: string;
    annualSavings?: number | null;
    updated_at?: string;
    updated_by?: string;
}

export interface ScenarioAlertModalProps {
    term: CFPTermRow | null;
    isOpen: boolean;
    onClose: () => void;
    onSavedSuccess: (termId: string, alertData: ScenarioAlertData | null) => void;
}

export function ScenarioAlertModal({ term, isOpen, onClose, onSavedSuccess }: ScenarioAlertModalProps) {
    const [activeScenarios, setActiveScenarios] = useState<ScenarioType[]>([]);
    const [otherStructureTypes, setOtherStructureTypes] = useState<string[]>(['Detached Garage', 'Shed']);
    const [otherStructureCoverage, setOtherStructureCoverage] = useState<number | null>(null);
    const [propertyFeatures, setPropertyFeatures] = useState<string[]>(['Wood-Burning Stove']);
    const [customTitle, setCustomTitle] = useState<string>('');
    const [customDetails, setCustomDetails] = useState<string>('');
    const [vaRemarks, setVaRemarks] = useState<string>('');
    const [annualSavings, setAnnualSavings] = useState<number | null>(null);
    const [saving, setSaving] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied_html' | 'copied_text'>('idle');

    useEffect(() => {
        if (!isOpen || !term) return;

        // Check if term already has a saved scenario_alert
        if (term.scenario_alert) {
            const sa = term.scenario_alert;
            setActiveScenarios(Array.isArray(sa.scenarios) ? sa.scenarios : []);
            setOtherStructureTypes(sa.otherStructureTypes || ['Detached Garage', 'Shed']);
            setOtherStructureCoverage(sa.otherStructureCoverage ?? null);
            setPropertyFeatures(sa.propertyFeatures || ['Wood-Burning Stove']);
            setCustomTitle(sa.customTitle || '');
            setCustomDetails(sa.customDetails || '');
            setVaRemarks(sa.vaRemarks || '');
            setAnnualSavings(sa.annualSavings ?? null);
        } else {
            // Auto-detect based on term data
            const detected: ScenarioType[] = [];
            if (term.rce_replacement_cost) {
                detected.push('rce_review');
            }

            const bPrem = term.carrier_quotes?.bamboo?.premium ? Number(term.carrier_quotes.bamboo.premium) : null;
            const aPrem = term.carrier_quotes?.aegis?.premium ? Number(term.carrier_quotes.aegis.premium) : null;
            const pPrem = term.carrier_quotes?.psic?.premium ? Number(term.carrier_quotes.psic.premium) : null;
            const cfpPrem = term.annual_premium || term.renewal_annual_premium;

            const bestPrem = bPrem || aPrem || pPrem;
            if (bestPrem && cfpPrem && bestPrem < Number(cfpPrem)) {
                detected.push('standard_savings');
            } else if (bestPrem) {
                detected.push('standard_no_savings');
            }

            setActiveScenarios(detected);
            setOtherStructureTypes(['Detached Garage', 'Shed']);
            setOtherStructureCoverage(null);
            setPropertyFeatures(['Wood-Burning Stove']);
            setCustomTitle('');
            setCustomDetails('');
            setVaRemarks('');
            setAnnualSavings(null);
        }
        setError(null);
    }, [isOpen, term]);

    // Build the dynamic Client Email Draft based on active scenarios
    const clientEmailDraft = useMemo(() => {
        if (!term) return { subject: '', bodyText: '', bodyHtml: '' };
        const effectiveRceCost = term.rce_replacement_cost;
        const effectiveCfpPrem = term.annual_premium || term.renewal_annual_premium;

        let bestCarrier = 'Bamboo';
        let bestQuotePrem: number | null = null;
        if (term.carrier_quotes?.bamboo?.premium) {
            bestCarrier = 'Bamboo';
            bestQuotePrem = Number(term.carrier_quotes.bamboo.premium);
        } else if (term.carrier_quotes?.aegis?.premium) {
            bestCarrier = 'Aegis';
            bestQuotePrem = Number(term.carrier_quotes.aegis.premium);
        } else if (term.carrier_quotes?.psic?.premium) {
            bestCarrier = 'Pacific Specialty (PSIC)';
            bestQuotePrem = Number(term.carrier_quotes.psic.premium);
        }

        const calculatedSavings = annualSavings ?? (effectiveCfpPrem && bestQuotePrem && Number(effectiveCfpPrem) > bestQuotePrem ? Math.round(Number(effectiveCfpPrem) - bestQuotePrem) : null);

        const data: PolicyScenarioData = {
            clientName: term.named_insured ? toTitleCase(term.named_insured) : undefined,
            propertyAddress: term.property_address ? toTitleCase(term.property_address) : undefined,
            policyNumber: term.policy_number || undefined,
            currentDwellingLimit: (term as any).coverage_a || null,
            rceValuationAmount: effectiveRceCost,
            rceCarrier: term.rce_carrier || 'Bamboo',
            otherStructureTypes,
            otherStructureCoverage,
            propertyFeatures,
            carrierName: bestCarrier,
            annualSavings: calculatedSavings,
            standardQuotePremium: bestQuotePrem,
            currentCfpPremium: effectiveCfpPrem ? Number(effectiveCfpPrem) : null,
            agentName: 'Coverage Check Team',
            agencyName: 'Alsop & Associates Insurance Agency',
            vaRemarks,
        };

        return generateCompositeClientEmail(activeScenarios, data);
    }, [term, activeScenarios, otherStructureTypes, otherStructureCoverage, propertyFeatures, annualSavings, vaRemarks]);

    const handleSaveAlert = async () => {
        if (!term?.policy_id) return;
        setSaving(true);
        setError(null);

        const alertPayload = activeScenarios.length > 0 || vaRemarks.trim() ? {
            scenarios: activeScenarios,
            otherStructureTypes: activeScenarios.includes('other_structures') ? otherStructureTypes : [],
            otherStructureCoverage: activeScenarios.includes('other_structures') ? otherStructureCoverage : null,
            propertyFeatures: activeScenarios.includes('property_feature') ? propertyFeatures : [],
            customTitle: customTitle.trim() || undefined,
            customDetails: customDetails.trim() || undefined,
            vaRemarks: vaRemarks.trim() || undefined,
            annualSavings,
        } : null;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/cfp-summary/scenario-alert', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                },
                body: JSON.stringify({
                    policy_id: term.policy_id,
                    scenario_alert: alertPayload,
                }),
            });

            const json = await res.json();
            if (res.ok && json.success) {
                onSavedSuccess(term.policy_term_id, alertPayload);
                onClose();
            } else {
                setError(json.error || 'Failed to save scenario alert.');
            }
        } catch (err: any) {
            setError(err.message || 'Error saving scenario alert.');
        } finally {
            setSaving(false);
        }
    };

    const handleClearAlert = async () => {
        if (!term?.policy_id) return;
        setActiveScenarios([]);
        setVaRemarks('');
        setCustomTitle('');
        setCustomDetails('');

        setSaving(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            await fetch('/api/cfp-summary/scenario-alert', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                },
                body: JSON.stringify({
                    policy_id: term.policy_id,
                    scenario_alert: null,
                }),
            });
            onSavedSuccess(term.policy_term_id, null);
            onClose();
        } catch {
            // Close modal
            onClose();
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen || !term) return null;

    const polNum = term.policy_number || 'Policy';
    const cleanPolNum = polNum.replace(/^CFP\s*/i, '');
    const insured = term.named_insured ? toTitleCase(term.named_insured) : 'Insured';
    const addr = term.property_address ? toTitleCase(term.property_address) : 'Address on file';

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.modalHeader}>
                    <div className={styles.modalHeaderInfo}>
                        <div className={styles.modalTitleRow}>
                            <div className={styles.alertIconBadge}>
                                <AlertTriangle size={16} />
                            </div>
                            <h3 className={styles.modalTitle}>Policy Review Scenario &amp; Alert Setup</h3>
                        </div>
                        <p className={styles.modalSubtitle}>
                            CFP {cleanPolNum} &bull; {insured} &bull; {addr}
                        </p>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={onClose} title="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className={styles.modalBody}>
                    {error && (
                        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '0.78rem' }}>
                            {error}
                        </div>
                    )}

                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                            <ShieldAlert size={14} color="#d97706" /> Select Applicable Review Scenarios:
                        </label>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginBottom: '8px' }}>
                            Select all findings that apply to this policy. This prepares the alert for Olga/Nancy/JP and builds the ready-to-forward client draft:
                        </div>

                        <div className={styles.scenarioChipsGrid}>
                            {(Object.keys(SCENARIO_DEFINITIONS) as ScenarioType[]).map(scId => {
                                const def = SCENARIO_DEFINITIONS[scId];
                                const isActive = activeScenarios.includes(scId);
                                return (
                                    <button
                                        key={scId}
                                        type="button"
                                        className={`${styles.scenarioChip} ${isActive ? styles.scenarioChipActive : ''}`}
                                        onClick={() => {
                                            setActiveScenarios(prev =>
                                                prev.includes(scId) ? prev.filter(s => s !== scId) : [...prev, scId]
                                            );
                                        }}
                                        title={def.description}
                                    >
                                        {isActive ? <CheckSquare size={14} color="#2563eb" /> : <Square size={14} color="#94a3b8" />}
                                        <span>{def.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Specific Sub-Option Controls */}
                    {activeScenarios.includes('other_structures') && (
                        <div className={styles.subDetailsBox}>
                            <strong style={{ color: '#1e40af' }}>Detached Other Structures Observed:</strong>
                            <div className={styles.optionsRow}>
                                {['Detached Garage', 'Shed', 'Deck', 'Fence', 'Barn', 'Workshop'].map(st => {
                                    const checked = otherStructureTypes.includes(st);
                                    return (
                                        <label key={st} className={styles.checkboxOption}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={e => {
                                                    if (e.target.checked) setOtherStructureTypes(prev => [...prev, st]);
                                                    else setOtherStructureTypes(prev => prev.filter(x => x !== st));
                                                }}
                                            />
                                            <span>{st}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {activeScenarios.includes('property_feature') && (
                        <div className={styles.subDetailsBox}>
                            <strong style={{ color: '#1e40af' }}>Property Features / Hazards to Confirm:</strong>
                            <div className={styles.optionsRow}>
                                {['Wood-Burning Stove', 'Solar Panels', 'Propane Tank', 'Roof Condition', 'Brush Hazard'].map(pf => {
                                    const checked = propertyFeatures.includes(pf);
                                    return (
                                        <label key={pf} className={styles.checkboxOption}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={e => {
                                                    if (e.target.checked) setPropertyFeatures(prev => [...prev, pf]);
                                                    else setPropertyFeatures(prev => prev.filter(x => x !== pf));
                                                }}
                                            />
                                            <span>{pf}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* VA Remarks / Instructions for Management */}
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                            <FileText size={14} color="#2563eb" /> VA Remarks / Specific Instructions for Olga, JP &amp; Nancy:
                        </label>
                        <textarea
                            className={styles.remarksTextarea}
                            placeholder="e.g. Aerial photos show large 2-car detached garage; current Cov B is $0. RCE calculated at $620k."
                            rows={2}
                            value={vaRemarks}
                            onChange={e => setVaRemarks(e.target.value)}
                        />
                    </div>

                    {/* Live Ready Client Email Draft Preview */}
                    {activeScenarios.length > 0 && clientEmailDraft.bodyText && (
                        <div className={styles.clientDraftContainer}>
                            <div className={styles.clientDraftHeader}>
                                <div className={styles.clientDraftTitle}>
                                    <Mail size={14} color="#2563eb" />
                                    <span>Pre-Generated Client/Agent Email Draft</span>
                                </div>
                                <div className={styles.clientDraftActions}>
                                    <button
                                        type="button"
                                        className={`${styles.copyDraftBtn} ${copyStatus === 'copied_html' ? styles.copied : ''}`}
                                        onClick={async () => {
                                            try {
                                                if (navigator.clipboard && window.ClipboardItem) {
                                                    const blobHtml = new Blob([clientEmailDraft.bodyHtml], { type: 'text/html' });
                                                    const blobText = new Blob([clientEmailDraft.bodyText], { type: 'text/plain' });
                                                    await navigator.clipboard.write([
                                                        new ClipboardItem({
                                                            'text/html': blobHtml,
                                                            'text/plain': blobText,
                                                        }),
                                                    ]);
                                                } else {
                                                    await navigator.clipboard.writeText(clientEmailDraft.bodyText);
                                                }
                                                setCopyStatus('copied_html');
                                                setTimeout(() => setCopyStatus('idle'), 2500);
                                            } catch {
                                                await navigator.clipboard.writeText(clientEmailDraft.bodyText);
                                                setCopyStatus('copied_text');
                                                setTimeout(() => setCopyStatus('idle'), 2500);
                                            }
                                        }}
                                    >
                                        {copyStatus === 'copied_html' ? <Check size={12} /> : <Copy size={12} />}
                                        <span>{copyStatus === 'copied_html' ? 'Copied HTML!' : 'Copy Client Draft'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.copyDraftBtn} ${copyStatus === 'copied_text' ? styles.copied : ''}`}
                                        onClick={async () => {
                                            await navigator.clipboard.writeText(clientEmailDraft.bodyText);
                                            setCopyStatus('copied_text');
                                            setTimeout(() => setCopyStatus('idle'), 2500);
                                        }}
                                    >
                                        {copyStatus === 'copied_text' ? <Check size={12} /> : <Copy size={12} />}
                                        <span>{copyStatus === 'copied_text' ? 'Copied Text!' : 'Copy Plain Text'}</span>
                                    </button>
                                </div>
                            </div>
                            <div className={styles.clientDraftBody}>
                                <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: '6px' }}>
                                    Subject: {clientEmailDraft.subject}
                                </div>
                                {clientEmailDraft.bodyText}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={styles.modalFooter}>
                    <button
                        type="button"
                        className={styles.clearBtn}
                        onClick={handleClearAlert}
                        disabled={saving}
                        title="Clear all alerts for this policy (Sets status to No Alert)"
                    >
                        <Trash2 size={13} style={{ display: 'inline', marginRight: '4px' }} /> Clear / No Alert
                    </button>

                    <div className={styles.footerRightActions}>
                        <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
                            Cancel
                        </button>
                        <button type="button" className={styles.saveBtn} onClick={handleSaveAlert} disabled={saving}>
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            <span>Save Alert &amp; Update Table</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
