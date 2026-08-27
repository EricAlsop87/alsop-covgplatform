import Link from 'next/link';

/**
 * Custom 404 page.
 * Shown when a user navigates to a route that doesn't exist.
 */
export default function NotFound() {
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
                maxWidth: '480px',
                textAlign: 'center',
                width: '100%',
            }}>
                <div style={{
                    fontSize: '4rem',
                    fontWeight: 800,
                    color: 'rgba(59, 130, 246, 0.3)',
                    marginBottom: '0.5rem',
                    lineHeight: 1,
                }}>
                    404
                </div>
                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    marginBottom: '0.75rem',
                }}>
                    Page Not Found
                </h2>
                <p style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    lineHeight: 1.6,
                    marginBottom: '2rem',
                    fontSize: '0.95rem',
                }}>
                    The page you&apos;re looking for doesn&apos;t exist or may have been moved.
                </p>
                <Link
                    href="/"
                    style={{
                        padding: '0.625rem 2rem',
                        background: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '0.5rem',
                        color: '#60a5fa',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        textDecoration: 'none',
                        display: 'inline-block',
                    }}
                >
                    Back to Home
                </Link>
            </div>
        </div>
    );
}
