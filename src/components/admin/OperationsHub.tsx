"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    FileText, AlertCircle, CheckCircle, Users, RefreshCw,
    FileSearch, Loader2, MapPin, User, ArrowRight, Trash2,
    Shield, Clock, AlertTriangle, ExternalLink, Layers
} from "lucide-react";
import Link from "next/link";
import { fetchDocumentsNeedingReview, fetchMismatchedDocuments, confirmMismatchDocument, deleteDocument, PlatformDocumentInfo } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { detectDocumentCarrier } from "@/lib/carrierBadges";
import SubmissionsDebug from "./SubmissionsDebug";
import DuplicateReview from "./DuplicateReview";

/* ── Tab definition ──────────────────────────────────────────────── */
type TabKey = 'review' | 'mismatches' | 'identity' | 'pipeline';

interface TabDef {
    key: TabKey;
    label: string;
    icon: React.ElementType;
    description: string;
}

const TABS: TabDef[] = [
    { key: 'review', label: 'Document Review', icon: FileSearch, description: 'Unmatched documents awaiting assignment' },
    { key: 'mismatches', label: 'Mismatched Documents', icon: AlertTriangle, description: 'Documents uploaded under conflicting policies' },
    { key: 'identity', label: 'Identity Resolution', icon: Users, description: 'Duplicate client detection & merge' },
    { key: 'pipeline', label: 'Submissions Pipeline', icon: Layers, description: 'Ingestion job log & debug' },
];

const DOC_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
    es_doc: { label: 'E&S', color: 'var(--status-warning)', icon: '🛡️' },
    rce: { label: 'RCE', color: 'var(--status-success)', icon: '📊' },
    dic_dec_page: { label: 'DIC', color: 'var(--accent-secondary)', icon: '📋' },
    dec_page: { label: 'Dec Page', color: 'var(--accent-primary)', icon: '📋' },
    invoice: { label: 'Invoice', color: 'var(--status-info)', icon: '💰' },
    inspection: { label: 'Inspection', color: '#ec4899', icon: '🔍' },
    endorsement: { label: 'Endorsement', color: 'var(--status-info)', icon: '📝' },
    questionnaire: { label: 'Questionnaire', color: 'var(--accent-secondary)', icon: '📝' },
    other: { label: 'Other', color: 'var(--text-muted)', icon: '📄' },
};

function getMatchStatusBadge(doc: PlatformDocumentInfo): { label: string; color: string; bg: string } {
    if (doc.parse_status === 'failed') return { label: 'Failed', color: 'var(--status-error)', bg: 'var(--bg-error-subtle)' };
    if (doc.match_status === 'no_match') return { label: 'No Match', color: 'var(--status-error)', bg: 'var(--bg-error-subtle)' };
    if (doc.match_status === 'needs_review') return { label: 'Needs Review', color: 'var(--status-warning)', bg: 'var(--bg-warning-subtle)' };
    return { label: doc.match_status, color: 'var(--text-muted)', bg: 'var(--text-muted)12' };
}

