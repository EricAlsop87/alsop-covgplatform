'use client';

import React, { useState, useEffect } from 'react';
import { X, Send, AlertTriangle, CheckCircle2, Loader2, Mail, ChevronDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailTemplate {
    id: string;
    name: string;
    description: string;
    variables: string[];
}

interface EmailSystemStatus {
    mode: 'disabled' | 'redirect' | 'live';
    redirectTarget: string | null;
    postmarkConfigured: boolean;
    fromDefault: string;
    replyToDefault: string;
    templates: EmailTemplate[];
}

interface EmailComposeModalProps {
    isOpen: boolean;
    onClose: () => void;
    // Pre-fill context
    defaultTo?: string;
    defaultTemplateId?: string;
    defaultVariables?: Record<string, string>;
    policyId?: string;
    clientId?: string;
    reportId?: string;
}

// ---------------------------------------------------------------------------
// Mode Badge
// ---------------------------------------------------------------------------

function ModeBadge({ mode, redirectTarget }: { mode: string; redirectTarget?: string | null }) {
    const config: Record<string, { bg: string; border: string; color: string; label: string; icon: string }> = {
        disabled: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', color: '#f87171', label: 'SENDING DISABLED', icon: '🚫' },
        redirect: { bg: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.3)', color: '#fbbf24', label: 'DEV REDIRECT MODE', icon: '↩️' },
        live: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', color: '#4ade80', label: 'LIVE SENDING', icon: '✅' },
    };
    const c = config[mode] || config.disabled;

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', gap: '0.25rem',
            padding: '0.5rem 0.75rem', borderRadius: '8px',
            background: c.bg, border: `1px solid ${c.border}`,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.85rem' }}>{c.icon}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: c.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {c.label}
                </span>
            </div>
            {mode === 'redirect' && redirectTarget && (
                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                    All emails redirect to: <strong style={{ color: '#fbbf24' }}>{redirectTarget}</strong>
                </span>
            )}
            {mode === 'disabled' && (
                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                    Emails will be logged but not delivered
                </span>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmailComposeModal({
    isOpen,
    onClose,
    defaultTo = '',
    defaultTemplateId = '',
    defaultVariables = {},
    policyId,
    clientId,
    reportId,
}: EmailComposeModalProps) {
    const [status, setStatus] = useState<EmailSystemStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [to, setTo] = useState(defaultTo);
    const [templateId, setTemplateId] = useState(defaultTemplateId);
    const [subject, setSubject] = useState('');
    const [htmlBody, setHtmlBody] = useState('');
    const [variables, setVariables] = useState<Record<string, string>>(defaultVariables);
    const [showVariables, setShowVariables] = useState(false);

    // Fetch email system status
    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        fetch('/api/email/status')
            .then(r => r.json())
            .then(data => {
                setStatus(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [isOpen]);

    // Reset form when opening
    useEffect(() => {
        if (isOpen) {
            setTo(defaultTo);
            setTemplateId(defaultTemplateId);
            setVariables(defaultVariables);
            setSubject('');
            setHtmlBody('');
            setSent(false);
            setError(null);
        }
    }, [isOpen, defaultTo, defaultTemplateId]);

    if (!isOpen) return null;

    const selectedTemplate = status?.templates.find(t => t.id === templateId);

    const handleSend = async () => {
        setSending(true);
        setError(null);

        try {
            const payload: Record<string, unknown> = {
                to,
                policyId,
                clientId,
                reportId,
            };

            if (templateId) {
                payload.templateId = templateId;
                payload.variables = variables;
            } else {
                payload.subject = subject;
                payload.htmlBody = htmlBody;
            }

            const res = await fetch('/api/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Send failed');
            } else {
                setSent(true);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(4px)', zIndex: 9998,
                    animation: 'fadeIn 0.15s ease-out',
                }}
            />
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>

            {/* Modal */}
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: '560px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
                background: 'var(--bg-surface, #1e293b)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                zIndex: 9999, animation: 'slideUp 0.2s ease-out',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Mail size={18} style={{ color: '#6366f1' }} />
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-high, #f1f5f9)', margin: 0 }}>
                            Send Email
                        </h2>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', color: 'var(--text-muted, #94a3b8)',
                        cursor: 'pointer', padding: '4px', borderRadius: '4px',
                    }}>
                        <X size={18} />
                    </button>
                </div>

                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                        <div style={{ fontSize: '0.82rem' }}>Loading email system…</div>
                    </div>
                ) : sent ? (
                    /* Success State */
                    <div style={{ padding: '2.5rem', textAlign: 'center' }}>
                        <CheckCircle2 size={40} style={{ color: '#4ade80', margin: '0 auto 1rem' }} />
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.5rem' }}>
                            {status?.mode === 'disabled' ? 'Email Logged (Not Sent)' : status?.mode === 'redirect' ? 'Email Sent (Redirected)' : 'Email Sent!'}
                        </h3>
                        <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                            {status?.mode === 'disabled' && 'Sending is disabled — email was logged for reference only.'}
                            {status?.mode === 'redirect' && `Email was redirected to ${status?.redirectTarget} for testing.`}
                            {status?.mode === 'live' && 'The email has been delivered successfully.'}
                        </p>
                        <button
                            onClick={onClose}
                            style={{
                                marginTop: '1rem', padding: '0.5rem 1.5rem', borderRadius: '6px',
                                background: 'rgba(99,102,241,0.15)', color: '#a5b4fc',
                                border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer',
                                fontSize: '0.82rem', fontWeight: 600,
                            }}
                        >
                            Close
                        </button>
                    </div>
                ) : (
                    /* Compose Form */
                    <div style={{ padding: '1rem 1.25rem' }}>
                        {/* Mode indicator */}
                        {status && <ModeBadge mode={status.mode} redirectTarget={status.redirectTarget} />}

                        {/* Template selector */}
                        <div style={{ marginTop: '1rem' }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: '0.3rem' }}>
                                Template
                            </label>
                            <select
                                value={templateId}
                                onChange={e => setTemplateId(e.target.value)}
                                style={{
                                    width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.82rem',
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '6px', color: 'var(--text-high, #f1f5f9)', cursor: 'pointer',
                                    outline: 'none',
                                }}
                            >
                                <option value="">Custom (no template)</option>
                                {status?.templates.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                            {selectedTemplate && (
                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                                    {selectedTemplate.description}
                                </div>
                            )}
                        </div>

                        {/* To */}
                        <div style={{ marginTop: '0.75rem' }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: '0.3rem' }}>
                                To
                            </label>
                            <input
                                type="email"
                                value={to}
                                onChange={e => setTo(e.target.value)}
                                placeholder="recipient@example.com"
                                style={{
                                    width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.82rem',
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '6px', color: 'var(--text-high, #f1f5f9)', outline: 'none',
                                }}
                            />
                            {status?.mode === 'redirect' && (
                                <div style={{ fontSize: '0.65rem', color: '#f59e0b', marginTop: '0.2rem' }}>
                                    ⚠ Will be redirected to {status.redirectTarget} — not sent to this address
                                </div>
                            )}
                        </div>

                        {/* Template variables */}
                        {selectedTemplate && selectedTemplate.variables.length > 0 && (
                            <div style={{ marginTop: '0.75rem' }}>
                                <button
                                    onClick={() => setShowVariables(!showVariables)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600,
                                        textTransform: 'uppercase', letterSpacing: '0.03em', padding: 0,
                                    }}
                                >
                                    <ChevronDown size={12} style={{ transform: showVariables ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                                    Template Variables ({selectedTemplate.variables.length})
                                </button>
                                {showVariables && (
                                    <div style={{
                                        marginTop: '0.5rem', padding: '0.75rem',
                                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                                        borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.5rem',
                                    }}>
                                        {selectedTemplate.variables.map(v => (
                                            <div key={v}>
                                                <label style={{ fontSize: '0.68rem', color: '#64748b', display: 'block', marginBottom: '0.15rem' }}>
                                                    {`{{${v}}}`}
                                                </label>
                                                <input
                                                    value={variables[v] || ''}
                                                    onChange={e => setVariables(prev => ({ ...prev, [v]: e.target.value }))}
                                                    placeholder={v}
                                                    style={{
                                                        width: '100%', padding: '0.35rem 0.6rem', fontSize: '0.78rem',
                                                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                                        borderRadius: '4px', color: 'var(--text-high, #f1f5f9)', outline: 'none',
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Custom subject/body (when no template) */}
                        {!templateId && (
                            <>
                                <div style={{ marginTop: '0.75rem' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: '0.3rem' }}>
                                        Subject
                                    </label>
                                    <input
                                        value={subject}
                                        onChange={e => setSubject(e.target.value)}
                                        placeholder="Email subject line"
                                        style={{
                                            width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.82rem',
                                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '6px', color: 'var(--text-high, #f1f5f9)', outline: 'none',
                                        }}
                                    />
                                </div>
                                <div style={{ marginTop: '0.75rem' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: '0.3rem' }}>
                                        Body
                                    </label>
                                    <textarea
                                        value={htmlBody}
                                        onChange={e => setHtmlBody(e.target.value)}
                                        placeholder="Email body (HTML or plain text)"
                                        rows={6}
                                        style={{
                                            width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.82rem',
                                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '6px', color: 'var(--text-high, #f1f5f9)', outline: 'none',
                                            fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5,
                                        }}
                                    />
                                </div>
                            </>
                        )}

                        {/* Error */}
                        {error && (
                            <div style={{
                                marginTop: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '6px',
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                                fontSize: '0.78rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.4rem',
                            }}>
                                <AlertTriangle size={14} />
                                {error}
                            </div>
                        )}

                        {/* Actions */}
                        <div style={{
                            display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
                            marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <button
                                onClick={onClose}
                                style={{
                                    padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.82rem',
                                    background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)',
                                    cursor: 'pointer', fontWeight: 500,
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={sending || !to}
                                style={{
                                    padding: '0.5rem 1.25rem', borderRadius: '6px', fontSize: '0.82rem',
                                    background: status?.mode === 'disabled'
                                        ? 'rgba(100,116,139,0.15)'
                                        : 'rgba(99,102,241,0.2)',
                                    color: status?.mode === 'disabled' ? '#94a3b8' : '#c7d2fe',
                                    border: `1px solid ${status?.mode === 'disabled' ? 'rgba(100,116,139,0.2)' : 'rgba(99,102,241,0.3)'}`,
                                    cursor: sending || !to ? 'not-allowed' : 'pointer',
                                    fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    opacity: sending || !to ? 0.5 : 1,
                                }}
                            >
                                {sending ? (
                                    <>
                                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                        Sending…
                                    </>
                                ) : (
                                    <>
                                        <Send size={14} />
                                        {status?.mode === 'disabled' ? 'Log Email (Disabled)' : status?.mode === 'redirect' ? 'Send (Redirected)' : 'Send Email'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
