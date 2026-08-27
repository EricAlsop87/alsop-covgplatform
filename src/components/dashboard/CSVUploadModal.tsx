'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Button } from '@/components/ui/Button/Button';
import {
    Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle,
    AlertTriangle, Copy, ArrowLeft,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { parseCSVFile, commitImport, pollBatchProgress, batchReEvaluateFlags, ParseResult, ImportRow, BatchEvalResult } from '@/lib/csvImport';
import styles from './CSVUploadModal.module.scss';

interface CSVUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportComplete?: () => void;
}

type Step = 'select' | 'parsing' | 'preview' | 'importing' | 'done';

const PARSE_PHASES = [
    'Reading CSV file…',
    'Mapping column headers…',
    'Validating dates & premiums…',
    'Detecting duplicates…',
    'Checking existing policies…',
    'Saving preview data…',
];

const IMPORT_PHASES = [
    'Preparing import…',
    'Creating clients & policies…',
    'Upserting policy terms…',
    'Generating notes…',
    'Recording activity events…',
    'Finalizing batch…',
];

export function CSVUploadModal({ isOpen, onClose, onImportComplete }: CSVUploadModalProps) {
    const [step, setStep] = useState<Step>('select');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [parseResult, setParseResult] = useState<ParseResult | null>(null);
    const [commitResult, setCommitResult] = useState<{ imported: number; skipped: number; errors: string[]; flags_created?: number; new_clients_created?: number; terms_created?: number; terms_updated?: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [expandedSection, setExpandedSection] = useState<string | null>('valid');
    const [progressPct, setProgressPct] = useState(0);
    const [progressMsg, setProgressMsg] = useState('');
    const [elapsed, setElapsed] = useState(0);
    const [reEvalStatus, setReEvalStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
    const [reEvalResult, setReEvalResult] = useState<BatchEvalResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Poll batch progress during importing step
    useEffect(() => {
        if (step !== 'importing' || !parseResult?.batch_id) return;

        const interval = setInterval(async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.access_token) return;

                const progress = await pollBatchProgress(parseResult.batch_id, session.access_token);
                setProgressPct(progress.progress_pct || 0);
                setProgressMsg(progress.progress_message || '');

                // If the batch is completed, the commit response handler will take over
            } catch {
                // Ignore polling errors
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [step, parseResult?.batch_id]);

    // Count elapsed time during parsing and importing
    useEffect(() => {
        if (step !== 'parsing' && step !== 'importing') {
            setElapsed(0);
            return;
        }
        setElapsed(0);
        const elapsedInterval = setInterval(() => {
            setElapsed(e => e + 1);
        }, 1000);

        return () => clearInterval(elapsedInterval);
    }, [step]);

    const resetState = useCallback(() => {
        setStep('select');
        setSelectedFile(null);
        setIsDragging(false);
        setParseResult(null);
        setCommitResult(null);
        setError(null);
        setExpandedSection('valid');
        setProgressPct(0);
        setProgressMsg('');
        setReEvalStatus('idle');
        setReEvalResult(null);
    }, []);

    const handleClose = () => {
        resetState();
        onClose();
    };

    const handleFileSelect = (file: File) => {
        if (file.name.endsWith('.csv') || file.type === 'text/csv') {
            setSelectedFile(file);
            setError(null);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
        e.target.value = '';
    };

    const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileSelect(file);
    };

    const handleParse = async () => {
        if (!selectedFile) return;
        setStep('parsing');
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                setError('Session expired. Please sign in again.');
                setStep('select');
                return;
            }

            const result = await parseCSVFile(selectedFile, session.access_token);

            if (!result.success) {
                setError(result.error || 'Failed to parse CSV');
                setStep('select');
                return;
            }

            setParseResult(result);
            setStep('preview');

            // Auto-expand the most relevant section
            if (result.stats.name_mismatch > 0) {
                setExpandedSection('name_mismatch');
            } else if (result.stats.invalid > 0) {
                setExpandedSection('invalid');
            } else {
                setExpandedSection('valid');
            }
        } catch {
            setError('Failed to parse CSV. Please try again.');
            setStep('select');
        }
    };

    const handleCommit = async () => {
        if (!parseResult?.batch_id) return;
        setStep('importing');
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                setError('Session expired.');
                setStep('preview');
                return;
            }

            const result = await commitImport(parseResult.batch_id, session.access_token);

            if (!result.success) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setError((result as any).error || 'Import failed. Check rows and try again.');
                setStep('preview');
                return;
            }

            setCommitResult(result);
            setStep('done');
            onImportComplete?.();
        } catch (e) {
            setError(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
            setStep('preview');
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // ─── Render helpers ───

    const renderStatBadge = (label: string, count: number, variant: 'success' | 'error' | 'warning' | 'info') => {
        if (count === 0) return null;
        const colorMap = {
            success: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: 'rgba(34, 197, 94, 0.2)' },
            error: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.2)' },
            warning: { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.2)' },
            info: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.2)' },
        };
        const c = colorMap[variant];
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                fontSize: '0.75rem', fontWeight: 600,
                padding: '0.25rem 0.625rem', borderRadius: '9999px',
                background: c.bg, color: c.color, border: `1px solid ${c.border}`,
            }}>
                {count} {label}
            </span>
        );
    };

    const renderRowSection = (title: string, icon: React.ReactNode, rows: ImportRow[], sectionKey: string) => {
        if (rows.length === 0) return null;
        const isExpanded = expandedSection === sectionKey;
        return (
            <div style={{ marginBottom: '0.75rem' }}>
                <button
                    onClick={() => setExpandedSection(isExpanded ? null : sectionKey)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                        padding: '0.5rem 0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-high)',
                        fontSize: '0.8125rem', fontWeight: 600,
                    }}
                >
                    {icon}
                    {title} ({rows.length})
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {isExpanded ? '▾' : '▸'}
                    </span>
                </button>
                {isExpanded && (
                    <div style={{
                        maxHeight: '240px', overflowY: 'auto',
                        border: '1px solid var(--border-default)', borderTop: 'none',
                        borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
                    }}>
                        <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-surface)' }}>
                                    <th style={thStyle}>Row</th>
                                    <th style={thStyle}>Policy #</th>
                                    <th style={thStyle}>Insured</th>
                                    <th style={thStyle}>Eff Date</th>
                                    <th style={thStyle}>Premium</th>
                                    <th style={thStyle}>Status / Issue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.row_index} style={{ borderBottom: '1px solid var(--border-default)' }}>
                                        <td style={tdStyle}>{row.row_index + 2}</td>
                                        <td style={tdStyle}>{row.policy_number || '—'}</td>
                                        <td style={tdStyle}>{row.insured_name || '—'}</td>
                                        <td style={tdStyle}>{row.effective_date || '—'}</td>
                                        <td style={tdStyle}>{row.annual_premium != null ? `$${row.annual_premium.toLocaleString()}` : '—'}</td>
                                        <td style={{ ...tdStyle, color: row.errors.length ? '#ef4444' : '#22c55e', maxWidth: '200px' }}>
                                            {row.errors.length > 0 ? row.errors.join('; ') : 'OK'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    // ─── Step content ───

    const modalTitle = {
        select: 'Upload CSV',
        parsing: 'Parsing CSV…',
        preview: 'Import Preview',
        importing: 'Importing…',
        done: 'Import Complete',
    }[step];

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title={modalTitle} maxWidth="720px">
            {error && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.625rem 0.875rem', marginBottom: '1rem',
                    background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: '#ef4444',
                }}>
                    <AlertCircle size={14} />
                    {error}
                </div>
            )}

            {/* ─── STEP: Select File ─── */}
            {step === 'select' && (
                <>
                    <div
                        className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={handleInputChange}
                            className={styles.hiddenInput}
                        />
                        {selectedFile ? (
                            <div className={styles.selectedFile}>
                                <FileSpreadsheet size={28} className={styles.fileIcon} />
                                <div className={styles.fileInfo}>
                                    <span className={styles.fileName}>{selectedFile.name}</span>
                                    <span className={styles.fileSize}>{formatFileSize(selectedFile.size)}</span>
                                </div>
                                <button className={styles.removeFileBtn} onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}>
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <div className={styles.dropPlaceholder}>
                                <Upload size={28} className={styles.uploadIcon} />
                                <span className={styles.dropText}>
                                    Drag & drop your CSV here, or <strong>browse</strong>
                                </span>
                                <span className={styles.dropHint}>Google Sheets export (.csv) accepted</span>
                            </div>
                        )}
                    </div>

                    <div className={styles.actions}>
                        <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
                        <Button variant="excel" size="sm" disabled={!selectedFile} onClick={handleParse}>
                            <CheckCircle2 className="w-4 h-4 mr-1.5" />
                            Parse &amp; Preview
                        </Button>
                    </div>
                </>
            )}

            {/* ─── STEP: Parsing ─── */}
            {step === 'parsing' && (
                <ProgressPanel
                    title={`Parsing ${selectedFile?.name || 'CSV'}…`}
                    phases={PARSE_PHASES}
                    elapsed={elapsed}
                    accentColor="#22c55e"
                    mode="animated"
                />
            )}

            {/* ─── STEP: Preview ─── */}
            {step === 'preview' && parseResult && (
                <>
                    {/* Stats bar */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                        {renderStatBadge('Valid', parseResult.stats.valid, 'success')}
                        {renderStatBadge('Invalid', parseResult.stats.invalid, 'error')}
                        {renderStatBadge('Duplicates', parseResult.stats.duplicate, 'warning')}
                        {renderStatBadge('Name Mismatches', parseResult.stats.name_mismatch, 'info')}
                        <span style={{
                            fontSize: '0.75rem', color: 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', marginLeft: 'auto',
                        }}>
                            {parseResult.stats.total} total rows
                        {parseResult.rows_preview_count != null && parseResult.rows_total_count != null &&
                            parseResult.rows_preview_count < parseResult.rows_total_count && (
                            <span style={{ marginLeft: '0.5rem', color: 'var(--text-accent)', fontWeight: 500 }}>
                                (showing {parseResult.rows_preview_count} of {parseResult.rows_total_count})
                            </span>
                        )}
                        </span>
                    </div>

                    {/* Row sections */}
                    {renderRowSection(
                        'Valid Rows',
                        <CheckCircle2 size={14} style={{ color: '#22c55e' }} />,
                        parseResult.rows.filter(r => r.status === 'valid'),
                        'valid'
                    )}
                    {renderRowSection(
                        'Name Mismatches (flagged for review)',
                        <AlertTriangle size={14} style={{ color: '#3b82f6' }} />,
                        parseResult.rows.filter(r => r.status === 'name_mismatch'),
                        'name_mismatch'
                    )}
                    {renderRowSection(
                        'Duplicates in File',
                        <Copy size={14} style={{ color: '#f59e0b' }} />,
                        parseResult.rows.filter(r => r.status === 'duplicate'),
                        'duplicate'
                    )}
                    {renderRowSection(
                        'Invalid Rows',
                        <AlertCircle size={14} style={{ color: '#ef4444' }} />,
                        parseResult.rows.filter(r => r.status === 'invalid'),
                        'invalid'
                    )}

                    {/* Actions */}
                    <div className={styles.actions} style={{ marginTop: '0.5rem' }}>
                        <Button variant="ghost" size="sm" onClick={() => { setStep('select'); setParseResult(null); }}>
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            Back
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
                        <Button
                            variant="excel"
                            size="sm"
                            disabled={parseResult.stats.valid === 0}
                            onClick={handleCommit}
                        >
                            <CheckCircle2 className="w-4 h-4 mr-1.5" />
                            Import {parseResult.stats.valid} Rows
                        </Button>
                    </div>
                </>
            )}

            {/* ─── STEP: Importing ─── */}
            {step === 'importing' && (
                <ProgressPanel
                    title={`Importing ${parseResult?.stats.valid || ''} rows…`}
                    phases={IMPORT_PHASES}
                    elapsed={elapsed}
                    accentColor="#3b82f6"
                    mode="progress"
                    progressPct={progressPct}
                    progressMsg={progressMsg}
                />
            )}

            {/* ─── STEP: Done ─── */}
            {step === 'done' && commitResult && (
                <>
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        padding: '1.5rem', gap: '0.75rem',
                    }}>
                        <CheckCircle2 size={40} style={{ color: '#22c55e' }} />
                        <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-high)' }}>
                            Import Complete!
                        </span>

                        {/* Primary stats */}
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
                            <span style={{ color: '#22c55e' }}>✓ {commitResult.imported} imported</span>
                            {commitResult.skipped > 0 && (
                                <span style={{ color: '#f59e0b' }}>⚠ {commitResult.skipped} skipped</span>
                            )}
                        </div>

                        {/* Enhanced stats grid */}
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr',
                            gap: '0.5rem 1.5rem', width: '100%', maxWidth: '320px',
                            marginTop: '0.5rem', fontSize: '0.8125rem',
                        }}>
                            {(commitResult.new_clients_created ?? 0) > 0 && (
                                <>
                                    <span style={{ color: 'var(--text-muted)' }}>New clients</span>
                                    <span style={{ color: 'var(--text-high)', fontWeight: 600 }}>{commitResult.new_clients_created}</span>
                                </>
                            )}
                            {(commitResult.terms_created ?? 0) > 0 && (
                                <>
                                    <span style={{ color: 'var(--text-muted)' }}>Terms created</span>
                                    <span style={{ color: 'var(--text-high)', fontWeight: 600 }}>{commitResult.terms_created}</span>
                                </>
                            )}
                            {(commitResult.terms_updated ?? 0) > 0 && (
                                <>
                                    <span style={{ color: 'var(--text-muted)' }}>Terms updated</span>
                                    <span style={{ color: 'var(--text-high)', fontWeight: 600 }}>{commitResult.terms_updated}</span>
                                </>
                            )}
                            {(commitResult.flags_created ?? 0) > 0 && (
                                <>
                                    <span style={{ color: 'var(--text-muted)' }}>Flags created</span>
                                    <span style={{ color: '#f87171', fontWeight: 600 }}>{commitResult.flags_created}</span>
                                </>
                            )}
                        </div>

                        {/* Enrichment note */}
                        {/* Re-evaluate flags section */}
                        <div style={{
                            width: '100%', marginTop: '0.75rem',
                            padding: '0.75rem 0.875rem',
                            background: reEvalStatus === 'done' ? 'rgba(34, 197, 94, 0.06)' : 'rgba(245, 158, 11, 0.06)',
                            border: `1px solid ${reEvalStatus === 'done' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)'}`,
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.75rem', color: 'var(--text-mid)',
                            lineHeight: 1.5,
                        }}>
                            {reEvalStatus === 'idle' && (
                                <>
                                    <strong style={{ color: '#f59e0b' }}>⚑ Flag Re-evaluation:</strong>{' '}
                                    The import used a lightweight flag engine. Click below to re-evaluate all imported policies with the full flag rules.
                                    This only updates CSV-sourced flags — enrichment and manual flags are untouched.
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={async () => {
                                                if (!parseResult?.batch_id) return;
                                                setReEvalStatus('running');
                                                try {
                                                    const { data: { session } } = await supabase.auth.getSession();
                                                    if (!session?.access_token) {
                                                        setReEvalStatus('error');
                                                        setReEvalResult({ success: false, error: 'Session expired' });
                                                        return;
                                                    }
                                                    const result = await batchReEvaluateFlags(parseResult.batch_id, session.access_token);
                                                    if (result.success) {
                                                        setReEvalStatus('done');
                                                        setReEvalResult(result);
                                                    } else {
                                                        setReEvalStatus('error');
                                                        setReEvalResult(result);
                                                    }
                                                } catch {
                                                    setReEvalStatus('error');
                                                    setReEvalResult({ success: false, error: 'Request failed' });
                                                }
                                            }}
                                            style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}
                                        >
                                            <AlertTriangle size={12} style={{ marginRight: '0.25rem' }} />
                                            Re-evaluate Flags ({commitResult.imported} policies)
                                        </Button>
                                    </div>
                                </>
                            )}
                            {reEvalStatus === 'running' && (
                                <>
                                    <strong style={{ color: '#f59e0b' }}>⏳ Re-evaluating flags…</strong>{' '}
                                    Running full flag engine on {commitResult.imported} policies. This may take a moment.
                                </>
                            )}
                            {reEvalStatus === 'done' && reEvalResult && (
                                <>
                                    <strong style={{ color: '#22c55e' }}>✓ Flags re-evaluated</strong>
                                    <div style={{ marginTop: '0.25rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        {reEvalResult.stale_flags_deleted} stale flags removed · {reEvalResult.flags_created} new flags created · {reEvalResult.flags_refreshed} refreshed · {reEvalResult.flags_resolved} resolved
                                    </div>
                                </>
                            )}
                            {reEvalStatus === 'error' && (
                                <>
                                    <strong style={{ color: '#ef4444' }}>✗ Flag re-evaluation failed:</strong>{' '}
                                    {reEvalResult?.error || 'Unknown error'}
                                </>
                            )}
                        </div>

                        {/* Enrichment note */}
                        <div style={{
                            width: '100%', marginTop: '0.75rem',
                            padding: '0.625rem 0.875rem',
                            background: 'rgba(99, 102, 241, 0.06)',
                            border: '1px solid rgba(99, 102, 241, 0.15)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.75rem', color: 'var(--text-mid)',
                            lineHeight: 1.5,
                        }}>
                            <strong style={{ color: '#818cf8' }}>💡 Tip:</strong> Enrichment and reports are not run during bulk import to save costs.
                            You can enrich policies individually from each policy&apos;s detail page when needed.
                        </div>

                        {commitResult.errors.length > 0 && (
                            <div style={{
                                width: '100%', maxHeight: '120px', overflowY: 'auto', marginTop: '0.5rem',
                                padding: '0.75rem', background: 'rgba(239, 68, 68, 0.05)',
                                border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 'var(--radius-sm)',
                                fontSize: '0.75rem', color: '#ef4444',
                            }}>
                                {commitResult.errors.map((e, i) => (
                                    <div key={i}>{e}</div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className={styles.actions}>
                        <Button variant="excel" size="sm" onClick={handleClose}>
                            Done
                        </Button>
                    </div>
                </>
            )}
        </Modal>
    );
}

// ─── Table styles ───
const thStyle: React.CSSProperties = {
    padding: '0.375rem 0.625rem',
    textAlign: 'left',
    fontWeight: 600,
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-default)',
    position: 'sticky',
    top: 0,
    background: 'var(--bg-surface)',
};

const tdStyle: React.CSSProperties = {
    padding: '0.375rem 0.625rem',
    color: 'var(--text-mid)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '160px',
};

// ─── Progress Panel (for Parsing & Importing steps) ───

function ProgressPanel({
    title,
    phases,
    elapsed,
    accentColor,
    mode = 'animated',
    progressPct,
    progressMsg,
}: {
    title: string;
    phases: string[];
    elapsed: number;
    accentColor: string;
    mode?: 'animated' | 'progress';
    progressPct?: number;
    progressMsg?: string;
}) {
    const [animatedPhase, setAnimatedPhase] = useState(0);

    useEffect(() => {
        if (mode !== 'animated') return;
        const interval = setInterval(() => {
            setAnimatedPhase(p => (p + 1) % phases.length);
        }, 2200);
        return () => clearInterval(interval);
    }, [mode, phases.length]);

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
    };

    const displayPct = mode === 'progress' ? (progressPct ?? 0) : undefined;
    const displayMsg = mode === 'progress' ? (progressMsg || 'Starting…') : phases[animatedPhase];

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '2rem 1.5rem', gap: '1.25rem',
        }}>
            <style>{`
                @keyframes csv-progress-bar {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(300%); }
                }
                @keyframes csv-pulse {
                    0%, 100% { transform: scale(1); opacity: 0.6; }
                    50% { transform: scale(1.3); opacity: 1; }
                }
                @keyframes csv-fade-in {
                    from { opacity: 0; transform: translateY(4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            {/* Title */}
            <span style={{
                fontSize: '1rem', fontWeight: 700, color: 'var(--text-high)',
                letterSpacing: '-0.01em',
            }}>
                {title}
            </span>

            {/* Progress bar */}
            <div style={{
                width: '100%', height: '4px',
                background: 'var(--bg-surface)', borderRadius: '4px',
                overflow: 'hidden', position: 'relative',
            }}>
                {mode === 'progress' && displayPct != null ? (
                    <div style={{
                        position: 'absolute', top: 0, left: 0,
                        width: `${displayPct}%`, height: '100%',
                        background: accentColor,
                        borderRadius: '4px',
                        transition: 'width 0.5s ease',
                    }} />
                ) : (
                    <div style={{
                        position: 'absolute', top: 0, left: 0,
                        width: '33%', height: '100%',
                        background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
                        borderRadius: '4px',
                        animation: 'csv-progress-bar 1.4s ease-in-out infinite',
                    }} />
                )}
            </div>

            {/* Percentage (progress mode only) */}
            {mode === 'progress' && displayPct != null && (
                <span style={{
                    fontSize: '1.5rem', fontWeight: 700, color: accentColor,
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    {displayPct}%
                </span>
            )}

            {/* Phase dots (animated mode only) */}
            {mode === 'animated' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {phases.map((_, i) => {
                        const isActive = i === animatedPhase;
                        const isPast = i < animatedPhase;
                        return (
                            <div
                                key={i}
                                style={{
                                    width: isActive ? '10px' : '6px',
                                    height: isActive ? '10px' : '6px',
                                    borderRadius: '50%',
                                    background: isPast || isActive ? accentColor : 'var(--border-default)',
                                    opacity: isPast ? 0.4 : 1,
                                    transition: 'all 0.3s ease',
                                    animation: isActive ? 'csv-pulse 1.2s ease-in-out infinite' : 'none',
                                }}
                            />
                        );
                    })}
                </div>
            )}

            {/* Current status text */}
            <span
                key={mode === 'progress' ? displayMsg : animatedPhase}
                style={{
                    fontSize: '0.8125rem', color: 'var(--text-mid)',
                    animation: 'csv-fade-in 0.3s ease-out',
                    minHeight: '1.25rem',
                    textAlign: 'center',
                }}
            >
                {displayMsg}
            </span>

            {/* Elapsed time */}
            <span style={{
                fontSize: '0.6875rem', color: 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums',
            }}>
                Elapsed: {formatTime(elapsed)}
            </span>
        </div>
    );
}
