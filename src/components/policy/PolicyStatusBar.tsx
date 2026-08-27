'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
    Satellite, Shield, CheckCircle2, XCircle,
    Loader2, AlertTriangle, Zap, ChevronDown, ChevronUp,
    FileText, ExternalLink, RotateCcw, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import { PropertyEnrichment, PolicyReportRow } from '@/lib/api';
import styles from './PolicyStatusBar.module.css';

// Expected property data fields — used to determine what's "missing"
const EXPECTED_ENRICHMENT_KEYS = [
    { key: 'year_built', label: 'Year Built' },
    { key: 'square_footage', label: 'Square Footage' },
    { key: 'lot_size', label: 'Lot Size' },
    { key: 'bedrooms', label: 'Bedrooms' },
    { key: 'bathrooms', label: 'Bathrooms' },
    { key: 'stories', label: 'Stories' },
    { key: 'roof_type', label: 'Roof Type' },
    { key: 'roof_age', label: 'Roof Age' },
    { key: 'construction_type', label: 'Construction Type' },
    { key: 'foundation_type', label: 'Foundation Type' },
    { key: 'heating_type', label: 'Heating Type' },
    { key: 'cooling_type', label: 'Cooling Type' },
    { key: 'garage', label: 'Garage' },
    { key: 'pool', label: 'Pool' },
    { key: 'property_image', label: 'Property Image' },
    { key: 'estimated_replacement_cost', label: 'Estimated Replacement Cost' },
    { key: 'flood_zone', label: 'Flood Zone' },
    { key: 'fire_risk', label: 'Fire Risk' },
    { key: 'crime_score', label: 'Crime Score' },
    { key: 'hail_risk', label: 'Hail Risk' },
    { key: 'wind_risk', label: 'Wind Risk' },
    { key: 'earthquake_risk', label: 'Earthquake Risk' },
    { key: 'property_class', label: 'Property Class' },
    { key: 'zoning', label: 'Zoning' },
    { key: 'last_sale_date', label: 'Last Sale Date' },
    { key: 'last_sale_price', label: 'Last Sale Price' },
    { key: 'tax_assessed_value', label: 'Tax Assessed Value' },
    { key: 'front_elevation_analysis', label: 'Front Elevation Analysis' },
];

export interface PolicyStatusBarProps {
    // 1. Property Data (formerly Enrichment)
    isEnriched: boolean;
    enrichmentCount: number;
    lastEnrichedDate?: string | null;
    enrichStep?: string | null;
    onEnrich: () => void;
    /** Actual enrichment data points for the dropdown */
    enrichments?: PropertyEnrichment[];

    // 2. Flag Check
    flagsChecked: boolean;
    openFlagCount: number;
    highestSeverity?: 'high' | 'medium' | 'low' | null;
    lastCheckedDate?: string | null;
    onRunFlagCheck: () => void;
    flagCheckRunning?: boolean;

    // 3. Coverage Report
    reportRow?: PolicyReportRow | null;
    isReportGenerating?: boolean;
    isReportStale?: boolean;
    onGenerateReport?: () => void;
    onViewReport?: () => void;
}

