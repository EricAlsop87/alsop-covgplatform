'use client';

import React from 'react';
import { ActivityTab } from '@/components/dashboard/ActivityTab';
import Link from 'next/link';
import { Clock, Shield, ArrowRight } from 'lucide-react';

export default function OperationsActivityPage() {
    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
            {/* Header */}
            <div style={{
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
            }}>
                <div>
                    <h1 style={{
                        fontSize: '1.5rem',
                        fontWeight: 800,
                        color: 'var(--text-high)',
                        letterSpacing: '-0.02em',
                        marginBottom: '0.35rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.625rem',
                    }}>
                        <div style={{
                            width: '2.25rem',
                            height: '2.25rem',
                            borderRadius: '0.625rem',
                            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <Clock size={16} style={{ color: 'var(--text-inverse, #fff)' }} />
                        </div>
                        Recent Activity
                    </h1>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                        Live chronological feed of all document uploads, parsing events, and reviews.
                    </p>
                </div>

                <Link
                    href="/admin/submissions"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.5rem 0.85rem',
                        borderRadius: '0.5rem',
                        background: 'var(--bg-surface-raised)',
                        border: '1px solid var(--border-default)',
                        color: 'var(--text-high)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                        transition: 'all 0.15s ease',
                    }}
                >
                    <Shield size={14} style={{ color: 'var(--accent-primary)' }} />
                    Operations Hub
                    <ArrowRight size={13} style={{ opacity: 0.6 }} />
                </Link>
            </div>

            {/* Activity Stream */}
            <ActivityTab />
        </div>
    );
}
