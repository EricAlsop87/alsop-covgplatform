'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getReportById, PolicyReportRow, getLatestReportConfigVersion } from '@/lib/api';
import { ErrorState } from '@/components/shared/ErrorState';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Loader2 } from 'lucide-react';
import styles from './page.module.css';
import { logger } from '@/lib/logger';


/* ── Helpers ── */
/** Only keep real named sources — filter out generic internal labels. */
const INTERNAL_SOURCES = new Set([
    'enrichment', 'policy', 'flag_engine', 'inferred', 'analysis',
    'automated review', 'policy declaration', 'internal',
]);

function fmtDate(d: string | null | undefined): string {
    if (!d) return 'N/A';
    try {
        const clean = d.split('T')[0];
        const parts = clean.split('-');
        if (parts.length === 3) {
            const [y, m, day] = parts.map(Number);
            if (y && m && day) {
                const date = new Date(y, m - 1, day);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }
        }
        return d;
    } catch { return d; }
}

function fmtCurrency(v: string | number | null | undefined): string {
    if (v === null || v === undefined || v === '') return 'N/A';
    const n = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.-]/g, '')) : v;
    if (isNaN(n)) return String(v);
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function ReportPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const [report, setReport] = useState<PolicyReportRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isStale, setIsStale] = useState(false);

    useEffect(() => {
        if (!id) return;
        getReportById(id).then(data => { setReport(data || null); setLoading(false); });
    }, [id]);

    // Check if report is stale (generated before config change)
    useEffect(() => {
        if (!report?.created_at) return;
        getLatestReportConfigVersion().then(config => {
            if (config?.changed_at && report.created_at) {
                const reportDate = new Date(report.created_at);
                const configDate = new Date(config.changed_at);
                setIsStale(reportDate < configDate);
            }
        });
    }, [report?.created_at]);

    const ai = report?.ai_insights;
    const data = report?.data_payload;
    const policy = data?.policy || {};
    const flags = data?.flags || [];
    const enrichments = data?.enrichments || [];

    // Merge recommendations + action_items + data_gaps into unified Next Steps
    const nextSteps = useMemo(() => {
        return ai?.next_steps || [];
    }, [ai]);

    const groupedSteps = useMemo(() => {
        const groups: Record<string, typeof nextSteps> = {};
        nextSteps.forEach((s: any) => {
            if (!groups[s.timeframe]) groups[s.timeframe] = [];
            groups[s.timeframe].push(s);
        });
        return groups;
    }, [nextSteps]);

    // Filter sources to real named tools only
    const realSources = useMemo(() => {
        const s = new Set<string>();
        enrichments.forEach((e: any) => { if (e.source && !INTERNAL_SOURCES.has(e.source.toLowerCase())) s.add(e.source); });
        (ai?.property_observations || []).forEach((o: any) => {
            if (o.source && !INTERNAL_SOURCES.has(o.source.toLowerCase())) s.add(o.source);
        });
        return Array.from(s).sort();
    }, [enrichments, ai]);

    const issuedDate = report?.created_at
        ? new Date(report.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : '';

    const handleRegenerate = async () => {
        if (!report?.policy_id) return;
        setIsGenerating(true);
        try {
            const res = await fetch('/api/reports/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ policyId: report.policy_id })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.report) {
                    router.push(`/report/${data.report.id}`);
                }
            } else {
                alert('Failed to regenerate report');
            }
        } catch (e) {
            logger.error('page', 'Error:', { error: e instanceof Error ? e.message : String(e) })
            alert('Error generating report');
        } finally {
            setIsGenerating(false);
        }
    };

    // Early returns AFTER all hooks
    if (loading) {
        return (
            <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', background: 'var(--bg-base)' }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-primary)' }} />
            </div>
        );
    }
    if (!report) {
        return (
            <div className={styles.container} style={{ background: 'var(--bg-base)' }}>
                <ErrorState message="Report not found or unavailable." onRetry={() => router.push('/')} />
            </div>
        );
    }

    const GROUP_LABELS: Record<string, { title: string; color: string }> = {
        review_now: { title: 'Review Now', color: 'var(--status-danger)' },
        discuss_at_renewal: { title: 'Discuss at Renewal', color: 'var(--status-warning)' },
        confirm_and_update: { title: 'Confirm & Update', color: 'var(--status-info)' },
    };

    return (
        <div className={styles.container}>
            {/* Action Bar (hidden in print) */}
            <div className={styles.actionBar}>
                <button onClick={() => router.back()} className={styles.backBtn}>← Back</button>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                        onClick={handleRegenerate} 
                        disabled={isGenerating} 
                        style={{ padding: '0.4rem 0.8rem', cursor: isGenerating ? 'wait' : 'pointer', background: 'var(--bg-surface-raised)', color: 'var(--text-high)', border: '1px solid var(--border-default)', borderRadius: '4px' }}
                    >
                        {isGenerating ? 'Regenerating...' : 'Regenerate Analysis'}
                    </button>
                    <button onClick={() => window.print()} className={styles.printBtn}>Save as PDF</button>
                </div>
            </div>

            {/* Stale Report Warning (hidden in print) */}
            {isStale && (
                <div className={styles.staleWarning}>
                    <span>⚠ This report was generated before recent changes to flag reporting rules.</span>
                    <button onClick={handleRegenerate} disabled={isGenerating} className={styles.staleRegenBtn}>
                        {isGenerating ? 'Regenerating...' : 'Regenerate Report'}
                    </button>
                </div>
            )}

            {/* ════ DOCUMENT ════ */}
            <div className={styles.document}>

                {/* ── HEADER ── */}
                <header className={styles.header}>
                    <div className={styles.headerTop}>
                        <div className={styles.brand}>
                            <BrandLogo variant="horizontal" size="sm" iconSize={26} />
                        </div>
                        <div className={styles.headerDate}>{issuedDate}</div>
                    </div>
                    <h1 className={styles.reportTitle}>Coverage Analysis Report</h1>
                    <div className={styles.headerMeta}>
                        <div className={styles.metaChip}>
                            <span className={styles.metaLabel}>Prepared for</span>
                            <span className={styles.metaValue}>{policy.named_insured || 'Unknown'}</span>
                        </div>
                        <div className={styles.metaChip}>
                            <span className={styles.metaLabel}>Policy</span>
                            <span className={styles.metaValue}>{policy.policy_number || 'N/A'}</span>
                        </div>
                        <div className={styles.metaChip}>
                            <span className={styles.metaLabel}>Carrier</span>
                            <span className={styles.metaValue}>{policy.carrier_name || 'N/A'}</span>
                        </div>
                        <div className={styles.metaChip}>
                            <span className={styles.metaLabel}>Term</span>
                            <span className={styles.metaValue}>{fmtDate(policy.effective_date)} → {fmtDate(policy.expiration_date)}</span>
                        </div>
                        <div className={styles.metaChip}>
                            <span className={styles.metaLabel}>Renewal Date</span>
                            <span className={styles.metaValue}>{fmtDate(policy.expiration_date)}</span>
                        </div>
                        <div className={styles.metaChip}>
                            <span className={styles.metaLabel}>Total Annual Premium</span>
                            <span className={styles.metaValue}>{fmtCurrency(policy.annual_premium)}</span>
                        </div>
                    </div>
                </header>

                {/* ── 1. KEY FINDINGS ── */}
                {(ai?.top_concerns && ai.top_concerns.length > 0) && (
                    <section className={styles.section}>
                        <div className={styles.sectionLabel}>Key Findings</div>
                        <div className={styles.findingsGrid}>
                            {ai.top_concerns.map((c: any, i: number) => (
                                <div key={i} className={styles.finding}>
                                    <span className={styles.findingBody}>{c.explanation}</span>
                                    {c.source && (
                                        <span className={styles.findingSource}>Source: {c.source}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── 2. COVERAGE REVIEW ── */}
                <section className={`${styles.section} ${styles.avoidBreak}`}>
                    <div className={styles.sectionLabel}>Coverage Review</div>
                    <table className={styles.covTable}>
                        <thead>
                            <tr>
                                <th>Coverage</th>
                                <th>Limit <span style={{ fontWeight: 400, fontSize: '0.5rem', color: '#94a3b8', textTransform: 'none', letterSpacing: 'normal' }}>Policy Declaration</span></th>
                                <th>Note</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { label: 'Dwelling (A)', value: policy.limit_dwelling },
                                { label: 'Other Structures (B)', value: policy.limit_other_structures },
                                { label: 'Personal Property (C)', value: policy.limit_personal_property },
                                { label: 'Fair Rental Value', value: policy.limit_fair_rental_value || policy.dic_limit_loss_of_use },
                                { label: 'Ordinance or Law', value: policy.limit_ordinance_or_law },
                                { label: 'Extended Replacement', value: policy.limit_extended_replacement_cost_coverage },
                                { label: 'Deductible', value: policy.deductible },
                            ].map((cov, i) => {
                                const aiRow = (ai?.coverage_review || []).find(
                                    (c: any) => c.coverage?.toLowerCase().includes(cov.label.split(' (')[0].toLowerCase())
                                );
                                const relatedFindings: Array<{ text: string; source: string }> = aiRow?.related_findings || [];
                                const hasFindings = relatedFindings.length > 0;
                                return (
                                    <tr key={i} className={hasFindings ? styles.covRowWithFindings : undefined}>
                                        <td className={styles.covName}>
                                            {cov.label}
                                        </td>
                                        <td className={styles.covValue}>
                                            {cov.value ? fmtCurrency(cov.value) : <span className={styles.noData}>Not on file</span>}
                                        </td>
                                        <td className={styles.covNote}>
                                            {aiRow?.observation || '—'}
                                            {hasFindings && (
                                                <div className={styles.relatedFindings}>
                                                    {relatedFindings.map((rf, j) => (
                                                        <div key={j} className={styles.relatedFinding}>
                                                            <span className={styles.relatedFindingText}>{rf.text}</span>
                                                            <span className={styles.relatedFindingDot}>•</span>
                                                            <span className={styles.relatedFindingSource}>Source: {rf.source}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>

                {/* ── 3. PROPERTY OBSERVATIONS ── */}
                {(ai?.property_observations && ai.property_observations.length > 0) && (
                    <section className={styles.section}>
                        <div className={styles.sectionLabel}>Property Observations</div>
                        <div className={styles.obsList}>
                            {ai.property_observations.map((o: any, i: number) => (
                                <div key={i} className={styles.obsItem}>
                                    <span className={styles.obsBody}>{o.observation}</span>
                                    <span className={styles.obsDot}>•</span>
                                    <span className={styles.obsSource}>Source: {o.source}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── 4. NEXT STEPS ── */}
                {nextSteps.length > 0 && (
                    <section className={`${styles.section} ${styles.avoidBreak}`}>
                        <div className={styles.sectionLabel}>Next Steps</div>
                        <div className={styles.stepsContainer}>
                            {(['review_now', 'discuss_at_renewal', 'confirm_and_update'] as const).map(groupKey => {
                                const items = groupedSteps[groupKey];
                                if (!items || items.length === 0) return null;
                                const cfg = GROUP_LABELS[groupKey];
                                return (
                                    <div key={groupKey} className={styles.stepGroup}>
                                        <div className={styles.stepGroupHeader}>
                                            <span className={styles.stepGroupDot} style={{ background: cfg.color }} />
                                            <span className={styles.stepGroupTitle}>{cfg.title}</span>
                                            <span className={styles.stepGroupCount}>{items.length}</span>
                                        </div>
                                        <div className={styles.stepList}>
                                            {items.map((step: any, idx: number) => (
                                                <div key={idx} className={styles.stepItem}>
                                                    <div className={styles.stepCheck} />
                                                    <span className={styles.stepText}>{step.text}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* ── 5. FOOTER ── */}
                <footer className={styles.footer}>
                    <div className={styles.disclaimer} style={{ background: 'var(--bg-surface-raised, #f8fafc)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-default, #e2e8f0)', marginBottom: '1rem', fontSize: '0.78rem', color: 'var(--text-mid, #475569)', lineHeight: '1.5' }}>
                        <strong style={{ color: 'var(--text-high, #0f172a)' }}>Notice & Client Responsibility:</strong> This report is provided for informational and comparative purposes only, based on documents provided to our office (such as current policy declarations and replacement cost estimates). CoverageCheckNow and Alsop and Associates Insurance Agency do not determine policy adequacy or guarantee complete protection. Final decisions regarding coverage selection, limits, and policy adjustments remain solely the responsibility of the policyholder. We strongly recommend reviewing your policy terms with a licensed insurance advisor.
                    </div>
                    <div className={styles.footerBottom}>
                        <span className={styles.footerBrand}>CoverageCheckNow</span>
                        <span className={styles.footerId}>Report {report.id?.slice(0, 8)}</span>
                    </div>
                </footer>
            </div>
        </div>
    );
}
