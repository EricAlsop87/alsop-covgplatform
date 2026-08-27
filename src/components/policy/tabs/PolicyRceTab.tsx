'use client';

import React, { useState } from 'react';
import { Declaration, PropertyEnrichment, RceDocData } from '@/lib/api';
import { normalizeInputs, calculateEstimate } from '@/lib/rce/InterimEstimator';
import { InterimRceWidget } from '../InterimRceWidget';
import { Shield, FileText, AlertCircle, Home, DollarSign, Hammer, Layers, Thermometer, Warehouse, Calendar, TrendingUp, MapPin, Building2 } from 'lucide-react';
import styles from './PolicyRceTab.module.css';

interface PolicyRceTabProps {
    declaration: Declaration;
    enrichments?: PropertyEnrichment[];
    rceDocData?: RceDocData[];
}

/* ── Formatters ──────────────────────────────────────────────── */

function fmtCurrency(val: number | string | null | undefined): string {
    if (val == null) return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return String(val);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

function fmtNumber(val: number | string | null | undefined): string {
    if (val == null) return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return String(val);
    return new Intl.NumberFormat('en-US').format(num);
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

/** Pretty-print label for a JSON key */
function prettyKey(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/pct$/i, '%')
        .replace(/sqft$/i, 'Sq Ft')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/** Pretty-print a value for display */
function prettyVal(val: unknown): string {
    if (val == null || val === '' || val === 'null') return '—';
    if (typeof val === 'number') return new Intl.NumberFormat('en-US').format(val);
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
}

/**
 * Renders an object/JSON field as readable sub-rows instead of raw JSON.
 * Falls back to a plain Field for primitives.
 */
function StructuredField({ label, value }: { label: string; value: unknown }) {
    if (value == null || value === '') {
        return <Field label={label} value={null} />;
    }

    // Parse JSON strings
    let parsed: unknown = value;
    if (typeof value === 'string') {
        try { parsed = JSON.parse(value); } catch { /* keep as string */ }
    }

    // If it's still a primitive after parsing, render as plain field
    if (typeof parsed !== 'object' || parsed === null) {
        return <Field label={label} value={parsed} />;
    }

    // Render object as sub-field rows under a label header
    const entries = Object.entries(parsed as Record<string, unknown>)
        .filter(([, v]) => v != null && v !== '' && v !== 'null');

    if (entries.length === 0) {
        return <Field label={label} value="—" />;
    }

    return (
        <div className={styles.structuredField}>
            <span className={styles.structuredLabel}>{label}</span>
            <div className={styles.structuredRows}>
                {entries.map(([k, v]) => (
                    <div key={k} className={styles.structuredRow}>
                        <span className={styles.structuredKey}>{prettyKey(k)}</span>
                        <span className={styles.structuredVal}>{prettyVal(v)}</span>
                    </div>
                ))}
            </div>
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

/** Render structured data — handles JSONB objects, arrays, and JSON strings */
function BreakdownList({ data }: { data: unknown }) {
    if (data == null || data === '') {
        return <span className={styles.muted}>No data available</span>;
    }

    let parsed: unknown = data;
    if (typeof data === 'string') {
        try { parsed = JSON.parse(data); } catch { /* keep as string */ }
    }

    if (Array.isArray(parsed)) {
        return (
            <div className={styles.breakdownList}>
                {parsed.map((item: unknown, i: number) => (
                    <div key={i} className={styles.breakdownItem}>
                        {typeof item === 'object' && item !== null
                            ? Object.entries(item)
                                .filter(([, v]) => v != null && v !== '' && v !== 0)
                                .map(([k, v]) => `${k}: ${v}`).join(' · ')
                            : String(item)
                        }
                    </div>
                ))}
            </div>
        );
    }

    if (typeof parsed === 'object' && parsed !== null) {
        return (
            <div className={styles.fieldGrid}>
                {Object.entries(parsed as Record<string, unknown>).map(([k, v], i) => (
                    <Field
                        key={i}
                        label={k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        value={typeof v === 'number' ? fmtCurrency(v) : v}
                    />
                ))}
            </div>
        );
    }

    return <span className={styles.muted} style={{ whiteSpace: 'pre-wrap' }}>{String(parsed)}</span>;
}

/**
 * Full 4-column cost breakdown table (Labor, Equipment/Misc, Material, Total)
 * matching the American Modern "Valuation Totals Detail" PDF layout.
 */
function FullCostBreakdown({ data, covA }: { data: unknown; covA?: { without_debris?: number | null; debris_removal?: number | null; with_debris?: number | null } }) {
    if (data == null || data === '') {
        return <span className={styles.muted}>No data available</span>;
    }

    let parsed: unknown = data;
    if (typeof data === 'string') {
        try { parsed = JSON.parse(data); } catch { /* keep as string */ }
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return <BreakdownList data={parsed} />;
    }

    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) {
        return <span className={styles.muted}>No data available</span>;
    }

    // Build rows: each entry is { category, labor, equipment, material, total }
    type CostRow = { category: string; labor: number; equipment: number; material: number; total: number };
    const rows: CostRow[] = [];
    let subtotalRow: CostRow | null = null;

    for (const [category, values] of entries) {
        if (typeof values === 'object' && values !== null && !Array.isArray(values)) {
            const row = values as Record<string, number | undefined>;
            const r: CostRow = {
                category,
                labor: row.labor ?? 0,
                equipment: row.equipment ?? 0,
                material: row.material ?? 0,
                total: row.total ?? 0,
            };
            if (category.toLowerCase().startsWith('subtotal')) {
                subtotalRow = r;
            } else {
                rows.push(r);
            }
        } else if (typeof values === 'number') {
            rows.push({ category, labor: 0, equipment: 0, material: 0, total: values });
        }
    }

    // Filter out all-zero rows
    const visibleRows = rows.filter(r => r.labor !== 0 || r.equipment !== 0 || r.material !== 0 || r.total !== 0);

    return (
        <div className={styles.costTableWrapper}>
            <table className={styles.costTable}>
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Labor</th>
                        <th>Equip / Misc</th>
                        <th>Material</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {visibleRows.map((r, i) => (
                        <tr key={i}>
                            <td>{r.category}</td>
                            <td className={styles.costNum}>{fmtCurrency(r.labor)}</td>
                            <td className={styles.costNum}>{fmtCurrency(r.equipment)}</td>
                            <td className={styles.costNum}>{fmtCurrency(r.material)}</td>
                            <td className={styles.costNum}>{fmtCurrency(r.total)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    {subtotalRow && (
                        <tr className={styles.costSubtotal}>
                            <td><strong>Subtotal</strong></td>
                            <td className={styles.costNum}><strong>{fmtCurrency(subtotalRow.labor)}</strong></td>
                            <td className={styles.costNum}><strong>{fmtCurrency(subtotalRow.equipment)}</strong></td>
                            <td className={styles.costNum}><strong>{fmtCurrency(subtotalRow.material)}</strong></td>
                            <td className={styles.costNum}><strong>{fmtCurrency(subtotalRow.total)}</strong></td>
                        </tr>
                    )}
                    {covA?.without_debris != null && (
                        <>
                            <tr className={styles.costSummaryRow}>
                                <td colSpan={4}>Reconstruction Cost w/o Debris Removal</td>
                                <td className={styles.costNum}><strong>{fmtCurrency(covA.without_debris)}</strong></td>
                            </tr>
                            <tr className={styles.costSummaryRow}>
                                <td colSpan={4}>Debris Removal</td>
                                <td className={styles.costNum}>{fmtCurrency(covA.debris_removal)}</td>
                            </tr>
                            <tr className={styles.costTotalRow}>
                                <td colSpan={4}><strong>Reconstruction Cost with Debris Removal</strong></td>
                                <td className={styles.costNum}><strong>{fmtCurrency(covA.with_debris)}</strong></td>
                            </tr>
                        </>
                    )}
                </tfoot>
            </table>
        </div>
    );
}

/**
 * Renders the materials_detail JSONB as a structured, grouped display.
 * Each key is displayed as a label-value row, grouped into logical sections.
 */
function MaterialsDisplay({ data }: { data: unknown }) {
    if (data == null || data === '') {
        return <span className={styles.muted}>No data available</span>;
    }

    let parsed: unknown = data;
    if (typeof data === 'string') {
        try { parsed = JSON.parse(data); } catch { return <span className={styles.muted}>{String(data)}</span>; }
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return <BreakdownList data={parsed} />;
    }

    const entries = Object.entries(parsed as Record<string, unknown>)
        .filter(([, v]) => v != null && v !== '' && v !== 'null');

    if (entries.length === 0) {
        return <span className={styles.muted}>No data available</span>;
    }

    return (
        <div className={styles.materialsGrid}>
            {entries.map(([key, val], i) => (
                <div key={i} className={styles.materialRow}>
                    <span className={styles.materialLabel}>{prettyKey(key)}</span>
                    <span className={styles.materialValue}>{String(val)}</span>
                </div>
            ))}
        </div>
    );
}

/**
 * Renders kitchen/bath JSONB data as clean, human-readable text.
 * Handles the structure: { kitchens: [{type, count}], bathrooms: [{type, count}] }
 */
function KitchenBathDisplay({ data }: { data: unknown }) {
    if (data == null || data === '') {
        return <span className={styles.muted}>No data available</span>;
    }

    let parsed: unknown = data;
    if (typeof data === 'string') {
        try { parsed = JSON.parse(data); } catch { return <span className={styles.muted}>{String(data)}</span>; }
    }

    if (typeof parsed !== 'object' || parsed === null) {
        return <span className={styles.muted}>{String(parsed)}</span>;
    }

    const obj = parsed as Record<string, unknown>;
    const fields: Array<{ label: string; value: string }> = [];

    // Handle kitchens array
    const kitchens = obj.kitchens as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(kitchens)) {
        kitchens.forEach((k) => {
            const type = k.type || k.name || 'Kitchen';
            const count = k.count || 1;
            fields.push({ label: 'Kitchen', value: `${type}${Number(count) > 1 ? ` × ${count}` : ''}` });
        });
    }

    // Handle bathrooms array
    const bathrooms = obj.bathrooms as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(bathrooms)) {
        bathrooms.forEach((b) => {
            const type = b.type || b.name || 'Bathroom';
            const count = b.count || 1;
            fields.push({ label: 'Bathroom', value: `${type}${Number(count) > 1 ? ` × ${count}` : ''}` });
        });
    }

    // Handle any other top-level keys (plumbing, etc.)
    for (const [key, val] of Object.entries(obj)) {
        if (key === 'kitchens' || key === 'bathrooms') continue;
        if (val == null || val === '') continue;
        if (typeof val === 'string' || typeof val === 'number') {
            fields.push({ label: prettyKey(key), value: String(val) });
        }
    }

    if (fields.length === 0) {
        // Fallback: render as generic field grid
        return <BreakdownList data={parsed} />;
    }

    return (
        <div className={styles.fieldGrid}>
            {fields.map((f, i) => (
                <Field key={i} label={f.label} value={f.value} />
            ))}
        </div>
    );
}


/* ── Main Component ──────────────────────────────────────────── */

export function PolicyRceTab({ declaration, enrichments = [], rceDocData = [] }: PolicyRceTabProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isCompareMode, setIsCompareMode] = useState(false);

    const policyId = declaration.policy_id || declaration.id;
    const rceInput = normalizeInputs({ id: policyId, property_address_raw: declaration.property_location }, enrichments);
    const rceEstimate = calculateEstimate(rceInput);

    const hasRceEnrichments = enrichments.some(e =>
        e.source_name === 'rce_360value' || e.source_name === 'rce_american_modern' || e.source_name === 'dic_embedded_360value'
    );

    const rce = rceDocData.length > 0 ? rceDocData[selectedIndex] : null;
    const hasRceDocData = rce !== null;
    const isAmericanModern = rce?.source === 'rce_american_modern';

    return (
        <div className={styles.wrapper}>
            {/* ── Page Header ── */}
            <div className={styles.pageHeader}>
                <Shield size={20} />
                <h2>Replacement Cost Estimate</h2>
            </div>

            {/* ── Interim Widget (only when NO actual RCE) ── */}
            {!hasRceDocData && (
                <div style={{ marginBottom: '1rem' }}>
                    <InterimRceWidget estimate={rceEstimate} />
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* 360Value RCE Document Data                               */}
            {/* ══════════════════════════════════════════════════════════ */}
            {hasRceDocData ? (
                <>
                    {rceDocData.length > 1 && (
                        <div className={styles.selectorBar}>
                            <div className={styles.pills}>
                                {rceDocData.map((doc, idx) => {
                                    const label = doc.valuation_id || (doc.file_name ? `${doc.file_name} ${doc.date_calculated || ''}`.trim() : `Document ${idx + 1}`);
                                    return (
                                        <button 
                                            key={idx} 
                                            className={`${styles.pill} ${!isCompareMode && selectedIndex === idx ? styles.pillActive : ''}`}
                                            onClick={() => {
                                                setSelectedIndex(idx);
                                                setIsCompareMode(false);
                                            }}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                            <button 
                                className={`${styles.pill} ${styles.compareToggle} ${isCompareMode ? styles.pillActive : ''}`}
                                onClick={() => setIsCompareMode(!isCompareMode)}
                            >
                                Compare All
                            </button>
                        </div>
                    )}
                    
                    {isCompareMode ? (
                        <div className={styles.compareView}>
                            <div className={styles.compareTableWrapper}>
                                <table className={styles.compareTable}>
                                    <thead>
                                        <tr>
                                            <th>Field</th>
                                            {rceDocData.map((doc, idx) => {
                                                const label = doc.valuation_id || (doc.file_name ? `${doc.file_name} ${doc.date_calculated || ''}`.trim() : `Doc ${idx + 1}`);
                                                return <th key={idx}>{label}</th>;
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>Replacement Cost</td>
                                            {rceDocData.map((doc, idx) => <td key={idx}>{fmtCurrency(doc.replacement_cost)}</td>)}
                                        </tr>
                                        <tr>
                                            <td>Range (Low-High)</td>
                                            {rceDocData.map((doc, idx) => (
                                                <td key={idx}>
                                                    {(doc.replacement_range_low || doc.replacement_range_high) 
                                                        ? `${fmtCurrency(doc.replacement_range_low)} – ${fmtCurrency(doc.replacement_range_high)}` 
                                                        : '—'}
                                                </td>
                                            ))}
                                        </tr>
                                        <tr>
                                            <td>ACV</td>
                                            {rceDocData.map((doc, idx) => <td key={idx}>{fmtCurrency(doc.actual_cash_value)}</td>)}
                                        </tr>
                                        <tr>
                                            <td>Sq Feet</td>
                                            {rceDocData.map((doc, idx) => <td key={idx}>{doc.sq_feet ? fmtNumber(doc.sq_feet) : '—'}</td>)}
                                        </tr>
                                        <tr>
                                            <td>Year Built</td>
                                            {rceDocData.map((doc, idx) => <td key={idx}>{doc.year_built || '—'}</td>)}
                                        </tr>
                                        <tr>
                                            <td>Quality Grade</td>
                                            {rceDocData.map((doc, idx) => <td key={idx}>{doc.quality_grade || '—'}</td>)}
                                        </tr>
                                        <tr>
                                            <td>Cost / Sq Ft</td>
                                            {rceDocData.map((doc, idx) => <td key={idx}>{doc.cost_per_sqft ? fmtCurrency(doc.cost_per_sqft) : '—'}</td>)}
                                        </tr>
                                        <tr>
                                            <td>Roof Year</td>
                                            {rceDocData.map((doc, idx) => <td key={idx}>{doc.roof_year || '—'}</td>)}
                                        </tr>
                                        <tr>
                                            <td>Roof Cover</td>
                                            {rceDocData.map((doc, idx) => <td key={idx}>{doc.roof_cover || '—'}</td>)}
                                        </tr>
                                        <tr>
                                            <td>Foundation Type</td>
                                            {rceDocData.map((doc, idx) => <td key={idx}>{doc.foundation_type || '—'}</td>)}
                                        </tr>
                                        <tr>
                                            <td>Wall Construction</td>
                                            {rceDocData.map((doc, idx) => <td key={idx}>{doc.wall_construction || '—'}</td>)}
                                        </tr>
                                        <tr>
                                            <td>Stories</td>
                                            {rceDocData.map((doc, idx) => <td key={idx}>{doc.stories || '—'}</td>)}
                                        </tr>
                                        <tr>
                                            <td>Valuation ID</td>
                                            {rceDocData.map((doc, idx) => <td key={idx}>{doc.valuation_id || '—'}</td>)}
                                        </tr>
                                        <tr>
                                            <td>Date Calculated</td>
                                            {rceDocData.map((doc, idx) => <td key={idx}>{doc.date_calculated || '—'}</td>)}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : isAmericanModern ? (
                        <>
                            {/* ══════════════════════════════════════════════ */}
                            {/* American Modern / Cotality RCT Express Layout */}
                            {/* ══════════════════════════════════════════════ */}

                            {/* ── Source Badge ── */}
                            <div className={styles.docInfo} style={{ marginBottom: '0.75rem' }}>
                                <Building2 size={12} />
                                <span style={{ fontWeight: 600, color: '#10b981' }}>
                                    American Modern · Cotality RCT Express®
                                </span>
                                {rce!.cost_data_as_of && (
                                    <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>
                                        Cost data as of {rce!.cost_data_as_of}
                                    </span>
                                )}
                            </div>

                            {/* ── Hero: Coverage A & B ── */}
                            <div className={styles.hero}>
                                <div className={styles.heroMain}>
                                    <span className={styles.heroLabel}>Coverage A — Reconstruction Cost</span>
                                    <span className={styles.heroCost}>{fmtCurrency(rce!.coverage_a_with_debris ?? rce!.replacement_cost)}</span>
                                    {rce!.coverage_a_without_debris != null && (
                                        <span className={styles.heroRange}>
                                            w/o Debris: {fmtCurrency(rce!.coverage_a_without_debris)} · Debris Removal: {fmtCurrency(rce!.coverage_a_debris_removal)}
                                        </span>
                                    )}
                                </div>
                                <div className={styles.heroMeta}>
                                    {rce!.coverage_b_with_debris != null && (
                                        <div className={styles.heroStat}>
                                            <span className={styles.heroStatLabel}>Coverage B (Other Structures)</span>
                                            <span className={styles.heroStatValue}>{fmtCurrency(rce!.coverage_b_with_debris)}</span>
                                        </div>
                                    )}
                                    <div className={styles.heroStat}>
                                        <span className={styles.heroStatLabel}>Cost / Sq Ft</span>
                                        <span className={styles.heroStatValue}>{rce!.cost_per_sqft ? fmtCurrency(rce!.cost_per_sqft) : '—'}</span>
                                    </div>
                                    <div className={styles.heroStat}>
                                        <span className={styles.heroStatLabel}>Construction Type</span>
                                        <span className={styles.heroStatValue}>{rce!.construction_type || '—'}</span>
                                    </div>
                                    <div className={styles.heroStat}>
                                        <span className={styles.heroStatLabel}>Year Built</span>
                                        <span className={styles.heroStatValue}>{rce!.year_built || '—'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* ── Coverage B Detail (only if present) ── */}
                            {rce!.coverage_b_with_debris != null && (
                                <SectionCard
                                    icon={<Warehouse size={15} style={{ color: '#f59e0b' }} />}
                                    title="Coverage B — Other Structures"
                                >
                                    <div className={styles.fieldGrid}>
                                        <Field label="Reconstruction Cost (w/o Debris)" value={fmtCurrency(rce!.coverage_b_without_debris)} mono />
                                        <Field label="Debris Removal" value={fmtCurrency(rce!.coverage_b_debris_removal)} mono />
                                        <Field label="Reconstruction Cost (with Debris)" value={fmtCurrency(rce!.coverage_b_with_debris)} mono />
                                        <Field label="% of Coverage A" value={rce!.coverage_b_pct_of_a != null ? `${rce!.coverage_b_pct_of_a}%` : null} mono />
                                    </div>
                                </SectionCard>
                            )}

                            {/* ── Property Overview ── */}
                            <SectionCard
                                icon={<Home size={15} style={{ color: '#6366f1' }} />}
                                title="Property Overview"
                            >
                                <div className={styles.fieldGrid}>
                                    <Field label="Finished Floor Area" value={rce!.finished_floor_area ? `${fmtNumber(rce!.finished_floor_area)} sq ft` : (rce!.sq_feet ? `${fmtNumber(rce!.sq_feet)} sq ft` : null)} mono />
                                    <Field label="Stories" value={rce!.stories} />
                                    <Field label="Style" value={rce!.style} />
                                    <Field label="Year Built" value={rce!.year_built} mono />
                                    <Field label="Construction Type" value={rce!.construction_type} />
                                    <Field label="Site Access" value={rce!.site_access} />
                                    <Field label="# of Families" value={rce!.num_families} />
                                    <Field label="Perimeter" value={rce!.perimeter} />
                                    <Field label="Wall Height" value={rce!.wall_height} />
                                </div>
                            </SectionCard>

                            {/* ── Foundation ── */}
                            <div className={styles.dualGrid}>
                                <SectionCard
                                    icon={<Hammer size={15} style={{ color: '#8b5cf6' }} />}
                                    title="Foundation"
                                >
                                    <Field label="Type" value={rce!.foundation_type} />
                                    <Field label="Material" value={rce!.foundation_material} />
                                </SectionCard>

                                {/* ── Systems ── */}
                                <SectionCard
                                    icon={<Thermometer size={15} style={{ color: '#ef4444' }} />}
                                    title="Systems"
                                >
                                    <Field label="Heating" value={rce!.heating} />
                                    <Field label="Air Conditioning" value={rce!.air_conditioning} />
                                    <StructuredField label="Electrical" value={rce!.electrical} />
                                    <StructuredField label="Fire Protection" value={rce!.fire_protection} />
                                </SectionCard>
                            </div>

                            {/* ── Materials Detail ── */}
                            {!!rce!.materials_detail && (
                                <SectionCard
                                    icon={<Building2 size={15} style={{ color: '#06b6d4' }} />}
                                    title="Materials Detail"
                                >
                                    <MaterialsDisplay data={rce!.materials_detail} />
                                </SectionCard>
                            )}

                            {/* ── Kitchen / Bath / Plumbing ── */}
                            {!!rce!.kitchens_baths && (
                                <SectionCard
                                    icon={<Home size={15} style={{ color: '#ec4899' }} />}
                                    title="Kitchen / Bath / Plumbing"
                                >
                                    <KitchenBathDisplay data={rce!.kitchens_baths} />
                                </SectionCard>
                            )}

                            {/* ── Garage / Structures ── */}
                            {!!rce!.garage_info && (
                                <SectionCard
                                    icon={<Warehouse size={15} style={{ color: '#14b8a6' }} />}
                                    title="Garage / Structures"
                                >
                                    <StructuredField label="Garage" value={rce!.garage_info} />
                                </SectionCard>
                            )}

                            {/* ── Exterior Features ── */}
                            {!!rce!.exterior_features && (
                                <SectionCard
                                    icon={<Home size={15} style={{ color: '#0ea5e9' }} />}
                                    title="Exterior Features"
                                >
                                    <BreakdownList data={rce!.exterior_features} />
                                </SectionCard>
                            )}

                            {/* ── Interior Features ── */}
                            {!!rce!.interior_features && (
                                <SectionCard
                                    icon={<Home size={15} style={{ color: '#a855f7' }} />}
                                    title="Interior Features"
                                >
                                    <BreakdownList data={rce!.interior_features} />
                                </SectionCard>
                            )}

                            {/* ── Cost Breakdown (Full 4-column table) ── */}
                            {!!rce!.detailed_cost_breakdown && (
                                <SectionCard
                                    icon={<TrendingUp size={15} style={{ color: '#22c55e' }} />}
                                    title="Valuation Totals Detail"
                                >
                                    <FullCostBreakdown
                                        data={rce!.detailed_cost_breakdown}
                                        covA={{
                                            without_debris: rce!.coverage_a_without_debris,
                                            debris_removal: rce!.coverage_a_debris_removal,
                                            with_debris: rce!.coverage_a_with_debris,
                                        }}
                                    />
                                </SectionCard>
                            )}

                            {/* ── Geospatial ── */}
                            {(rce!.latitude != null || rce!.longitude != null) && (
                                <SectionCard
                                    icon={<MapPin size={15} style={{ color: '#3b82f6' }} />}
                                    title="Geospatial Information"
                                >
                                    <div className={styles.fieldGrid}>
                                        <Field label="Latitude" value={rce!.latitude} mono />
                                        <Field label="Longitude" value={rce!.longitude} mono />
                                        <Field label="Source" value={rce!.coordinates_source} />
                                    </div>
                                </SectionCard>
                            )}

                            {/* ── Document Info (compact footer) ── */}
                            <div className={styles.docInfo}>
                                <Calendar size={12} />
                                <span>
                                    {[
                                        rce!.estimate_number && `Estimate: ${rce!.estimate_number}`,
                                        rce!.effective_date && `Effective: ${rce!.effective_date}`,
                                        rce!.renewal_date && `Renewal: ${rce!.renewal_date}`,
                                        rce!.insured_name && `Insured: ${rce!.insured_name}`,
                                        rce!.file_name && `File: ${rce!.file_name}`,
                                    ].filter(Boolean).join(' · ')}
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* ══════════════════════════════════════════════ */}
                            {/* 360Value RCE Layout (existing, unchanged)     */}
                            {/* ══════════════════════════════════════════════ */}

                            {/* ── Hero: Replacement Cost ── */}
                    <div className={styles.hero}>
                        <div className={styles.heroMain}>
                            <span className={styles.heroLabel}>Estimated Replacement Cost</span>
                            <span className={styles.heroCost}>{fmtCurrency(rce!.replacement_cost)}</span>
                            {(rce!.replacement_range_low || rce!.replacement_range_high) && (
                                <span className={styles.heroRange}>
                                    Range: {fmtCurrency(rce!.replacement_range_low)} – {fmtCurrency(rce!.replacement_range_high)}
                                </span>
                            )}
                        </div>
                        <div className={styles.heroMeta}>
                            <div className={styles.heroStat}>
                                <span className={styles.heroStatLabel}>Actual Cash Value</span>
                                <span className={styles.heroStatValue}>{fmtCurrency(rce!.actual_cash_value)}</span>
                            </div>
                            <div className={styles.heroStat}>
                                <span className={styles.heroStatLabel}>Cost / Sq Ft</span>
                                <span className={styles.heroStatValue}>{rce!.cost_per_sqft ? fmtCurrency(rce!.cost_per_sqft) : '—'}</span>
                            </div>
                            <div className={styles.heroStat}>
                                <span className={styles.heroStatLabel}>Quality Grade</span>
                                <span className={styles.heroStatValue}>{rce!.quality_grade || '—'}</span>
                            </div>
                            <div className={styles.heroStat}>
                                <span className={styles.heroStatLabel}>ACV Condition</span>
                                <span className={styles.heroStatValue}>{rce!.acv_condition || '—'}{rce!.acv_age ? ` (Age: ${rce!.acv_age})` : ''}</span>
                            </div>
                        </div>
                    </div>

                    {/* ── Property Overview ── */}
                    <SectionCard
                        icon={<Home size={15} style={{ color: '#6366f1' }} />}
                        title="Property Overview"
                    >
                        <div className={styles.fieldGrid}>
                            <Field label="Square Feet" value={rce!.sq_feet ? fmtNumber(rce!.sq_feet) : null} mono />
                            <Field label="Stories" value={rce!.stories} />
                            <Field label="Year Built" value={rce!.year_built} mono />
                            <Field label="Use Type" value={rce!.use_type} />
                            <Field label="Style" value={rce!.style} />
                            <Field label="Site Access" value={rce!.site_access} />
                            <Field label="Property Slope" value={rce!.property_slope} />
                        </div>
                    </SectionCard>

                    {/* ── Construction: Roof / Foundation / Walls ── */}
                    <div className={styles.triGrid}>
                        <SectionCard
                            icon={<Layers size={15} style={{ color: '#f59e0b' }} />}
                            title="Roof"
                        >
                            <Field label="Year" value={rce!.roof_year} />
                            <Field label="Cover" value={rce!.roof_cover} />
                            <Field label="Shape" value={rce!.roof_shape} />
                            <Field label="Construction" value={rce!.roof_construction} />
                            <Field label="Dormers" value={rce!.num_dormers} />
                        </SectionCard>

                        <SectionCard
                            icon={<Hammer size={15} style={{ color: '#8b5cf6' }} />}
                            title="Foundation"
                        >
                            <Field label="Shape" value={rce!.foundation_shape} />
                            <Field label="Material" value={rce!.foundation_material} />
                            <Field label="Type" value={rce!.foundation_type} />
                        </SectionCard>

                        <SectionCard
                            icon={<Hammer size={15} style={{ color: '#06b6d4' }} />}
                            title="Walls"
                        >
                            <Field label="Finish" value={rce!.wall_finish} />
                            <Field label="Construction" value={rce!.wall_construction} />
                            <Field label="Avg Height" value={rce!.avg_wall_height} />
                        </SectionCard>
                    </div>

                    {/* ── Interior ── */}
                    <SectionCard
                        icon={<Home size={15} style={{ color: '#ec4899' }} />}
                        title="Interior"
                    >
                        <div className={styles.fieldGrid}>
                            <Field label="Floor Coverings" value={rce!.floor_coverings} />
                            <Field label="Ceiling Finish" value={rce!.ceiling_finish} />
                            <Field label="Wall Material" value={rce!.interior_wall_material} />
                            <Field label="Wall Finish" value={rce!.interior_wall_finish} />
                        </div>
                        {!!rce!.rooms && (
                            <div className={styles.subSection}>
                                <span className={styles.subSectionLabel}>Rooms</span>
                                <BreakdownList data={rce!.rooms} />
                            </div>
                        )}
                    </SectionCard>

                    {/* ── Systems & Extras ── */}
                    <div className={styles.dualGrid}>
                        <SectionCard
                            icon={<Thermometer size={15} style={{ color: '#ef4444' }} />}
                            title="Systems"
                        >
                            <Field label="Heating" value={rce!.heating} />
                            <Field label="Air Conditioning" value={rce!.air_conditioning} />
                            <StructuredField label="Fireplace" value={rce!.fireplace_info} />
                        </SectionCard>

                        <SectionCard
                            icon={<Warehouse size={15} style={{ color: '#14b8a6' }} />}
                            title="Additional Structures"
                        >
                            <StructuredField label="Garage" value={rce!.garage_info} />
                            <StructuredField label="Porch" value={rce!.porch_info} />
                            {!!rce!.home_features && (
                                <div className={styles.subSection}>
                                    <span className={styles.subSectionLabel}>Home Features</span>
                                    <BreakdownList data={rce!.home_features} />
                                </div>
                            )}
                        </SectionCard>
                    </div>

                    {/* ── Cost Breakdown ── */}
                    {!!rce!.cost_breakdown && (
                        <SectionCard
                            icon={<TrendingUp size={15} style={{ color: '#22c55e' }} />}
                            title="Cost Breakdown"
                        >
                            <BreakdownList data={rce!.cost_breakdown} />
                        </SectionCard>
                    )}

                    {/* ── Document Info (compact footer) ── */}
                    <div className={styles.docInfo}>
                        <Calendar size={12} />
                        <span>
                            {[
                                rce!.valuation_id && `ID: ${rce!.valuation_id}`,
                                rce!.date_calculated && `Calculated: ${rce!.date_calculated}`,
                                rce!.date_entered && `Entered: ${rce!.date_entered}`,
                                rce!.created_by && `By: ${rce!.created_by}`,
                                rce!.file_name && `File: ${rce!.file_name}`,
                            ].filter(Boolean).join(' · ')}
                        </span>
                    </div>
                        </>
                    )}
                </>
            ) : (
                /* ── No RCE Doc Data — Enrichment fallback ── */
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <FileText size={15} />
                        <h3>RCE Data Sources</h3>
                    </div>
                    <div className={styles.cardBody}>
                        {hasRceEnrichments ? (
                            <div className={styles.fieldGrid}>
                                {enrichments
                                    .filter(e => e.source_name === 'rce_360value' || e.source_name === 'rce_american_modern' || e.source_name === 'dic_embedded_360value')
                                    .map(e => (
                                        <Field
                                            key={e.field_key}
                                            label={e.field_key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                            value={e.field_value || '—'}
                                        />
                                    ))}
                            </div>
                        ) : (
                            <div className={styles.emptyState}>
                                <AlertCircle size={16} />
                                <div>
                                    <strong>No standalone RCE document uploaded.</strong> Upload a certified 360Value,
                                    American Modern, or RCT Express RCE document via the Files tab for an authoritative replacement cost figure.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
