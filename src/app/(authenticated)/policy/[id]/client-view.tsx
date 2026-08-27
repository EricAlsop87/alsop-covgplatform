'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Shield, FileText, Download, MapPin, Calendar,
    AlertTriangle, CheckCircle, Loader2, Home, Building2,
    Info, Clock, Zap, MessageSquare, Send,
    File, User, Upload, Folder, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import {
    getPolicyDetailById, PolicyDetail, getPropertyEnrichments, PropertyEnrichment,
    getLatestReportForPolicy, PolicyReportRow, fetchDecPageFilesByPolicyId,
    getDecPageFileDownloadUrl, generatePolicyReport, DecPageFileInfo
} from '@/lib/api';
import { useToast } from '@/components/ui/Toast/Toast';
import { SupportModal } from '@/components/shared/SupportModal';
import { useSidebar } from '@/components/layout/SidebarContext';
import { logger } from '@/lib/logger';


interface ClientPolicyViewProps {
    policyId: string;
}

export function ClientPolicyView({ policyId }: ClientPolicyViewProps) {
    const router = useRouter();
    const { isMobile } = useSidebar();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState<PolicyDetail | null>(null);
    const [enrichments, setEnrichments] = useState<PropertyEnrichment[]>([]);
    const [reportRow, setReportRow] = useState<PolicyReportRow | null>(null);
    const [decFiles, setDecFiles] = useState<DecPageFileInfo[]>([]);
    const [decPageStoragePath, setDecPageStoragePath] = useState<string | null>(null);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [requestingReport, setRequestingReport] = useState(false);
    const [supportOpen, setSupportOpen] = useState(false);

    useEffect(() => {
        if (!policyId) return;
        async function load() {
            setLoading(true);
            try {
                const d = await getPolicyDetailById(policyId);
                if (d) setDetail(d);
            } catch (err) {
                logger.error('client-view', 'Client view: failed to load policy', { error: err instanceof Error ? err.message : String(err) })
            } finally {
                setLoading(false);
            }
        }
        load();

        getPropertyEnrichments(policyId).then(setEnrichments);
        getLatestReportForPolicy(policyId).then(r => { if (r) setReportRow(r); });
        fetchDecPageFilesByPolicyId(policyId).then(files => {
            setDecFiles(files);
            if (files.length > 0 && files[0].storage_path) {
                setDecPageStoragePath(files[0].storage_path);
            }
        });
    }, [policyId]);

    const handleDownloadDecPage = async () => {
        if (!decPageStoragePath) return;
        setDownloading('dec');
        try {
            const url = await getDecPageFileDownloadUrl(decPageStoragePath);
            if (url) window.open(url, '_blank');
        } finally {
            setDownloading(null);
        }
    };

    const handleDownloadReport = () => {
        if (!reportRow?.id) return;
        window.open(`/report/${reportRow.id}`, '_blank');
    };

    const handleRequestReport = async () => {
        // Check cooldown: if report was generated in the last 7 days
        if (reportRow?.created_at) {
            const created = new Date(reportRow.created_at);
            const daysSince = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince < 7) {
                toast.info('Your report was generated recently. Your agent has been notified of your request for a new one.');
                logger.info('client-view', '[Support] Client requested a new report — agent should be notified via email.')
                return;
            }
        }

        setRequestingReport(true);
        try {
            const result = await generatePolicyReport(policyId);
            if (result.report) {
                setReportRow(result.report as PolicyReportRow);
                toast.success('Report generated! You can now download it.');
            } else {
                toast.error(result.error || 'Unable to generate report. Please try again later.');
            }
        } catch {
            toast.error('Unable to generate report. Please try again later.');
        } finally {
            setRequestingReport(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-primary)' }} />
            </div>
        );
    }

    if (!detail) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                <FileText size={40} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
                <p style={{ color: 'var(--text-mid)', fontSize: '0.9rem' }}>Policy not found.</p>
                <Button size="sm" variant="outline" style={{ marginTop: '1rem' }} onClick={() => router.push('/portal')}>
                    Back to Portal
                </Button>
            </div>
        );
    }

    // Derive enrichment data
    const getEnrichment = (key: string) => enrichments.find(e => e.field_key === key)?.field_value;
    const fireRiskEnrichment = enrichments.find(e => e.field_key === 'fire_risk_label');
    const fireRiskLabel = fireRiskEnrichment?.field_value;
    const fireRiskSource = fireRiskEnrichment?.source_name || 'CAL FIRE / USDA Wildfire Hazard Mapping';
    const fireRiskColor = fireRiskLabel === 'Very High' ? '#ef4444'
        : fireRiskLabel === 'High' ? '#f97316'
            : fireRiskLabel === 'Moderate' ? '#eab308'
                : fireRiskLabel === 'Low' ? '#22c55e'
                    : '#6b7280';

    // AI recommendations from report
    const recommendations: { priority: string; title: string; description: string }[] =
        (reportRow?.ai_insights as any)?.recommendations || [];
    const overallAssessment = (reportRow?.ai_insights as any)?.overall_assessment;

    const statusColor = detail.status === 'active' ? '#22c55e'
        : detail.status === 'pending_review' ? '#f59e0b' : '#64748b';

    const fmtCurrency = (v?: string | number | null) => {
        if (!v) return '—';
        const n = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.]/g, '')) : v;
        return isNaN(n) ? String(v) : `$${n.toLocaleString()}`;
    };

    const formatAddress2Lines = (address?: string | null) => {
        if (!address) return null;
        const parts = address.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length >= 3) {
            const street = parts.slice(0, parts.length - 2).join(', ');
            const cityStateZip = parts.slice(parts.length - 2).join(', ');
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.35 }}>
                    <span>{street}</span>
                    <span>{cityStateZip}</span>
                </div>
            );
        } else if (parts.length === 2) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.35 }}>
                    <span>{parts[0]}</span>
                    <span>{parts[1]}</span>
                </div>
            );
        }
        return address;
    };

    // Renewal countdown
    const daysUntilExpiry = detail.expiration_date
        ? Math.ceil((new Date(detail.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
    const totalTermDays = detail.effective_date && detail.expiration_date
        ? Math.ceil((new Date(detail.expiration_date).getTime() - new Date(detail.effective_date).getTime()) / (1000 * 60 * 60 * 24))
        : null;
    const termProgress = totalTermDays && daysUntilExpiry !== null
        ? Math.max(0, Math.min(100, ((totalTermDays - daysUntilExpiry) / totalTermDays) * 100))
        : null;

    // Recommendation stats
    const highPriRecs = recommendations.filter(r => r.priority === 'high').length;
    const medPriRecs = recommendations.filter(r => r.priority === 'medium').length;

    return (
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
            {/* Back Nav */}
            <button onClick={() => router.push('/portal')} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500,
                background: 'none', border: 'none', cursor: 'pointer', marginBottom: '1.25rem',
                transition: 'color 0.2s',
            }}>
                <ArrowLeft size={15} /> Back to My Portal
            </button>

            {/* Risk Banner */}
            {fireRiskLabel && (fireRiskLabel === 'Very High' || fireRiskLabel === 'High') && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.875rem 1.25rem', marginBottom: '1.25rem',
                    background: `${fireRiskColor}08`, border: `1px solid ${fireRiskColor}30`,
                    borderRadius: 'var(--radius-lg)', borderLeft: `4px solid ${fireRiskColor}`,
                }}>
                    <AlertTriangle size={18} style={{ color: fireRiskColor, flexShrink: 0 }} />
                    <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-high)' }}>
                            Your property is in a {fireRiskLabel} fire risk zone
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-mid)', marginTop: '0.15rem', lineHeight: 1.4 }}>
                            Sourced from <strong>{fireRiskSource}</strong>. Review your coverage limits and consider additional wildfire protection. See recommendations below.
                        </div>
                    </div>
                </div>
            )}

            {/* Policy Header */}
            <div style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.25rem',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        {/* Client name */}
                        {detail.named_insured && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontSize: '0.78rem', color: 'var(--text-mid)', fontWeight: 500 }}>
                                <User size={13} /> {detail.named_insured}
                            </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-high)' }}>
                                {detail.policy_number || 'Policy'}
                            </h1>
                            <span style={{
                                fontSize: '0.65rem', fontWeight: 600, padding: '0.2rem 0.6rem',
                                borderRadius: '999px', background: `${statusColor}15`, color: statusColor,
                                textTransform: 'uppercase',
                            }}>
                                {detail.status?.replace('_', ' ') || 'Unknown'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-mid)' }}>
                            {detail.carrier_name && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Building2 size={13} /> {detail.carrier_name}
                                </span>
                            )}
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <MapPin size={13} /> {detail.property_address}
                            </span>
                        </div>
                    </div>

                    {/* Renewal countdown pill */}
                    {daysUntilExpiry !== null && daysUntilExpiry > 0 && (
                        <div style={{
                            padding: '0.5rem 0.875rem', borderRadius: '10px',
                            background: daysUntilExpiry <= 30 ? 'rgba(239,68,68,0.06)' : daysUntilExpiry <= 90 ? 'rgba(234,179,8,0.06)' : 'rgba(34,197,94,0.06)',
                            border: '1px solid var(--border-default)', textAlign: 'center', minWidth: '100px',
                        }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Renewal In</div>
                            <div style={{
                                fontSize: '1.25rem', fontWeight: 800,
                                color: daysUntilExpiry <= 30 ? '#ef4444' : daysUntilExpiry <= 90 ? '#eab308' : '#22c55e',
                            }}>{daysUntilExpiry} <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>days</span></div>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Dynamic Submit CTA Banner ─── */}
            {!decPageStoragePath ? (
                /* State 1: No declaration uploaded yet — primary CTA */
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                    padding: '1.25rem 1.5rem', marginBottom: '1.25rem',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)',
                    border: '1px solid rgba(99,102,241,0.25)',
                    borderRadius: 'var(--radius-lg)', borderLeft: '4px solid var(--accent-primary)',
                }}>
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                        background: 'rgba(99,102,241,0.15)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Upload size={22} style={{ color: 'var(--accent-primary)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: '220px' }}>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-high)', marginBottom: '0.2rem' }}>
                            Submit Your Declarations Page
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-mid)', lineHeight: 1.4 }}>
                            Upload your insurance dec page to receive a coverage analysis report with personalized recommendations.
                        </div>
                    </div>
                    <Button size="sm" onClick={() => router.push('/submit')} style={{
                        background: 'var(--accent-primary)', color: '#fff', fontWeight: 600,
                        whiteSpace: 'nowrap', flexShrink: 0, width: isMobile ? '100%' : 'auto',
                    }}>
                        <Upload size={14} style={{ marginRight: '0.35rem' }} />
                        Upload Now
                    </Button>
                </div>
            ) : !reportRow ? (
                /* State 2: Dec page uploaded, report pending */
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                    padding: '1rem 1.25rem', marginBottom: '1.25rem',
                    background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)',
                    borderRadius: 'var(--radius-lg)', borderLeft: '4px solid #eab308',
                }}>
                    <div style={{
                        width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                        background: 'rgba(234,179,8,0.12)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Clock size={18} style={{ color: '#eab308' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-high)' }}>
                            Report In Progress
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-mid)' }}>
                            Your declarations page has been submitted. Your coverage analysis report will be available shortly.
                        </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleRequestReport} disabled={requestingReport} style={{
                        fontSize: '0.75rem', whiteSpace: 'nowrap', flexShrink: 0, width: isMobile ? '100%' : 'auto',
                    }}>
                        {requestingReport ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', marginRight: '0.3rem' }} /> : <Zap size={13} style={{ marginRight: '0.3rem' }} />}
                        Generate Report
                    </Button>
                </div>
            ) : (
                /* State 3: Both uploaded — success with re-upload option */
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                    padding: '1rem 1.25rem', marginBottom: '1.25rem',
                    background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.18)',
                    borderRadius: 'var(--radius-lg)', borderLeft: '4px solid #22c55e',
                }}>
                    <div style={{
                        width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                        background: 'rgba(34,197,94,0.12)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CheckCircle size={18} style={{ color: '#22c55e' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-high)' }}>
                            Coverage Report Available
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-mid)' }}>
                            Your coverage analysis is ready. Download it from My Documents below.
                        </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => router.push('/submit')} style={{
                        fontSize: '0.75rem', whiteSpace: 'nowrap', flexShrink: 0, width: isMobile ? '100%' : 'auto',
                    }}>
                        <Upload size={13} style={{ marginRight: '0.3rem' }} />
                        Re-Upload
                    </Button>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: '1.25rem' }}>
                {/* Left Column — Main Content */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Coverage Summary */}
                    <Card title="Coverage Summary" icon={Shield}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                            <CoverageItem label="Dwelling" value={fmtCurrency(detail.limit_dwelling)} tooltip="Covers repair or rebuild of your home's structure" />
                            <CoverageItem label="Other Structures" value={fmtCurrency(detail.limit_other_structures)} tooltip="Detached garage, fences, sheds" />
                            <CoverageItem label="Personal Property" value={fmtCurrency(detail.limit_personal_property)} tooltip="Furniture, electronics, clothing, etc." />
                            <CoverageItem label="Fair Rental Value" value={fmtCurrency(detail.limit_fair_rental_value)} tooltip="Rental income if property becomes uninhabitable" />
                            <CoverageItem label="Deductible" value={fmtCurrency(detail.deductible)} highlight tooltip="Amount you pay before insurance kicks in" />
                            <CoverageItem label="Annual Premium" value={fmtCurrency(detail.annual_premium)} highlight tooltip="Your yearly cost for this coverage" />
                        </div>
                    </Card>

                    {/* Policy Term with Progress */}
                    <Card title="Policy Term" icon={Calendar}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: termProgress !== null ? '0.75rem' : 0 }}>
                            <InfoItem icon={Calendar} label="Effective" value={detail.effective_date ? new Date(detail.effective_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'} />
                            <InfoItem icon={Clock} label="Expires" value={detail.expiration_date ? new Date(detail.expiration_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'} />
                        </div>
                        {termProgress !== null && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                                    <span>Term progress</span>
                                    <span>{Math.round(termProgress)}% elapsed</span>
                                </div>
                                <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-surface-raised)', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%', borderRadius: '3px', transition: 'width 0.6s ease',
                                        width: `${termProgress}%`,
                                        background: termProgress > 85 ? '#ef4444' : termProgress > 70 ? '#eab308' : 'var(--accent-primary)',
                                    }} />
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* Recommendations */}
                    {recommendations.length > 0 && (
                        <Card title="Recommendations" icon={Zap} badge={
                            highPriRecs > 0
                                ? `${highPriRecs} high priority`
                                : medPriRecs > 0
                                    ? `${medPriRecs} to review`
                                    : `${recommendations.length} items`
                        } badgeColor={highPriRecs > 0 ? '#ef4444' : medPriRecs > 0 ? '#f59e0b' : '#3b82f6'}>
                            {overallAssessment && (
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-default)' }}>
                                    {overallAssessment}
                                </p>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {recommendations.map((rec, i) => (
                                    <RecommendationCard key={i} rec={rec} />
                                ))}
                            </div>
                        </Card>
                    )}
                </div>

                {/* Right Column — Sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Policy Files & Documents */}
                    <Card title="Policy Files & Documents" icon={Folder}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                            {/* Coverage Analysis Report */}
                            {reportRow ? (
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '0.625rem 0.75rem', borderRadius: '8px',
                                    background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)',
                                    gap: '0.5rem',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                                        <FileText size={15} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-high)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                Coverage Analysis Report
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                Generated {reportRow.created_at ? new Date(reportRow.created_at).toLocaleDateString() : 'Recently'}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                                        <button
                                            onClick={handleDownloadReport}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                                fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent-primary)',
                                                background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem',
                                            }}
                                        >
                                            <Eye size={12} /> View
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '0.625rem 0.75rem', borderRadius: '8px',
                                    background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <FileText size={15} style={{ color: 'var(--text-muted)' }} />
                                        <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)' }}>Coverage Analysis Report</span>
                                    </div>
                                    <button
                                        onClick={handleRequestReport}
                                        disabled={requestingReport}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                            fontSize: '0.68rem', fontWeight: 600, color: '#f59e0b',
                                            background: 'none', border: 'none', cursor: 'pointer',
                                        }}
                                    >
                                        {requestingReport ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={12} />}
                                        Request
                                    </button>
                                </div>
                            )}

                            {/* Declarations Pages & Policy Files */}
                            {decFiles.map((file, idx) => {
                                const path = file.storage_path || (file as any).file_path;
                                const fileName = file.file_name || `Declarations Page ${decFiles.length > 1 ? `#${idx + 1}` : ''}`;
                                const dateStr = file.uploaded_at ? new Date(file.uploaded_at).toLocaleDateString() : null;

                                return (
                                    <div key={file.id || idx} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '0.625rem 0.75rem', borderRadius: '8px',
                                        background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)',
                                        gap: '0.5rem',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                                            <Shield size={15} style={{ color: '#10b981', flexShrink: 0 }} />
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-high)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {fileName}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                    Dec Page {dateStr ? `• ${dateStr}` : ''}
                                                </div>
                                            </div>
                                        </div>
                                        {path && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                                                <button
                                                    onClick={async () => {
                                                        const url = await getDecPageFileDownloadUrl(path);
                                                        if (url) window.open(url, '_blank');
                                                    }}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                                        fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent-primary)',
                                                        background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem',
                                                    }}
                                                >
                                                    <Eye size={12} /> View
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        const url = await getDecPageFileDownloadUrl(path);
                                                        if (url) window.open(url, '_blank');
                                                    }}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                                        fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-mid)',
                                                        background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem',
                                                    }}
                                                >
                                                    <Download size={12} /> Download
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </Card>

                    {/* Property Details */}
                    <Card title="Property Details" icon={Home}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <PropRow label="Address" value={formatAddress2Lines(detail.property_address)} />
                            <PropRow label="Year Built" value={getEnrichment('year_built') || (detail.year_built ? String(detail.year_built) : null)} />
                            <PropRow label="Square Footage" value={getEnrichment('square_footage')} />
                            <PropRow label="Lot Size" value={getEnrichment('lot_size_sqft') ? `${getEnrichment('lot_size_sqft')} sq ft` : null} />
                            <PropRow label="Construction" value={getEnrichment('construction_type') || detail.construction_type} />
                            <PropRow label="Roof Type" value={getEnrichment('roof_type')} />
                            {getEnrichment('flood_zone') && <PropRow label="Flood Zone" value={getEnrichment('flood_zone')} />}
                        </div>
                    </Card>

                    {/* Fire Risk */}
                    {fireRiskLabel && (
                        <div style={{
                            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem',
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                        }}>
                            <div style={{
                                width: '36px', height: '36px', borderRadius: '8px',
                                background: `${fireRiskColor}12`, display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <AlertTriangle size={18} style={{ color: fireRiskColor }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fire Risk Zone</div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: fireRiskColor }}>{fireRiskLabel}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Source: {fireRiskSource}</div>
                            </div>
                        </div>
                    )}

                    {/* Contact Support */}
                    <div style={{
                        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-lg)', padding: '1.25rem', textAlign: 'center',
                    }}>
                        <MessageSquare size={20} style={{ color: 'var(--accent-secondary)', marginBottom: '0.5rem' }} />
                        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-high)', marginBottom: '0.35rem' }}>Need Help?</h3>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-mid)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                            Questions about your coverage? Our team is here to help.
                        </p>
                        <Button size="sm" variant="outline" onClick={() => setSupportOpen(true)} style={{ width: '100%' }}>
                            <Send size={13} style={{ marginRight: '0.35rem' }} />
                            Contact Support
                        </Button>
                    </div>

                    <SupportModal
                        isOpen={supportOpen}
                        onClose={() => setSupportOpen(false)}
                        clientName={detail?.named_insured}
                        policyNumber={detail?.policy_number}
                    />
                </div>
            </div>
        </div>
    );
}

