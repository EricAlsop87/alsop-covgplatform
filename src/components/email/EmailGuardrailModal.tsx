'use client';

import React from 'react';
import {
    CheckCircle2, XCircle, AlertTriangle, ShieldAlert,
    Mail, X, ArrowRight, FileText, Satellite, Flag, ShieldCheck
} from 'lucide-react';

export interface GuardrailCheck {
    id: string;
    label: string;
    description: string;
    passed: boolean;
    required: boolean;
    icon: React.ReactNode;
}

interface EmailGuardrailModalProps {
    isOpen: boolean;
    onClose: () => void;
    onProceed: () => void;
    onOverride: () => void;
    checks: GuardrailCheck[];
}

export function EmailGuardrailModal({
    isOpen,
    onClose,
    onProceed,
    onOverride,
    checks,
}: EmailGuardrailModalProps) {
    if (!isOpen) return null;

    const requiredChecks = checks.filter(c => c.required);
    const recommendedChecks = checks.filter(c => !c.required);
    const allRequiredPassed = requiredChecks.every(c => c.passed);
    const hasRecommendedWarnings = recommendedChecks.some(c => !c.passed);
    const failedRequired = requiredChecks.filter(c => !c.passed);

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
        }}>
            <div style={{
                width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column',
                background: 'var(--bg-surface)', borderRadius: '14px', border: '1px solid var(--border-default)',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden', color: 'var(--text-high)',
                animation: 'fadeInScale 0.2s ease-out',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-default)',
                    background: allRequiredPassed
                        ? 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.03))'
                        : 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03))',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '9px',
                            background: allRequiredPassed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: allRequiredPassed ? 'var(--semantic-success)' : 'var(--semantic-error)',
                        }}>
                            <ShieldAlert size={20} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-high)' }}>
                                Email Readiness Check
                            </h2>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                {allRequiredPassed
                                    ? 'All requirements met — ready to compose'
                                    : `${failedRequired.length} required item${failedRequired.length > 1 ? 's' : ''} missing`
                                }
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Check List */}
                <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {/* Required Section */}
                    <div style={{
                        fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-low)',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem',
                    }}>
                        Required
                    </div>
                    {requiredChecks.map(check => (
                        <div key={check.id} style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            padding: '0.7rem 0.85rem', borderRadius: '9px',
                            background: check.passed
                                ? 'rgba(34,197,94,0.06)'
                                : 'rgba(239,68,68,0.06)',
                            border: `1px solid ${check.passed
                                ? 'rgba(34,197,94,0.2)'
                                : 'rgba(239,68,68,0.2)'
                            }`,
                        }}>
                            <div style={{
                                width: '30px', height: '30px', borderRadius: '7px', flexShrink: 0,
                                background: check.passed ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: check.passed ? 'var(--semantic-success)' : 'var(--semantic-error)',
                            }}>
                                {check.icon}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: '0.84rem', fontWeight: 600,
                                    color: check.passed ? 'var(--text-high)' : 'var(--semantic-error)',
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                }}>
                                    {check.label}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                    {check.description}
                                </div>
                            </div>
                            <div style={{ flexShrink: 0 }}>
                                {check.passed ? (
                                    <CheckCircle2 size={18} style={{ color: 'var(--semantic-success)' }} />
                                ) : (
                                    <XCircle size={18} style={{ color: 'var(--semantic-error)' }} />
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Recommended Section */}
                    {recommendedChecks.length > 0 && (
                        <>
                            <div style={{
                                fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-low)',
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                marginTop: '0.75rem', marginBottom: '0.25rem',
                            }}>
                                Recommended
                            </div>
                            {recommendedChecks.map(check => (
                                <div key={check.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.7rem 0.85rem', borderRadius: '9px',
                                    background: check.passed
                                        ? 'rgba(34,197,94,0.06)'
                                        : 'rgba(245,158,11,0.06)',
                                    border: `1px solid ${check.passed
                                        ? 'rgba(34,197,94,0.2)'
                                        : 'rgba(245,158,11,0.2)'
                                    }`,
                                }}>
                                    <div style={{
                                        width: '30px', height: '30px', borderRadius: '7px', flexShrink: 0,
                                        background: check.passed ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: check.passed ? 'var(--semantic-success)' : 'var(--semantic-warning, #f59e0b)',
                                    }}>
                                        {check.icon}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: '0.84rem', fontWeight: 600,
                                            color: check.passed ? 'var(--text-high)' : 'var(--semantic-warning, #f59e0b)',
                                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                                        }}>
                                            {check.label}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                            {check.description}
                                        </div>
                                    </div>
                                    <div style={{ flexShrink: 0 }}>
                                        {check.passed ? (
                                            <CheckCircle2 size={18} style={{ color: 'var(--semantic-success)' }} />
                                        ) : (
                                            <AlertTriangle size={18} style={{ color: 'var(--semantic-warning, #f59e0b)' }} />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '1rem 1.5rem', borderTop: '1px solid var(--border-default)',
                    background: 'var(--bg-surface-raised)',
                }}>
                    {!allRequiredPassed ? (
                        <button
                            onClick={onOverride}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.35rem',
                                padding: '0.5rem 0.85rem', borderRadius: '7px', fontSize: '0.76rem', fontWeight: 500,
                                background: 'transparent', color: 'var(--text-muted)',
                                border: '1px solid var(--border-default)', cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)';
                                e.currentTarget.style.color = 'var(--semantic-error)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-default)';
                                e.currentTarget.style.color = 'var(--text-muted)';
                            }}
                        >
                            <AlertTriangle size={13} />
                            Override & Compose Anyway
                        </button>
                    ) : (
                        <div />
                    )}

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '0.55rem 1rem', borderRadius: '7px', background: 'transparent',
                                color: 'var(--text-mid)', border: '1px solid var(--border-default)', cursor: 'pointer',
                                fontSize: '0.82rem', fontWeight: 500,
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onProceed}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.55rem 1.25rem', borderRadius: '7px', cursor: 'pointer',
                                fontSize: '0.84rem', fontWeight: 600, border: 'none',
                                background: allRequiredPassed ? 'var(--semantic-success)' : 'var(--bg-surface)',
                                color: allRequiredPassed ? '#ffffff' : 'var(--text-low)',
                                opacity: allRequiredPassed ? 1 : 0.5,
                                pointerEvents: allRequiredPassed ? 'auto' : 'none',
                                transition: 'all 0.15s',
                            }}
                        >
                            <Mail size={16} />
                            Compose Email
                            <ArrowRight size={14} />
                        </button>
                    </div>
                </div>

                <style>{`
                    @keyframes fadeInScale {
                        from { opacity: 0; transform: scale(0.95); }
                        to { opacity: 1; transform: scale(1); }
                    }
                `}</style>
            </div>
        </div>
    );
}
