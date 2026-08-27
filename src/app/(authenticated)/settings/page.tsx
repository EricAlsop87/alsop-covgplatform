'use client';

import React, { useState, useEffect } from 'react';
import { getUserProfile, UserProfile, isAdmin } from '@/lib/auth';
import { supabase } from '@/lib/supabaseClient';
import { useSidebar } from '@/components/layout/SidebarContext';
import {
    Settings as SettingsIcon, User, Bell, Palette, Shield, ChevronRight,
    Mail, Key, Monitor, Globe, Database, Lock, Loader2, Satellite, FileText,
    UserPlus, CheckCircle2, AlertTriangle, ShieldAlert, ShieldCheck, RefreshCw, Map, Eye
} from 'lucide-react';
import DataSourcesCatalog from '@/components/settings/DataSourcesCatalog';
import { InviteUserModal } from '@/components/admin/InviteUserModal';
import { StaffManagementTable } from '@/components/admin/StaffManagementTable';
import { useTheme } from 'next-themes';
import Link from 'next/link';

type Section = 'account' | 'notifications' | 'display' | 'admin' | 'data_sources' | 'report_editor' | 'email_system' | 'user_management';

const SECTIONS = [
    { id: 'account' as Section, label: 'Account', icon: User, description: 'Name, email, password' },
    { id: 'notifications' as Section, label: 'Notifications', icon: Bell, description: 'Email & alert preferences', agentOnly: true },
    { id: 'display' as Section, label: 'Display', icon: Palette, description: 'Theme & layout preferences', agentOnly: true },
    { id: 'data_sources' as Section, label: 'Data Sources', icon: Satellite, description: 'Enrichment pipeline catalog', agentOnly: true },
    { id: 'report_editor' as Section, label: 'Report Editor', icon: FileText, description: 'Report template & section controls', adminOnly: true },
    { id: 'email_system' as Section, label: 'Email System', icon: Mail, description: 'Safe mode, status & templates', adminOnly: true },
    { id: 'user_management' as Section, label: 'User Management', icon: UserPlus, description: 'Invite & manage platform users', adminOnly: true },
    { id: 'admin' as Section, label: 'Admin Settings', icon: Shield, description: 'Branding, integrations, global config', adminOnly: true },
];

export default function SettingsPage() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState<Section>('account');
    const { isMobile } = useSidebar();

    useEffect(() => {
        getUserProfile().then(p => {
            setProfile(p);
            setLoading(false);
        });
    }, []);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-primary)' }} />
            </div>
        );
    }

    const showAdmin = profile && isAdmin(profile.role);

    return (
        <div style={{ maxWidth: activeSection === 'data_sources' || activeSection === 'report_editor' || activeSection === 'user_management' ? '1200px' : '900px', margin: isMobile ? '1rem auto' : '2rem auto', padding: isMobile ? '0 0.5rem' : '0 1.5rem', transition: 'max-width 0.3s ease' }}>
            {/* Header */}
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-high)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <SettingsIcon size={22} style={{ color: 'var(--accent-primary)' }} />
                    Settings
                </h1>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Manage your preferences and account configuration</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px 1fr', gap: isMobile ? '0.75rem' : '1.25rem', minHeight: isMobile ? 'auto' : '500px' }}>
                {/* Left nav — horizontal scroll on mobile, vertical sidebar on desktop */}
                <nav style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '0.5rem',
                    height: 'fit-content',
                    ...(isMobile ? {
                        display: 'flex',
                        overflowX: 'auto',
                        gap: '0.25rem',
                        WebkitOverflowScrolling: 'touch',
                        scrollbarWidth: 'none',
                    } : {}),
                }}>
                    {SECTIONS.map(s => {
                        if (s.adminOnly && !showAdmin) return null;
                        if ((s as any).agentOnly && !showAdmin && profile?.role === 'customer') return null;
                        const Icon = s.icon;
                        const isActive = activeSection === s.id;
                        return (
                            <button
                                key={s.id}
                                onClick={() => setActiveSection(s.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    width: isMobile ? 'auto' : '100%',
                                    padding: isMobile ? '0.5rem 0.75rem' : '0.625rem 0.75rem',
                                    border: 'none',
                                    borderRadius: '6px',
                                    background: isActive ? 'var(--accent-primary-muted)' : 'transparent',
                                    color: isActive ? 'var(--accent-primary)' : 'var(--text-mid)',
                                    fontSize: '0.8rem',
                                    fontWeight: isActive ? 600 : 500,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'all 0.15s',
                                    marginBottom: isMobile ? '0' : '0.125rem',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                }}
                            >
                                <Icon size={15} />
                                <span style={{ flex: 1 }}>{s.label}</span>
                                {isActive && <ChevronRight size={13} style={{ color: 'var(--accent-primary)' }} />}
                            </button>
                        );
                    })}
                </nav>

                {/* Right content */}
                <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.5rem',
                }}>
                    {activeSection === 'account' && <AccountSection profile={profile} />}
                    {activeSection === 'notifications' && <NotificationsSection />}
                    {activeSection === 'display' && <DisplaySection />}
                    {activeSection === 'data_sources' && <DataSourcesCatalog />}
                    {activeSection === 'report_editor' && <ReportEditorSection />}
                    {activeSection === 'email_system' && <EmailSystemSection />}
                    {activeSection === 'user_management' && <UserManagementSection profile={profile} />}
                    {activeSection === 'admin' && <AdminSection />}
                </div>
            </div>
        </div>
    );
}

