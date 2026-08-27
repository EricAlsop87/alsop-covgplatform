'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
    message?: string;
    onRetry?: () => void;
}

export function ErrorState({ 
    message = 'Something went wrong. Please try again.', 
    onRetry 
}: ErrorStateProps) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '40vh',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
        }}>
            <AlertTriangle 
                size={40} 
                style={{ color: 'var(--status-warning)', opacity: 0.8 }} 
            />
            <p style={{
                color: 'var(--text-mid)',
                fontSize: '0.95rem',
                maxWidth: '400px',
                lineHeight: 1.5,
            }}>
                {message}
            </p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: 'var(--bg-surface-raised)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                        color: 'var(--text-high)',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-overlay)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface-raised)'}
                >
                    <RefreshCw size={14} />
                    Try Again
                </button>
            )}
        </div>
    );
}
