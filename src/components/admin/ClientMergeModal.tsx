"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
    X, Check, FileStack, Merge, RefreshCw, Shield, ShieldCheck,
    Crown, ArrowRightLeft, ChevronDown, ChevronUp, Mail, Phone, MapPin, User, Calendar, DollarSign
} from "lucide-react";
import styles from "./ClientMergeModal.module.css";
import { logger } from '@/lib/logger';


/* ── Data Interfaces ── */

interface PolicyTermBrief {
    id: string;
    effective_date?: string;
    expiration_date?: string;
    annual_premium?: number;
    is_current?: boolean;
}

interface PlatformDocBrief {
    id: string;
    doc_type: string;
    file_name?: string;
    created_at?: string;
}

interface PolicyBrief {
    id: string;
    policy_number: string;
    carrier_name?: string;
    property_address_raw?: string;
    status?: string;
    created_at?: string;
    policy_terms?: PolicyTermBrief[];
    platform_documents?: PlatformDocBrief[];
}

interface DecPageBrief {
    id: string;
    policy_number?: string;
    created_at?: string;
    submission_id?: string;
    dec_page_submissions?: { file_name?: string } | { file_name?: string }[];
}

interface ClientData {
    id: string;
    named_insured: string;
    email?: string;
    phone?: string;
    mailing_address_raw?: string;
    mailing_address_norm?: string;
    policies?: PolicyBrief[];
    dec_pages?: DecPageBrief[];
    created_at?: string;
}

const MERGE_DOC_LABELS: Record<string, { label: string; color: string }> = {
    dec_page: { label: 'DEC PAGE', color: '#3b82f6' },
    rce: { label: 'RCE', color: '#10b981' },
    dic_dec_page: { label: 'DIC', color: '#f97316' },
    es_doc: { label: 'E&S', color: '#8b5cf6' },
    other: { label: 'OTHER', color: '#a855f7' },
    invoice: { label: 'INVOICE', color: '#8b5cf6' },
    inspection: { label: 'INSPECTION', color: '#ec4899' },
    endorsement: { label: 'ENDORSEMENT', color: '#06b6d4' },
    questionnaire: { label: 'QUESTIONNAIRE', color: '#84cc16' },
};

interface ClientMergeModalProps {
    survivor: ClientData;
    candidates: ClientData[];
    onClose: () => void;
    onConfirm: (survivorId: string, mergedIds: string[], consolidatePayload: Record<string, any>, keepDocs: boolean) => Promise<void>;
}

type FieldKey = 'named_insured' | 'email' | 'phone' | 'mailing_address_raw';

const FIELD_META: { key: FieldKey; label: string; icon: React.ReactNode }[] = [
    { key: 'named_insured', label: 'Named Insured', icon: <User size={14} /> },
    { key: 'email', label: 'Email', icon: <Mail size={14} /> },
    { key: 'phone', label: 'Phone', icon: <Phone size={14} /> },
    { key: 'mailing_address_raw', label: 'Mailing Address', icon: <MapPin size={14} /> },
];

/* ── Helper: extract current term from a policy ── */
function getCurrentTerm(policy: PolicyBrief): PolicyTermBrief | null {
    const terms = policy.policy_terms || [];
    return terms.find(t => t.is_current) || terms[0] || null;
}

/* ── Helper: format premium ── */
function fmtPremium(val?: number): string {
    if (val == null) return '—';
    return `$${val.toLocaleString()}`;
}

