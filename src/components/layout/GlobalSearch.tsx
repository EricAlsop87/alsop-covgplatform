'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, FileText, User, Flag as FlagIcon, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import styles from './GlobalSearch.module.css';
import { logger } from '@/lib/logger';


interface SearchResult {
    type: 'policy' | 'client';
    id: string;
    title: string;
    subtitle: string;
    href: string;
}

export function GlobalSearch() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Keyboard shortcut: "/" to focus search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
                e.preventDefault();
                inputRef.current?.focus();
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
                inputRef.current?.blur();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Click outside to close
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Debounced search
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);

    const doSearch = useCallback(async (q: string) => {
        if (!q || q.length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);
        const searchResults: SearchResult[] = [];

        try {
            // Sanitize: strip PostgREST operators and special chars to prevent filter injection
            const safe = q.replace(/[%_,().*+?^${}|\[\]\\]/g, '');
            if (safe.length < 2) { setResults([]); setLoading(false); return; }

            // Search policies (by policy number, insured name, address)
            const { data: policies } = await supabase
                .from('policies')
                .select('id, policy_number, named_insured, property_address')
                .or(`policy_number.ilike.%${safe}%,named_insured.ilike.%${safe}%,property_address.ilike.%${safe}%`)
                .limit(5);

            if (policies) {
                policies.forEach(p => {
                    searchResults.push({
                        type: 'policy',
                        id: p.id,
                        title: p.policy_number || 'Unnamed Policy',
                        subtitle: p.named_insured || p.property_address || '',
                        href: `/policy/${p.id}`,
                    });
                });
            }

            // Search clients (by name, email)
            const { data: clients } = await supabase
                .from('clients')
                .select('id, display_name, email')
                .or(`display_name.ilike.%${safe}%,email.ilike.%${safe}%`)
                .limit(5);

            if (clients) {
                clients.forEach(c => {
                    searchResults.push({
                        type: 'client',
                        id: c.id,
                        title: c.display_name || 'Unnamed Client',
                        subtitle: c.email || '',
                        href: `/client/${c.id}`,
                    });
                });
            }
        } catch (err) {
            logger.error('GlobalSearch', 'Global search error:', { error: err instanceof Error ? err.message : String(err) })
        } finally {
            setResults(searchResults);
            setSelectedIndex(-1);
            setLoading(false);
        }
    }, []);

    const handleInputChange = (value: string) => {
        setQuery(value);
        setIsOpen(true);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => doSearch(value), 250);
    };

    const handleSelect = (result: SearchResult) => {
        setIsOpen(false);
        setQuery('');
        router.push(result.href);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, -1));
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            handleSelect(results[selectedIndex]);
        }
    };

    const typeIcon = (type: string) => {
        switch (type) {
            case 'policy': return <FileText size={14} />;
            case 'client': return <User size={14} />;
            default: return null;
        }
    };

    const typeLabel = (type: string) => {
        switch (type) {
            case 'policy': return 'Policy';
            case 'client': return 'Client';
            default: return '';
        }
    };

    return (
        <div className={styles.container} ref={containerRef}>
            <div className={styles.searchBar}>
                <Search size={16} className={styles.searchIcon} />
                <input
                    ref={inputRef}
                    type="text"
                    className={styles.input}
                    placeholder="Search policies, clients…"
                    value={query}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={() => query.length >= 2 && setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                />
                <kbd className={styles.shortcut}>/</kbd>
                {query && (
                    <button
                        className={styles.clearBtn}
                        onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }}
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {isOpen && query.length >= 2 && (
                <div className={styles.dropdown}>
                    {loading && (
                        <div className={styles.loadingRow}>Searching…</div>
                    )}
                    {!loading && results.length === 0 && (
                        <div className={styles.emptyRow}>No results for "{query}"</div>
                    )}
                    {!loading && results.length > 0 && (
                        <>
                            {results.map((r, i) => (
                                <button
                                    key={`${r.type}-${r.id}`}
                                    className={`${styles.resultRow} ${i === selectedIndex ? styles.resultRowActive : ''}`}
                                    onClick={() => handleSelect(r)}
                                    onMouseEnter={() => setSelectedIndex(i)}
                                >
                                    <span className={styles.resultIcon}>{typeIcon(r.type)}</span>
                                    <div className={styles.resultText}>
                                        <span className={styles.resultTitle}>{r.title}</span>
                                        {r.subtitle && <span className={styles.resultSubtitle}>{r.subtitle}</span>}
                                    </div>
                                    <span className={styles.resultType}>{typeLabel(r.type)}</span>
                                    <ArrowRight size={12} className={styles.resultArrow} />
                                </button>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
