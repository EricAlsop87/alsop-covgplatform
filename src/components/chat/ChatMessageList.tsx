'use client';

import React from 'react';
import styles from './ChatMessageList.module.scss';
import { ChatMessage } from '@/lib/teamChat';
import { FileText, ExternalLink, Eye, CheckCheck } from 'lucide-react';
import Link from 'next/link';

interface ChatMessageListProps {
    messages: ChatMessage[];
    currentUserId: string;
    onToggleReaction: (messageId: string, emoji: string) => void;
    channelName: string;
}

const QUICK_EMOJIS = ['👍', '❤️', '👀', '🔥', '🎉'];

export function ChatMessageList({
    messages,
    currentUserId,
    onToggleReaction,
    channelName,
}: ChatMessageListProps) {
    if (messages.length === 0) {
        return (
            <div className={styles.messageListContainer}>
                <div className={styles.emptyState}>
                    <h4>Welcome to #{channelName}!</h4>
                    <p>This is the start of your team conversation. Send a message, share a policy, or paste a screenshot.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.messageListContainer}>
            {messages.map(msg => {
                const isOwn = msg.senderId === currentUserId;
                const initials = msg.senderName
                    .split(' ')
                    .map(n => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase() || 'U';

                const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                });

                // Compute seen receipt summary
                const seenEntries = Object.entries(msg.seenBy || {}).filter(([uid]) => uid !== msg.senderId);
                const seenText = seenEntries.length > 0 
                    ? `Seen by ${seenEntries.map(([, v]) => v.userName).join(', ')}` 
                    : null;

                return (
                    <div
                        key={msg.id}
                        className={`${styles.messageRow} ${isOwn ? styles.ownMessageRow : ''}`}
                    >
                        {/* Hover Quick Actions */}
                        <div className={styles.actionsToolbar}>
                            {QUICK_EMOJIS.map(emoji => (
                                <button
                                    key={emoji}
                                    type="button"
                                    className={styles.reactionBtn}
                                    onClick={() => onToggleReaction(msg.id, emoji)}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>

                        {!isOwn && (
                            <div className={styles.avatar} title={msg.senderName}>
                                {initials}
                            </div>
                        )}

                        <div className={styles.msgContentWrapper}>
                            <div className={styles.metaInfo}>
                                <span className={styles.senderName}>{msg.senderName}</span>
                                {msg.senderRole && (
                                    <span className={styles.roleTag}>
                                        {msg.senderRole === 'admin' ? 'Admin' : 'VA'}
                                    </span>
                                )}
                                <span>{timeStr}</span>
                            </div>

                            {/* Text Message */}
                            {msg.text && <div className={styles.msgBubble}>{msg.text}</div>}

                            {/* Attachments */}
                            {msg.attachments && msg.attachments.length > 0 && (
                                <div className={styles.attachmentsGrid}>
                                    {msg.attachments.map(att => (
                                        att.isImage ? (
                                            <a key={att.id} href={att.url} target="_blank" rel="noreferrer">
                                                <img src={att.url} alt={att.fileName} className={styles.imagePreview} />
                                            </a>
                                        ) : (
                                            <a key={att.id} href={att.url} target="_blank" rel="noreferrer" className={styles.filePill}>
                                                <FileText size={14} style={{ color: '#2243B6' }} />
                                                <span>{att.fileName}</span>
                                            </a>
                                        )
                                    ))}
                                </div>
                            )}

                            {/* Policy Reference Card */}
                            {msg.policyRef && (
                                <div className={styles.policyCard}>
                                    <div className={styles.policyTitle}>
                                        <span>{msg.policyRef.policyNumber}</span>
                                        <span>• {msg.policyRef.namedInsured}</span>
                                    </div>
                                    {msg.policyRef.propertyAddress && (
                                        <div className={styles.policySub}>
                                            📍 {msg.policyRef.propertyAddress}
                                        </div>
                                    )}
                                    <Link
                                        href={`/policy/${msg.policyRef.policyId}`}
                                        className={styles.policyLink}
                                        target="_blank"
                                    >
                                        <span>View Policy Details</span>
                                        <ExternalLink size={11} />
                                    </Link>
                                </div>
                            )}

                            {/* Emoji Reactions Bar */}
                            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                <div className={styles.reactionsList}>
                                    {Object.entries(msg.reactions).map(([emoji, users]) => {
                                        const hasReacted = users.includes(currentUserId);
                                        return (
                                            <button
                                                key={emoji}
                                                type="button"
                                                className={`${styles.reactionPill} ${hasReacted ? styles.hasReacted : ''}`}
                                                onClick={() => onToggleReaction(msg.id, emoji)}
                                                title={`Reacted by ${users.length} person(s)`}
                                            >
                                                <span>{emoji}</span>
                                                <span>{users.length}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Seen Receipt Indicator */}
                            {isOwn && seenText && (
                                <div className={styles.seenReceipt} title={seenText}>
                                    <Eye size={11} style={{ color: '#64748b' }} />
                                    <span>{seenEntries.length} seen</span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
