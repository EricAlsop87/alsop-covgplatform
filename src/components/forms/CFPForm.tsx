'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import styles from './CFPForm.module.scss';
import { Upload, CheckCircle, AlertCircle, ArrowRight, Loader2, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';


/** Maximum file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.pdf']);

type SubmitState = 'idle' | 'loading' | 'success' | 'error';
type ProcessingStatus = 'uploading' | 'queued' | 'processing' | 'parsed' | 'failed' | null;
type ProcessingStep = 'extracting_text' | 'parsing_fields' | 'creating_records' | 'enriching_property' | 'evaluating_flags' | 'generating_report' | 'complete' | null;

interface UploadResult {
    message: string;
    fileName?: string;
    submittedAt?: string;
    submissionId?: string;
}

interface CFPFormProps {
    /** Authenticated user ID (required — this component should only render for authed users) */
    userId: string;
    /** User role — determines T&C visibility and post-submit routing */
    userRole?: 'admin' | 'service' | 'agent' | 'user' | 'customer';
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CFPForm({ userId, userRole }: CFPFormProps) {
    const router = useRouter();
    const [submitState, setSubmitState] = useState<SubmitState>('idle');
    const [file, setFile] = useState<File | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);
    const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>(null);
    const [processingStep, setProcessingStep] = useState<ProcessingStep>(null);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [sessionUploadCount, setSessionUploadCount] = useState(0);
    const [lastUpload, setLastUpload] = useState<{ fileName: string; time: Date } | null>(null);
    const formRef = useRef<HTMLFormElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const autoResetTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastUploadFileNameRef = useRef<string | null>(null);
    const dragCounterRef = useRef(0);
    const pollAttemptRef = useRef(0);
    const MAX_POLL_ATTEMPTS = 60; // ~3 min at 3s intervals

    const isAgent = userRole === 'admin' || userRole === 'service';

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortRef.current) abortRef.current.abort();
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
        };
    }, []);

    // Keyboard shortcut: Ctrl+U to open file picker (agent ergonomic)
    useEffect(() => {
        if (!isAgent) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
                e.preventDefault();
                if (submitState === 'idle' && fileInputRef.current) {
                    fileInputRef.current.click();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isAgent, submitState]);

    const validateFile = (selectedFile: File): string | null => {
        const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
            return `Unsupported file type "${ext}". Please upload a PDF file.`;
        }
        if (selectedFile.size === 0) {
            return 'The selected file is empty (0 bytes). Please select a valid PDF.';
        }
        if (selectedFile.size > MAX_FILE_SIZE) {
            return `File size (${formatFileSize(selectedFile.size)}) exceeds the 10MB limit.`;
        }
        return null;
    };

    const handleFileSelect = useCallback((selectedFile: File) => {
        setFileError(null);
        const error = validateFile(selectedFile);
        if (error) {
            setFileError(error);
            setFile(null);
            return;
        }
        setFile(selectedFile);
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
        }
    };

    // Drag and drop handlers (use counter ref to prevent child-element flickering)
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (dragCounterRef.current === 1) setIsDragOver(true);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current <= 0) {
            dragCounterRef.current = 0;
            setIsDragOver(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = 0;
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    }, [handleFileSelect]);

    // Poll for processing status after successful upload
    const startPolling = useCallback((submissionId: string) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollAttemptRef.current = 0;

        const stopPoll = () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        };

        const checkStatus = async () => {
            pollAttemptRef.current++;

            // Safety: stop after MAX_POLL_ATTEMPTS to prevent infinite loops
            if (pollAttemptRef.current > MAX_POLL_ATTEMPTS) {
                stopPoll();
                setProcessingStatus('failed');
                return;
            }

            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.access_token) return;

                const res = await fetch(`/api/upload/status?ids=${submissionId}`, {
                    headers: { 'Authorization': `Bearer ${session.access_token}` },
                });
                if (!res.ok) {
                    // On repeated server errors, give up after a few
                    if (pollAttemptRef.current > 5 && res.status >= 500) {
                        stopPoll();
                        setProcessingStatus('failed');
                    }
                    return;
                }

                const json = await res.json();
                if (!json.success || !json.data?.[0]) return;

                const status = json.data[0].status as ProcessingStatus;
                const step = json.data[0].processing_step as ProcessingStep;
                setProcessingStatus(status);
                setProcessingStep(step);

                // Terminal states: stop polling
                if (status === 'parsed' || status === 'failed' || status === ('duplicate' as ProcessingStatus)) {
                    stopPoll();
                }

                if (status === 'parsed') {
                    window.dispatchEvent(new CustomEvent('decPageParsed'));
                    // Auto-reset form for agents after 3s so they can keep uploading
                    if (isAgent) {
                        autoResetTimerRef.current = setTimeout(() => {
                            // Persist last upload info before resetting
                            const fn = lastUploadFileNameRef.current;
                            if (fn) {
                                setLastUpload({ fileName: fn, time: new Date() });
                            }
                            setSubmitState('idle');
                            setUploadResult(null);
                            setProcessingStatus(null);
                            setProcessingStep(null);
                            setUploadProgress(0);
                            // Clear file input so same file can be re-selected
                            if (fileInputRef.current) fileInputRef.current.value = '';
                        }, 3000);
                    }
                }
            } catch {
                // Polling error — non-fatal, keep trying
            }
        };

        // Check immediately, then every 3 seconds
        checkStatus();
        pollIntervalRef.current = setInterval(checkStatus, 3000);
    }, [isAgent]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setFileError('Please select a PDF file first.');
            return;
        }

        // Cancel any in-flight upload
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        // Cancel any pending auto-reset timer from a previous upload
        if (autoResetTimerRef.current) {
            clearTimeout(autoResetTimerRef.current);
            autoResetTimerRef.current = null;
        }
        // Cancel any active polling from a previous upload
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }

        setSubmitState('loading');
        setUploadResult(null);
        setUploadProgress(0);
        setProcessingStatus('uploading');
        setProcessingStep(null);

        try {
            const formData = new FormData();
            formData.set('file', file);

            // Auth token is required — user is always authenticated at this point
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                setSubmitState('error');
                setProcessingStatus(null);
                setUploadResult({ message: 'Session expired. Please refresh the page and sign in again.' });
                return;
            }

            // Use XMLHttpRequest for upload progress tracking
            const result = await new Promise<{ ok: boolean; data: Record<string, unknown> }>((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const pct = Math.round((event.loaded / event.total) * 100);
                        setUploadProgress(pct);
                    }
                });

                xhr.addEventListener('load', () => {
                    try {
                        const json = JSON.parse(xhr.responseText);
                        resolve({ ok: xhr.status >= 200 && xhr.status < 300, data: json });
                    } catch {
                        // Include status + response snippet for debugging
                        const snippet = (xhr.responseText || '').slice(0, 120);
                        reject(new Error(`Server returned an invalid response (HTTP ${xhr.status}): ${snippet}`));
                    }
                });

                xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
                xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
                xhr.addEventListener('timeout', () => reject(new Error('Upload timed out. The server took too long to respond. Please try again.')));

                // Listen for abort signal
                abortRef.current?.signal.addEventListener('abort', () => xhr.abort());

                xhr.timeout = 90000; // 90 seconds
                xhr.open('POST', '/api/upload');
                xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
                xhr.send(formData);
            });

            if (!result.ok || !result.data.success) {
                setSubmitState('error');
                setProcessingStatus(null);
                setUploadResult({
                    message: (result.data.message as string) || 'Upload failed. Please try again.',
                });
                return;
            }

            const responseData = result.data.data as Record<string, unknown> | undefined;
            const submissionId = responseData?.submissionId as string | undefined;

            setSubmitState('success');
            setSessionUploadCount(prev => prev + 1);
            setProcessingStatus('queued');
            const uploadedFileName = (responseData?.fileName as string | undefined) || file.name;
            lastUploadFileNameRef.current = uploadedFileName;
            setUploadResult({
                message: result.data.message as string,
                fileName: uploadedFileName,
                submittedAt: responseData?.submittedAt as string | undefined,
                submissionId,
            });

            // Track pending uploads globally for toast notifications
            if (submissionId) {
                try {
                    const key = 'cfp_pending_dec_uploads';
                    const stored = sessionStorage.getItem(key);
                    const pending = stored ? JSON.parse(stored) : [];
                    if (!pending.includes(submissionId)) {
                        pending.push(submissionId);
                        sessionStorage.setItem(key, JSON.stringify(pending));
                    }
                } catch (e) {
                    logger.error('CFPForm', 'Failed to update session storage for dec page tracking', { error: e instanceof Error ? e.message : String(e) })
                }

                // Notify DecPageObserver about the new upload
                window.dispatchEvent(new CustomEvent('decPageUploaded'));

                // Start inline status polling
                startPolling(submissionId);
            }

            // Reset file after successful upload
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (formRef.current) formRef.current.reset();
        } catch (err) {
            if (err instanceof Error && err.message === 'Upload cancelled') {
                setSubmitState('idle');
                setProcessingStatus(null);
                return;
            }
            setSubmitState('error');
            setProcessingStatus(null);
            setUploadResult({
                message: err instanceof Error
                    ? `Network error: ${err.message}`
                    : 'An unexpected error occurred. Please check your connection and try again.',
            });
        }
    };

    // Processing status label for success state (with granular step awareness)
    const getProcessingLabel = (): { text: string; color: string; icon: React.ReactNode } => {
        const spinIcon = <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />;

        // If we have a granular processing_step and status is 'processing', show the step
        if (processingStatus === 'processing' && processingStep) {
            const stepLabels: Record<string, { text: string; color: string }> = {
                extracting_text: { text: 'Extracting text from PDF…', color: 'var(--accent-primary, #6366f1)' },
                parsing_fields: { text: 'Parsing declaration fields…', color: 'var(--accent-primary, #6366f1)' },
                creating_records: { text: 'Creating policy records…', color: 'var(--accent-primary, #6366f1)' },
                enriching_property: { text: 'Enriching property data (ATTOM, satellite, AI)…', color: 'var(--accent-info, #3b82f6)' },
                evaluating_flags: { text: 'Running flag evaluation…', color: 'var(--accent-info, #3b82f6)' },
                generating_report: { text: 'Generating AI report…', color: 'var(--accent-info, #3b82f6)' },
                complete: { text: 'Finalizing…', color: 'var(--status-success, #22c55e)' },
            };
            const step = stepLabels[processingStep] || { text: 'Processing…', color: 'var(--accent-primary, #6366f1)' };
            return { ...step, icon: spinIcon };
        }

        switch (processingStatus) {
            case 'uploading':
                return { text: 'Uploading…', color: 'var(--accent-primary, #6366f1)', icon: spinIcon };
            case 'queued':
                return { text: 'Queued for processing…', color: 'var(--accent-warning, #f59e0b)', icon: spinIcon };
            case 'processing':
                return { text: 'Processing declaration page…', color: 'var(--accent-primary, #6366f1)', icon: spinIcon };
            case 'parsed':
                return { text: 'Successfully processed!', color: 'var(--status-success, #22c55e)', icon: <CheckCircle size={16} /> };
            case 'failed':
                return { text: 'Processing failed', color: 'var(--status-error, #ef4444)', icon: <AlertCircle size={16} /> };
            default:
                return { text: 'Processing…', color: 'var(--text-muted)', icon: spinIcon };
        }
    };

    return (
        <Card className={styles.formContainer} variant="glass">
            <div className={styles.header}>
                <h2 className={styles.title}>
                    {isAgent ? 'Upload Declaration Page' : 'Submit for Coverage Review'}
                    {isAgent && sessionUploadCount > 0 && (
                        <span style={{
                            marginLeft: '0.75rem',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '0.2rem 0.6rem',
                            borderRadius: '999px',
                            background: 'var(--bg-success-subtle, rgba(34, 197, 94, 0.12))',
                            color: 'var(--status-success, #22c55e)',
                            verticalAlign: 'middle',
                        }}>
                            {sessionUploadCount} uploaded
                        </span>
                    )}
                </h2>
                {!isAgent && (
                    <p className={styles.description}>
                        Upload your current Declarations Page for a comprehensive professional review.
                        We&apos;ll analyze your policy and identify any coverage gaps.
                    </p>
                )}
                {isAgent && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Tip: Press <kbd style={{ background: 'var(--bg-surface-raised)', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid var(--border-default)', fontSize: '0.7rem', fontWeight: 600 }}>Ctrl+U</kbd> to quickly open the file picker
                    </p>
                )}
                {/* Persistent "last upload" indicator for agents */}
                {isAgent && lastUpload && submitState === 'idle' && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginTop: '0.6rem',
                        padding: '0.45rem 0.75rem',
                        borderRadius: '6px',
                        background: 'var(--bg-success-subtle, rgba(34, 197, 94, 0.08))',
                        border: '1px solid rgba(34, 197, 94, 0.15)',
                        fontSize: '0.78rem',
                        color: 'var(--status-success, #22c55e)',
                    }}>
                        <CheckCircle size={14} style={{ flexShrink: 0 }} />
                        <span style={{ fontWeight: 500 }}>Last upload:</span>
                        <span style={{ color: 'var(--text-mid)', fontWeight: 400 }}>{lastUpload.fileName}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginLeft: 'auto' }}>
                            {lastUpload.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                )}
            </div>

            {submitState === 'success' && uploadResult ? (
                /* ─── Inline Success State ─── */
                <div style={{
                    textAlign: 'center',
                    padding: '2.5rem 1.5rem',
                }}>
                    <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: 'var(--bg-success-subtle, rgba(34, 197, 94, 0.15))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.25rem',
                    }}>
                        <CheckCircle size={28} style={{ color: 'var(--status-success, #22c55e)' }} />
                    </div>

                    <h3 style={{ color: 'var(--status-success, #22c55e)', fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                        Declaration Submitted Successfully
                    </h3>

                    {uploadResult.fileName && (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                            {uploadResult.fileName}
                        </p>
                    )}

                    {/* ─── Inline Processing Status ─── */}
                    {(() => {
                        const status = getProcessingLabel();
                        const isServerProcessing = processingStatus === 'queued' || processingStatus === 'processing';
                        return (
                            <>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    color: status.color,
                                    fontSize: '0.85rem',
                                    marginTop: '1rem',
                                    padding: '0.625rem 1rem',
                                    background: 'var(--bg-surface-raised, rgba(255,255,255,0.03))',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-md, 0.5rem)',
                                }}>
                                    {status.icon}
                                    {status.text}
                                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                                </div>
                                {isServerProcessing && (
                                    <p style={{
                                        textAlign: 'center',
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        marginTop: '0.625rem',
                                        lineHeight: 1.5,
                                    }}>
                                        ✓ Your file has been received. Processing continues in the background
                                        — you can safely navigate away from this page.
                                    </p>
                                )}
                            </>
                        );
                    })()}

                    {isAgent && processingStatus === 'parsed' && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            color: 'var(--text-muted)',
                            fontSize: '0.85rem',
                            marginTop: '0.75rem',
                        }}>
                            <div style={{
                                width: '16px', height: '16px',
                                border: '2px solid var(--border-default)',
                                borderTopColor: 'var(--accent-primary, #3b82f6)',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                            }} />
                            Returning to dashboard...
                        </div>
                    )}

                    {!isAgent && processingStatus === 'parsed' && (
                        /* Client: what happens next */
                        <div style={{
                            background: 'var(--bg-info-subtle, rgba(59, 130, 246, 0.08))',
                            border: '1px solid var(--border-info, rgba(59, 130, 246, 0.15))',
                            borderRadius: '0.75rem',
                            padding: '1.25rem',
                            marginTop: '1.25rem',
                            textAlign: 'left',
                        }}>
                            <p style={{ color: 'var(--accent-primary, #60a5fa)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                                What happens next?
                            </p>
                            <ul style={{ color: 'var(--text-mid)', fontSize: '0.85rem', lineHeight: 1.8, paddingLeft: '1.25rem', margin: 0 }}>
                                <li>Your declaration has been securely processed</li>
                                <li>Our team will review your policy details</li>
                                <li>You&apos;ll receive a comprehensive coverage analysis</li>
                                <li>Your agent will reach out with findings and recommendations</li>
                            </ul>
                        </div>
                    )}

                    {/* Upload another */}
                    <button
                        onClick={() => {
                            // Persist last upload info before resetting
                            const fn = lastUploadFileNameRef.current;
                            if (fn) {
                                setLastUpload({ fileName: fn, time: new Date() });
                            }
                            setSubmitState('idle');
                            setUploadResult(null);
                            setProcessingStatus(null);
                            setProcessingStep(null);
                            setUploadProgress(0);
                            if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
                            if (autoResetTimerRef.current) { clearTimeout(autoResetTimerRef.current); autoResetTimerRef.current = null; }
                            if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        style={{
                            marginTop: '1.5rem',
                            background: 'transparent',
                            border: '1px solid var(--border-default)',
                            color: 'var(--text-muted)',
                            padding: '0.5rem 1.25rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                        }}
                    >
                        Upload another declaration
                    </button>
                </div>
            ) : (
                /* ─── Upload Form ─── */
                <form ref={formRef} onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Upload Declarations Page (PDF only)</label>
                        <div
                            className={`${styles.fileInputContainer} ${isDragOver ? styles.dragover : ''}`}
                            onDragEnter={handleDragEnter}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                        >
                            <input
                                type="file"
                                name="file"
                                ref={fileInputRef}
                                accept=".pdf"
                                onChange={handleFileChange}
                                /* required removed: breaks drag-and-drop since dropped files don't populate the native input */
                            />
                            <Upload className={styles.uploadIcon} size={24} />
                            <span className={styles.uploadText}>
                                {file ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <FileText size={16} />
                                        {file.name}
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                            ({formatFileSize(file.size)})
                                        </span>
                                    </span>
                                ) : isDragOver ? (
                                    'Drop your PDF here'
                                ) : (
                                    'Click to upload or drag and drop'
                                )}
                            </span>
                            <span className={styles.uploadHint}>
                                Supported format: PDF only (max 10MB)
                            </span>
                        </div>
                        {fileError && (
                            <p style={{
                                color: 'var(--status-error, #fca5a5)',
                                fontSize: '0.8rem',
                                marginTop: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem',
                            }}>
                                <AlertCircle size={14} />
                                {fileError}
                            </p>
                        )}
                    </div>

                    {/* Upload Progress Bar */}
                    {submitState === 'loading' && uploadProgress > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '0.375rem',
                                fontSize: '0.8rem',
                                color: 'var(--text-muted)',
                            }}>
                                <span>Uploading...</span>
                                <span>{uploadProgress}%</span>
                            </div>
                            <div style={{
                                height: '6px',
                                background: 'var(--bg-surface-raised, rgba(255,255,255,0.06))',
                                borderRadius: '3px',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    height: '100%',
                                    width: `${uploadProgress}%`,
                                    background: 'var(--accent-primary, #6366f1)',
                                    borderRadius: '3px',
                                    transition: 'width 0.3s ease',
                                }} />
                            </div>
                            <p style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem',
                                fontSize: '0.75rem',
                                color: 'var(--accent-warning, #f59e0b)',
                                marginTop: '0.5rem',
                                fontWeight: 500,
                            }}>
                                <AlertCircle size={13} />
                                Please stay on this page while your file uploads.
                            </p>
                        </div>
                    )}

                    {/* Terms and Conditions — clients only */}
                    {!isAgent && (
                        <div className={styles.termsSection}>
                            <h3 className={styles.termsTitle}>Terms and Conditions</h3>
                            <div className={styles.termsContent}>
                                <p style={{ fontWeight: 700, color: 'var(--text-high)', marginBottom: '0.75rem' }}>
                                    IMPORTANT NOTICE: PLEASE READ THESE TERMS &amp; CONDITIONS CAREFULLY BEFORE SUBMITTING YOUR POLICY DOCUMENTS.
                                </p>

                                <p><strong>1. Scope of Service &amp; Purpose</strong><br />
                                CoverageCheckNow and Alsop and Associates Insurance Agency (&quot;Agency&quot;, &quot;we&quot;, &quot;us&quot;) provide an automated and agent-assisted policy review service designed to evaluate property insurance declarations pages, assess potential coverage gaps, and identify risk exposures. This service is provided for informational and educational advisory purposes to assist policyholders in reviewing their insurance coverage.</p>

                                <p><strong>2. No Binding Authority &amp; Policy Contract Supremacy</strong><br />
                                Submitting a document or receiving a coverage review report does <strong>NOT</strong> modify, amend, bind, cancel, or reinstate any insurance policy contract. Coverage changes or new policy placements can ONLY be bound upon explicit written confirmation from a licensed insurance producer / agent of record. The official insurance policy contract issued by your insurance carrier (including primary property insurance or companion Difference in Conditions carriers) remains the sole governing legal agreement defining your coverage, terms, limits, and exclusions.</p>

                                <p><strong>3. Primary Policy &amp; Companion DIC Notice</strong><br />
                                Certain primary property insurance policies provide limited named peril coverage (such as fire, lightning, internal explosion, and smoke) and may <strong>NOT</strong> cover water damage, theft, general liability, earthquake, or flood hazards without a separate Companion Difference in Conditions (DIC) or comprehensive specialty policy. Recommendations generated by CoverageCheckNow are based solely on documents uploaded and third-party data available at the time of review.</p>

                                <p><strong>4. User Authorization &amp; Information Accuracy</strong><br />
                                By uploading a declarations page, you represent and warrant that you are the named insured, policy owner, or an authorized representative with legal authority to submit the document. You authorize Alsop and Associates Insurance Agency to process, analyze, and securely store the uploaded document and property information to provide coverage gap analysis, agency representation, and renewal advisory services.</p>

                                <p><strong>5. Data Privacy &amp; Protection</strong><br />
                                Your personal information and policy data are maintained in strict confidence in compliance with applicable federal and California privacy regulations, including the California Consumer Privacy Act (CCPA). We do not sell or rent your personal information to third-party data brokers.</p>

                                <p><strong>6. Limitation of Liability &amp; Disclaimer</strong><br />
                                To the maximum extent permitted under applicable law, Alsop and Associates Insurance Agency, its officers, directors, licensed producers, software providers, and affiliates shall not be liable for any direct, indirect, incidental, or consequential damages resulting from unstated policy exclusions, omitted carrier endorsements, user-submitted document errors, or reliance on automated risk scoring algorithms. Policyholders remain responsible for reviewing full policy contracts with their insurance producer.</p>

                                <p><strong>7. Electronic Signatures &amp; Communications Consent</strong><br />
                                By checking the agreement box below, you consent to receive electronic communications regarding your coverage review and policy advisory services, and agree that checking the box constitutes your valid electronic signature under the California Uniform Electronic Transactions Act (UETA) and the federal E-SIGN Act.</p>
                            </div>
                            <div className={styles.termsCheckbox}>
                                <input 
                                    type="checkbox" 
                                    id="acceptTerms" 
                                    checked={termsAccepted}
                                    onChange={(e) => setTermsAccepted(e.target.checked)}
                                    required 
                                />
                                <label htmlFor="acceptTerms">
                                    I have read and agree to the Terms and Conditions
                                </label>
                            </div>
                        </div>
                    )}

                    <Button
                        type="submit"
                        fullWidth
                        isLoading={submitState === 'loading'}
                        disabled={!!fileError || submitState === 'loading' || !file || (!isAgent && !termsAccepted)}
                    >
                        {submitState === 'loading' ? 'Uploading...' : (isAgent ? 'Upload Declaration' : 'Submit for Review')}
                    </Button>

                    {/* Persistent hint when button is disabled due to T&C */}
                    {!isAgent && !termsAccepted && (
                        <p style={{
                            textAlign: 'center',
                            fontSize: '0.8rem',
                            color: 'var(--accent-warning, #f59e0b)',
                            marginTop: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                        }}>
                            <AlertCircle size={14} />
                            Please accept the Terms and Conditions to continue
                        </p>
                    )}

                    {/* Persistent hint when no file is attached */}
                    {!file && (
                        <p style={{
                            textAlign: 'center',
                            fontSize: '0.8rem',
                            color: 'var(--accent-warning, #f59e0b)',
                            marginTop: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                        }}>
                            <AlertCircle size={14} />
                            A PDF declaration page is required to submit
                        </p>
                    )}

                    {/* Inline error below button */}
                    {submitState === 'error' && uploadResult && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.75rem',
                            padding: '1rem 1.25rem',
                            background: 'var(--bg-error-subtle, rgba(239, 68, 68, 0.1))',
                            border: '1px solid var(--border-error, rgba(239, 68, 68, 0.2))',
                            borderRadius: '0.75rem',
                            marginTop: '1rem',
                        }}>
                            <AlertCircle size={20} style={{ color: 'var(--status-error, #ef4444)', flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <p style={{ color: 'var(--status-error, #fca5a5)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                                    Upload failed
                                </p>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    {uploadResult.message}
                                </p>
                            </div>
                        </div>
                    )}
                </form>
            )}
        </Card>
    );
}
