'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
    X,
    Send,
    Loader2,
    CheckCircle2,
    Mail,
    UserCheck,
    FileText,
    Shield,
    AlertTriangle,
    Eye,
    Edit3,
    Plus,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import styles from './SendMailModal.module.scss';
import type { CFPTermRow } from '@/app/api/cfp-summary/route';

export interface TeamRecipient {
    id: string;
    name: string;
    email: string;
    avatarText: string;
    roleText?: string;
}

export const TEAM_RECIPIENTS: TeamRecipient[] = [
    { id: 'nancy', name: 'Nancy Maldonado', email: 'nmaldonado@allstate.com', avatarText: 'NM', roleText: 'Admin' },
    { id: 'olga', name: 'Olga Soto', email: 'olgasoto@allstate.com', avatarText: 'OS', roleText: 'Service' },
    { id: 'esmeralda', name: 'Esmeralda Cervantes', email: 'egamboa-cerva@allstate.com', avatarText: 'EC', roleText: 'Admin' },
    { id: 'phoebe', name: 'Phoebe Coverage Check now', email: 'alsopva02@gmail.com', avatarText: 'PH', roleText: 'Admin' },
    { id: 'johnpaul', name: 'John Paul Dizon', email: 'johndizon2@allstate.com', avatarText: 'JP', roleText: 'Admin' },
];

interface SendMailModalProps {
    term: CFPTermRow | null;
    isOpen: boolean;
    onClose: () => void;
    onSentSuccess: (termId: string, recipientNames: string[]) => void;
}

