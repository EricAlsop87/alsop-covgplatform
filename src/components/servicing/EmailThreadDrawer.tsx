'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    MessageSquare,
    Send,
    X,
    CheckCircle2,
    XCircle,
    RotateCcw,
    FileText,
    ArrowDownLeft,
    ArrowUpRight,
    Loader2,
    FlaskConical,
    User,
    Mail,
    Clock,
} from 'lucide-react';
import styles from './EmailThreadDrawer.module.scss';
import { ServicingThreadMessage } from '@/lib/servicingEmailThreads';

export interface EmailThreadDrawerItem {
    policy_id: string;
    policy_number: string;
    named_insured?: string;
    property_address?: string;
    carrier_name?: string;
    assigned_agent?: string;
    assigned_agent_email?: string | null;
    [key: string]: any;
}

interface EmailThreadDrawerProps {
    item: EmailThreadDrawerItem;
    onClose: () => void;
    onStatusChange?: (status: string) => void;
}

export function EmailThreadDrawer({ item, onClose, onStatusChange }: EmailThreadDrawerProps) {
    const [messages, setMessages] = useState<ServicingThreadMessage[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [simReplyText, setSimReplyText] = useState<string>('Client approved the renewal, please proceed with bind.');
    const [simulating, setSimulating] = useState<boolean>(false);

    // Fetch thread messages
    const fetchThread = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/servicing-email/thread?policy_id=${item.policy_id}`);
            if (res.ok) {
                const data = await res.json();
                setMessages(data.messages || []);
                // Mark thread as read
                fetch('/api/servicing-email/thread', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ policy_id: item.policy_id }),
                }).catch(() => {});
            }
        } catch (err) {
            console.error('Error loading thread:', err);
        } finally {
            setLoading(false);
        }
    }, [item.policy_id]);

    useEffect(() => {
        fetchThread();
    }, [fetchThread]);

    // Simulate Agent Reply (for local testing)
    const handleSimulateReply = async () => {
        if (!simReplyText.trim()) return;
        setSimulating(true);
        try {
            const res = await fetch('/api/email/inbound', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    isSimulation: true,
                    policy_id: item.policy_id,
                    sender_name: item.assigned_agent || 'Alex Clancy',
                    sender_email: 'alexclancy@allstate.com',
                    reply_text: simReplyText,
                }),
            });

            if (res.ok) {
                setSimReplyText('');
                await fetchThread();
            }
        } catch (err) {
            console.error('Error simulating reply:', err);
        } finally {
            setSimulating(false);
        }
    };

    return (
        <div className={styles.drawerOverlay} onClick={onClose}>
            <div className={styles.drawer} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerInfo}>
                        <h3 className={styles.title}>
                            <MessageSquare size={18} style={{ color: 'var(--color-primary, #2243B6)' }} />
                            Renewal Communication Thread
                        </h3>
                        <p className={styles.subTitle}>
                            Policy #{item.policy_number} • {item.named_insured}
                        </p>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Body / Message History */}
                <div className={styles.body}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b', fontSize: '0.8125rem' }}>
                            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                            Loading message thread...
                        </div>
                    ) : messages.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94a3b8' }}>
                            <Mail size={36} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
                            <div style={{ fontWeight: 600, color: '#475569', fontSize: '0.875rem' }}>No emails dispatched yet</div>
                            <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                                Use the &quot;Send Email&quot; button to send the renewal package to the assigned agent.
                            </div>
                        </div>
                    ) : (
                        messages.map(msg => {
                            const isOutbound = msg.direction === 'outbound';
                            const dateFormatted = new Date(msg.sentAt).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                            });

                            return (
                                <div
                                    key={msg.id}
                                    className={`${styles.messageCard} ${
                                        isOutbound ? styles.outbound : styles.inbound
                                    }`}
                                >
                                    <div className={styles.msgTop}>
                                        <span className={styles.senderBadge}>
                                            {isOutbound ? (
                                                <>
                                                    <ArrowUpRight size={13} style={{ color: '#2243B6' }} />
                                                    <span><strong>Sent by:</strong> {msg.senderName} ({msg.senderEmail || 'alsopva02@gmail.com'})</span>
                                                </>
                                            ) : (
                                                <>
                                                    <ArrowDownLeft size={13} style={{ color: '#10b981' }} />
                                                    <span style={{ color: '#065f46' }}><strong>Reply from:</strong> {msg.senderName} ({msg.senderEmail || 'Manager'})</span>
                                                </>
                                            )}
                                        </span>
                                        <span className={styles.msgTime}>{dateFormatted}</span>
                                    </div>

                                    {/* Outbound To / CC info */}
                                    {isOutbound && (
                                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginBottom: '8px', lineHeight: '1.4' }}>
                                            <div><strong>To:</strong> {msg.recipientName || msg.recipientEmail || 'Nancy Maldonado, Olga Soto'}</div>
                                            {msg.ccEmail && <div><strong>CC:</strong> {msg.ccEmail}</div>}
                                        </div>
                                    )}

                                    <div className={styles.msgBody} style={{ whiteSpace: 'pre-wrap' }}>
                                        {msg.bodyText}
                                    </div>

                                    {msg.attachments && msg.attachments.length > 0 && (
                                        <div className={styles.attachmentList} style={{ marginTop: '10px' }}>
                                            {msg.attachments.map((att: any, idx: number) => (
                                                <span key={idx} className={styles.attachmentPill} style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                                    <FileText size={12} style={{ color: '#2563eb' }} />
                                                    <span>{att.name}</span>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}

                    {/* Quick Log Manager Reply Box */}
                    <div className={styles.simBox} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                        <div className={styles.simTitle} style={{ fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Mail size={14} style={{ color: '#2563eb' }} />
                            <span>Log Inbound Reply from Manager</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                            <input
                                type="text"
                                className={styles.simInput}
                                placeholder="Paste or type manager reply here (e.g. Approved to bind Bamboo)..."
                                value={simReplyText}
                                onChange={e => setSimReplyText(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <button
                                type="button"
                                className={styles.simBtn}
                                onClick={handleSimulateReply}
                                disabled={simulating || !simReplyText.trim()}
                                style={{ background: '#2563eb', color: '#fff', padding: '0 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}
                            >
                                {simulating ? 'Logging...' : 'Log Reply'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className={styles.footer}>
                    <div style={{ display: 'flex', gap: '0.45rem' }}>
                        <button
                            type="button"
                            className={styles.actionBtnComplete}
                            onClick={() => {
                                onStatusChange?.('completed');
                                onClose();
                            }}
                        >
                            <CheckCircle2 size={13} /> Mark as Bound / Completed
                        </button>
                        <button
                            type="button"
                            className={styles.actionBtnNotProceed}
                            onClick={() => {
                                onStatusChange?.('will_not_proceed');
                                onClose();
                            }}
                        >
                            <XCircle size={13} /> Will Not Proceed
                        </button>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
