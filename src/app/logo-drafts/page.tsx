import React from 'react';
import { BrandLogo, BrandEmblem } from '@/components/brand/BrandLogo';

export default function LogoDraftsPage() {
    return (
        <div style={{ padding: '48px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            
            <div style={{ marginBottom: '40px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>
                    <span>✨</span> Final Approved Brand Identity
                </div>
                <h1 style={{ fontSize: '36px', fontWeight: 900, color: '#0F172A', marginBottom: '8px', letterSpacing: '-0.03em' }}>CoverageCheckNow Design System</h1>
                <p style={{ fontSize: '18px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                    The official <strong>Subtle Chimney Emblem (M2)</strong> and <strong>T2 Typography</strong>. Fully tested across light, dark, card, and gradient backgrounds.
                </p>
            </div>

            {/* 1. CONTRAST MATRIX (LIGHT VS DARK) */}
            <div style={{ marginBottom: '64px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginBottom: '16px' }}>1. Background Contrast Matrix</h2>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                    
                    {/* Pure Light */}
                    <div style={{
                        padding: '36px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B' }}>
                            Light Mode (Default Navbar &amp; Content)
                        </div>
                        <div style={{ padding: '24px 0' }}>
                            <BrandLogo variant="horizontal" size="lg" mode="light" />
                        </div>
                    </div>

                    {/* Raised Neutral */}
                    <div style={{
                        padding: '36px',
                        backgroundColor: '#F8FAFC',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B' }}>
                            Off-White / Slate-50 Background
                        </div>
                        <div style={{ padding: '24px 0' }}>
                            <BrandLogo variant="horizontal" size="lg" mode="light" />
                        </div>
                    </div>

                    {/* Dark Slate */}
                    <div style={{
                        padding: '36px',
                        backgroundColor: '#0F172A',
                        borderRadius: '16px',
                        border: '1px solid #1E293B',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8' }}>
                            Dark Mode (Slate-900 / Footer / Dark Cards)
                        </div>
                        <div style={{ padding: '24px 0' }}>
                            <BrandLogo variant="horizontal" size="lg" mode="dark" />
                        </div>
                    </div>

                    {/* Deep Midnight Navy */}
                    <div style={{
                        padding: '36px',
                        backgroundColor: '#0A0F1D',
                        backgroundImage: 'linear-gradient(135deg, #0A0F1D 0%, #172554 100%)',
                        borderRadius: '16px',
                        border: '1px solid #1E3A8A',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#93C5FD' }}>
                            Midnight Navy Hero Gradient
                        </div>
                        <div style={{ padding: '24px 0' }}>
                            <BrandLogo variant="horizontal" size="lg" mode="dark" />
                        </div>
                    </div>

                </div>
            </div>

            {/* 2. SCALE & SIZE PRESETS */}
            <div style={{ marginBottom: '64px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginBottom: '16px' }}>2. Scale &amp; Proportions (Light &amp; Dark)</h2>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                    
                    {/* Light Scale */}
                    <div style={{ backgroundColor: '#FFFFFF', padding: '32px', borderRadius: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '28px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>Light Background Scale</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                            <span style={{ width: '40px', fontSize: '12px', color: '#94A3B8', fontWeight: 700 }}>XS</span>
                            <BrandLogo variant="horizontal" size="xs" mode="light" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                            <span style={{ width: '40px', fontSize: '12px', color: '#94A3B8', fontWeight: 700 }}>SM</span>
                            <BrandLogo variant="horizontal" size="sm" mode="light" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                            <span style={{ width: '40px', fontSize: '12px', color: '#94A3B8', fontWeight: 700 }}>MD</span>
                            <BrandLogo variant="horizontal" size="md" mode="light" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                            <span style={{ width: '40px', fontSize: '12px', color: '#94A3B8', fontWeight: 700 }}>LG</span>
                            <BrandLogo variant="horizontal" size="lg" mode="light" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                            <span style={{ width: '40px', fontSize: '12px', color: '#94A3B8', fontWeight: 700 }}>XL</span>
                            <BrandLogo variant="horizontal" size="xl" mode="light" />
                        </div>
                    </div>

                    {/* Dark Scale */}
                    <div style={{ backgroundColor: '#0F172A', padding: '32px', borderRadius: '16px', border: '1px solid #1E293B', display: 'flex', flexDirection: 'column', gap: '28px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>Dark Background Scale</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                            <span style={{ width: '40px', fontSize: '12px', color: '#64748B', fontWeight: 700 }}>XS</span>
                            <BrandLogo variant="horizontal" size="xs" mode="dark" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                            <span style={{ width: '40px', fontSize: '12px', color: '#64748B', fontWeight: 700 }}>SM</span>
                            <BrandLogo variant="horizontal" size="sm" mode="dark" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                            <span style={{ width: '40px', fontSize: '12px', color: '#64748B', fontWeight: 700 }}>MD</span>
                            <BrandLogo variant="horizontal" size="md" mode="dark" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                            <span style={{ width: '40px', fontSize: '12px', color: '#64748B', fontWeight: 700 }}>LG</span>
                            <BrandLogo variant="horizontal" size="lg" mode="dark" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                            <span style={{ width: '40px', fontSize: '12px', color: '#64748B', fontWeight: 700 }}>XL</span>
                            <BrandLogo variant="horizontal" size="xl" mode="dark" />
                        </div>
                    </div>

                </div>
            </div>

            {/* 3. APP ICONS & EMBLEMS */}
            <div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginBottom: '16px' }}>3. Favicon, App Icon &amp; Standalone Emblems</h2>
                
                <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                    
                    {/* Raw Light Emblem */}
                    <div style={{ padding: '24px', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <BrandEmblem size={48} mode="light" />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Light Emblem (48px)</span>
                    </div>

                    {/* Raw Dark Emblem */}
                    <div style={{ padding: '24px', backgroundColor: '#0F172A', border: '1px solid #1E293B', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <BrandEmblem size={48} mode="dark" />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#94A3B8' }}>Dark Emblem (48px)</span>
                    </div>

                    {/* iOS App Icon Mockup */}
                    <div style={{ padding: '24px', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '14px', backgroundColor: '#0F172A', backgroundImage: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 16px -4px rgba(0, 0, 0, 0.2)' }}>
                            <BrandEmblem size={42} mode="dark" />
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Apple Touch Icon</span>
                    </div>

                    {/* Favicon Browser Tab Simulation */}
                    <div style={{ padding: '24px', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '280px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Browser Tab Preview</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', backgroundColor: '#F1F5F9', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                            <BrandEmblem size={18} mode="light" />
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>CoverageCheckNow — Ins...</span>
                            <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94A3B8' }}>✕</span>
                        </div>
                    </div>

                </div>
            </div>

        </div>
    );
}
