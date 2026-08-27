'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';

const HERO_IMAGES = [
    { src: '/images/hero-home.webp', alt: 'A warm, well-protected home at dusk' },
    { src: '/images/hero-home-1.webp', alt: 'Modern home with warm interior lighting at golden hour' },
    { src: '/images/hero-home-3.webp', alt: 'Elegant Mediterranean villa at sunset' },
    { src: '/images/hero-home-5.webp', alt: 'Classic colonial home in autumn setting' },
];

const INTERVAL_MS = 10000; // 10 seconds per image
const FADE_DURATION = '1.5s';

export function HeroCarousel() {
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setActiveIndex(prev => (prev + 1) % HERO_IMAGES.length);
        }, INTERVAL_MS);
        return () => clearInterval(timer);
    }, []);

    return (
        <>
            {HERO_IMAGES.map((img, i) => (
                <Image
                    key={img.src}
                    src={img.src}
                    alt={img.alt}
                    fill
                    priority={i === 0}
                    sizes="50vw"
                    quality={85}
                    style={{
                        objectFit: 'cover',
                        opacity: i === activeIndex ? 1 : 0,
                        transition: `opacity ${FADE_DURATION} ease-in-out`,
                        zIndex: i === activeIndex ? 1 : 0,
                    }}
                />
            ))}
        </>
    );
}