/* ─── Shared Sub-components ─── */

function Card({ title, icon: Icon, children, badge, badgeColor }: {
    title: string; icon: React.ElementType; children: React.ReactNode;
    badge?: string; badgeColor?: string;
}) {
    return (
        <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        }}>
            <div style={{
                padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border-default)',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
                <Icon size={15} style={{ color: 'var(--accent-secondary)' }} />
                <h2 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-high)', flex: 1 }}>{title}</h2>
                {badge && (
                    <span style={{
                        fontSize: '0.6rem', fontWeight: 700, padding: '0.15rem 0.5rem',
                        borderRadius: '999px', background: `${badgeColor || '#3b82f6'}12`,
                        color: badgeColor || '#3b82f6', textTransform: 'uppercase',
                    }}>
                        {badge}
                    </span>
                )}
            </div>
            <div style={{ padding: '1rem 1.25rem' }}>{children}</div>
        </div>
    );
}

function CoverageItem({ label, value, highlight, tooltip }: { label: string; value: string; highlight?: boolean; tooltip?: string }) {
    return (
        <div style={{
            padding: '0.625rem 0.75rem', borderRadius: '8px',
            background: highlight ? 'rgba(99,102,241,0.04)' : 'var(--bg-surface-raised)',
            border: '1px solid var(--border-subtle)',
        }} title={tooltip}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>{label}</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: highlight ? 'var(--accent-primary)' : 'var(--text-high)' }}>{value}</div>
        </div>
    );
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Icon size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-high)' }}>{value}</div>
            </div>
        </div>
    );
}

