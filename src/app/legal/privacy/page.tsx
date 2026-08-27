import React from 'react';

export const metadata = {
    title: 'Privacy Policy — CoverageCheckNow',
    description: 'How CoverageCheckNow and Alsop & Associates Insurance Agency collect, process, and protect your personal information.',
};

export default function PrivacyPolicyPage() {
    const lastUpdated = 'August 20, 2026';

    return (
        <article style={{ color: 'var(--text-high)', lineHeight: 1.75 }}>
            <header style={{ marginBottom: '2rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle, var(--border-default))' }}>
                <h1 style={{ fontSize: '1.85rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: 'var(--text-high)' }}>
                    Privacy Policy
                </h1>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                    <strong>Effective Date:</strong> {lastUpdated} &nbsp;|&nbsp; <strong>Operated by:</strong> Alsop & Associates Insurance Agency
                </p>
            </header>

            <Section title="1. Introduction & Operating Entity">
                <p>
                    CoverageCheckNow (&quot;the Platform&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is a proprietary insurance analysis and decision-support technology operated by <strong>Alsop & Associates Insurance Agency</strong> (&quot;the Agency&quot;), a licensed insurance agency based in Claremont, California.
                </p>
                <p>
                    We respect your privacy and are committed to safeguarding the nonpublic personal information (NPI) and personal data entrusted to us. This Privacy Policy explains how we collect, use, process, store, and protect your information when you access our website, use our client portal (<code style={codeStyle}>/portal</code>), upload insurance declarations (<code style={codeStyle}>/submit</code>), or receive generated coverage analysis reports.
                </p>
            </Section>

            <Section title="2. Information We Collect">
                <p>We collect information necessary to perform policy reviews, identify potential coverage differences, and provide insurance analysis services:</p>
                <ul style={listStyle}>
                    <li>
                        <strong>Account & Contact Information:</strong> Named insured name, primary email address, telephone number, mailing address, and login credentials for authenticated portal users.
                    </li>
                    <li>
                        <strong>Insurance Policy Documents & Declarations:</strong> Uploaded policy declaration pages, endorsements, schedule of coverages, carrier names, policy numbers, effective and expiration dates, coverage limits (Dwelling, Other Structures, Personal Property, Loss of Use, Personal Liability, Medical Payments), deductibles, and premium amounts.
                    </li>
                    <li>
                        <strong>Property & Valuation Information:</strong> Insured property address, living area square footage, year built, construction quality, roof type, architectural features, and Replacement Cost Estimates (RCE).
                    </li>
                    <li>
                        <strong>Satellite & Aerial Imagery:</strong> Publicly available satellite and street-level imagery of the insured property (retrieved via Google Maps Platform APIs) utilized solely to verify property structures (e.g. pools, solar panels, detached garages).
                    </li>
                    <li>
                        <strong>Technical & Interaction Data:</strong> IP address, browser type, device information, operating system, and timestamped audit logs of document uploads and report views.
                    </li>
                </ul>
            </Section>

            <Section title="3. Artificial Intelligence & Automated Processing Disclosures">
                <p>
                    To efficiently analyze complex policy declarations and generate structured comparative insights, CoverageCheckNow utilizes advanced natural language processing and artificial intelligence models (specifically via the <strong>OpenAI API</strong>).
                </p>
                <div style={calloutBoxStyle}>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.92rem', color: 'var(--text-high)', fontWeight: 700 }}>
                        🔒 Zero AI Model Training Guarantee
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-mid)' }}>
                        In accordance with OpenAI&apos;s commercial API Data Privacy Policy &amp; Business Terms, data and documents submitted through our enterprise API integrations are <strong>strictly confidential and are NEVER used to train, improve, or fine-tune OpenAI&apos;s foundation models</strong>. Data is transmitted via encrypted TLS channels and processed solely in volatile memory to extract structured data fields.
                    </p>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        For additional details on OpenAI&apos;s enterprise privacy commitments, please review the <a href="https://openai.com/enterprise-privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>OpenAI Enterprise Privacy Charter</a>.
                    </p>
                </div>
                <p style={{ marginTop: '0.85rem' }}>
                    <strong>Human-in-the-Loop Oversight:</strong> All automated findings, policy flags, and draft reports generated by the platform are supplementary advisory tools. They are reviewed by licensed insurance professionals and do not constitute automatic binding decisions or automated underwriting determinations.
                </p>
            </Section>

            <Section title="4. How We Use Your Information">
                <p>We use collected information solely for legitimate insurance and business purposes, including:</p>
                <ul style={listStyle}>
                    <li>Extracting policy limits from uploaded declarations to compare against current replacement cost calculations.</li>
                    <li>Generating Coverage Analysis Reports and highlighting potential coverage gaps or options for policyholder review.</li>
                    <li>Providing policyholders with access to view, download, and verify their property details and reports in the client portal.</li>
                    <li>Facilitating appointment scheduling with licensed agents via Calendly.</li>
                    <li>Maintaining security, preventing fraudulent document submissions, and complying with state insurance regulatory requirements.</li>
                </ul>
            </Section>

            <Section title="5. Absolute No-Sale & Data Sharing Policy">
                <p>
                    <strong>We do NOT sell, rent, monetize, trade, or share your personal information or insurance documents with third-party advertisers, brokers, or data brokers.</strong>
                </p>
                <p>We share data exclusively with trusted technical sub-processors essential to operating our secure platform:</p>
                <ul style={listStyle}>
                    <li><strong>Cloud Infrastructure & Database:</strong> Supabase (hosted on AWS) for secure PostgreSQL database hosting and AES-256 encrypted document storage.</li>
                    <li><strong>AI Extraction Engine:</strong> OpenAI API for automated text parsing under non-training enterprise data agreements.</li>
                    <li><strong>Mapping Services:</strong> Google Maps Platform for property geocoding and satellite imagery retrieval.</li>
                    <li><strong>Transactional Communications:</strong> Resend / SMTP for delivering automated report notifications and support communications.</li>
                    <li><strong>Legal & Regulatory Compliance:</strong> When required by lawful subpoena, court order, or applicable state and federal insurance regulations.</li>
                </ul>
            </Section>

            <Section title="6. Data Security & Storage">
                <p>We enforce robust technical, administrative, and physical safeguards to protect nonpublic personal information:</p>
                <ul style={listStyle}>
                    <li><strong>Encryption:</strong> All data in transit is protected using TLS 1.3 encryption. Stored documents and database records are encrypted at rest using AES-256.</li>
                    <li><strong>Access Controls:</strong> Strict role-based access control (RBAC) and Row-Level Security (RLS) ensure that only authorized agency personnel can access client policy files.</li>
                    <li><strong>File Validation:</strong> Uploaded files are validated against strict MIME and magic-byte signatures to prevent malicious file execution.</li>
                </ul>
            </Section>

            <Section title="7. Data Retention & Deletion">
                <p>
                    We retain uploaded policy records and generated reports for as long as needed to provide ongoing renewal review services to the policyholder, or as mandated by California insurance record-retention regulations.
                </p>
                <p>
                    Policyholders may request complete deletion of their account records and uploaded documents at any time by emailing <a href="mailto:support@coveragechecknow.com" style={{ color: 'var(--accent-primary)' }}>support@coveragechecknow.com</a>.
                </p>
            </Section>

            <Section title="8. Your California Privacy Rights (CCPA / CPRA & GLBA)">
                <p>
                    If you are a California resident, the California Consumer Privacy Act (as amended by the California Privacy Rights Act) and California Insurance Information and Privacy Protection Act provide you with specific rights:
                </p>
                <ul style={listStyle}>
                    <li><strong>Right to Know & Access:</strong> You have the right to request disclosure of the categories and specific pieces of personal information we have collected about you.</li>
                    <li><strong>Right to Delete:</strong> You have the right to request deletion of your personal data, subject to legal and regulatory retention obligations.</li>
                    <li><strong>Right to Correct:</strong> You have the right to request correction of inaccurate personal or property details in our records.</li>
                    <li><strong>Right to Non-Discrimination:</strong> We will never discriminate against you, deny services, or alter rates for exercising your privacy rights.</li>
                    <li><strong>Notice of Non-Sale:</strong> As stated, we do not sell or share personal data for cross-context behavioral advertising.</li>
                </ul>
                <p>
                    To exercise any of these rights, submit a verifiable request to <a href="mailto:support@coveragechecknow.com" style={{ color: 'var(--accent-primary)' }}>support@coveragechecknow.com</a> or call our office at <strong>(909) 626-5000</strong>.
                </p>
            </Section>

            <Section title="9. Carrier Independence & Trademark Notice">
                <p>
                    CoverageCheckNow and Alsop & Associates Insurance Agency operate independently. This platform is not sponsored, endorsed, or affiliated with Allstate Insurance Company, the California FAIR Plan Association, or any specific insurance underwriter. All third-party trademarks and carrier names referenced on the platform or in comparative reports are the property of their respective owners and are used strictly for informational identification and comparative review.
                </p>
            </Section>

            <Section title="10. Contact Us">
                <p>If you have questions regarding this Privacy Policy or our data protection practices, please contact us:</p>
                <div style={{ marginTop: '0.5rem', padding: '0.85rem 1rem', background: 'var(--bg-surface-raised, rgba(0,0,0,0.02))', borderRadius: '6px', fontSize: '0.85rem' }}>
                    <strong>Alsop & Associates Insurance Agency</strong><br />
                    Attention: Privacy & Compliance Officer<br />
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

const codeStyle: React.CSSProperties = {
    fontSize: '0.82rem',
    padding: '0.15rem 0.35rem',
    borderRadius: '4px',
    background: 'var(--bg-surface-raised, rgba(0,0,0,0.05))',
    border: '1px solid var(--border-default)',
    fontFamily: 'monospace',
};

const calloutBoxStyle: React.CSSProperties = {
    marginTop: '1rem',
    padding: '1rem 1.25rem',
    borderRadius: '8px',
    background: 'rgba(0, 181, 190, 0.06)',
    border: '1px solid rgba(0, 181, 190, 0.25)',
    borderLeft: '4px solid var(--accent-primary)',
};

