'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, AlertCircle, Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';


type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration: number;
}

interface ToastContextValue {
    toast: (message: string, type?: ToastType, duration?: number) => string;
    success: (message: string) => string;
    error: (message: string) => string;
    warning: (message: string) => string;
    info: (message: string) => string;
    loading: (message: string) => string;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        return {
            toast: (msg) => { logger.info('Toast', '[Toast]', { msg }); return '1'; },
            success: (msg) => { logger.info('Toast', '[Toast:success]', { msg }); return '1'; },
            error: (msg) => { logger.error('Toast', '[Toast:error]', { msg }); return '1'; },
            warning: (msg) => { logger.warn('Toast', '[Toast:warning]', { msg }); return '1'; },
            info: (msg) => { logger.info('Toast', '[Toast:info]', { msg }); return '1'; },
            loading: (msg) => { logger.info('Toast', '[Toast:loading]', { msg }); return '1'; },
            removeToast: () => {},
        };
    }
    return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const counterRef = useRef(0);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const addToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
        const id = `toast-${++counterRef.current}`;
        const finalDuration = type === 'loading' ? 99999999 : duration; // Let loading persist
        setToasts(prev => [...prev, { id, type, message, duration: finalDuration }]);
        if (type !== 'loading') { // Disable auto-timeout for loading
            setTimeout(() => removeToast(id), duration);
        }
        return id;
    }, [removeToast]);

    const value: ToastContextValue = {
        toast: addToast,
        success: (msg) => addToast(msg, 'success'),
        error: (msg) => addToast(msg, 'error', 6000),
        warning: (msg) => addToast(msg, 'warning', 5000),
        info: (msg) => addToast(msg, 'info'),
        loading: (msg) => addToast(msg, 'loading'),
        removeToast,
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={removeToast} />
        </ToastContext.Provider>
    );
}

const ICON_MAP: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 size={16} />,
    error: <AlertCircle size={16} />,
    warning: <AlertTriangle size={16} />,
    info: <Info size={16} />,
    loading: <Loader2 size={16} className="spin" />,
};

const COLOR_MAP: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
    success: { bg: 'var(--bg-success-subtle)', border: 'var(--status-success)', text: 'var(--status-success)', icon: 'var(--status-success)' },
    error: { bg: 'var(--bg-error-subtle)', border: 'var(--status-error)', text: 'var(--status-error)', icon: 'var(--status-error)' },
    warning: { bg: 'var(--bg-warning-subtle)', border: 'var(--status-warning)', text: 'var(--status-warning)', icon: 'var(--status-warning)' },
    info: { bg: 'var(--bg-info-subtle)', border: 'var(--accent-primary)', text: 'var(--accent-primary)', icon: 'var(--accent-primary)' },
    loading: { bg: 'var(--bg-info-subtle)', border: 'var(--accent-primary)', text: 'var(--accent-primary)', icon: 'var(--accent-primary)' },
};

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
    if (toasts.length === 0) return null;

    return (
        <div style={{
            position: 'fixed', bottom: '1.5rem', right: '1.5rem',
            zIndex: 10000, display: 'flex', flexDirection: 'column-reverse',
            gap: '0.5rem', maxWidth: '400px',
        }}>
            <style>{`
                @keyframes toastSlideIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
            `}</style>
            {toasts.map(t => {
                const colors = COLOR_MAP[t.type];
                return (
                    <div key={t.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                        padding: '0.75rem 1rem', borderRadius: '10px',
                        background: 'var(--bg-surface-raised)',
                        border: `1px solid ${colors.border}`,
                        boxShadow: 'var(--shadow-lg)',
                        animation: 'toastSlideIn 0.2s ease-out',
                        color: colors.text, fontSize: '0.82rem', lineHeight: 1.4,
                    }}>
                        <span style={{ color: colors.icon, flexShrink: 0, marginTop: '1px' }}>
                            {ICON_MAP[t.type]}
                        </span>
                        <span style={{ flex: 1, fontWeight: 500 }}>{t.message}</span>
                        <button
                            onClick={() => onDismiss(t.id)}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--text-muted)', opacity: 0.6, padding: '2px', flexShrink: 0,
                            }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
