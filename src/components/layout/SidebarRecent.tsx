'use client';

import React from 'react';
import Link from 'next/link';
import { User, X, Clock } from 'lucide-react';
import { useRecentlyVisited, RecentItem } from '@/hooks/useRecentlyVisited';

interface SidebarRecentProps {
    collapsed?: boolean;
}

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

export function SidebarRecent({ collapsed }: SidebarRecentProps) {
    const { items, clearAll } = useRecentlyVisited();
    const clientItems = items.filter(i => i.type === 'client');

    if (clientItems.length === 0 || collapsed) return null;

    return (
        <div style={{ padding: '0 0', marginTop: '0.25rem' }}>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 1.25rem', marginBottom: '0.35rem',
            }}>
                <span style={{
                    fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                }}>
                    <Clock size={10} /> Recent
                </span>
                <button
                    onClick={clearAll}
                    title="Clear recent"
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: '2px', display: 'flex',
                        transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-high)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                    <X size={11} />
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {clientItems.slice(0, 5).map((item: RecentItem) => (
                    <Link
                        key={`${item.type}-${item.id}`}
                        href={item.href}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.3rem 1.25rem', textDecoration: 'none',
                            color: 'var(--text-mid)', fontSize: '0.78rem',
                            transition: 'all 0.1s ease', borderRadius: '0.375rem',
                            margin: '0 0.5rem',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'var(--bg-surface-raised)';
                            e.currentTarget.style.color = 'var(--text-high)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'none';
                            e.currentTarget.style.color = 'var(--text-mid)';
                        }}
                    >
                        <User size={13} style={{ color: 'var(--accent-secondary)', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontWeight: 500, whiteSpace: 'nowrap',
                                overflow: 'hidden', textOverflow: 'ellipsis',
                                fontSize: '0.76rem',
                            }}>
                                {item.label}
                            </div>
                        </div>
                        <span style={{
                            fontSize: '0.58rem', color: 'var(--text-muted)',
                            flexShrink: 0, whiteSpace: 'nowrap',
                        }}>
                            {timeAgo(item.timestamp)}
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
