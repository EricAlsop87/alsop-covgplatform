'use client';

import React, { useState, useEffect, useCallback } from 'react';
import styles from './page.module.scss';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatMessageList } from '@/components/chat/ChatMessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { CreateGroupModal } from '@/components/chat/CreateGroupModal';
import { ChatChannel, ChatMessage, UserPresence, ChatAttachment, ChatPolicyRef } from '@/lib/teamChat';
import { Hash, Users, MessageSquare } from 'lucide-react';

import { supabase } from '@/lib/supabaseClient';

async function getAuthHeader(): Promise<Record<string, string>> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
            return { Authorization: `Bearer ${session.access_token}` };
        }
    } catch (err) {
        console.error('Error retrieving session for chat:', err);
    }
    return {};
}

export default function TeamChatPage() {
    const [channels, setChannels] = useState<ChatChannel[]>([]);
    const [activeChannelId, setActiveChannelId] = useState<string>('general');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [presenceUsers, setPresenceUsers] = useState<UserPresence[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string>('');
    const [showCreateGroup, setShowCreateGroup] = useState<boolean>(false);
    const [loadingMessages, setLoadingMessages] = useState<boolean>(false);

    // Fetch channels and staff metadata
    const fetchChannels = useCallback(async () => {
        try {
            const authHeaders = await getAuthHeader();
            const res = await fetch('/api/chat/channels', { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setChannels(data.channels || []);
                if (data.currentUserId) setCurrentUserId(data.currentUserId);
            }
        } catch (err) {
            console.error('Error loading channels:', err);
        }
    }, []);

    // Fetch presence
    const fetchPresence = useCallback(async () => {
        try {
            const authHeaders = await getAuthHeader();
            const res = await fetch('/api/chat/presence', { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setPresenceUsers(data.users || []);
                if (data.currentUserId) setCurrentUserId(data.currentUserId);
            }
        } catch (err) {
            console.error('Error loading presence:', err);
        }
    }, []);

    // Heartbeat presence
    const sendHeartbeat = useCallback(async () => {
        try {
            const authHeaders = await getAuthHeader();
            await fetch('/api/chat/presence', {
                method: 'POST',
                headers: authHeaders,
            });
        } catch {}
    }, []);

    // Fetch messages for active channel
    const fetchMessages = useCallback(async (channelId: string, showLoader = false) => {
        if (showLoader) setLoadingMessages(true);
        try {
            const authHeaders = await getAuthHeader();
            const res = await fetch(`/api/chat/messages?channel_id=${channelId}`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setMessages(data.messages || []);
            }
        } catch (err) {
            console.error('Error loading messages:', err);
        } finally {
            if (showLoader) setLoadingMessages(false);
        }
    }, []);

    // Initialize
    useEffect(() => {
        fetchChannels();
        fetchPresence();
        sendHeartbeat();

        // Interval polls
        const msgInterval = setInterval(() => {
            fetchMessages(activeChannelId, false);
        }, 3000);

        const presenceInterval = setInterval(() => {
            fetchPresence();
            sendHeartbeat();
        }, 15000);

        return () => {
            clearInterval(msgInterval);
            clearInterval(presenceInterval);
        };
    }, [activeChannelId, fetchChannels, fetchPresence, sendHeartbeat, fetchMessages]);

    // On channel switch
    useEffect(() => {
        fetchMessages(activeChannelId, true);
    }, [activeChannelId, fetchMessages]);

    // Active channel details
    const activeChannel = channels.find(c => c.id === activeChannelId);
    const activeDMUser = activeChannelId.startsWith('dm_') 
        ? presenceUsers.find(u => activeChannelId.includes(u.userId) && u.userId !== currentUserId)
        : null;

    const activeTitle = activeDMUser 
        ? activeDMUser.userName 
        : activeChannel?.name || 'general';

    const activeDesc = activeDMUser 
        ? `Direct message with ${activeDMUser.userName}`
        : activeChannel?.description || 'Team discussion';

    // Send Message Handler
    const handleSendMessage = async (text: string, attachments: ChatAttachment[], policyRef: ChatPolicyRef | null) => {
        try {
            const authHeaders = await getAuthHeader();
            const res = await fetch('/api/chat/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders,
                },
                body: JSON.stringify({
                    channel_id: activeChannelId,
                    text,
                    attachments,
                    policy_ref: policyRef,
                }),
            });

            if (res.ok) {
                const json = await res.json();
                if (json.message) {
                    setMessages(prev => [...prev, json.message]);
                }
            }
        } catch (err) {
            console.error('Error sending message:', err);
        }
    };

    // Toggle Reaction Handler
    const handleToggleReaction = async (messageId: string, emoji: string) => {
        try {
            const authHeaders = await getAuthHeader();
            const res = await fetch('/api/chat/reactions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders,
                },
                body: JSON.stringify({
                    channel_id: activeChannelId,
                    message_id: messageId,
                    emoji,
                }),
            });

            if (res.ok) {
                const json = await res.json();
                setMessages(prev =>
                    prev.map(m => (m.id === messageId ? { ...m, reactions: json.reactions } : m))
                );
            }
        } catch (err) {
            console.error('Error toggling reaction:', err);
        }
    };

    // Start DM
    const handleStartDM = (targetUser: UserPresence) => {
        const dmId = `dm_${[currentUserId, targetUser.userId].sort().join('_')}`;
        setActiveChannelId(dmId);
    };

    // Create Group Chat
    const handleCreateGroup = async (name: string, selectedUserIds: string[], memberNames: string[]) => {
        try {
            const authHeaders = await getAuthHeader();
            const res = await fetch('/api/chat/channels', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders,
                },
                body: JSON.stringify({
                    name,
                    type: 'group',
                    memberIds: selectedUserIds,
                    memberNames,
                }),
            });

            if (res.ok) {
                const json = await res.json();
                if (json.channel) {
                    setChannels(prev => [...prev, json.channel]);
                    setActiveChannelId(json.channel.id);
                }
            }
        } catch (err) {
            console.error('Error creating group chat:', err);
        }
    };

    return (
        <div className={styles.chatPageWrapper}>
            {/* Sidebar */}
            <ChatSidebar
                channels={channels}
                activeChannelId={activeChannelId}
                onSelectChannel={setActiveChannelId}
                presenceUsers={presenceUsers}
                currentUserId={currentUserId}
                onOpenCreateGroup={() => setShowCreateGroup(true)}
                onStartDM={handleStartDM}
            />

            {/* Main Chat Area */}
            <div className={styles.mainChatArea}>
                {/* Header */}
                <div className={styles.chatHeader}>
                    <div className={styles.headerInfo}>
                        <div className={styles.headerTitle}>
                            {activeDMUser ? (
                                <MessageSquare size={16} style={{ color: '#2243B6' }} />
                            ) : activeChannel?.type === 'group' ? (
                                <Users size={16} style={{ color: '#2243B6' }} />
                            ) : (
                                <Hash size={16} style={{ color: '#2243B6' }} />
                            )}
                            <span>{activeTitle}</span>
                        </div>
                        <div className={styles.headerDesc}>{activeDesc}</div>
                    </div>
                </div>

                {/* Message Stream */}
                <ChatMessageList
                    messages={messages}
                    currentUserId={currentUserId}
                    onToggleReaction={handleToggleReaction}
                    channelName={activeTitle}
                />

                {/* Input Bar */}
                <ChatInput
                    onSendMessage={handleSendMessage}
                    channelName={activeTitle}
                />
            </div>

            {/* Create Group Modal */}
            {showCreateGroup && (
                <CreateGroupModal
                    presenceUsers={presenceUsers}
                    currentUserId={currentUserId}
                    onClose={() => setShowCreateGroup(false)}
                    onCreateGroup={handleCreateGroup}
                />
            )}
        </div>
    );
}
