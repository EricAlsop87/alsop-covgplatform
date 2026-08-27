'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, FileText, X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface ClientResult {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    type: 'client';
}

interface PolicyResult {
    id: string;
    policyNumber: string;
    address: string;
    carrier: string;
    clientName: string;
    type: 'policy';
}

interface SearchResults {
    clients: ClientResult[];
    policies: PolicyResult[];
}

interface SidebarSearchProps {
    collapsed?: boolean;
}

export function SidebarSearch({ collapsed }: SidebarSearchProps) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResults | null>(null);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const doSearch = useCallback(async (q: string) => {
        if (q.length < 2) { setResults(null); setLoading(false); return; }
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });
            if (!res.ok) { setResults(null); return; }
            const data = await res.json();
            setResults(data);
        } catch { setResults(null); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (query.length < 2) { setResults(null); return; }
        setLoading(true);
        debounceRef.current = setTimeout(() => doSearch(query), 250);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, doSearch]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const navigate = (href: string) => {
        router.push(href);
        setIsOpen(false);
        setQuery('');
        setResults(null);
    };

    const hasResults = results && (results.clients.length > 0 || results.policies.length > 0);
    const noResults = results && results.clients.length === 0 && results.policies.length === 0 && query.length >= 2;

    if (collapsed) {
        return (
            <button
                title="Search"
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0.5rem', margin: '0.125rem 0.35rem', borderRadius: '0.375rem',
                    background: 'none', border: 'none', color: 'var(--text-mid)',
                    cursor: 'pointer', transition: 'all 150ms ease',
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
                <Search size={17.6} />
            </button>
        );
    }

    return (
        <div ref={containerRef} style={{ position: 'relative', padding: '0 0.625rem', marginBottom: '0.25rem' }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.35rem 0.65rem', borderRadius: '6px',
                background: 'var(--bg-surface-raised)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: isOpen ? 'var(--accent-primary)' : 'var(--border-default)',
                transition: 'border-color 0.15s ease',
            }}>
                <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    placeholder="Search…"
                    style={{
                        flex: 1, background: 'none', border: 'none', outline: 'none',
                        color: 'var(--text-high)', fontSize: '0.78rem', fontFamily: 'inherit',
                    }}
                />
                {query && (
                    <button
                        onClick={() => { setQuery(''); setResults(null); setIsOpen(false); }}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            {isOpen && (query.length >= 2) && (
                <div style={{
                    position: 'absolute', top: '100%', left: '0.625rem', right: '0.625rem',
                    marginTop: '0.25rem', background: 'var(--bg-surface-raised)',
                    border: '1px solid var(--border-default)', borderRadius: '8px',
                    boxShadow: 'var(--shadow-overlay)', zIndex: 100,
                    maxHeight: '360px', overflowY: 'auto',
                }}>
                    {loading && (
                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                        </div>
                    )}

                    {!loading && noResults && (
                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            No results for &ldquo;{query}&rdquo;
                        </div>
                    )}

                    {!loading && hasResults && (
                        <>
                            {results!.clients.length > 0 && (
                                <div>
                                    <div style={{
                                        padding: '0.4rem 0.75rem', fontSize: '0.62rem', fontWeight: 700,
                                        color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
                                        borderBottom: '1px solid var(--border-subtle)',
                                    }}>
                                        Clients
                                    </div>
                                    {results!.clients.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => navigate(`/client/${c.id}`)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                width: '100%', padding: '0.5rem 0.75rem', background: 'none',
                                                border: 'none', cursor: 'pointer', textAlign: 'left',
                                                color: 'var(--text-high)', fontSize: '0.8rem', transition: 'background 0.1s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-primary-muted)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                        >
                                            <User size={14} style={{ color: 'var(--accent-secondary)', flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {c.name}
                                                </div>
                                                {c.email && (
                                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {c.email}
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {results!.policies.length > 0 && (
                                <div>
                                    <div style={{
                                        padding: '0.4rem 0.75rem', fontSize: '0.62rem', fontWeight: 700,
                                        color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
                                        borderBottom: '1px solid var(--border-subtle)',
                                        borderTop: results!.clients.length > 0 ? '1px solid var(--border-subtle)' : 'none',
                                    }}>
                                        Policies
                                    </div>
                                    {results!.policies.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => navigate(`/policy/${p.id}`)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                width: '100%', padding: '0.5rem 0.75rem', background: 'none',
                                                border: 'none', cursor: 'pointer', textAlign: 'left',
                                                color: 'var(--text-high)', fontSize: '0.8rem', transition: 'background 0.1s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-primary-muted)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                        >
                                            <FileText size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {p.policyNumber}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {p.address !== '—' ? p.address : p.clientName}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