// ─── Account Section (full inline editing) ─────────────────────
function AccountSection({ profile }: { profile: UserProfile | null }) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const isAgent = profile?.role === 'admin' || profile?.role === 'service';
    const [editFirst, setEditFirst] = useState(profile?.first_name || '');
    const [editLast, setEditLast] = useState(profile?.last_name || '');
    const [editEmail, setEditEmail] = useState(profile?.email || '');
    const [editPhone, setEditPhone] = useState(profile?.phone || '');

    // Password state
    const [changingPw, setChangingPw] = useState(false);
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [pwSaving, setPwSaving] = useState(false);
    const [pwMsg, setPwMsg] = useState('');

    const handleSave = async () => {
        if (!profile) return;
        setSaving(true);
        setSaveMsg('');

        const { error } = await supabase
            .from('accounts')
            .update({
                first_name: editFirst.trim(),
                last_name: editLast.trim(),
                phone: editPhone.trim(),
                email: editEmail.trim(),
            })
            .eq('id', profile.id);

        if (error) {
            setSaveMsg('Failed to save. Please try again.');
            setSaving(false);
            setTimeout(() => setSaveMsg(''), 3000);
            return;
        }

        if (editEmail.trim() !== profile.email) {
            const { error: authErr } = await supabase.auth.updateUser({ email: editEmail.trim() });
            if (authErr) {
                setSaveMsg('Saved, but email change failed: ' + authErr.message);
            } else {
                setSaveMsg('Saved! Check your new email for a confirmation link.');
            }
        } else {
            setSaveMsg('Account updated!');
        }
        setEditing(false);
        setSaving(false);
        setTimeout(() => setSaveMsg(''), 5000);
    };

    const handleCancel = () => {
        setEditFirst(profile?.first_name || '');
        setEditLast(profile?.last_name || '');
        setEditEmail(profile?.email || '');
        setEditPhone(profile?.phone || '');
        setEditing(false);
    };

    const handlePasswordChange = async () => {
        setPwMsg('');
        if (newPw.length < 6) {
            setPwMsg('error:Password must be at least 6 characters.');
            return;
        }
        if (newPw !== confirmPw) {
            setPwMsg('error:Passwords do not match.');
            return;
        }
        setPwSaving(true);
        try {
            // Force a session refresh before updating — prevents "auth session missing"
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) {
                // Try to refresh the token explicitly
                const { error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError) {
                    setPwMsg('error:Your session has expired. Please sign out and sign back in, then try again.');
                    return;
                }
            }

            const { error } = await supabase.auth.updateUser({ password: newPw });
            if (error) {
                setPwMsg('error:' + error.message);
            } else {
                setPwMsg('success:Password updated successfully!');
                setNewPw('');
                setConfirmPw('');
                setChangingPw(false);
            }
        } catch {
            setPwMsg('error:An unexpected error occurred. Please try again.');
        } finally {
            setPwSaving(false);
            setTimeout(() => setPwMsg(''), 6000);
        }
    };

    const inputStyle: React.CSSProperties = {
        background: 'var(--bg-surface-raised)',
        border: '1px solid var(--border-default)',
        borderRadius: '6px',
        padding: '0.4rem 0.6rem',
        fontSize: '0.8rem',
        color: 'var(--text-high)',
        width: '100%',
        maxWidth: '240px',
        outline: 'none',
    };

    const pwIsError = pwMsg.startsWith('error:');
    const pwMsgText = pwMsg.replace(/^(error:|success:)/, '');

    return (
        <div>
            <SectionHeader title="Account" description="Your personal and security settings" />

            {/* Save/error message */}
            {saveMsg && (
                <div style={{
                    padding: '0.5rem 0.75rem', fontSize: '0.78rem', fontWeight: 500, borderRadius: '6px', marginBottom: '1rem',
                    color: saveMsg.includes('Failed') ? 'var(--status-error)' : 'var(--status-success)',
                    background: saveMsg.includes('Failed') ? 'var(--bg-error-subtle)' : 'var(--bg-success-subtle)',
                }}>
                    {saveMsg}
                </div>
            )}

            <SettingGroup title="Personal Information" icon={User}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.375rem 0.875rem 0' }}>
                    {!editing ? (
                        <button onClick={() => setEditing(true)} style={{
                            fontSize: '0.72rem', color: 'var(--accent-primary)', background: 'none',
                            border: 'none', fontWeight: 500, cursor: 'pointer',
                        }}>
                            Edit
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={handleSave} disabled={saving} style={{
                                fontSize: '0.72rem', color: 'var(--status-success)', background: 'none',
                                border: 'none', fontWeight: 600, cursor: 'pointer',
                            }}>
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={handleCancel} style={{
                                fontSize: '0.72rem', color: 'var(--text-muted)', background: 'none',
                                border: 'none', fontWeight: 500, cursor: 'pointer',
                            }}>
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
                {editing ? (
                    <>
                        {isAgent ? (
                            <>
                                <EditableRow label="First Name" value={editFirst} onChange={setEditFirst} inputStyle={inputStyle} />
                                <EditableRow label="Last Name" value={editLast} onChange={setEditLast} inputStyle={inputStyle} />
                            </>
                        ) : (
                            <>
                                <SettingRow label="First Name" value={editFirst || '—'} note="Contact support to change" />
                                <SettingRow label="Last Name" value={editLast || '—'} note="Contact support to change" />
                            </>
                        )}
                        <EditableRow label="Email" value={editEmail} onChange={setEditEmail} inputStyle={inputStyle} type="email" />
                        <EditableRow label="Phone" value={editPhone} onChange={setEditPhone} inputStyle={inputStyle} type="tel" />
                    </>
                ) : (
                    <>
                        <SettingRow label="Display Name" value={profile ? `${profile.first_name} ${profile.last_name}` : '—'} />
                        <SettingRow label="Email" value={profile?.email || '—'} />
                        <SettingRow label="Phone" value={profile?.phone || 'Not set'} />
                    </>
                )}
            </SettingGroup>

            <SettingGroup title="Security" icon={Key}>
                {/* Password status message — shown OUTSIDE the form so it persists after form closes */}
                {pwMsgText && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.625rem 0.875rem',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        borderBottom: '1px solid var(--border-subtle)',
                        color: pwIsError ? 'var(--status-error)' : 'var(--status-success)',
                        background: pwIsError ? 'var(--bg-error-subtle)' : 'var(--bg-success-subtle)',
                    }}>
                        {pwIsError ? '✗' : '✓'} {pwMsgText}
                    </div>
                )}
                {changingPw ? (
                    <div style={{ padding: '0.875rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center',
                                gap: '0.75rem',
                            }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-high)', fontWeight: 500, width: '160px', flexShrink: 0 }}>New Password</span>
                                <div style={{ position: 'relative', width: '100%', maxWidth: '240px' }}>
                                    <input
                                        type="password"
                                        value={newPw}
                                        onChange={(e) => setNewPw(e.target.value)}
                                        placeholder="Min. 6 characters"
                                        style={inputStyle}
                                        autoComplete="new-password"
                                        autoFocus
                                    />
                                </div>
                            </div>
                            {/* Strength hint */}
                            {newPw.length > 0 && newPw.length < 6 && (
                                <div style={{ paddingLeft: '160px', fontSize: '0.72rem', color: 'var(--accent-warning, #f59e0b)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    ⚠ At least 6 characters required ({newPw.length}/6)
                                </div>
                            )}
                            <div style={{
                                display: 'flex', alignItems: 'center',
                                gap: '0.75rem',
                            }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-high)', fontWeight: 500, width: '160px', flexShrink: 0 }}>Confirm</span>
                                <div style={{ position: 'relative', width: '100%', maxWidth: '240px' }}>
                                    <input
                                        type="password"
                                        value={confirmPw}
                                        onChange={(e) => setConfirmPw(e.target.value)}
                                        placeholder="Re-enter new password"
                                        style={inputStyle}
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>
                            {/* Match validation */}
                            {confirmPw.length > 0 && (
                                <div style={{
                                    paddingLeft: '160px', fontSize: '0.72rem',
                                    color: newPw === confirmPw ? 'var(--status-success)' : 'var(--status-error)',
                                    display: 'flex', alignItems: 'center', gap: '0.25rem',
                                }}>
                                    {newPw === confirmPw ? '✓ Passwords match' : '✗ Passwords do not match'}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '0.625rem', paddingLeft: '160px', paddingTop: '0.25rem' }}>
                                <button
                                    onClick={handlePasswordChange}
                                    disabled={pwSaving || newPw.length < 6 || newPw !== confirmPw}
                                    style={{
                                        fontSize: '0.78rem',
                                        color: '#fff',
                                        background: (pwSaving || newPw.length < 6 || newPw !== confirmPw) ? 'var(--text-muted)' : 'var(--accent-primary)',
                                        border: 'none',
                                        fontWeight: 600,
                                        cursor: (pwSaving || newPw.length < 6 || newPw !== confirmPw) ? 'not-allowed' : 'pointer',
                                        padding: '0.4rem 1rem',
                                        borderRadius: '6px',
                                        opacity: (pwSaving || newPw.length < 6 || newPw !== confirmPw) ? 0.5 : 1,
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.375rem',
                                    }}
                                >
                                    {pwSaving && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                                    {pwSaving ? 'Saving...' : 'Save Password'}
                                </button>
                                <button onClick={() => { setChangingPw(false); setNewPw(''); setConfirmPw(''); setPwMsg(''); }} style={{
                                    fontSize: '0.78rem', color: 'var(--text-muted)', background: 'none',
                                    border: '1px solid var(--border-default)', fontWeight: 500, cursor: 'pointer',
                                    padding: '0.4rem 0.875rem', borderRadius: '6px',
                                }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <SettingRow label="Password" value="••••••••" actionLabel="Change" onAction={() => setChangingPw(true)} />
                )}
                <SettingRow label="Two-Factor Auth" value="Not enabled" actionLabel="Enable" placeholder />
                <SettingRow label="Active Sessions" value="1 active session" note="Current session" />
            </SettingGroup>

            {isAgent && (
                <SettingGroup title="Email Signature" icon={Mail}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.5rem 0.875rem' }}>
                        Configure your email signature for outbound communications. <em>Coming soon.</em>
                    </div>
                </SettingGroup>
            )}

            <div style={{
                padding: '0.625rem 0.75rem', fontSize: '0.72rem', color: 'var(--text-muted)',
                background: 'var(--bg-info-subtle)', border: '1px solid var(--border-default)',
                borderRadius: '8px', marginTop: '0.5rem',
            }}>
                <strong>Security:</strong> Email changes require confirmation via a link sent to your new address.
            </div>
        </div>
    );
}

// ─── Notifications Section ───────────────────────────────────
function NotificationsSection() {
    return (
        <div>
            <SectionHeader title="Notifications" description="Control how and when you receive alerts" />

            <div style={{
                padding: '0.75rem 1rem',
                background: 'var(--bg-info-subtle)',
                border: '1px solid rgba(0,181,190,0.2)',
                borderLeft: '3px solid var(--status-info)',
                borderRadius: '8px',
                marginBottom: '1.25rem',
                fontSize: '0.75rem',
                color: 'var(--text-mid)',
            }}>
                ⏳ <strong>Coming soon.</strong> Notification preferences will be persisted once the preferences system is live.
            </div>

            <SettingGroup title="Email Notifications" icon={Mail}>
                <ToggleRow label="Flag Alerts" description="Get emailed when new high priority flags are created" defaultOn />
                <ToggleRow label="Renewal Reminders" description="Get reminded about upcoming policy renewals" defaultOn />
                <ToggleRow label="System Updates" description="Receive platform news and feature updates" />
            </SettingGroup>

            <SettingGroup title="In-App Notifications" icon={Bell}>
                <ToggleRow label="Desktop Notifications" description="Browser push notifications for urgent items" />
                <ToggleRow label="Dashboard Alerts" description="Show alert banners on the dashboard" defaultOn />
            </SettingGroup>
        </div>
    );
}

// ─── Display Section ─────────────────────────────────────────
function DisplaySection() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <div>
            <SectionHeader title="Display & Preferences" description="Customize your workspace appearance and defaults" />

            <SettingGroup title="Theme" icon={Monitor}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.875rem 1rem',
                    borderBottom: '1px solid var(--border-subtle)',
                }}>
                    <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-high)', marginBottom: '0.125rem' }}>Appearance</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Select your preferred platform theme</div>
                    </div>
                    {mounted ? (
                        <select 
                            value={theme}
                            onChange={(e) => setTheme(e.target.value)}
                            style={{
                                padding: '0.4rem 2rem 0.4rem 0.75rem',
                                fontSize: '0.8rem',
                                color: 'var(--text-high)',
                                background: 'var(--bg-surface-raised)',
                                border: '1px solid var(--border-default)',
                                borderRadius: '6px',
                                outline: 'none',
                                cursor: 'pointer',
                                appearance: 'none',
                                backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="%238b8b9e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>')`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 0.5rem center',
                                backgroundSize: '1em',
                            }}
                        >
                            <option value="system">System Default</option>
                            <option value="light">Light (Warm Enterprise)</option>
                            <option value="dark">Dark Mode</option>
                        </select>
                    ) : (
                        <div style={{ width: '140px', height: '32px', background: 'var(--bg-surface-raised)', borderRadius: '6px', opacity: 0.5 }} />
                    )}
                </div>
                <SettingRow label="Sidebar" value="Auto-collapse" note="Adjusts based on screen width" />
            </SettingGroup>

            <SettingGroup title="Dashboard Defaults" icon={Globe}>
                <SettingRow label="Default Tab" value="Policy Table" actionLabel="Change" placeholder />
                <SettingRow label="Rows Per Page" value="10" actionLabel="Change" placeholder />
                <SettingRow label="Default Date Range" value="14 days" actionLabel="Change" placeholder />
            </SettingGroup>
        </div>
    );
}