/* ── Helper: format date MM/DD/YYYY ── */
function fmtDate(d?: string): string {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

/* ════════════════════════════════════════════════════════════════════════════ */

export default function ClientMergeModal({ survivor: initialSurvivor, candidates: initialCandidates, onClose, onConfirm }: ClientMergeModalProps) {

    // ── Survivor swap state ──
    // "allRecordIds[0]" is always the current survivor
    const allOriginal = useMemo(() => [initialSurvivor, ...initialCandidates], [initialSurvivor, initialCandidates]);
    const [survivorIndex, setSurvivorIndex] = useState(0);

    // Recompute survivor + candidates from swap state
    const survivor = allOriginal[survivorIndex];
    const candidates = useMemo(
        () => allOriginal.filter((_, i) => i !== survivorIndex),
        [allOriginal, survivorIndex]
    );
    const allRecords = useMemo(() => [survivor, ...candidates], [survivor, candidates]);

    // ── Field selections: which record index (in allRecords) to use for each field ──
    const [selections, setSelections] = useState<Record<FieldKey, number>>(() => {
        const defaults: Record<FieldKey, number> = {
            named_insured: 0,
            email: 0,
            phone: 0,
            mailing_address_raw: 0,
        };
        const all = [initialSurvivor, ...initialCandidates];
        for (const key of ['email', 'phone'] as FieldKey[]) {
            if (!initialSurvivor[key]) {
                const idx = all.findIndex((r) => (r as any)[key]);
                if (idx >= 0) defaults[key] = idx;
            }
        }
        if (!initialSurvivor.mailing_address_raw) {
            const idx = all.findIndex((r) => r.mailing_address_raw);
            if (idx >= 0) defaults.mailing_address_raw = idx;
        }
        return defaults;
    });

    // ── Selective policy migration ──
    // Key: policy ID, Value: whether to migrate it (only relevant for candidate policies)
    const [policyMigration, setPolicyMigration] = useState<Record<string, boolean>>(() => {
        const map: Record<string, boolean> = {};
        for (const c of initialCandidates) {
            for (const p of (c.policies || [])) {
                map[p.id] = true; // default: migrate all
            }
        }
        return map;
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>(() => {
        // All cards start expanded
        const map: Record<string, boolean> = {};
        allOriginal.forEach(r => { map[r.id] = true; });
        return map;
    });

    const toggleCard = useCallback((clientId: string) => {
        setExpandedCards(prev => ({ ...prev, [clientId]: !prev[clientId] }));
    }, []);

    const togglePolicyMigration = useCallback((policyId: string) => {
        setPolicyMigration(prev => ({ ...prev, [policyId]: !prev[policyId] }));
    }, []);

    // ── Survivor swap handler ──
    const handleSwapSurvivor = useCallback((originalIndex: number) => {
        setSurvivorIndex(originalIndex);
        // Reset field selections to favor the new survivor
        const newSurvivor = allOriginal[originalIndex];
        const newAll = [newSurvivor, ...allOriginal.filter((_, i) => i !== originalIndex)];
        const defaults: Record<FieldKey, number> = {
            named_insured: 0,
            email: 0,
            phone: 0,
            mailing_address_raw: 0,
        };
        for (const key of ['email', 'phone'] as FieldKey[]) {
            if (!newSurvivor[key]) {
                const idx = newAll.findIndex(r => (r as any)[key]);
                if (idx >= 0) defaults[key] = idx;
            }
        }
        if (!newSurvivor.mailing_address_raw) {
            const idx = newAll.findIndex(r => r.mailing_address_raw);
            if (idx >= 0) defaults.mailing_address_raw = idx;
        }
        setSelections(defaults);

        // Reset policy migration for new candidate set
        const map: Record<string, boolean> = {};
        const newCandidates = allOriginal.filter((_, i) => i !== originalIndex);
        for (const c of newCandidates) {
            for (const p of (c.policies || [])) {
                map[p.id] = true;
            }
        }
        setPolicyMigration(map);
    }, [allOriginal]);

    // ── Select field from a specific record ──
    const selectField = useCallback((fieldKey: FieldKey, recordIndex: number) => {
        setSelections(prev => ({ ...prev, [fieldKey]: recordIndex }));
    }, []);

    // ── Compute merge summary ──
    const migratePolicyCount = useMemo(() => {
        return Object.values(policyMigration).filter(Boolean).length;
    }, [policyMigration]);

    const survivorPolicyCount = (survivor.policies || []).length;
    const totalPoliciesAfterMerge = survivorPolicyCount + migratePolicyCount;

    const anyPoliciesExcluded = useMemo(() => {
        return Object.values(policyMigration).some(v => !v);
    }, [policyMigration]);

    // ── Submit handler ──
    const handleConfirm = async () => {
        setIsSubmitting(true);
        try {
            const payload: Record<string, any> = {};
            const selSource = (key: FieldKey) => allRecords[selections[key]];

            payload.named_insured = selSource('named_insured').named_insured;
            payload.email = selSource('email').email;
            payload.phone = selSource('phone').phone;
            const addrSource = selSource('mailing_address_raw');
            payload.mailing_address_raw = addrSource.mailing_address_raw;
            payload.mailing_address_norm = addrSource.mailing_address_norm;

            // Attach policy exclusion list (policies NOT to migrate)
            const excludedPolicies = Object.entries(policyMigration)
                .filter(([, migrate]) => !migrate)
                .map(([id]) => id);
            if (excludedPolicies.length > 0) {
                payload._excluded_policy_ids = excludedPolicies;
            }

            const keepDocs = migratePolicyCount > 0 || !anyPoliciesExcluded;
            await onConfirm(survivor.id, candidates.map(c => c.id), payload, keepDocs);
            onClose();
        } catch (error) {
            logger.error('ClientMergeModal', "Failed to execute guided merge", { error: error instanceof Error ? error.message : String(error) })
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Render a single profile card ──
    const renderProfileCard = (record: ClientData, recordIndex: number, isSurvivor: boolean) => {
        const originalIndex = allOriginal.findIndex(r => r.id === record.id);
        const isExpanded = expandedCards[record.id] !== false;
        const policies = record.policies || [];
        const decPages = record.dec_pages || [];

        // Build unified doc list from dec_pages + platform_documents (nested in policies)
        type UnifiedDoc = { id: string; docType: string; fileName?: string; policyNumber?: string; createdAt?: string };
        const allDocs: UnifiedDoc[] = [];
        for (const dp of decPages) {
            const sub = dp.dec_page_submissions;
            const fileName = Array.isArray(sub) ? sub[0]?.file_name : sub?.file_name;
            allDocs.push({ id: dp.id, docType: 'dec_page', fileName, policyNumber: dp.policy_number, createdAt: dp.created_at });
        }
        for (const p of policies) {
            for (const pd of (p.platform_documents || [])) {
                allDocs.push({ id: pd.id, docType: pd.doc_type, fileName: pd.file_name, policyNumber: p.policy_number, createdAt: pd.created_at });
            }
        }

        return (
            <div key={record.id} className={`${styles.profileCard} ${isSurvivor ? styles.profileCardSurvivor : styles.profileCardCandidate}`}>

                {/* Card Header */}
                <div className={styles.cardHeader} onClick={() => toggleCard(record.id)}>
                    <div className={styles.cardHeaderLeft}>
                        {isSurvivor ? (
                            <div className={styles.roleBadgeSurvivor}>
                                <Crown size={12} /> Survivor
                            </div>
                        ) : (
                            <div className={styles.roleBadgeCandidate}>
                                Candidate {recordIndex}
                            </div>
                        )}
                        <span className={styles.cardClientName}>{record.named_insured}</span>
                    </div>
                    <div className={styles.cardHeaderRight}>
                        <div className={styles.cardStats}>
                            <span className={styles.statChip}>
                                <Shield size={11} />
                                {policies.length} {policies.length === 1 ? 'policy' : 'policies'}
                            </span>
                            <span className={styles.statChip}>
                                <FileStack size={11} />
                                {allDocs.length} docs
                            </span>
                        </div>
                        {!isSurvivor && (
                            <button
                                className={styles.swapBtn}
                                onClick={(e) => { e.stopPropagation(); handleSwapSurvivor(originalIndex); }}
                                title="Promote to Survivor"
                            >
                                <ArrowRightLeft size={13} /> Make Survivor
                            </button>
                        )}
                        {isExpanded ? <ChevronUp size={16} className={styles.chevron} /> : <ChevronDown size={16} className={styles.chevron} />}
                    </div>
                </div>

                {isExpanded && (
                    <div className={styles.cardBody}>
                        {/* Created date */}
                        <div className={styles.createdDate}>
                            <Calendar size={12} />
                            Created {record.created_at ? new Date(record.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}
                        </div>

                        {/* Contact Fields */}
                        <div className={styles.fieldsSection}>
                            <div className={styles.fieldsSectionTitle}>Contact Information</div>
                            {FIELD_META.map(({ key, label, icon }) => {
                                const val = key === 'mailing_address_raw' ? record.mailing_address_raw : (record as any)[key];
                                const isSelected = selections[key] === recordIndex;
                                const hasValue = !!val;

                                return (
                                    <div
                                        key={key}
                                        className={`${styles.fieldRow} ${isSelected ? styles.fieldRowSelected : ''} ${!hasValue ? styles.fieldRowEmpty : ''}`}
                                        onClick={() => hasValue && selectField(key, recordIndex)}
                                    >
                                        <div className={styles.fieldIcon}>{icon}</div>
                                        <div className={styles.fieldContent}>
                                            <div className={styles.fieldLabel}>{label}</div>
                                            <div className={styles.fieldValue}>
                                                {hasValue ? val : <span className={styles.noData}>Not provided</span>}
                                            </div>
                                        </div>
                                        {hasValue && (
                                            <div className={`${styles.selectionIndicator} ${isSelected ? styles.selectionIndicatorActive : ''}`}>
                                                {isSelected && <Check size={10} strokeWidth={3} />}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Policy Inventory */}
                        <div className={styles.policyInventory}>
                            <div className={styles.policyInventoryHeader}>
                                <Shield size={14} />
                                <span>Policy Inventory</span>
                                <span className={styles.policyChipCount}>{policies.length}</span>
                            </div>

                            {policies.length === 0 ? (
                                <div className={styles.noPolicies}>
                                    No policies linked to this client record
                                </div>
                            ) : (
                                <>
                                    {isSurvivor ? (
                                        <div className={styles.policyKeptLabel}>
                                            <ShieldCheck size={11} />
                                            These policies belong to the survivor — they will always be kept
                                        </div>
                                    ) : (
                                        <div className={styles.policyMigrateLabel}>
                                            <Check size={11} />
                                            Checked policies will be migrated to the survivor after merge
                                        </div>
                                    )}
                                    <div className={styles.policyRows}>
                                        {policies.map(policy => {
                                            const term = getCurrentTerm(policy);
                                            const isCandidate = !isSurvivor;
                                            const isMigrating = isCandidate ? (policyMigration[policy.id] !== false) : true;

                                            return (
                                                <div key={policy.id} className={`${styles.policyRow} ${!isMigrating && isCandidate ? styles.policyRowExcluded : ''}`}>
                                                    {/* Migration toggle for candidate policies */}
                                                    {isCandidate && (
                                                        <div
                                                            className={`${styles.migrateCheckbox} ${isMigrating ? styles.migrateCheckboxChecked : ''}`}
                                                            onClick={(e) => { e.stopPropagation(); togglePolicyMigration(policy.id); }}
                                                        >
                                                            {isMigrating && <Check size={10} strokeWidth={3} />}
                                                        </div>
                                                    )}
                                                    {isSurvivor && (
                                                        <div className={styles.survivorPolicyIcon}>
                                                            <ShieldCheck size={14} />
                                                        </div>
                                                    )}

                                                    <div className={styles.policyRowContent}>
                                                        <div className={styles.policyRowTop}>
                                                            <span className={styles.policyNum}>{policy.policy_number}</span>
                                                            {policy.carrier_name && <span className={styles.policyCarrier}>{policy.carrier_name}</span>}
                                                        </div>
                                                        {policy.property_address_raw && (
                                                            <div className={styles.policyAddr}>{policy.property_address_raw}</div>
                                                        )}
                                                        {term && (
                                                            <div className={styles.policyTermInfo}>
                                                                <span><DollarSign size={11} /> {fmtPremium(term.annual_premium)}</span>
                                                                <span><Calendar size={11} /> {fmtDate(term.effective_date)} – {fmtDate(term.expiration_date)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Document Inventory */}
                        <div className={styles.policyInventory} style={{ marginTop: '0.75rem' }}>
                            <div className={styles.policyInventoryHeader}>
                                <FileStack size={14} />
                                <span>Document Inventory</span>
                                <span className={styles.policyChipCount}>{allDocs.length}</span>
                            </div>

                            {allDocs.length === 0 ? (
                                <div className={styles.noPolicies}>
                                    No documents linked to this client record
                                </div>
                            ) : (
                                <>
                                    {isSurvivor ? (
                                        <div className={styles.policyKeptLabel}>
                                            <ShieldCheck size={11} />
                                            These documents belong to the survivor — they will always be kept
                                        </div>
                                    ) : (
                                        <div className={styles.policyKeptLabel} style={{ background: 'rgba(16, 185, 129, 0.03)' }}>
                                            <Merge size={11} />
                                            These documents will automatically transfer to the survivor after merge
                                        </div>
                                    )}
                                    <div className={styles.policyRows}>
                                        {allDocs.map(doc => {
                                            const typeInfo = MERGE_DOC_LABELS[doc.docType] || { label: doc.docType.toUpperCase(), color: '#6b7280' };
                                            return (
                                                <div key={doc.id} className={styles.policyRow}>
                                                    <div style={{
                                                        display: 'inline-flex', alignItems: 'center',
                                                        padding: '0.15rem 0.45rem', borderRadius: '4px',
                                                        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.03em',
                                                        backgroundColor: `${typeInfo.color}15`,
                                                        color: typeInfo.color,
                                                        border: `1px solid ${typeInfo.color}30`,
                                                        whiteSpace: 'nowrap', flexShrink: 0,
                                                    }}>
                                                        {typeInfo.label}
                                                    </div>
                                                    <div className={styles.policyRowContent}>
                                                        <div className={styles.policyRowTop}>
                                                            <span className={styles.policyNum} style={{ fontSize: '0.72rem' }}>
                                                                {doc.fileName || 'Uploaded document'}
                                                            </span>
                                                        </div>
                                                        <div className={styles.policyTermInfo}>
                                                            {doc.policyNumber && (
                                                                <span>
                                                                    <Shield size={10} /> Policy #{doc.policyNumber}
                                                                </span>
                                                            )}
                                                            {doc.createdAt && (
                                                                <span>
                                                                    <Calendar size={10} />{' '}
                                                                    {new Date(doc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>

                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.title}>
                        <Merge style={{ color: "var(--accent-primary)" }} />
                        Guided Identity Consolidation
                        <span className={styles.candidateCountBadge}>
                            {candidates.length} {candidates.length === 1 ? 'candidate' : 'candidates'} detected
                        </span>
                    </div>
                    <button onClick={onClose} className={styles.closeButton} disabled={isSubmitting}>
                        <X size={20} />
                    </button>
                </div>

                {/* Content: Profile Cards */}
                <div className={styles.content}>
                    <div className={styles.cardsContainer}>
                        {/* Survivor Card */}
                        {renderProfileCard(survivor, 0, true)}

                        {/* Candidate Cards */}
                        {candidates.map((c, i) => renderProfileCard(c, i + 1, false))}
                    </div>

                    {/* ── Merge Summary ── */}
                    <div className={styles.summarySection}>
                        <div className={styles.summaryTitle}>Merge Summary</div>

                        <div className={styles.summaryGrid}>
                            {/* Selected fields summary */}
                            <div className={styles.summaryBlock}>
                                <div className={styles.summaryBlockLabel}>Surviving Contact Data</div>
                                {FIELD_META.map(({ key, label, icon }) => {
                                    const source = allRecords[selections[key]];
                                    const val = (source as any)[key];
                                    const sourceLabel = selections[key] === 0 ? 'Survivor' : `Candidate ${selections[key]}`;
                                    return (
                                        <div key={key} className={styles.summaryFieldRow}>
                                            <span className={styles.summaryFieldIcon}>{icon}</span>
                                            <span className={styles.summaryFieldLabel}>{label}:</span>
                                            <span className={styles.summaryFieldValue}>{val || '—'}</span>
                                            <span className={styles.summaryFieldSource}>from {sourceLabel}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Policy consolidation summary */}
                            <div className={styles.summaryBlock}>
                                <div className={styles.summaryBlockLabel}>Policy Consolidation</div>
                                <div className={styles.summaryStatRow}>
                                    <span>Survivor policies (kept as-is)</span>
                                    <strong>{survivorPolicyCount}</strong>
                                </div>
                                <div className={styles.summaryStatRow}>
                                    <span>Candidate policies to migrate</span>
                                    <strong className={migratePolicyCount > 0 ? styles.accentGreen : ''}>{migratePolicyCount}</strong>
                                </div>
                                {anyPoliciesExcluded && (
                                    <div className={`${styles.summaryStatRow} ${styles.summaryStatWarn}`}>
                                        <span>Policies excluded (will be orphaned)</span>
                                        <strong>{Object.values(policyMigration).filter(v => !v).length}</strong>
                                    </div>
                                )}
                                <div className={styles.summaryStatTotal}>
                                    <span>Total after merge</span>
                                    <strong>{totalPoliciesAfterMerge}</strong>
                                </div>
                            </div>

                            {/* Document consolidation summary */}
                            {(() => {
                                const countDocs = (r: ClientData) => {
                                    const dp = (r.dec_pages || []).length;
                                    const pd = (r.policies || []).reduce((sum, p) => sum + (p.platform_documents || []).length, 0);
                                    return dp + pd;
                                };
                                const survivorDocCount = countDocs(survivor);
                                const candidateDocCount = candidates.reduce((sum, c) => sum + countDocs(c), 0);
                                return (
                                    <div className={styles.summaryBlock}>
                                        <div className={styles.summaryBlockLabel}>Document Consolidation</div>
                                        <div className={styles.summaryStatRow}>
                                            <span>Survivor documents</span>
                                            <strong>{survivorDocCount}</strong>
                                        </div>
                                        <div className={styles.summaryStatRow}>
                                            <span>Candidate documents to transfer</span>
                                            <strong className={candidateDocCount > 0 ? styles.accentGreen : ''}>
                                                {candidateDocCount}
                                            </strong>
                                        </div>
                                        <div className={styles.summaryStatTotal}>
                                            <span>Total after merge</span>
                                            <strong>{survivorDocCount + candidateDocCount}</strong>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    <button className={styles.btnCancel} onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </button>
                    <button className={styles.btnConfirm} onClick={handleConfirm} disabled={isSubmitting}>
                        {isSubmitting ? <RefreshCw size={16} className={styles.spinAnimation} /> : <Merge size={16} />}
                        Consolidate {candidates.length} Record{candidates.length > 1 ? 's' : ''}
                    </button>
                </div>

            </div>
        </div>
    );
}
