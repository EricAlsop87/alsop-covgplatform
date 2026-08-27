import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'CoverageCheckNow — Policy Analysis & Coverage Review';
export const size = {
    width: 1200,
    height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    backgroundColor: '#0F172A',
                    backgroundImage: 'radial-gradient(circle at 25px 25px, #1E293B 2%, transparent 0%), radial-gradient(circle at 75px 75px, #1E293B 2%, transparent 0%), linear-gradient(135deg, #0B1120 0%, #172554 50%, #1E3A8A 100%)',
                    backgroundSize: '100px 100px, 100px 100px, 100% 100%',
                    padding: '60px 80px',
                    fontFamily: 'sans-serif',
                    color: '#FFFFFF',
                }}
            >
                {/* Header: Brand Logo & Agency Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    {/* Exact Subtle Chimney Shield Emblem */}
                    <svg width="72" height="72" viewBox="0 0 48 48" fill="none">
                        {/* Left Half: Upper Shield Body + Lower Shield Tip */}
                        <path d="M24 4 L4 14 V28 C4 29.41 4.16 30.74 4.47 32 H24 Z" fill="#2563EB" />
                        <path d="M24 36 H6.08 C9.2 41.35 15.63 44.91 24 47 Z" fill="#2563EB" />

                        {/* Right Half: Upper Shield Body with Chimney + Lower Shield Tip */}
                        <path d="M24 4 L32 8 V4 H38 V11 L44 14 V28 C44 29.41 43.84 30.74 43.53 32 H24 Z" fill="#60A5FA" />
                        <path d="M24 36 H41.92 C38.8 41.35 32.37 44.91 24 47 Z" fill="#60A5FA" />

                        {/* Precision White Checkmark */}
                        <path
                            d="M16 20 L22 26 L32 14"
                            stroke="#FFFFFF"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: '42px', fontWeight: 900, letterSpacing: '-0.03em', display: 'flex' }}>
                            <span style={{ color: '#FFFFFF' }}>Coverage</span>
                            <span style={{ color: '#60A5FA' }}>Check</span>
                            <span style={{ color: '#FFFFFF' }}>Now</span>
                        </div>
                        <div style={{ fontSize: '15px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '2px' }}>
                            Alsop and Associates Insurance Agency
                        </div>
                    </div>
                </div>

                {/* Main Hero Headline & Subtitle */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '980px' }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 18px',
                            borderRadius: '30px',
                            background: 'rgba(59, 130, 246, 0.18)',
                            border: '1px solid rgba(96, 165, 250, 0.4)',
                            color: '#93C5FD',
                            fontSize: '18px',
                            fontWeight: 700,
                            alignSelf: 'flex-start',
                        }}
                    >
                        <span>🛡️</span> Policy Analysis &amp; Coverage Review
                    </div>

                    <h1
                        style={{
                            fontSize: '52px',
                            fontWeight: 900,
                            lineHeight: 1.15,
                            letterSpacing: '-0.03em',
                            margin: 0,
                            backgroundImage: 'linear-gradient(180deg, #FFFFFF 0%, #E2E8F0 100%)',
                            backgroundClip: 'text',
                            color: 'transparent',
                        }}
                    >
                        Policy Analysis, Replacement Cost &amp; Coverage Review
                    </h1>

                    <p style={{ fontSize: '22px', color: '#94A3B8', lineHeight: 1.4, margin: 0 }}>
                        Automatic dec page ingestion, RCE verification, coverage gap detection, and Allstate CoPilot prompt generation.
                    </p>
                </div>

                {/* Footer Badges & Verification */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        paddingTop: '24px',
                        borderTop: '1px solid rgba(148, 163, 184, 0.2)',
                    }}
                >
                    <div style={{ display: 'flex', gap: '28px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', color: '#CBD5E1', fontWeight: 600 }}>
                            <span style={{ color: '#10B981', fontWeight: 900 }}>✓</span> Instant Dec Parser
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', color: '#CBD5E1', fontWeight: 600 }}>
                            <span style={{ color: '#10B981', fontWeight: 900 }}>✓</span> RCE Verification
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', color: '#CBD5E1', fontWeight: 600 }}>
                            <span style={{ color: '#10B981', fontWeight: 900 }}>✓</span> CoPilot Generator
                        </div>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '18px',
                            fontWeight: 700,
                            color: '#93C5FD',
                        }}
                    >
                        coveragechecknow.com
                    </div>
                </div>
            </div>
        ),
        {
            ...size,
        }
    );
}
