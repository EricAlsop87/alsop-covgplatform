import React from 'react';

export const metadata = {
    title: 'Terms of Service — CoverageCheckNow',
    description: 'Terms and conditions governing the use of CoverageCheckNow and related policy review services.',
};

export default function TermsOfServicePage() {
    const lastUpdated = 'August 20, 2026';

    return (
        <article style={{ color: 'var(--text-high)', lineHeight: 1.75 }}>
            <header style={{ marginBottom: '2rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle, var(--border-default))' }}>
                <h1 style={{ fontSize: '1.85rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: 'var(--text-high)' }}>
                    Terms of Service
                </h1>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                    <strong>Effective Date:</strong> {lastUpdated} &nbsp;|&nbsp; <strong>Operated by:</strong> Alsop & Associates Insurance Agency
                </p>
            </header>

            <Section title="1. Acceptance of Terms">
                <p>
                    These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between you (&quot;User&quot;, &quot;you&quot;, or &quot;your&quot;) and <strong>Alsop & Associates Insurance Agency</strong> (&quot;the Agency&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), governing your access to and use of <strong>CoverageCheckNow</strong> (&quot;the Platform&quot;), including our website, client portals, document submission tools, and generated coverage analysis reports.
                </p>
                <p>
                    By accessing the Platform, uploading documents, or viewing generated reports, you acknowledge that you have read, understood, and agree to be bound by these Terms and our <a href="/legal/privacy" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>Privacy Policy</a>. If you do not agree, do not use the Platform.
                </p>
            </Section>

            <Section title="2. Description of Service & Decision-Support Role">
                <p>
                    CoverageCheckNow is a proprietary software platform designed to assist licensed insurance professionals and policyholders in reviewing property insurance declaration pages, analyzing coverage line items, identifying potential coverage gaps, and comparing policy limits against third-party replacement cost calculations.
                </p>
                <div style={calloutBoxStyle}>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.92rem', color: 'var(--text-high)', fontWeight: 700 }}>
                        📋 Educational & Decision-Support Notice
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-mid)' }}>
                        The Platform and its generated reports are <strong>decision-support and educational tools only</strong>. Generated reports, summaries, and automated flags are designed to facilitate productive discussions between policyholders and licensed agents. They do not constitute formal insurance underwriting guarantees, replacement cost warranties, or legal advice.
                    </p>
                </div>
            </Section>

            <Section title="3. Critical Insurance Disclaimers">
                <ul style={listStyle}>
                    <li>
                        <strong>No Binding Authority:</strong> Electronic communications, portal views, and generated Coverage Analysis Reports <strong>DO NOT bind, amend, issue, modify, or cancel insurance coverage</strong>. All changes to policy limits, deductibles, or endorsements require formal review, explicit policyholder permission, and written confirmation/issuance from the applicable insurance carrier.
                    </li>
                    <li>
                        <strong>Policyholder Responsibility:</strong> Final coverage selections, policy limit choices, and deductible decisions remain solely the responsibility of the policyholder. Policyholders are advised to thoroughly review their official insurance policy declarations and policy contracts issued by their carrier.
                    </li>
                    <li>
                        <strong>Third-Party Valuation Estimates:</strong> Replacement Cost Estimates (RCE) and property data points are mathematical approximations based on current regional construction cost indexes. They do not represent an architectural appraisal, professional engineering survey, or structural guarantee.
                    </li>
                </ul>
            </Section>

            <Section title="4. Carrier Independence & Nominative Fair Use">
                <p>
                    CoverageCheckNow and Alsop & Associates Insurance Agency operate independently. This platform is <strong>not sponsored, endorsed, administered by, or affiliated with Allstate Insurance Company, the California FAIR Plan Association, or any specific insurance underwriter</strong>.
                </p>
                <p>
                    All third-party trademarks, carrier names, and trade names referenced on this website or in comparative reports are the property of their respective owners. Any reference to specific carriers, policies, or coverage forms is made strictly for comparative identification and educational review under the doctrine of nominative fair use.
                </p>
            </Section>

            <Section title="5. Artificial Intelligence & Automated Document Analysis">
                <p>
                    CoverageCheckNow employs automated optical character recognition (OCR) and enterprise artificial intelligence (OpenAI API) to extract data from uploaded declarations. While we maintain rigorous quality standards, automated systems may occasionally misinterpret blurry, non-standard, or redacted documents.
                </p>
                <p>
                    You agree that all automated analysis should be verified against original carrier documents and discussed with a licensed insurance professional prior to taking any contractual action.
                </p>
            </Section>

            <Section title="6. User Conduct & Document Uploads">
                <p>When using the Platform or uploading documents, you agree that:</p>
                <ul style={listStyle}>
                    <li>You are the named insured, policyholder, or an authorized representative permitted to submit the policy documents.</li>
                    <li>You will not upload fraudulent, altered, misleading, or malicious files.</li>
                    <li>You will not attempt to reverse engineer, decompile, scrape, or disrupt the Platform&apos;s infrastructure or security protections.</li>
                    <li>You will maintain the security of any login credentials or access links provided to you.</li>
                </ul>
            </Section>

            <Section title="7. Intellectual Property & Limited License">
                <p>
                    All software code, user interface designs, logos, report formatting structures, proprietary algorithms, and text comprising CoverageCheckNow are the exclusive intellectual property of <strong>Alsop & Associates Insurance Agency</strong> and are protected under United States and international copyright, trademark, and intellectual property laws.
                </p>
                <p>
                    You retain ownership of the insurance documents and raw data you upload. You grant us a non-exclusive, limited license to process, store, and display your data solely to provide review services to you in accordance with our Privacy Policy.
                </p>
            </Section>

            <Section title="8. Disclaimer of Warranties & Limitation of Liability">
                <p>
                    THE PLATFORM, INCLUDING ALL GENERATED REPORTS AND CONTENT, IS PROVIDED ON AN &quot;AS-IS&quot; AND &quot;AS-AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
                </p>
                <p>
                    IN NO EVENT SHALL ALSOP &amp; ASSOCIATES INSURANCE AGENCY, ITS OFFICERS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES (INCLUDING LOSS OF PROFITS, BUSINESS INTERRUPTION, OR UNINSURED LOSSES) ARISING FROM OR RELATED TO YOUR USE OF OR INABILITY TO USE THE PLATFORM OR RELIANCE ON ANY GENERATED REPORT.
                </p>
            </Section>

            <Section title="9. Governing Law & Jurisdiction">
                <p>
                    These Terms and any dispute arising from your use of the Platform shall be governed by and construed in accordance with the laws of the <strong>State of California</strong>, without regard to its conflict of law principles. Any legal action or proceeding shall be brought exclusively in the state or federal courts located in Los Angeles County or San Bernardino County, California.
                </p>
            </Section>

            <Section title="10. Modifications to Terms">
                <p>
                    We reserve the right to modify these Terms at any time. When updates are published, the &quot;Effective Date&quot; at the top of this page will be revised. Continued use of the Platform after any revisions constitutes your acceptance of the modified Terms.
                </p>
            </Section>

            <Section title="11. Contact Information">
                <p>For questions or notices concerning these Terms of Service, please contact:</p>
                <div style={{ marginTop: '0.5rem', padding: '0.85rem 1rem', background: 'var(--bg-surface-raised, rgba(0,0,0,0.02))', borderRadius: '6px', fontSize: '0.85rem' }}>
                    <strong>Alsop & Associates Insurance Agency</strong><br />
                    Legal & Compliance Department<br />
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

const calloutBoxStyle: React.CSSProperties = {
    marginTop: '1rem',
    padding: '1rem 1.25rem',
    borderRadius: '8px',
    background: 'rgba(0, 181, 190, 0.06)',
    border: '1px solid rgba(0, 181, 190, 0.25)',
    borderLeft: '4px solid var(--accent-primary)',
};

