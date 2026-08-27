import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = {
    width: 32,
    height: 32,
};
export const contentType = 'image/png';

export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                }}
            >
                <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
                    {/* Left Half: Upper Shield Body + Lower Shield Tip */}
                    <path d="M24 4 L4 14 V28 C4 29.41 4.16 30.74 4.47 32 H24 Z" fill="#1E40AF" />
                    <path d="M24 36 H6.08 C9.2 41.35 15.63 44.91 24 47 Z" fill="#1E40AF" />

                    {/* Right Half: Upper Shield Body with Chimney + Lower Shield Tip */}
                    <path d="M24 4 L32 8 V4 H38 V11 L44 14 V28 C44 29.41 43.84 30.74 43.53 32 H24 Z" fill="#3B82F6" />
                    <path d="M24 36 H41.92 C38.8 41.35 32.37 44.91 24 47 Z" fill="#3B82F6" />

                    {/* Precision White Checkmark */}
                    <path
                        d="M16 20 L22 26 L32 14"
                        stroke="#FFFFFF"
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>
        ),
        {
            ...size,
        }
    );
}