function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function formatFileSize(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Document Review Card ──────────────────────────────────────── */
function ReviewCard({ doc, onDelete, isDeleting, onConfirm, isConfirming }: {
    doc: PlatformDocumentInfo;
    onDelete: (id: string) => void;
    isDeleting: boolean;
    onConfirm: (id: string) => void;
    isConfirming: boolean;
}) {
    const docConfig = DOC_TYPE_CONFIG[doc.doc_type] || DOC_TYPE_CONFIG.other;
    const status = getMatchStatusBadge(doc);

    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: '0.75rem',
            padding: '1.125rem 1.25rem',
            transition: 'all 0.2s ease',
            position: 'relative',
            overflow: 'hidden',
        }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${docConfig.color}40`; e.currentTarget.style.boxShadow = `0 4px 16px ${docConfig.color}08`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
            {/* Top accent line */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                background: `linear-gradient(90deg, ${docConfig.color}, ${docConfig.color}60)`,
            }} />

            {/* Header: file name + badges */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '1.1rem' }}>{docConfig.icon}</span>
                    <div style={{ minWidth: 0 }}>
                        <div style={{
                            fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-high)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: '280px',
                        }}>
                            {doc.file_name || 'Unknown file'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                            {formatFileSize(doc.file_size)} · {formatTimeAgo(doc.created_at)}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {/* Carrier badge */}
                    {(() => {
                        const carrierBadge = detectDocumentCarrier(doc);
                        if (!carrierBadge) return null;
                        return (
                            <span style={{
                                padding: '0.15rem 0.5rem', borderRadius: '999px',
                                fontSize: '0.65rem', fontWeight: 700,
                                background: carrierBadge.bgColor, color: carrierBadge.textColor,
                                border: `1px solid ${carrierBadge.borderColor}`,
                                textTransform: 'uppercase', letterSpacing: '0.03em',
                            }} title={carrierBadge.tooltip}>
                                {carrierBadge.label}
                            </span>
                        );
                    })()}
                    {/* Doc type badge */}
                    <span style={{
                        padding: '0.15rem 0.5rem', borderRadius: '999px',
                        fontSize: '0.65rem', fontWeight: 700,
                        background: `${docConfig.color}15`, color: docConfig.color,
                        textTransform: 'uppercase', letterSpacing: '0.03em',
                    }}>
                        {docConfig.label}
                    </span>
                    {/* Status badge */}
                    <span style={{
                        padding: '0.15rem 0.5rem', borderRadius: '999px',
                        fontSize: '0.65rem', fontWeight: 700,
                        background: status.bg, color: status.color,
                    }}>
                        {status.label}
                    </span>
                </div>
            </div>

            {/* Extracted info */}
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem', marginBottom: '1rem',
                padding: '0.75rem', borderRadius: '0.5rem',
                background: 'var(--bg-surface-raised)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <User size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.78rem', color: doc.extracted_owner_name ? 'var(--text-high)' : 'var(--text-muted)', fontWeight: doc.extracted_owner_name ? 600 : 400 }}>
                        {doc.extracted_owner_name || 'No insured name'}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <MapPin size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={{
                        fontSize: '0.78rem', color: doc.extracted_address ? 'var(--text-high)' : 'var(--text-muted)',
                        fontWeight: doc.extracted_address ? 500 : 400,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {doc.extracted_address || 'No address'}
                    </span>
                </div>
            </div>

            {/* Match confidence bar */}
            {doc.match_confidence != null && doc.match_confidence > 0 && (
                <div style={{ marginBottom: '0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Best Match Confidence
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: status.color }}>
                            {Math.round(doc.match_confidence * 100)}%
                        </span>
                    </div>
                    <div style={{ height: '4px', borderRadius: '2px', background: 'var(--border-default)', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', borderRadius: '2px',
                            width: `${Math.min(doc.match_confidence * 100, 100)}%`,
                            background: doc.match_confidence > 0.7 ? 'var(--status-success)' : doc.match_confidence > 0.4 ? 'var(--status-warning)' : 'var(--status-error)',
                            transition: 'width 0.3s ease',
                        }} />
                    </div>
                </div>
            )}

            {/* Error message */}
            {doc.error_message && (
                <div style={{
                    padding: '0.5rem 0.75rem', borderRadius: '0.375rem',
                    background: 'var(--bg-error-subtle)', border: '1px solid var(--status-error)20',
                    fontSize: '0.72rem', color: 'var(--status-error)', marginBottom: '0.875rem',
                    lineHeight: 1.4,
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                    {doc.error_message}
                </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                {doc.policy_id ? (
                    <>
                        <button
                            type="button"
                            onClick={() => onConfirm(doc.id)}
                            disabled={isConfirming}
                            style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
                                padding: '0.55rem 1rem', borderRadius: '0.5rem',
                                background: '#16a34a', color: '#fff', border: 'none',
                                fontSize: '0.78rem', fontWeight: 600,
                                cursor: isConfirming ? 'wait' : 'pointer',
                                boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)',
                                transition: 'all 0.15s',
                            }}
                        >
                            {isConfirming ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
                            Confirm Match
                        </button>
                        <Link
                            href={`/upload-document?reassign=${doc.id}`}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
                                padding: '0.55rem 0.85rem', borderRadius: '0.5rem',
                                background: 'var(--bg-surface-raised)', color: 'var(--text-high)',
                                border: '1px solid var(--border-default)',
                                fontSize: '0.78rem', fontWeight: 600,
                                textDecoration: 'none', transition: 'all 0.15s',
                            }}
                        >
                            <RefreshCw size={13} /> Review & Assign
                        </Link>
                    </>
                ) : (
                    <Link
                        href={`/upload-document?reassign=${doc.id}`}
                        style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
                            padding: '0.55rem 1rem', borderRadius: '0.5rem',
                            background: docConfig.color, color: 'var(--text-inverse)',
                            fontSize: '0.78rem', fontWeight: 600,
                            textDecoration: 'none', transition: 'all 0.15s',
                            boxShadow: `0 2px 8px ${docConfig.color}30`,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 4px 12px ${docConfig.color}40`; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 2px 8px ${docConfig.color}30`; }}
                    >
                        Review & Assign <ArrowRight size={14} />
                    </Link>
                )}
                <button
                    onClick={() => onDelete(doc.id)}
                    disabled={isDeleting}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0.55rem 0.75rem', borderRadius: '0.5rem',
                        background: 'transparent', border: '1px solid var(--border-default)',
                        color: 'var(--text-muted)', cursor: isDeleting ? 'wait' : 'pointer',
                        transition: 'all 0.15s', opacity: isDeleting ? 0.5 : 1,
                    }}
                    onMouseEnter={e => { if (!isDeleting) { e.currentTarget.style.borderColor = 'var(--status-error)40'; e.currentTarget.style.color = 'var(--status-error)'; e.currentTarget.style.background = 'var(--bg-error-subtle)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                    title="Delete document"
                >
                    {isDeleting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                </button>
            </div>
        </div>
    );
}

/* ── Document Review Tab ───────────────────────────────────────── */
function DocumentReviewTab() {
    const [docs, setDocs] = useState<PlatformDocumentInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);

    const loadDocs = useCallback(async () => {
        setLoading(true);
        const data = await fetchDocumentsNeedingReview();
        setDocs(data);
        setLoading(false);
    }, []);

    useEffect(() => { loadDocs(); }, [loadDocs]);

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this document? This cannot be undone.')) return;
        setDeletingId(id);
        const ok = await deleteDocument(id, 'platform');
        if (ok) setDocs(prev => prev.filter(d => d.id !== id));
        setDeletingId(null);
    };

    const handleConfirm = async (id: string) => {
        setConfirmingId(id);
        try {
            const { error } = await supabase
                .from('platform_documents')
                .update({ match_status: 'manual', parse_status: 'parsed', error_message: null })
                .eq('id', id);

            if (!error) {
                setDocs(prev => prev.filter(d => d.id !== id));
            } else {
                console.error('Failed to confirm document:', error);
                alert('Failed to confirm document match. Please try again.');
            }
        } catch (err) {
            console.error('Error confirming document:', err);
            alert('An error occurred while confirming the document.');
        } finally {
            setConfirmingId(null);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem', gap: '0.75rem', color: 'var(--text-muted)' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: '0.85rem' }}>Loading review queue…</span>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
        );
    }

    if (docs.length === 0) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '4rem 2rem', gap: '0.75rem',
            }}>
                <div style={{
                    width: '3.5rem', height: '3.5rem', borderRadius: '50%',
                    background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <CheckCircle size={22} style={{ color: 'var(--status-success)' }} />
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-high)' }}>All Clear</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '380px', lineHeight: 1.5 }}>
                    All documents have been matched to policies. New unmatched documents will appear here for review.
                </div>
                <button
                    onClick={loadDocs}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                        padding: '0.45rem 0.875rem', borderRadius: '0.5rem', marginTop: '0.5rem',
                        background: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)',
                        color: 'var(--text-mid)', fontSize: '0.78rem', fontWeight: 500,
                        cursor: 'pointer',
                    }}
                >
                    <RefreshCw size={13} /> Refresh
                </button>
            </div>
        );
    }

    // Group by status
    const needsReview = docs.filter(d => d.match_status === 'needs_review');
    const noMatch = docs.filter(d => d.match_status === 'no_match');
    const failed = docs.filter(d => d.parse_status === 'failed' && d.match_status !== 'needs_review' && d.match_status !== 'no_match');

    return (
        <div>
            {/* Summary strip */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                {[
                    { label: 'Needs Review', count: needsReview.length, color: 'var(--status-warning)', bg: 'var(--bg-warning-subtle)' },
                    { label: 'No Match', count: noMatch.length, color: 'var(--status-error)', bg: 'var(--bg-error-subtle)' },
                    { label: 'Failed', count: failed.length, color: 'var(--status-error)', bg: 'var(--bg-error-subtle)' },
                    { label: 'Total', count: docs.length, color: 'var(--text-high)', bg: 'var(--bg-surface-raised)' },
                ].map(s => (
                    <div key={s.label} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.5rem 0.875rem', borderRadius: '8px',
                        background: s.bg, border: '1px solid var(--border-default)',
                    }}>
                        <span style={{ fontSize: '1.125rem', fontWeight: 800, color: s.color }}>{s.count}</span>
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{s.label}</span>
                    </div>
                ))}
                <div style={{ flex: 1 }} />
                <button
                    onClick={loadDocs}
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

            {/* Card grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
                gap: '1rem',
            }}>
                {docs.map(doc => (
                    <ReviewCard
                        key={doc.id}
                        doc={doc}
                        onDelete={handleDelete}
                        isDeleting={deletingId === doc.id}
                        onConfirm={handleConfirm}
                        isConfirming={confirmingId === doc.id}
                    />
                ))}
            </div>
        </div>
    );
}

/* ── Mismatched Documents Tab ───────────────────────────────────── */
function MismatchedDocumentsTab() {
    const [docs, setDocs] = useState<PlatformDocumentInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);

    const loadDocs = useCallback(async () => {
        setLoading(true);
        const data = await fetchMismatchedDocuments();
        setDocs(data);
        setLoading(false);
    }, []);

    useEffect(() => { loadDocs(); }, [loadDocs]);

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this document? This cannot be undone.')) return;
        setDeletingId(id);
        const ok = await deleteDocument(id, 'platform');
        if (ok) setDocs(prev => prev.filter(d => d.id !== id));
        setDeletingId(null);
    };

    const handleConfirm = async (id: string) => {
        if (!confirm('Confirm match anyway? This will override the mismatch warning and keep the document linked to this policy.')) return;
        setConfirmingId(id);
        const ok = await confirmMismatchDocument(id);
        if (ok) {
            setDocs(prev => prev.filter(d => d.id !== id));
        } else {
            alert('Failed to confirm document. Please try again.');
        }
        setConfirmingId(null);
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem', gap: '0.75rem', color: 'var(--text-muted)' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: '0.85rem' }}>Checking for mismatched documents…</span>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
        );
    }

    if (docs.length === 0) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '4rem 2rem', gap: '0.75rem',
            }}>
                <div style={{
                    width: '3.5rem', height: '3.5rem', borderRadius: '50%',
                    background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <CheckCircle size={22} style={{ color: 'var(--status-success)' }} />
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-high)' }}>No Mismatches Found</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '420px', lineHeight: 1.5 }}>
                    All attached documents correspond to their policyholder and property addresses. If an agent mistakenly uploads a document to the wrong policy, it will appear here for review.
                </div>
                <button
                    onClick={loadDocs}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.4rem 0.85rem', borderRadius: '0.375rem',
                        border: '1px solid var(--border-default)', background: 'transparent',
                        color: 'var(--text-mid)', fontSize: '0.78rem', cursor: 'pointer',
                        marginTop: '0.5rem',
                    }}
                >
                    <RefreshCw size={13} />
                    Refresh Check
                </button>
            </div>
        );
    }

    return (
        <div>
            {/* Header / explanation banner */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.875rem 1.25rem', marginBottom: '1.25rem',
                borderRadius: '0.625rem', background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-high)' }}>
                        <strong>{docs.length} document{docs.length > 1 ? 's' : ''}</strong> uploaded under policies with conflicting addresses or insured names. Review details and reassign to the proper policy.
                    </div>
                </div>
                <button
                    onClick={loadDocs}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                        padding: '0.35rem 0.75rem', borderRadius: '0.375rem',
                        border: '1px solid rgba(245, 158, 11, 0.3)', background: 'var(--bg-surface)',
                        color: '#f59e0b', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    <RefreshCw size={12} />
                    Refresh
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                {docs.map(doc => {
                    const docConfig = DOC_TYPE_CONFIG[doc.doc_type] || DOC_TYPE_CONFIG.other;
                    const carrier = detectDocumentCarrier({
                        file_name: doc.file_name,
                        doc_type: doc.doc_type,
                        carrier_name: doc.carrier_name,
                        source: doc.source,
                        created_by: doc.created_by,
                    });

                    return (
                        <div key={doc.id} style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '0.75rem',
                            padding: '1.25rem',
                            position: 'relative',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                                background: 'linear-gradient(90deg, #f59e0b, #f59e0b80)',
                            }} />

                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                        padding: '0.2rem 0.55rem', borderRadius: '0.375rem',
                                        background: `${docConfig.color}15`, color: docConfig.color,
                                        fontSize: '0.72rem', fontWeight: 700,
                                        border: `1px solid ${docConfig.color}30`,
                                    }}>
                                        <span>{docConfig.icon}</span>
                                        {docConfig.label}
                                    </span>
                                    {carrier && (
                                        <span style={{
                                            padding: '0.2rem 0.55rem', borderRadius: '0.375rem',
                                            background: carrier.bgColor, color: carrier.textColor,
                                            fontSize: '0.72rem', fontWeight: 700,
                                            border: `1px solid ${carrier.borderColor}`,
                                        }}>
                                            {carrier.label}
                                        </span>
                                    )}
                                    <span style={{
                                        padding: '0.2rem 0.55rem', borderRadius: '0.375rem',
                                        background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b',
                                        fontSize: '0.72rem', fontWeight: 700,
                                        border: '1px solid rgba(245, 158, 11, 0.25)',
                                    }}>
                                        ⚠️ Mismatch Detected
                                    </span>
                                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-high)' }}>
                                        {doc.file_name}
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    {formatTimeAgo(doc.created_at)}
                                </span>
                            </div>

                            {/* Comparison Columns */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                gap: '1rem', marginBottom: '1rem',
                            }}>
                                {/* Box 1: Currently Attached Under */}
                                <div style={{
                                    background: 'var(--bg-primary)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '0.5rem',
                                    padding: '0.875rem',
                                }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <Shield size={12} />
                                        Currently Attached To Policy
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-high)', marginBottom: '0.25rem' }}>
                                        {doc.policy_id ? (
                                            <Link href={`/policy/${doc.policy_id}`} target="_blank" style={{ color: 'var(--accent-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                {doc.policy_number || 'Policy Page'}
                                                <ExternalLink size={11} />
                                            </Link>
                                        ) : 'Unlinked'}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-mid)', marginBottom: '0.2rem' }}>
                                        <strong>Insured:</strong> {doc.policy_insured || 'Unknown'}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        <strong>Address:</strong> {doc.policy_address || '(No address recorded on policy)'}
                                    </div>
                                </div>

                                {/* Box 2: Document Actually Contains */}
                                <div style={{
                                    background: 'rgba(59, 130, 246, 0.04)',
                                    border: '1px solid rgba(59, 130, 246, 0.2)',
                                    borderRadius: '0.5rem',
                                    padding: '0.875rem',
                                }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <FileSearch size={12} />
                                        Document Extracted Details
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-high)', marginBottom: '0.25rem' }}>
                                        {doc.extracted_owner_name || 'Name not detected'}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-mid)', marginBottom: '0.2rem' }}>
                                        <strong>Property Address:</strong> {doc.extracted_address || 'Address not detected'}
                                    </div>
                                    {doc.uploaded_by && (
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            Uploaded by: {doc.uploaded_by}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Warning message */}
                            {doc.error_message && (
                                <div style={{
                                    fontSize: '0.76rem', color: '#f59e0b',
                                    background: 'rgba(245, 158, 11, 0.08)',
                                    padding: '0.5rem 0.75rem', borderRadius: '0.375rem',
                                    marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
                                }}>
                                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                                    <span>{doc.error_message}</span>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Link
                                        href={`/upload-document?reassign=${doc.id}`}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                            padding: '0.45rem 0.95rem', borderRadius: '0.375rem',
                                            background: 'var(--accent-primary)', color: 'var(--text-inverse)',
                                            fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none',
                                            transition: 'opacity 0.15s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; }}
                                        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                                    >
                                        Review & Reassign
                                        <ArrowRight size={13} />
                                    </Link>
                                    <button
                                        onClick={() => handleConfirm(doc.id)}
                                        disabled={confirmingId === doc.id}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                            padding: '0.45rem 0.85rem', borderRadius: '0.375rem',
                                            border: '1px solid var(--border-default)', background: 'transparent',
                                            color: 'var(--text-mid)', fontSize: '0.78rem', fontWeight: 500,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {confirmingId === doc.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={13} />}
                                        Confirm Match Anyway
                                    </button>
                                </div>
                                <button
                                    onClick={() => handleDelete(doc.id)}
                                    disabled={deletingId === doc.id}
                                    title="Delete document"
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        width: '2rem', height: '2rem', borderRadius: '0.375rem',
                                        border: '1px solid var(--border-default)', background: 'transparent',
                                        color: 'var(--status-error)', cursor: 'pointer',
                                    }}
                                >
                                    {deletingId === doc.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ── Main Operations Hub ───────────────────────────────────────── */
export default function OperationsHub() {
    const [activeTab, setActiveTab] = useState<TabKey>('review');
    const [reviewCount, setReviewCount] = useState<number | null>(null);
    const [mismatchCount, setMismatchCount] = useState<number | null>(null);

    // Fetch counts for badges
    useEffect(() => {
        fetchDocumentsNeedingReview().then(docs => setReviewCount(docs.length));
        fetchMismatchedDocuments().then(docs => setMismatchCount(docs.length));
    }, []);

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
            {/* Page Header */}
            <div style={{ marginBottom: '1.75rem' }}>
                <h1 style={{
                    fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-high)',
                    letterSpacing: '-0.02em', marginBottom: '0.35rem',
                    display: 'flex', alignItems: 'center', gap: '0.625rem',
                }}>
                    <div style={{
                        width: '2.25rem', height: '2.25rem', borderRadius: '0.625rem',
                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Shield size={16} style={{ color: 'var(--text-inverse)' }} />
                    </div>
                    Operations Hub
                </h1>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                    Central command for document review, identity resolution, and ingestion monitoring.
                </p>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex', gap: '0.25rem', marginBottom: '1.5rem',
                borderBottom: '1px solid var(--border-default)',
                paddingBottom: '0',
            }}>
                {TABS.map(tab => {
                    const isActive = activeTab === tab.key;
                    const Icon = tab.icon;
                    const badgeCount = tab.key === 'review' ? reviewCount : tab.key === 'mismatches' ? mismatchCount : null;
                    const badgeBg = tab.key === 'mismatches' ? '#f59e0b' : 'var(--status-error)';

                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.625rem 1rem',
                                borderRadius: '0.5rem 0.5rem 0 0',
                                border: 'none',
                                borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                background: isActive ? 'var(--bg-surface)' : 'transparent',
                                color: isActive ? 'var(--text-high)' : 'var(--text-muted)',
                                fontSize: '0.82rem', fontWeight: isActive ? 700 : 500,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                position: 'relative',
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--text-mid)'; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--text-muted)'; }}
                        >
                            <Icon size={15} style={{ opacity: isActive ? 1 : 0.6 }} />
                            {tab.label}
                            {badgeCount != null && badgeCount > 0 && (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    minWidth: '1.25rem', height: '1.25rem',
                                    padding: '0 0.35rem', borderRadius: '999px',
                                    background: badgeBg, color: '#fff',
                                    fontSize: '0.62rem', fontWeight: 800,
                                    lineHeight: 1,
                                }}>
                                    {badgeCount}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            {activeTab === 'review' && <DocumentReviewTab />}
            {activeTab === 'mismatches' && <MismatchedDocumentsTab />}
            {activeTab === 'identity' && (
                <div>
                    <DuplicateReview />
                </div>
            )}
            {activeTab === 'pipeline' && <SubmissionsDebug />}

            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}
