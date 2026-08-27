'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@/lib/logger';

interface ErrorBoundaryProps {
    children: ReactNode;
    /** Optional fallback UI. If not provided, a default error card is shown. */
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * React Error Boundary.
 * Catches render errors in child components and shows a friendly fallback.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        logger.error('ErrorBoundary', 'Caught render error', {
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo.componentStack || undefined,
        });
    }

    handleReset = (): void => {
        this.setState({ hasError: false, error: null });
    };

    render(): ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '300px',
                    padding: '2rem',
                }}>
                    <div style={{
                        background: 'rgba(30, 41, 59, 0.7)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '1.25rem',
                        padding: '2.5rem',
                        maxWidth: '480px',
                        textAlign: 'center',
                        width: '100%',
                    }}>
                        <div style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            background: 'rgba(239, 68, 68, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1.25rem',
                            fontSize: '1.5rem',
                        }}>
                            ⚠️
                        </div>
                        <h3 style={{
                            fontSize: '1.25rem',
                            fontWeight: 700,
                            color: '#ffffff',
                            marginBottom: '0.5rem',
                        }}>
                            Something went wrong
                        </h3>
                        <p style={{
                            color: 'rgba(255, 255, 255, 0.5)',
                            fontSize: '0.9rem',
                            lineHeight: 1.6,
                            marginBottom: '1.5rem',
                        }}>
                            An error occurred while rendering this section. Please try again or contact support if the
                            problem persists.
                        </p>
                        {this.state.error && (
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
                                {this.state.error.message}
                            </p>
                        )}
                        <button
                            onClick={this.handleReset}
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
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
