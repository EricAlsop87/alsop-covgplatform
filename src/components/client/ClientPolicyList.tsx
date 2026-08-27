'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { fetchPoliciesByClientId, DashboardPolicy } from '@/lib/api';
import styles from './ClientPolicyList.module.css';
import { logger } from '@/lib/logger';


interface ClientPolicyListProps {
    clientId: string;
}

/** Format ISO date string to MM-DD-YY */
function formatShortDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}-${dd}-${yy}`;
}

export function ClientPolicyList({ clientId }: ClientPolicyListProps) {
    const router = useRouter();
    const [policies, setPolicies] = React.useState<DashboardPolicy[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const loadPolicies = async () => {
            try {
                const clientPolicies = await fetchPoliciesByClientId(clientId);
                setPolicies(clientPolicies);
            } catch (error) {
                logger.error('ClientPolicyList', 'Error loading policies:', { error: error instanceof Error ? error.message : String(error) })
            } finally {
                setLoading(false);
            }
        };

        loadPolicies();
    }, [clientId]);

    if (loading) {
        return <div className={styles.loading}>Loading policies...</div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Client Policies</h2>
                <p className={styles.subtitle}>{policies.length} total {policies.length === 1 ? 'policy' : 'policies'}</p>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead className={styles.thead}>
                        <tr>
                            <th className={styles.th}>Policy Number</th>
                            <th className={styles.th}>Property Address</th>
                            <th className={styles.th}>Flags</th>
                            <th className={styles.th}>Effective Date</th>
                            <th className={styles.th}>Expiration Date</th>
                            <th className={styles.th}>Premium</th>
                            <th className={styles.th}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {policies.map((policy, idx) => {
                            const flagCount = policy.flag_count || 0;
                            const sev = policy.highest_severity || 'low';
                            const sevColors: Record<string, { bg: string; color: string; border: string }> = {
                                high:     { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'rgba(239,68,68,0.25)' },
                                medium:   { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.25)' },
                                low:      { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
                            };
                            const sc = sevColors[sev] || sevColors.low;

                            return (
                            <tr
                                key={`${policy.id}-${idx}`}
                                className={`${styles.tr} ${styles.clickable}`}
                                onClick={() => router.push(`/policy/${policy.id}`)}
                            >
                                <td className={styles.td}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span className={styles.policyNumber}>{policy.policy_number}</span>
                                        {policy.previous_policy_number && (
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                                Prev: {policy.previous_policy_number}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className={styles.td}>{policy.property_address}</td>
                                <td className={styles.td}>
                                    {flagCount > 0 ? (
                                        <span
                                            title={policy.flags?.map(f => f.title).join(', ')}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.3rem',
                                                padding: '0.2rem 0.55rem',
                                                borderRadius: '4px',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                background: sc.bg,
                                                color: sc.color,
                                                border: `1px solid ${sc.border}`,
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            ⚑ {flagCount}
                                        </span>
                                    ) : (
                                        <span style={{ color: '#4ade80', fontSize: '0.75rem', fontWeight: 600 }}>✓ None</span>
                                    )}
                                </td>
                                <td className={styles.td}>{formatShortDate(policy.effective_date)}</td>
                                <td className={styles.td}>{formatShortDate(policy.expiration_date)}</td>
                                <td className={styles.td}>{policy.annual_premium || '—'}</td>
                                <td className={styles.td}>
                                    <span className={`${styles.statusBadge} ${styles[`status${(policy.status || 'unknown').replace(/\s/g, '')}`]}`}>
                                        {policy.status || 'unknown'}
                                    </span>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>

                {policies.length === 0 && (
                    <div className={styles.emptyState}>
                        <p>No policies found for this client.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
