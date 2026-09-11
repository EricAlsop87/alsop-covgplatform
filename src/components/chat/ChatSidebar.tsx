'use client';

import React, { useState } from 'react';
import styles from './ChatSidebar.module.scss';
import { ChatChannel, UserPresence } from '@/lib/teamChat';
import { Hash, Users, Plus, Search, MessageSquare, ShieldCheck, User } from 'lucide-react';

interface ChatSidebarProps {
    channels: ChatChannel[];
    activeChannelId: string;
    onSelectChannel: (channelId: string) => void;
    presenceUsers: UserPresence[];
    currentUserId: string;
    onOpenCreateGroup: () => void;
    onStartDM: (targetUser: UserPresence) => void;
}

export function ChatSidebar({
    channels,
    activeChannelId,
    onSelectChannel,
    presenceUsers,
    currentUserId,
    onOpenCreateGroup,
    onStartDM,
}: ChatSidebarProps) {
    const [searchQuery, setSearchQuery] = useState('');

    const publicChannels = channels.filter(c => c.type === 'channel');
    const groupChats = channels.filter(c => c.type === 'group');

    // Other staff members for 1-on-1 DMs
    const otherUsers = presenceUsers.filter(u => u.userId !== currentUserId);

    const filteredChannels = publicChannels.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredGroups = groupChats.filter(g => 
        g.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredUsers = otherUsers.filter(u => 
        u.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.userEmail.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getStatusClass = (status: 'online' | 'away' | 'offline') => {
        if (status === 'online') return styles.statusOnline;
        if (status === 'away') return styles.statusAway;
        return styles.statusOffline;
    };

    return (
        <div className={styles.sidebar}>
            {/* Quick Search */}
            <div className={styles.searchBox}>
                <div className={styles.searchInputWrapper}>
                    <Search size={14} style={{ color: '#94a3b8' }} />
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Search channels, groups, team..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className={styles.scrollArea}>
                {/* 1. Public Team Channels */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span>Channels</span>
                    </div>
                    {filteredChannels.length === 0 ? (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '0.2rem 0.65rem' }}>
                            {searchQuery ? 'No matching channels' : 'No channels'}
                        </div>
                    ) : (
                        filteredChannels.map(ch => {
                            const isActive = activeChannelId === ch.id;
                            return (
                                <button
                                    key={ch.id}
                                    type="button"
                                    className={`${styles.itemBtn} ${styles.channelBtn} ${isActive ? styles.activeItem : ''}`}
                                    onClick={() => onSelectChannel(ch.id)}
                                    title={ch.description ? `#${ch.name} — ${ch.description}` : `#${ch.name}`}
                                >
                                    <Hash size={15} className={styles.channelIcon} />
                                    <div className={styles.channelTextCol}>
                                        <span className={styles.itemName}>{ch.name}</span>
                                        {ch.description && (
                                            <span className={styles.channelDescSnippet}>{ch.description}</span>
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* 2. Custom Group Chats */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span>Group Chats</span>
                        <button
                            type="button"
                            className={styles.addBtn}
                            onClick={onOpenCreateGroup}
                            title="Create new Group Chat"
                        >
                            <Plus size={13} />
                        </button>
                    </div>
                    {filteredGroups.length === 0 ? (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '0.2rem 0.65rem' }}>
                            {searchQuery ? 'No matching group chats' : 'No active group chats'}
                        </div>
                    ) : (
                        filteredGroups.map(grp => {
                            const isActive = activeChannelId === grp.id;
                            const memberSummary = (grp.memberNames || []).join(', ');
                            return (
                                <button
                                    key={grp.id}
                                    type="button"
                                    className={`${styles.itemBtn} ${styles.channelBtn} ${isActive ? styles.activeItem : ''}`}
                                    onClick={() => onSelectChannel(grp.id)}
                                    title={memberSummary ? `${grp.name} (${memberSummary})` : grp.name}
                                >
                                    <Users size={14} className={styles.channelIcon} />
                                    <div className={styles.channelTextCol}>
                                        <span className={styles.itemName}>{grp.name}</span>
                                        {memberSummary && (
                                            <span className={styles.channelDescSnippet}>{memberSummary}</span>
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* 3. Direct Messages (Team Members) */}
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span>Direct Messages</span>
                    </div>
                    {filteredUsers.length === 0 ? (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '0.2rem 0.65rem' }}>
                            {searchQuery ? 'No matching team members' : 'Loading team members...'}
                        </div>
                    ) : (
                        filteredUsers.map(u => {
                            const dmId = `dm_${[currentUserId || 'self', u.userId].sort().join('_')}`;
                            const isActive = activeChannelId === dmId;
                            const initials = u.userName
                                .split(' ')
                                .map(n => n[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase() || 'U';

                            return (
                                <button
                                    key={u.userId}
                                    type="button"
                                    className={`${styles.itemBtn} ${isActive ? styles.activeItem : ''}`}
                                    onClick={() => onStartDM(u)}
                                >
                                    <div className={styles.avatarWrapper}>
                                        <div className={styles.avatar}>{initials}</div>
                                        <div className={`${styles.statusDot} ${getStatusClass(u.status)}`} />
                                    </div>
                                    <span className={styles.itemName}>{u.userName}</span>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