function PropRow({ label, value }: { label: string; value?: string | React.ReactNode | null }) {
    if (!value) return null;
    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '0.375rem 0', borderBottom: '1px solid var(--border-subtle)',
            gap: '1rem',
        }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0, marginTop: '1px' }}>{label}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-high)', fontWeight: 500, textAlign: 'right' }}>{value}</span>
        </div>
    );
}

function FileRow({ label, available, loading, onClick, actionLabel, requesting }: {
    label: string; available: boolean; loading: boolean; onClick: () => void;
    actionLabel?: string; requesting?: boolean;
}) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.5rem 0.625rem', borderRadius: '6px',
            background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={14} style={{ color: available ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-high)' }}>{label}</span>
            </div>
            {available || !actionLabel ? (
                <button
                    onClick={onClick}
                    disabled={!available || loading}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        fontSize: '0.7rem', fontWeight: 600, color: available ? 'var(--accent-primary)' : 'var(--text-muted)',
                        background: 'none', border: 'none', cursor: available ? 'pointer' : 'default',
                        opacity: loading ? 0.5 : 1,
                    }}
                >
                    {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={12} />}
                    {available ? 'Download' : 'Not Available'}
                </button>
            ) : (
                <button
                    onClick={onClick}
                    disabled={requesting}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        fontSize: '0.7rem', fontWeight: 600, color: '#f59e0b',
                        background: 'none', border: 'none', cursor: 'pointer',
                        opacity: requesting ? 0.5 : 1,
                    }}
                >
                    {requesting ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={12} />}
                    {actionLabel}
                </button>
            )}
        </div>
    );
}