// ─── Admin Section ───────────────────────────────────────────
function AdminSection() {
    return (
        <div>
            <SectionHeader title="Admin Settings" description="Platform-wide configuration (admin only)" />

            <div style={{
                padding: '0.75rem 1rem',
                background: 'var(--bg-error-subtle)',
                border: '1px solid rgba(191,25,50,0.12)',
                borderRadius: '8px',
                marginBottom: '1.25rem',
                fontSize: '0.75rem',
                color: 'var(--status-error)',
            }}>
                ⚠️ Changes in this section affect all users. Proceed with care.
            </div>

            <SettingGroup title="Branding" icon={Palette}>
                <SettingRow label="Company Name" value="Alsop and Associates Insurance Agency" actionLabel="Edit" placeholder />
                <SettingRow label="Logo" value="CoverageCheckNow shield" actionLabel="Upload" placeholder />
                <SettingRow label="Primary Color" value="#2243B6" actionLabel="Change" placeholder />
            </SettingGroup>

            <SettingGroup title="Integrations" icon={Database}>
                <SettingRow label="Email Provider" value="Postmark" note="redirect mode — safe test" />
                <SettingRow label="Data Source / API" value="Supabase" note="Managed internally" />
                <SettingRow label="Document Storage" value="Supabase Storage" note="Managed internally" />
            </SettingGroup>

            <SettingGroup title="Policies & Retention" icon={Lock}>
                <SettingRow label="Data Retention" value="Indefinite" actionLabel="Configure" placeholder />
                <SettingRow label="Privacy Settings" value="Default" actionLabel="Configure" placeholder />
                <SettingRow label="Office Defaults" value="Auto-assign" actionLabel="Configure" placeholder />
            </SettingGroup>
        </div>
    );
}

