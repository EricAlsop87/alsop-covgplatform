'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';


/**
 * Next.js root error boundary.
 * Catches unhandled errors at the route level and shows a friendly fallback.
 * See: https://nextjs.org/docs/app/building-your-application/routing/error-handling
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error (in production, send to monitoring service)
        logger.error('error', '[GlobalError]', { error: error.message, digest: error.digest })
    }, [error]);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            backgroundColor: '#0f172a',
            padding: '2rem',
            fontFamily: "'Inter', system-ui, sans-serif",
        }}>
            <div style={{
                background: 'rgba(30, 41, 59, 0.8)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '1.25rem',
                padding: '3rem',
                maxWidth: '520px',
                textAlign: 'center',
                width: '100%',
            }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1.5rem',
                    fontSize: '1.75rem',
                }}>
                    ❌
                </div>
                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    marginBottom: '0.75rem',
                }}>
                    Something went wrong
                </h2>
                <p style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    lineHeight: 1.6,
                    marginBottom: '1.5rem',
                    fontSize: '0.95rem',
                }}>
                    An unexpected error occurred. Our team has been notified.
                    Please try again, or go back to the home page.
                </p>
                {error.message && (
                    <p style={{
                        color: '#fca5a5',
                        fontSize: '0.8rem',
                        fontFamily: 'monospace',
                        background: 'rgba(239, 68, 68, 0.08)',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid rgba(239, 68, 68, 0.15)',
                        marginBottom: '1.5rem',
                        wordBreak: 'break-word',
                    }}>
                        {error.message}
                    </p>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                    <button
                        onClick={() => reset()}
                        style={{
                            padding: '0.625rem 1.5rem',
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            borderRadius: '0.5rem',
                            color: '#60a5fa',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 500,
                        }}
                    >
                        Try Again
                    </button>
                    <a
                        href="/"
                        style={{
                            padding: '0.625rem 1.5rem',
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '0.5rem',
                            color: 'rgba(255,255,255,0.6)',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 500,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                        }}
                    >
                        Go Home
                    </a>
                </div>
            </div>
        </div>
    );
}