function RecommendationCard({ rec }: { rec: { priority: string; title: string; description: string } }) {
    const isHigh = rec.priority === 'high' || rec.priority === 'urgent';
    const isMed = rec.priority === 'medium' || rec.priority === 'moderate';

    const priColor = isHigh ? '#e11d48' : isMed ? '#d97706' : '#0284c7';
    const PriIcon = isHigh ? AlertTriangle : isMed ? Info : CheckCircle;
    const badgeText = isHigh ? 'Review Now' : isMed ? 'Discuss at Renewal' : 'Confirm & Update';

    return (
        <div style={{
            display: 'flex', gap: '0.85rem', padding: '1rem 1.125rem',
            background: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)',
            borderRadius: '10px', borderLeft: `4px solid ${priColor}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}>
            <div style={{
                width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                background: `${priColor}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: '1px',
            }}>
                <PriIcon size={16} style={{ color: priColor }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-high)' }}>{rec.title}</span>
                    <span style={{
                        fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.55rem',
                        borderRadius: '999px', background: `${priColor}15`, color: priColor,
                        letterSpacing: '0.02em',
                    }}>
                        {badgeText}
                    </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', lineHeight: 1.55, margin: 0 }}>
                    {rec.description}
                </p>
            </div>
        </div>
    );
}
