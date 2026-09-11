'use client';

import React, { useState } from 'react';
import styles from './CreateGroupModal.module.scss';
import { UserPresence } from '@/lib/teamChat';
import { X, Users } from 'lucide-react';

interface CreateGroupModalProps {
    presenceUsers: UserPresence[];
    currentUserId: string;
    onClose: () => void;
    onCreateGroup: (name: string, selectedUserIds: string[], memberNames: string[]) => Promise<void>;
}

export function CreateGroupModal({
    presenceUsers,
    currentUserId,
    onClose,
    onCreateGroup,
}: CreateGroupModalProps) {
    const [groupName, setGroupName] = useState('');
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const otherUsers = presenceUsers.filter(u => u.userId !== currentUserId);

    const handleToggleUser = (userId: string) => {
        setSelectedUserIds(prev => 
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const handleCreate = async () => {
        if (!groupName.trim() || selectedUserIds.length === 0) return;
        setSubmitting(true);
        try {
            const memberNames = otherUsers
                .filter(u => selectedUserIds.includes(u.userId))
                .map(u => u.userName);
            await onCreateGroup(groupName.trim(), selectedUserIds, memberNames);
            onClose();
        } catch (err) {
            console.error('Error creating group:', err);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <Users size={16} style={{ color: '#2243B6' }} />
                        <h3>Create New Group Chat</h3>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>

                <div className={styles.body}>
                    <div className={styles.field}>
                        <label>Group Name</label>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder="e.g. October Renewals Squad, Commercial Quoting..."
                            value={groupName}
                            onChange={e => setGroupName(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className={styles.field}>
                        <label>Select Team Members ({selectedUserIds.length} selected)</label>
                        <div className={styles.membersList}>
                            {otherUsers.map(u => {
                                const checked = selectedUserIds.includes(u.userId);
                                return (
                                    <label key={u.userId} className={styles.memberItem}>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => handleToggleUser(u.userId)}
                                        />
                                        <span>{u.userName}</span>
                                        <span style={{ fontSize: '0.6875rem', color: '#64748b', marginLeft: 'auto' }}>
                                            {u.role === 'admin' ? 'Admin' : 'VA'}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className={styles.footer}>
                    <button type="button" className={styles.cancelBtn} onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className={styles.createBtn}
                        onClick={handleCreate}
                        disabled={!groupName.trim() || selectedUserIds.length === 0 || submitting}
                    >
                        {submitting ? 'Creating...' : 'Create Group'}
                    </button>
                </div>
            </div>
        </div>
    );
}
