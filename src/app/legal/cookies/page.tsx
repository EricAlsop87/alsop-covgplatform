import React from 'react';

export const metadata = {
    title: 'Cookie Policy — CoverageCheckNow',
    description: 'Information about how CoverageCheckNow utilizes cookies, authentication tokens, and local storage.',
};

export default function CookiePolicyPage() {
    const lastUpdated = 'August 20, 2026';

    return (
        <article style={{ color: 'var(--text-high)', lineHeight: 1.75 }}>
            <header style={{ marginBottom: '2rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle, var(--border-default))' }}>
                <h1 style={{ fontSize: '1.85rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: 'var(--text-high)' }}>
                    Cookie Policy
                </h1>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                    <strong>Effective Date:</strong> {lastUpdated} &nbsp;|&nbsp; <strong>Operated by:</strong> Alsop & Associates Insurance Agency
                </p>
            </header>

            <Section title="1. What Are Cookies & Web Storage?">
                <p>
                    Cookies are small text files placed on your browser or device when you visit a website. In addition to cookies, modern web applications may utilize browser <strong>Local Storage</strong> and <strong>Session Storage</strong> to maintain secure user sessions and remember interface preferences across visits.
                </p>
                <p>
                    This policy outlines the specific cookies and storage mechanisms used by <strong>CoverageCheckNow</strong> (&quot;the Platform&quot;), operated by <strong>Alsop & Associates Insurance Agency</strong>.
                </p>
            </Section>

            <Section title="2. Cookies & Storage Technologies We Use">
                <p>
                    We maintain a minimal cookie footprint designed exclusively to ensure application security, authenticate licensed agency users and clients, and preserve your interface preferences.
                </p>
                <div style={{ overflowX: 'auto', marginTop: '1rem', marginBottom: '1.5rem' }}>
                    <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.85rem',
                    }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-default)', background: 'var(--bg-surface-raised, rgba(0,0,0,0.02))' }}>
                                <th style={{ textAlign: 'left', padding: '0.65rem 0.85rem', fontWeight: 700 }}>Cookie / Key</th>
                                <th style={{ textAlign: 'left', padding: '0.65rem 0.85rem', fontWeight: 700 }}>Category</th>
                                <th style={{ textAlign: 'left', padding: '0.65rem 0.85rem', fontWeight: 700 }}>Purpose</th>
                                <th style={{ textAlign: 'left', padding: '0.65rem 0.85rem', fontWeight: 700 }}>Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle, var(--border-default))' }}>
                                <td style={{ padding: '0.65rem 0.85rem' }}><code>sb-*-auth-token</code></td>
                                <td style={{ padding: '0.65rem 0.85rem' }}><span style={badgeStyle}>Strictly Necessary</span></td>
                                <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-mid)' }}>Supabase user authentication and encrypted session validation.</td>
                                <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-muted)' }}>Session / 30 Days</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle, var(--border-default))' }}>
                                <td style={{ padding: '0.65rem 0.85rem' }}><code>ccn_calendly_url</code></td>
                                <td style={{ padding: '0.65rem 0.85rem' }}><span style={functionalBadgeStyle}>Functional</span></td>
                                <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-mid)' }}>Remembers agency default Calendly scheduling link in the email composer.</td>
                                <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-muted)' }}>Persistent (Local)</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle, var(--border-default))' }}>
                                <td style={{ padding: '0.65rem 0.85rem' }}><code>cfp_internal_email_templates_v6</code></td>
                                <td style={{ padding: '0.65rem 0.85rem' }}><span style={functionalBadgeStyle}>Functional</span></td>
                                <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-mid)' }}>Stores custom email template edits and agency guardrail configurations.</td>
                                <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-muted)' }}>Persistent (Local)</td>
                            </tr>
                            <tr>
                                <td style={{ padding: '0.65rem 0.85rem' }}><code>theme</code></td>
                                <td style={{ padding: '0.65rem 0.85rem' }}><span style={functionalBadgeStyle}>Functional</span></td>
                                <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-mid)' }}>Preserves dark/light UI display theme preference.</td>
                                <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-muted)' }}>1 Year</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Section>

            <Section title="3. No Third-Party Advertising or Tracking Cookies">
                <div style={calloutBoxStyle}>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.92rem', color: 'var(--text-high)', fontWeight: 700 }}>
                        🛡️ Zero Third-Party Ad Trackers
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-mid)' }}>
                        CoverageCheckNow <strong>does not use third-party advertising cookies, retargeting pixels (e.g. Meta Pixel), or cross-site tracking technologies</strong>. Your browsing activity on this platform is never shared with advertising networks or data brokers.
                    </p>
                </div>
            </Section>

            <Section title="4. Managing & Disabling Cookies">
                <p>
                    Most modern browsers allow you to manage your cookie preferences through their settings menu. You can configure your browser to block or alert you about cookies:
                </p>
                <ul style={listStyle}>
                    <li><strong>Google Chrome:</strong> Settings → Privacy and Security → Third-Party Cookies.</li>
                    <li><strong>Apple Safari:</strong> Preferences → Privacy → Manage Website Data.</li>
                    <li><strong>Mozilla Firefox:</strong> Settings → Privacy &amp; Security → Cookies and Site Data.</li>
                    <li><strong>Microsoft Edge:</strong> Settings → Cookies and Site Permissions.</li>
                </ul>
                <p style={{ marginTop: '0.85rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <em>Note: Disabling strictly necessary authentication cookies will prevent you from logging into your agency or client portal account.</em>
                </p>
            </Section>

            <Section title="5. Updates & Contact Information">
                <p>
                    We may update this Cookie Policy periodically to reflect technological or regulatory changes. For questions regarding our cookie practices, please contact:
                </p>
                <div style={{ marginTop: '0.5rem', padding: '0.85rem 1rem', background: 'var(--bg-surface-raised, rgba(0,0,0,0.02))', borderRadius: '6px', fontSize: '0.85rem' }}>
                    <strong>Alsop & Associates Insurance Agency</strong><br />
                    Claremont, CA<br />
                    Telephone: <a href="tel:9096265000" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>(909) 626-5000</a><br />
                    Email: <a href="mailto:support@coveragechecknow.com" style={{ color: 'var(--accent-primary)' }}>support@coveragechecknow.com</a>
                </div>
            </Section>
        </article>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section style={{ marginBottom: '2.25rem' }}>
            <h2 style={{ fontSize: '1.18rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-high)' }}>{title}</h2>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-mid)', lineHeight: 1.7 }}>{children}</div>
        </section>
    );
}

const listStyle: React.CSSProperties = {
    paddingLeft: '1.25rem',
    margin: '0.75rem 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
};

const badgeStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.72rem',
    fontWeight: 700,
    background: 'rgba(99, 102, 241, 0.12)',
    color: '#6366f1',
};

const functionalBadgeStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.72rem',
    fontWeight: 700,
    background: 'rgba(16, 185, 129, 0.12)',
    color: '#10b981',
};

const calloutBoxStyle: React.CSSProperties = {
    marginTop: '0.75rem',
    padding: '1rem 1.25rem',
    borderRadius: '8px',
    background: 'rgba(16, 185, 129, 0.06)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    borderLeft: '4px solid #10b981',
};

