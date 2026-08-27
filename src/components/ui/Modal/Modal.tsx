'use client';

import React, { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import styles from './Modal.module.scss';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    /** Max width of the modal panel (default: 540px) */
    maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, children, maxWidth = '540px' }: ModalProps) {
    // Close on Escape key
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        },
        [onClose],
    );

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div
                className={styles.panel}
                style={{ maxWidth }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className={styles.header}>
                    <h2 className={styles.title}>{title}</h2>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className={styles.body}>{children}</div>
            </div>
        </div>
    );
}
