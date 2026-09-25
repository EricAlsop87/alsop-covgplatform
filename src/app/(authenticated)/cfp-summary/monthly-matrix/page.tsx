'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileSpreadsheet, LayoutGrid, List } from 'lucide-react';
import { CFPMonthlyMatrix } from '@/components/cfp/CFPMonthlyMatrix';

export default function CFPMonthlyMatrixPage() {
    return (
        <Suspense
            fallback={
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading Monthly Matrix...
                </div>
            }
        >
            <CFPMonthlyMatrixContent />
        </Suspense>
    );
}

function CFPMonthlyMatrixContent() {
    const pathname = usePathname();

    return (
        <div style={{ padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header & Sub-Navigation Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
                        <div
                            style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '8px',
                                background: 'rgba(34, 67, 182, 0.1)',
                                color: 'var(--color-primary, #2243B6)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <FileSpreadsheet size={20} />
                        </div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-high)', letterSpacing: '-0.02em', margin: 0 }}>
                            CFP Monthly Matrix
                        </h1>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Annual January–December overview matrix comparing unique policies, uploads, address presence, quoted, and unquotable totals.
                    </p>
                </div>

                {/* Sub-Page Navigation Switcher Tabs */}
                <div
                    style={{
                        display: 'flex',
                        background: '#f1f5f9',
                        padding: '4px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        gap: '4px',
                    }}
                >
                    <Link
                        href="/cfp-summary"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.45rem 0.9rem',
                            borderRadius: '7px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                            color: pathname === '/cfp-summary' ? '#0f172a' : '#64748b',
                            background: pathname === '/cfp-summary' ? '#ffffff' : 'transparent',
                            boxShadow: pathname === '/cfp-summary' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        <List size={16} />
                        <span>Policy Details</span>
                    </Link>

                    <Link
                        href="/cfp-summary/monthly-matrix"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.45rem 0.9rem',
                            borderRadius: '7px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            textDecoration: 'none',
                            color: pathname.includes('/monthly-matrix') ? '#0f172a' : '#64748b',
                            background: pathname.includes('/monthly-matrix') ? '#ffffff' : 'transparent',
                            boxShadow: pathname.includes('/monthly-matrix') ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        <LayoutGrid size={16} />
                        <span>Monthly Matrix</span>
                    </Link>
                </div>
            </div>

            {/* Matrix Component */}
            <CFPMonthlyMatrix />
        </div>
    );
}
