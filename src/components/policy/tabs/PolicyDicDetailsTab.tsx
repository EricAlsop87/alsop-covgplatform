'use client';

import React, { useState } from 'react';
import { Declaration, PolicyDetail, DicDocData } from '@/lib/api';
import { Card } from '@/components/ui/Card/Card';
import { ShieldCheck, AlertCircle, FileText, User, DollarSign, Home, HomeIcon, Layers, Calendar, Copy } from 'lucide-react';
import fallbackStyles from '../PolicyDashboard.module.css';
import styles from './PolicyDicDetailsTab.module.css';

interface PolicyDicDetailsTabProps {
    declaration: Declaration;
    policyDetail?: PolicyDetail;
    dicDocData?: DicDocData[];
}

/* ── Formatters ──────────────────────────────────────────────── */
function fmtCurrency(val: number | string | null | undefined): string {
    if (val == null) return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return String(val);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

function toDisplay(value: unknown): string {
    if (value == null || value === '') return '—';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    try { return JSON.stringify(value); } catch { return '—'; }
}

/* ── Sub-components ──────────────────────────────────────────── */
function Field({ label, value, mono }: { label: string; value: unknown; mono?: boolean }) {
    const display = toDisplay(value);
    return (
        <div className={styles.field}>
            <span className={styles.fieldLabel}>{label}</span>
            <span className={`${styles.fieldValue} ${mono ? styles.mono : ''}`}>{display}</span>
        </div>
    );
}

function SectionCard({ icon, title, children, className }: {
    icon: React.ReactNode; title: string; children: React.ReactNode; className?: string;
}) {
    return (
        <div className={`${styles.card} ${className || ''}`}>
            <div className={styles.cardHeader}>
                {icon}
                <h3>{title}</h3>
            </div>
            <div className={styles.cardBody}>
                {children}
            </div>
        </div>
    );
}

/* ── Main Component ──────────────────────────────────────────── */
export function PolicyDicDetailsTab({ declaration, policyDetail, dicDocData = [] }: PolicyDicDetailsTabProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [showCompare, setShowCompare] = useState(false);

    const hasDicDoc = dicDocData.length > 0;
    const hasFallbackDic = declaration.dic_exists || !!declaration.dic_limit_dwelling;

    if (!hasDicDoc && !hasFallbackDic) {
        return (
            <div className={fallbackStyles.container}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4rem 2rem',
                    textAlign: 'center',
                    gap: '1rem',
                }}>
                    <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: 'rgba(107, 114, 128, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)',
                    }}>
                        <ShieldCheck size={28} />
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        No DIC Policy Linked
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '400px', lineHeight: 1.5, margin: 0 }}>
                        No DIC (Difference in Conditions) carrier policy has been uploaded or linked to this policy yet.
                        You can upload a DIC dec page from the action bar above, or toggle &quot;DIC Exists&quot; in the Edit Policy panel.
                    </p>
                </div>
            </div>
        );
    }

    if (!hasDicDoc) {
        // ── Fallback Legacy View ──
        return (
            <div className={fallbackStyles.container}>
                <h2 className={fallbackStyles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldCheck size={20} style={{ color: '#10b981' }} />
                    DIC Policy Details
                </h2>

                <div className={fallbackStyles.grid}>
                    {/* DIC Policy Info */}
                    <Card className={fallbackStyles.card}>
                        <h3>DIC Policy Information</h3>
                        <div className={fallbackStyles.field}>
                            <label>DIC Company:</label>
                            <span>{declaration.dic_company || '—'}</span>
                        </div>
                        <div className={fallbackStyles.field}>
                            <label>DIC Policy Number:</label>
                            <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                                {declaration.dic_policy_number || policyDetail?.dic_policy_number || '—'}
                            </span>
                        </div>
                        <div className={fallbackStyles.field}>
                            <label>DIC Coverage Exists:</label>
                            <span style={{
                                color: '#10b981',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                            }}>
                                <ShieldCheck size={14} /> Active
                            </span>
                        </div>
                    </Card>

                    {/* DIC Coverage Limits */}
                    <Card className={fallbackStyles.card}>
                        <h3>DIC Coverage Limits</h3>
                        <div className={fallbackStyles.field}>
                            <label>Cov A — Dwelling:</label>
                            <span>{declaration.dic_limit_dwelling || '—'}</span>
                        </div>
                        <div className={fallbackStyles.field}>
                            <label>Cov B — Other Structures:</label>
                            <span>{declaration.dic_limit_other_structures || '—'}</span>
                        </div>
                        <div className={fallbackStyles.field}>
                            <label>Cov C — Personal Property:</label>
                            <span>{declaration.dic_limit_personal_property || '—'}</span>
                        </div>
                        <div className={fallbackStyles.field}>
                            <label>Cov E — Loss of Use:</label>
                            <span>{declaration.dic_limit_loss_of_use || '—'}</span>
                        </div>
                        <div className={fallbackStyles.field}>
                            <label>Deductible:</label>
                            <span>{declaration.dic_deductible || '—'}</span>
                        </div>
                    </Card>

                    {/* DIC Premium */}
                    <Card className={fallbackStyles.card}>
                        <h3>DIC Premium</h3>
                        <div className={fallbackStyles.field}>
                            <label>Annual Premium:</label>
                            <span className={fallbackStyles.premium}>
                                {declaration.dic_annual_premium_raw != null
                                    ? `$${Number(declaration.dic_annual_premium_raw).toLocaleString()}`
                                    : '—'}
                            </span>
                        </div>
                    </Card>

                    {/* Data Source Info */}
                    <Card className={fallbackStyles.card}>
                        <h3>Data Source</h3>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <AlertCircle size={14} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
                                <span>
                                    DIC coverage data is extracted automatically from uploaded DIC carrier declaration pages
                                    (PSIC, Bamboo, Aegis) using AI extraction.
                                    Values may be manually adjusted via the Edit Policy panel.
                                </span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                DIC data is stored separately and never overwrites CFP / FAIR Plan policy data.
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    const doc = dicDocData[activeIndex];

    return (
        <div className={styles.wrapper}>
            <div className={styles.pageHeader}>
                <ShieldCheck size={20} />
                <h2>DIC Policy Details</h2>
            </div>

            {dicDocData.length > 1 && (
                <div className={styles.docSelector}>
                    {dicDocData.map((d, i) => (
                        <div
                            key={i}
                            className={`${styles.docPill} ${i === activeIndex && !showCompare ? styles.active : ''}`}
                            onClick={() => { setActiveIndex(i); setShowCompare(false); }}
                        >
                            {d.carrier_name || 'Unknown Carrier'} • {d.file_name}
                        </div>
                    ))}
                    <div
                        className={`${styles.compareToggle} ${showCompare ? styles.active : ''}`}
                        onClick={() => setShowCompare(!showCompare)}
                    >
                        <Copy size={14} /> Compare All
                    </div>
                </div>
            )}

            {showCompare ? (
                <div className={styles.compareTableWrapper}>
                    <table className={styles.compareTable}>
                        <thead>
                            <tr>
                                <th>Field</th>
                                {dicDocData.map((d, i) => (
                                    <th key={i}>{d.carrier_name || `Doc ${i + 1}`}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <th>Policy Number</th>
                                {dicDocData.map((d, i) => <td key={i}>{toDisplay(d.policy_number)}</td>)}
                            </tr>
                            <tr>
                                <th>Effective Date</th>
                                {dicDocData.map((d, i) => <td key={i}>{toDisplay(d.effective_date)}</td>)}
                            </tr>
                            <tr>
                                <th>Cov A Dwelling</th>
                                {dicDocData.map((d, i) => <td key={i}>{fmtCurrency(d.cov_a_dwelling)}</td>)}
                            </tr>
                            <tr>
                                <th>Cov B Other Structures</th>
                                {dicDocData.map((d, i) => <td key={i}>{fmtCurrency(d.cov_b_other_struct)}</td>)}
                            </tr>
                            <tr>
                                <th>Cov C Personal Property</th>
                                {dicDocData.map((d, i) => <td key={i}>{fmtCurrency(d.cov_c_personal_prop)}</td>)}
                            </tr>
                            <tr>
                                <th>Cov D/E Loss of Use</th>
                                {dicDocData.map((d, i) => <td key={i}>{fmtCurrency(d.cov_e_add_living)}</td>)}
                            </tr>
                            <tr>
                                <th>Deductible</th>
                                {dicDocData.map((d, i) => <td key={i}>{fmtCurrency(d.deductible)}</td>)}
                            </tr>
                            <tr>
                                <th>Total Premium</th>
                                {dicDocData.map((d, i) => <td key={i}>{fmtCurrency(d.total_charge)}</td>)}
                            </tr>
                        </tbody>
                    </table>
                </div>
            ) : (
                <>
                    <div className={styles.dualGrid}>
                        {/* ── Policy Information ── */}
                        <SectionCard
                            icon={<FileText size={15} style={{ color: '#3b82f6' }} />}
                            title="Policy Information"
                        >
                            <Field label="Carrier Name" value={doc.carrier_name} />
                            <Field label="Policy Number" value={doc.policy_number} mono />
                            <Field label="Policy Form" value={doc.policy_form} />
                            <Field label="Effective Date" value={doc.effective_date} mono />
                            <Field label="Expiration Date" value={doc.expiration_date} mono />
                        </SectionCard>

                        {/* ── Insured & Property ── */}
                        <SectionCard
                            icon={<User size={15} style={{ color: '#8b5cf6' }} />}
                            title="Insured & Property"
                        >
                            <Field label="Insured Name" value={doc.insured_name || doc.extracted_owner_name} />
                            <Field label="Secondary Insured" value={doc.secondary_insured} />
                            <Field label="Property Address" value={doc.property_address || doc.extracted_address} />
                            <Field label="Mailing Address" value={doc.mailing_address} />
                        </SectionCard>
                    </div>

                    <div className={styles.dualGrid}>
                        {/* ── Coverage Limits ── */}
                        <SectionCard
                            icon={<HomeIcon size={15} style={{ color: '#10b981' }} />}
                            title="Coverage Limits"
                        >
                            <div className={styles.fieldGrid}>
                                <Field label="Cov A - Dwelling" value={fmtCurrency(doc.cov_a_dwelling)} mono />
                                <Field label="Cov B - Other Struct" value={fmtCurrency(doc.cov_b_other_struct)} mono />
                                <Field label="Cov C - Personal Prop" value={fmtCurrency(doc.cov_c_personal_prop)} mono />
                                <Field label="Cov E - Add Living" value={fmtCurrency(doc.cov_e_add_living)} mono />
                                <Field label="Cov L - Liability" value={fmtCurrency(doc.cov_l_liability)} mono />
                                <Field label="Cov M - Medical" value={fmtCurrency(doc.cov_m_medical)} mono />
                                <Field label="Deductible" value={fmtCurrency(doc.deductible)} mono />
                            </div>
                            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-default)' }}>
                                <Field label="Ordinance or Law" value={doc.ordinance_or_law ? 'Yes' : 'No'} />
                                <Field label="Extended Repl Cost" value={doc.extended_repl_cost ? 'Yes' : 'No'} />
                                <Field label="Sewer Backup" value={doc.sewer_backup ? 'Yes' : 'No'} />
                            </div>
                        </SectionCard>

                        {/* ── Premium Breakdown ── */}
                        <SectionCard
                            icon={<DollarSign size={15} style={{ color: '#f59e0b' }} />}
                            title="Premium Breakdown"
                        >
                            <Field label="Basic Premium" value={fmtCurrency(doc.basic_premium)} mono />
                            <Field label="Optional Premium" value={fmtCurrency(doc.optional_premium)} mono />
                            <Field label="Credits" value={fmtCurrency(doc.credits)} mono />
                            <Field label="Surcharges" value={fmtCurrency(doc.surcharges)} mono />
                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-default)' }}>
                                <Field label="Total Charge" value={fmtCurrency(doc.total_charge)} mono />
                            </div>
                        </SectionCard>
                    </div>

                    <div className={styles.dualGrid}>
                        {/* ── DIC Endorsement ── */}
                        <SectionCard
                            icon={<ShieldCheck size={15} style={{ color: '#ec4899' }} />}
                            title="DIC Endorsement"
                        >
                            <Field label="Has DIC Endorsement" value={doc.has_dic_endorsement ? 'Yes' : 'No'} />
                            <Field label="DIC Form Number" value={doc.dic_form_number} />
                            <Field label="Eliminates Fire" value={doc.dic_eliminates_fire ? 'Yes' : 'No'} />
                            <Field label="Requires FAIR Plan" value={doc.requires_fair_plan ? 'Yes' : 'No'} />
                        </SectionCard>

                        {/* ── Embedded RCE Data ── */}
                        {(doc.rce_estimate_number || doc.rce_replacement_cost) && (
                            <SectionCard
                                icon={<Layers size={15} style={{ color: '#06b6d4' }} />}
                                title="Embedded RCE Data"
                            >
                                <Field label="Estimate Number" value={doc.rce_estimate_number} />
                                <Field label="Replacement Cost" value={fmtCurrency(doc.rce_replacement_cost)} mono />
                                <Field label="Insured Value" value={fmtCurrency(doc.rce_insured_value)} mono />
                                <Field label="Year Built" value={doc.rce_year_built} />
                                <Field label="Living Area" value={doc.rce_living_area ? `${doc.rce_living_area} sqft` : undefined} />
                                <Field label="Quality Grade" value={doc.rce_quality_grade} />
                            </SectionCard>
                        )}
                    </div>

                    {/* ── Forms & Endorsements ── */}
                    {Array.isArray(doc.forms_endorsements) && (doc.forms_endorsements as any[]).length > 0 && (
                        <SectionCard
                            icon={<FileText size={15} style={{ color: '#64748b' }} />}
                            title="Forms & Endorsements"
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {(doc.forms_endorsements as any[]).map((form: any, idx: number) => (
                                    <div key={idx} style={{ fontSize: '0.78rem', color: 'var(--text-high)' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text-mid)', marginRight: '0.5rem' }}>
                                            {form.form_number}
                                        </span>
                                        {form.title}
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    )}

                    {/* ── Document Info ── */}
                    <div className={styles.docInfo}>
                        <Calendar size={12} />
                        <span>
                            {[
                                doc.file_name && `File: ${doc.file_name}`,
                                doc.created_at && `Extracted: ${new Date(doc.created_at).toLocaleDateString()}`,
                            ].filter(Boolean).join(' · ')}
                        </span>
                    </div>
                </>
            )}
        </div>
    );
}

