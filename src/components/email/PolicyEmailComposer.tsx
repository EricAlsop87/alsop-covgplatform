'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    X, Mail, Check, Sparkles, FileText, ExternalLink,
    Copy, Sliders, CheckCircle2, AlertTriangle, ShieldCheck, Loader2, Send,
    Calendar, RefreshCw, ChevronDown, ChevronUp, User, Hash, DollarSign, Save
} from 'lucide-react';
import {
    SystemEmailTemplate,
    TemplateContext,
    getInternalTemplates,
    getInternalTemplate,
    renderInternalDraft,
    renderInternalCopilotPrompt,
    cleanPolicyNumber,
} from '@/lib/internalTemplateStore';
import { RenewalEmailLogEntry } from '@/lib/api';
import { logger } from '@/lib/logger';

// Re-export for consumers
export type { RenewalEmailLogEntry };

// Stable empty array to avoid re-render loops when no emailLog is passed
const EMPTY_LOG: RenewalEmailLogEntry[] = [];

// Default Calendly booking URL
const DEFAULT_CALENDLY_URL = 'https://calendly.com/coveragechecknow-scheduling/15min';

/**
 * Retrieve saved Calendly URL with automatic migration away from legacy/deprecated URLs.
 */
function getStoredCalendlyUrl(): string {
    if (typeof window === 'undefined') return DEFAULT_CALENDLY_URL;
    try {
        const stored = localStorage.getItem('ccn_calendly_url');
        if (!stored || stored === 'https://calendly.com/alsopagency' || stored === 'https://calendly.com/your-name/policy-review') {
            localStorage.setItem('ccn_calendly_url', DEFAULT_CALENDLY_URL);
            return DEFAULT_CALENDLY_URL;
        }
        return stored;
    } catch {
        return DEFAULT_CALENDLY_URL;
    }
}

export interface PolicyEmailComposerProps {
    isOpen: boolean;
    onClose: () => void;
    policyId?: string | null;
    clientId?: string | null;
    reportId?: string | null;
    clientEmail?: string | null;
    clientName?: string | null;
    policyNumber?: string | null;
    propertyAddress?: string | null;
    agentName?: string | null;
    reportUrl?: string | null;
    defaultTemplateId?: string | null;
    rceDownloadUrl?: string | null;
    /** Pre-fetched email log entries for this policy */
    emailLog?: RenewalEmailLogEntry[];
    /** Callback after marking a template as sent */
    onMarkSent?: (entry: RenewalEmailLogEntry) => void;
}

