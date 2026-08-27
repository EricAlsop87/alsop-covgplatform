'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getUserProfile } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import {
    Briefcase, FileText, Shield, Mail, Phone, MapPin,
    Calendar, AlertCircle, Loader2, ChevronRight, Clock,
    DollarSign, ArrowRight, File, Download, MessageSquare,
    Send, Settings
} from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import { useToast } from '@/components/ui/Toast/Toast';
import { SupportModal } from '@/components/shared/SupportModal';
import { ErrorState } from '@/components/shared/ErrorState';
import {
    getLatestReportForPolicy, PolicyReportRow, fetchDecPageFilesByPolicyId,
    getDecPageFileDownloadUrl
} from '@/lib/api';
import styles from './portal.module.css';
import { logger } from '@/lib/logger';


interface ClientRecord {
    id: string;
    named_insured: string;
    email?: string;
    phone?: string;
    mailing_address_raw?: string;
    created_at?: string;
}

interface PolicyRecord {
    id: string;
    policy_number: string;
    carrier_name?: string;
    property_address_raw?: string;
    status?: string;
    created_at?: string;
    flag_count?: number;
    policy_terms?: {
        effective_date?: string;
        expiration_date?: string;
        annual_premium?: number;
        is_current?: boolean;
    }[];
}

export default function ClientPortalPage() {
    const router = useRouter();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [client, setClient] = useState<ClientRecord | null>(null);
    const [policies, setPolicies] = useState<PolicyRecord[]>([]);
    const [userName, setUserName] = useState('');
    const [profileEmail, setProfileEmail] = useState('');
    const [profilePhone, setProfilePhone] = useState('');
    const [recentDocs, setRecentDocs] = useState<{ label: string; policyNumber: string; type: 'dec' | 'report'; path?: string; reportData?: any; reportId?: string }[]>([]);
    const [downloadingDoc, setDownloadingDoc] = useState<string | null>(null);
    const [supportOpen, setSupportOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        async function loadPortal() {
            try {
                const profile = await getUserProfile();
                if (!profile) {
                    router.push('/auth/signin');
                    return;
                }

                setUserName(`${profile.first_name} ${profile.last_name}`.trim());
                setProfileEmail(profile.email || '');
                setProfilePhone(profile.phone || '');

                // Find the client record linked to this account's email
                let clientData: ClientRecord | null = null;
                const { data: byEmail } = await supabase
                    .from('clients')
                    .select('*')
                    .eq('email', profile.email)
                    .maybeSingle();
                
                if (byEmail) {
                    clientData = byEmail as ClientRecord;
                } else {
                    // Fallback: try to find a client created by this account
                    const { data: byAccountId } = await supabase
                        .from('clients')
                        .select('*')
                        .eq('created_by_account_id', profile.id)
                        .maybeSingle();
                    if (byAccountId) {
                        clientData = byAccountId as ClientRecord;
                    }
                }

                logger.info('page', '[Portal] Profile email:', { email: profile.email, clientFound: !!clientData })

                if (clientData) {
                    setClient(clientData);

                    // Fetch policies for this client with current term data
                    const { data: policyData } = await supabase
                        .from('policies')
                        .select(`
                            id,
                            policy_number,
                            carrier_name,
                            property_address_raw,
                            status,
                            created_at,
                            policy_terms (
                                effective_date,
                                expiration_date,
                                annual_premium,
                                is_current
                            )
                        `)
                        .eq('client_id', clientData.id)
                        .order('created_at', { ascending: false });

                    logger.info('page', '[Portal] Policies found:', { value: policyData?.length ?? 0 })

                    if (policyData) {
                        setPolicies(policyData as PolicyRecord[]);

                        // Fetch documents for the Recent Documents section across all client policies
                        const docs: { label: string; policyNumber: string; type: 'dec' | 'report'; path?: string; reportId?: string; createdAt?: string }[] = [];
                        await Promise.all(policyData.map(async (p: PolicyRecord) => {
                            // Dec pages
                            const decFiles = await fetchDecPageFilesByPolicyId(p.id);
                            decFiles.forEach(df => {
                                const path = df.storage_path || (df as any).file_path;
                                if (path) {
                                    docs.push({
                                        label: df.file_name || 'Declarations Page',
                                        policyNumber: p.policy_number || 'Pending',
                                        type: 'dec',
                                        path,
                                        createdAt: (df as any).created_at || (p as any).created_at,
                                    });
                                }
                            });
                            // Reports
                            const report = await getLatestReportForPolicy(p.id);
                            if (report) {
                                docs.push({
                                    label: 'Gap Analysis Report',
                                    policyNumber: p.policy_number || 'Pending',
                                    type: 'report',
                                    reportId: report.id,
                                    createdAt: report.created_at,
                                });
                            }
                        }));
                        // Sort most recent first
                        docs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                        setRecentDocs(docs.slice(0, 5));
                    }
                }
            } catch (err) {
                logger.error('page', '[Portal] Error loading portal data:', { error: err instanceof Error ? err.message : String(err) })
                setError('Failed to load your policies. Please try again.');
            } finally {
                setLoading(false);
            }
        }

        loadPortal();
    }, [router, refreshKey]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#6366f1' }} />
            </div>
        );
    }

    if (error) {
        return <ErrorState message={error} onRetry={() => { setError(null); setLoading(true); setRefreshKey(k => k + 1); }} />;
    }

    const currentTerm = (p: PolicyRecord) =>
        p.policy_terms?.find(t => t.is_current) || p.policy_terms?.[0];

    const totalPremium = policies.reduce((acc, p) => {
        const term = currentTerm(p);
        return acc + (term?.annual_premium || 0);
    }, 0);

    return (
        <div className={styles.portalContainer}>
            {/* Portal Header */}
            <div className={styles.portalHeader}>
                <h1 className={styles.portalTitle}>
                    <Briefcase size={22} style={{ color: '#6366f1' }} />
                    Welcome back{userName ? `, ${userName}` : ''}
                </h1>
                <p className={styles.portalSubtitle}>
                    Your coverage overview and policy information
                </p>
            </div>

            {/* Quick Stats */}
            <div className={styles.statsGrid}>
                <StatCard icon={FileText} label="Active Policies" value={policies.length.toString()} color="#14b8a6" />
                <StatCard icon={DollarSign} label="Total Premium" value={`$${totalPremium.toLocaleString()}`} color="#6366f1" />
            </div>

            {/* Policy Review in Progress Banner */}
            {policies.length > 0 && !recentDocs.some(d => d.type === 'report') && (
                <div className={styles.reviewBanner}>
                    <div className={styles.reviewBannerIcon}>
                        <Clock size={20} />
                    </div>
                    <div className={styles.reviewBannerContent}>
                        <h3 className={styles.reviewBannerTitle}>Coverage Review in Progress</h3>
                        <p className={styles.reviewBannerText}>
                            Your policy declaration has been received! Our licensed insurance team is currently gathering verified property records, calculating your Replacement Cost Estimate (RCE), and cross-referencing your coverage against California wildfire and companion policy benchmarks. Your advisor will notify you as soon as your personalized report is ready to review together.
                        </p>
                    </div>
                </div>
            )}

            <div className={styles.mainGrid}>
                {/* My Policies */}
                <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                }}>
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={16} style={{ color: '#818cf8' }} />
                            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-high)' }}>My Policies</h2>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => router.push('/submit')}>
                            <FileText size={13} style={{ marginRight: '0.375rem' }} /> Submit Declaration
                        </Button>
                    </div>

                    {policies.length === 0 ? (
                        <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                            <FileText size={40} style={{ color: '#475569', marginBottom: '1rem' }} />
                            <p style={{ color: 'var(--text-mid)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>No policies on file</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                Submit a declaration page to get started
                            </p>
                        </div>
                    ) : (
                        <div>
                            {policies.map((p) => {
                                const term = currentTerm(p);
                                const statusBg = p.status === 'active' ? 'rgba(34,197,94,0.12)'
                                    : p.status === 'pending_review' ? 'rgba(245,158,11,0.12)'
                                    : 'rgba(100,116,139,0.12)';
                                const statusText = p.status === 'active' ? '#4ade80'
                                    : p.status === 'pending_review' ? '#fbbf24'
                                    : '#94a3b8';
                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => router.push(`/policy/${p.id}`)}
                                        className={styles.policyRow}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <div className={styles.policyRowHeader}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-high)' }}>
                                                    {p.policy_number || 'Pending'}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 600,
                                                    padding: '0.15rem 0.5rem',
                                                    borderRadius: '999px',
                                                    background: statusBg,
                                                    color: statusText,
                                                    textTransform: 'uppercase',
                                                }}>
                                                    {p.status?.replace('_', ' ') || 'Unknown'}
                                                </span>
                                            </div>
                                            <ChevronRight size={14} style={{ color: '#475569' }} />
                                        </div>
                                        <div className={styles.policyMetaRow}>
                                            {p.carrier_name && <span>{p.carrier_name}</span>}
                                            {p.property_address_raw && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <MapPin size={11} /> {p.property_address_raw}
                                                </span>
                                            )}
                                            {term?.annual_premium && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <DollarSign size={11} /> ${term.annual_premium.toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                        {term?.expiration_date && (
                                            <div style={{ marginTop: '0.375rem', fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <Clock size={11} /> Renewal: {new Date(term.expiration_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right Column — Client Info */}
                <div className={styles.sidebarColumn}>
                    {/* My Information */}
                    <div style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                    }}>
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Shield size={16} style={{ color: '#818cf8' }} />
                            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-high)' }}>My Information</h2>
                        </div>
                        <div style={{ padding: '0.75rem 1.25rem' }}>
                            <InfoRow icon={Shield} label="Insured" value={client?.named_insured || userName} />
                            <InfoRow icon={Mail} label="Email" value={client?.email || profileEmail || '—'} />
                            <InfoRow icon={Phone} label="Phone" value={client?.phone || profilePhone || '—'} />
                            <InfoRow icon={MapPin} label="Address" value={client?.mailing_address_raw || '—'} />
                            {client?.created_at && (
                                <InfoRow icon={Calendar} label="Client Since" value={
                                    new Date(client.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                                } />
                            )}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '1.25rem',
                    }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-mid)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>Quick Actions</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <ActionButton label="Submit a Declaration" icon={FileText} onClick={() => router.push('/submit')} />
                            <ActionButton label="Account Settings" icon={Settings} onClick={() => router.push('/settings')} />
                        </div>
                    </div>

                    {/* Recent Documents */}
                    {recentDocs.length > 0 && (
                        <div style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-lg)',
                            overflow: 'hidden',
                        }}>
                            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <File size={16} style={{ color: '#818cf8' }} />
                                <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-high)' }}>Recent Documents</h2>
                            </div>
                            <div style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {recentDocs.map((doc, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '0.5rem 0.625rem', borderRadius: '6px',
                                        background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <FileText size={14} style={{ color: 'var(--accent-primary)' }} />
                                            <div>
                                                <div style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-high)' }}>{doc.label}</div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{doc.policyNumber}</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                const key = `${doc.type}-${i}`;
                                                setDownloadingDoc(key);
                                                try {
                                                    if (doc.type === 'dec' && doc.path) {
                                                        const url = await getDecPageFileDownloadUrl(doc.path);
                                                        if (url) window.open(url, '_blank');
                                                    } else if (doc.type === 'report' && doc.reportId) {
                                                        window.open(`/report/${doc.reportId}`, '_blank');
                                                    }
                                                } finally {
                                                    setDownloadingDoc(null);
                                                }
                                            }}
                                            disabled={downloadingDoc === `${doc.type}-${i}`}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                fontSize: '0.7rem', fontWeight: 600, color: 'var(--accent-primary)',
                                                background: 'none', border: 'none', cursor: 'pointer',
                                            }}
                                        >
                                            {downloadingDoc === `${doc.type}-${i}`
                                                ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                                                : doc.type === 'report' ? <FileText size={12} /> : <Download size={12} />}
                                            {doc.type === 'report' ? 'View Report' : 'Download'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Contact Support */}
                    <div style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '1.25rem',
                        textAlign: 'center',
                    }}>
                        <MessageSquare size={20} style={{ color: '#818cf8', marginBottom: '0.5rem' }} />
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-high)', marginBottom: '0.35rem' }}>Need Help?</h3>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-mid)', marginBottom: '0.875rem', lineHeight: 1.4 }}>
                            Questions about your coverage? Our team is here to help.
                        </p>
                        <Button size="sm" variant="outline" onClick={() => setSupportOpen(true)} style={{ width: '100%' }}>
                            <Send size={13} style={{ marginRight: '0.35rem' }} />
                            Contact Support
                        </Button>
                    </div>

                    <SupportModal isOpen={supportOpen} onClose={() => setSupportOpen(false)} clientName={userName} clientEmail={profileEmail} />
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.125rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.875rem',
        }}>
            <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon size={18} style={{ color }} />
            </div>
            <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '0.15rem' }}>{label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-high)' }}>{value}</div>
            </div>
        </div>
    );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div className={styles.infoRow}>
            <Icon size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }} />
            <span className={styles.infoLabel}>{label}</span>
            <span className={styles.infoValue}>{value}</span>
        </div>
    );
}

function ActionButton({ label, icon: Icon, onClick }: { label: string; icon: React.ElementType; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                width: '100%', padding: '0.625rem 0.75rem',
                background: 'var(--bg-surface-raised)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px', cursor: 'pointer',
                color: 'var(--text-mid)', fontSize: '0.8rem', fontWeight: 500,
                transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(99,102,241,0.06)';
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.15)';
                e.currentTarget.style.color = 'var(--accent-primary)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-surface-raised)';
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.color = 'var(--text-mid)';
            }}
        >
            <Icon size={14} />
            <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
            <ArrowRight size={13} style={{ color: 'var(--text-muted)' }} />
        </button>
    );
}
