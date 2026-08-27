'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { X, Search, Save, Loader2, Check, ChevronDown, ChevronRight, ShieldAlert, AlertTriangle, Info } from 'lucide-react';
import { FlagDefinition, fetchAllFlagDefinitions, batchUpdateFlagReportSettings, FlagReportSettingsUpdate } from '@/lib/api';
import styles from './FlagReportingModal.module.css';

interface FlagReportingModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Category display labels and order
const CATEGORY_CONFIG: Record<string, { label: string; order: number }> = {
    coverage_gap: { label: 'Coverage Gap', order: 0 },
    dic: { label: 'DIC (Difference in Conditions)', order: 1 },
    property_observation: { label: 'Property Observation', order: 2 },
    data_quality: { label: 'Data Quality', order: 3 },
    renewal: { label: 'Renewal', order: 4 },
    parser: { label: 'Parser', order: 5 },
    duplicate: { label: 'Duplicate', order: 6 },
    manual: { label: 'Manual', order: 7 },
};

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function FlagReportingModal({ isOpen, onClose }: FlagReportingModalProps) {
    const [definitions, setDefinitions] = useState<FlagDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    
    // Track local edits: { code -> { report_enabled, report_prompt_hint } }
    const [edits, setEdits] = useState<Map<string, { report_enabled: boolean; report_prompt_hint: string | null }>>(new Map());

    // Load flag definitions when modal opens
    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        fetchAllFlagDefinitions().then(defs => {
            setDefinitions(defs);
            setEdits(new Map());
            setSaved(false);
            // Auto-expand categories that have reported flags
            const expanded = new Set<string>();
            defs.forEach(d => {
                if (d.report_enabled) expanded.add(d.category);
            });
            // Always expand coverage_gap
            expanded.add('coverage_gap');
            setExpandedCategories(expanded);
            setLoading(false);
        });
    }, [isOpen]);

    // Get effective value for a flag (edited value or original)
    const getEffective = useCallback((def: FlagDefinition) => {
        const edit = edits.get(def.code);
        return {
            report_enabled: edit?.report_enabled ?? def.report_enabled ?? false,
            report_prompt_hint: edit?.report_prompt_hint ?? def.report_prompt_hint ?? null,
        };
    }, [edits]);

    // Toggle a flag's report_enabled
    const toggleFlag = useCallback((code: string) => {
        setEdits(prev => {
            const next = new Map(prev);
            const def = definitions.find(d => d.code === code);
            if (!def) return next;
            const current = next.get(code) || {
                report_enabled: def.report_enabled ?? false,
                report_prompt_hint: def.report_prompt_hint ?? null,
            };
            next.set(code, { ...current, report_enabled: !current.report_enabled });
            return next;
        });
        setSaved(false);
    }, [definitions]);

    // Update a flag's prompt hint
    const updateHint = useCallback((code: string, hint: string) => {
        setEdits(prev => {
            const next = new Map(prev);
            const def = definitions.find(d => d.code === code);
            if (!def) return next;
            const current = next.get(code) || {
                report_enabled: def.report_enabled ?? false,
                report_prompt_hint: def.report_prompt_hint ?? null,
            };
            next.set(code, { ...current, report_prompt_hint: hint || null });
            return next;
        });
        setSaved(false);
    }, [definitions]);

    // Toggle category expansion
    const toggleCategory = useCallback((cat: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    }, []);

    // Group definitions by category
    const grouped = useMemo(() => {
        const groups: Record<string, FlagDefinition[]> = {};
        const filtered = definitions.filter(d => {
            if (!searchTerm) return true;
            const term = searchTerm.toLowerCase();
            return d.code.toLowerCase().includes(term) ||
                d.label.toLowerCase().includes(term) ||
                (d.description || '').toLowerCase().includes(term);
        });
        filtered.forEach(d => {
            if (!groups[d.category]) groups[d.category] = [];
            groups[d.category].push(d);
        });
        // Sort flags within each group by severity
        Object.values(groups).forEach(arr => {
            arr.sort((a, b) => (SEVERITY_ORDER[a.default_severity] ?? 3) - (SEVERITY_ORDER[b.default_severity] ?? 3));
        });
        return groups;
    }, [definitions, searchTerm]);

    // Sorted category keys
    const sortedCategories = useMemo(() => {
        return Object.keys(grouped).sort((a, b) => {
            return (CATEGORY_CONFIG[a]?.order ?? 99) - (CATEGORY_CONFIG[b]?.order ?? 99);
        });
    }, [grouped]);

    // Count stats
    const totalFlags = definitions.length;
    const reportedCount = definitions.filter(d => {
        const eff = getEffective(d);
        return eff.report_enabled;
    }).length;
    const changedCount = edits.size;

    // Save handler
    const handleSave = useCallback(async () => {
        if (edits.size === 0) return;
        setSaving(true);
        
        const updates: FlagReportSettingsUpdate[] = [];
        edits.forEach((edit, code) => {
            updates.push({
                code,
                report_enabled: edit.report_enabled,
                report_prompt_hint: edit.report_prompt_hint,
            });
        });

        const result = await batchUpdateFlagReportSettings(updates);
        
        if (result.success) {
            // Refresh definitions with saved values
            const refreshed = await fetchAllFlagDefinitions();
            setDefinitions(refreshed);
            setEdits(new Map());
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } else {
            alert(`Save failed: ${result.error}`);
        }
        
        setSaving(false);
    }, [edits]);

    // Severity icon helper
    const getSeverityIcon = (sev: string) => {
        switch (sev) {
            case 'high': return <ShieldAlert size={13} />;
            case 'medium': return <AlertTriangle size={13} />;
            default: return <Info size={13} />;
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.modalHeader}>
                    <div>
                        <h2 className={styles.modalTitle}>Flag Reporting Configuration</h2>
                        <p className={styles.modalSubtitle}>
                            Control which flags appear in AI-generated client reports and how they are framed.
                        </p>
                    </div>
                    <div className={styles.modalHeaderActions}>
                        <button
                            className={styles.saveBtn}
                            onClick={handleSave}
                            disabled={saving || changedCount === 0}
                        >
                            {saving ? <Loader2 size={14} className={styles.spin} /> : saved ? <Check size={14} /> : <Save size={14} />}
                            {saving ? 'Saving...' : saved ? 'Saved!' : `Save${changedCount > 0 ? ` (${changedCount})` : ''}`}
                        </button>
                        <button className={styles.closeBtn} onClick={onClose}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Stats + Search */}
                <div className={styles.toolbar}>
                    <div className={styles.searchBox}>
                        <Search size={14} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder="Search flags..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className={styles.searchInput}
                        />
                    </div>
                    <div className={styles.stats}>
                        <span className={styles.statChip}>{totalFlags} flags</span>
                        <span className={`${styles.statChip} ${styles.statActive}`}>{reportedCount} reported</span>
                    </div>
                </div>

                {/* Flag List */}
                <div className={styles.flagList}>
                    {loading ? (
                        <div className={styles.loadingState}>
                            <Loader2 size={24} className={styles.spin} />
                            <span>Loading flag definitions...</span>
                        </div>
                    ) : sortedCategories.length === 0 ? (
                        <div className={styles.emptyState}>No flags match your search.</div>
                    ) : (
                        sortedCategories.map(cat => {
                            const flags = grouped[cat];
                            const isExpanded = expandedCategories.has(cat);
                            const catLabel = CATEGORY_CONFIG[cat]?.label || cat;
                            const enabledInCat = flags.filter(d => getEffective(d).report_enabled).length;

                            return (
                                <div key={cat} className={styles.categoryGroup}>
                                    <button
                                        className={styles.categoryHeader}
                                        onClick={() => toggleCategory(cat)}
                                    >
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <span className={styles.categoryLabel}>{catLabel}</span>
                                        <span className={styles.categoryCount}>{flags.length}</span>
                                        {enabledInCat > 0 && (
                                            <span className={styles.categoryEnabled}>{enabledInCat} reported</span>
                                        )}
                                    </button>

                                    {isExpanded && (
                                        <div className={styles.categoryFlags}>
                                            {flags.map(def => {
                                                const eff = getEffective(def);
                                                const isEdited = edits.has(def.code);

                                                return (
                                                    <div
                                                        key={def.code}
                                                        className={`${styles.flagRow} ${eff.report_enabled ? styles.flagRowActive : ''} ${isEdited ? styles.flagRowEdited : ''}`}
                                                    >
                                                        <div className={styles.flagRowTop}>
                                                            <div className={`${styles.severityBadge} ${styles[`sev_${def.default_severity}`]}`}>
                                                                {getSeverityIcon(def.default_severity)}
                                                            </div>
                                                            <div className={styles.flagInfo}>
                                                                <span className={styles.flagCode}>{def.code}</span>
                                                                <span className={styles.flagLabel}>{def.label}</span>
                                                            </div>
                                                            <label className={styles.toggleWrapper}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={eff.report_enabled}
                                                                    onChange={() => toggleFlag(def.code)}
                                                                    className={styles.toggleInput}
                                                                />
                                                                <span className={styles.toggleTrack}>
                                                                    <span className={styles.toggleThumb} />
                                                                </span>
                                                            </label>
                                                        </div>

                                                        {eff.report_enabled && (
                                                            <div className={styles.hintSection}>
                                                                <textarea
                                                                    className={styles.hintInput}
                                                                    placeholder="AI prompt hint — how should this flag be framed in the client report? (e.g. 'Emphasize that $0 Other Structures means pools and sheds have no coverage')"
                                                                    value={eff.report_prompt_hint || ''}
                                                                    onChange={e => updateHint(def.code, e.target.value)}
                                                                    rows={2}
                                                                    onFocus={e => { e.target.rows = 4; }}
                                                                    onBlur={e => { if (!e.target.value) e.target.rows = 2; }}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Sticky footer */}
                {changedCount > 0 && (
                    <div className={styles.stickyFooter}>
                        <span className={styles.footerText}>{changedCount} unsaved change{changedCount !== 1 ? 's' : ''}</span>
                        <button
                            className={styles.saveBtn}
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? <Loader2 size={14} className={styles.spin} /> : <Save size={14} />}
                            {saving ? 'Saving...' : 'Save All'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
