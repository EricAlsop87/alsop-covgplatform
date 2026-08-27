'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
    label: string;
    href?: string;  // If omitted, rendered as plain text (current page)
}

interface BreadcrumbsProps {
    items: Crumb[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
    if (items.length === 0) return null;

    return (
        <nav aria-label="Breadcrumb" style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            fontSize: '0.75rem', color: 'var(--text-muted, #64748b)',
            marginBottom: '1rem', flexWrap: 'wrap',
        }}>
            {items.map((item, i) => {
                const isLast = i === items.length - 1;
                return (
                    <React.Fragment key={i}>
                        {i > 0 && <ChevronRight size={12} style={{ color: '#475569', flexShrink: 0 }} />}
                        {item.href && !isLast ? (
                            <Link
                                href={item.href}
                                style={{
                                    color: '#94a3b8', textDecoration: 'none',
                                    transition: 'color 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = '#c7d2fe'}
                                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                            >
                                {item.label}
                            </Link>
                        ) : (
                            <span style={{ color: isLast ? 'var(--text-high, #f1f5f9)' : '#94a3b8', fontWeight: isLast ? 600 : 400 }}>
                                {item.label}
                            </span>
                        )}
                    </React.Fragment>
                );
            })}
        </nav>
    );
}
