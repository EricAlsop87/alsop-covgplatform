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
    { id: 'phoebe', name: 'Phoebe (Trial Test)', email: 'phoebe@coveragechecknow.com', avatarText: 'PH', roleText: 'Trial' },
    { id: 'nancy', name: 'Nancy Maldonado', email: 'nmaldonado@allstate.com', avatarText: 'NM', roleText: 'Admin' },
    { id: 'olga', name: 'Olga Soto', email: 'olgasoto@allstate.com', avatarText: 'OS', roleText: 'Service' },
    { id: 'esmeralda', name: 'Esmeralda Cervantes', email: 'egamboa-cerva@allstate.com', avatarText: 'EC', roleText: 'Admin' },
    { id: 'johnpaul', name: 'John Paul Dizon', email: 'johndizon2@allstate.com', avatarText: 'JP', roleText: 'Admin' },
    { id: 'eric', name: 'Eric Alsop', email: 'ealsop@allstate.com', avatarText: 'EA', roleText: 'Manager' },
];

interface SendMailModalProps {
    term: CFPTermRow | null;
    isOpen: boolean;
    onClose: () => void;
    onSentSuccess: (termId: string, recipientNames: string[]) => void;
}

export function SendMailModal({ term, isOpen, onClose, onSentSuccess }: SendMailModalProps) {
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(['nancy', 'olga']);
    const [ccVaTeam, setCcVaTeam] = useState<boolean>(true);
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
        setSelectedRecipientIds(['nancy', 'olga']);
    }, [term, isOpen]);

    // Build structured document items covering all 4 companion carriers + Dec + RCE + Title
    const docItems = useMemo(() => {
        if (!term) return [];

        const isCarrierActive = (q: any) =>
            Boolean(q && q.coverage_type !== 'UNAVAILABLE');

        const anyCarrierQuoted = Boolean(
            isCarrierActive(term.carrier_quotes?.bamboo) ||
            isCarrierActive(term.carrier_quotes?.aegis) ||
            isCarrierActive(term.carrier_quotes?.psic) ||
            isCarrierActive(term.carrier_quotes?.am)
        );

        const formatQuote = (carrierName: string, q: any) => {
            if (!q) {
                return {
                    name: `${carrierName} Quote`,
                    status: anyCarrierQuoted ? 'Not Quoted' : 'Not Attempted',
                    statusType: 'not_quoted' as const,
                    premium: '—',
                    details: anyCarrierQuoted ? 'Not Required (Primary quote secured)' : 'Pending portal review',
                };
            }

            if (q.coverage_type === 'UNAVAILABLE') {
                return {
                    name: `${carrierName} Quote`,
                    status: 'Unable to Quote',
                    statusType: 'declined' as const,
                    premium: '—',
                    details: q.notes || 'Ineligible / Underwriting decline',
                };
            }

            const premStr = q.premium ? `$${Number(q.premium).toLocaleString()}` : (q.coverage_type || 'Quoted');
            const details = [
                q.coverage_type ? `Type: ${q.coverage_type}` : null,
                q.notes ? `Note: ${q.notes}` : null,
            ].filter(Boolean).join(' | ') || 'Quote on file (Attached)';

            return {
                name: `${carrierName} Quote`,
                status: 'Quoted',
                statusType: 'quoted' as const,
                premium: premStr,
                details,
            };
        };

        const bamboo = formatQuote('Bamboo', term.carrier_quotes?.bamboo);
        const aegis = formatQuote('Aegis', term.carrier_quotes?.aegis);
        const am = formatQuote('American Modern (AM)', term.carrier_quotes?.am);
        const psic = formatQuote('PSIC', term.carrier_quotes?.psic);

        const titleStatus = term.title_pro
            ? (term.title_pro.match_status === 'matched' ? 'Verified' : term.title_pro.match_status === 'partial' ? 'Trust / LLC' : 'Mismatch')
            : 'Pending';
        const titleStatusType = !term.title_pro
            ? ('not_quoted' as const)
            : term.title_pro.match_status === 'matched' || term.title_pro.match_status === 'partial'
                ? ('available' as const)
                : ('declined' as const);
        const titleDetails = term.title_pro
            ? `${term.title_pro.title_name || 'Verified'}${term.title_pro.notes ? ` (${term.title_pro.notes})` : ''}`
            : 'Pending title record match';

        const decStatus = term.has_dec
            ? 'Available'
            : (term.has_renewal_dec ? 'Renewal Available' : 'Missing');
        const decStatusType = (term.has_dec || term.has_renewal_dec) ? ('available' as const) : ('missing' as const);
        const decDetails = term.has_dec
            ? (term.expiration_date ? `Exp: ${term.expiration_date} (Attached)` : 'Attached')
            : (term.has_renewal_dec ? 'Renewal Offer (Attached)' : (term.expiration_date ? `Exp: ${term.expiration_date} (No Dec Page)` : 'No Dec Page on file'));

        return [
            {
                name: 'FAIR Plan Dec Page',
                status: decStatus,
                statusType: decStatusType,
                premium: term.annual_premium ? `$${Number(term.annual_premium).toLocaleString()}` : '—',
                details: decDetails,
            },
            {
                name: 'RCE Valuation Report',
                status: term.has_rce ? 'Available' : 'Missing',
                statusType: term.has_rce ? ('available' as const) : ('missing' as const),
                premium: term.rce_carrier || (term.has_rce ? '360Value' : '—'),
                details: term.has_rce ? 'Valuation on file (Attached)' : 'No RCE uploaded',
            },
            bamboo,
            aegis,
            am,
            psic,
            {
                name: 'Title Pro Report',
                status: titleStatus,
                statusType: titleStatusType,
                premium: '—',
                details: titleDetails,
            },
        ];
    }, [term]);

    // Build the executive HTML Email Body with professional blue theme
    const htmlBody = useMemo(() => {
        if (!term) return '';
        const polNum = term.policy_number || 'Policy';
        const cleanPolNum = polNum.replace(/^CFP\s*/i, '');
        const insured = term.named_insured || 'Insured';
        const addr = term.property_address || 'Address on file';
        const exp = term.expiration_date || '—';
        const prem = term.annual_premium ? `$${Number(term.annual_premium).toLocaleString()}` : '—';

        const rowsHtml = docItems.map(item => {
            let badgeHtml = '';
            if (item.statusType === 'available' || item.statusType === 'quoted') {
                badgeHtml = `<span style="display:inline-block;padding:3px 10px;border-radius:4px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-weight:700;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;">${item.status}</span>`;
            } else if (item.statusType === 'declined') {
                badgeHtml = `<span style="display:inline-block;padding:3px 10px;border-radius:4px;background:#f8fafc;color:#475569;border:1px solid #cbd5e1;font-weight:700;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;">${item.status}</span>`;
            } else if (item.statusType === 'not_quoted') {
                badgeHtml = `<span style="display:inline-block;padding:3px 10px;border-radius:4px;background:#f8fafc;color:#94a3b8;border:1px solid #e2e8f0;font-weight:600;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;">${item.status}</span>`;
            } else {
                badgeHtml = `<span style="display:inline-block;padding:3px 10px;border-radius:4px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;font-weight:700;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;">${item.status}</span>`;
            }

            return `
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:10px 14px;font-weight:600;color:#0f172a;font-size:13px;">${item.name}</td>
              <td style="padding:10px 14px;text-align:center;">${badgeHtml}</td>
              <td style="padding:10px 14px;color:#334155;font-weight:500;font-size:13px;">${item.premium}</td>
              <td style="padding:10px 14px;color:#64748b;font-size:12px;">${item.details}</td>
            </tr>`;
        }).join('');

        const notesBlock = customNotes.trim()
            ? `<div style="margin-top:16px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1e40af;border-radius:4px;">
                 <strong style="color:#0f172a;font-size:13px;">Additional Remarks:</strong>
                 <p style="margin:6px 0 0 0;color:#334155;font-size:13px;line-height:1.5;">${customNotes.replace(/\n/g, '<br/>')}</p>
               </div>`
            : '';

        return `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.5;max-width:680px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
          <div style="border-bottom:2px solid #1e3a8a;padding-bottom:12px;margin-bottom:18px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <h2 style="margin:0;font-size:17px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">
                CFP Policy Document &amp; Quoting Summary
              </h2>
              <span style="font-size:12px;color:#1e40af;font-weight:700;background:#eff6ff;border:1px solid #dbeafe;padding:3px 8px;border-radius:4px;">
                CFP ${cleanPolNum}
              </span>
            </div>
          </div>

          <p style="font-size:14px;color:#334155;margin:0 0 16px 0;">
            Hello,<br/><br/>
            Please review the current document verification and companion quote status for policy <strong>CFP ${cleanPolNum}</strong>:
          </p>

          <table style="width:100%;border-collapse:collapse;background:#f0f7ff;border:1px solid #bfdbfe;border-left:4px solid #2563eb;border-radius:6px;margin-bottom:20px;">
            <tr>
              <td style="padding:12px 16px;font-size:13px;color:#1e293b;">
                <div style="margin-bottom:4px;"><strong style="color:#1e40af;">Named Insured:</strong> ${insured}</div>
                <div style="margin-bottom:4px;"><strong style="color:#1e40af;">Property Address:</strong> ${addr}</div>
                <div><strong style="color:#1e40af;">Expiration Date:</strong> ${exp} &nbsp;&bull;&nbsp; <strong style="color:#1e40af;">FAIR Plan Premium:</strong> ${prem}</div>
              </td>
            </tr>
          </table>

          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
            <thead>
              <tr style="background:#f8fafc;text-align:left;border-bottom:2px solid #cbd5e1;">
                <th style="padding:10px 14px;color:#1e293b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Document / Carrier</th>
                <th style="padding:10px 14px;color:#1e293b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;text-align:center;width:140px;">Status</th>
                <th style="padding:10px 14px;color:#1e293b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Type / Premium</th>
                <th style="padding:10px 14px;color:#1e293b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Notes / Details</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div style="margin-top:16px;padding:11px 15px;background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #2563eb;border-radius:4px;font-size:12.5px;color:#1e293b;">
            <strong>Attached Files:</strong> Available policy documents (Dec Page, RCE Valuation, and Companion Quotes) are attached for your reference.
          </div>

          ${notesBlock}

          <p style="font-size:12px;color:#64748b;margin-top:24px;padding-top:14px;border-top:1px solid #e2e8f0;">
            Sent via Coverage Check &bull; Please reply directly to this email if you have any questions or require updates.
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
                        {/* VA Team Auto-CC Info */}
                        <div style={{
                            marginTop: '10px',
                            padding: '8px 12px',
                            background: 'rgba(34, 67, 182, 0.06)',
                            border: '1px solid rgba(34, 67, 182, 0.2)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '0.78rem',
                            color: '#1e3a8a'
                        }}>
                            <CheckCircle2 size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
                            <span>
                                <strong>Auto-CC Active:</strong> <code>alsopva01@gmail.com</code>, <code>alsopva02@gmail.com</code>, <code>alsopva03@gmail.com</code> will receive a copy so all VA inboxes stay synced.
                            </span>
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
                                                {(item.statusType === 'available' || item.statusType === 'quoted') && (
                                                    <span className={`${styles.statusBadge} ${styles.available}`}>{item.status}</span>
                                                )}
                                                {item.statusType === 'declined' && (
                                                    <span className={`${styles.statusBadge} ${styles.declined}`}>{item.status}</span>
                                                )}
                                                {item.statusType === 'not_quoted' && (
                                                    <span className={`${styles.statusBadge} ${styles.notQuoted}`}>{item.status}</span>
                                                )}
                                                {item.statusType === 'missing' && (
                                                    <span className={`${styles.statusBadge} ${styles.missing}`}>{item.status}</span>
                                                )}
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
