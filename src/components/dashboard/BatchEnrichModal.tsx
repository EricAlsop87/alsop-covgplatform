'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Button } from '@/components/ui/Button/Button';
import {
    AlertTriangle, Zap, FileSearch, DollarSign,
    CheckCircle2, XCircle, Loader2, Shield,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import styles from './BatchEnrichModal.module.css';

interface BatchEnrichModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedPolicyIds?: string[];
}

interface CostBreakdown {
    policyCount: number;
    enrichmentCost: number;
    reportCost: number;
    totalCost: number;
}

// Estimated costs per policy (in dollars)
const COST_PER_ENRICHMENT = 0.012; // satellite($0.007) + geocoding($0.005) + fire risk(free)
const COST_PER_REPORT = 0.03; // GPT-4o report generation

type RunMode = 'enrichment' | 'full';
type RunStatus = 'idle' | 'confirming' | 'running' | 'done' | 'error';

export function BatchEnrichModal({ isOpen, onClose, selectedPolicyIds = [] }: BatchEnrichModalProps) {
    const [unenrichedCount, setUnenrichedCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [runMode, setRunMode] = useState<RunMode>('enrichment');
    const [runStatus, setRunStatus] = useState<RunStatus>('idle');
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [runErrors, setRunErrors] = useState<string[]>([]);

    const fetchCounts = useCallback(async () => {
        setLoading(true);
        try {
            if (selectedPolicyIds.length === 0) {
                setUnenrichedCount(0);
                setLoading(false);
                return;
            }

            // Get enriched subset within selection
            const { data: enrichedPolicies } = await supabase
                .from('property_enrichments')
                .select('policy_id')
                .in('policy_id', selectedPolicyIds);

            const enrichedSet = new Set((enrichedPolicies || []).map(e => e.policy_id));
            setUnenrichedCount(selectedPolicyIds.length - enrichedSet.size);
        } catch {
            setUnenrichedCount(0);
        }
        setLoading(false);
    }, [selectedPolicyIds]);

    useEffect(() => {
        if (isOpen) {
            fetchCounts();
            setRunStatus('idle');
            setProgress({ done: 0, total: 0 });
            setRunErrors([]);
        }
    }, [isOpen, fetchCounts]);

    const getCost = (): CostBreakdown => {
        const count = unenrichedCount;
        const enrichCost = count * COST_PER_ENRICHMENT;
        const reportCost = runMode === 'full' ? count * COST_PER_REPORT : 0;
        // Flag check is free (local rules engine)
        return {
            policyCount: count,
            enrichmentCost: enrichCost,
            reportCost: reportCost,
            totalCost: enrichCost + reportCost,
        };
    };

    const handleRunBatch = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const { data: enrichedRows } = await supabase
            .from('property_enrichments')
            .select('policy_id')
            .in('policy_id', selectedPolicyIds);

        const enrichedSet = new Set((enrichedRows || []).map(e => e.policy_id));
        const toEnrich = selectedPolicyIds
            .filter(id => !enrichedSet.has(id))
            .map(id => ({ id }));

        setRunStatus('running');
        setProgress({ done: 0, total: toEnrich.length });
        setRunErrors([]);

        let done = 0;
        const errors: string[] = [];

        for (const policy of toEnrich) {
            try {
                // Run enrichment
                const res = await fetch('/api/enrichment/run', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ policy_id: policy.id }),
                });

                if (!res.ok) {
                    errors.push(`Policy ${policy.id}: enrichment failed`);
                }

                // Run flag check (always in full mode — free, local rules)
                if (runMode === 'full') {
                    const flagRes = await fetch('/api/flags/evaluate', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({ policy_id: policy.id }),
                    });

                    if (!flagRes.ok) {
                        errors.push(`Policy ${policy.id}: flag check failed`);
                    }
                }

                // Run report if full mode
                if (runMode === 'full') {
                    const reportRes = await fetch('/api/reports/generate', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({ policyId: policy.id }),
                    });

                    if (!reportRes.ok) {
                        errors.push(`Policy ${policy.id}: report failed`);
                    }
                }
            } catch (err) {
                errors.push(`Policy ${policy.id}: ${err instanceof Error ? err.message : 'unknown error'}`);
            }

            done++;
            setProgress({ done, total: toEnrich.length });
        }

        setRunErrors(errors);
        setRunStatus(errors.length > 0 && done === 0 ? 'error' : 'done');
    };

    const cost = getCost();

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Fetch Property Data & Analyze" maxWidth="560px">
            {/* ── Warning Banner ── */}
            <div className={styles.warningBanner}>
                <div className={styles.warningIcon}>
                    <AlertTriangle size={20} />
                </div>
                <div className={styles.warningContent}>
                    <strong className={styles.warningTitle}>⚠ Batch property data fetch is resource-intensive</strong>
                    <p className={styles.warningText}>
                        Fetching property data across your entire book calls external satellite, assessor, and AI services. We recommend checking
                        policies <strong>one at a time</strong> from each policy&apos;s detail page,
                        when you need updated aerials and hazard data.
                    </p>
                    <p className={styles.warningRecommendation}>
                        <Shield size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.25rem' }} />
                        <strong>Recommended:</strong> Open a policy → click &ldquo;Fetch Property Data&rdquo; → review results.
                        This gives you control and avoids unnecessary API costs.
                    </p>
                </div>
            </div>

            {runStatus === 'idle' && (
                <>
                    {/* ── Stats ── */}
                    <div className={styles.statsRow}>
                        <div className={styles.stat}>
                            <FileSearch size={16} className={styles.statIcon} />
                            <div>
                                <span className={styles.statLabel}>Policies selected to fetch data</span>
                                <span className={styles.statValue}>
                                    {loading ? '…' : unenrichedCount.toLocaleString()}
                                    {!loading && unenrichedCount === 0 && selectedPolicyIds.length === 0 && ' (No policies selected in table)'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {unenrichedCount > 0 && (
                        <>
                            {/* ── Mode Toggle ── */}
                            <div className={styles.modeToggle}>
                                <button
                                    className={`${styles.modeOption} ${runMode === 'enrichment' ? styles.modeActive : ''}`}
                                    onClick={() => setRunMode('enrichment')}
                                >
                                    <Zap size={14} />
                                    Property Data Only
                                </button>
                                <button
                                    className={`${styles.modeOption} ${runMode === 'full' ? styles.modeActive : ''}`}
                                    onClick={() => setRunMode('full')}
                                >
                                    <FileSearch size={14} />
                                    Full Analysis
                                </button>
                            </div>

                            {/* ── Cost Breakdown ── */}
                            <div className={styles.costCard}>
                                <div className={styles.costHeader}>
                                    <DollarSign size={16} />
                                    <span>Estimated Cost</span>
                                </div>
                                <div className={styles.costBreakdown}>
                                    <div className={styles.costLine}>
                                        <span className={styles.costLabel}>
                                            Satellite + Geocoding + Fire Risk
                                            <span className={styles.costApi}>Google Maps, USDA</span>
                                        </span>
                                        <span className={styles.costAmount}>
                                            ${cost.enrichmentCost.toFixed(2)}
                                        </span>
                                    </div>
                                    {runMode === 'full' && (
                                        <>
                                            <div className={styles.costLine}>
                                                <span className={styles.costLabel}>
                                                    Flag Check
                                                    <span className={styles.costApi}>Local rules engine</span>
                                                </span>
                                                <span className={styles.costAmount}>Free</span>
                                            </div>
                                            <div className={styles.costLine}>
                                                <span className={styles.costLabel}>
                                                    AI Report Generation
                                                    <span className={styles.costApi}>OpenAI GPT-4o</span>
                                                </span>
                                                <span className={styles.costAmount}>
                                                    ${cost.reportCost.toFixed(2)}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    <div className={`${styles.costLine} ${styles.costTotal}`}>
                                        <span className={styles.costLabel}>
                                            Total ({cost.policyCount.toLocaleString()} policies × ${runMode === 'full' ? (COST_PER_ENRICHMENT + COST_PER_REPORT).toFixed(3) : COST_PER_ENRICHMENT.toFixed(3)}/policy)
                                        </span>
                                        <span className={styles.costTotalAmount}>
                                            ${cost.totalCost.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Actions ── */}
                    <div className={styles.actions}>
                        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                        {unenrichedCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                style={{
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#ef4444',
                                }}
                                onClick={() => setRunStatus('confirming')}
                            >
                                <AlertTriangle className="w-4 h-4 mr-1.5" />
                                Proceed Anyway ({cost.policyCount} policies)
                            </Button>
                        )}
                    </div>
                </>
            )}

            {/* ── Confirm step ── */}
            {runStatus === 'confirming' && (
                <div className={styles.confirmPanel}>
                    <AlertTriangle size={32} style={{ color: '#f59e0b' }} />
                    <span className={styles.confirmTitle}>Are you sure?</span>
                    <p className={styles.confirmText}>
                        This will run {runMode === 'full' ? 'enrichment + flag checks + AI reports' : 'enrichment'} on
                        <strong> {cost.policyCount.toLocaleString()} policies</strong>, costing approximately
                        <strong> ${cost.totalCost.toFixed(2)}</strong>.
                    </p>
                    <p className={styles.confirmText} style={{ color: '#f59e0b', fontWeight: 600 }}>
                        This cannot be undone. Consider enriching individually instead.
                    </p>
                    <div className={styles.actions}>
                        <Button variant="ghost" size="sm" onClick={() => setRunStatus('idle')}>
                            Go Back
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            style={{ border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444' }}
                            onClick={handleRunBatch}
                        >
                            Yes, Run Batch (${cost.totalCost.toFixed(2)})
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Running ── */}
            {runStatus === 'running' && (
                <div className={styles.runningPanel}>
                    <Loader2 size={32} className={styles.spinner} />
                    <span className={styles.runningTitle}>
                        Processing {progress.done} / {progress.total}…
                    </span>
                    <div className={styles.progressBar}>
                        <div
                            className={styles.progressFill}
                            style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                        />
                    </div>
                    <span className={styles.runningHint}>
                        Do not close this window while running.
                    </span>
                </div>
            )}

            {/* ── Done ── */}
            {runStatus === 'done' && (
                <div className={styles.donePanel}>
                    <CheckCircle2 size={32} style={{ color: '#22c55e' }} />
                    <span className={styles.doneTitle}>Batch Complete</span>
                    <span className={styles.doneStats}>
                        {progress.done} policies processed
                        {runErrors.length > 0 && ` · ${runErrors.length} errors`}
                    </span>
                    {runErrors.length > 0 && (
                        <div className={styles.errorList}>
                            {runErrors.slice(0, 10).map((e, i) => <div key={i}>{e}</div>)}
                            {runErrors.length > 10 && <div>…and {runErrors.length - 10} more</div>}
                        </div>
                    )}
                    <Button variant="excel" size="sm" onClick={onClose} style={{ marginTop: '0.75rem' }}>
                        Done
                    </Button>
                </div>
            )}

            {/* ── Error ── */}
            {runStatus === 'error' && (
                <div className={styles.donePanel}>
                    <XCircle size={32} style={{ color: '#ef4444' }} />
                    <span className={styles.doneTitle} style={{ color: '#ef4444' }}>Batch Failed</span>
                    <div className={styles.errorList}>
                        {runErrors.slice(0, 10).map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setRunStatus('idle')} style={{ marginTop: '0.75rem' }}>
                        Try Again
                    </Button>
                </div>
            )}
        </Modal>
    );
}
