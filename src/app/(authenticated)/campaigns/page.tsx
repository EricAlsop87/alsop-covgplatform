'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { generateCoPilotPrompt, type CoPilotPromptContext, type PromptTemplateId } from '@/lib/copilotPromptGenerator';
import { PolicyEmailComposer } from '@/components/email/PolicyEmailComposer';
import { logger } from '@/lib/logger';
import {
    Calendar,
    Search,
    Mail,
    Sparkles,
    Users,
    Check,
    Loader2,
    ExternalLink,
    Filter,
    FileText,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';

interface RenewalPolicy {
    policy_id: string;
    carrier_policy_number: string;
    effective_date: string;
    expiration_date: string;
    annual_premium: number;
    payment_status: string;
    payment_plan: string;
    has_rce?: boolean;
    rce_url?: string | null;
    policies: {
        id: string;
        policy_number: string;
        clients: {
            id: string;
            named_insured: string;
            email: string;
            phone: string;
            mailing_address_raw: string;
        };
    };
}

export default function RenewalCampaignsPage() {
    const [loading, setLoading] = useState(true);
    const [policies, setPolicies] = useState<RenewalPolicy[]>([]);
    const [windowDays, setWindowDays] = useState(60);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [emailModalPolicy, setEmailModalPolicy] = useState<RenewalPolicy | null>(null);
    const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
    const [bulkCopied, setBulkCopied] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 25;

    const fetchRenewals = async (days: number) => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch(`/api/campaigns/renewals?window=${days}`, {
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });
            const result = await res.json();
            if (result.success) {
                setPolicies(result.data);
            }
        } catch (error) {
            logger.error('page', 'Failed to fetch renewals:', { error: error instanceof Error ? error.message : String(error) })
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRenewals(windowDays);
    }, [windowDays]);

    const filteredPolicies = useMemo(() => {
        if (!searchQuery.trim()) return policies;
        const lowerQ = searchQuery.toLowerCase();
        return policies.filter(p => 
            p.policies.clients.named_insured.toLowerCase().includes(lowerQ) ||
            p.policies.policy_number.toLowerCase().includes(lowerQ) ||
            p.carrier_policy_number?.toLowerCase().includes(lowerQ)
        );
    }, [policies, searchQuery]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, windowDays]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredPolicies.length / PAGE_SIZE));
    const paginatedPolicies = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredPolicies.slice(start, start + PAGE_SIZE);
    }, [filteredPolicies, currentPage]);

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredPolicies.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredPolicies.map(p => p.policy_id)));
        }
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    /** Build a CoPilot prompt for a renewal policy, auto-selecting template by payment type */
    const buildPromptForPolicy = (policy: RenewalPolicy): string => {
        const templateId: PromptTemplateId =
            policy.payment_status?.toLowerCase()?.includes('mortgage')
                ? 'renewal_notice_mortgage'
                : 'renewal_notice_insured';
        const ctx: CoPilotPromptContext = {
            clientName: policy.policies?.clients?.named_insured || '',
            clientEmail: policy.policies?.clients?.email || '',
            policyNumber: policy.policies?.policy_number || policy.carrier_policy_number || '',
            propertyAddress: policy.policies?.clients?.mailing_address_raw || '',
            agentName: 'Alsop and Associates Insurance Agency',
            expirationDate: policy.expiration_date,
            effectiveDate: policy.effective_date,
            annualPremium: policy.annual_premium ? `$${policy.annual_premium.toLocaleString()}` : undefined,
            paymentMethod: policy.payment_status || undefined,
        };
        return generateCoPilotPrompt(templateId, ctx);
    };

    const handleCopySingle = async (policy: RenewalPolicy) => {
        const prompt = buildPromptForPolicy(policy);
        await navigator.clipboard.writeText(prompt);
        setCopiedStates(prev => ({ ...prev, [policy.policy_id]: true }));
        setTimeout(() => {
            setCopiedStates(prev => ({ ...prev, [policy.policy_id]: false }));
        }, 2000);
    };

    const handleCopyBulk = async () => {
        if (selectedIds.size === 0) return;
        const selectedPolicies = filteredPolicies.filter(p => selectedIds.has(p.policy_id));
        const prompts = selectedPolicies.map(p => buildPromptForPolicy(p));
        await navigator.clipboard.writeText(prompts.join('\n\n---\n\n'));
        setBulkCopied(true);
        setTimeout(() => setBulkCopied(false), 2000);
    };

    const formatCurrency = (val: number) => {
        if (val == null) return '-';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getPaymentBadge = (plan: string) => {
        if (!plan) return <span style={{ color: 'var(--text-muted)' }}>-</span>;
        const isMortgage = plan.toLowerCase().includes('mortgage') || plan.toLowerCase().includes('escrow');
        return (
            <span style={{
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                fontSize: '0.7rem',
                fontWeight: 600,
                background: isMortgage ? 'var(--accent-primary-muted)' : 'var(--bg-success-subtle)',
                color: isMortgage ? 'var(--text-accent)' : 'var(--status-success)',
                border: `1px solid ${isMortgage ? 'var(--accent-primary-subtle)' : 'var(--status-success)'}`
            }}>
                {plan}
            </span>
        );
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem', minHeight: '100vh', background: 'var(--bg-base)' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-high)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Calendar size={24} style={{ color: 'var(--accent-primary)' }} />
                    Renewal Campaigns
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0 }}>
                    Manage upcoming policy renewals and generate outreach materials.
                </p>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ position: 'relative' }}>
                        <Filter size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <select 
                            value={windowDays}
                            onChange={(e) => setWindowDays(Number(e.target.value))}
                            style={{ 
                                appearance: 'none',
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-default)',
                                borderRadius: '8px',
                                padding: '0.5rem 2rem 0.5rem 2.25rem',
                                color: 'var(--text-high)',
                                fontSize: '0.85rem',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value={30}>Next 30 Days</option>
                            <option value={60}>Next 60 Days</option>
                            <option value={90}>Next 90 Days</option>
                        </select>
                    </div>
                    
                    <div style={{ position: 'relative', width: '300px' }}>
                        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search client or policy..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-default)',
                                borderRadius: '8px',
                                padding: '0.5rem 1rem 0.5rem 2.25rem',
                                color: 'var(--text-high)',
                                fontSize: '0.85rem',
                                outline: 'none'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Bulk Action Bar */}
            <div style={{ 
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <input 
                        type="checkbox"
                        checked={selectedIds.size > 0 && selectedIds.size === filteredPolicies.length}
                        onChange={toggleSelectAll}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                    />
                    <span style={{ color: 'var(--text-high)', fontSize: '0.85rem', fontWeight: 600 }}>
                        {selectedIds.size} selected
                    </span>
                </div>
                <button
                    onClick={handleCopyBulk}
                    disabled={selectedIds.size === 0}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: selectedIds.size > 0 ? 'var(--accent-primary)' : 'var(--bg-surface-raised)',
                        color: selectedIds.size > 0 ? 'var(--text-high)' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.5rem 1rem',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s'
                    }}
                >
                    {bulkCopied ? <Check size={16} /> : <Sparkles size={16} />}
                    {bulkCopied ? 'Copied Prompts!' : 'Copy All Prompts'}
                </button>
            </div>

            {/* Data Table */}
            <div style={{ 
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                overflow: 'hidden'
            }}>
                {loading ? (
                    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 1rem', display: 'block', color: 'var(--accent-primary)' }} />
                        Loading renewals...
                    </div>
                ) : filteredPolicies.length === 0 ? (
                    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Users size={32} style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.5 }} />
                        No renewals found for the selected timeframe.
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)' }}>
                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', width: '40px' }}></th>
                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Policy #</th>
                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Client Name</th>
                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Expires</th>
                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Payment Type</th>
                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>RCE Document</th>
                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Premium</th>
                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedPolicies.map((p) => (
                                <tr key={p.policy_id} style={{ borderBottom: '1px solid var(--bg-surface-raised)' }}>
                                    <td style={{ padding: '1rem' }}>
                                        <input 
                                            type="checkbox"
                                            checked={selectedIds.has(p.policy_id)}
                                            onChange={() => toggleSelect(p.policy_id)}
                                            style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                                        />
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <Link 
                                            href={`/policy/${p.policies.id}`}
                                            style={{ color: 'var(--text-accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 500 }}
                                        >
                                            {p.carrier_policy_number || p.policies.policy_number}
                                            <ExternalLink size={12} />
                                        </Link>
                                    </td>
                                    <td style={{ padding: '1rem', color: 'var(--text-high)', fontSize: '0.85rem', fontWeight: 500 }}>
                                        {p.policies.clients.named_insured}
                                    </td>
                                    <td style={{ padding: '1rem', color: 'var(--text-mid)', fontSize: '0.85rem' }}>
                                        {formatDate(p.expiration_date)}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        {getPaymentBadge(p.payment_plan)}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        {p.has_rce ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: 'var(--bg-success-subtle)', color: 'var(--status-success)', border: '1px solid var(--status-success)' }}>
                                                <Check size={11} /> RCE Ready
                                            </span>
                                        ) : (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 500, background: 'var(--bg-error-subtle)', color: 'var(--status-error)', border: '1px solid var(--status-error)' }}>
                                                RCE Missing
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '1rem', color: 'var(--text-high)', fontSize: '0.85rem', fontWeight: 600, textAlign: 'right' }}>
                                        {formatCurrency(p.annual_premium)}
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                            {p.rce_url && (
                                                <a
                                                    href={p.rce_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="Download RCE PDF Attachment"
                                                    style={{
                                                        background: 'var(--accent-primary-muted)',
                                                        border: '1px solid var(--accent-primary-subtle)',
                                                        color: 'var(--text-accent)',
                                                        borderRadius: '6px',
                                                        padding: '0.4rem',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        textDecoration: 'none'
                                                    }}
                                                >
                                                    <FileText size={16} />
                                                </a>
                                            )}
                                            <button
                                                onClick={() => handleCopySingle(p)}
                                                title="Copy CoPilot Prompt"
                                                style={{
                                                    background: 'var(--accent-primary-muted)',
                                                    border: '1px solid var(--accent-primary-subtle)',
                                                    color: 'var(--text-accent)',
                                                    borderRadius: '6px',
                                                    padding: '0.4rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                {copiedStates[p.policy_id] ? <Check size={16} /> : <Sparkles size={16} />}
                                            </button>
                                            <button
                                                onClick={() => setEmailModalPolicy(p)}
                                                title="Open Email Composer"
                                                style={{
                                                    background: 'var(--accent-primary-muted)',
                                                    border: '1px solid var(--accent-primary-subtle)',
                                                    color: 'var(--text-accent)',
                                                    borderRadius: '6px',
                                                    padding: '0.4rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <Mail size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination Controls */}
            {!loading && filteredPolicies.length > 0 && (
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginTop: '1rem', padding: '0.75rem 1rem',
                    background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px',
                }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filteredPolicies.length)} of {filteredPolicies.length} policies
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage <= 1}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: '32px', height: '32px', borderRadius: '6px',
                                background: currentPage <= 1 ? 'var(--bg-surface-raised)' : 'var(--bg-surface)',
                                border: '1px solid var(--border-default)',
                                color: currentPage <= 1 ? 'var(--text-muted)' : 'var(--text-high)',
                                cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                            }}
                        >
                            <ChevronLeft size={16} />
                        </button>
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                            let page: number;
                            if (totalPages <= 7) {
                                page = i + 1;
                            } else if (currentPage <= 4) {
                                page = i + 1;
                            } else if (currentPage >= totalPages - 3) {
                                page = totalPages - 6 + i;
                            } else {
                                page = currentPage - 3 + i;
                            }
                            return (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    style={{
                                        width: '32px', height: '32px', borderRadius: '6px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.82rem', fontWeight: currentPage === page ? 700 : 500,
                                        background: currentPage === page ? 'var(--accent-primary)' : 'transparent',
                                        color: currentPage === page ? '#fff' : 'var(--text-mid)',
                                        border: currentPage === page ? 'none' : '1px solid var(--border-default)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {page}
                                </button>
                            );
                        })}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage >= totalPages}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: '32px', height: '32px', borderRadius: '6px',
                                background: currentPage >= totalPages ? 'var(--bg-surface-raised)' : 'var(--bg-surface)',
                                border: '1px solid var(--border-default)',
                                color: currentPage >= totalPages ? 'var(--text-muted)' : 'var(--text-high)',
                                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                            }}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Email Composer Modal */}
            <PolicyEmailComposer
                isOpen={!!emailModalPolicy}
                onClose={() => setEmailModalPolicy(null)}
                policyId={emailModalPolicy?.policy_id}
                clientEmail={emailModalPolicy?.policies?.clients?.email}
                clientName={emailModalPolicy?.policies?.clients?.named_insured}
                policyNumber={emailModalPolicy?.policies?.policy_number || emailModalPolicy?.carrier_policy_number}
                propertyAddress={emailModalPolicy?.policies?.clients?.mailing_address_raw}
                rceDownloadUrl={emailModalPolicy?.rce_url}
            />
        </div>
    );
}
