'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Cookie, ChevronDown, ChevronUp } from 'lucide-react';

const CONSENT_KEY = 'ccn_cookie_consent';

interface CookiePreferences {
    essential: boolean; // always true
    functional: boolean;
    analytics: boolean;
    timestamp: string;
}

function getStoredConsent(): CookiePreferences | null {
    if (typeof window === 'undefined') return null;
    try {
        const stored = localStorage.getItem(CONSENT_KEY);
        if (!stored) return null;
        return JSON.parse(stored) as CookiePreferences;
    } catch {
        return null;
    }
}

function saveConsent(prefs: CookiePreferences) {
    try {
        localStorage.setItem(CONSENT_KEY, JSON.stringify(prefs));
    } catch {
        // localStorage may be unavailable
    }
}

export function CookieConsent() {
    const [visible, setVisible] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [functional, setFunctional] = useState(true);
    const [analytics, setAnalytics] = useState(true);

    useEffect(() => {
        // Only show if no consent has been given
        const existing = getStoredConsent();
        if (!existing) {
            // Small delay so it doesn't flash on page load
            const timer = setTimeout(() => setVisible(true), 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAcceptAll = useCallback(() => {
        saveConsent({
            essential: true,
            functional: true,
            analytics: true,
            timestamp: new Date().toISOString(),
        });
        setVisible(false);
    }, []);

    const handleSavePreferences = useCallback(() => {
        saveConsent({
            essential: true,
            functional,
            analytics,
            timestamp: new Date().toISOString(),
        });
        setVisible(false);
    }, [functional, analytics]);

    if (!visible) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 9998,
                padding: '0 1rem 1rem',
                pointerEvents: 'none',
                display: 'flex',
                justifyContent: 'center',
                animation: 'ccn-slide-up 0.4s ease-out',
            }}
        >
            <div
                style={{
                    pointerEvents: 'auto',
                    width: '100%',
                    maxWidth: '560px',
                    background: 'var(--bg-surface, #1a1a2e)',
                    border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
                    borderRadius: '12px',
                    boxShadow: '0 -4px 24px rgba(0,0,0,0.25)',
                    overflow: 'hidden',
                }}
            >
                {/* Main bar */}
                <div style={{ padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <Cookie
                            size={20}
                            style={{
                                color: 'var(--accent-primary, #6366f1)',
                                flexShrink: 0,
                                marginTop: '2px',
                            }}
                        />
                        <div style={{ flex: 1 }}>
                            <p style={{
                                fontSize: '0.82rem',
                                color: 'var(--text-high, #F0EDE5)',
                                lineHeight: 1.55,
                                margin: 0,
                            }}>
                                We use cookies to keep you signed in and improve your experience.
                                No advertising cookies are used.{' '}
                                <Link
                                    href="/legal/cookies"
                                    style={{
                                        color: 'var(--accent-primary, #6366f1)',
                                        textDecoration: 'underline',
                                        textUnderlineOffset: '2px',
                                    }}
                                >
                                    Cookie Policy
                                </Link>
                            </p>
                        </div>
                    </div>

                    {/* Buttons */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginTop: '0.85rem',
                        justifyContent: 'flex-end',
                    }}>
                        <button
                            onClick={() => setExpanded(!expanded)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted, #888)',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                padding: '0.35rem 0.5rem',
                                borderRadius: '6px',
                                marginRight: 'auto',
                            }}
                        >
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            Manage Preferences
                        </button>
                        <button
                            onClick={handleAcceptAll}
                            style={{
                                background: 'var(--accent-primary, #2243B6)',
                                color: '#fff',
                                border: 'none',
                                padding: '0.45rem 1.1rem',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'opacity 0.15s',
                            }}
                        >
                            Accept All
                        </button>
                    </div>
                </div>

                {/* Expandable preferences */}
                {expanded && (
                    <div style={{
                        borderTop: '1px solid var(--border-default, rgba(255,255,255,0.08))',
                        padding: '1rem 1.25rem',
                    }}>
                        {/* Essential */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '0.75rem',
                        }}>
                            <div>
                                <p style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: 'var(--text-high, #F0EDE5)',
                                    margin: '0 0 0.15rem',
                                }}>
                                    Essential
                                </p>
                                <p style={{
                                    fontSize: '0.72rem',
                                    color: 'var(--text-muted, #888)',
                                    margin: 0,
                                }}>
                                    Authentication & security — always required
                                </p>
                            </div>
                            <ToggleSwitch checked={true} disabled />
                        </div>

                        {/* Functional */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '0.75rem',
                        }}>
                            <div>
                                <p style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: 'var(--text-high, #F0EDE5)',
                                    margin: '0 0 0.15rem',
                                }}>
                                    Functional
                                </p>
                                <p style={{
                                    fontSize: '0.72rem',
                                    color: 'var(--text-muted, #888)',
                                    margin: 0,
                                }}>
                                    Theme preferences & display settings
                                </p>
                            </div>
                            <ToggleSwitch
                                checked={functional}
                                onChange={() => setFunctional(!functional)}
                            />
                        </div>

                        {/* Analytics */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '0.85rem',
                        }}>
                            <div>
                                <p style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: 'var(--text-high, #F0EDE5)',
                                    margin: '0 0 0.15rem',
                                }}>
                                    Analytics
                                </p>
                                <p style={{
                                    fontSize: '0.72rem',
                                    color: 'var(--text-muted, #888)',
                                    margin: 0,
                                }}>
                                    Anonymized usage patterns to improve the service
                                </p>
                            </div>
                            <ToggleSwitch
                                checked={analytics}
                                onChange={() => setAnalytics(!analytics)}
                            />
                        </div>

                        <button
                            onClick={handleSavePreferences}
                            style={{
                                width: '100%',
                                background: 'var(--bg-surface-raised, rgba(255,255,255,0.06))',
                                color: 'var(--text-high, #F0EDE5)',
                                border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
                                padding: '0.5rem',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            Save Preferences
                        </button>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes ccn-slide-up {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}

function ToggleSwitch({
    checked,
    onChange,
    disabled,
}: {
    checked: boolean;
    onChange?: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            role="switch"
            aria-checked={checked}
            onClick={disabled ? undefined : onChange}
            style={{
                width: '36px',
                height: '20px',
                borderRadius: '10px',
                border: 'none',
                background: checked
                    ? 'var(--accent-primary, #2243B6)'
                    : 'var(--bg-surface-raised, rgba(255,255,255,0.15))',
                position: 'relative',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                transition: 'background 0.2s',
                flexShrink: 0,
                padding: 0,
            }}
        >
            <span
                style={{
                    position: 'absolute',
                    top: '2px',
                    left: checked ? '18px' : '2px',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
            />
        </button>
    );
}