export function PolicyStatusBar({
    isEnriched,
    enrichmentCount,
    lastEnrichedDate,
    flagsChecked,
    openFlagCount,
    highestSeverity,
    lastCheckedDate,
    enrichStep,
    onEnrich,
    onRunFlagCheck,
    flagCheckRunning = false,
    enrichments = [],
    reportRow,
    isReportGenerating = false,
    isReportStale = false,
    onGenerateReport,
    onViewReport,
}: PolicyStatusBarProps) {
    const enrichRunning = !!enrichStep && enrichStep !== '✓ Complete!' && enrichStep !== '✗ Failed — try again';
    const enrichDone = enrichStep === '✓ Complete!';
    const enrichFailed = enrichStep === '✗ Failed — try again';
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!showDropdown) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showDropdown]);

    // Build found/missing lists
    const foundKeys = new Set(enrichments.map(e => e.field_key));
    const foundItems = enrichments.filter(e => e.field_key !== 'property_image'); // skip image in list
    const missingItems = EXPECTED_ENRICHMENT_KEYS.filter(e => !foundKeys.has(e.key) && e.key !== 'property_image');
    const extraItems = enrichments.filter(e => !EXPECTED_ENRICHMENT_KEYS.some(ex => ex.key === e.field_key) && e.field_key !== 'property_image');

    // Severity color for flags
    const severityColor = highestSeverity === 'high' ? '#ef4444'
        : highestSeverity === 'medium' ? '#f59e0b'
            : highestSeverity === 'low' ? '#3b82f6'
                    : '#64748b';

    const formatFieldKey = (key: string) => {
        const match = EXPECTED_ENRICHMENT_KEYS.find(e => e.key === key);
        if (match) return match.label;
        return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    const confDot = (conf: string) => {
        const color = conf === 'high' ? '#10b981' : conf === 'medium' ? '#f59e0b' : '#ef4444';
        return <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: color, marginRight: '4px', flexShrink: 0 }} />;
    };

    const reportFormattedDate = reportRow?.created_at
        ? new Date(reportRow.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null;

    return (
        <div className={styles.bar}>
            {/* ══════════════════════════════════════════════════════════
               1. PROPERTY DATA (formerly Property Enrichment)
               ══════════════════════════════════════════════════════════ */}
            <div className={`${styles.segment} ${!isEnriched ? styles.segmentPending : ''}`} style={{ position: 'relative' }} ref={dropdownRef}>
                <div className={`${styles.indicator} ${isEnriched ? styles.indicatorDone : styles.indicatorPending}`}>
                    {isEnriched ? (
                        <CheckCircle2 size={15} />
                    ) : (
                        <XCircle size={15} />
                    )}
                </div>
                <div className={styles.segmentInfo}>
                    <span className={styles.segmentLabel}>Property Data</span>
                    <span className={styles.segmentValue}>
                        {isEnriched ? (
                            <span className={styles.valueRow}>
                                <button
                                    onClick={() => setShowDropdown(!showDropdown)}
                                    className={styles.dataPointsBtn}
                                    title="Click to view gathered property details"
                                >
                                    <span className={styles.done}>{enrichmentCount} data points</span>
                                    {showDropdown ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                {lastEnrichedDate && (
                                    <span className={styles.subtle}>· {lastEnrichedDate}</span>
                                )}
                            </span>
                        ) : (
                            <span className={styles.pending}>No data gathered</span>
                        )}
                    </span>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={enrichRunning}
                    onClick={onEnrich}
                    className={isEnriched ? styles.actionBtn : styles.actionBtnUrgent}
                    title={isEnriched ? 'Re-scan satellite imagery & property records' : 'Fetch property data, assessor records, & imagery'}
                >
                    {enrichRunning ? (
                        <>
                            <Loader2 size={13} className={styles.spin} />
                            <span className={styles.actionLabel}>{enrichStep || 'Gathering…'}</span>
                        </>
                    ) : enrichDone ? (
                        <>
                            <CheckCircle2 size={13} style={{ color: '#22c55e' }} />
                            <span className={styles.actionLabel} style={{ color: '#22c55e' }}>Complete!</span>
                        </>
                    ) : enrichFailed ? (
                        <>
                            <XCircle size={13} style={{ color: '#ef4444' }} />
                            <span className={styles.actionLabel} style={{ color: '#ef4444' }}>Failed — retry</span>
                        </>
                    ) : isEnriched ? (
                        <>
                            <Satellite size={13} />
                            <span className={styles.actionLabel}>Refresh</span>
                        </>
                    ) : (
                        <>
                            <Satellite size={13} />
                            <span className={styles.actionLabel}>Gather Data</span>
                        </>
                    )}
                </Button>

                {/* ── Data Points Dropdown ── */}
                {showDropdown && isEnriched && (
                    <div className={styles.dropdown}>
                        <div className={styles.dropdownHeader}>
                            <span className={styles.dropdownTitle}>Property Data Points</span>
                            <span className={styles.dropdownCount}>
                                <span style={{ color: '#10b981' }}>{foundItems.length + extraItems.length} found</span>
                                {missingItems.length > 0 && (
                                    <> · <span style={{ color: '#94a3b8' }}>{missingItems.length} missing</span></>
                                )}
                            </span>
                        </div>

                        <div className={styles.dropdownBody}>
                            {(() => {
                                const allFound = [...foundItems, ...extraItems];
                                if (allFound.length === 0) return null;

                                const groups = allFound.reduce((acc, e) => {
                                    const title = e.source_type === 'api' ? 'Verified County & Assessor Records' :
                                                  e.source_type === 'ai_interpretation' ? 'Google Satellite & Street Vision' :
                                                  e.source_type === 'parser' ? 'Extracted from Policy Documents' :
                                                  e.source_type === 'public_data' ? 'Public Tax Records' :
                                                  e.source_type === 'premium' ? 'Valuation & Replacement Cost Data' : 'Other Sources';
                                    if (!acc[title]) acc[title] = [];
                                    acc[title].push(e);
                                    return acc;
                                }, {} as Record<string, PropertyEnrichment[]>);

                                return Object.entries(groups).map(([groupTitle, items], idx) => (
                                    <div key={idx} className={styles.dropdownGroup}>
                                        <div className={styles.dropdownGroupLabel}>
                                            <CheckCircle2 size={11} style={{ color: '#10b981' }} />
                                            {groupTitle}
                                        </div>
                                        {items.map((e, i) => (
                                            <div key={i} className={styles.dropdownRow}>
                                                <span className={styles.dropdownKey}>
                                                    {confDot(e.confidence)}
                                                    {formatFieldKey(e.field_key)}
                                                </span>
                                                <span className={styles.dropdownValue} title={e.field_value || ''}>
                                                    {e.field_value && e.field_value.length > 30
                                                        ? e.field_value.slice(0, 30) + '…'
                                                        : e.field_value || '—'}
                                                </span>
                                                <span className={styles.dropdownSource}>{e.source_name}</span>
                                            </div>
                                        ))}
                                    </div>
                                ));
                            })()}

                            {missingItems.length > 0 && (
                                <div className={styles.dropdownGroup}>
                                    <div className={styles.dropdownGroupLabel} style={{ color: '#94a3b8' }}>
                                        <XCircle size={11} style={{ color: '#94a3b8' }} />
                                        Not Found
                                    </div>
                                    {missingItems.map((e, i) => (
                                        <div key={i} className={`${styles.dropdownRow} ${styles.dropdownRowMissing}`}>
                                            <span className={styles.dropdownKey}>{e.label}</span>
                                            <span className={styles.dropdownValue} style={{ color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Divider ── */}
            <div className={styles.divider} />

            {/* ══════════════════════════════════════════════════════════
               2. FLAG CHECK
               ══════════════════════════════════════════════════════════ */}
            <div className={`${styles.segment} ${!flagsChecked ? styles.segmentPending : ''}`}>
                <div
                    className={`${styles.indicator} ${flagsChecked ? styles.indicatorDone : styles.indicatorPending}`}
                    style={flagsChecked && openFlagCount > 0 ? { background: `${severityColor}18`, color: severityColor, borderColor: `${severityColor}40`, animation: 'none' } : undefined}
                >
                    {flagsChecked ? (
                        openFlagCount > 0 ? (
                            <AlertTriangle size={15} />
                        ) : (
                            <Shield size={15} />
                        )
                    ) : (
                        <XCircle size={15} />
                    )}
                </div>
                <div className={styles.segmentInfo}>
                    <span className={styles.segmentLabel}>Flag Check</span>
                    <span className={styles.segmentValue}>
                        {flagsChecked ? (
                            openFlagCount > 0 ? (
                                <span className={styles.valueRow}>
                                    <span style={{ color: severityColor, fontWeight: 600 }}>
                                        {openFlagCount} open flag{openFlagCount !== 1 ? 's' : ''}
                                    </span>
                                    {lastCheckedDate && (
                                        <span className={styles.subtle}>· {lastCheckedDate}</span>
                                    )}
                                </span>
                            ) : (
                                <span className={styles.valueRow}>
                                    <span className={styles.done}>All clear</span>
                                    {lastCheckedDate && (
                                        <span className={styles.subtle}>· {lastCheckedDate}</span>
                                    )}
                                </span>
                            )
                        ) : (
                            <span className={styles.pending}>Not checked</span>
                        )}
                    </span>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={flagCheckRunning}
                    onClick={onRunFlagCheck}
                    className={flagsChecked ? styles.actionBtn : styles.actionBtnUrgent}
                    title={flagsChecked ? 'Re-evaluate policy rules & coverage gaps' : 'Run flag check against underwriting rules'}
                >
                    {flagCheckRunning ? (
                        <>
                            <Loader2 size={13} className={styles.spin} />
                            <span className={styles.actionLabel}>Checking…</span>
                        </>
                    ) : (
                        <>
                            <Zap size={13} />
                            <span className={styles.actionLabel}>{flagsChecked ? 'Re-Check' : 'Check'}</span>
                        </>
                    )}
                </Button>
            </div>

            {/* ── Divider ── */}
            <div className={styles.divider} />

            {/* ══════════════════════════════════════════════════════════
               3. COVERAGE REPORT (Generation & Freshness State)
               ══════════════════════════════════════════════════════════ */}
            <div className={`${styles.segment} ${!reportRow ? styles.segmentPending : ''}`}>
                <div
                    className={`${styles.indicator} ${
                        isReportStale
                            ? styles.indicatorOutdated
                            : reportRow
                                ? styles.indicatorDone
                                : styles.indicatorPending
                    }`}
                >
                    {isReportGenerating ? (
                        <Loader2 size={15} className={styles.spin} />
                    ) : isReportStale ? (
                        <AlertTriangle size={15} />
                    ) : reportRow ? (
                        <CheckCircle2 size={15} />
                    ) : (
                        <FileText size={15} />
                    )}
                </div>
                <div className={styles.segmentInfo}>
                    <span className={styles.segmentLabel}>Coverage Report</span>
                    <span className={styles.segmentValue}>
                        {isReportGenerating ? (
                            <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Generating…</span>
                        ) : isReportStale ? (
                            <span className={styles.valueRow}>
                                <span style={{ color: '#d97706', fontWeight: 600 }}>Outdated</span>
                                {reportFormattedDate && (
                                    <span className={styles.subtle}>· {reportFormattedDate}</span>
                                )}
                            </span>
                        ) : reportRow ? (
                            <span className={styles.valueRow}>
                                <span className={styles.done}>Up to date</span>
                                {reportFormattedDate && (
                                    <span className={styles.subtle}>· {reportFormattedDate}</span>
                                )}
                            </span>
                        ) : (
                            <span className={styles.pending}>Not generated</span>
                        )}
                    </span>
                </div>

                <div className={styles.buttonGroup}>
                    {/* View Report Button (when generated) */}
                    {reportRow && onViewReport && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onViewReport}
                            className={styles.actionBtn}
                            title="Open coverage comparison report"
                        >
                            <ExternalLink size={13} />
                            <span className={styles.actionLabel}>View</span>
                        </Button>
                    )}

                    {/* Generate / Update / Regenerate Button */}
                    {onGenerateReport && (
                        reportRow && !isReportStale ? (
                            <button
                                className={styles.iconBtn}
                                onClick={onGenerateReport}
                                disabled={isReportGenerating}
                                title="Regenerate report with latest data"
                            >
                                <RotateCcw size={13} className={isReportGenerating ? styles.spin : ''} />
                            </button>
                        ) : (
                            <Button
                                variant={isReportStale ? 'primary' : reportRow ? 'outline' : 'primary'}
                                size="sm"
                                disabled={isReportGenerating}
                                onClick={onGenerateReport}
                                className={
                                    isReportStale
                                        ? styles.actionBtnOutdated
                                        : !reportRow
                                            ? styles.actionBtnUrgent
                                            : styles.actionBtn
                                }
                                title={
                                    isReportStale
                                        ? 'Data or configuration changed — click to update report'
                                        : 'Synthesize AI coverage comparison report'
                                }
                            >
                                {isReportGenerating ? (
                                    <>
                                        <Loader2 size={13} className={styles.spin} />
                                        <span className={styles.actionLabel}>Generating…</span>
                                    </>
                                ) : isReportStale ? (
                                    <>
                                        <RotateCcw size={13} />
                                        <span className={styles.actionLabel}>Update</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles size={13} />
                                        <span className={styles.actionLabel}>Generate</span>
                                    </>
                                )}
                            </Button>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
