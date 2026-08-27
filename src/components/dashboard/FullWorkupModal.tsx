'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Button } from '@/components/ui/Button/Button';
import {
    Zap, DollarSign, CheckCircle2, XCircle, Loader2,
    Satellite, Shield, FileBarChart, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { insertActivityEvent } from '@/lib/notes';
import styles from './FullWorkupModal.module.css';

interface FullWorkupModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Pre-selected policy IDs (from DataTable batch selection) */
    policyIds: string[];
    /** Optional callback after workup completes */
    onComplete?: () => void;
}

// Estimated costs per policy (in dollars)
const COST_PER_ENRICHMENT = 0.012; // satellite($0.007) + geocoding($0.005)
const COST_PER_FLAG_CHECK = 0;     // free — local evaluation
const COST_PER_REPORT = 0.03;      // GPT-4o report generation

type WorkupMode = 'enrich_flags' | 'full';
type WorkupStatus = 'idle' | 'confirming' | 'running' | 'done' | 'error';

interface PolicyProgress {
    policyId: string;
    status: 'queued' | 'enriching' | 'checking_flags' | 'generating_report' | 'done' | 'error';
    error?: string;
}

export function FullWorkupModal({ isOpen, onClose, policyIds, onComplete }: FullWorkupModalProps) {
    const [mode, setMode] = useState<WorkupMode>('enrich_flags');
    const [status, setStatus] = useState<WorkupStatus>('idle');
    const [progress, setProgress] = useState<PolicyProgress[]>([]);
    const [completedCount, setCompletedCount] = useState(0);
    const [errorCount, setErrorCount] = useState(0);

    const count = policyIds.length;
    const isSingle = count === 1;

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setStatus('idle');
            setMode('enrich_flags');
            setProgress([]);
            setCompletedCount(0);
            setErrorCount(0);
        }
    }, [isOpen]);

    // Cost calculation
    const enrichCost = count * COST_PER_ENRICHMENT;
    const reportCost = mode === 'full' ? count * COST_PER_REPORT : 0;
    const totalCost = enrichCost + reportCost;
    const perPolicyCost = mode === 'full'
        ? COST_PER_ENRICHMENT + COST_PER_REPORT
        : COST_PER_ENRICHMENT;

    const handleRun = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const token = session.access_token;

        setStatus('running');
        setProgress(policyIds.map(id => ({ policyId: id, status: 'queued' })));
        setCompletedCount(0);
        setErrorCount(0);

        // Log workup started
        for (const pid of policyIds) {
            insertActivityEvent({
                event_type: 'workup.started',
                title: `Full analysis ${isSingle ? 'started' : 'queued'}`,
                detail: `${mode === 'full' ? 'Enrichment + flags + report' : 'Enrichment + flags'} workup initiated`,
                policy_id: pid,
                meta: { mode, batch_size: count },
            }).catch(() => {});
        }

        let done = 0;
        let errors = 0;

        for (let i = 0; i < policyIds.length; i++) {
            const pid = policyIds[i];

            try {
                // Step 1: Enrichment
                setProgress(prev => prev.map((p, idx) =>
                    idx === i ? { ...p, status: 'enriching' } : p
                ));

                const enrichRes = await fetch('/api/enrichment/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ policy_id: pid }),
                });

                if (!enrichRes.ok) throw new Error('Enrichment failed');

                insertActivityEvent({
                    event_type: 'enrichment.completed',
                    title: 'Property enrichment completed',
                    policy_id: pid,
                }).catch(() => {});

                // Step 2: Flag Check
                setProgress(prev => prev.map((p, idx) =>
                    idx === i ? { ...p, status: 'checking_flags' } : p
                ));

                const flagRes = await fetch('/api/flags/evaluate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ policy_id: pid }),
                });

                if (!flagRes.ok) throw new Error('Flag check failed');

                insertActivityEvent({
                    event_type: 'flags.checked',
                    title: 'Flag check completed',
                    policy_id: pid,
                }).catch(() => {});

                // Step 3: Report (if full mode)
                if (mode === 'full') {
                    setProgress(prev => prev.map((p, idx) =>
                        idx === i ? { ...p, status: 'generating_report' } : p
                    ));

                    const reportRes = await fetch('/api/reports/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ policyId: pid }),
                    });

                    if (!reportRes.ok) throw new Error('Report generation failed');

                    insertActivityEvent({
                        event_type: 'report.generated',
                        title: 'AI report generated',
                        policy_id: pid,
                    }).catch(() => {});
                }

                // Done
                setProgress(prev => prev.map((p, idx) =>
                    idx === i ? { ...p, status: 'done' } : p
                ));
                done++;
                setCompletedCount(done);

            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : 'Unknown error';
                setProgress(prev => prev.map((p, idx) =>
                    idx === i ? { ...p, status: 'error', error: errorMsg } : p
                ));
                errors++;
                setErrorCount(errors);

                insertActivityEvent({
                    event_type: 'workup.failed',
                    title: 'Analysis failed',
                    detail: errorMsg,
                    policy_id: pid,
                }).catch(() => {});
            }
        }

        // Final status
        setStatus(errors > 0 && done === 0 ? 'error' : 'done');

        // Log batch completion
        insertActivityEvent({
            event_type: 'workup.completed',
            title: `Full analysis completed`,
            detail: `${done}/${count} succeeded, ${errors} failed`,
            meta: { mode, total: count, succeeded: done, failed: errors },
        }).catch(() => {});

        if (onComplete) onComplete();
    };

    const progressPercent = count > 0 ? ((completedCount + errorCount) / count) * 100 : 0;
    const currentPolicy = progress.find(p => p.status !== 'queued' && p.status !== 'done' && p.status !== 'error');
    const currentStep = currentPolicy?.status === 'enriching' ? 'Enriching property data…'
        : currentPolicy?.status === 'checking_flags' ? 'Running flag checks…'
            : currentPolicy?.status === 'generating_report' ? 'Generating AI report…'
                : 'Processing…';

    return (
        <Modal
            isOpen={isOpen}
            onClose={status === 'running' ? () => {} : onClose}
            title={isSingle ? 'Run Full Analysis' : `Analyze ${count} Policies`}
            maxWidth="520px"
        >
            {/* ── Idle: Config & Cost ── */}
            {status === 'idle' && (
                <>
                    <div className={styles.summary}>
                        <Zap size={16} className={styles.summaryIcon} />
                        <div>
                            <span className={styles.summaryTitle}>
                                {isSingle ? 'Full policy workup' : `Batch analysis · ${count} policies`}
                            </span>
                            <span className={styles.summaryDesc}>
                                Runs enrichment, flag evaluation{mode === 'full' ? ', and AI report generation' : ''} on
                                {isSingle ? ' this policy' : ` ${count} selected policies`}.
                            </span>
                        </div>
                    </div>

                    {/* Mode toggle */}
                    <div className={styles.modeToggle}>
                        <button
                            className={`${styles.modeOption} ${mode === 'enrich_flags' ? styles.modeActive : ''}`}
                            onClick={() => setMode('enrich_flags')}
                        >
                            <Satellite size={14} />
                            Enrich + Flags
                        </button>
                        <button
                            className={`${styles.modeOption} ${mode === 'full' ? styles.modeActive : ''}`}
                            onClick={() => setMode('full')}
                        >
                            <FileBarChart size={14} />
                            Full Analysis
                        </button>
                    </div>

                    {/* Cost breakdown */}
                    <div className={styles.costCard}>
                        <div className={styles.costHeader}>
                            <DollarSign size={14} />
                            <span>Estimated Cost</span>
                        </div>
                        <div className={styles.costBreakdown}>
                            <div className={styles.costLine}>
                                <span className={styles.costLabel}>
                                    Property Enrichment
                                    <span className={styles.costApi}>Google Maps, USDA</span>
                                </span>
                                <span className={styles.costAmount}>${enrichCost.toFixed(2)}</span>
                            </div>
                            <div className={styles.costLine}>
                                <span className={styles.costLabel}>
                                    Flag Evaluation
                                    <span className={styles.costApi}>Local rules engine</span>
                                </span>
                                <span className={styles.costAmount}>Free</span>
                            </div>
                            {mode === 'full' && (
                                <div className={styles.costLine}>
                                    <span className={styles.costLabel}>
                                        AI Report Generation
                                        <span className={styles.costApi}>OpenAI GPT-4o</span>
                                    </span>
                                    <span className={styles.costAmount}>${reportCost.toFixed(2)}</span>
                                </div>
                            )}
                            <div className={`${styles.costLine} ${styles.costTotal}`}>
                                <span className={styles.costLabel}>
                                    Total ({count} {count === 1 ? 'policy' : 'policies'} × ${perPolicyCost.toFixed(3)}/ea)
                                </span>
                                <span className={styles.costTotalAmount}>${totalCost.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className={styles.actions}>
                        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setStatus('confirming')}
                        >
                            <Zap size={14} />
                            {isSingle ? 'Run Analysis' : `Analyze ${count} Policies`} · ${totalCost.toFixed(2)}
                        </Button>
                    </div>
                </>
            )}

            {/* ── Confirm ── */}
            {status === 'confirming' && (
                <div className={styles.confirmPanel}>
                    <AlertTriangle size={28} style={{ color: '#f59e0b' }} />
                    <span className={styles.confirmTitle}>Confirm Analysis</span>
                    <p className={styles.confirmText}>
                        This will run {mode === 'full' ? 'enrichment, flag checks, and AI report generation' : 'enrichment and flag checks'} on
                        <strong> {count} {count === 1 ? 'policy' : 'policies'}</strong>, costing approximately
                        <strong> ${totalCost.toFixed(2)}</strong>.
                    </p>
                    <div className={styles.actions}>
                        <Button variant="ghost" size="sm" onClick={() => setStatus('idle')}>
                            Go Back
                        </Button>
                        <Button variant="primary" size="sm" onClick={handleRun}>
                            <Zap size={14} />
                            Confirm · ${totalCost.toFixed(2)}
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Running ── */}
            {status === 'running' && (
                <div className={styles.runningPanel}>
                    <Loader2 size={28} className={styles.spinner} />
                    <span className={styles.runningTitle}>
                        {completedCount + errorCount} / {count} policies
                    </span>
                    <span className={styles.runningStep}>{currentStep}</span>
                    <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span className={styles.runningHint}>Do not close this window while running.</span>
                </div>
            )}

            {/* ── Done ── */}
            {status === 'done' && (
                <div className={styles.donePanel}>
                    <CheckCircle2 size={28} style={{ color: '#22c55e' }} />
                    <span className={styles.doneTitle}>Analysis Complete</span>
                    <span className={styles.doneStats}>
                        {completedCount} succeeded{errorCount > 0 ? ` · ${errorCount} failed` : ''}
                    </span>
                    {errorCount > 0 && (
                        <div className={styles.errorList}>
                            {progress.filter(p => p.status === 'error').map(p => (
                                <div key={p.policyId}>Policy {p.policyId.slice(0, 8)}…: {p.error}</div>
                            ))}
                        </div>
                    )}
                    <Button variant="primary" size="sm" onClick={onClose} style={{ marginTop: '0.5rem' }}>
                        Done
                    </Button>
                </div>
            )}

            {/* ── Error (all failed) ── */}
            {status === 'error' && (
                <div className={styles.donePanel}>
                    <XCircle size={28} style={{ color: '#ef4444' }} />
                    <span className={styles.doneTitle} style={{ color: '#ef4444' }}>Analysis Failed</span>
                    <div className={styles.errorList}>
                        {progress.filter(p => p.status === 'error').map(p => (
                            <div key={p.policyId}>Policy {p.policyId.slice(0, 8)}…: {p.error}</div>
                        ))}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setStatus('idle')} style={{ marginTop: '0.5rem' }}>
                        Try Again
                    </Button>
                </div>
            )}
        </Modal>
    );
}
