'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, FileText, Cookie, ArrowLeft } from 'lucide-react';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    const tabs = [
        { href: '/legal/privacy', label: 'Privacy Policy', icon: Shield },
        { href: '/legal/terms', label: 'Terms of Service', icon: FileText },
        { href: '/legal/cookies', label: 'Cookie Policy', icon: Cookie },
    ];

    return (
        <div style={{
            maxWidth: '860px',
            margin: '2rem auto 4rem auto',
            padding: '0 1.5rem',
            fontFamily: 'var(--font-sans), Inter, system-ui, sans-serif',
        }}>
            {/* Top Navigation */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                marginBottom: '2rem',
                paddingBottom: '1.25rem',
                borderBottom: '1px solid var(--border-default)',
            }}>
                <Link
                    href="/"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: 'var(--text-mid)',
                        textDecoration: 'none',
                    }}
                >
                    <ArrowLeft size={16} />
                    <span>Back to CoverageCheckNow</span>
                </Link>

                <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {tabs.map(tab => {
                        const isActive = pathname === tab.href;
                        const Icon = tab.icon;
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    padding: '0.45rem 0.85rem',
                                    borderRadius: '6px',
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    transition: 'all 0.15s ease',
                                    background: isActive ? 'var(--accent-primary-subtle, rgba(0, 181, 190, 0.12))' : 'var(--bg-surface)',
                                    color: isActive ? 'var(--accent-primary)' : 'var(--text-mid)',
                                    border: `1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                                }}
                            >
                                <Icon size={14} />
                                <span>{tab.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Document Content */}
            <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: '12px',
                padding: '2.5rem 2.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
                {children}
            </div>

            {/* Bottom Agency Legal Notice */}
            <div style={{
                marginTop: '2rem',
                padding: '1rem 1.25rem',
                borderRadius: '8px',
                background: 'var(--bg-surface-raised, rgba(0,0,0,0.02))',
                border: '1px solid var(--border-subtle, var(--border-default))',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                lineHeight: 1.6,
                textAlign: 'center',
            }}>
                <p style={{ margin: 0 }}>
                    CoverageCheckNow is a proprietary software service operated by <strong>Alsop & Associates Insurance Agency</strong> (Claremont, CA). 
                    This platform is independent and is not sponsored, endorsed, or affiliated with Allstate Insurance Company, the California FAIR Plan Association, or any specific insurance carrier.
                </p>
            </div>
        </div>
    );
}

