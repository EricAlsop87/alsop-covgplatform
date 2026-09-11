'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './ChatMessageList.module.scss';
import { ChatMessage, ChatAttachment } from '@/lib/teamChat';
import { FileText, ExternalLink, Eye, Download, Maximize2, X } from 'lucide-react';
import Link from 'next/link';

interface ChatMessageListProps {
    messages: ChatMessage[];
    currentUserId: string;
    onToggleReaction: (messageId: string, emoji: string) => void;
    channelName: string;
}

const QUICK_EMOJIS = ['👍', '❤️', '👀', '🔥', '🎉'];

function formatBytes(bytes?: number): string {
    if (!bytes || bytes === 0) return '';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function checkIsImage(att: ChatAttachment): boolean {
    if (att.isImage) return true;
    if (att.fileType?.startsWith('image/')) return true;
    if (att.url?.startsWith('data:image/')) return true;
    return /\.(jpe?g|png|gif|webp|svg|bmp)$/i.test(att.fileName || '');
}

export function ChatMessageList({
    messages,
    currentUserId,
    onToggleReaction,
    channelName,
}: ChatMessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const [previewImage, setPreviewImage] = useState<{ url: string; fileName: string } | null>(null);

    // Automatically scroll to the latest message at bottom
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Close preview on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setPreviewImage(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleDownload = async (e: React.MouseEvent, url: string, fileName: string) => {
        e.stopPropagation();
        e.preventDefault();
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = fileName || 'download';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch {
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName || 'download';
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const isChannel = channelName.startsWith('#') || channelName === 'general' || channelName.includes('renewals') || channelName.includes('operations');
    const formattedTitle = channelName.startsWith('#') ? channelName : (isChannel ? `#${channelName}` : channelName);

    return (
        <div className={styles.messageListContainer}>
            {/* Start / Welcome Banner inside the scroll stream */}
            <div className={styles.welcomeBanner}>
                <h4>{isChannel ? `Welcome to ${formattedTitle}!` : `Direct conversation with ${formattedTitle}`}</h4>
                <p>This is the start of your {isChannel ? 'channel discussion' : 'direct message history'}. Send a message, share a policy, or paste a screenshot.</p>
            </div>

            {messages.map((msg, index) => {
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
                        key={msg.id || index}
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
                                <span>{timeStr}</span>
                            </div>

                            {/* Text Message */}
                            {msg.text && <div className={styles.msgBubble}>{msg.text}</div>}

                            {/* Attachments & Images */}
                            {msg.attachments && msg.attachments.length > 0 && (
                                <div className={styles.attachmentsGrid}>
                                    {msg.attachments.map(att => {
                                        const isImg = checkIsImage(att);
                                        return isImg ? (
                                            <div key={att.id} className={styles.imageCard}>
                                                <img
                                                    src={att.url}
                                                    alt={att.fileName}
                                                    className={styles.imagePreview}
                                                    onClick={() => setPreviewImage({ url: att.url, fileName: att.fileName })}
                                                />
                                                <div className={styles.imageActionsOverlay}>
                                                    <button
                                                        type="button"
                                                        className={styles.imageActionBtn}
                                                        onClick={() => setPreviewImage({ url: att.url, fileName: att.fileName })}
                                                        title="View Full Size"
                                                    >
                                                        <Maximize2 size={12} />
                                                        <span>View</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.imageActionBtn}
                                                        onClick={(e) => handleDownload(e, att.url, att.fileName)}
                                                        title="Download Image"
                                                    >
                                                        <Download size={12} />
                                                        <span>Download</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div key={att.id} className={styles.filePillCard}>
                                                <a
                                                    href={att.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className={styles.filePillLink}
                                                    title="Open File"
                                                >
                                                    <FileText size={16} style={{ color: '#2243B6', flexShrink: 0 }} />
                                                    <div className={styles.fileMeta}>
                                                        <span className={styles.fileNameText}>{att.fileName}</span>
                                                        {att.fileSize ? (
                                                            <span className={styles.fileSizeText}>{formatBytes(att.fileSize)}</span>
                                                        ) : null}
                                                    </div>
                                                </a>
                                                <button
                                                    type="button"
                                                    className={styles.downloadIconBtn}
                                                    onClick={(e) => handleDownload(e, att.url, att.fileName)}
                                                    title={`Download ${att.fileName}`}
                                                >
                                                    <Download size={14} />
                                                </button>
                                            </div>
                                        );
                                    })}
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
            <div ref={bottomRef} style={{ height: 1 }} />

            {/* Lightbox Modal for Image Fullscreen Viewing & Downloading */}
            {previewImage && (
                <div className={styles.lightboxOverlay} onClick={() => setPreviewImage(null)}>
                    <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.lightboxHeader}>
                            <span className={styles.lightboxTitle}>{previewImage.fileName || 'Image Preview'}</span>
                            <div className={styles.lightboxActions}>
                                <button
                                    type="button"
                                    className={styles.lightboxBtn}
                                    onClick={(e) => handleDownload(e, previewImage.url, previewImage.fileName)}
                                    title="Download Image"
                                >
                                    <Download size={15} />
                                    <span>Download</span>
                                </button>
                                <button
                                    type="button"
                                    className={styles.lightboxCloseBtn}
                                    onClick={() => setPreviewImage(null)}
                                    title="Close Preview"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        <div className={styles.lightboxBody}>
                            <img src={previewImage.url} alt={previewImage.fileName} className={styles.lightboxImg} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
