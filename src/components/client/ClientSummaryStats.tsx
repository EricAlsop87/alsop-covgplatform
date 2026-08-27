'use client';

import React, { useState, useEffect } from 'react';
import { FileText, DollarSign, Calendar, Flag } from 'lucide-react';
import { fetchPoliciesByClientId, DashboardPolicy } from '@/lib/api';

interface ClientSummaryStatsProps {
    clientId: string;
}

export function ClientSummaryStats({ clientId }: ClientSummaryStatsProps) {
    const [policies, setPolicies] = useState<DashboardPolicy[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPoliciesByClientId(clientId)
            .then(setPolicies)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [clientId]);

    if (loading) return null;
    if (policies.length === 0) return null;

    const totalPolicies = policies.length;
    const activePolicies = policies.filter(p => p.status === 'active' || p.status === 'Active').length;
    const totalPremium = policies.reduce((sum, p) => {
        const premium = p.annual_premium ? parseFloat(String(p.annual_premium).replace(/[^0-9.]/g, '')) || 0 : 0;
        return sum + premium;
    }, 0);

    const upcoming = policies
        .filter(p => p.expiration_date)
        .map(p => ({ date: new Date(p.expiration_date!), policy: p.policy_number }))
        .filter(d => d.date > new Date())
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    const nextRenewal = upcoming[0] || null;

    const openFlagCount = policies.reduce((sum, p) => {
        return sum + (p.flag_count || 0);
    }, 0);

    const stats = [
        { icon: FileText, label: 'Policies', value: `${activePolicies} active`, sub: totalPolicies > activePolicies ? `${totalPolicies} total` : null, color: 'var(--accent-primary)' },
        { icon: DollarSign, label: 'Total Premium', value: totalPremium > 0 ? `$${totalPremium.toLocaleString()}` : '—', sub: totalPremium > 0 ? '/year' : null, color: 'var(--status-success)' },
        { icon: Calendar, label: 'Next Renewal', value: nextRenewal ? nextRenewal.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—', sub: nextRenewal ? nextRenewal.policy : null, color: 'var(--status-warning)' },
        { icon: Flag, label: 'Open Flags', value: String(openFlagCount), sub: openFlagCount > 0 ? 'across all policies' : 'none', color: openFlagCount > 0 ? 'var(--status-error)' : 'var(--text-muted)' },
    ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginTop: '1rem' }}>
            {stats.map(s => (
                <div key={s.label} style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '10px', padding: '1rem 1rem 0.85rem',
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <s.icon size={14} style={{ color: s.color }} />
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {s.label}
                        </span>
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-high)' }}>
                        {s.value}
                    </div>
                    {s.sub && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {s.sub}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
