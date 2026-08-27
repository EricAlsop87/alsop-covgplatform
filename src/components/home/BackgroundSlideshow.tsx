'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

const images = [
    '/images/home-bg-1.png',
    '/images/home-bg-2.png',
    '/images/home-bg-3.png',
    '/images/home-bg-4.png',
    '/images/home-bg-5.png',
];

export function BackgroundSlideshow() {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % images.length);
        }, 12000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 1,
                overflow: 'hidden',
                backgroundColor: '#070a10',
            }}
        >
            {/* Heavy gradient scrim for text legibility */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                        linear-gradient(180deg,
                            rgba(7, 10, 16, 0.85) 0%,
                            rgba(7, 10, 16, 0.70) 30%,
                            rgba(7, 10, 16, 0.75) 60%,
                            rgba(7, 10, 16, 0.92) 100%
                        )
                    `,
                    zIndex: 2,
                }}
            />
            {images.map((src, index) => (
                <div
                    key={src}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        opacity: index === currentIndex ? 0.6 : 0,
                        transition: 'opacity 2s ease-in-out',
                        zIndex: 0,
                    }}
                >
                    <Image
                        src={src}
                        alt=""
                        fill
                        style={{ objectFit: 'cover', filter: 'blur(1px) saturate(0.7)' }}
                        quality={75}
                        priority={index === 0}
                    />
                </div>
            ))}
        </div>
    );
}