export function SendMailModal({ term, isOpen, onClose, onSentSuccess }: SendMailModalProps) {
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(['phoebe']);
    const [customCc, setCustomCc] = useState('');
    const [subject, setSubject] = useState('');
    const [customNotes, setCustomNotes] = useState('');
    const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Initialize subject & template when modal opens with term
    useEffect(() => {
        if (!term) return;
        const polNum = term.policy_number || 'Policy';
        const addr = term.property_address || 'Address';
        setSubject(`CFP ${polNum.replace(/^CFP\s*/i, '')} - ${addr}`);
        setCustomNotes('');
        setError(null);
        setSuccessMsg(null);
    }, [term, isOpen]);

    // Build structured document items
    const docItems = useMemo(() => {
        if (!term) return [];
        
        const formatQuote = (q: any) => {
            if (!q) return { status: 'Missing', isAvailable: false, isUnavailable: false, premium: '—', details: 'Not quoted' };
            if (q.status === 'unavailable' || q.coverage_type === 'UNAVAILABLE') {
                return { status: 'Unavailable', isAvailable: false, isUnavailable: true, premium: '—', details: q.notes || 'Unavailable' };
            }
            const premStr = q.premium ? `$${Number(q.premium).toLocaleString()}` : (q.coverage_type || 'Quoted');
            const details = [
                q.coverage_type ? `Type: ${q.coverage_type}` : null,
                q.notes ? `Note: ${q.notes}` : null,
            ].filter(Boolean).join(' | ') || 'Quote available';
            return { status: 'Quoted', isAvailable: true, isUnavailable: false, premium: premStr, details };
        };

        const bamboo = formatQuote(term.carrier_quotes?.bamboo);
        const aegis = formatQuote(term.carrier_quotes?.aegis);
        const am = formatQuote(term.carrier_quotes?.am);
        const psic = formatQuote(term.carrier_quotes?.psic);

        const titleStatus = term.title_pro
            ? (term.title_pro.match_status === 'matched' ? 'Matched' : term.title_pro.match_status === 'partial' ? 'Trust/LLC' : 'Mismatch')
            : 'Pending';
        const titleDetails = term.title_pro
            ? `${term.title_pro.title_name || 'Verified'}${term.title_pro.notes ? ` (${term.title_pro.notes})` : ''}`
            : 'Pending verification';

        return [
            {
                name: 'FAIR Plan Dec Page',
                status: term.has_dec ? 'Available' : 'Missing',
                isAvailable: term.has_dec,
                isUnavailable: false,
                premium: term.annual_premium ? `$${Number(term.annual_premium).toLocaleString()}` : '—',
                details: term.expiration_date ? `Exp: ${term.expiration_date}` : '—',
            },
            {
                name: 'RCE Valuation Report',
                status: term.has_rce ? 'Available' : 'Missing',
                isAvailable: term.has_rce,
                isUnavailable: false,
                premium: term.rce_carrier || (term.has_rce ? '360Value' : '—'),
                details: term.has_rce ? 'Valuation on file' : 'No RCE uploaded',
            },
            {
                name: 'Bamboo Quote',
                status: bamboo.status,
                isAvailable: bamboo.isAvailable,
                isUnavailable: bamboo.isUnavailable,
                premium: bamboo.premium,
                details: bamboo.details,
            },
            {
                name: 'Aegis Quote',
                status: aegis.status,
                isAvailable: aegis.isAvailable,
                isUnavailable: aegis.isUnavailable,
                premium: aegis.premium,
                details: aegis.details,
            },
            {
                name: 'American Modern (AM) Quote',
                status: am.status,
                isAvailable: am.isAvailable,
                isUnavailable: am.isUnavailable,
                premium: am.premium,
                details: am.details,
            },
            {
                name: 'PSIC Quote',
                status: psic.status,
                isAvailable: psic.isAvailable,
                isUnavailable: psic.isUnavailable,
                premium: psic.premium,
                details: psic.details,
            },
            {
                name: 'Title Pro Report',
                status: titleStatus,
                isAvailable: !!term.title_pro && term.title_pro.match_status === 'matched',
                isUnavailable: !!term.title_pro && term.title_pro.match_status === 'mismatch',
                premium: '—',
                details: titleDetails,
            },
        ];
    }, [term]);

    // Build the clean HTML Email Body
    const htmlBody = useMemo(() => {
        if (!term) return '';
        const polNum = term.policy_number || 'Policy';
        const insured = term.named_insured || 'Insured';
        const addr = term.property_address || 'Address on file';
        const exp = term.expiration_date || '—';
        const prem = term.annual_premium ? `$${Number(term.annual_premium).toLocaleString()}` : '—';

        const rowsHtml = docItems.map(item => {
            const statusBadge = item.isAvailable
                ? `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#dcfce7;color:#15803d;font-weight:700;font-size:12px;">✅ ${item.status}</span>`
                : item.isUnavailable
                    ? `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#fef3c7;color:#b45309;font-weight:700;font-size:12px;">⚠️ Unavailable</span>`
                    : `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#fee2e2;color:#b91c1c;font-weight:700;font-size:12px;">❌ Missing</span>`;

            return `
            <tr>
              <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600;color:#0f172a;">${item.name}</td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0;text-align:center;">${statusBadge}</td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0;color:#334155;">${item.premium}</td>
              <td style="padding:10px 14px;border:1px solid #e2e8f0;color:#64748b;font-size:12px;">${item.details}</td>
            </tr>`;
        }).join('');

        const notesBlock = customNotes.trim()
            ? `<div style="margin-top:20px;padding:14px 16px;background:#f8fafc;border-left:4px solid #6366f1;border-radius:4px;">
                 <strong style="color:#0f172a;font-size:13px;">Additional Notes:</strong>
                 <p style="margin:6px 0 0 0;color:#334155;font-size:13px;line-height:1.5;">${customNotes.replace(/\n/g, '<br/>')}</p>
               </div>`
            : '';

        return `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.5;max-width:680px;margin:0 auto;padding:20px;">
          <p style="font-size:15px;margin-bottom:12px;">Hello,</p>
          <p style="font-size:14px;color:#334155;margin-bottom:18px;">
            Here is the current document and quote availability status for policy <strong>CFP ${polNum.replace(/^CFP\s*/i, '')}</strong>:
          </p>

          <div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;">
            <div style="margin-bottom:4px;"><strong>Named Insured:</strong> ${insured}</div>
            <div style="margin-bottom:4px;"><strong>Property Address:</strong> ${addr}</div>
            <div><strong>Expiration Date:</strong> ${exp} &nbsp;|&nbsp; <strong>Annual Premium:</strong> ${prem}</div>
          </div>

          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
            <thead>
              <tr style="background:#f8fafc;text-align:left;border-bottom:2px solid #e2e8f0;">
                <th style="padding:10px 14px;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Document / Carrier</th>
                <th style="padding:10px 14px;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;text-align:center;width:120px;">Status</th>
                <th style="padding:10px 14px;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Type / Premium</th>
                <th style="padding:10px 14px;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Notes / Details</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          ${notesBlock}

          <p style="font-size:13px;color:#64748b;margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
            Sent via Coverage Check Now &bull; Please reply directly to this email if you have any questions.
          </p>
        </div>
        `;
    }, [term, docItems, customNotes]);

    if (!isOpen || !term) return null;

    const toggleRecipient = (id: string) => {
        setSelectedRecipientIds(prev =>
            prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
        );
    };

    const handleSend = async () => {
        if (selectedRecipientIds.length === 0 && !customCc.trim()) {
            setError('Please select at least one recipient.');
            return;
        }

        if (!subject.trim()) {
            setError('Please enter a subject line.');
            return;
        }

        setSending(true);
        setError(null);

        const selectedRecipients = TEAM_RECIPIENTS.filter(r => selectedRecipientIds.includes(r.id));
        const recipientEmails = selectedRecipients.map(r => r.email);
        const recipientNames = selectedRecipients.map(r => r.name.split(' ')[0]);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                setError('Session expired. Please log in again.');
                setSending(false);
                return;
            }

            const res = await fetch('/api/cfp-summary/send-mail', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    policyId: term.policy_id,
                    policyNumber: term.policy_number,
                    recipients: recipientEmails,
                    recipientNames,
                    customCc: customCc.trim() || undefined,
                    subject,
                    htmlBody,
                }),
            });

            const json = await res.json();

            if (res.ok && json.success) {
                setSuccessMsg(`✓ Email successfully sent to ${recipientNames.join(', ')}!`);
                onSentSuccess(term.policy_id, recipientNames);
                setTimeout(() => {
                    onClose();
                }, 1200);
            } else {
                setError(json.error || 'Failed to send email. Please try again.');
            }
        } catch (err: any) {
            setError(err.message || 'Network error sending email.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.modalHeader}>
                    <div className={styles.modalHeaderInfo}>
                        <div className={styles.modalTitleRow}>
                            <span className={styles.mailIconBadge}>
                                <Mail size={16} />
                            </span>
                            <h3 className={styles.modalTitle}>Send Policy Document Status</h3>
                        </div>
                        <p className={styles.modalSubtitle}>
                            {term.policy_number} &bull; {term.named_insured} &bull; {term.property_address || 'No address'}
                        </p>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={onClose} title="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className={styles.modalBody}>
                    {/* Recipient Selection */}
                    <div className={styles.formSection}>
                        <label className={styles.fieldLabel}>
                            <UserCheck size={14} /> Select Recipients (One-Click Team Members)
                        </label>
                        <div className={styles.recipientPillsGrid}>
                            {TEAM_RECIPIENTS.map(r => {
                                const isSelected = selectedRecipientIds.includes(r.id);
                                return (
                                    <button
                                        key={r.id}
                                        type="button"
                                        className={`${styles.recipientPill} ${isSelected ? styles.selected : ''}`}
                                        onClick={() => toggleRecipient(r.id)}
                                    >
                                        <span className={styles.avatar}>{r.avatarText}</span>
                                        <div className={styles.recipientInfo}>
                                            <span className={styles.name}>{r.name}</span>
                                            <span className={styles.email}>{r.email}</span>
                                        </div>
                                        {isSelected && <CheckCircle2 size={15} className={styles.checkIcon} />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Custom CC / Additional Emails */}
                    <div className={styles.formSection}>
                        <label className={styles.fieldLabel}>
                            <Plus size={13} /> Additional CC / Custom Email (Optional)
                        </label>
                        <input
                            type="text"
                            className={styles.textInput}
                            placeholder="e.g. manager@allstate.com, team@agency.com"
                            value={customCc}
                            onChange={e => setCustomCc(e.target.value)}
                        />
                    </div>

                    {/* Subject Line */}
                    <div className={styles.formSection}>
                        <label className={styles.fieldLabel}>
                            <FileText size={14} /> Subject
                        </label>
                        <input
                            type="text"
                            className={styles.textInput}
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            placeholder="Email subject..."
                        />
                    </div>

                    {/* Additional Notes to Include */}
                    <div className={styles.formSection}>
                        <label className={styles.fieldLabel}>
                            <Edit3 size={14} /> Custom Notes / Remarks to Include (Optional)
                        </label>
                        <textarea
                            className={styles.textareaInput}
                            placeholder="Add any specific instructions or remarks to Nancy, Olga, or the team..."
                            rows={2}
                            value={customNotes}
                            onChange={e => setCustomNotes(e.target.value)}
                        />
                    </div>

                    {/* Document Status Table Preview */}
                    <div className={styles.previewContainer}>
                        <div className={styles.previewHeader}>
                            <span className={styles.previewTitle}>
                                <Eye size={13} /> Document Summary Table (Included in Email)
                            </span>
                            <span className={styles.replyNotice}>
                                ↩ Replies will go directly to your inbox
                            </span>
                        </div>

                        <div className={styles.tableScroll}>
                            <table className={styles.previewTable}>
                                <thead>
                                    <tr>
                                        <th>Document / Carrier</th>
                                        <th style={{ textAlign: 'center' }}>Status</th>
                                        <th>Type / Premium</th>
                                        <th>Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {docItems.map((item, i) => (
                                        <tr key={i}>
                                            <td className={styles.docName}>{item.name}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                {item.isAvailable && <span className={`${styles.statusBadge} ${styles.available}`}>✅ Available</span>}
                                                {item.isUnavailable && <span className={`${styles.statusBadge} ${styles.unavailable}`}>⚠️ Unavailable</span>}
                                                {!item.isAvailable && !item.isUnavailable && <span className={`${styles.statusBadge} ${styles.missing}`}>❌ Missing</span>}
                                            </td>
                                            <td className={styles.docPremium}>{item.premium}</td>
                                            <td className={styles.docDetails}>{item.details}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Error / Success Notifications */}
                    {error && (
                        <div className={styles.errorBanner}>
                            <AlertTriangle size={15} />
                            <span>{error}</span>
                        </div>
                    )}
                    {successMsg && (
                        <div className={styles.successBanner}>
                            <CheckCircle2 size={15} />
                            <span>{successMsg}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={styles.modalFooter}>
                    <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={sending}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className={styles.sendBtn}
                        onClick={handleSend}
                        disabled={sending || selectedRecipientIds.length === 0 && !customCc.trim()}
                    >
                        {sending ? (
                            <>
                                <Loader2 size={15} className="animate-spin" />
                                <span>Sending...</span>
                            </>
                        ) : (
                            <>
                                <Send size={15} />
                                <span>Send Mail ({selectedRecipientIds.length + (customCc.trim() ? 1 : 0)})</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
