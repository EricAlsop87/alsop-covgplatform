'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Mail, Sparkles, Plus, Check, RotateCcw, Save, Trash2, Sliders, FileText,
    Eye, Shield, Copy, ChevronRight, HelpCircle, Layers, Tag, Info, Zap,
    Edit3, CheckCircle2, XCircle, AlertCircle, X
} from 'lucide-react';
import {
    SystemEmailTemplate,
    TemplateRule,
    getInternalTemplates,
    saveInternalTemplate,
    resetInternalTemplates,
    AVAILABLE_VARIABLES,
    STANDARD_RULES,
    renderInternalDraft,
    renderInternalCopilotPrompt,
    TemplateContext,
} from '@/lib/internalTemplateStore';

// Sample context for live previewing in studio
const SAMPLE_CONTEXT: TemplateContext = {
    clientName: 'Puja Sarna',
    clientEmail: 'puja.sarna@example.com',
    policyNumber: 'CFP-9842104',
    propertyAddress: '1234 Bass Lake Rd, Bass Lake, CA 93604',
    agentName: 'Carlos Paz',
    expirationDate: '07/27/2026',
    effectiveDate: '07/27/2025',
    annualPremium: '$1,850.00',
    paymentMethod: 'Insured Billed',
    reportUrl: 'https://coveragechecknow.com/report/demo-123',
    rceDownloadUrl: 'https://coveragechecknow.com/api/documents/rce-demo.pdf',
    meetingUrl: 'https://calendly.com/coveragechecknow-scheduling/15min',
};

