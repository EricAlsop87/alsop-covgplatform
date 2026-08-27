'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    FileText, GripVertical, Eye, EyeOff, ChevronDown, ChevronRight,
    Save, RotateCcw, ArrowLeft, Check, ShieldCheck, Sliders, MessageSquare,
    Layers, Building2, Search, ArrowUp, ArrowDown, AlertTriangle, ShieldAlert,
    Info, Sparkles, CheckCircle2, RefreshCw, Loader2, BookOpen, Shield
} from 'lucide-react';
import Link from 'next/link';
import {
    ReportTemplateConfig, ReportSectionConfig, ReportTone,
    fetchReportTemplateConfig, saveReportTemplateConfig,
    DEFAULT_REPORT_CONFIG, FlagDefinition, fetchAllFlagDefinitions,
    batchUpdateFlagReportSettings, FlagReportSettingsUpdate,
    getLatestReportConfigVersion
} from '@/lib/api';
import styles from './page.module.css';

type ActiveTab = 'sections' | 'tone_rules' | 'flag_matrix' | 'branding' | 'preview';

const CATEGORY_CONFIG: Record<string, { label: string; order: number; color: string }> = {
    coverage_gap: { label: 'Coverage Gap', order: 0, color: '#ef4444' },
    dic: { label: 'DIC Companion', order: 1, color: '#3b82f6' },
    property_observation: { label: 'Property Observation', order: 2, color: '#8b5cf6' },
    data_quality: { label: 'Data Quality', order: 3, color: '#f59e0b' },
    renewal: { label: 'Renewal', order: 4, color: '#10b981' },
    parser: { label: 'Parser', order: 5, color: '#64748b' },
    duplicate: { label: 'Duplicate', order: 6, color: '#64748b' },
    manual: { label: 'Manual', order: 7, color: '#64748b' },
};

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function ReportEditorPage() {
    const [activeTab, setActiveTab] = useState<ActiveTab>('sections');
    const [config, setConfig] = useState<ReportTemplateConfig>(DEFAULT_REPORT_CONFIG);
    const [flagDefs, setFlagDefs] = useState<FlagDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [configVersion, setConfigVersion] = useState<number>(1);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string>('');

    // Flag matrix local state
    const [flagSearch, setFlagSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [flagFilter, setFlagFilter] = useState<'all' | 'reported' | 'suppressed'>('all');
    const [flagEdits, setFlagEdits] = useState<Map<string, { report_enabled: boolean; report_prompt_hint: string | null }>>(new Map());

    // Track unsaved configuration changes
    const [hasConfigChanges, setHasConfigChanges] = useState(false);

    // Initial Load
    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                const [cfg, flags, ver] = await Promise.all([
                    fetchReportTemplateConfig(),
                    fetchAllFlagDefinitions(),
                    getLatestReportConfigVersion(),
                ]);

                if (cfg) {
                    setConfig(cfg);
                    setConfigVersion(cfg.version_number || ver?.version_number || 1);
                    setLastUpdatedAt(cfg.updated_at || ver?.changed_at || '');
                }
                setFlagDefs(flags || []);
                setFlagEdits(new Map());
            } catch (err) {
                console.error('Failed to load report editor data', err);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    // ─── Section Reorder & Visibility Handlers ───
    const toggleSectionEnabled = (id: string) => {
        setConfig(prev => ({
            ...prev,
            sections: prev.sections.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s),
        }));
        setHasConfigChanges(true);
    };

    const moveSection = (idx: number, direction: 'up' | 'down') => {
        if (direction === 'up' && idx === 0) return;
        if (direction === 'down' && idx === config.sections.length - 1) return;

        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        const newSections = [...config.sections];
        const [moved] = newSections.splice(idx, 1);
        newSections.splice(targetIdx, 0, moved);

        setConfig(prev => ({
            ...prev,
            sections: newSections.map((s, i) => ({ ...s, order: i })),
        }));
        setHasConfigChanges(true);
    };

    const updateSectionLabel = (id: string, label: string) => {
        setConfig(prev => ({
            ...prev,
            sections: prev.sections.map(s => s.id === id ? { ...s, label } : s),
        }));
        setHasConfigChanges(true);
    };

    const updateSectionDescription = (id: string, description: string) => {
        setConfig(prev => ({
            ...prev,
            sections: prev.sections.map(s => s.id === id ? { ...s, description } : s),
        }));
        setHasConfigChanges(true);
    };

    // ─── Tone & Rules Handlers ───
    const setTone = (tone: ReportTone) => {
        setConfig(prev => ({ ...prev, tone }));
        setHasConfigChanges(true);
    };

    const toggleRule = (ruleKey: keyof ReportTemplateConfig['rules']) => {
        setConfig(prev => ({
            ...prev,
            rules: {
                ...prev.rules,
                [ruleKey]: !prev.rules[ruleKey],
            },
        }));
        setHasConfigChanges(true);
    };

    const setCustomDirectives = (custom_prompt_directives: string) => {
        setConfig(prev => ({ ...prev, custom_prompt_directives }));
        setHasConfigChanges(true);
    };

    // ─── Branding Handlers ───
    const updateBranding = (field: keyof ReportTemplateConfig['branding'], value: string) => {
        setConfig(prev => ({
            ...prev,
            branding: {
                ...prev.branding,
                [field]: value,
            },
        }));
        setHasConfigChanges(true);
    };

    // ─── Flag Matrix Handlers ───
    const getEffectiveFlag = useCallback((def: FlagDefinition) => {
        const edit = flagEdits.get(def.code);
        return {
            report_enabled: edit?.report_enabled ?? def.report_enabled ?? false,
            report_prompt_hint: edit?.report_prompt_hint ?? def.report_prompt_hint ?? '',
        };
    }, [flagEdits]);

    const toggleFlagReporting = (code: string) => {
        setFlagEdits(prev => {
            const next = new Map(prev);
            const def = flagDefs.find(d => d.code === code);
            if (!def) return next;
            const current = next.get(code) || {
                report_enabled: def.report_enabled ?? false,
                report_prompt_hint: def.report_prompt_hint ?? null,
            };
            next.set(code, { ...current, report_enabled: !current.report_enabled });
            return next;
        });
        setHasConfigChanges(true);
    };

    const updateFlagHint = (code: string, hint: string) => {
        setFlagEdits(prev => {
            const next = new Map(prev);
            const def = flagDefs.find(d => d.code === code);
            if (!def) return next;
            const current = next.get(code) || {
                report_enabled: def.report_enabled ?? false,
                report_prompt_hint: def.report_prompt_hint ?? null,
            };
            next.set(code, { ...current, report_prompt_hint: hint || null });
            return next;
        });
        setHasConfigChanges(true);
    };

    const bulkToggleCategory = (category: string, enable: boolean) => {
        setFlagEdits(prev => {
            const next = new Map(prev);
            flagDefs.filter(d => d.category === category).forEach(d => {
                const current = next.get(d.code) || {
                    report_enabled: d.report_enabled ?? false,
                    report_prompt_hint: d.report_prompt_hint ?? null,
                };
                next.set(d.code, { ...current, report_enabled: enable });
            });
            return next;
        });
        setHasConfigChanges(true);
    };

    // Filtered Flag Definitions
    const filteredFlags = useMemo(() => {
        return flagDefs.filter(d => {
            if (selectedCategory !== 'all' && d.category !== selectedCategory) return false;
            const eff = getEffectiveFlag(d);
            if (flagFilter === 'reported' && !eff.report_enabled) return false;
            if (flagFilter === 'suppressed' && eff.report_enabled) return false;
            if (flagSearch) {
                const term = flagSearch.toLowerCase();
                const matchCode = d.code.toLowerCase().includes(term);
                const matchLabel = d.label.toLowerCase().includes(term);
                const matchDesc = (d.description || '').toLowerCase().includes(term);
                const matchHint = (eff.report_prompt_hint || '').toLowerCase().includes(term);
                if (!matchCode && !matchLabel && !matchDesc && !matchHint) return false;
            }
            return true;
        });
    }, [flagDefs, selectedCategory, flagFilter, flagSearch, getEffectiveFlag]);

    // Categories with counts
    const categoryStats = useMemo(() => {
        const stats: Record<string, { total: number; reported: number }> = {};
        flagDefs.forEach(d => {
            const cat = d.category;
            if (!stats[cat]) stats[cat] = { total: 0, reported: 0 };
            stats[cat].total++;
            if (getEffectiveFlag(d).report_enabled) stats[cat].reported++;
        });
        return stats;
    }, [flagDefs, getEffectiveFlag]);

    const totalReportedFlags = useMemo(() => {
        return flagDefs.filter(d => getEffectiveFlag(d).report_enabled).length;
    }, [flagDefs, getEffectiveFlag]);

    // ─── Save All Handler ───
    const handleSaveAll = async () => {
        setSaving(true);
        try {
            // 1. Save template config
            const configResult = await saveReportTemplateConfig(config);

            // 2. Save flag edits if any
            if (flagEdits.size > 0) {
                const updates: FlagReportSettingsUpdate[] = [];
                flagEdits.forEach((edit, code) => {
                    updates.push({
                        code,
                        report_enabled: edit.report_enabled,
                        report_prompt_hint: edit.report_prompt_hint,
                    });
                });
                await batchUpdateFlagReportSettings(updates);
                const refreshed = await fetchAllFlagDefinitions();
                setFlagDefs(refreshed);
                setFlagEdits(new Map());
            }

            if (configResult.success && configResult.config) {
                setConfig(configResult.config);
                setConfigVersion(configResult.config.version_number || configVersion + 1);
                setLastUpdatedAt(configResult.config.updated_at || new Date().toISOString());
            }

            setSaved(true);
            setHasConfigChanges(false);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error('Failed to save report configuration', err);
            alert('Failed to save configuration. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleResetDefaults = () => {
        if (confirm('Are you sure you want to reset all report settings to agency defaults?')) {
            setConfig(DEFAULT_REPORT_CONFIG);
            setHasConfigChanges(true);
        }
    };

    const activeSectionsCount = config.sections.filter(s => s.enabled).length;

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <Loader2 size={32} className={styles.spin} />
                <span>Loading Report Editor & Rules Engine...</span>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.headerBar}>
                <div>
                    <Link href="/settings" className={styles.backLink}>
                        <ArrowLeft size={14} />
                        Settings
                    </Link>
                    <div className={styles.titleRow}>
                        <h1 className={styles.pageTitle}>
                            <Sliders size={22} className={styles.titleIcon} />
                            Report Template & Rules Editor
                        </h1>
                        <span className={styles.versionBadge}>
                            <Sparkles size={12} />
                            Version {configVersion} · Live Engine
                        </span>
                    </div>
                    <p className={styles.pageSubtitle}>
                        Customize client report sections, AI tone, mandatory flag reporting matrix, and agency branding.
                    </p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.resetBtn} onClick={handleResetDefaults}>
                        <RotateCcw size={14} />
                        Reset Defaults
                    </button>
                    <button
                        className={styles.saveBtn}
                        onClick={handleSaveAll}
                        disabled={saving || (!hasConfigChanges && flagEdits.size === 0)}
                    >
                        {saving ? <Loader2 size={14} className={styles.spin} /> : saved ? <Check size={14} /> : <Save size={14} />}
                        {saving ? 'Saving...' : saved ? 'Saved Live!' : 'Save Configuration'}
                    </button>
                </div>
            </div>

            {/* Quick Stats Bar */}
            <div className={styles.quickStatsBar}>
                <div className={styles.quickStatItem}>
                    <Layers size={15} style={{ color: '#6366f1' }} />
                    <span><strong>{activeSectionsCount}</strong> of {config.sections.length} Sections Active</span>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.quickStatItem}>
                    <ShieldCheck size={15} style={{ color: '#10b981' }} />
                    <span><strong>{totalReportedFlags}</strong> Active Flags Reported</span>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.quickStatItem}>
                    <MessageSquare size={15} style={{ color: '#f59e0b' }} />
                    <span>Tone: <strong>{config.tone.replace('_', ' ')}</strong></span>
                </div>
                {lastUpdatedAt && (
                    <>
                        <div className={styles.statDivider} />
                        <div className={styles.quickStatItem} style={{ color: '#94a3b8' }}>
                            <span>Updated: {new Date(lastUpdatedAt).toLocaleDateString()}</span>
                        </div>
                    </>
                )}
            </div>

            {/* Tabs Navigation */}
            <div className={styles.tabNav}>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'sections' ? styles.tabBtnActive : ''}`}
                    onClick={() => setActiveTab('sections')}
                >
                    <Layers size={15} />
                    Sections & Structure ({activeSectionsCount}/{config.sections.length})
                </button>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'tone_rules' ? styles.tabBtnActive : ''}`}
                    onClick={() => setActiveTab('tone_rules')}
                >
                    <Sliders size={15} />
                    AI Tone & Rules Engine
                </button>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'flag_matrix' ? styles.tabBtnActive : ''}`}
                    onClick={() => setActiveTab('flag_matrix')}
                >
                    <ShieldAlert size={15} />
                    Flag Reporting Matrix ({totalReportedFlags} Reported)
                </button>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'branding' ? styles.tabBtnActive : ''}`}
                    onClick={() => setActiveTab('branding')}
                >
                    <Building2 size={15} />
                    Agency Branding & Legal
                </button>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'preview' ? styles.tabBtnActive : ''}`}
                    onClick={() => setActiveTab('preview')}
                >
                    <Eye size={15} />
                    Live Preview
                </button>
            </div>

            {/* ─── TAB 1: Sections & Layout ─── */}
            {activeTab === 'sections' && (
                <div className={styles.tabContent}>
                    <div className={styles.tabHeader}>
                        <div>
                            <h2 className={styles.tabTitle}>Report Section Architecture</h2>
                            <p className={styles.tabSubtitle}>
                                Toggle visibility and reorder sections using the up/down controls. Changes will apply to newly generated client reports.
                            </p>
                        </div>
                    </div>

                    <div className={styles.sectionList}>
                        {config.sections.map((sec, idx) => (
                            <div
                                key={sec.id}
                                className={`${styles.sectionCard} ${sec.enabled ? styles.sectionCardActive : styles.sectionCardDisabled}`}
                            >
                                <div className={styles.sectionOrderControls}>
                                    <button
                                        className={styles.orderBtn}
                                        onClick={() => moveSection(idx, 'up')}
                                        disabled={idx === 0}
                                        title="Move up"
                                    >
                                        <ArrowUp size={13} />
                                    </button>
                                    <span className={styles.orderIndex}>{idx + 1}</span>
                                    <button
                                        className={styles.orderBtn}
                                        onClick={() => moveSection(idx, 'down')}
                                        disabled={idx === config.sections.length - 1}
                                        title="Move down"
                                    >
                                        <ArrowDown size={13} />
                                    </button>
                                </div>

                                <div className={styles.sectionDetails}>
                                    <div className={styles.sectionTitleRow}>
                                        <input
                                            type="text"
                                            className={styles.sectionLabelInput}
                                            value={sec.label}
                                            onChange={e => updateSectionLabel(sec.id, e.target.value)}
                                        />
                                        <span className={styles.sectionIdBadge}>{sec.id}</span>
                                    </div>
                                    <textarea
                                        className={styles.sectionDescInput}
                                        value={sec.description}
                                        onChange={e => updateSectionDescription(sec.id, e.target.value)}
                                        rows={1}
                                    />
                                </div>

                                <div className={styles.sectionToggleWrap}>
                                    <label className={styles.toggleSwitch}>
                                        <input
                                            type="checkbox"
                                            checked={sec.enabled}
                                            onChange={() => toggleSectionEnabled(sec.id)}
                                        />
                                        <span className={styles.toggleSlider}></span>
                                    </label>
                                    <span className={styles.toggleLabel}>
                                        {sec.enabled ? 'Active' : 'Hidden'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── TAB 2: Tone & Rules Engine ─── */}
            {activeTab === 'tone_rules' && (
                <div className={styles.tabContent}>
                    <div className={styles.tabHeader}>
                        <div>
                            <h2 className={styles.tabTitle}>AI Tone & Compliance Rules Engine</h2>
                            <p className={styles.tabSubtitle}>
                                Configure how GPT-4o synthesizes coverage findings, enforces E&O liability safeguards, and frames advisory opportunities.
                            </p>
                        </div>
                    </div>

                    {/* Tone Selection Cards */}
                    <div className={styles.toneSection}>
                        <h3 className={styles.subSectionTitle}>Select Report Tone</h3>
                        <div className={styles.toneGrid}>
                            <div
                                className={`${styles.toneCard} ${config.tone === 'consultative_advisory' ? styles.toneCardActive : ''}`}
                                onClick={() => setTone('consultative_advisory')}
                            >
                                <div className={styles.toneCardHeader}>
                                    <Sparkles size={16} className={styles.toneIcon} />
                                    <span className={styles.toneTitle}>Consultative & Advisory (Recommended)</span>
                                </div>
                                <p className={styles.toneDesc}>
                                    Collaborative, non-judgmental, and proactive. Frames all gaps as positive recommendations and options for the homeowner to explore with their agent.
                                </p>
                            </div>

                            <div
                                className={`${styles.toneCard} ${config.tone === 'educational_direct' ? styles.toneCardActive : ''}`}
                                onClick={() => setTone('educational_direct')}
                            >
                                <div className={styles.toneCardHeader}>
                                    <BookOpen size={16} className={styles.toneIcon} />
                                    <span className={styles.toneTitle}>Educational & Direct</span>
                                </div>
                                <p className={styles.toneDesc}>
                                    Plain language and policyholder empowerment. Uses clear explanations to illustrate why specific endorsements (DIC, Ordinance & Law) matter after a loss.
                                </p>
                            </div>

                            <div
                                className={`${styles.toneCard} ${config.tone === 'executive_analytical' ? styles.toneCardActive : ''}`}
                                onClick={() => setTone('executive_analytical')}
                            >
                                <div className={styles.toneCardHeader}>
                                    <Layers size={16} className={styles.toneIcon} />
                                    <span className={styles.toneTitle}>Executive & Analytical</span>
                                </div>
                                <p className={styles.toneDesc}>
                                    Ultra-concise, data-driven, and high-density. Emphasizes numerical rebuild variances, cost-per-sq-ft metrics, and tabular comparison efficiency.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* System Rule Constraints */}
                    <div className={styles.rulesSection}>
                        <h3 className={styles.subSectionTitle}>Active Compliance Constraints & Guardrails</h3>
                        <div className={styles.rulesGrid}>
                            <label className={styles.ruleCard}>
                                <input
                                    type="checkbox"
                                    checked={config.rules.strict_non_adequacy}
                                    onChange={() => toggleRule('strict_non_adequacy')}
                                />
                                <div>
                                    <div className={styles.ruleTitle}>Strict Non-Adequacy Rule (E&O Protection)</div>
                                    <div className={styles.ruleDesc}>
                                        Prohibits words like &ldquo;inadequate&rdquo;, &ldquo;deficient&rdquo;, or &ldquo;sufficient&rdquo;. AI compares numbers without making legal determinations of adequacy.
                                    </div>
                                </div>
                            </label>

                            <label className={styles.ruleCard}>
                                <input
                                    type="checkbox"
                                    checked={config.rules.exact_numerical_accuracy}
                                    onChange={() => toggleRule('exact_numerical_accuracy')}
                                />
                                <div>
                                    <div className={styles.ruleTitle}>Exact Numerical Precision (Never Round)</div>
                                    <div className={styles.ruleDesc}>
                                        Forces AI to use exact dollar figures and RCE calculations down to the dollar without rounding to approximate numbers.
                                    </div>
                                </div>
                            </label>

                            <label className={styles.ruleCard}>
                                <input
                                    type="checkbox"
                                    checked={config.rules.explicit_source_attribution}
                                    onChange={() => toggleRule('explicit_source_attribution')}
                                />
                                <div>
                                    <div className={styles.ruleTitle}>Explicit Data Source Attribution</div>
                                    <div className={styles.ruleDesc}>
                                        Mandates that every finding specify its source (e.g., &ldquo;Bamboo RCE&rdquo;, &ldquo;ATTOM Property Specs&rdquo;, &ldquo;Google Satellite Vision&rdquo;).
                                    </div>
                                </div>
                            </label>

                            <label className={styles.ruleCard}>
                                <input
                                    type="checkbox"
                                    checked={config.rules.property_noise_filter}
                                    onChange={() => toggleRule('property_noise_filter')}
                                />
                                <div>
                                    <div className={styles.ruleTitle}>Property Feature Noise Reduction Filter</div>
                                    <div className={styles.ruleDesc}>
                                        Suppresses generic attributes (driveway, standard garage) unless linked to an unlisted risk or Other Structures coverage gap.
                                    </div>
                                </div>
                            </label>

                            <label className={styles.ruleCard}>
                                <input
                                    type="checkbox"
                                    checked={config.rules.suppress_fire_risk}
                                    onChange={() => toggleRule('suppress_fire_risk')}
                                />
                                <div>
                                    <div className={styles.ruleTitle}>Suppress Wildfire / Fire Risk Scores</div>
                                    <div className={styles.ruleDesc}>
                                        Suppresses fire risk ratings from client-facing reports to avoid unnecessary policyholder alarm.
                                    </div>
                                </div>
                            </label>

                            <label className={styles.ruleCard}>
                                <input
                                    type="checkbox"
                                    checked={config.rules.standardize_fair_rental_value}
                                    onChange={() => toggleRule('standardize_fair_rental_value')}
                                />
                                <div>
                                    <div className={styles.ruleTitle}>Standardize Fair Rental Value Terminology</div>
                                    <div className={styles.ruleDesc}>
                                        Always uses &ldquo;Fair Rental Value&rdquo; instead of &ldquo;Loss of Use&rdquo; to match California FAIR Plan schedule wording.
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Custom Prompt Directives */}
                    <div className={styles.directivesSection}>
                        <h3 className={styles.subSectionTitle}>Custom Brokerage Directives (Injected into GPT Prompt)</h3>
                        <p className={styles.fieldHelp}>
                            Add custom agency guidelines or emphasis rules. These are appended directly into the AI prompt for all generated reports.
                        </p>
                        <textarea
                            className={styles.directivesTextarea}
                            rows={4}
                            placeholder="e.g. Always emphasize that pre-1980 homes in California benefit from 25% or 50% Ordinance or Law coverage due to Title 24 code requirements..."
                            value={config.custom_prompt_directives}
                            onChange={e => setCustomDirectives(e.target.value)}
                        />
                    </div>
                </div>
            )}

            {/* ─── TAB 3: Flag & Coverage Reporting Matrix ─── */}
            {activeTab === 'flag_matrix' && (
                <div className={styles.tabContent}>
                    <div className={styles.tabHeader}>
                        <div>
                            <h2 className={styles.tabTitle}>Flag & Coverage Reporting Matrix</h2>
                            <p className={styles.tabSubtitle}>
                                Configure which evaluation rules and advisory flags appear on client reports. Toggle reporting status and customize the AI prompt hint per flag.
                            </p>
                        </div>
                    </div>

                    {/* Toolbar */}
                    <div className={styles.matrixToolbar}>
                        <div className={styles.searchWrap}>
                            <Search size={14} className={styles.searchIcon} />
                            <input
                                type="text"
                                className={styles.matrixSearchInput}
                                placeholder="Search by flag code, label, or hint..."
                                value={flagSearch}
                                onChange={e => setFlagSearch(e.target.value)}
                            />
                        </div>

                        <div className={styles.filterPills}>
                            <button
                                className={`${styles.filterPill} ${flagFilter === 'all' ? styles.filterPillActive : ''}`}
                                onClick={() => setFlagFilter('all')}
                            >
                                All ({flagDefs.length})
                            </button>
                            <button
                                className={`${styles.filterPill} ${flagFilter === 'reported' ? styles.filterPillActive : ''}`}
                                onClick={() => setFlagFilter('reported')}
                            >
                                Reported ({totalReportedFlags})
                            </button>
                            <button
                                className={`${styles.filterPill} ${flagFilter === 'suppressed' ? styles.filterPillActive : ''}`}
                                onClick={() => setFlagFilter('suppressed')}
                            >
                                Suppressed ({flagDefs.length - totalReportedFlags})
                            </button>
                        </div>
                    </div>

                    {/* Category Selector */}
                    <div className={styles.categoryPills}>
                        <button
                            className={`${styles.catPill} ${selectedCategory === 'all' ? styles.catPillActive : ''}`}
                            onClick={() => setSelectedCategory('all')}
                        >
                            All Categories
                        </button>
                        {Object.entries(CATEGORY_CONFIG).map(([catKey, catMeta]) => {
                            const stat = categoryStats[catKey] || { total: 0, reported: 0 };
                            if (stat.total === 0) return null;
                            return (
                                <button
                                    key={catKey}
                                    className={`${styles.catPill} ${selectedCategory === catKey ? styles.catPillActive : ''}`}
                                    onClick={() => setSelectedCategory(catKey)}
                                >
                                    {catMeta.label} ({stat.reported}/{stat.total})
                                </button>
                            );
                        })}
                    </div>

                    {/* Matrix Table */}
                    <div className={styles.matrixTableWrap}>
                        <table className={styles.matrixTable}>
                            <thead>
                                <tr>
                                    <th style={{ width: '28%' }}>Flag Code & Description</th>
                                    <th style={{ width: '13%' }}>Category</th>
                                    <th style={{ width: '10%' }}>Severity</th>
                                    <th style={{ width: '15%' }}>Reporting Status</th>
                                    <th style={{ width: '34%' }}>AI Prompt Guidance / Framing Hint</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredFlags.map(def => {
                                    const eff = getEffectiveFlag(def);
                                    const isEdited = flagEdits.has(def.code);

                                    return (
                                        <tr
                                            key={def.code}
                                            className={`${eff.report_enabled ? styles.rowReported : styles.rowSuppressed} ${isEdited ? styles.rowEdited : ''}`}
                                        >
                                            <td>
                                                <div className={styles.flagCodeTag}>{def.code}</div>
                                                <div className={styles.flagLabelText}>{def.label}</div>
                                                {def.description && (
                                                    <div className={styles.flagDescText}>{def.description}</div>
                                                )}
                                            </td>
                                            <td>
                                                <span className={styles.catBadge}>
                                                    {CATEGORY_CONFIG[def.category]?.label || def.category}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`${styles.sevBadge} ${styles[`sev_${def.default_severity}`]}`}>
                                                    {def.default_severity}
                                                </span>
                                            </td>
                                            <td>
                                                <div className={styles.toggleCell}>
                                                    <label className={styles.toggleSwitch}>
                                                        <input
                                                            type="checkbox"
                                                            checked={eff.report_enabled}
                                                            onChange={() => toggleFlagReporting(def.code)}
                                                        />
                                                        <span className={styles.toggleSlider}></span>
                                                    </label>
                                                    <span className={styles.toggleStatusText}>
                                                        {eff.report_enabled ? 'Reported' : 'Suppressed'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <textarea
                                                    className={styles.hintTextarea}
                                                    rows={eff.report_enabled ? 2 : 1}
                                                    placeholder={eff.report_enabled ? 'Instruction for how AI should frame this finding...' : 'Enable flag to set prompt guidance'}
                                                    value={eff.report_prompt_hint || ''}
                                                    onChange={e => updateFlagHint(def.code, e.target.value)}
                                                    disabled={!eff.report_enabled}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ─── TAB 4: Agency Branding & Legal ─── */}
            {activeTab === 'branding' && (
                <div className={styles.tabContent}>
                    <div className={styles.tabHeader}>
                        <div>
                            <h2 className={styles.tabTitle}>Agency Branding & Legal Disclaimer</h2>
                            <p className={styles.tabSubtitle}>
                                Customize the agency header information, contact details, and policyholder responsibility notice shown on all client reports.
                            </p>
                        </div>
                    </div>

                    <div className={styles.brandingGrid}>
                        <div className={styles.brandingField}>
                            <label className={styles.fieldLabel}>Agency Name</label>
                            <input
                                type="text"
                                className={styles.textInput}
                                value={config.branding.agency_name}
                                onChange={e => updateBranding('agency_name', e.target.value)}
                            />
                        </div>

                        <div className={styles.brandingField}>
                            <label className={styles.fieldLabel}>California License Number</label>
                            <input
                                type="text"
                                className={styles.textInput}
                                value={config.branding.license_number}
                                onChange={e => updateBranding('license_number', e.target.value)}
                            />
                        </div>

                        <div className={styles.brandingField}>
                            <label className={styles.fieldLabel}>Direct Phone / Contact</label>
                            <input
                                type="text"
                                className={styles.textInput}
                                value={config.branding.phone}
                                onChange={e => updateBranding('phone', e.target.value)}
                            />
                        </div>

                        <div className={styles.brandingField}>
                            <label className={styles.fieldLabel}>Header Report Badge</label>
                            <input
                                type="text"
                                className={styles.textInput}
                                value={config.branding.header_badge}
                                onChange={e => updateBranding('header_badge', e.target.value)}
                            />
                        </div>

                        <div className={`${styles.brandingField} ${styles.fieldSpan2}`}>
                            <label className={styles.fieldLabel}>Legal Notice & Disclaimer Text</label>
                            <textarea
                                className={styles.textInput}
                                rows={4}
                                value={config.branding.disclaimer_text}
                                onChange={e => updateBranding('disclaimer_text', e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 5: Live Preview ─── */}
            {activeTab === 'preview' && (
                <div className={styles.tabContent}>
                    <div className={styles.tabHeader}>
                        <div>
                            <h2 className={styles.tabTitle}>Live Report Template Preview</h2>
                            <p className={styles.tabSubtitle}>
                                Visual mockup of how reports render with active sections, selected tone ({config.tone}), and custom agency branding.
                            </p>
                        </div>
                    </div>

                    <div className={styles.previewContainer}>
                        {/* Mock Header */}
                        <div className={styles.prevHeader}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '1.1rem' }}>
                                    CoverageCheckNow
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, marginLeft: '0.5rem' }}>
                                        {config.branding.agency_name} · {config.branding.license_number}
                                    </span>
                                </div>
                                <span className={styles.prevBadge}>{config.branding.header_badge}</span>
                            </div>
                            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#0f172a' }}>
                                Coverage Analysis & Policy Review
                            </h1>
                            <div className={styles.prevGrid3}>
                                <div className={styles.prevMetaCard}><span className={styles.prevMetaLabel}>Prepared For</span><strong>SAMPLE INSURED</strong></div>
                                <div className={styles.prevMetaCard}><span className={styles.prevMetaLabel}>Carrier</span><strong>California FAIR Plan</strong></div>
                                <div className={styles.prevMetaCard}><span className={styles.prevMetaLabel}>Total Premium</span><strong>$1,250 / yr</strong></div>
                            </div>
                        </div>

                        {/* Render Active Sections in Configured Order */}
                        {config.sections.filter(s => s.enabled).map((sec, i) => (
                            <div key={sec.id} className={styles.prevSectionBox}>
                                <div className={styles.prevSectionTitle}>
                                    <span>#{i + 1} {sec.label}</span>
                                    <span className={styles.prevSectionTag}>Active Section</span>
                                </div>
                                <p className={styles.prevSectionDesc}>{sec.description}</p>

                                {sec.id === 'top_concerns' && (
                                    <div className={styles.prevCardGroup}>
                                        <div className={styles.prevCard}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444' }}>PERIL GAP · RECOMMENDATION</div>
                                            <strong>Companion DIC Protection</strong>
                                            <p style={{ fontSize: '0.75rem', color: '#475569', margin: '0.2rem 0 0' }}>Explore adding Difference in Conditions policy for water damage, theft, and personal liability.</p>
                                        </div>
                                        <div className={styles.prevCard}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b' }}>CONTENTS · COVERAGE C</div>
                                            <strong>Personal Property Limit</strong>
                                            <p style={{ fontSize: '0.75rem', color: '#475569', margin: '0.2rem 0 0' }}>Evaluate expanding Coverage C from 20% to 30%–50% benchmark for complete household protection.</p>
                                        </div>
                                    </div>
                                )}

                                {sec.id === 'coverage_review' && (
                                    <div className={styles.prevTablePlaceholder}>
                                        <span>📊 Coverage lines with exact dollar limits and named source benchmarks will render in this matrix.</span>
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Mock Footer */}
                        <div className={styles.prevFooter}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontWeight: 600 }}>
                                <span>{config.branding.agency_name} · Direct: {config.branding.phone}</span>
                                <span>Engine v{configVersion}</span>
                            </div>
                            <p style={{ fontSize: '0.68rem', color: '#94a3b8', margin: 0 }}>{config.branding.disclaimer_text}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Sticky Unsaved Changes Bar */}
            {(hasConfigChanges || flagEdits.size > 0) && (
                <div className={styles.stickyFooter}>
                    <div className={styles.stickyFooterText}>
                        <AlertTriangle size={15} style={{ color: '#f59e0b' }} />
                        <span>You have unsaved changes ({flagEdits.size > 0 ? `${flagEdits.size} flag updates` : 'template config'})</span>
                    </div>
                    <button className={styles.saveBtn} onClick={handleSaveAll} disabled={saving}>
                        {saving ? <Loader2 size={14} className={styles.spin} /> : <Save size={14} />}
                        {saving ? 'Saving...' : 'Save & Publish Live'}
                    </button>
                </div>
            )}
        </div>
    );
}
