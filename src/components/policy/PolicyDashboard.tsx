'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Declaration, PropertyEnrichment, getLatestReportForPolicy, PolicyReportRow, PolicyDetail, getManualOverridesForPolicy, upsertManualOverride, generatePolicyReport } from '@/lib/api';
import { normalizeInputs, calculateEstimate } from '@/lib/rce/InterimEstimator';
import { InterimRceWidget } from './InterimRceWidget';
import { EditableValue } from '../ui/EditableValue';
import { RefreshCw, TriangleAlert, MapPin } from 'lucide-react';
import styles from './PolicyDashboard.module.css';
import { Card } from '../ui/Card/Card';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';


interface PolicyDashboardProps {
    declaration: Declaration;
    enrichments?: PropertyEnrichment[];
    policyDetail?: PolicyDetail;
}

export function PolicyDashboard({ declaration, enrichments = [], policyDetail }: PolicyDashboardProps) {
    const router = useRouter();
    const [report, setReport] = useState<PolicyReportRow | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [overrides, setOverrides] = useState<Record<string, string>>({});
    const [hasPendingEdits, setHasPendingEdits] = useState(false);
    const [showRefreshPrompt, setShowRefreshPrompt] = useState(false);

    useEffect(() => {
        const policyId = declaration.policy_id || declaration.id;
        if (policyId) {
            getLatestReportForPolicy(policyId).then(data => {
                if (data) setReport(data);
            });
            getManualOverridesForPolicy(policyId).then(setOverrides);
            
            // Supabase Real-Time Binding
            const channel = supabase.channel(`policy_${policyId}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'property_enrichments', filter: `policy_id=eq.${policyId}` }, () => {
                    setShowRefreshPrompt(true);
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dec_pages', filter: `policy_id=eq.${policyId}` }, () => {
                    setShowRefreshPrompt(true);
                })
                .subscribe();
                
            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [declaration.policy_id, declaration.id]);

    const handleOverrideSave = async (fieldName: string, newValue: string, originalValue: string) => {
        const policyId = declaration.policy_id || declaration.id;
        if (!policyId) return false;
        
        const res = await upsertManualOverride(policyId, fieldName, newValue, originalValue);
        if (res.success) {
            setOverrides(prev => ({ ...prev, [fieldName]: newValue }));
            setHasPendingEdits(true);
            return true;
        }
        return false;
    };

    const getVal = (fieldName: string, original: string | null | undefined): string => {
        return overrides[fieldName] || original || '';
    };

    const handleGenerateReport = async () => {
        setIsGenerating(true);
        try {
            const policyId = declaration.policy_id || declaration.id;
            const result = await generatePolicyReport(policyId);
            if (result.report) {
                router.push(`/report/${result.report.id}`);
            } else {
                alert(result.error || 'Failed to generate report');
            }
        } catch (e) {
            logger.error('PolicyDashboard', 'Error:', { error: e instanceof Error ? e.message : String(e) });
            alert('Error generating report');
        } finally {
            setIsGenerating(false);
        }
    };

    // Helper to pull enrichment values
    const getEnrichment = (key: string) => enrichments.find(e => e.field_key === key);
    const enrichVal = (key: string) => getEnrichment(key)?.field_value || null;

    const fireRiskLabel = enrichVal('fire_risk_label');
    const fireRiskClass = enrichVal('fire_risk_class');
    const propertyImage = enrichVal('property_image');
    const streetViewImage = enrichVal('street_view_image');

    // Most recent enrichment fetch date
    const latestFetch = enrichments.length > 0
        ? enrichments.reduce((latest, e) => {
            const t = new Date(e.fetched_at).getTime();
            return t > latest ? t : latest;
        }, 0)
        : null;
    const lastFetchedStr = latestFetch
        ? new Date(latestFetch).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null;

    // Unique sources used
    const uniqueSources = [...new Set(enrichments.map(e => e.source_name))];

    // AI Vision observations — parse structured notes from ai_* enrichment rows
    interface ParsedAiObs {
        key: string;
        label: string;
        detected: boolean;
        confidence: 'high' | 'medium' | 'low';
        rationale: string;
        manualReview: boolean;
    }

    const aiObservations: ParsedAiObs[] = enrichments
        .filter(e => e.field_key.startsWith('ai_') && e.field_key !== 'ai_vision_summary')
        .map(e => {
            try {
                const meta = JSON.parse(e.notes || '{}');
                return {
                    key: e.field_key,
                    label: meta.label || e.field_key.replace('ai_', '').replace(/_/g, ' '),
                    detected: e.field_value === 'detected',
                    confidence: (e.confidence as 'high' | 'medium' | 'low') || 'medium',
                    rationale: meta.rationale || '',
                    manualReview: meta.manual_review || false,
                };
            } catch {
                return null;
            }
        })
        .filter((o): o is ParsedAiObs => o !== null);

    const detectedFeatures = aiObservations.filter(o => o.detected);

    // Vision summary metadata
    const visionSummaryEnrichment = enrichments.find(e => e.field_key === 'ai_vision_summary');
    const visionSummaryValue = visionSummaryEnrichment?.field_value || null;
    const visionSummaryMeta = (() => {
        try {
            const meta = JSON.parse(visionSummaryEnrichment?.notes || '{}');
            return { imageQuality: meta.image_quality as string | undefined };
        } catch {
            return null;
        }
    })();

    // Street view AI observations
    interface ParsedSvObs {
        key: string;
        label: string;
        value: string;
        confidence: 'high' | 'medium' | 'low';
        rationale: string;
        manualReview: boolean;
    }

    const aiSvObservations: ParsedSvObs[] = enrichments
        .filter(e => e.field_key.startsWith('ai_sv_') && e.field_key !== 'ai_sv_summary')
        .map(e => {
            try {
                const meta = JSON.parse(e.notes || '{}');
                return {
                    key: e.field_key,
                    label: meta.label || e.field_key.replace('ai_sv_', '').replace(/_/g, ' '),
                    value: e.field_value || '',
                    confidence: (e.confidence as 'high' | 'medium' | 'low') || 'medium',
                    rationale: meta.rationale || '',
                    manualReview: meta.manual_review || false,
                };
            } catch {
                return null;
            }
        })
        .filter((o): o is ParsedSvObs => o !== null);

    const svSummaryEnrichment = enrichments.find(e => e.field_key === 'ai_sv_summary');
    const svSummaryValue = svSummaryEnrichment?.field_value || null;
    const svSummaryMeta = (() => {
        try {
            const meta = JSON.parse(svSummaryEnrichment?.notes || '{}');
            return { imageQuality: meta.image_quality as string | undefined };
        } catch {
            return null;
        }
    })();

    // Fire risk color
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

    return (
        <div className={styles.container} style={{ position: 'relative' }}>
            {/* Real-time Refresh Prompt */}
            {showRefreshPrompt && (
                <div style={{
                    position: 'fixed',
                    top: '5rem',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--status-success)',
                    color: 'white',
                    padding: '0.675rem 1.5rem',
                    borderRadius: '24px',
                    boxShadow: 'var(--shadow-xl)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    zIndex: 1000,
                    animation: 'pulse 2s infinite',
                    fontWeight: 600,
                    fontSize: '0.875rem'
                }} onClick={() => {
                    setShowRefreshPrompt(false);
                    router.refresh(); 
                }}>
                    <RefreshCw size={16} />
                    New Background Data Available — Click to Refresh
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Policy Overview</h2>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    {report ? (
                        <>
                            <button
                                onClick={() => window.open(`/report/${report.id}`, '_blank')}
                                style={{ background: 'var(--accent-primary)', color: 'var(--text-inverse)', border: 'none', padding: '0.4rem 1rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600 }}
                            >
                                View Latest Report
                            </button>
                            <button
                                onClick={handleGenerateReport}
                                disabled={isGenerating}
                                style={{ background: 'transparent', color: 'var(--text-mid)', border: '1px solid var(--border-default)', padding: '0.4rem 1rem', borderRadius: 'var(--radius-sm)', cursor: isGenerating ? 'wait' : 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
                            >
                                {isGenerating ? 'Generating...' : 'Regenerate'}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleGenerateReport}
                            disabled={isGenerating}
                            style={{ background: 'var(--accent-primary)', color: 'var(--text-inverse)', border: 'none', padding: '0.4rem 1rem', borderRadius: 'var(--radius-sm)', cursor: isGenerating ? 'wait' : 'pointer', fontWeight: 600 }}
                        >
                            {isGenerating ? 'Generating...' : 'Generate Review Report'}
                        </button>
                    )}
                </div>
            </div>
            <div className={styles.grid}>
                {/* Insured Information */}
                <Card className={styles.card}>
                    <h3>Insured Information</h3>
                    <div className={styles.field}>
                        <label>Insured Name:</label>
                        <span
                            style={{ color: 'var(--accent-primary)', cursor: 'pointer' }}
                            onClick={() => declaration.client_id && router.push(`/client/${declaration.client_id}`)}
                        >
                            {declaration.insured_name}
                        </span>
                    </div>
                    {declaration.secondary_insured_name && (
                        <div className={styles.field}>
                            <label>Secondary Insured:</label>
                            <span>{declaration.secondary_insured_name}</span>
                        </div>
                    )}
                    <div className={styles.field}>
                        <label>Email:</label>
                        <span>{declaration.client_email || '—'}</span>
                    </div>
                    <div className={styles.field}>
                        <label>Phone:</label>
                        <span>{declaration.client_phone || '—'}</span>
                    </div>
                    <div className={styles.field}>
                        <label>Mailing Address:</label>
                        <span>{declaration.mailing_address || '—'}</span>
                    </div>
                </Card>

                {/* Property Details */}
                <Card className={styles.card}>
                    <h3>Property Details</h3>
                    <div className={styles.field}>
                        <label>Location:</label>
                        <span>{declaration.property_location || '—'}</span>
                    </div>
                    <div className={styles.field}>
                        <label>Year Built:</label>
                        <span>{declaration.year_built || '—'}</span>
                    </div>
                    <div className={styles.field}>
                        <label>Construction:</label>
                        <span>{declaration.construction_type || '—'}</span>
                    </div>
                    <div className={styles.field}>
                        <label>Occupancy:</label>
                        <span>{declaration.occupancy || '—'}</span>
                    </div>
                    <div className={styles.field}>
                        <label># of Units:</label>
                        <span>{declaration.number_of_units || '—'}</span>
                    </div>
                </Card>

                {/* Payment & Billing */}
                <Card className={styles.card}>
                    <h3>Payment & Billing</h3>
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
                </Card>

                {/* Property Valuation (Interim RCE) */}
                <div style={{ paddingBottom: '1rem' }}>
                    {(() => {
                        const rceInput = normalizeInputs({ id: declaration.policy_id || declaration.id, property_address_raw: declaration.property_location }, enrichments);
                        const rceEstimate = calculateEstimate(rceInput);
                        return <InterimRceWidget estimate={rceEstimate} />;
                    })()}
                </div>
                {/* Coverage Limits */}
                <Card className={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0 }}>Coverage Limits</h3>
                        {hasPendingEdits && (
                            <button 
                                onClick={handleGenerateReport} 
                                disabled={isGenerating}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem', 
                                    padding: '0.4rem 0.8rem', background: 'var(--status-warning)', 
                                    color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer',
                                    fontSize: '0.8rem', fontWeight: 'bold', animation: 'pulse 2s infinite'
                                }}
                            >
                                {isGenerating ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
                                {isGenerating ? 'Regenerating...' : 'Regenerate Analysis'}
                            </button>
                        )}
                    </div>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Dwelling:</label>
                            <EditableValue 
                                value={getVal('limit_dwelling', declaration.limit_dwelling)} 
                                originalValue={declaration.limit_dwelling}
                                onSave={(v) => handleOverrideSave('limit_dwelling', v, declaration.limit_dwelling || '')}
                                label="Dwelling"
                            />
                        </div>
                        <div className={styles.field}>
                            <label>Other Structures:</label>
                            <EditableValue 
                                value={getVal('limit_other_structures', declaration.limit_other_structures)} 
                                originalValue={declaration.limit_other_structures}
                                onSave={(v) => handleOverrideSave('limit_other_structures', v, declaration.limit_other_structures || '')}
                                label="Other Structures"
                            />
                        </div>
                    </div>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Personal Property:</label>
                            <EditableValue 
                                value={getVal('limit_personal_property', declaration.limit_personal_property)} 
                                originalValue={declaration.limit_personal_property}
                                onSave={(v) => handleOverrideSave('limit_personal_property', v, declaration.limit_personal_property || '')}
                                label="Personal Property"
                            />
                        </div>
                        <div className={styles.field}>
                            <label>Fair Rental Value:</label>
                            <EditableValue 
                                value={getVal('limit_fair_rental_value', declaration.limit_fair_rental_value)} 
                                originalValue={declaration.limit_fair_rental_value}
                                onSave={(v) => handleOverrideSave('limit_fair_rental_value', v, declaration.limit_fair_rental_value || '')}
                                label="Fair Rental Value"
                            />
                        </div>
                    </div>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Ordinance or Law:</label>
                            <EditableValue 
                                value={getVal('limit_ordinance_or_law', declaration.limit_ordinance_or_law)} 
                                originalValue={declaration.limit_ordinance_or_law}
                                onSave={(v) => handleOverrideSave('limit_ordinance_or_law', v, declaration.limit_ordinance_or_law || '')}
                                label="Ordinance or Law"
                            />
                        </div>
                        <div className={styles.field}>
                            <label>Debris Removal:</label>
                            <EditableValue 
                                value={getVal('limit_debris_removal', declaration.limit_debris_removal)} 
                                originalValue={declaration.limit_debris_removal}
                                onSave={(v) => handleOverrideSave('limit_debris_removal', v, declaration.limit_debris_removal || '')}
                                label="Debris Removal"
                            />
                        </div>
                    </div>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Extended Dwelling:</label>
                            <EditableValue 
                                value={getVal('limit_extended_dwelling_coverage', declaration.limit_extended_dwelling_coverage)} 
                                originalValue={declaration.limit_extended_dwelling_coverage}
                                onSave={(v) => handleOverrideSave('limit_extended_dwelling_coverage', v, declaration.limit_extended_dwelling_coverage || '')}
                                label="Extended Dwelling"
                            />
                        </div>
                        <div className={styles.field}>
                            <label>Deductible:</label>
                            <EditableValue 
                                value={getVal('deductible', declaration.deductible)} 
                                originalValue={declaration.deductible}
                                onSave={(v) => handleOverrideSave('deductible', v, declaration.deductible || '')}
                                label="Deductible"
                            />
                        </div>
                    </div>
                </Card>

                {/* Additional Coverages */}
                <Card className={styles.card}>
                    <h3>Additional Coverages</h3>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Dwelling Replacement Cost:</label>
                            <span>{declaration.limit_dwelling_replacement_cost || '—'}</span>
                        </div>
                        <div className={styles.field}>
                            <label>Inflation Guard:</label>
                            <span>{declaration.limit_inflation_guard || '—'}</span>
                        </div>
                    </div>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Personal Property RC:</label>
                            <span>{declaration.limit_personal_property_replacement_cost || '—'}</span>
                        </div>
                        <div className={styles.field}>
                            <label>Fences:</label>
                            <span>{declaration.limit_fences || '—'}</span>
                        </div>
                    </div>
                </Card>

                {/* Premium & Status */}
                <Card className={styles.card}>
                    <h3>Premium & Status</h3>
                    <div className={styles.field}>
                        <label>Total Premium:</label>
                        <span className={styles.premium}>{declaration.total_annual_premium || '—'}</span>
                    </div>
                    <div className={styles.field}>
                        <label>Status:</label>
                        <span className={`${styles.status} ${styles[(declaration.status || 'pending').toLowerCase().replace(' ', '')]}`}>
                            {declaration.status}
                        </span>
                    </div>
                    <div className={styles.field}>
                        <label>Date Issued:</label>
                        <span>{declaration.date_issued || '—'}</span>
                    </div>
                    <div className={styles.field}>
                        <label>Policy Period:</label>
                        <span>
                            {declaration.policy_period_start && declaration.policy_period_end
                                ? `${declaration.policy_period_start} to ${declaration.policy_period_end}`
                                : '—'}
                        </span>
                    </div>
                    <div className={styles.field}>
                        <label>Renewal Date:</label>
                        <span>{declaration.renewal_date || '—'}</span>
                    </div>
                </Card>

                {/* Broker Info */}
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

                {/* Perils Insured Against */}
                <Card className={styles.card}>
                    <h3>Perils Insured Against</h3>
                    <div className={styles.field}>
                        <label>Fire or Lightning, Internal Explosion and Smoke Damage:</label>
                        <span>{declaration.cb_fire_lightning_smoke_damage || '—'}</span>
                    </div>
                    <div className={styles.field}>
                        <label>Extended Coverages:</label>
                        <span>{declaration.cb_extended_coverages || '—'}</span>
                    </div>
                    <div className={styles.field}>
                        <label>Vandalism or Malicious Mischief:</label>
                        <span>{declaration.cb_vandalism_malicious_mischief || '—'}</span>
                    </div>
                </Card>

                {/* Mortgagee Info */}
                {(declaration.mortgagee_1_name || declaration.mortgagee_2_name) && (
                    <Card className={styles.card}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                            <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Mortgagees</h3>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                {declaration.mortgagee_2_name ? '2 Lenders on File' : '1 Lender on File'}
                            </span>
                        </div>

                        {declaration.mortgagee_1_name && (
                            <div className={styles.mortgageeBlock}>
                                <div className={styles.mortgageeHeader}>
                                    <span className={styles.mortgageeBadge}>1st Mortgagee</span>
                                    {declaration.mortgagee_1_loan_number && (
                                        <span className={styles.loanBadge}>Loan #{declaration.mortgagee_1_loan_number}</span>
                                    )}
                                </div>
                                <div className={styles.mortgageeName}>{declaration.mortgagee_1_name}</div>
                                {declaration.mortgagee_1_address && (
                                    <div className={styles.mortgageeAddress}>
                                        <MapPin size={13} className={styles.mortgageeIcon} />
                                        <span>{declaration.mortgagee_1_address}</span>
                                    </div>
                                )}
                                {declaration.mortgagee_1_code && (
                                    <div className={styles.mortgageeMeta}>
                                        <span className={styles.metaKey}>Carrier Code:</span>
                                        <span className={styles.metaVal}>{declaration.mortgagee_1_code}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {declaration.mortgagee_2_name && (
                            <div className={`${styles.mortgageeBlock} ${styles.mortgageeBlockSecond}`}>
                                <div className={styles.mortgageeHeader}>
                                    <span className={styles.mortgageeBadgeSecond}>2nd Mortgagee</span>
                                    {declaration.mortgagee_2_loan_number && (
                                        <span className={styles.loanBadge}>Loan #{declaration.mortgagee_2_loan_number}</span>
                                    )}
                                </div>
                                <div className={styles.mortgageeName}>{declaration.mortgagee_2_name}</div>
                                {declaration.mortgagee_2_address && (
                                    <div className={styles.mortgageeAddress}>
                                        <MapPin size={13} className={styles.mortgageeIcon} />
                                        <span>{declaration.mortgagee_2_address}</span>
                                    </div>
                                )}
                                {declaration.mortgagee_2_code && (
                                    <div className={styles.mortgageeMeta}>
                                        <span className={styles.metaKey}>Carrier Code:</span>
                                        <span className={styles.metaVal}>{declaration.mortgagee_2_code}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                )}

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
                    {declaration.dic_exists && (
                        <div className={styles.field} style={{ marginTop: '0.5rem' }}>
                            <label>DIC Policy Number:</label>
                            <span>{declaration.dic_policy_number || '—'}</span>
                        </div>
                    )}
                    {declaration.dic_company && (
                        <div className={styles.field} style={{ marginTop: '0.5rem' }}>
                            <label>DIC Company:</label>
                            <span>{declaration.dic_company}</span>
                        </div>
                    )}
                </Card>

                {/* Property Enrichment Data */}
                <Card className={styles.card}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '4px', background: 'var(--bg-accent-subtle)', flexShrink: 0 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                        </span>
                        Property Enrichment
                    </h3>
                    {enrichments.length === 0 ? (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.5rem 0' }}>
                            No enrichment data yet. Click <strong>Enrich Property Data</strong> above to fetch.
                        </div>
                    ) : (
                        <>
                            {/* Verified External Data (e.g. ATTOM) */}
                            {(() => {
                                const verifiedData = enrichments.filter(e => ['api', 'public_data', 'premium'].includes(e.source_type) && !e.field_key.includes('image') && e.field_key !== 'latitude' && e.field_key !== 'longitude');
                                if (verifiedData.length === 0) return null;
                                return (
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
                                                                <span style={{
                                                                    display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%',
                                                                    background: fireRiskColor(e.field_value),
                                                                }} />
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
                                );
                            })()}

                            {/* Reference Images */}
                            {(propertyImage || streetViewImage) && (
                                <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '3px', background: 'rgba(99,102,241,0.15)', flexShrink: 0 }}>
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                        </span>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reference Images</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        {propertyImage && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--status-success)', fontSize: '0.75rem' }}>
                                                ✓ Overhead satellite image acquired
                                            </div>
                                        )}
                                        {streetViewImage && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--status-success)', fontSize: '0.75rem' }}>
                                                ✓ Front-elevation street view acquired
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* AI Vision Analysis Section (Satellite) */}
                            {aiObservations.length > 0 && (
                                <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '3px', background: 'rgba(249,115,22,0.15)', flexShrink: 0 }}>
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                                        </span>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI Image Vision (Satellite)</span>
                                        <span style={{
                                            fontSize: '0.58rem', padding: '0.1rem 0.35rem', borderRadius: '3px',
                                            color: 'var(--enrichment-high)', background: 'var(--bg-warning-subtle)', border: '1px solid var(--status-warning)',
                                        }}>AI-Inferred</span>
                                    </div>

                                    {/* Detected features */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        {detectedFeatures.map(obs => (
                                            <div key={obs.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                                                <span style={{ color: 'var(--status-success)', flexShrink: 0, fontSize: '0.7rem' }}>✓</span>
                                                <span style={{ color: 'var(--text-high)', fontWeight: 500, flex: 1 }}>{obs.label}</span>
                                                <span style={{
                                                    display: 'inline-block', padding: '0.08rem 0.3rem', borderRadius: '3px',
                                                    fontSize: '0.58rem', fontWeight: 600,
                                                    color: obs.confidence === 'high' ? 'var(--enrichment-high)' : obs.confidence === 'medium' ? 'var(--enrichment-medium)' : 'var(--enrichment-low)',
                                                    background: obs.confidence === 'high' ? 'rgba(34,197,94,0.1)' : obs.confidence === 'medium' ? 'rgba(234,179,8,0.1)' : 'rgba(249,115,22,0.1)',
                                                    border: `1px solid ${obs.confidence === 'high' ? 'rgba(34,197,94,0.2)' : obs.confidence === 'medium' ? 'rgba(234,179,8,0.2)' : 'rgba(249,115,22,0.2)'}`,
                                                }}>{obs.confidence}</span>
                                                {obs.manualReview && (
                                                    <span style={{ fontSize: '0.58rem', color: 'var(--status-warning)' }} title="Manual review recommended">⚠</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Summary */}
                                    <div style={{ marginTop: '0.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                            {detectedFeatures.length} detected · {aiObservations.length - detectedFeatures.length} not found
                                        </span>
                                        {visionSummaryMeta?.imageQuality && (
                                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                                Image: {visionSummaryMeta.imageQuality}
                                            </span>
                                        )}
                                    </div>

                                    {/* Overall AI notes */}
                                    {visionSummaryValue && (
                                        <div style={{ marginTop: '0.3rem', fontSize: '0.68rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4 }}>
                                            {visionSummaryValue}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Street Vision Analysis Section */}
                            {aiSvObservations.length > 0 && (
                                <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '3px', background: 'rgba(56,189,248,0.15)', flexShrink: 0 }}>
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3z"/><circle cx="12" cy="12" r="3"/></svg>
                                        </span>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI Image Vision (Front Elevation)</span>
                                        <span style={{
                                            fontSize: '0.58rem', padding: '0.1rem 0.35rem', borderRadius: '3px',
                                            color: 'var(--status-info)', background: 'var(--bg-info-subtle)', border: '1px solid var(--status-info)',
                                        }}>AI-Inferred</span>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        {aiSvObservations.map(obs => (
                                            <div key={obs.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                                                <span style={{ color: '#38bdf8', flexShrink: 0, fontSize: '0.7rem' }}>•</span>
                                                <span style={{ color: 'var(--text-high)', fontWeight: 500, minWidth: '100px' }}>{obs.label}:</span>
                                                <span style={{ color: 'var(--text-high)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={obs.value}>{obs.value}</span>
                                                <span style={{
                                                    display: 'inline-block', padding: '0.08rem 0.3rem', borderRadius: '3px',
                                                    fontSize: '0.58rem', fontWeight: 600,
                                                    color: obs.confidence === 'high' ? 'var(--enrichment-high)' : obs.confidence === 'medium' ? 'var(--enrichment-medium)' : 'var(--enrichment-low)',
                                                    background: obs.confidence === 'high' ? 'rgba(34,197,94,0.1)' : obs.confidence === 'medium' ? 'rgba(234,179,8,0.1)' : 'rgba(249,115,22,0.1)',
                                                    border: `1px solid ${obs.confidence === 'high' ? 'rgba(34,197,94,0.2)' : obs.confidence === 'medium' ? 'rgba(234,179,8,0.2)' : 'rgba(249,115,22,0.2)'}`,
                                                }}>{obs.confidence}</span>
                                                {obs.manualReview && (
                                                    <span style={{ fontSize: '0.58rem', color: 'var(--status-warning)' }} title="Manual review recommended">⚠</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ marginTop: '0.35rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                        {svSummaryMeta?.imageQuality && (
                                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                                Image: {svSummaryMeta.imageQuality}
                                            </span>
                                        )}
                                    </div>

                                    {svSummaryValue && (
                                        <div style={{ marginTop: '0.3rem', fontSize: '0.68rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4 }}>
                                            {svSummaryValue}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Parse / Public Data (If any left over that wasn't Verified API) */}
                            {(() => {
                                const otherData = enrichments.filter(e => e.source_type === 'parser' && !e.field_key.includes('image'));
                                if (otherData.length === 0) return null;
                                return (
                                    <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '3px', background: 'rgba(148,163,184,0.15)', flexShrink: 0 }}>
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                            </span>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Extracted from Policy</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.6rem' }}>
                                            {otherData.map(e => (
                                                <div key={e.field_key} style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                                        {e.field_key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-high)' }}>{e.field_value || '—'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Providers and Meta */}
                            <div style={{ marginTop: '1rem', paddingTop: '0.6rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>Providers</div>
                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    {uniqueSources.map(src => (
                                        <span key={src} style={{
                                            display: 'inline-block', padding: '0.15rem 0.45rem',
                                            borderRadius: '4px', fontSize: '0.58rem', fontWeight: 600,
                                            color: src.includes('Vision') ? 'var(--enrichment-high)' : 'var(--text-high)',
                                            background: src.includes('Vision') ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${src.includes('Vision') ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.1)'}`,
                                        }}>{src}</span>
                                    ))}
                                </div>
                            </div>

                            {/* Meta */}
                            <div style={{ marginTop: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                    {enrichments.length} data point{enrichments.length !== 1 ? 's' : ''}
                                </span>
                                {lastFetchedStr && (
                                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                        Last fetched {lastFetchedStr}
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
}
