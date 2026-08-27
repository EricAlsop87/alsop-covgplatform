'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Edit2, Check, X, History } from 'lucide-react';
import styles from './EditableValue.module.css';

interface EditableValueProps {
    value: string;
    originalValue?: string | null;
    onSave: (newValue: string) => Promise<boolean>;
    placeholder?: string;
    label?: string;
}

export function EditableValue({ value, originalValue, onSave, placeholder = '—', label }: EditableValueProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [currentValue, setCurrentValue] = useState(value);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const isOverridden = !!originalValue && originalValue !== value;

    useEffect(() => {
        setCurrentValue(value);
    }, [value]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    const handleSave = async () => {
        if (currentValue === value) {
            setIsEditing(false);
            return;
        }

        setIsSaving(true);
        setError('');
        try {
            const success = await onSave(currentValue);
            if (success) {
                setIsEditing(false);
            } else {
                setError('Failed to save');
            }
        } catch (e: any) {
            setError(e.message || 'Error occurred');
        } finally {
            setIsSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') {
            setCurrentValue(value);
            setIsEditing(false);
            setError('');
        }
    };

    if (isEditing) {
        return (
            <div className={styles.editWrapper}>
                <input
                    ref={inputRef}
                    type="text"
                    className={styles.input}
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSaving}
                />
                <div className={styles.actions}>
                    <button onClick={handleSave} disabled={isSaving} className={styles.saveBtn} title="Save">
                        <Check size={14} />
                    </button>
                    <button 
                        onClick={() => { setCurrentValue(value); setIsEditing(false); setError(''); }} 
                        disabled={isSaving} 
                        className={styles.cancelBtn} 
                        title="Cancel"
                    >
                        <X size={14} />
                    </button>
                </div>
                {error && <span className={styles.error}>{error}</span>}
            </div>
        );
    }

    return (
        <div className={`${styles.viewWrapper} ${isOverridden ? styles.isOverridden : ''}`}>
            <span className={styles.displayValue}>{value || placeholder}</span>
            
            {isOverridden && (
                <div className={styles.overrideBadge} title={`Original parsed value: ${originalValue}`}>
                    <History size={12} />
                    <span>Edited</span>
                </div>
            )}

            <button onClick={() => setIsEditing(true)} className={styles.editTrigger} aria-label={`Edit ${label || 'value'}`}>
                <Edit2 size={12} />
            </button>
        </div>
    );
}