export function PolicyEmailComposer({
    isOpen,
    onClose,
    policyId,
    clientId,
    reportId,
    clientEmail = '',
    clientName = '',
    policyNumber = '',
    propertyAddress = '',
    agentName = 'Alsop and Associates Insurance Agency',
    reportUrl,
    defaultTemplateId,
    rceDownloadUrl,
    emailLog,
    onMarkSent,
}: PolicyEmailComposerProps) {

    const safeClientEmail = clientEmail || '';
    const safeClientName = clientName || '';
    const safePolicyNumber = cleanPolicyNumber(policyNumber || '');
    const safePropertyAddress = propertyAddress || '';
    const safeAgentName = agentName || 'Alsop and Associates Insurance Agency';

    // Stable default for emailLog
    const stableEmailLog = emailLog ?? EMPTY_LOG;

    // State
    const [templates, setTemplates] = useState<SystemEmailTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('renewal_review');
    const [outputMode, setOutputMode] = useState<'draft' | 'copilot'>('copilot');
    const [copied, setCopied] = useState(false);
    const [markingSent, setMarkingSent] = useState(false);
    const [justMarkedSent, setJustMarkedSent] = useState(false);
    const [localLog, setLocalLog] = useState<RenewalEmailLogEntry[]>(stableEmailLog);

    // Mini UI: Interactive Variable Adjuster State
    const [showAdjuster, setShowAdjuster] = useState(false);
    const [editableClientName, setEditableClientName] = useState(safeClientName);
    const [editablePolicyNumber, setEditablePolicyNumber] = useState(safePolicyNumber);
    const [editablePropertyAddress, setEditablePropertyAddress] = useState(safePropertyAddress);
    const [editableExpirationDate, setEditableExpirationDate] = useState('07/27/2026');
    const [editableAnnualPremium, setEditableAnnualPremium] = useState('$1,850.00');
    const [editableMeetingUrl, setEditableMeetingUrl] = useState(() => getStoredCalendlyUrl());
    const [calendlySaved, setCalendlySaved] = useState(false);

    // Reset / sync local fields when props change or modal opens
    useEffect(() => {
        if (isOpen) {
            setEditableClientName(safeClientName);
            setEditablePolicyNumber(safePolicyNumber);
            setEditablePropertyAddress(safePropertyAddress);
            setEditableMeetingUrl(getStoredCalendlyUrl());
        }
    }, [isOpen, safeClientName, safePolicyNumber, safePropertyAddress]);

    // Handle Calendly URL change & auto-persist
    const handleMeetingUrlChange = (val: string) => {
        setEditableMeetingUrl(val);
        setCalendlySaved(false);
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('ccn_calendly_url', val);
            } catch {
                // ignore
            }
        }
    };

    // Explicit Save Default handler with visual confirmation
    const handleSaveCalendlyDefault = () => {
        const urlToSave = editableMeetingUrl.trim() || DEFAULT_CALENDLY_URL;
        setEditableMeetingUrl(urlToSave);
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('ccn_calendly_url', urlToSave);
            } catch {
                // ignore
            }
        }
        setCalendlySaved(true);
        setTimeout(() => setCalendlySaved(false), 2500);
    };

    // Reset variables to detected policy defaults
    const handleResetVariables = () => {
        setEditableClientName(safeClientName);
        setEditablePolicyNumber(safePolicyNumber);
        setEditablePropertyAddress(safePropertyAddress);
        setEditableExpirationDate('07/27/2026');
        setEditableAnnualPremium('$1,850.00');
    };

    // Sync external log when it actually changes (by length, not reference)
    useEffect(() => {
        setLocalLog(stableEmailLog);
    }, [stableEmailLog.length]);

    // Dynamic Context object fed into templates
    const templateContext: TemplateContext = useMemo(() => ({
        clientName: editableClientName,
        clientEmail: safeClientEmail,
        policyNumber: editablePolicyNumber,
        propertyAddress: editablePropertyAddress,
        agentName: safeAgentName,
        expirationDate: editableExpirationDate,
        annualPremium: editableAnnualPremium,
        reportUrl: reportUrl || (reportId ? `https://coveragechecknow.com/report/${reportId}` : undefined),
        rceDownloadUrl: rceDownloadUrl || undefined,
        meetingUrl: editableMeetingUrl,
    }), [
        editableClientName,
        safeClientEmail,
        editablePolicyNumber,
        editablePropertyAddress,
        safeAgentName,
        editableExpirationDate,
        editableAnnualPremium,
        editableMeetingUrl,
        reportUrl,
        reportId,
        rceDownloadUrl
    ]);

    // Load templates
    useEffect(() => {
        if (!isOpen) return;
        const load = () => {
            const loaded = getInternalTemplates();
            setTemplates(loaded);
            if (defaultTemplateId && loaded.some(t => t.id === defaultTemplateId)) {
                setSelectedTemplateId(defaultTemplateId);
            } else if (loaded.length > 0) {
                setSelectedTemplateId(prev => loaded.some(t => t.id === prev) ? prev : loaded[0].id);
            }
        };
        load();
        window.addEventListener('cfp-templates-updated', load);
        window.addEventListener('storage', load);
        // Reset marked state when reopening
        setJustMarkedSent(false);
        return () => {
            window.removeEventListener('cfp-templates-updated', load);
            window.removeEventListener('storage', load);
        };
    }, [isOpen, defaultTemplateId]);

    const activeTemplate = useMemo(() => {
        return templates.find(t => t.id === selectedTemplateId) || templates[0] || null;
    }, [templates, selectedTemplateId]);

    // Per-template sent status
    const getTemplateSentInfo = useCallback((templateId: string): RenewalEmailLogEntry | undefined => {
        return localLog.find(e => e.template_id === templateId);
    }, [localLog]);

    const activeTemplateSentInfo = useMemo(() => {
        return activeTemplate ? getTemplateSentInfo(activeTemplate.id) : undefined;
    }, [activeTemplate, getTemplateSentInfo]);

    // Rendered Outputs
    const renderedDraft = useMemo(() => {
        if (!activeTemplate) return { subject: '', body: '' };
        return renderInternalDraft(activeTemplate, templateContext);
    }, [activeTemplate, templateContext]);

    const renderedPrompt = useMemo(() => {
        if (!activeTemplate) return '';
        return renderInternalCopilotPrompt(activeTemplate, templateContext);
    }, [activeTemplate, templateContext]);

    // Copy handler
    const handleCopy = useCallback(async () => {
        if (outputMode === 'draft') {
            const fullText = `Subject: ${renderedDraft.subject}\n\n${renderedDraft.body}`;
            await navigator.clipboard.writeText(fullText);
        } else {
            await navigator.clipboard.writeText(renderedPrompt);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [outputMode, renderedDraft, renderedPrompt]);

    // Mark as Emailed handler
    const handleMarkSent = useCallback(async () => {
        if (!policyId || !activeTemplate || markingSent) return;
        setMarkingSent(true);
        try {
            const { supabase } = await import('@/lib/supabaseClient');
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                alert('Session expired. Please refresh and sign in again.');
                return;
            }

            const res = await fetch('/api/email/mark-sent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    policyId,
                    clientId: clientId || null,
                    templateId: activeTemplate.id,
                    templateName: activeTemplate.name,
                }),
            });

            const json = await res.json();

            if (res.ok && json.success) {
                setJustMarkedSent(true);
                setTimeout(() => setJustMarkedSent(false), 3000);
                // Add to local log
                if (json.entry) {
                    setLocalLog(prev => [json.entry, ...prev]);
                    onMarkSent?.(json.entry);
                }
            } else {
                alert(json.error || 'Failed to mark as sent');
            }
        } catch (err) {
            logger.error('PolicyEmailComposer', 'Mark sent failed:', { error: err instanceof Error ? err.message : String(err) })
            alert('Error marking email as sent.');
        } finally {
            setMarkingSent(false);
        }
    }, [policyId, clientId, activeTemplate, markingSent, onMarkSent]);

    if (!isOpen) return null;

    // Format date for sent badges
    const formatSentDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
            });
        } catch { return dateStr; }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(5px)',
            zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
        }}>
            <div style={{
                width: '100%', maxWidth: '880px', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
                background: 'var(--bg-surface)', borderRadius: '14px', border: '1px solid var(--border-default)',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', overflow: 'hidden', color: 'var(--text-high)'
            }}>
                
                {/* ── Modal Header ── */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '1.15rem 1.5rem', borderBottom: '1px solid var(--border-default)',
                    background: 'var(--bg-surface-raised)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '8px',
                            background: outputMode === 'draft' ? 'rgba(34,197,94,0.15)' : 'var(--accent-secondary-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: outputMode === 'draft' ? 'var(--semantic-success)' : 'var(--accent-secondary)'
                        }}>
                            {outputMode === 'draft' ? <Mail size={18} /> : <Sparkles size={18} />}
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-high)' }}>
                                {outputMode === 'draft' ? 'Email Draft Composer' : 'CoPilot Prompt Generator'}
                            </h2>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-mid)', margin: '0.1rem 0 0 0' }}>
                                Native agency templates with live variable customization
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* ── Modal Content Body ── */}
                <div style={{ padding: '1.25rem 1.5rem', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
                    {/* ── Mini UI: Live Variable Adjuster Toolbar ── */}
                    <div style={{
                        background: 'var(--bg-surface-raised)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '10px',
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                    }}>
                        {/* Top Line: Calendly input + Quick Expand Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: '1 1 360px' }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                    fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-primary)',
                                    whiteSpace: 'nowrap'
                                }}>
                                    <Calendar size={14} /> Calendly Link:
                                </span>
                                <input
                                    type="text"
                                    value={editableMeetingUrl}
                                    onChange={e => handleMeetingUrlChange(e.target.value)}
                                    placeholder="https://calendly.com/coveragechecknow-scheduling/15min"
                                    style={{
                                        flex: 1,
                                        padding: '0.45rem 0.65rem',
                                        fontSize: '0.8rem',
                                        background: 'var(--bg-surface)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: '6px',
                                        color: 'var(--text-high)',
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={handleSaveCalendlyDefault}
                                    title="Save this Calendly link as default for all future emails"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        padding: '0.45rem 0.65rem',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        borderRadius: '6px',
                                        border: `1px solid ${calendlySaved ? 'var(--semantic-success)' : 'var(--border-default)'}`,
                                        background: calendlySaved ? 'rgba(34,197,94,0.15)' : 'var(--bg-surface)',
                                        color: calendlySaved ? 'var(--semantic-success)' : 'var(--text-high)',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    {calendlySaved ? <Check size={13} style={{ color: 'var(--semantic-success)' }} /> : <Save size={13} />}
                                    <span>{calendlySaved ? 'Saved!' : 'Save Default'}</span>
                                </button>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowAdjuster(prev => !prev)}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                        padding: '0.45rem 0.75rem', borderRadius: '6px',
                                        background: showAdjuster ? 'var(--accent-secondary-muted)' : 'var(--bg-surface)',
                                        color: showAdjuster ? 'var(--accent-secondary)' : 'var(--text-mid)',
                                        border: '1px solid var(--border-default)',
                                        fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    <Sliders size={13} />
                                    <span>{showAdjuster ? 'Hide Fields' : 'Edit Email Fields'}</span>
                                    {showAdjuster ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>

                                <span style={{
                                    fontSize: '0.7rem', color: 'var(--semantic-success)', fontWeight: 600,
                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                    padding: '0.35rem 0.6rem', background: 'rgba(34,197,94,0.1)', borderRadius: '5px'
                                }}>
                                    ● Live Auto-Filled
                                </span>
                            </div>
                        </div>

                        {/* Expandable Variable Editor Drawer */}
                        {showAdjuster && (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: '0.65rem',
                                paddingTop: '0.75rem',
                                borderTop: '1px dashed var(--border-default)',
                            }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px' }}>
                                        CLIENT NAME
                                    </label>
                                    <input
                                        type="text"
                                        value={editableClientName}
                                        onChange={e => setEditableClientName(e.target.value)}
                                        style={{
                                            width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.78rem',
                                            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                                            borderRadius: '6px', color: 'var(--text-high)'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px' }}>
                                        POLICY #
                                    </label>
                                    <input
                                        type="text"
                                        value={editablePolicyNumber}
                                        onChange={e => setEditablePolicyNumber(e.target.value)}
                                        style={{
                                            width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.78rem',
                                            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                                            borderRadius: '6px', color: 'var(--text-high)'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px' }}>
                                        EXPIRATION DATE
                                    </label>
                                    <input
                                        type="text"
                                        value={editableExpirationDate}
                                        onChange={e => setEditableExpirationDate(e.target.value)}
                                        style={{
                                            width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.78rem',
                                            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                                            borderRadius: '6px', color: 'var(--text-high)'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px' }}>
                                        PROPERTY ADDRESS
                                    </label>
                                    <input
                                        type="text"
                                        value={editablePropertyAddress}
                                        onChange={e => setEditablePropertyAddress(e.target.value)}
                                        style={{
                                            width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.78rem',
                                            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                                            borderRadius: '6px', color: 'var(--text-high)'
                                        }}
                                    />
                                </div>

                                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                    <button
                                        type="button"
                                        onClick={handleResetVariables}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                            padding: '0.4rem 0.65rem', borderRadius: '6px',
                                            background: 'transparent', color: 'var(--text-mid)',
                                            border: '1px solid var(--border-default)', fontSize: '0.74rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <RefreshCw size={12} /> Reset Defaults
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Mode Toggle & Template Select */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1rem', alignItems: 'center' }}>
                        
                        {/* Segmented Mode Selector */}
                        <div style={{ display: 'flex', background: 'var(--border-subtle)', padding: '3px', borderRadius: '8px' }}>
                            <button
                                onClick={() => setOutputMode('draft')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                                    padding: '0.45rem 0.85rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                                    cursor: 'pointer', border: 'none',
                                    background: outputMode === 'draft' ? 'var(--bg-surface-raised)' : 'transparent',
                                    color: outputMode === 'draft' ? 'var(--semantic-success)' : 'var(--text-mid)',
                                    boxShadow: outputMode === 'draft' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                }}
                            >
                                <Mail size={14} /> Email Draft
                            </button>
                            <button
                                onClick={() => setOutputMode('copilot')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                                    padding: '0.45rem 0.85rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                                    cursor: 'pointer', border: 'none',
                                    background: outputMode === 'copilot' ? 'var(--bg-surface-raised)' : 'transparent',
                                    color: outputMode === 'copilot' ? 'var(--accent-secondary)' : 'var(--text-mid)',
                                    boxShadow: outputMode === 'copilot' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                }}
                            >
                                <Sparkles size={14} /> CoPilot Prompt
                            </button>
                        </div>

                        {/* Template Select with Sent Badges */}
                        <div style={{ position: 'relative' }}>
                            <select
                                value={selectedTemplateId}
                                onChange={e => {
                                    setSelectedTemplateId(e.target.value);
                                    setJustMarkedSent(false);
                                }}
                                style={{
                                    width: '100%', padding: '0.55rem 0.85rem', background: 'var(--bg-surface-raised)',
                                    border: '1px solid var(--border-default)', borderRadius: '8px',
                                    color: 'var(--text-high)', fontSize: '0.84rem', cursor: 'pointer'
                                }}
                            >
                                {templates.map(t => {
                                    const sentInfo = getTemplateSentInfo(t.id);
                                    return (
                                        <option key={t.id} value={t.id}>
                                            {t.name}{sentInfo ? ` ✓ Sent ${formatSentDate(sentInfo.sent_at)}` : ''}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                    </div>

                    {/* Per-template sent indicator */}
                    {activeTemplateSentInfo && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.45rem 0.85rem', borderRadius: '7px',
                            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                            fontSize: '0.78rem', color: 'var(--semantic-success, #16a34a)',
                        }}>
                            <CheckCircle2 size={14} />
                            <span>
                                <strong>This template was sent</strong> on {formatSentDate(activeTemplateSentInfo.sent_at)}
                            </span>
                        </div>
                    )}

                    {/* ── Preview Sheet with Copy Button ── */}
                    <div style={{ position: 'relative' }}>
                        {/* Inline Copy Button */}
                        <button
                            onClick={handleCopy}
                            title={outputMode === 'draft' ? 'Copy entire email draft' : 'Copy entire CoPilot prompt'}
                            style={{
                                position: 'absolute', top: '0.6rem', right: '0.6rem', zIndex: 2,
                                display: 'flex', alignItems: 'center', gap: '0.3rem',
                                padding: '0.35rem 0.65rem', borderRadius: '6px',
                                background: copied ? 'var(--semantic-success, #16a34a)' : 'var(--bg-surface)',
                                color: copied ? '#fff' : 'var(--text-mid)',
                                border: copied ? 'none' : '1px solid var(--border-default)',
                                cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
                                transition: 'all 0.15s',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                            }}
                        >
                            {copied ? <Check size={12} /> : <Copy size={12} />}
                            {copied ? 'Copied!' : 'Copy All'}
                        </button>

                        {outputMode === 'draft' ? (
                            <div style={{
                                background: 'var(--bg-surface-raised)', color: 'var(--text-high)',
                                padding: '1.25rem', borderRadius: '10px', fontSize: '0.84rem',
                                lineHeight: 1.65, minHeight: '260px', whiteSpace: 'pre-wrap',
                                border: '1px solid var(--border-default)'
                            }}>
                                <div style={{
                                    fontWeight: 700, borderBottom: '1px solid var(--border-default)',
                                    paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '0.9rem',
                                    color: 'var(--text-high)'
                                }}>
                                    Subject: {renderedDraft.subject}
                                </div>
                                {renderedDraft.body}
                            </div>
                        ) : (
                            <div style={{
                                background: 'var(--bg-surface-raised)', color: 'var(--text-high)',
                                padding: '1.25rem', borderRadius: '10px', fontSize: '0.82rem',
                                fontFamily: 'monospace', lineHeight: 1.65, minHeight: '260px',
                                whiteSpace: 'pre-wrap', border: '1px solid var(--border-default)'
                            }}>
                                {renderedPrompt}
                            </div>
                        )}
                    </div>

                </div>

                {/* ── Modal Footer Bar ── */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.9rem 1.5rem', borderTop: '1px solid var(--border-default)',
                    background: 'var(--bg-surface-raised)'
                }}>
                    <div>
                        {rceDownloadUrl && (
                            <a
                                href={rceDownloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                    padding: '0.45rem 0.85rem', borderRadius: '7px', fontSize: '0.76rem', fontWeight: 600,
                                    background: 'var(--accent-secondary-muted)', color: 'var(--accent-secondary)', border: '1px solid var(--border-default)',
                                    textDecoration: 'none'
                                }}
                            >
                                <FileText size={14} /> Download RCE PDF for Manual Attachment
                            </a>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '0.55rem 1rem', borderRadius: '7px', background: 'transparent',
                                color: 'var(--text-mid)', border: '1px solid var(--border-default)', cursor: 'pointer',
                                fontSize: '0.82rem', fontWeight: 500
                            }}
                        >
                            Close
                        </button>

                        {/* Mark as Sent Button */}
                        <button
                            onClick={handleMarkSent}
                            disabled={markingSent || justMarkedSent || !policyId}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.55rem 1.15rem', borderRadius: '7px',
                                background: justMarkedSent ? 'var(--semantic-success, #16a34a)' : 'var(--accent-primary)',
                                color: '#ffffff', border: 'none', cursor: policyId ? 'pointer' : 'not-allowed',
                                fontSize: '0.82rem', fontWeight: 600,
                                opacity: !policyId ? 0.5 : 1,
                                transition: 'all 0.15s'
                            }}
                        >
                            {markingSent ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" /> Marking...
                                </>
                            ) : justMarkedSent ? (
                                <>
                                    <Check size={14} /> Marked as Emailed!
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={14} /> Mark as Emailed
                                </>
                            )}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