export default function EmailTemplateStudioPage() {
    const [templates, setTemplates] = useState<SystemEmailTemplate[]>([]);
    const [selectedId, setSelectedId] = useState<string>('renewal_review');
    const [activeStudioTab, setActiveStudioTab] = useState<'editor' | 'rules' | 'preview'>('editor');
    
    // Sub-tab inside the Editor: Default to 'copilot' as requested
    const [editorSubTab, setEditorSubTab] = useState<'copilot' | 'draft'>('copilot');

    // Form state for current template
    const [editedTemplate, setEditedTemplate] = useState<SystemEmailTemplate | null>(null);
    const [newRuleLabel, setNewRuleLabel] = useState('');
    const [newRuleInstruction, setNewRuleInstruction] = useState('');
    const [editingRule, setEditingRule] = useState<TemplateRule | null>(null);
    const [savedNotice, setSavedNotice] = useState(false);

    // Load templates on mount
    useEffect(() => {
        const loaded = getInternalTemplates();
        setTemplates(loaded);
        if (loaded.length > 0) {
            setSelectedId(loaded[0].id);
            setEditedTemplate(JSON.parse(JSON.stringify(loaded[0])));
        }
    }, []);

    // Handle template selection
    const handleSelectTemplate = (id: string) => {
        const found = templates.find(t => t.id === id);
        if (found) {
            setSelectedId(id);
            setEditedTemplate(JSON.parse(JSON.stringify(found)));
            setEditingRule(null);
        }
    };

    // Insert variable tag into active input field
    const insertVariableTag = (tag: string, targetField: 'subject' | 'draft' | 'prompt') => {
        if (!editedTemplate) return;
        if (targetField === 'subject') {
            setEditedTemplate({
                ...editedTemplate,
                subjectTemplate: (editedTemplate.subjectTemplate ? editedTemplate.subjectTemplate + ' ' : '') + tag,
            });
        } else if (targetField === 'draft') {
            setEditedTemplate({
                ...editedTemplate,
                draftBodyTemplate: (editedTemplate.draftBodyTemplate ? editedTemplate.draftBodyTemplate + ' ' : '') + tag,
            });
        } else if (targetField === 'prompt') {
            setEditedTemplate({
                ...editedTemplate,
                copilotPromptTemplate: (editedTemplate.copilotPromptTemplate ? editedTemplate.copilotPromptTemplate + ' ' : '') + tag,
            });
        }
    };

    // Toggle rule enabled/disabled
    const handleToggleRule = (ruleId: string) => {
        if (!editedTemplate) return;
        const updatedRules = editedTemplate.rules.map(r => 
            r.id === ruleId ? { ...r, enabled: !r.enabled } : r
        );
        setEditedTemplate({ ...editedTemplate, rules: updatedRules });
    };

    // Add new custom rule
    const handleAddCustomRule = () => {
        if (!editedTemplate || !newRuleLabel.trim() || !newRuleInstruction.trim()) return;
        const newRule: TemplateRule = {
            id: 'custom_' + Date.now(),
            label: newRuleLabel.trim(),
            instruction: newRuleInstruction.trim(),
            enabled: true,
        };
        setEditedTemplate({
            ...editedTemplate,
            rules: [...editedTemplate.rules, newRule],
        });
        setNewRuleLabel('');
        setNewRuleInstruction('');
    };

    // Delete rule
    const handleDeleteRule = (ruleId: string) => {
        if (!editedTemplate) return;
        const updatedRules = editedTemplate.rules.filter(r => r.id !== ruleId);
        setEditedTemplate({ ...editedTemplate, rules: updatedRules });
        if (editingRule?.id === ruleId) {
            setEditingRule(null);
        }
    };

    // Save edited rule
    const handleSaveEditedRule = () => {
        if (!editedTemplate || !editingRule || !editingRule.label.trim() || !editingRule.instruction.trim()) return;
        const updatedRules = editedTemplate.rules.map(r => 
            r.id === editingRule.id ? { ...editingRule, label: editingRule.label.trim(), instruction: editingRule.instruction.trim() } : r
        );
        setEditedTemplate({ ...editedTemplate, rules: updatedRules });
        setEditingRule(null);
    };

    // Save template to internal store
    const handleSave = () => {
        if (!editedTemplate) return;
        saveInternalTemplate(editedTemplate);
        const updatedList = getInternalTemplates();
        setTemplates(updatedList);
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 2500);
    };

    // Create new custom template
    const handleCreateNewTemplate = () => {
        const newId = 'custom_template_' + Date.now();
        const newTpl: SystemEmailTemplate = {
            id: newId,
            name: 'New Custom Template',
            category: 'custom',
            description: 'Custom agency email outreach and CoPilot template.',
            subjectTemplate: '{{first_name}}, Important Notice regarding Policy Ending in {{policy_last4}}',
            draftBodyTemplate: 'Hi {{first_name}},\n\n[Write your custom message here]\n\nBest regards,\nAlsop & Associates Insurance Agency\n(909) 626-5000 | support@coveragechecknow.com',
            copilotPromptTemplate: `Act as an expert insurance communications specialist writing on behalf of Alsop & Associates Insurance Agency.\n\nTASK: Draft a custom email for {{client_name}} regarding policy ending in {{policy_last4}}.\n\nCLIENT DETAILS:\n- Client Name: {{client_name}}\n- Policy Identification: Policy ending in {{policy_last4}} (Full: {{policy_number}})\n- Property Address: {{property_address}}\n\nSTRICT AGENCY RULES:\n1. Explicitly state that NO changes have been made to the client's policy pre-review.\n2. Refer to the policy as "policy ending in {{policy_last4}}". Do NOT enclose policy numbers in parentheses or include term suffixes.\n3. Prioritize scheduling via Calendly {{meeting_url}} (cleanly spaced, no trailing period), with office phone (909) 626-5000 secondarily for immediate assistance.\n4. Sign off ONLY as "Alsop & Associates Insurance Agency" with phone (909) 626-5000 | support@coveragechecknow.com.\n5. Keep concise and under 180 words.\n6. Output ONLY the Subject line and email body ready to send.`,
            rules: [...STANDARD_RULES],
            variables: ['{{first_name}}', '{{client_name}}', '{{policy_last4}}', '{{policy_ending}}', '{{policy_number}}', '{{property_address}}', '{{agent_name}}', '{{meeting_url}}'],
            isSystemDefault: false,
        };
        saveInternalTemplate(newTpl);
        const updated = getInternalTemplates();
        setTemplates(updated);
        setSelectedId(newId);
        setEditedTemplate(newTpl);
        setEditorSubTab('copilot');
    };

    // Reset to factory defaults
    const handleResetAll = () => {
        if (confirm('Are you sure you want to reset all templates to system defaults? Custom changes will be restored to original factory blueprints.')) {
            resetInternalTemplates();
            const reloaded = getInternalTemplates();
            setTemplates(reloaded);
            if (reloaded.length > 0) {
                setSelectedId(reloaded[0].id);
                setEditedTemplate(JSON.parse(JSON.stringify(reloaded[0])));
            }
        }
    };

    const renderedDraft = useMemo(() => {
        if (!editedTemplate) return { subject: '', body: '' };
        return renderInternalDraft(editedTemplate, SAMPLE_CONTEXT);
    }, [editedTemplate]);

    const renderedCopilotPrompt = useMemo(() => {
        if (!editedTemplate) return '';
        return renderInternalCopilotPrompt(editedTemplate, SAMPLE_CONTEXT);
    }, [editedTemplate]);

    return (
        <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', color: 'var(--text-high)' }}>
            
            {/* ── Page Header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Mail style={{ color: 'var(--accent-primary)' }} />
                        Email Center & CoPilot Studio
                    </h1>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-mid)', margin: '0.25rem 0 0 0' }}>
                        Configure the Allstate CoPilot prompt templates, agency guardrail rules, and default draft email structures.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={handleResetAll}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.5rem 0.9rem', borderRadius: '7px',
                            background: 'transparent', color: 'var(--text-mid)',
                            border: '1px solid var(--border-default)', cursor: 'pointer',
                            fontSize: '0.8rem', fontWeight: 500,
                        }}
                    >
                        <RotateCcw size={14} />
                        Reset Defaults
                    </button>
                    <button
                        onClick={handleCreateNewTemplate}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.5rem 1rem', borderRadius: '7px',
                            background: 'var(--accent-primary)', color: 'var(--text-inverse)',
                            border: 'none', cursor: 'pointer',
                            fontSize: '0.82rem', fontWeight: 600,
                            boxShadow: '0 1px 3px rgba(34, 67, 182, 0.25)',
                        }}
                    >
                        <Plus size={14} />
                        New Template
                    </button>
                </div>
            </div>

            {/* ── Main Studio Grid ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem' }}>
                
                {/* ── Left Sidebar: Template Navigation ── */}
                <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    display: 'flex', flexDirection: 'column', gap: '1rem',
                    boxShadow: 'var(--shadow-sm)',
                    height: 'fit-content',
                }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Agency Templates ({templates.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {templates.map(t => {
                            const isSelected = t.id === selectedId;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => handleSelectTemplate(t.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '0.75rem 0.85rem', borderRadius: '8px', textAlign: 'left',
                                        cursor: 'pointer', border: '1px solid',
                                        background: isSelected ? 'var(--accent-primary-muted)' : 'var(--bg-surface-raised)',
                                        borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-default)',
                                        color: isSelected ? 'var(--accent-primary)' : 'var(--text-mid)',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    <div>
                                        <div style={{ fontSize: '0.84rem', fontWeight: isSelected ? 700 : 600, color: isSelected ? 'var(--accent-primary)' : 'var(--text-high)' }}>
                                            {t.name}
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                            {t.category.toUpperCase()} • {t.rules.filter(r => r.enabled).length} Active Rules
                                        </div>
                                    </div>
                                    <ChevronRight size={14} style={{ opacity: isSelected ? 1 : 0.4 }} />
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Main Panel: Studio Workbench ── */}
                {editedTemplate ? (
                    <div style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '12px',
                        display: 'flex', flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: 'var(--shadow-sm)',
                    }}>
                        
                        {/* Workbench Header */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderBottom: '1px solid var(--border-default)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: 'var(--bg-surface-raised)',
                        }}>
                            <div>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-high)' }}>
                                    {editedTemplate.name}
                                </h2>
                                <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>
                                    {editedTemplate.description}
                                </p>
                            </div>

                            {/* Segmented Top-Level Tab Controls */}
                            <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--bg-surface)', padding: '3px', borderRadius: '7px', border: '1px solid var(--border-default)' }}>
                                <button
                                    onClick={() => setActiveStudioTab('editor')}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                                        padding: '0.4rem 0.8rem', borderRadius: '5px', fontSize: '0.76rem', fontWeight: 600,
                                        cursor: 'pointer', border: 'none',
                                        background: activeStudioTab === 'editor' ? 'var(--bg-surface-raised)' : 'transparent',
                                        color: activeStudioTab === 'editor' ? 'var(--accent-primary)' : 'var(--text-muted)',
                                        boxShadow: activeStudioTab === 'editor' ? 'var(--shadow-sm)' : 'none',
                                    }}
                                >
                                    <FileText size={13} /> Template Editor
                                </button>
                                <button
                                    onClick={() => setActiveStudioTab('rules')}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                                        padding: '0.4rem 0.8rem', borderRadius: '5px', fontSize: '0.76rem', fontWeight: 600,
                                        cursor: 'pointer', border: 'none',
                                        background: activeStudioTab === 'rules' ? 'var(--bg-surface-raised)' : 'transparent',
                                        color: activeStudioTab === 'rules' ? 'var(--accent-primary)' : 'var(--text-muted)',
                                        boxShadow: activeStudioTab === 'rules' ? 'var(--shadow-sm)' : 'none',
                                    }}
                                >
                                    <Sliders size={13} /> Rules ({editedTemplate.rules.filter(r => r.enabled).length})
                                </button>
                                <button
                                    onClick={() => setActiveStudioTab('preview')}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                                        padding: '0.4rem 0.8rem', borderRadius: '5px', fontSize: '0.76rem', fontWeight: 600,
                                        cursor: 'pointer', border: 'none',
                                        background: activeStudioTab === 'preview' ? 'var(--bg-surface-raised)' : 'transparent',
                                        color: activeStudioTab === 'preview' ? 'var(--accent-primary)' : 'var(--text-muted)',
                                        boxShadow: activeStudioTab === 'preview' ? 'var(--shadow-sm)' : 'none',
                                    }}
                                >
                                    <Eye size={13} /> Live Preview
                                </button>
                            </div>
                        </div>

                        {/* ── Studio Body ── */}
                        <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
                            
                            {/* ════════════════════════════════════════════════════════════════ */}
                            {/* ── TAB 1: TEMPLATE EDITOR ── */}
                            {/* ════════════════════════════════════════════════════════════════ */}
                            {activeStudioTab === 'editor' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    
                                    {/* Template Metadata Header Row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                Template Name
                                            </label>
                                            <input
                                                type="text"
                                                value={editedTemplate.name}
                                                onChange={e => setEditedTemplate({ ...editedTemplate, name: e.target.value })}
                                                style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)', borderRadius: '7px', color: 'var(--text-high)', fontSize: '0.85rem', outline: 'none' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                Category
                                            </label>
                                            <select
                                                value={editedTemplate.category}
                                                onChange={e => setEditedTemplate({ ...editedTemplate, category: e.target.value as any })}
                                                style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)', borderRadius: '7px', color: 'var(--text-high)', fontSize: '0.85rem', cursor: 'pointer', outline: 'none' }}
                                            >
                                                <option value="renewal">Renewal Notice</option>
                                                <option value="rce">RCE Property Data</option>
                                                <option value="recommendations">Coverage Recommendations</option>
                                                <option value="review">Coverage Review</option>
                                                <option value="custom">Custom</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* ── Sub-Tab Switcher: CoPilot Prompt vs Email Draft ── */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        borderBottom: '2px solid var(--border-default)', paddingBottom: '0.5rem', marginTop: '0.25rem',
                                    }}>
                                        <button
                                            onClick={() => setEditorSubTab('copilot')}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                padding: '0.45rem 1rem', borderRadius: '6px',
                                                fontSize: '0.82rem', fontWeight: editorSubTab === 'copilot' ? 700 : 500,
                                                background: editorSubTab === 'copilot' ? 'var(--accent-primary-muted)' : 'transparent',
                                                color: editorSubTab === 'copilot' ? 'var(--accent-primary)' : 'var(--text-mid)',
                                                border: `1px solid ${editorSubTab === 'copilot' ? 'var(--accent-primary)' : 'transparent'}`,
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                            }}
                                        >
                                            <Sparkles size={14} />
                                            <span>CoPilot Prompt Template</span>
                                            <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'var(--accent-primary)', color: '#fff', fontWeight: 700 }}>
                                                Default Workflow
                                            </span>
                                        </button>

                                        <button
                                            onClick={() => setEditorSubTab('draft')}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                padding: '0.45rem 1rem', borderRadius: '6px',
                                                fontSize: '0.82rem', fontWeight: editorSubTab === 'draft' ? 700 : 500,
                                                background: editorSubTab === 'draft' ? 'var(--bg-success-subtle)' : 'transparent',
                                                color: editorSubTab === 'draft' ? 'var(--status-success)' : 'var(--text-mid)',
                                                border: `1px solid ${editorSubTab === 'draft' ? 'var(--status-success)' : 'transparent'}`,
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                            }}
                                        >
                                            <Mail size={14} />
                                            <span>Email Subject & Draft Body</span>
                                        </button>
                                    </div>

                                    {/* ── SUB-VIEW 1: COPILOT PROMPT TEMPLATE (DEFAULT VIEW) ── */}
                                    {editorSubTab === 'copilot' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {/* Informational Callout */}
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                padding: '0.65rem 0.85rem', borderRadius: '7px',
                                                background: 'var(--bg-info-subtle)', border: '1px solid rgba(0,181,190,0.2)',
                                                fontSize: '0.75rem', color: 'var(--text-mid)',
                                            }}>
                                                <Info size={14} style={{ color: 'var(--status-info)', flexShrink: 0 }} />
                                                <span>
                                                    <strong>CoPilot Prompt Workflow:</strong> Editing this template directly updates the CoPilot instructions generated when reviewing policies. Agents copy this into Allstate CoPilot to draft client communications.
                                                </span>
                                            </div>

                                            {/* Variable Chip Insertion Palette for CoPilot */}
                                            <div style={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '0.75rem 0.85rem' }}>
                                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <Tag size={12} /> Click to Insert Dynamic Variable into CoPilot Prompt
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                    {AVAILABLE_VARIABLES.map(v => (
                                                        <button
                                                            key={v.tag}
                                                            onClick={() => insertVariableTag(v.tag, 'prompt')}
                                                            title={v.description}
                                                            style={{
                                                                padding: '0.2rem 0.5rem', borderRadius: '5px', fontSize: '0.72rem',
                                                                background: 'var(--accent-primary-muted)', color: 'var(--accent-primary)',
                                                                border: '1px solid rgba(34, 67, 182, 0.15)', cursor: 'pointer',
                                                                fontWeight: 500,
                                                            }}
                                                        >
                                                            {v.tag}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* CoPilot Prompt Editor Area */}
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                        <Sparkles size={13} /> CoPilot Prompt Template (Allstate CoPilot Instructions)
                                                    </label>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                        Plaintext with dynamic variable tags
                                                    </span>
                                                </div>
                                                <textarea
                                                    rows={16}
                                                    value={editedTemplate.copilotPromptTemplate}
                                                    onChange={e => setEditedTemplate({ ...editedTemplate, copilotPromptTemplate: e.target.value })}
                                                    placeholder="Enter Allstate CoPilot prompt instructions..."
                                                    style={{
                                                        width: '100%', padding: '0.85rem', background: 'var(--bg-surface-raised)',
                                                        border: '1.5px solid var(--border-default)', borderRadius: '8px',
                                                        color: 'var(--text-high)', fontSize: '0.82rem', fontFamily: 'monospace',
                                                        lineHeight: 1.6, outline: 'none', resize: 'vertical',
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* ── SUB-VIEW 2: EMAIL DRAFT & SUBJECT STRUCTURE ── */}
                                    {editorSubTab === 'draft' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {/* Variable Chip Insertion Palette for Draft */}
                                            <div style={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '0.75rem 0.85rem' }}>
                                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--status-success)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <Tag size={12} /> Click to Insert Dynamic Variable into Email Draft
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                    {AVAILABLE_VARIABLES.map(v => (
                                                        <button
                                                            key={v.tag}
                                                            onClick={() => insertVariableTag(v.tag, 'draft')}
                                                            title={v.description}
                                                            style={{
                                                                padding: '0.2rem 0.5rem', borderRadius: '5px', fontSize: '0.72rem',
                                                                background: 'var(--bg-success-subtle)', color: 'var(--status-success)',
                                                                border: '1px solid rgba(43, 155, 75, 0.2)', cursor: 'pointer',
                                                                fontWeight: 500,
                                                            }}
                                                        >
                                                            {v.tag}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Subject Line Template */}
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-high)', display: 'block', marginBottom: '0.35rem' }}>
                                                    Email Subject Line Template
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editedTemplate.subjectTemplate}
                                                    onChange={e => setEditedTemplate({ ...editedTemplate, subjectTemplate: e.target.value })}
                                                    placeholder="Subject line with {{variables}}..."
                                                    style={{
                                                        width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-surface-raised)',
                                                        border: '1px solid var(--border-default)', borderRadius: '7px',
                                                        color: 'var(--text-high)', fontSize: '0.85rem', outline: 'none',
                                                    }}
                                                />
                                            </div>

                                            {/* Draft Email Body Editor */}
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--status-success)', display: 'block', marginBottom: '0.35rem' }}>
                                                    Generated Email Draft Body Structure
                                                </label>
                                                <textarea
                                                    rows={12}
                                                    value={editedTemplate.draftBodyTemplate}
                                                    onChange={e => setEditedTemplate({ ...editedTemplate, draftBodyTemplate: e.target.value })}
                                                    placeholder="Draft email body structure with {{variables}}..."
                                                    style={{
                                                        width: '100%', padding: '0.85rem', background: 'var(--bg-surface-raised)',
                                                        border: '1px solid var(--border-default)', borderRadius: '8px',
                                                        color: 'var(--text-high)', fontSize: '0.82rem', fontFamily: 'monospace',
                                                        lineHeight: 1.6, outline: 'none', resize: 'vertical',
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                </div>
                            )}

                            {/* ════════════════════════════════════════════════════════════════ */}
                            {/* ── TAB 2: RULES ENGINE (EDITABLE, ADDABLE, MUTABLE, DELETABLE) ── */}
                            {/* ════════════════════════════════════════════════════════════════ */}
                            {activeStudioTab === 'rules' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-mid)', lineHeight: 1.5 }}>
                                        Rules configured here are automatically enforced across the agency. Active rules are injected into both the email drafts and the CoPilot prompt generation pipeline.
                                    </div>

                                    {/* Active Rules List */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {editedTemplate.rules.map(r => (
                                            <div
                                                key={r.id}
                                                style={{
                                                    padding: '1rem', borderRadius: '8px',
                                                    background: r.enabled ? 'var(--bg-surface-raised)' : 'var(--bg-surface)',
                                                    border: `1.5px solid ${r.enabled ? 'rgba(43, 155, 75, 0.3)' : 'var(--border-default)'}`,
                                                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem',
                                                    boxShadow: r.enabled ? 'var(--shadow-sm)' : 'none',
                                                    opacity: r.enabled ? 1 : 0.65,
                                                    transition: 'all 0.15s ease',
                                                }}
                                            >
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-high)' }}>
                                                            {r.label}
                                                        </div>
                                                        {r.enabled ? (
                                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-success-subtle)', color: 'var(--status-success)', fontWeight: 700 }}>
                                                                ENABLED
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border-default)', fontWeight: 600 }}>
                                                                DISABLED
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-mid)', marginTop: '0.3rem', lineHeight: 1.5 }}>
                                                        {r.instruction}
                                                    </div>
                                                </div>

                                                {/* Rule Actions */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                                                    {/* Toggle Button with High-Contrast UI States */}
                                                    <button
                                                        onClick={() => handleToggleRule(r.id)}
                                                        title={r.enabled ? 'Click to disable rule' : 'Click to enable rule'}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                                            padding: '0.35rem 0.85rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                                                            cursor: 'pointer', transition: 'all 0.15s ease',
                                                            background: r.enabled ? 'var(--status-success)' : 'var(--bg-surface-raised)',
                                                            color: r.enabled ? '#ffffff' : 'var(--text-muted)',
                                                            border: `1px solid ${r.enabled ? 'var(--status-success)' : 'var(--border-default)'}`,
                                                            boxShadow: r.enabled ? '0 1px 3px rgba(43, 155, 75, 0.25)' : 'none',
                                                        }}
                                                    >
                                                        {r.enabled ? (
                                                            <><Check size={12} strokeWidth={3} /> Active Rule</>
                                                        ) : (
                                                            <>○ Disabled</>
                                                        )}
                                                    </button>

                                                    {/* Edit Rule Button */}
                                                    <button
                                                        onClick={() => setEditingRule({ ...r })}
                                                        title="Edit Rule Title & Instruction"
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                            padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem',
                                                            background: 'var(--bg-surface-raised)', color: 'var(--text-mid)',
                                                            border: '1px solid var(--border-default)', cursor: 'pointer',
                                                        }}
                                                    >
                                                        <Edit3 size={13} />
                                                        <span>Edit</span>
                                                    </button>

                                                    {/* Delete Rule Button */}
                                                    <button
                                                        onClick={() => handleDeleteRule(r.id)}
                                                        title="Delete this rule"
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center',
                                                            padding: '0.35rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem',
                                                            background: 'var(--bg-surface-raised)', color: 'var(--status-error)',
                                                            border: '1px solid var(--border-default)', cursor: 'pointer',
                                                        }}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Add Custom Rule Form */}
                                    <div style={{ marginTop: '0.75rem', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '1rem', boxShadow: 'var(--shadow-sm)' }}>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-high)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <Plus size={14} style={{ color: 'var(--accent-primary)' }} /> Add New Custom Template Rule
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '0.75rem', alignItems: 'flex-end' }}>
                                            <div>
                                                <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                                    Rule Name / Title
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Include Secondary Contact"
                                                    value={newRuleLabel}
                                                    onChange={e => setNewRuleLabel(e.target.value)}
                                                    style={{ width: '100%', padding: '0.45rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-high)', fontSize: '0.8rem', outline: 'none' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                                    Instruction Text for AI & Drafts
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Always request client permission before adjusting dwelling limits."
                                                    value={newRuleInstruction}
                                                    onChange={e => setNewRuleInstruction(e.target.value)}
                                                    style={{ width: '100%', padding: '0.45rem 0.65rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-high)', fontSize: '0.8rem', outline: 'none' }}
                                                />
                                            </div>
                                            <button
                                                onClick={handleAddCustomRule}
                                                disabled={!newRuleLabel.trim() || !newRuleInstruction.trim()}
                                                style={{
                                                    padding: '0.45rem 0.9rem', borderRadius: '6px',
                                                    background: newRuleLabel.trim() && newRuleInstruction.trim() ? 'var(--accent-primary)' : 'var(--border-default)',
                                                    color: '#fff', border: 'none',
                                                    cursor: newRuleLabel.trim() && newRuleInstruction.trim() ? 'pointer' : 'not-allowed',
                                                    fontSize: '0.8rem', fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                                                }}
                                            >
                                                <Plus size={13} /> Add Rule
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ════════════════════════════════════════════════════════════════ */}
                            {/* ── TAB 3: LIVE PREVIEW ── */}
                            {/* ════════════════════════════════════════════════════════════════ */}
                            {activeStudioTab === 'preview' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                    
                                    {/* CoPilot Prompt Preview */}
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <Sparkles size={13} /> Interpolated CoPilot Prompt (Sample Policy)
                                        </div>
                                        <div style={{
                                            background: 'var(--bg-surface-raised)', color: 'var(--text-high)',
                                            padding: '1.25rem', borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'monospace',
                                            lineHeight: 1.6, minHeight: '340px', whiteSpace: 'pre-wrap', border: '1px solid var(--border-default)',
                                            boxShadow: 'var(--shadow-sm)',
                                        }}>
                                            {renderedCopilotPrompt}
                                        </div>
                                    </div>

                                    {/* Email Draft Preview */}
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--status-success)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <Mail size={13} /> Interpolated Email Draft (Sample Policy)
                                        </div>
                                        <div style={{
                                            background: 'var(--bg-surface-raised)', color: 'var(--text-high)',
                                            padding: '1.25rem', borderRadius: '8px', fontSize: '0.82rem',
                                            lineHeight: 1.65, minHeight: '340px', whiteSpace: 'pre-wrap', border: '1px solid var(--border-default)',
                                            boxShadow: 'var(--shadow-sm)',
                                        }}>
                                            <div style={{ fontWeight: 700, borderBottom: '1px solid var(--border-default)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '0.88rem' }}>
                                                Subject: {renderedDraft.subject}
                                            </div>
                                            {renderedDraft.body}
                                        </div>
                                    </div>

                                </div>
                            )}

                        </div>

                        {/* Workbench Action Footer */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderTop: '1px solid var(--border-default)',
                            background: 'var(--bg-surface-raised)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {savedNotice ? (
                                    <span style={{ color: 'var(--status-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <Check size={14} strokeWidth={3} /> Template & rules saved! Changes take effect immediately on all policy CoPilot prompts.
                                    </span>
                                ) : (
                                    'Saved changes apply immediately to all generated drafts and policy CoPilot prompts.'
                                )}
                            </div>
                            <button
                                onClick={handleSave}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    padding: '0.55rem 1.25rem', borderRadius: '7px',
                                    background: 'var(--accent-primary)', color: 'var(--text-inverse)',
                                    border: 'none', cursor: 'pointer',
                                    fontSize: '0.84rem', fontWeight: 600,
                                    boxShadow: '0 1px 3px rgba(34, 67, 182, 0.25)',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <Save size={14} />
                                Save Template
                            </button>
                        </div>

                    </div>
                ) : null}

            </div>

            {/* ─── Modal: Edit Rule Details ─── */}
            {editingRule && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                }}>
                    <div style={{
                        background: 'var(--bg-surface-raised)', borderRadius: '10px',
                        border: '1px solid var(--border-strong)', padding: '1.25rem',
                        maxWidth: '480px', width: '100%', boxShadow: 'var(--shadow-overlay)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'var(--accent-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Sliders size={16} style={{ color: 'var(--accent-primary)' }} />
                                </div>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-high)' }}>Edit Template Rule</h3>
                            </div>
                            <button
                                onClick={() => setEditingRule(null)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                    Rule Title / Label
                                </label>
                                <input
                                    type="text"
                                    value={editingRule.label}
                                    onChange={e => setEditingRule({ ...editingRule, label: e.target.value })}
                                    style={{
                                        width: '100%', padding: '0.5rem 0.65rem', fontSize: '0.82rem',
                                        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                                        borderRadius: '6px', color: 'var(--text-high)', outline: 'none',
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                    Rule Instruction Text
                                </label>
                                <textarea
                                    rows={4}
                                    value={editingRule.instruction}
                                    onChange={e => setEditingRule({ ...editingRule, instruction: e.target.value })}
                                    style={{
                                        width: '100%', padding: '0.5rem 0.65rem', fontSize: '0.82rem',
                                        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                                        borderRadius: '6px', color: 'var(--text-high)', outline: 'none',
                                        lineHeight: 1.5, resize: 'vertical',
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button
                                onClick={() => setEditingRule(null)}
                                style={{
                                    padding: '0.45rem 0.85rem', borderRadius: '6px',
                                    background: 'transparent', border: '1px solid var(--border-default)',
                                    color: 'var(--text-mid)', fontSize: '0.78rem', cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEditedRule}
                                disabled={!editingRule.label.trim() || !editingRule.instruction.trim()}
                                style={{
                                    padding: '0.45rem 1rem', borderRadius: '6px',
                                    background: 'var(--accent-primary)', color: 'var(--text-inverse)',
                                    border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                Update Rule
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
