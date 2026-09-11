'use client';

import React, { useState, useRef, useEffect } from 'react';
import styles from './ChatInput.module.scss';
import { ChatAttachment, ChatPolicyRef } from '@/lib/teamChat';
import { Send, Paperclip, Smile, X, Bookmark, Loader2 } from 'lucide-react';

interface ChatInputProps {
    onSendMessage: (text: string, attachments: ChatAttachment[], policyRef: ChatPolicyRef | null) => Promise<void>;
    channelName: string;
}

const EMOJIS = ['👍', '❤️', '👀', '🔥', '🎉', '🚀', '👏', '✨', '💯', '🙏', '✅', '⚠️', '⭐', '🤝', '💡'];

export function ChatInput({ onSendMessage, channelName }: ChatInputProps) {
    const [text, setText] = useState('');
    const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
    const [selectedPolicy, setSelectedPolicy] = useState<ChatPolicyRef | null>(null);
    const [uploading, setUploading] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showPolicyPicker, setShowPolicyPicker] = useState(false);
    const [policySearch, setPolicySearch] = useState('');
    const [policyResults, setPolicyResults] = useState<any[]>([]);
    const [isSearchingPolicies, setIsSearchingPolicies] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Clipboard screenshot paste listener
    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    await uploadFile(blob, true);
                }
            }
        }
    };

    const uploadFile = async (file: File, isClipboard = false) => {
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            if (isClipboard) formData.append('is_clipboard', 'true');

            const res = await fetch('/api/chat/upload', {
                method: 'POST',
                body: formData,
            });

            if (res.ok) {
                const json = await res.json();
                if (json.attachment) {
                    setAttachments(prev => [...prev, json.attachment]);
                }
            }
        } catch (err) {
            console.error('Upload error:', err);
        } finally {
            setUploading(false);
        }
    };

    const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        for (let i = 0; i < files.length; i++) {
            await uploadFile(files[i]);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Policy search debouncer
    useEffect(() => {
        if (!policySearch || policySearch.length < 2) {
            setPolicyResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsSearchingPolicies(true);
            try {
                const res = await fetch(`/api/cfp-summary?search=${encodeURIComponent(policySearch)}`);
                if (res.ok) {
                    const json = await res.json();
                    const list: any[] = [];
                    (json.families || []).forEach((f: any) => {
                        (f.terms || []).forEach((t: any) => list.push(t));
                    });
                    setPolicyResults(list.slice(0, 5));
                }
            } catch (err) {
                console.error('Error searching policies:', err);
            } finally {
                setIsSearchingPolicies(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [policySearch]);

    const handleSend = async () => {
        if (!text.trim() && attachments.length === 0 && !selectedPolicy) return;
        const sendText = text;
        const sendAtts = attachments;
        const sendPol = selectedPolicy;

        setText('');
        setAttachments([]);
        setSelectedPolicy(null);

        await onSendMessage(sendText, sendAtts, sendPol);
    };

    return (
        <div className={styles.inputContainer}>
            {/* Policy Reference Tagged */}
            {selectedPolicy && (
                <div className={styles.pendingAttachmentPills}>
                    <div className={styles.attachmentThumb}>
                        <Bookmark size={12} />
                        <span>Policy: {selectedPolicy.policyNumber} ({selectedPolicy.namedInsured})</span>
                        <button type="button" className={styles.removeAttBtn} onClick={() => setSelectedPolicy(null)}>
                            <X size={12} />
                        </button>
                    </div>
                </div>
            )}

            {/* Pending Attachments */}
            {attachments.length > 0 && (
                <div className={styles.pendingAttachmentPills}>
                    {attachments.map((att, idx) => (
                        <div key={idx} className={styles.attachmentThumb}>
                            <span>{att.isImage ? '📷' : '📄'} {att.fileName}</span>
                            <button
                                type="button"
                                className={styles.removeAttBtn}
                                onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Policy Picker Popup */}
            {showPolicyPicker && (
                <div className={styles.policyPickerPopup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>Tag Policy to Chat</span>
                        <button type="button" className={styles.iconBtn} onClick={() => setShowPolicyPicker(false)}>
                            <X size={12} />
                        </button>
                    </div>
                    <input
                        type="text"
                        className={styles.policyPickerSearch}
                        placeholder="Search policy # or insured..."
                        value={policySearch}
                        onChange={e => setPolicySearch(e.target.value)}
                        autoFocus
                    />
                    {isSearchingPolicies ? (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', padding: '0.4rem' }}>Searching...</div>
                    ) : policyResults.length > 0 ? (
                        policyResults.map((p, i) => (
                            <div
                                key={i}
                                className={styles.policyPickerItem}
                                onClick={() => {
                                    setSelectedPolicy({
                                        policyId: p.policy_id,
                                        policyNumber: p.policy_number,
                                        namedInsured: p.named_insured,
                                        propertyAddress: p.property_address,
                                        annualPremium: p.annual_premium,
                                        effectiveDate: p.effective_date,
                                        expirationDate: p.expiration_date,
                                    });
                                    setShowPolicyPicker(false);
                                }}
                            >
                                <strong>{p.policy_number}</strong> • {p.named_insured}
                            </div>
                        ))
                    ) : (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', padding: '0.4rem' }}>
                            {policySearch ? 'No policies found' : 'Type to search policies'}
                        </div>
                    )}
                </div>
            )}

            {/* Emoji Picker Popup */}
            {showEmojiPicker && (
                <div className={styles.emojiPickerPopup}>
                    {EMOJIS.map(emoji => (
                        <button
                            key={emoji}
                            type="button"
                            className={styles.emojiOption}
                            onClick={() => {
                                setText(prev => prev + emoji);
                                setShowEmojiPicker(false);
                            }}
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            )}

            <div className={styles.inputWrapper}>
                <textarea
                    ref={textareaRef}
                    rows={1}
                    className={styles.textarea}
                    placeholder={`Message #${channelName} (paste screenshots with Ctrl+V)...`}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onPaste={handlePaste}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                />

                <div className={styles.actionBtns}>
                    <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => setShowPolicyPicker(prev => !prev)}
                        title="Tag a Policy in Chat"
                    >
                        <Bookmark size={16} />
                    </button>

                    <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach File or Screenshot"
                        disabled={uploading}
                    >
                        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                    </button>

                    <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => setShowEmojiPicker(prev => !prev)}
                        title="Add Emoji"
                    >
                        <Smile size={16} />
                    </button>

                    <input
                        ref={fileInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        multiple
                        onChange={handleFileInputChange}
                    />

                    <button
                        type="button"
                        className={styles.sendBtn}
                        onClick={handleSend}
                        disabled={!text.trim() && attachments.length === 0 && !selectedPolicy}
                    >
                        <Send size={13} />
                        <span>Send</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
