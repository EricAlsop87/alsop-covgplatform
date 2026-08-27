'use client';

import React, { useState } from 'react';
import { X, MessageSquare, Send, User, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import { useToast } from '@/components/ui/Toast/Toast';
import { logger } from '@/lib/logger';


interface SupportModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Pre-filled if user is logged in */
    clientName?: string;
    clientEmail?: string;
    policyNumber?: string;
}

export function SupportModal({ isOpen, onClose, clientName, clientEmail, policyNumber }: SupportModalProps) {
    const toast = useToast();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState('General Question');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);

    if (!isOpen) return null;

    const isGuest = !clientName && !clientEmail;
    const resolvedName = clientName || name;
    const resolvedEmail = clientEmail || email;
    const canSubmit = message.trim() && (isGuest ? email.trim() : true);

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSending(true);
        try {
            const res = await fetch('/api/support', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: resolvedName,
                    email: resolvedEmail,
                    subject,
                    message,
                    policyNumber,
                }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success('Your message has been sent to support@coveragechecknow.com. Our team will respond within 1 business day.');
                setMessage('');
                setName('');
                setEmail('');
                onClose();
            } else {
                toast.error(data.error || 'Failed to send support request. Please try again.');
            }
        } catch (err) {
            logger.error('SupportModal', 'Support request submission error:', { error: err instanceof Error ? err.message : String(err) })
            toast.error('Network error sending message. Please email support@coveragechecknow.com directly.');
        } finally {
            setSending(false);
        }
    };

    const inputStyle = {
        width: '100%', padding: '0.6rem 0.85rem', fontSize: '0.85rem',
        border: '1px solid var(--border-default)', borderRadius: '8px',
        background: 'var(--bg-surface-raised)', color: 'var(--text-high)',
        fontFamily: 'inherit',
    } as const;

    const labelStyle = {
        fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase' as const, letterSpacing: '0.04em',
        display: 'block', marginBottom: '0.4rem',
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '1rem',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: '480px',
                    background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-default)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <MessageSquare size={18} style={{ color: 'var(--accent-primary)' }} />
                        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-high)' }}>Contact Support</h2>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: '0.25rem',
                        borderRadius: '6px', transition: 'color 0.2s',
                    }}>
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '1.5rem' }}>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-mid)', marginBottom: '1.25rem', lineHeight: 1.55 }}>
                        Have a question about your policy, coverage review, or technical app support? Send us a message and our team will respond within 1 business day.
                    </p>

                    {/* Guest-only: name & email fields */}
                    {isGuest && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div>
                                <label style={labelStyle}>
                                    <User size={11} style={{ display: 'inline', marginRight: '0.25rem', verticalAlign: '-1px' }} />
                                    Name
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Your name"
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>
                                    <Mail size={11} style={{ display: 'inline', marginRight: '0.25rem', verticalAlign: '-1px' }} />
                                    Email <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    required
                                    style={inputStyle}
                                />
                            </div>
                        </div>
                    )}

                    {/* Logged-in user greeting */}
                    {!isGuest && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.5rem 0.75rem', borderRadius: '8px',
                            background: 'var(--bg-surface-raised)', marginBottom: '1rem',
                            fontSize: '0.8rem', color: 'var(--text-mid)',
                        }}>
                            <User size={14} style={{ color: 'var(--accent-primary)' }} />
                            Sending as <strong style={{ color: 'var(--text-high)', marginLeft: '0.15rem' }}>{clientName || clientEmail}</strong>
                        </div>
                    )}

                    {/* Subject */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={labelStyle}>Subject</label>
                        <select value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle}>
                            <option>General Question</option>
                            <option>Technical Support / App Issue</option>
                            <option>Coverage & Policy Question</option>
                            <option>Report Request</option>
                            <option>Account & Access Question</option>
                            <option>Other</option>
                        </select>
                    </div>

                    {/* Message */}
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={labelStyle}>Message <span style={{ color: '#ef4444' }}>*</span></label>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Describe your question or concern..."
                            rows={4}
                            style={{ ...inputStyle, resize: 'vertical' as const }}
                        />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <Button size="sm" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button size="sm" onClick={handleSubmit} isLoading={sending} disabled={!canSubmit}>
                            <Send size={13} style={{ marginRight: '0.35rem' }} />
                            Send Message
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
