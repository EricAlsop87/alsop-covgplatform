'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    Declaration,
    PolicyDetail,
    PropertyEnrichment,
    getLatestReportForPolicy,
    PolicyReportRow,
    getManualOverridesForPolicy,
    upsertManualOverride,
    generatePolicyReport,
} from '@/lib/api';
import { EditableValue } from '@/components/ui/EditableValue';
import {
    RefreshCw,
    Shield,
    ShieldCheck,
    Home,
    Calendar,
    MapPin,
    DollarSign,
    Layers,
    Flame,
    Building,
    FileText,
    TrendingUp,
    Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import styles from './PolicyOverviewTab.module.css';
import { logger } from '@/lib/logger';

interface PolicyOverviewTabProps {
    declaration: Declaration;
    policyDetail?: PolicyDetail;
    enrichments?: PropertyEnrichment[];
    onEditPolicy?: () => void;
}

/* ── Formatters ──────────────────────────────────────────────── */

function parseNum(val: unknown): number | null {
    if (val == null || val === '') return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    const clean = String(val).replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
}

function fmtCurrency(val: unknown): string {
    if (val == null || val === '' || val === '—') return '—';
    const num = parseNum(val);
    if (num == null) return String(val);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

function fmtDate(raw: string | null | undefined): string {
    if (!raw) return '—';
    try {
        const d = new Date(raw.includes('T') ? raw : raw + 'T00:00:00');
        if (isNaN(d.getTime())) return raw;
        return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
        return raw;
    }
}

function toDisplay(value: unknown): string {
    if (value == null || value === '' || value === 'Unknown') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}

/* ── Main Component ──────────────────────────────────────────── */

export function PolicyOverviewTab({ declaration, policyDetail, enrichments = [], onEditPolicy }: PolicyOverviewTabProps) {
    const router = useRouter();
    const [report, setReport] = useState<PolicyReportRow | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [overrides, setOverrides] = useState<Record<string, string>>({});
    const [hasPendingEdits, setHasPendingEdits] = useState(false);

    React.useEffect(() => {
        const policyId = declaration.policy_id || declaration.id;
        if (policyId) {
            getLatestReportForPolicy(policyId).then(data => { if (data) setReport(data); });
            getManualOverridesForPolicy(policyId).then(setOverrides);
        }
    }, [declaration.policy_id, declaration.id]);

    const handleOverrideSave = async (fieldName: string, newValue: string, originalValue: string) => {
        const policyId = declaration.policy_id || declaration.id;
        if (!policyId) return false;
        const res = await upsertManualOverride(policyId, fieldName, newValue, originalValue);
        if (res.success) {
            setOverrides(prev => ({ ...prev, [fieldName]: newValue }));
            setHasPendingEdits(true);
            return true;
        }
        return false;
    };

    const getVal = (fieldName: string, original: string | null | undefined): string => {
        return overrides[fieldName] || original || '';
    };

    const handleGenerateReport = async () => {
        setIsGenerating(true);
        try {
            const policyId = declaration.policy_id || declaration.id;
            const result = await generatePolicyReport(policyId);
            if (result.report) {
                window.open(`/report/${result.report.id}`, '_blank');
            }
        } catch (e) {
            logger.error('PolicyOverviewTab', 'Error:', { error: e instanceof Error ? e.message : String(e) });
        } finally {
            setIsGenerating(false);
        }
    };

    const hasDic = Boolean(declaration.dic_exists || declaration.dic_limit_dwelling);

    const dwellingVal = getVal('limit_dwelling', declaration.limit_dwelling);
    const otherStructVal = getVal('limit_other_structures', declaration.limit_other_structures);
    const personalPropVal = getVal('limit_personal_property', declaration.limit_personal_property);
    const deductibleVal = getVal('deductible', declaration.deductible);

    // Days remaining in policy period
    const daysRemaining = useMemo(() => {
        if (!declaration.policy_period_end) return null;
        try {
            const end = new Date(declaration.policy_period_end.includes('T') ? declaration.policy_period_end : declaration.policy_period_end + 'T00:00:00');
            const now = new Date();
            const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return diff;
        } catch {
            return null;
        }
    }, [declaration.policy_period_end]);

    // Enriched features lookup
    const enrichmentMap = useMemo(() => {
        const map: Record<string, string> = {};
        enrichments.forEach(e => {
            if (e.field_key && e.field_value) map[e.field_key] = e.field_value;
        });
        return map;
    }, [enrichments]);

    // Optional extended endorsement limits
    const optionalEndorsements = [
        { label: 'Extended Dwelling', val: declaration.limit_extended_dwelling_coverage },
        { label: 'Dwelling Replacement Cost', val: declaration.limit_dwelling_replacement_cost },
        { label: 'Inflation Guard', val: declaration.limit_inflation_guard },
        { label: 'Personal Prop Replacement Cost', val: declaration.limit_personal_property_replacement_cost },
        { label: 'Fences Coverage', val: declaration.limit_fences },
        { label: 'Plants / Shrubs / Trees', val: declaration.limit_plants_shrubs_trees },
        { label: 'Signs / Awnings', val: declaration.limit_signs || declaration.limit_awnings },
        { label: 'Building Code Upgrade', val: declaration.limit_building_code_upgrade_coverage },
    ].filter(e => e.val && e.val !== '—' && e.val !== '$0');

    return (
        <div className={styles.container}>
            {/* Header row */}
            <div className={styles.headerRow}>
                <div className={styles.headerTitleGroup}>
                    <Shield className={styles.headerIcon} size={20} />
                    <h2 className={styles.sectionTitle}>Policy Overview</h2>
                    <span className={`${styles.statusBadge} ${styles[(declaration.status || 'pending').toLowerCase().replace(/\s+/g, '')]}`}>
                        {declaration.status || 'Active'}
                    </span>
                </div>
                {hasPendingEdits && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateReport}
                        disabled={isGenerating}
                        style={{ color: '#d97706', borderColor: '#f59e0b', background: 'rgba(245, 158, 11, 0.08)' }}
                    >
                        {isGenerating ? <RefreshCw size={13} className="spin" /> : <RefreshCw size={13} />}
                        {isGenerating ? 'Regenerating...' : 'Regenerate Analysis'}
                    </Button>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* Hero Dec Page Annual Premium Bar                                */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className={styles.hero}>
                <div className={styles.heroMain}>
                    <span className={styles.heroLabel}>Annual Premium</span>
                    <span className={styles.heroCost}>
                        {policyDetail?.annual_premium || declaration.total_annual_premium || '—'}
                    </span>
                    <span className={styles.heroSubtext}>
                        Policy #{declaration.policy_number || '—'}
                        {daysRemaining != null && (
                            <> · {daysRemaining > 0 ? `${daysRemaining} days active` : 'Expired'}</>
                        )}
                    </span>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* Dual Coverage Limits Cards (Side-by-Side)                      */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className={styles.dualGrid}>
                {/* FAIR Plan Coverage Limits Card */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardHeaderLeft}>
                            <Flame size={16} style={{ color: '#6366f1' }} />
                            <h3>Coverage Limits</h3>
                        </div>
                        <div className={styles.cardHeaderRight}>
                            {onEditPolicy && (
                                <button
                                    type="button"
                                    className={styles.editBtn}
                                    onClick={onEditPolicy}
                                    title="Edit Coverage Limits"
                                >
                                    <Pencil size={11} />
                                    <span>Edit Limits</span>
                                </button>
                            )}
                            <span className={styles.planChip}>FAIR PLAN</span>
                        </div>
                    </div>
                    <div className={styles.cardBody}>
                        {[
                            { label: 'Dwelling (Cov A)', val: dwellingVal },
                            { label: 'Other Structures (Cov B)', val: otherStructVal },
                            { label: 'Personal Property (Cov C)', val: personalPropVal },
                            { label: 'Fair Rental Value (Cov D)', val: getVal('limit_fair_rental_value', declaration.limit_fair_rental_value) },
                            { label: 'Ordinance or Law', val: getVal('limit_ordinance_or_law', declaration.limit_ordinance_or_law) },
                            { label: 'Debris Removal', val: getVal('limit_debris_removal', declaration.limit_debris_removal) },
                            { label: 'Deductible', val: deductibleVal },
                        ].map((item, idx) => (
                            <div key={idx} className={styles.field}>
                                <span className={styles.fieldLabel}>{item.label}</span>
                                <span className={`${styles.fieldValue} ${styles.mono}`}>
                                    {fmtCurrency(item.val)}
                                </span>
                            </div>
                        ))}

                        {/* Optional Endorsements if present */}
                        {optionalEndorsements.map((item, idx) => (
                            <div key={idx} className={styles.field}>
                                <span className={styles.fieldLabel}>{item.label}</span>
                                <span className={`${styles.fieldValue} ${styles.mono}`}>{item.val}</span>
                            </div>
                        ))}

                        {/* Annual Premium */}
                        <div className={`${styles.field} ${styles.premiumRow}`}>
                            <span className={styles.fieldLabel} style={{ fontWeight: 700, color: 'var(--text-high)' }}>
                                Annual Premium
                            </span>
                            <span className={styles.premiumValue}>
                                {policyDetail?.annual_premium || declaration.total_annual_premium || '—'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* DIC Coverage Limits Card */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardHeaderLeft}>
                            <ShieldCheck size={15} style={{ color: hasDic ? '#10b981' : 'var(--text-muted)' }} />
                            <h3>Companion Coverage</h3>
                        </div>
                        <span className={hasDic ? styles.dicChip : styles.planChip} style={!hasDic ? { background: 'rgba(107, 114, 128, 0.1)', color: 'var(--text-muted)' } : undefined}>
                            {hasDic ? 'DIC POLICY' : 'NO DIC LINKED'}
                        </span>
                    </div>
                    <div className={styles.cardBody}>
                        {hasDic ? (
                            <>
                                {declaration.dic_company && (
                                    <div className={styles.field} style={{ background: 'transparent', paddingBottom: '0.2rem' }}>
                                        <span className={styles.fieldLabel}>Carrier / Policy</span>
                                        <span className={styles.carrierSubtext}>
                                            <strong style={{ color: 'var(--text-high)' }}>{declaration.dic_company}</strong>
                                            {declaration.dic_policy_number && <> · #{declaration.dic_policy_number}</>}
                                        </span>
                                    </div>
                                )}
                                {[
                                    { label: 'Dwelling (Cov A)', val: declaration.dic_limit_dwelling },
                                    { label: 'Other Structures (Cov B)', val: declaration.dic_limit_other_structures },
                                    { label: 'Personal Property (Cov C)', val: declaration.dic_limit_personal_property },
                                    { label: 'Loss of Use (Cov E)', val: declaration.dic_limit_loss_of_use },
                                    { label: 'Deductible', val: declaration.dic_deductible },
                                ].map((item, idx) => (
                                    <div key={idx} className={styles.field}>
                                        <span className={styles.fieldLabel}>{item.label}</span>
                                        <span className={`${styles.fieldValue} ${styles.mono}`}>{item.val || '—'}</span>
                                    </div>
                                ))}
                                <div className={`${styles.field} ${styles.premiumRow}`}>
                                    <span className={styles.fieldLabel} style={{ fontWeight: 700, color: 'var(--text-high)' }}>
                                        DIC Annual Premium
                                    </span>
                                    <span className={`${styles.premiumValue} ${styles.premiumDic}`}>
                                        {declaration.dic_annual_premium_raw != null
                                            ? fmtCurrency(declaration.dic_annual_premium_raw)
                                            : '—'}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <div className={styles.emptyDic}>
                                <ShieldCheck size={24} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
                                <span className={styles.emptyDicTitle}>No Companion DIC Linked</span>
                                <span className={styles.emptyDicSubtext}>
                                    Upload a companion DIC dec page or toggle &quot;DIC Exists&quot; in Edit Policy.
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* Supporting Details: Property, Policy Period, Perils            */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className={styles.triGrid}>
                {/* Property Details */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardHeaderLeft}>
                            <Home size={14} style={{ color: '#3b82f6' }} />
                            <h3>Property Specs</h3>
                        </div>
                    </div>
                    <div className={styles.cardBody}>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Location</span>
                            <span className={styles.fieldValue}>{toDisplay(declaration.property_location)}</span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Year Built</span>
                            <span className={`${styles.fieldValue} ${styles.mono}`}>{declaration.year_built > 0 ? declaration.year_built : '—'}</span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Construction</span>
                            <span className={styles.fieldValue}>{toDisplay(declaration.construction_type)}</span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Occupancy</span>
                            <span className={styles.fieldValue}>{toDisplay(declaration.occupancy)}</span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Units</span>
                            <span className={`${styles.fieldValue} ${styles.mono}`}>{declaration.number_of_units > 0 ? declaration.number_of_units : '—'}</span>
                        </div>
                        {enrichmentMap.living_area && (
                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Living Area</span>
                                <span className={`${styles.fieldValue} ${styles.mono}`}>{enrichmentMap.living_area} sq ft</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Status & Policy Period */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardHeaderLeft}>
                            <Calendar size={14} style={{ color: '#8b5cf6' }} />
                            <h3>Policy Period</h3>
                        </div>
                    </div>
                    <div className={styles.cardBody}>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Effective</span>
                            <span className={`${styles.fieldValue} ${styles.mono}`}>{fmtDate(declaration.policy_period_start)}</span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Expiration</span>
                            <span className={`${styles.fieldValue} ${styles.mono}`}>{fmtDate(declaration.policy_period_end)}</span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Date Issued</span>
                            <span className={`${styles.fieldValue} ${styles.mono}`}>{fmtDate(declaration.date_issued)}</span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Renewal Date</span>
                            <span className={`${styles.fieldValue} ${styles.mono}`}>{fmtDate(declaration.renewal_date)}</span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Term Duration</span>
                            <span className={`${styles.fieldValue} ${styles.mono}`}>12 Months</span>
                        </div>
                    </div>
                </div>

                {/* Perils Insured Against */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardHeaderLeft}>
                            <Shield size={14} style={{ color: '#f59e0b' }} />
                            <h3>Covered Perils</h3>
                        </div>
                    </div>
                    <div className={styles.cardBody}>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Fire / Smoke / Expl.</span>
                            <span className={styles.fieldValue}>{toDisplay(declaration.cb_fire_lightning_smoke_damage)}</span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Extended Coverages</span>
                            <span className={styles.fieldValue}>{toDisplay(declaration.cb_extended_coverages)}</span>
                        </div>
                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>Vandalism / Mischief</span>
                            <span className={styles.fieldValue}>{toDisplay(declaration.cb_vandalism_malicious_mischief)}</span>
                        </div>
                        {declaration.broker_name && (
                            <div className={styles.field} style={{ marginTop: '0.2rem', borderTop: '1px dashed var(--border-default)', paddingTop: '0.3rem' }}>
                                <span className={styles.fieldLabel}>Broker</span>
                                <span className={styles.fieldValue}>{declaration.broker_name}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* Mortgagee Information                                           */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {(declaration.mortgagee_1_name || declaration.mortgagee_2_name) && (
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardHeaderLeft}>
                            <Building size={14} style={{ color: '#0ea5e9' }} />
                            <h3>Mortgagees &amp; Lenders on File</h3>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {declaration.mortgagee_2_name ? '2 LENDERS ON FILE' : '1 LENDER ON FILE'}
                        </span>
                    </div>
                    <div className={styles.cardBody}>
                        {declaration.mortgagee_1_name && (
                            <div className={styles.mortgageeBlock}>
                                <div className={styles.mortgageeHeader}>
                                    <span className={styles.mortgageeBadge}>1st Mortgagee</span>
                                    {declaration.mortgagee_1_loan_number && (
                                        <span className={styles.loanBadge}>Loan #{declaration.mortgagee_1_loan_number}</span>
                                    )}
                                </div>
                                <div className={styles.mortgageeName}>{declaration.mortgagee_1_name}</div>
                                {declaration.mortgagee_1_address && (
                                    <div className={styles.mortgageeAddress}>
                                        <MapPin size={12} className={styles.mortgageeIcon} />
                                        <span>{declaration.mortgagee_1_address}</span>
                                    </div>
                                )}
                                {declaration.mortgagee_1_code && (
                                    <div className={styles.mortgageeMeta}>
                                        <span className={styles.metaKey}>Carrier Code:</span>
                                        <span className={styles.metaVal}>{declaration.mortgagee_1_code}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {declaration.mortgagee_2_name && (
                            <div className={styles.mortgageeBlock}>
                                <div className={styles.mortgageeHeader}>
                                    <span className={styles.mortgageeBadgeSecond}>2nd Mortgagee</span>
                                    {declaration.mortgagee_2_loan_number && (
                                        <span className={styles.loanBadge}>Loan #{declaration.mortgagee_2_loan_number}</span>
                                    )}
                                </div>
                                <div className={styles.mortgageeName}>{declaration.mortgagee_2_name}</div>
                                {declaration.mortgagee_2_address && (
                                    <div className={styles.mortgageeAddress}>
                                        <MapPin size={12} className={styles.mortgageeIcon} />
                                        <span>{declaration.mortgagee_2_address}</span>
                                    </div>
                                )}
                                {declaration.mortgagee_2_code && (
                                    <div className={styles.mortgageeMeta}>
                                        <span className={styles.metaKey}>Carrier Code:</span>
                                        <span className={styles.metaVal}>{declaration.mortgagee_2_code}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

