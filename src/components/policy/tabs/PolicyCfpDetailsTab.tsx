'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Declaration, PolicyDetail, PropertyEnrichment } from '@/lib/api';
import { Card } from '@/components/ui/Card/Card';
import styles from '../PolicyDashboard.module.css';

/** Format YYYY-MM-DD or ISO date to MM/DD/YYYY */
function fmtDate(raw: string | null | undefined): string {
    if (!raw) return '—';
    try {
        const d = new Date(raw + 'T00:00:00');
        if (isNaN(d.getTime())) return raw;
        return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
        return raw;
    }
}

interface PolicyCfpDetailsTabProps {
    declaration: Declaration;
    policyDetail?: PolicyDetail;
    enrichments?: PropertyEnrichment[];
}

export function PolicyCfpDetailsTab({ declaration, policyDetail, enrichments = [] }: PolicyCfpDetailsTabProps) {
    const router = useRouter();

    // Pull enrichment helpers
    const enrichVal = (key: string) => enrichments.find(e => e.field_key === key)?.field_value || null;
    const fireRiskLabel = enrichVal('fire_risk_label');
    const fireRiskClass = enrichVal('fire_risk_class');

    const fireRiskColor = (cls: string | null) => {
        switch (cls) {
            case '1': return 'var(--status-success)';
            case '2': return 'var(--status-success)';
            case '3': return 'var(--status-warning)';
            case '4': return 'var(--enrichment-high)';
            case '5': return 'var(--status-error)';
            default: return 'var(--text-muted)';
        }
    };

    // Verified external data enrichments
    const verifiedData = enrichments.filter(e =>
        ['api', 'public_data', 'premium'].includes(e.source_type) &&
        !e.field_key.includes('image') &&
        e.field_key !== 'latitude' &&
        e.field_key !== 'longitude'
    );

    return (
        <div className={styles.container}>
            <h2 className={styles.sectionTitle}>FAIR Plan Policy Details</h2>

            <div className={styles.grid}>
                {/* Payment & Billing */}
                <Card className={styles.card}>
                    <h3>Payment &amp; Billing</h3>
                    <div className={styles.field}>
                        <label>Payment Status:</label>
                        <span style={{
                            color: policyDetail?.payment_status ? 'var(--text-high)' : 'var(--text-muted)',
                            fontWeight: policyDetail?.payment_status ? 600 : 400,
                        }}>
                            {policyDetail?.payment_status || 'Not on file'}
                        </span>
                    </div>
                    <div className={styles.field}>
                        <label>Payment Plan:</label>
                        <span style={{
                            color: policyDetail?.payment_plan ? 'var(--text-high)' : 'var(--text-muted)',
                            fontWeight: policyDetail?.payment_plan ? 600 : 400,
                        }}>
                            {policyDetail?.payment_plan || 'Not on file'}
                        </span>
                    </div>
                    <div className={styles.field}>
                        <label>Annual Premium:</label>
                        <span>{policyDetail?.annual_premium || declaration.total_annual_premium || '—'}</span>
                    </div>
                    <div className={styles.field}>
                        <label>Date Issued:</label>
                        <span>{fmtDate(declaration.date_issued)}</span>
                    </div>
                </Card>

                {/* Broker Information */}
                <Card className={styles.card}>
                    <h3>Broker Information</h3>
                    <div className={styles.field}>
                        <label>Broker:</label>
                        <span>{declaration.broker_name || '—'}</span>
                    </div>
                    <div className={styles.field}>
                        <label>Address:</label>
                        <span>{declaration.broker_address || '—'}</span>
                    </div>
                    <div className={styles.field}>
                        <label>Phone:</label>
                        <span>{declaration.broker_phone_number || '—'}</span>
                    </div>
                </Card>

                {/* Optional & Special Coverages */}
                <Card className={styles.card}>
                    <h3>Optional &amp; Special Coverages</h3>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Actual Cash Value:</label>
                            <span>{declaration.limit_actual_cash_value_coverage || '—'}</span>
                        </div>
                        <div className={styles.field}>
                            <label>Replacement Cost:</label>
                            <span>{declaration.limit_replacement_cost_coverage || '—'}</span>
                        </div>
                    </div>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Extended Replacement:</label>
                            <span>{declaration.limit_extended_replacement_cost_coverage || '—'}</span>
                        </div>
                        <div className={styles.field}>
                            <label>Guaranteed Replacement:</label>
                            <span>{declaration.limit_guaranteed_replacement_cost_coverage || '—'}</span>
                        </div>
                    </div>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Building Code Upgrade:</label>
                            <span>{declaration.limit_building_code_upgrade_coverage || '—'}</span>
                        </div>
                        <div className={styles.field}>
                            <label>Incidental Occupancy:</label>
                            <span>{declaration.limit_permitted_incidental_occupancy || '—'}</span>
                        </div>
                    </div>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Plants, Shrubs, Trees:</label>
                            <span>{declaration.limit_plants_shrubs_trees || '—'}</span>
                        </div>
                        <div className={styles.field}>
                            <label>Outdoor Radio/TV:</label>
                            <span>{declaration.limit_outdoor_radio_tv_equipment || '—'}</span>
                        </div>
                    </div>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Awnings:</label>
                            <span>{declaration.limit_awnings || '—'}</span>
                        </div>
                        <div className={styles.field}>
                            <label>Signs:</label>
                            <span>{declaration.limit_signs || '—'}</span>
                        </div>
                    </div>
                </Card>

                {/* Property Enrichment Data */}
                <Card className={styles.card}>
                    <h3>Property Enrichment Data</h3>
                    {enrichments.length === 0 ? (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.5rem 0' }}>
                            No enrichment data yet. Click <strong>Enrich Property Data</strong> above to fetch.
                        </div>
                    ) : (
                        <>
                            {verifiedData.length > 0 && (
                                <div style={{ marginTop: '0.4rem', marginBottom: '0.8rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '3px', background: 'rgba(34,197,94,0.15)', flexShrink: 0 }}>
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </span>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            Verified External Data
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.6rem' }}>
                                        {verifiedData.map(e => (
                                            <div key={e.field_key} style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                                    {e.field_key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                                </span>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-high)' }}>
                                                    {e.field_key === 'fire_risk_class' && fireRiskLabel ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                                            <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: fireRiskColor(e.field_value) }} />
                                                            <span style={{ color: fireRiskColor(e.field_value) }}>{fireRiskLabel}</span>
                                                        </span>
                                                    ) : (
                                                        e.field_value || '—'
                                                    )}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
}