// ─── Email System Section ─────────────────────────────────────
function EmailSystemSection() {
    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [testSending, setTestSending] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);

    const loadStatus = () => {
        setLoading(true);
        fetch('/api/email/status')
            .then(r => r.json())
            .then(d => { setStatus(d); setLoading(false); })
            .catch(() => setLoading(false));
    };

    useEffect(() => { loadStatus(); }, []);

    const handleTestSend = async () => {
        setTestSending(true);
        setTestResult(null);
        try {
            const res = await fetch('/api/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: 'test@coveragechecknow.com',
                    subject: '[CFP Platform] Email System Test',
                    htmlBody: '<p>This is a system test email from the CFP Platform Settings page.</p>',
                }),
            });
            const data = await res.json();
            if (res.ok) {
                const delivered = data.forceRedirected ? status?.forceRedirectTarget : data.redirectedFrom ? status?.redirectTarget : 'recipient';
                setTestResult(`✓ Test sent — delivered to ${delivered || 'redirect target'}`);
            } else {
                setTestResult(`✗ Failed: ${data.error}`);
            }
        } catch (e: any) {
            setTestResult(`✗ Error: ${e.message}`);
        } finally {
            setTestSending(false);
        }
    };

    const modeConfig = {
        disabled: { color: '#f87171', icon: ShieldAlert, label: 'Disabled — Emails not sent', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)' },
        redirect: { color: '#fbbf24', icon: Shield, label: 'Redirect Mode — Safe Testing', bg: 'rgba(234,179,8,0.06)', border: 'rgba(234,179,8,0.25)' },
        live: { color: '#4ade80', icon: ShieldCheck, label: 'Live — Real Client Delivery', bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.2)' },
    };
    const mode = status?.mode || 'disabled';
    const mc = modeConfig[mode as keyof typeof modeConfig] || modeConfig.disabled;
    const ModeIcon = mc.icon;

    return (
        <div>
            <SectionHeader title="Email System" description="Postmark configuration, safe mode status, and template registry" />

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', padding: '1rem 0', fontSize: '0.8rem' }}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Loading email system status…
                </div>
            ) : (
                <>
                    {/* Status Card */}
                    <div style={{
                        padding: '1rem', borderRadius: '10px', marginBottom: '1.25rem',
                        background: mc.bg, border: `1.5px solid ${mc.border}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ModeIcon size={16} style={{ color: mc.color }} />
                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: mc.color }}>{mc.label}</span>
                            </div>
                            <button onClick={loadStatus} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', padding: 2 }}>
                                <RefreshCw size={13} />
                            </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            <div>Force Redirect: <strong style={{ color: status?.forceRedirectEnabled ? '#fbbf24' : '#64748b' }}>{status?.forceRedirectEnabled ? 'ENABLED' : 'Disabled'}</strong></div>
                            <div>Postmark: <strong style={{ color: status?.postmarkConfigured ? '#4ade80' : '#f87171' }}>{status?.postmarkConfigured ? 'Configured ✓' : 'Not configured'}</strong></div>
                            {status?.forceRedirectTarget && <div>Force Target: <strong style={{ color: '#fbbf24', fontFamily: 'monospace' }}>{status.forceRedirectTarget}</strong></div>}
                            {status?.redirectTarget && <div>Redirect Target: <strong style={{ color: '#fbbf24', fontFamily: 'monospace' }}>{status.redirectTarget}</strong></div>}
                            <div>From: <strong style={{ color: 'var(--text-high)' }}>{status?.fromDefault}</strong></div>
                            <div>Reply-To: <strong style={{ color: 'var(--text-high)' }}>{status?.replyToDefault}</strong></div>
                        </div>
                    </div>

                    {/* Config Instructions */}
                    <div style={{ padding: '0.75rem', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        <strong style={{ color: 'var(--text-high)' }}>To change delivery mode:</strong> Set <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0 4px', borderRadius: '3px' }}>EMAIL_SEND_MODE</code> and <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0 4px', borderRadius: '3px' }}>EMAIL_FORCE_REDIRECT_ENABLED</code> in your <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0 4px', borderRadius: '3px' }}>.env.local</code> file, then restart the server.<br />
                        <strong style={{ color: '#f87171' }}>Do not</strong> set <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0 4px', borderRadius: '3px' }}>EMAIL_SEND_MODE=live</code> until Postmark domain is verified and safe mode is explicitly authorized.
                    </div>

                    {/* Test Send */}
                    <SettingGroup title="Test Actions" icon={Mail}>
                        <div style={{ padding: '0.75rem 0.875rem' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Send a test email to verify Postmark connectivity. It will be redirected to <strong style={{ color: 'var(--status-warning)' }}>{status?.forceRedirectTarget || status?.redirectTarget || 'redirect target'}</strong>.
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <button
                                    onClick={handleTestSend}
                                    disabled={testSending}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                                        padding: '0.4rem 0.875rem', borderRadius: '6px',
                                        background: testSending ? 'var(--accent-primary-muted)' : 'var(--accent-primary)',
                                        color: testSending ? 'var(--accent-primary)' : '#fff',
                                        border: 'none',
                                        cursor: testSending ? 'not-allowed' : 'pointer',
                                        fontSize: '0.75rem', fontWeight: 600,
                                        opacity: testSending ? 0.7 : 1,
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {testSending ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={12} />}
                                    {testSending ? 'Sending…' : 'Send Test Email'}
                                </button>
                                {testResult && (
                                    <span style={{ fontSize: '0.72rem', color: testResult.startsWith('✓') ? 'var(--status-success)' : 'var(--status-error)' }}>
                                        {testResult}
                                    </span>
                                )}
                            </div>
                        </div>
                    </SettingGroup>

                    {/* Template Registry */}
                    <SettingGroup title={`Template Registry (${status?.templates?.length || 0})`} icon={FileText}>
                        {(status?.templates || []).map((t: any) => (
                            <SettingRow
                                key={t.id}
                                label={t.name}
                                value={t.description}
                                note={`${t.variables?.length || 0} vars`}
                            />
                        ))}
                    </SettingGroup>
                </>
            )}
        </div>
    );
}

// ─── User Management Section ──────────────────────────────────
function UserManagementSection({ profile }: { profile: UserProfile | null }) {
    const [showInvite, setShowInvite] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <div>
            <SectionHeader
                title="User Management"
                description="Directory, roles, and access management for platform staff (admin only)"
            />

            <StaffManagementTable
                key={refreshKey}
                currentUserId={profile?.id}
                onOpenInvite={() => setShowInvite(true)}
            />

            <InviteUserModal
                isOpen={showInvite}
                onClose={() => setShowInvite(false)}
                onSuccess={() => {
                    setRefreshKey(prev => prev + 1);
                }}
            />
        </div>
    );
}

// ─── Shared Components ───────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description: string }) {
    return (
        <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-default)' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-high)', marginBottom: '0.25rem' }}>{title}</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{description}</p>
        </div>
    );
}

function SettingGroup({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
                <Icon size={14} style={{ color: 'var(--accent-secondary)' }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-mid)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</span>
            </div>
            <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                overflow: 'hidden',
            }}>
                {children}
            </div>
        </div>
    );
}

function SettingRow({ label, value, note, actionLabel, actionHref, placeholder, onAction }: {
    label: string;
    value: React.ReactNode;
    note?: string;
    actionLabel?: string;
    actionHref?: string;
    placeholder?: boolean;
    onAction?: () => void;
}) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.625rem 0.875rem',
            borderBottom: '1px solid var(--border-subtle)',
            gap: '0.75rem',
        }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-high)', fontWeight: 500, width: '160px', flexShrink: 0 }}>{label}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-mid)', flex: 1 }}>
                {value}
                {note && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginLeft: '0.5rem' }}>({note})</span>}
            </span>
            {actionLabel && (
                actionHref ? (
                    <a href={actionHref} style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>{actionLabel}</a>
                ) : (
                    <button onClick={onAction} style={{
                        fontSize: '0.72rem',
                        color: placeholder ? 'var(--text-muted)' : 'var(--accent-primary)',
                        background: 'none',
                        border: 'none',
                        fontWeight: 500,
                        cursor: placeholder ? 'default' : 'pointer',
                        opacity: placeholder ? 0.6 : 1,
                        flexShrink: 0,
                    }}>
                        {actionLabel} {placeholder && <span style={{ fontSize: '0.65rem' }}>soon</span>}
                    </button>
                )
            )}
        </div>
    );
}

function EditableRow({ label, value, onChange, inputStyle, type = 'text' }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    inputStyle: React.CSSProperties;
    type?: string;
}) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.5rem 0.875rem',
            borderBottom: '1px solid var(--border-subtle)',
            gap: '0.75rem',
        }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-high)', fontWeight: 500, width: '160px', flexShrink: 0 }}>{label}</span>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={inputStyle}
            />
        </div>
    );
}

function ToggleRow({ label, description, defaultOn }: { label: string; description: string; defaultOn?: boolean }) {
    const [on, setOn] = useState(defaultOn || false);
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.625rem 0.875rem',
            borderBottom: '1px solid var(--border-subtle)',
            gap: '0.75rem',
        }}>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-high)', fontWeight: 500, marginBottom: '0.15rem' }}>{label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{description}</div>
            </div>
            <button
                onClick={() => setOn(!on)}
                style={{
                    width: '36px',
                    height: '20px',
                    borderRadius: '10px',
                    background: on ? 'var(--accent-primary)' : 'var(--bg-surface-raised)',
                    border: '1px solid ' + (on ? 'var(--accent-primary-hover)' : 'var(--border-default)'),
                    padding: '2px',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                }}
            >
                <div style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: on ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.2s',
                    transform: on ? 'translateX(16px)' : 'translateX(0)',
                }} />
            </button>
        </div>
    );
}

// ─── Report Editor Section ──────────────────────────────────────
interface ReportSectionConfig {
    id: string;
    label: string;
    description: string;
    enabled: boolean;
    order: number;
}

const DEFAULT_REPORT_SECTIONS: ReportSectionConfig[] = [
    { id: 'executive_summary', label: 'Executive Summary', description: '2-4 sentence overview of findings and risk posture.', enabled: true, order: 0 },
    { id: 'key_findings', label: 'Key Findings', description: 'Top 3-5 concerns sorted by priority.', enabled: true, order: 1 },
    { id: 'coverage_review', label: 'Coverage Review', description: 'Compact table of coverage lines with limits and adequacy status.', enabled: true, order: 2 },
    { id: 'next_steps', label: 'Next Steps', description: 'Merged recommendations, action items, and data gaps by urgency.', enabled: true, order: 3 },
    { id: 'sources', label: 'Sources & Credits', description: 'Named data sources used in the analysis.', enabled: true, order: 4 },
];

function ReportEditorSection() {
    const [sections, setSections] = useState<ReportSectionConfig[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('report_template_config');
            if (saved) try { return JSON.parse(saved); } catch { /* ignore */ }
        }
        return DEFAULT_REPORT_SECTIONS;
    });
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [draggedId, setDraggedId] = useState<string | null>(null);

    const handleSave = () => {
        localStorage.setItem('report_template_config', JSON.stringify(sections));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    const handleDragOver = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) return;
        setSections(prev => {
            const copy = [...prev];
            const fromIdx = copy.findIndex(s => s.id === draggedId);
            const toIdx = copy.findIndex(s => s.id === targetId);
            if (fromIdx === -1 || toIdx === -1) return prev;
            const [removed] = copy.splice(fromIdx, 1);
            copy.splice(toIdx, 0, removed);
            return copy.map((s, i) => ({ ...s, order: i }));
        });
    };

    const activeSections = sections.filter(s => s.enabled);

    const eyeOn = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
    const eyeOff = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
    const grip = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>;

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-high)', marginBottom: '0.15rem' }}>Report Template Editor</h2>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Control which sections appear in client-facing reports, tone, and flag rules.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <Link
                        href="/settings/report-editor"
                        style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--accent-primary)',
                            color: '#fff',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                        }}
                    >
                        Open Full Report Editor →
                    </Link>
                </div>
            </div>

            {/* Summary */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {[
                    { count: activeSections.length, label: 'Active' },
                    { count: sections.length - activeSections.length, label: 'Hidden' },
                ].map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '0.35rem 0.65rem' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-high)' }}>{s.count}</span>
                        <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{s.label}</span>
                    </div>
                ))}
            </div>

            {/* Agent note */}
            <div style={{
                background: 'var(--bg-info-subtle)', border: '1px solid rgba(0,181,190,0.2)',
                borderLeft: '3px solid var(--status-info)', borderRadius: 'var(--radius-md)',
                padding: '0.55rem 0.75rem', fontSize: '0.75rem', color: 'var(--text-mid)',
                lineHeight: 1.5, marginBottom: '1rem',
            }}>
                <strong style={{ color: 'var(--text-high)' }}>Note:</strong> Agent-only insights (property observations, data gaps, AI notes) are shown automatically in the{' '}
                <em style={{ fontStyle: 'normal', fontWeight: 600, color: 'var(--accent-primary)' }}>Agent Action Items</em>{' '}
                panel on the policy page. They are never included in client reports.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.25rem' }}>
                {/* Section cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {sections.map(section => (
                        <div
                            key={section.id}
                            draggable
                            onDragStart={() => setDraggedId(section.id)}
                            onDragOver={(e) => handleDragOver(e, section.id)}
                            onDragEnd={() => setDraggedId(null)}
                            style={{
                                background: 'var(--bg-surface-raised)',
                                border: `1px solid ${draggedId === section.id ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                                borderRadius: 'var(--radius-lg)',
                                opacity: section.enabled ? 1 : 0.4,
                                transition: 'all 0.15s',
                                cursor: 'grab',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.75rem' }}>
                                <span style={{ color: 'var(--text-muted)', cursor: 'grab', flexShrink: 0 }}>{grip}</span>
                                <span onClick={() => setExpandedId(expandedId === section.id ? null : section.id)} style={{ flex: 1, fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-high)', cursor: 'pointer' }}>{section.label}</span>

                                {/* Toggle */}
                                <button
                                    onClick={() => setSections(prev => prev.map(s => s.id === section.id ? { ...s, enabled: !s.enabled } : s))}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: '28px', height: '28px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', cursor: 'pointer',
                                        background: section.enabled ? 'var(--bg-success-subtle)' : 'transparent',
                                        color: section.enabled ? 'var(--status-success)' : 'var(--text-muted)',
                                    }}
                                >
                                    {section.enabled ? eyeOn : eyeOff}
                                </button>
                            </div>

                            {expandedId === section.id && (
                                <div style={{ padding: '0 0.75rem 0.5rem 2.4rem' }}>
                                    <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{section.description}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Preview */}
                <div style={{ position: 'sticky', top: '1.5rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>Template Preview</div>
                    <div style={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.5rem', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border-subtle)' }}>
                            <div style={{ width: '18px', height: '18px', borderRadius: 'var(--radius-xs)', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', color: 'var(--text-inverse)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.35rem', fontWeight: 800 }}>CCN</div>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-high)' }}>Coverage Analysis Report</span>
                        </div>
                        {activeSections.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.68rem', color: 'var(--text-muted)' }}>No sections enabled.</div>
                        ) : (
                            activeSections.map(s => (
                                <div key={s.id} style={{ marginBottom: '0.4rem' }}>
                                    <div style={{ fontSize: '0.45rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-primary)', marginBottom: '0.12rem' }}>{s.label}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.12rem' }}>
                                        <div style={{ height: '5px', background: 'var(--border-subtle)', borderRadius: '2px', width: '88%' }} />
                                        <div style={{ height: '5px', background: 'var(--border-subtle)', borderRadius: '2px', width: '65%' }} />
                                    </div>
                                </div>
                            ))
                        )}
                        <div style={{ marginTop: '0.4rem', paddingTop: '0.25rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.42rem', fontWeight: 700, color: 'var(--accent-primary)', textAlign: 'center' }}>CoverageCheckNow</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
