'use client';

import React, { useState, useMemo } from 'react';
import {
    Send,
    X,
    FileText,
    Check,
    AlertCircle,
    Loader2,
    Eye,
    Edit3,
    User,
    Mail,
    Building2,
    CheckCircle2,
} from 'lucide-react';
import styles from './SendToAgentModal.module.scss';
import { ServicingEmailItem } from '@/lib/servicingEmail';
import { getActiveAgents, CompanyAgent, findAgentByName } from '@/lib/agentsDirectory';

interface SendToAgentModalProps {
    item: ServicingEmailItem;
    onClose: () => void;
    onSuccess: (updatedItem: any) => void;
}

export function SendToAgentModal({ item, onClose, onSuccess }: SendToAgentModalProps) {
    const agents = useMemo(() => getActiveAgents(), []);

    // Initial agent selection
    const initialAgent = useMemo(() => {
        if (item.assigned_agent) {
            const found = findAgentByName(item.assigned_agent);
            if (found) return found;
        }
        return agents[0] || null;
    }, [item.assigned_agent, agents]);

    const [selectedAgentEmail, setSelectedAgentEmail] = useState<string>(
        initialAgent?.email || ''
    );
    const [senderName, setSenderName] = useState<string>('Danicah');
    const [customRemarks, setCustomRemarks] = useState<string>(item.notes || '');

    // Attachment selections
    const [includeQuote, setIncludeQuote] = useState<boolean>(item.has_es);
    const [includeRce, setIncludeRce] = useState<boolean>(item.has_rce);
    const [includeDic, setIncludeDic] = useState<boolean>(
        item.has_dic && !item.no_dic_available
    );

    const [activeTab, setActiveTab] = useState<'compose' | 'preview'>('compose');
    const [sending, setSending] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const currentAgent = useMemo(() => {
        return agents.find(a => a.email.toLowerCase() === selectedAgentEmail.toLowerCase()) || null;
    }, [agents, selectedAgentEmail]);

    const handleSend = async () => {
        if (!selectedAgentEmail) {
            setErrorMsg('Please select an agent to dispatch this renewal email.');
            return;
        }

        setSending(true);
        setErrorMsg(null);

        try {
            const res = await fetch('/api/servicing-email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    policy_id: item.policy_id,
                    agent_name: currentAgent?.fullName || currentAgent?.nickname || 'Agent',
                    agent_email: selectedAgentEmail,
                    sender_name: senderName,
                    custom_remarks: customRemarks,
                    include_quote: includeQuote,
                    include_rce: includeRce,
                    include_dic: includeDic,
                }),
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to dispatch email to agent');
            }

            onSuccess(data);
            onClose();
        } catch (err: any) {
            setErrorMsg(err.message || 'Error dispatching email');
        } finally {
            setSending(false);
        }
    };

    const docCount = [includeQuote, includeRce, includeDic].filter(Boolean).length;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div>
                        <div className={styles.headerTitle}>
                            <Send size={18} style={{ color: 'var(--color-primary, #2243B6)' }} />
                            <h3>Dispatch Renewal Package to Agent</h3>
                        </div>
                        <div className={styles.headerSub}>
                            {item.policy_number} • {item.named_insured}
                        </div>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className={styles.tabsRow}>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${activeTab === 'compose' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('compose')}
                    >
                        <Edit3 size={13} /> Compose & Attachments
                    </button>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${activeTab === 'preview' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('preview')}
                    >
                        <Eye size={13} /> Live Preview
                    </button>
                </div>

                {/* Body */}
                <div className={styles.body}>
                    {errorMsg && (
                        <div
                            style={{
                                padding: '0.65rem 0.85rem',
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: '6px',
                                color: '#b91c1c',
                                fontSize: '0.8125rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                            }}
                        >
                            <AlertCircle size={14} />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {activeTab === 'compose' ? (
                        <>
                            {/* Agent Selector */}
                            <div className={styles.formGroup}>
                                <div className={styles.label}>
                                    <span>Recipient Agent</span>
                                    <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                                        {agents.length} Company Agents Loaded
                                    </span>
                                </div>
                                <select
                                    className={styles.selectAgent}
                                    value={selectedAgentEmail}
                                    onChange={e => setSelectedAgentEmail(e.target.value)}
                                >
                                    {/* Group by team */}
                                    {['CSR', 'EA', 'Sales', 'Managers', 'Support'].map(team => {
                                        const teamMembers = agents.filter(a => a.team === team);
                                        if (teamMembers.length === 0) return null;
                                        return (
                                            <optgroup key={team} label={`── ${team} Team ──`}>
                                                {teamMembers.map(a => (
                                                    <option key={a.email} value={a.email}>
                                                        {a.fullName} ({a.nickname}) — {a.email} {a.office ? `[${a.office}]` : ''}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        );
                                    })}
                                </select>

                                {currentAgent && (
                                    <div className={styles.agentPill}>
                                        <User size={12} />
                                        <span>
                                            <strong>{currentAgent.fullName}</strong> • Team: {currentAgent.team}
                                            {currentAgent.office ? ` (${currentAgent.office})` : ''} • Email: {currentAgent.email}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Attachments Section */}
                            <div className={styles.formGroup}>
                                <div className={styles.label}>
                                    <span>Included PDF Attachments ({docCount})</span>
                                    <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                                        Bundled automatically from storage
                                    </span>
                                </div>
                                <div className={styles.docCheckboxes}>
                                    {/* Quote */}
                                    <div className={styles.docCheckboxItem}>
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={includeQuote}
                                                disabled={!item.has_es}
                                                onChange={e => setIncludeQuote(e.target.checked)}
                                            />
                                            <span>Quote / E&S Document</span>
                                        </label>
                                        <span
                                            className={`${styles.docBadgeSmall} ${
                                                item.has_es ? styles.attached : styles.none
                                            }`}
                                        >
                                            {item.has_es ? '✓ Ready to attach' : 'Not uploaded'}
                                        </span>
                                    </div>

                                    {/* RCE */}
                                    <div className={styles.docCheckboxItem}>
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={includeRce}
                                                disabled={!item.has_rce}
                                                onChange={e => setIncludeRce(e.target.checked)}
                                            />
                                            <span>
                                                Replacement Cost Estimate (RCE)
                                                {item.rce_carrier ? ` — ${item.rce_carrier}` : ''}
                                            </span>
                                        </label>
                                        <span
                                            className={`${styles.docBadgeSmall} ${
                                                item.has_rce ? styles.attached : styles.none
                                            }`}
                                        >
                                            {item.has_rce ? '✓ Ready to attach' : 'Not uploaded'}
                                        </span>
                                    </div>

                                    {/* DIC */}
                                    <div className={styles.docCheckboxItem}>
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={includeDic}
                                                disabled={!item.has_dic || item.no_dic_available}
                                                onChange={e => setIncludeDic(e.target.checked)}
                                            />
                                            <span>
                                                Difference in Conditions (DIC)
                                                {item.dic_carrier ? ` — ${item.dic_carrier}` : ''}
                                            </span>
                                        </label>
                                        <span
                                            className={`${styles.docBadgeSmall} ${
                                                item.no_dic_available
                                                    ? styles.none
                                                    : item.has_dic
                                                    ? styles.attached
                                                    : styles.none
                                            }`}
                                        >
                                            {item.no_dic_available
                                                ? '🚫 No DIC Available'
                                                : item.has_dic
                                                ? '✓ Ready to attach'
                                                : 'Not uploaded'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Servicing Remarks / Custom Notes */}
                            <div className={styles.formGroup}>
                                <div className={styles.label}>
                                    <span>Servicing Remarks / Specific Instructions</span>
                                </div>
                                <textarea
                                    className={styles.textarea}
                                    placeholder="Add any specific notes or remarks for the agent regarding this renewal..."
                                    value={customRemarks}
                                    onChange={e => setCustomRemarks(e.target.value)}
                                />
                            </div>

                            {/* Sender Sign-off */}
                            <div className={styles.formGroup}>
                                <div className={styles.label}>
                                    <span>Sender Name (Sign-off)</span>
                                </div>
                                <input
                                    type="text"
                                    className={styles.input}
                                    value={senderName}
                                    onChange={e => setSenderName(e.target.value)}
                                    placeholder="e.g. Danicah / Olga / Phoebe"
                                />
                                <span style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '2px' }}>
                                    Sign-off: <em>Best regards, {senderName} • Alsop Coverage Check Now — Servicing Team</em>
                                </span>
                            </div>
                        </>
                    ) : (
                        /* Live Preview */
                        <div className={styles.previewContainer}>
                            <div style={{ marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid #e2e8f0' }}>
                                <div><strong>To:</strong> {currentAgent?.fullName} &lt;{selectedAgentEmail}&gt;</div>
                                <div><strong>Reply-To:</strong> phoebe@coveragechecknow.com</div>
                                <div><strong>Subject:</strong> [Policy Renewal Package] {item.named_insured} — {item.policy_number}</div>
                            </div>

                            <p>Hi <strong>{currentAgent?.fullName || 'Agent'}</strong>,</p>
                            <p>
                                This policy is up for renewal and has been prepared by our team.
                                {docCount > 0
                                    ? ` Attached are the verified ${[
                                          includeQuote ? 'Quote' : '',
                                          includeRce ? 'RCE' : '',
                                          includeDic ? 'DIC' : '',
                                      ]
                                          .filter(Boolean)
                                          .join(', ')} documents ready to forward to the insured.`
                                    : ' Please review the renewal summary details below.'}
                                {item.no_dic_available ? ' (Note: No DIC available in all carriers for this policy).' : ''}
                            </p>

                            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '14px 0', fontSize: '0.8125rem' }}>
                                <tbody>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#64748b' }}>Policy #</td>
                                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#2243B6' }}>{item.policy_number}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#64748b' }}>Named Insured</td>
                                        <td style={{ padding: '6px 8px' }}>{item.named_insured}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#64748b' }}>Property Address</td>
                                        <td style={{ padding: '6px 8px' }}>{item.property_address}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#64748b' }}>Carrier</td>
                                        <td style={{ padding: '6px 8px' }}>{item.carrier_name}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#64748b' }}>Expiration Date</td>
                                        <td style={{ padding: '6px 8px', color: '#dc2626', fontWeight: 700 }}>{item.expiration_date || '—'}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {customRemarks && (
                                <div style={{ background: '#fefce8', padding: '10px', borderRadius: '6px', borderLeft: '4px solid #eab308', margin: '12px 0' }}>
                                    <strong>Remarks:</strong> {customRemarks}
                                </div>
                            )}

                            <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                                Best regards,<br />
                                <strong>{senderName}</strong><br />
                                Alsop Coverage Check Now — Servicing Team
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    <button type="button" className={styles.cancelBtn} onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className={styles.sendBtn}
                        onClick={handleSend}
                        disabled={sending || !selectedAgentEmail}
                    >
                        {sending ? (
                            <>
                                <Loader2 size={13} className="animate-spin" />
                                <span>Sending Email with Attachments...</span>
                            </>
                        ) : (
                            <>
                                <Send size={13} />
                                <span>Send to {currentAgent?.nickname || 'Agent'} ({docCount} PDFs)</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
