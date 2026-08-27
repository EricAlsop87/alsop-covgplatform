"use client";

import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { fetchRecentSubmissions, SubmissionDebugRow } from "@/lib/api";
import {
    FileText, AlertCircle, CheckCircle, Clock, RefreshCw,
    ChevronRight, X, Database, Loader2
} from "lucide-react";

export default function SubmissionsDebug() {
    const [submissions, setSubmissions] = useState<SubmissionDebugRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedJson, setSelectedJson] = useState<string | null>(null);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await fetchRecentSubmissions(20);
            setSubmissions(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load submissions");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const statusConfig: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
        parsed: { color: 'var(--status-success)', bg: 'var(--bg-success-subtle)', icon: CheckCircle },
        done: { color: 'var(--status-success)', bg: 'var(--bg-success-subtle)', icon: CheckCircle },
        failed: { color: 'var(--status-error)', bg: 'var(--bg-error-subtle)', icon: AlertCircle },
        processing: { color: 'var(--status-warning)', bg: 'rgba(234,179,8,0.08)', icon: Clock },
        queued: { color: 'var(--text-muted)', bg: 'var(--bg-surface-raised)', icon: Clock },
    };

    const getStatus = (s: string) => statusConfig[s] || { color: 'var(--text-muted)', bg: 'var(--bg-surface-raised)', icon: FileText };

    // Summary counts
    const parsed = submissions.filter(s => s.status === 'parsed' || s.status === 'done').length;
    const failed = submissions.filter(s => s.status === 'failed').length;
    const processing = submissions.filter(s => s.status === 'processing' || s.status === 'queued').length;

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh', gap: '0.75rem', color: 'var(--text-muted)' }}>
                <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: '0.85rem' }}>Loading submissions…</span>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                maxWidth: 600, margin: '3rem auto', padding: '1.5rem',
                background: 'var(--bg-error-subtle)', border: '1px solid rgba(191,25,50,0.2)',
                borderRadius: 'var(--radius-lg)', textAlign: 'center',
            }}>
                <AlertCircle size={28} style={{ color: 'var(--status-error)', marginBottom: '0.75rem' }} />
                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-high)', marginBottom: '0.375rem' }}>Error Loading Submissions</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--status-error)' }}>{error}</p>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' }}>


            {/* Submissions Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-high)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <Database size={20} style={{ color: 'var(--accent-primary)' }} />
                        Submissions Pipeline
                    </h1>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Last {submissions.length} ingestion jobs — document upload, PDF extraction, and parse results
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={loadData}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.375rem',
                            padding: '0.5rem 0.875rem', borderRadius: '8px',
                            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                            color: 'var(--text-mid)', fontSize: '0.78rem', fontWeight: 500,
                            cursor: 'pointer', transition: 'all 0.15s',
                        }}
                    >
                        <RefreshCw size={13} /> Refresh
                    </button>
                </div>
            </div>


            {/* Summary strip */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {[
                    { label: 'Complete', count: parsed, color: 'var(--status-success)', bg: 'var(--bg-success-subtle)' },
                    { label: 'Failed', count: failed, color: 'var(--status-error)', bg: 'var(--bg-error-subtle)' },
                    { label: 'Processing', count: processing, color: 'var(--status-warning)', bg: 'rgba(234,179,8,0.08)' },
                    { label: 'Total', count: submissions.length, color: 'var(--text-high)', bg: 'var(--bg-surface-raised)' },
                ].map(s => (
                    <div
                        key={s.label}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.5rem 0.875rem', borderRadius: '8px',
                            background: s.bg, border: '1px solid var(--border-default)',
                        }}
                    >
                        <span style={{ fontSize: '1.125rem', fontWeight: 800, color: s.color }}>{s.count}</span>
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{s.label}</span>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface-raised)' }}>
                            {['Time / ID', 'Job Status', 'Parse', 'Extracted Name / Policy', 'Missing Fields', ''].map((h, i) => (
                                <th key={i} style={{
                                    padding: '0.6rem 0.875rem',
                                    textAlign: i === 5 ? 'right' : 'left',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    color: 'var(--text-muted)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                }}>
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {submissions.map((sub) => {
                            const sc = getStatus(sub.status);
                            const StatusIcon = sc.icon;

                            return (
                                <tr
                                    key={sub.id}
                                    style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.12s' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(34,67,182,0.03)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {/* Time / ID */}
                                    <td style={{ padding: '0.625rem 0.875rem', verticalAlign: 'top' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-high)', fontSize: '0.78rem' }}>
                                            {format(new Date(sub.created_at), "MMM d, h:mm a")}
                                        </div>
                                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '0.15rem' }}>
                                            {sub.id.substring(0, 8)}…
                                        </div>
                                    </td>

                                    {/* Job Status */}
                                    <td style={{ padding: '0.625rem 0.875rem', verticalAlign: 'top' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '0.3rem',
                                                padding: '0.2rem 0.5rem', borderRadius: '999px',
                                                background: sc.bg, fontSize: '0.72rem', fontWeight: 600,
                                                color: sc.color, textTransform: 'capitalize',
                                            }}>
                                                <StatusIcon size={12} />
                                                {sub.status}
                                            </div>
                                        </div>
                                        {sub.error_message && (
                                            <div style={{
                                                marginTop: '0.3rem', fontSize: '0.68rem',
                                                color: 'var(--status-error)',
                                                maxWidth: '280px',
                                                overflow: 'hidden',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                            }}>
                                                {sub.error_message}
                                            </div>
                                        )}
                                    </td>

                                    {/* Parse Status */}
                                    <td style={{ padding: '0.625rem 0.875rem', verticalAlign: 'top' }}>
                                        {sub.dec_page_id ? (
                                            (() => {
                                                const ps = sub.parse_status || 'unknown';
                                                const isParsed = ps === 'parsed';
                                                const isReview = ps === 'needs_review';
                                                return (
                                                    <span style={{
                                                        padding: '0.15rem 0.4rem', borderRadius: '4px',
                                                        fontSize: '0.68rem', fontWeight: 600,
                                                        background: isParsed ? 'var(--bg-success-subtle)' : isReview ? 'rgba(234,179,8,0.1)' : 'var(--bg-surface-raised)',
                                                        color: isParsed ? 'var(--status-success)' : isReview ? 'var(--status-warning)' : 'var(--text-muted)',
                                                    }}>
                                                        {ps}
                                                    </span>
                                                );
                                            })()
                                        ) : (
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</span>
                                        )}
                                    </td>

                                    {/* Name / Policy */}
                                    <td style={{ padding: '0.625rem 0.875rem', verticalAlign: 'top' }}>
                                        {sub.insured_name ? (
                                            <div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-high)', fontSize: '0.78rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {sub.insured_name}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', fontWeight: 500, marginTop: '0.1rem' }}>
                                                    #{sub.policy_number || 'N/A'}
                                                </div>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</span>
                                        )}
                                    </td>

                                    {/* Missing Fields */}
                                    <td style={{ padding: '0.625rem 0.875rem', verticalAlign: 'top' }}>
                                        {sub.missing_fields && sub.missing_fields.length > 0 ? (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', maxWidth: '220px' }}>
                                                {sub.missing_fields.map(f => (
                                                    <span key={f} style={{
                                                        padding: '0.1rem 0.35rem', borderRadius: '3px',
                                                        background: 'var(--bg-error-subtle)',
                                                        color: 'var(--status-error)',
                                                        fontSize: '0.62rem', fontWeight: 600,
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {f}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : sub.parse_status === 'parsed' ? (
                                            <span style={{ fontSize: '0.68rem', color: 'var(--status-success)', fontWeight: 500, opacity: 0.7 }}>None</span>
                                        ) : (
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</span>
                                        )}
                                    </td>

                                    {/* Actions */}
                                    <td style={{ padding: '0.625rem 0.875rem', verticalAlign: 'top', textAlign: 'right' }}>
                                        {sub.extracted_json && (
                                            <button
                                                onClick={() => setSelectedJson(JSON.stringify(sub.extracted_json, null, 2))}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                    padding: '0.2rem 0.5rem', borderRadius: '5px',
                                                    background: 'var(--accent-primary-muted)',
                                                    color: 'var(--accent-primary)',
                                                    fontSize: '0.68rem', fontWeight: 600,
                                                    border: 'none', cursor: 'pointer',
                                                    transition: 'all 0.12s',
                                                }}
                                            >
                                                JSON <ChevronRight size={10} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}

                        {submissions.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                    <FileText size={28} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'inline-block' }} />
                                    <div>No submissions found.</div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* JSON Viewer Modal */}
            {selectedJson && (
                <>
                    <div
                        onClick={() => setSelectedJson(null)}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)', zIndex: 9990 }}
                    />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 'min(680px, 92vw)',
                        maxHeight: '75vh',
                        display: 'flex', flexDirection: 'column',
                        background: 'var(--bg-surface-raised)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: 'var(--shadow-overlay)',
                        zIndex: 9991,
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0.875rem 1.25rem',
                            borderBottom: '1px solid var(--border-default)',
                            background: 'var(--bg-surface)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileText size={15} style={{ color: 'var(--accent-primary)' }} />
                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-high)' }}>Extracted Data</span>
                            </div>
                            <button
                                onClick={() => setSelectedJson(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.25rem' }}>
                            <pre style={{
                                fontSize: '0.72rem', fontFamily: '"SF Mono", Menlo, Monaco, monospace',
                                color: 'var(--text-high)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                lineHeight: 1.6, margin: 0,
                            }}>
                                {selectedJson}
                            </pre>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
