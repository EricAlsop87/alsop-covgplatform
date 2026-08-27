import React from 'react';

export interface BrandLogoProps {
    /** Layout variant */
    variant?: 'icon' | 'horizontal' | 'badge';
    /** Size preset */
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    /** Custom pixel height for the icon */
    iconSize?: number;
    /** Custom font size for the wordmark text */
    fontSize?: string;
    /** Hide the wordmark text */
    hideText?: boolean;
    /** Extra CSS class */
    className?: string;
    /** Dark, light, or auto contrast mode */
    mode?: 'auto' | 'light' | 'dark' | 'monochrome';
}

const SIZES = {
    xs: { icon: 18, fontSize: '1rem', gap: '0.4rem' },
    sm: { icon: 24, fontSize: '1.3rem', gap: '0.5rem' },
    md: { icon: 32, fontSize: '1.75rem', gap: '0.65rem' },
    lg: { icon: 40, fontSize: '2.2rem', gap: '0.8rem' },
    xl: { icon: 52, fontSize: '2.85rem', gap: '1rem' },
};

/**
 * CoverageCheckNow Brand Emblem (SVG)
 * Modern geometric protection shield & house silhouette with subtle chimney,
 * negative space floor slice, and crisp precision checkmark.
 */
export function BrandEmblem({
    size = 32,
    className = '',
    mode = 'auto',
}: {
    size?: number;
    className?: string;
    mode?: 'auto' | 'light' | 'dark' | 'monochrome';
}) {
    // Color definitions based on mode
    let leftColor = '#1E40AF';
    let rightColor = '#3B82F6';
    let checkColor = '#FFFFFF';

    if (mode === 'dark') {
        leftColor = '#2563EB';
        rightColor = '#60A5FA';
        checkColor = '#FFFFFF';
    } else if (mode === 'monochrome') {
        leftColor = 'currentColor';
        rightColor = 'currentColor';
        checkColor = '#FFFFFF';
    }

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ flexShrink: 0, display: 'block' }}
        >
            {/* Left Half: Upper Shield Body + Lower Shield Tip (Clean transparent floor gap) */}
            <path d="M24 4 L4 14 V28 C4 29.41 4.16 30.74 4.47 32 H24 Z" fill={leftColor} />
            <path d="M24 36 H6.08 C9.2 41.35 15.63 44.91 24 47 Z" fill={leftColor} />

            {/* Right Half: Upper Shield Body with Chimney + Lower Shield Tip */}
            <path d="M24 4 L32 8 V4 H38 V11 L44 14 V28 C44 29.41 43.84 30.74 43.53 32 H24 Z" fill={rightColor} />
            <path d="M24 36 H41.92 C38.8 41.35 32.37 44.91 24 47 Z" fill={rightColor} />

            {/* Crisp Precision Checkmark */}
            <path
                d="M16 20 L22 26 L32 14"
                stroke={checkColor}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function BrandLogo({
    variant = 'horizontal',
    size = 'md',
    iconSize,
    fontSize,
    hideText = false,
    className = '',
    mode = 'auto',
}: BrandLogoProps) {
    const config = SIZES[size] || SIZES.md;
    const finalIconSize = iconSize || config.icon;
    const finalFontSize = fontSize || config.fontSize;

    if (variant === 'icon' || hideText) {
        return <BrandEmblem size={finalIconSize} className={className} mode={mode} />;
    }

    // Determine text colors based on mode
    let mainTextColor = '#0F172A'; // Slate-900
    let checkTextColor = '#2563EB'; // Blue-600

    if (mode === 'dark') {
        mainTextColor = '#FFFFFF';
        checkTextColor = '#60A5FA'; // Bright Blue-400 for high dark contrast
    } else if (mode === 'monochrome') {
        mainTextColor = 'currentColor';
        checkTextColor = 'currentColor';
    }

    return (
        <div
            className={className}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: config.gap,
                textDecoration: 'none',
                userSelect: 'none',
                lineHeight: 1,
            }}
        >
            <BrandEmblem size={finalIconSize} mode={mode} />
            <span
                style={{
                    fontSize: finalFontSize,
                    fontWeight: 900,
                    letterSpacing: '-0.03em',
                    color: mainTextColor,
                    display: 'inline-flex',
                    alignItems: 'center',
                    lineHeight: 1,
                    fontFamily: 'inherit',
                }}
            >
                <span>Coverage</span>
                <span style={{ color: checkTextColor, fontWeight: 900 }}>Check</span>
                <span>Now</span>
            </span>
        </div>
    );
}
