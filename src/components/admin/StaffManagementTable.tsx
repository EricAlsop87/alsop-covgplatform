'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Shield, Briefcase, Users, UserPlus, Search, RefreshCw,
    CheckCircle2, XCircle, MoreVertical, Edit3, ArrowRightLeft,
    Power, AlertTriangle, Loader2, Check, X, Mail, Phone, Calendar, UserX
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

export interface StaffMember {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    role: 'admin' | 'service' | 'customer';
    is_active: boolean;
    created_at: string;
    updated_at: string;
    last_sign_in_at: string | null;
}

interface StaffManagementTableProps {
    onOpenInvite: () => void;
    currentUserId?: string;
}

export function StaffManagementTable({ onOpenInvite, currentUserId }: StaffManagementTableProps) {
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [stats, setStats] = useState({
        adminCount: 0,
        agentCount: 0,
        inactiveCount: 0,
        clientCount: 0,
        totalStaff: 0,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    
    // View Tab: Default to 'all_active' so deactivated users NEVER remain in the staff view by default
    const [viewTab, setViewTab] = useState<'all_active' | 'admin' | 'service' | 'inactive'>('all_active');

    // Modals / Action States
    const [editingUser, setEditingUser] = useState<StaffMember | null>(null);
    const [roleChangeUser, setRoleChangeUser] = useState<StaffMember | null>(null);
    const [statusChangeUser, setStatusChangeUser] = useState<StaffMember | null>(null);
    const [savingAction, setSavingAction] = useState(false);
    const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Form states for edit modal
    const [editFirstName, setEditFirstName] = useState('');
    const [editLastName, setEditLastName] = useState('');
    const [editPhone, setEditPhone] = useState('');

    const fetchUsers = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                setError('Authentication required');
                setLoading(false);
                return;
            }

            const res = await fetch('/api/admin/users', {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                },
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to fetch staff accounts');
            }

            setStaff(data.staff || []);
            setStats(data.stats || { adminCount: 0, agentCount: 0, inactiveCount: 0, clientCount: 0, totalStaff: 0 });
        } catch (err: any) {
            setError(err.message || 'Error loading staff directory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    // Filtered staff list: strictly filters out inactive users when viewing active staff
    const filteredStaff = useMemo(() => {
        return staff.filter(member => {
            // View / Tab filter
            if (viewTab === 'all_active' && !member.is_active) return false;
            if (viewTab === 'admin' && (!member.is_active || member.role !== 'admin')) return false;
            if (viewTab === 'service' && (!member.is_active || member.role !== 'service')) return false;
            if (viewTab === 'inactive' && member.is_active) return false;

            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
                const email = member.email.toLowerCase();
                const phone = member.phone.toLowerCase();
                if (!fullName.includes(q) && !email.includes(q) && !phone.includes(q)) return false;
            }
            return true;
        });
    }, [staff, viewTab, searchQuery]);

    // Handle Role Change
    const handleConfirmRoleChange = async () => {
        if (!roleChangeUser) return;
        const newRole = roleChangeUser.role === 'admin' ? 'service' : 'admin';
        setSavingAction(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/admin/users/${roleChangeUser.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ role: newRole }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update role');

            setActionFeedback({
                type: 'success',
                message: `Updated ${roleChangeUser.first_name || roleChangeUser.email}'s role to ${newRole === 'admin' ? 'Administrator' : 'Agent'}.`,
            });
            setRoleChangeUser(null);
            fetchUsers();
        } catch (err: any) {
            setActionFeedback({ type: 'error', message: err.message || 'Failed to update role' });
        } finally {
            setSavingAction(false);
            setTimeout(() => setActionFeedback(null), 4000);
        }
    };

    // Handle Status Toggle (Activate / Deactivate)
    const handleConfirmStatusToggle = async () => {
        if (!statusChangeUser) return;
        const newStatus = !statusChangeUser.is_active;
        setSavingAction(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/admin/users/${statusChangeUser.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ is_active: newStatus }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update account status');

            setActionFeedback({
                type: 'success',
                message: newStatus
                    ? `${statusChangeUser.first_name || statusChangeUser.email} has been reactivated and restored to active staff.`
                    : `${statusChangeUser.first_name || statusChangeUser.email} has been deactivated and removed from active staff view.`,
            });
            setStatusChangeUser(null);
            fetchUsers();
        } catch (err: any) {
            setActionFeedback({ type: 'error', message: err.message || 'Failed to update status' });
        } finally {
            setSavingAction(false);
            setTimeout(() => setActionFeedback(null), 4000);
        }
    };

    // Handle Edit Profile
    const handleSaveEdit = async () => {
        if (!editingUser) return;
        setSavingAction(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/admin/users/${editingUser.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                    first_name: editFirstName,
                    last_name: editLastName,
                    phone: editPhone,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update user');

            setActionFeedback({
                type: 'success',
                message: `Updated profile details for ${editFirstName || editingUser.email}.`,
            });
            setEditingUser(null);
            fetchUsers();
        } catch (err: any) {
            setActionFeedback({ type: 'error', message: err.message || 'Failed to update user' });
        } finally {
            setSavingAction(false);
            setTimeout(() => setActionFeedback(null), 4000);
        }
    };

    const openEditModal = (user: StaffMember) => {
        setEditingUser(user);
        setEditFirstName(user.first_name || '');
        setEditLastName(user.last_name || '');
        setEditPhone(user.phone || '');
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Never';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getInitials = (first: string, last: string, email: string) => {
        if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
        if (first) return first.slice(0, 2).toUpperCase();
        if (email) return email.slice(0, 2).toUpperCase();
        return 'U';
    };

    const isDeactivatedView = viewTab === 'inactive';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Feedback Alert */}
            {actionFeedback && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.65rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500,
                    background: actionFeedback.type === 'success' ? 'var(--bg-success-subtle)' : 'var(--bg-error-subtle)',
                    color: actionFeedback.type === 'success' ? 'var(--status-success)' : 'var(--status-error)',
                    border: `1px solid ${actionFeedback.type === 'success' ? 'rgba(43,155,75,0.2)' : 'rgba(191,25,50,0.2)'}`,
                }}>
                    {actionFeedback.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    {actionFeedback.message}
                </div>
            )}

            {/* Metrics Overview Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.875rem' }}>
                {/* Administrators */}
                <div style={{
                    background: 'var(--bg-surface-raised)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '10px', padding: '1rem',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex', flexDirection: 'column', gap: '0.35rem',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Administrators
                        </span>
                        <div style={{
                            width: 28, height: 28, borderRadius: '6px',
                            background: 'var(--accent-secondary-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Shield size={15} style={{ color: 'var(--accent-secondary)' }} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-high)' }}>
                        {loading ? '—' : stats.adminCount}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Active platform administrators
                    </div>
                </div>

                {/* Agents */}
                <div style={{
                    background: 'var(--bg-surface-raised)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '10px', padding: '1rem',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex', flexDirection: 'column', gap: '0.35rem',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Agents
                        </span>
                        <div style={{
                            width: 28, height: 28, borderRadius: '6px',
                            background: 'var(--bg-success-subtle)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Briefcase size={15} style={{ color: 'var(--status-success)' }} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-high)' }}>
                        {loading ? '—' : stats.agentCount}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Active licensed agents
                    </div>
                </div>

                {/* Registered Clients Counter */}
                <div style={{
                    background: 'var(--bg-surface-raised)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '10px', padding: '1rem',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex', flexDirection: 'column', gap: '0.35rem',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Registered Clients
                        </span>
                        <div style={{
                            width: 28, height: 28, borderRadius: '6px',
                            background: 'var(--accent-primary-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Users size={15} style={{ color: 'var(--accent-primary)' }} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-high)' }}>
                        {loading ? '—' : stats.clientCount}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Self-registered portal accounts (no invite required)
                    </div>
                </div>
            </div>

            {/* Directory Controls Bar */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
                gap: '0.75rem', padding: '0.75rem 1rem',
                background: 'var(--bg-surface-raised)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
            }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: '320px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Search by name, email, phone…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%', padding: '0.45rem 0.75rem 0.45rem 2.1rem',
                            fontSize: '0.78rem', color: 'var(--text-high)',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '6px', outline: 'none',
                        }}
                    />
                </div>

                {/* Filters & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {/* View Filter Segmented Pill Bar */}
                    <div style={{
                        display: 'flex', background: 'var(--bg-surface)',
                        padding: '2px', borderRadius: '6px',
                        border: '1px solid var(--border-default)',
                    }}>
                        {[
                            { id: 'all_active', label: `Active Staff (${stats.totalStaff})` },
                            { id: 'admin', label: `Admins (${stats.adminCount})` },
                            { id: 'service', label: `Agents (${stats.agentCount})` },
                            ...(stats.inactiveCount > 0 ? [{ id: 'inactive', label: `Deactivated (${stats.inactiveCount})` }] : []),
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setViewTab(tab.id as any)}
                                style={{
                                    padding: '0.35rem 0.65rem', fontSize: '0.72rem', fontWeight: viewTab === tab.id ? 700 : 500,
                                    color: viewTab === tab.id ? (tab.id === 'inactive' ? 'var(--status-error)' : 'var(--accent-primary)') : 'var(--text-muted)',
                                    background: viewTab === tab.id ? 'var(--bg-surface-raised)' : 'transparent',
                                    border: 'none', borderRadius: '4px', cursor: 'pointer',
                                    boxShadow: viewTab === tab.id ? 'var(--shadow-sm)' : 'none',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Refresh Button */}
                    <button
                        onClick={fetchUsers}
                        disabled={loading}
                        title="Refresh Directory"
                        style={{
                            padding: '0.4rem', borderRadius: '6px',
                            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                            color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                        }}
                    >
                        <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                    </button>

                    {/* Invite Button */}
                    <button
                        onClick={onOpenInvite}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                            padding: '0.45rem 0.85rem', borderRadius: '6px',
                            background: 'var(--accent-primary)', color: 'var(--text-inverse)',
                            border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                            boxShadow: '0 1px 3px rgba(34, 67, 182, 0.25)',
                        }}
                    >
                        <UserPlus size={13} />
                        Invite Staff
                    </button>
                </div>
            </div>

            {/* Staff Directory Table */}
            <div style={{
                background: 'var(--bg-surface-raised)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px', overflow: 'hidden',
                boxShadow: 'var(--shadow-sm)',
            }}>
                {loading && staff.length === 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem', color: 'var(--text-muted)', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        Loading staff directory…
                    </div>
                ) : error ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--status-error)', fontSize: '0.8rem' }}>
                        {error}
                    </div>
                ) : filteredStaff.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {isDeactivatedView
                            ? 'No deactivated accounts.'
                            : 'No active staff members found matching the selected criteria.'}
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)' }}>
                                    <th style={{ padding: '0.65rem 1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Staff Member</th>
                                    <th style={{ padding: '0.65rem 1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Role</th>
                                    <th style={{ padding: '0.65rem 1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
                                    <th style={{ padding: '0.65rem 1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Last Active</th>
                                    <th style={{ padding: '0.65rem 1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Joined</th>
                                    <th style={{ padding: '0.65rem 1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStaff.map((member, idx) => {
                                    const isSelf = member.id === currentUserId;
                                    const fullName = `${member.first_name} ${member.last_name}`.trim() || 'No name set';
                                    const isAdminRole = member.role === 'admin';

                                    return (
                                        <tr
                                            key={member.id}
                                            style={{
                                                borderBottom: idx === filteredStaff.length - 1 ? 'none' : '1px solid var(--border-subtle)',
                                                background: member.is_active ? 'transparent' : 'var(--bg-error-subtle)',
                                                transition: 'background 0.1s',
                                            }}
                                        >
                                            {/* Name & Email */}
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                                    <div style={{
                                                        width: 32, height: 32, borderRadius: '50%',
                                                        background: isAdminRole ? 'var(--accent-secondary-muted)' : 'var(--accent-primary-muted)',
                                                        color: isAdminRole ? 'var(--accent-secondary)' : 'var(--accent-primary)',
                                                        fontWeight: 700, fontSize: '0.72rem',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        flexShrink: 0,
                                                    }}>
                                                        {getInitials(member.first_name, member.last_name, member.email)}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-high)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                            {fullName}
                                                            {isSelf && (
                                                                <span style={{
                                                                    fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px',
                                                                    background: 'var(--accent-primary-muted)', color: 'var(--accent-primary)', fontWeight: 700,
                                                                }}>
                                                                    YOU
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                            {member.email}
                                                        </div>
                                                        {member.phone && (
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '1px' }}>
                                                                <Phone size={10} /> {member.phone}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Role */}
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                    padding: '0.25rem 0.55rem', borderRadius: '5px',
                                                    fontSize: '0.7rem', fontWeight: 600,
                                                    background: isAdminRole ? 'var(--accent-secondary-muted)' : 'var(--bg-success-subtle)',
                                                    color: isAdminRole ? 'var(--accent-secondary)' : 'var(--status-success)',
                                                    border: `1px solid ${isAdminRole ? 'rgba(90,62,133,0.2)' : 'rgba(43,155,75,0.2)'}`,
                                                }}>
                                                    {isAdminRole ? <Shield size={11} /> : <Briefcase size={11} />}
                                                    {isAdminRole ? 'Administrator' : 'Agent'}
                                                </span>
                                            </td>

                                            {/* Status */}
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                    padding: '0.2rem 0.45rem', borderRadius: '4px',
                                                    fontSize: '0.68rem', fontWeight: 600,
                                                    background: member.is_active ? 'var(--bg-success-subtle)' : 'var(--bg-error-subtle)',
                                                    color: member.is_active ? 'var(--status-success)' : 'var(--status-error)',
                                                }}>
                                                    <span style={{
                                                        width: 6, height: 6, borderRadius: '50%',
                                                        background: member.is_active ? 'var(--status-success)' : 'var(--status-error)',
                                                    }} />
                                                    {member.is_active ? 'Active' : 'Deactivated'}
                                                </span>
                                            </td>

                                            {/* Last Active */}
                                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-mid)', fontSize: '0.72rem' }}>
                                                {formatDate(member.last_sign_in_at)}
                                            </td>

                                            {/* Joined */}
                                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                                {formatDate(member.created_at)}
                                            </td>

                                            {/* Actions */}
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    {/* Role Switcher Action (only for active users) */}
                                                    {member.is_active && (
                                                        <button
                                                            onClick={() => setRoleChangeUser(member)}
                                                            disabled={isSelf}
                                                            title={isSelf ? 'Cannot change your own role' : `Switch to ${isAdminRole ? 'Agent' : 'Administrator'}`}
                                                            style={{
                                                                padding: '0.3rem 0.5rem', borderRadius: '5px',
                                                                background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                                                                color: isSelf ? 'var(--text-muted)' : 'var(--text-mid)',
                                                                fontSize: '0.7rem', fontWeight: 500,
                                                                cursor: isSelf ? 'not-allowed' : 'pointer',
                                                                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                            }}
                                                        >
                                                            <ArrowRightLeft size={11} />
                                                            {isAdminRole ? 'Make Agent' : 'Make Admin'}
                                                        </button>
                                                    )}

                                                    {/* Edit Info */}
                                                    <button
                                                        onClick={() => openEditModal(member)}
                                                        title="Edit details"
                                                        style={{
                                                            padding: '0.3rem 0.5rem', borderRadius: '5px',
                                                            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                                                            color: 'var(--text-mid)', cursor: 'pointer',
                                                            display: 'inline-flex', alignItems: 'center',
                                                        }}
                                                    >
                                                        <Edit3 size={11} />
                                                    </button>

                                                    {/* Status Toggle (Deactivate / Reactivate) */}
                                                    <button
                                                        onClick={() => setStatusChangeUser(member)}
                                                        disabled={isSelf}
                                                        title={isSelf ? 'Cannot deactivate yourself' : member.is_active ? 'Deactivate account' : 'Reactivate account'}
                                                        style={{
                                                            padding: '0.3rem 0.55rem', borderRadius: '5px',
                                                            background: member.is_active ? 'var(--bg-surface)' : 'var(--bg-success-subtle)',
                                                            border: `1px solid ${member.is_active ? 'var(--border-default)' : 'rgba(43,155,75,0.3)'}`,
                                                            color: isSelf ? 'var(--text-muted)' : member.is_active ? 'var(--status-error)' : 'var(--status-success)',
                                                            cursor: isSelf ? 'not-allowed' : 'pointer',
                                                            fontSize: '0.7rem', fontWeight: 600,
                                                            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                        }}
                                                    >
                                                        <Power size={11} />
                                                        {member.is_active ? 'Deactivate' : 'Reactivate'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ─── Modal 1: Change Role Confirmation ─── */}
            {roleChangeUser && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                }}>
                    <div style={{
                        background: 'var(--bg-surface-raised)', borderRadius: '10px',
                        border: '1px solid var(--border-strong)', padding: '1.25rem',
                        maxWidth: '420px', width: '100%', boxShadow: 'var(--shadow-overlay)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'var(--accent-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ArrowRightLeft size={16} style={{ color: 'var(--accent-primary)' }} />
                            </div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-high)' }}>Confirm Role Change</h3>
                        </div>

                        <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', lineHeight: 1.5, marginBottom: '1rem' }}>
                            Change role for <strong>{roleChangeUser.first_name} {roleChangeUser.last_name}</strong> ({roleChangeUser.email}) from <strong>{roleChangeUser.role === 'admin' ? 'Administrator' : 'Agent'}</strong> to <strong>{roleChangeUser.role === 'admin' ? 'Agent' : 'Administrator'}</strong>?
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button
                                onClick={() => setRoleChangeUser(null)}
                                disabled={savingAction}
                                style={{
                                    padding: '0.45rem 0.85rem', borderRadius: '6px',
                                    background: 'transparent', border: '1px solid var(--border-default)',
                                    color: 'var(--text-mid)', fontSize: '0.78rem', cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmRoleChange}
                                disabled={savingAction}
                                style={{
                                    padding: '0.45rem 1rem', borderRadius: '6px',
                                    background: 'var(--accent-primary)', color: 'var(--text-inverse)',
                                    border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                                }}
                            >
                                {savingAction && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                                Confirm Role Change
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal 2: Status Change (Deactivate/Reactivate) Confirmation ─── */}
            {statusChangeUser && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                }}>
                    <div style={{
                        background: 'var(--bg-surface-raised)', borderRadius: '10px',
                        border: '1px solid var(--border-strong)', padding: '1.25rem',
                        maxWidth: '420px', width: '100%', boxShadow: 'var(--shadow-overlay)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: '8px',
                                background: statusChangeUser.is_active ? 'var(--bg-error-subtle)' : 'var(--bg-success-subtle)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <Power size={16} style={{ color: statusChangeUser.is_active ? 'var(--status-error)' : 'var(--status-success)' }} />
                            </div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-high)' }}>
                                {statusChangeUser.is_active ? 'Deactivate Staff Account' : 'Reactivate Staff Account'}
                            </h3>
                        </div>

                        <p style={{ fontSize: '0.8rem', color: 'var(--text-mid)', lineHeight: 1.5, marginBottom: '1rem' }}>
                            {statusChangeUser.is_active
                                ? `Are you sure you want to deactivate ${statusChangeUser.first_name || statusChangeUser.email}? They will be removed from the active staff directory and lose dashboard access.`
                                : `Are you sure you want to reactivate ${statusChangeUser.first_name || statusChangeUser.email}? Their account will be restored to the active staff directory.`}
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button
                                onClick={() => setStatusChangeUser(null)}
                                disabled={savingAction}
                                style={{
                                    padding: '0.45rem 0.85rem', borderRadius: '6px',
                                    background: 'transparent', border: '1px solid var(--border-default)',
                                    color: 'var(--text-mid)', fontSize: '0.78rem', cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmStatusToggle}
                                disabled={savingAction}
                                style={{
                                    padding: '0.45rem 1rem', borderRadius: '6px',
                                    background: statusChangeUser.is_active ? 'var(--status-error)' : 'var(--status-success)',
                                    color: '#fff', border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                                }}
                            >
                                {savingAction && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                                {statusChangeUser.is_active ? 'Deactivate & Remove' : 'Reactivate Account'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal 3: Edit User Details ─── */}
            {editingUser && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                }}>
                    <div style={{
                        background: 'var(--bg-surface-raised)', borderRadius: '10px',
                        border: '1px solid var(--border-strong)', padding: '1.25rem',
                        maxWidth: '440px', width: '100%', boxShadow: 'var(--shadow-overlay)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'var(--accent-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Edit3 size={16} style={{ color: 'var(--accent-primary)' }} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-high)' }}>Edit Staff Profile</h3>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{editingUser.email}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => setEditingUser(null)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                        First Name
                                    </label>
                                    <input
                                        type="text"
                                        value={editFirstName}
                                        onChange={e => setEditFirstName(e.target.value)}
                                        placeholder="First name"
                                        style={{
                                            width: '100%', padding: '0.45rem 0.65rem', fontSize: '0.8rem',
                                            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                                            borderRadius: '6px', color: 'var(--text-high)', outline: 'none',
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                        Last Name
                                    </label>
                                    <input
                                        type="text"
                                        value={editLastName}
                                        onChange={e => setEditLastName(e.target.value)}
                                        placeholder="Last name"
                                        style={{
                                            width: '100%', padding: '0.45rem 0.65rem', fontSize: '0.8rem',
                                            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                                            borderRadius: '6px', color: 'var(--text-high)', outline: 'none',
                                        }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                    Phone Number
                                </label>
                                <input
                                    type="tel"
                                    value={editPhone}
                                    onChange={e => setEditPhone(e.target.value)}
                                    placeholder="(555) 000-0000"
                                    style={{
                                        width: '100%', padding: '0.45rem 0.65rem', fontSize: '0.8rem',
                                        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                                        borderRadius: '6px', color: 'var(--text-high)', outline: 'none',
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button
                                onClick={() => setEditingUser(null)}
                                disabled={savingAction}
                                style={{
                                    padding: '0.45rem 0.85rem', borderRadius: '6px',
                                    background: 'transparent', border: '1px solid var(--border-default)',
                                    color: 'var(--text-mid)', fontSize: '0.78rem', cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={savingAction}
                                style={{
                                    padding: '0.45rem 1rem', borderRadius: '6px',
                                    background: 'var(--accent-primary)', color: 'var(--text-inverse)',
                                    border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                                }}
                            >
                                {savingAction && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
