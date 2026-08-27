'use client';

import React, { useState } from 'react';
import { X, UserPlus, Mail, Shield, User, Briefcase, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

type InviteRole = 'admin' | 'service' | 'customer';

interface RoleOption {
    value: InviteRole;
    label: string;
    description: string;
    icon: React.ElementType;
    color: string;
    bg: string;
}

const ROLE_OPTIONS: RoleOption[] = [
    {
        value: 'admin',
        label: 'Administrator',
        description: 'Full platform access — can invite users and change settings.',
        icon: Shield,
        color: 'var(--accent-secondary)',
        bg: 'var(--accent-secondary-muted)',
    },
    {
        value: 'service',
        label: 'Agent',
        description: 'Can view and manage policies, run enrichments, and compose emails.',
        icon: Briefcase,
        color: 'var(--status-success)',
        bg: 'var(--bg-success-subtle)',
    },
    {
        value: 'customer',
        label: 'Client',
        description: 'Restricted portal access — can view their own policies only.',
        icon: User,
        color: 'var(--accent-primary)',
        bg: 'var(--accent-primary-muted)',
    },
];

interface InviteUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (email: string, role: InviteRole) => void;
}

export function InviteUserModal({ isOpen, onClose, onSuccess }: InviteUserModalProps) {
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [role, setRole] = useState<InviteRole>('service');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ success: boolean; email: string; roleLabel: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleReset = () => {
        setEmail('');
        setFirstName('');
        setLastName('');
        setRole('service');
        setResult(null);
        setError(null);
    };

    const handleClose = () => {
        handleReset();
        onClose();
    };

    const handleSubmit = async () => {
        const trimmedEmail = email.trim();
        if (!trimmedEmail || !trimmedEmail.includes('@')) {
            setError('Please enter a valid email address.');
            return;
        }

        setSending(true);
        setError(null);

        try {
            // Get current session token for server-side auth
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                setError('Session expired — please sign in again.');
                setSending(false);
                return;
            }

            const res = await fetch('/api/admin/invite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    email: trimmedEmail,
                    role,
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to send invite. Please try again.');
            } else {
                setResult({ success: true, email: trimmedEmail, roleLabel: data.roleLabel });
                onSuccess?.(trimmedEmail, role);
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Unexpected error occurred.');
        } finally {
            setSending(false);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={handleClose}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)', zIndex: 9990 }}
            />

            {/* Modal */}
            <div style={{
                position: 'fixed', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 'min(520px, 94vw)',
                background: 'var(--bg-surface-raised)',
                border: '1px solid var(--border-default)',
                borderRadius: '14px',
                boxShadow: 'var(--shadow-overlay)',
                zIndex: 9991,
                overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '8px',
                            background: 'var(--accent-primary-muted)', border: '1px solid rgba(34,67,182,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <UserPlus size={16} style={{ color: 'var(--accent-primary)' }} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-high)' }}>Invite User</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Invite via Supabase — secure link sent automatically</div>
                        </div>
                    </div>
                    <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
                        <X size={16} />
                    </button>
                </div>

                {result ? (
                    <div style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
                        <div style={{
                            width: 52, height: 52, borderRadius: '50%',
                            background: 'var(--bg-success-subtle)', border: '1.5px solid rgba(43,155,75,0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 1rem',
                        }}>
                            <CheckCircle2 size={26} style={{ color: 'var(--status-success)' }} />
                        </div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-high)', marginBottom: '0.5rem' }}>
                            Invite Sent
                        </h3>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-mid)', marginBottom: '0.5rem' }}>
                            Invite sent to <strong style={{ color: 'var(--text-high)' }}>{result.email}</strong> with access level:{' '}
                            <strong style={{ color: 'var(--accent-primary)' }}>{result.roleLabel}</strong>.
                        </p>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            The user will receive a Supabase invite link. When they accept, their role is automatically assigned.
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button onClick={handleReset} style={{
                                padding: '0.5rem 1.25rem', borderRadius: '7px',
                                background: 'var(--accent-primary-muted)', color: 'var(--accent-primary)',
                                border: '1px solid rgba(34,67,182,0.2)', cursor: 'pointer',
                                fontSize: '0.82rem', fontWeight: 600,
                            }}>
                                Invite Another
                            </button>
                            <button onClick={handleClose} style={{
                                padding: '0.5rem 1.25rem', borderRadius: '7px',
                                background: 'transparent', color: 'var(--text-mid)',
                                border: '1px solid var(--border-default)', cursor: 'pointer',
                                fontSize: '0.82rem', fontWeight: 500,
                            }}>
                                Done
                            </button>
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: '1.25rem' }}>
                        {/* Info banner */}
                        <div style={{
                            padding: '0.55rem 0.75rem', borderRadius: '7px', marginBottom: '1.25rem',
                            background: 'var(--bg-info-subtle)', border: '1px solid rgba(0,181,190,0.18)',
                            fontSize: '0.7rem', color: 'var(--text-mid)', display: 'flex', gap: '0.4rem', alignItems: 'flex-start',
                        }}>
                            <Mail size={12} style={{ color: 'var(--status-info)', marginTop: 1, flexShrink: 0 }} />
                            Supabase will send a secure invite email. This is separate from Postmark and goes directly to the recipient.
                        </div>

                        {/* Name fields */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.875rem' }}>
                            {[['First Name', firstName, setFirstName, 'Jane'], ['Last Name', lastName, setLastName, 'Smith']].map(([label, val, setter, ph]) => (
                                <div key={label as string}>
                                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.25rem' }}>
                                        {label as string} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
                                    </label>
                                    <input
                                        value={val as string}
                                        onChange={e => (setter as (v: string) => void)(e.target.value)}
                                        placeholder={ph as string}
                                        style={{
                                            width: '100%', padding: '0.5rem 0.7rem', fontSize: '0.82rem',
                                            background: 'var(--bg-surface)', border: '1.5px solid var(--border-strong)',
                                            borderRadius: '7px', color: 'var(--text-high)', outline: 'none', boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Email */}
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.25rem' }}>
                                Email Address <span style={{ color: 'var(--status-error)' }}>*</span>
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="user@example.com"
                                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                                style={{
                                    width: '100%', padding: '0.5rem 0.7rem', fontSize: '0.82rem',
                                    background: 'var(--bg-surface)', border: '1.5px solid var(--border-strong)',
                                    borderRadius: '7px', color: 'var(--text-high)', outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        {/* Role selection */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>
                                Access Role <span style={{ color: 'var(--status-error)' }}>*</span>
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                {ROLE_OPTIONS.map(opt => {
                                    const Icon = opt.icon;
                                    const isSelected = role === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            onClick={() => setRole(opt.value)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                padding: '0.6rem 0.875rem', borderRadius: '8px', cursor: 'pointer',
                                                background: isSelected ? opt.bg : 'var(--bg-surface)',
                                                border: `1.5px solid ${isSelected ? opt.color : 'var(--border-default)'}`,
                                                textAlign: 'left', width: '100%', transition: 'all 0.14s',
                                            }}
                                        >
                                            <div style={{
                                                width: 28, height: 28, borderRadius: '6px', flexShrink: 0,
                                                background: isSelected ? opt.bg : 'var(--bg-surface-raised)',
                                                border: `1px solid ${isSelected ? opt.color : 'var(--border-default)'}`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Icon size={14} style={{ color: isSelected ? opt.color : 'var(--text-muted)' }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.82rem', fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--text-high)' : 'var(--text-mid)' }}>
                                                    {opt.label}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                                    {opt.description}
                                                </div>
                                            </div>
                                            {isSelected && (
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                marginBottom: '1rem', padding: '0.45rem 0.75rem', borderRadius: '6px',
                                background: 'var(--bg-error-subtle)', border: '1px solid rgba(191,25,50,0.18)',
                                fontSize: '0.75rem', color: 'var(--status-error)',
                            }}>
                                <AlertTriangle size={12} />
                                {error}
                            </div>
                        )}

                        {/* Footer actions */}
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                            <button onClick={handleClose} style={{
                                padding: '0.5rem 1rem', borderRadius: '7px',
                                background: 'transparent', color: 'var(--text-mid)',
                                border: '1px solid var(--border-default)', cursor: 'pointer',
                                fontSize: '0.82rem', fontWeight: 500,
                            }}>
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={sending || !email.trim()}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    padding: '0.5rem 1.25rem', borderRadius: '7px',
                                    background: sending || !email.trim() ? 'var(--accent-primary-muted)' : 'var(--accent-primary)',
                                    color: sending || !email.trim() ? 'var(--accent-primary)' : 'var(--text-inverse)',
                                    border: 'none', cursor: sending || !email.trim() ? 'not-allowed' : 'pointer',
                                    opacity: sending ? 0.7 : 1,
                                    fontSize: '0.82rem', fontWeight: 600,
                                    transition: 'all 0.15s',
                                }}
                            >
                                {sending
                                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</>
                                    : <><Mail size={13} /> Send Invite</>}
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </>
    );
}
