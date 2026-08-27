'use client';

import { useEffect, useState } from 'react';

interface AnimatedHeadlineProps {
    text: string;
    className?: string;
    delayMs?: number;
    staggerMs?: number;
}

export function AnimatedHeadline({
    text,
    className,
    delayMs = 200,
    staggerMs = 120,
}: AnimatedHeadlineProps) {
    const words = text.split(' ');
    const [visibleCount, setVisibleCount] = useState(0);

    useEffect(() => {
        const timeout = setTimeout(() => {
            const interval = setInterval(() => {
                setVisibleCount((prev) => {
                    if (prev >= words.length) {
                        clearInterval(interval);
                        return prev;
                    }
                    return prev + 1;
                });
            }, staggerMs);
            return () => clearInterval(interval);
        }, delayMs);
        return () => clearTimeout(timeout);
    }, [words.length, delayMs, staggerMs]);

    return (
        <h1 className={className} aria-label={text}>
            {words.map((word, i) => (
                <span
                    key={i}
                    style={{
                        display: 'inline-block',
                        opacity: i < visibleCount ? 1 : 0,
                        transform: i < visibleCount ? 'translateY(0)' : 'translateY(12px)',
                        transition: 'opacity 0.45s ease, transform 0.45s ease',
                        marginRight: '0.3em',
                    }}
                >
                    {word}
                </span>
            ))}
        </h1>
    );
}
