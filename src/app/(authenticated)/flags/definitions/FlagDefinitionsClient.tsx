'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Search, Info, ShieldAlert, AlertTriangle, AlertCircle, Info as InfoIcon, Pencil, Save, X, Loader2, Check } from 'lucide-react';
import { FlagDefinition, updateFlagDefinition } from '@/lib/api';
import styles from './page.module.css';

interface FlagDefinitionsClientProps {
    initialDefinitions: FlagDefinition[];
    isAdmin?: boolean;
}

/** Fields that are editable in the drawer */
type EditableFields = Pick<FlagDefinition,
    'label' | 'description' | 'default_severity' | 'category' |
    'auto_resolve' | 'is_active' | 'trigger_logic' |
    'data_fields_checked' | 'dec_page_section' | 'suppression_rules' | 'notes'
>;

export default function FlagDefinitionsClient({ initialDefinitions, isAdmin = true }: FlagDefinitionsClientProps) {
    const [definitions, setDefinitions] = useState<FlagDefinition[]>(initialDefinitions);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    const [selectedFlag, setSelectedFlag] = useState<FlagDefinition | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editDraft, setEditDraft] = useState<EditableFields | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Categories
    const categories = useMemo(() => Array.from(new Set(definitions.map(f => f.category))), [definitions]);

    // Filtered list
    const filteredDefs = useMemo(() => {
        return definitions.filter(def => {
            const matchesSearch = def.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                def.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (def.trigger_logic || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (def.data_fields_checked || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCat = categoryFilter === 'all' || def.category === categoryFilter;
            const matchesSev = priorityFilter === 'all' || def.default_severity === priorityFilter;
            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'active' && def.is_active) ||
                (statusFilter === 'deferred' && !def.is_active);

            return matchesSearch && matchesCat && matchesSev && matchesStatus;
        });
    }, [definitions, searchTerm, categoryFilter, priorityFilter, statusFilter]);

    // Summary counts
    const totalCount = definitions.length;
    const activeCount = definitions.filter(d => d.is_active).length;
    const deferredCount = definitions.filter(d => !d.is_active).length;

    const getPriorityDetails = (sev: string) => {
        switch (sev.toLowerCase()) {
            case 'high': return { icon: <ShieldAlert size={14} />, colorClass: styles.sevCritical };
            case 'medium': return { icon: <AlertTriangle size={14} />, colorClass: styles.sevHigh };
            case 'low': return { icon: <InfoIcon size={14} />, colorClass: styles.sevInfo };
            default: return { icon: <InfoIcon size={14} />, colorClass: styles.sevInfo };
        }
    };

    // ── Edit mode helpers ───────────────────────────────────────────────
    const enterEditMode = useCallback(() => {
        if (!selectedFlag) return;
        setEditDraft({
            label: selectedFlag.label,
            description: selectedFlag.description || '',
            default_severity: selectedFlag.default_severity,
            category: selectedFlag.category,
            auto_resolve: selectedFlag.auto_resolve,
            is_active: selectedFlag.is_active,
            trigger_logic: selectedFlag.trigger_logic || '',
            data_fields_checked: selectedFlag.data_fields_checked || '',
            dec_page_section: selectedFlag.dec_page_section || '',
            suppression_rules: selectedFlag.suppression_rules || '',
            notes: selectedFlag.notes || '',
        });
        setIsEditing(true);
        setSaveMsg(null);
    }, [selectedFlag]);

    const cancelEdit = useCallback(() => {
        setIsEditing(false);
        setEditDraft(null);
        setSaveMsg(null);
    }, []);

    const handleSave = useCallback(async () => {
        if (!selectedFlag || !editDraft) return;
        setSaving(true);
        setSaveMsg(null);

        const result = await updateFlagDefinition(selectedFlag.code, editDraft);

        if (result) {
            // Update local state
            setDefinitions(prev => prev.map(d => d.code === result.code ? result : d));
            setSelectedFlag(result);
            setIsEditing(false);
            setEditDraft(null);
            setSaveMsg({ type: 'success', text: 'Saved successfully' });
            setTimeout(() => setSaveMsg(null), 3000);
        } else {
            setSaveMsg({ type: 'error', text: 'Failed to save — check console for details' });
        }
        setSaving(false);
    }, [selectedFlag, editDraft]);

    const updateDraft = useCallback(<K extends keyof EditableFields>(key: K, value: EditableFields[K]) => {
        setEditDraft(prev => prev ? { ...prev, [key]: value } : prev);
    }, []);

    // When selecting a flag from the table, exit edit mode
    const handleSelectFlag = useCallback((def: FlagDefinition) => {
        setSelectedFlag(def);
        setIsEditing(false);
        setEditDraft(null);
        setSaveMsg(null);
    }, []);

    // ── Render helpers ──────────────────────────────────────────────────

    /** Editable textarea or readonly text for a documentation field */
    const DocField = ({ label, field, rows = 3 }: { label: string; field: keyof EditableFields; rows?: number }) => {
        const value = isEditing && editDraft
            ? (editDraft[field] as string) || ''
            : (selectedFlag?.[field] as string) || '';

        return (
            <div className={styles.detailBlock}>
                <label>{label}</label>
                {isEditing ? (
                    <textarea
                        className={styles.editTextarea}
                        value={value}
                        rows={rows}
                        onChange={e => updateDraft(field, e.target.value)}
                    />
                ) : value ? (
                    <div className={styles.docText}>{value}</div>
                ) : (
                    <div className={styles.emptyField}>Not documented yet</div>
                )}
            </div>
        );
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Flag Catalog</h1>
                <p className={styles.subtitle}>
                    Complete registry of all flags in the platform. Select a flag to view its trigger logic, data fields, and configuration.
                    {isAdmin && ' Admins can edit and update flag documentation directly.'}
                </p>

                {/* Summary Strip */}
                <div className={styles.summaryStrip}>
                    <div className={styles.summaryMetric}>
                        <span className={styles.summaryLabel}>Total Flags</span>
                        <span className={styles.summaryValue}>{totalCount}</span>
                    </div>
                    <div className={styles.summaryMetric}>
                        <span className={styles.summaryLabel}>Active</span>
                        <span className={styles.summaryValue} style={{ color: 'var(--success-green)' }}>{activeCount}</span>
                    </div>
                    <div className={styles.summaryMetric}>
                        <span className={styles.summaryLabel}>Deferred</span>
                        <span className={styles.summaryValue} style={{ color: 'var(--text-muted)' }}>{deferredCount}</span>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className={styles.controlsBar}>
                <div className={styles.searchBox}>
                    <Search className={styles.searchIcon} size={16} />
                    <input
                        type="text"
                        placeholder="Search codes, labels, or trigger logic..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>

                <div className={styles.filterGroup}>
                    <select className={styles.filterDropdown} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                        <option value="all">All Categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <select className={styles.filterDropdown} value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
                        <option value="all">All Priorities</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>

                    <select className={styles.filterDropdown} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="deferred">Deferred</option>
                    </select>
                </div>
            </div>

            {/* Main Content Layout */}
            <div className={styles.layout}>

                {/* Table Area */}
                <div className={styles.tableRefContainer}>
                    <div className={styles.tableWrapper}>
                        <table className={styles.flagsTable}>
                            <thead>
                                <tr>
                                    <th>Label</th>
                                    <th>Category</th>
                                    <th>Priority</th>
                                    <th>Status</th>
                                    <th>Logic / Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDefs.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className={styles.emptyState}>No flags found matching filters.</td>
                                    </tr>
                                )}
                                {filteredDefs.map(def => {
                                    const dev = getPriorityDetails(def.default_severity);
                                    const isSelected = selectedFlag?.code === def.code;
                                    const hasLogic = !!def.trigger_logic;

                                    return (
                                        <tr
                                            key={def.code}
                                            className={`${styles.flagRow} ${isSelected ? styles.selectedRow : ''}`}
                                            onClick={() => handleSelectFlag(def)}
                                        >
                                            <td className={styles.boldCell}>
                                                {def.label}
                                                {!hasLogic && <span className={styles.undocBadge} title="Missing trigger logic">⚠</span>}
                                            </td>
                                            <td>
                                                <span className={styles.categoryPill}>{def.category}</span>
                                            </td>
                                            <td>
                                                <div className={`${styles.sevBadge} ${dev.colorClass}`}>
                                                    {dev.icon} <span className={styles.sevText}>{def.default_severity}</span>
                                                </div>
                                            </td>
                                            <td>
                                                {def.is_active ? 
                                                    <span className={styles.statusActive}>Active</span> : 
                                                    <span className={styles.statusDeferred}>Inactive</span>
                                                }
                                            </td>
                                            <td className={styles.logicCell} title={def.trigger_logic || def.description || ''}>
                                                <div className={styles.logicPreview}>
                                                    {def.trigger_logic || def.description || <span className={styles.undocBadge} title="Missing trigger logic">⚠ Undocumented</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Side Panel */}
                <div className={styles.sideDrawer}>
                    {!selectedFlag ? (
                        <div className={styles.emptyDrawer}>
                            <Info size={40} className={styles.emptyDrawerIcon} />
                            <h3>No Flag Selected</h3>
                            <p>Select a flag from the table to view its detailed trigger logic and system configuration.</p>
                        </div>
                    ) : (
                        <>
                            <div className={styles.drawerHeader}>
                                <h2 className={styles.drawerTitle}>
                                    {isEditing ? 'Edit Flag' : 'Flag Details'}
                                </h2>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    {isAdmin && !isEditing && (
                                        <button className={styles.editBtn} onClick={enterEditMode} title="Edit flag definition">
                                            <Pencil size={14} />
                                            <span>Edit</span>
                                        </button>
                                    )}
                                    {isEditing && (
                                        <>
                                            <button className={styles.cancelBtn} onClick={cancelEdit} disabled={saving}>
                                                <X size={14} />
                                                <span>Cancel</span>
                                            </button>
                                            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                                                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                                                <span>{saving ? 'Saving...' : 'Save'}</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Save feedback */}
                            {saveMsg && (
                                <div className={saveMsg.type === 'success' ? styles.saveMsgSuccess : styles.saveMsgError}>
                                    {saveMsg.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
                                    {saveMsg.text}
                                </div>
                            )}

                            <div className={styles.drawerContent}>
                                {/* Label */}
                                <div className={styles.detailBlock}>
                                    <label>Label</label>
                                    {isEditing ? (
                                        <input
                                            className={styles.editInput}
                                            value={editDraft?.label || ''}
                                            onChange={e => updateDraft('label', e.target.value)}
                                        />
                                    ) : (
                                        <div className={styles.detailValueBold}>{selectedFlag.label}</div>
                                    )}
                                </div>

                                {/* Code (always read-only) */}
                                <div className={styles.detailBlock}>
                                    <label>Code</label>
                                    <div><code className={styles.codeBadgeLg}>{selectedFlag.code}</code></div>
                                </div>

                                {/* Description */}
                                <DocField label="Description" field="description" rows={2} />

                                {/* Trigger Logic — the most important field */}
                                <DocField label="Trigger Logic" field="trigger_logic" rows={4} />

                                {/* Data Fields Checked */}
                                <DocField label="Data Fields Checked" field="data_fields_checked" rows={2} />

                                {/* Dec Page Section */}
                                <DocField label="Dec Page Section" field="dec_page_section" rows={1} />

                                {/* Suppression Rules */}
                                <DocField label="Suppression Rules" field="suppression_rules" rows={2} />

                                {/* Config grid */}
                                <div className={styles.grid2}>
                                    <div className={styles.detailBlock}>
                                        <label>Category</label>
                                        {isEditing ? (
                                            <input
                                                className={styles.editInput}
                                                value={editDraft?.category || ''}
                                                onChange={e => updateDraft('category', e.target.value)}
                                            />
                                        ) : (
                                            <div className={styles.categoryPill}>{selectedFlag.category}</div>
                                        )}
                                    </div>
                                    <div className={styles.detailBlock}>
                                        <label>Priority</label>
                                        {isEditing ? (
                                            <select
                                                className={styles.editSelect}
                                                value={editDraft?.default_severity || 'low'}
                                                onChange={e => updateDraft('default_severity', e.target.value as FlagDefinition['default_severity'])}
                                            >
                                                <option value="high">High</option>
                                                <option value="medium">Medium</option>
                                                <option value="low">Low</option>
                                            </select>
                                        ) : (
                                            <div className={`${styles.sevBadge} ${getPriorityDetails(selectedFlag.default_severity).colorClass}`} style={{ display: 'inline-flex' }}>
                                                {getPriorityDetails(selectedFlag.default_severity).icon}
                                                <span className={styles.sevText}>{selectedFlag.default_severity}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className={styles.grid2}>
                                    <div className={styles.detailBlock}>
                                        <label>Status</label>
                                        {isEditing ? (
                                            <select
                                                className={styles.editSelect}
                                                value={editDraft?.is_active ? 'active' : 'deferred'}
                                                onChange={e => updateDraft('is_active', e.target.value === 'active')}
                                            >
                                                <option value="active">Active</option>
                                                <option value="deferred">Deferred</option>
                                            </select>
                                        ) : (
                                            <div>
                                                {selectedFlag.is_active ?
                                                    <span className={styles.statusActive}>Active</span> :
                                                    <span className={styles.statusDeferred}>Deferred</span>
                                                }
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.detailBlock}>
                                        <label>Scope</label>
                                        <div className={styles.scopeBadge}>{selectedFlag.entity_scope}</div>
                                    </div>
                                </div>

                                {/* System Behaviors */}
                                <div className={styles.detailBlock}>
                                    <label>System Behaviors</label>
                                    {isEditing ? (
                                        <div className={styles.toggleGroup}>
                                            <label className={styles.toggleRow}>
                                                <input
                                                    type="checkbox"
                                                    checked={editDraft?.auto_resolve || false}
                                                    onChange={e => updateDraft('auto_resolve', e.target.checked)}
                                                />
                                                <span>Auto-resolve when condition clears</span>
                                            </label>
                                        </div>
                                    ) : (
                                        <ul className={styles.behaviorList}>
                                            <li><strong>Auto-Resolve:</strong> {selectedFlag.auto_resolve ? 'Yes (Clears automatically if fixed)' : 'No (Requires manual dismissal)'}</li>
                                            <li><strong>Manual Triggers:</strong> {selectedFlag.is_manual_allowed ? 'Allowed' : 'Not Allowed'}</li>
                                        </ul>
                                    )}
                                </div>

                                {/* Notes */}
                                <DocField label="Notes" field="notes" rows={2} />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
