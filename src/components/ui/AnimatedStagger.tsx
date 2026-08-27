'use client';

import React, { useEffect, useState, useRef } from 'react';

interface AnimatedStaggerProps {
    children: React.ReactNode;
    className?: string;
    itemClassName?: string;
    staggerMs?: number;
    delayMs?: number;
    direction?: 'up' | 'down' | 'left' | 'right';
    distance?: number;
}

export function AnimatedStagger({
    children,
    className = '',
    itemClassName = '',
    staggerMs = 100,
    delayMs = 0,
    direction = 'up',
    distance = 20
}: AnimatedStaggerProps) {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
        );

        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => observer.disconnect();
    }, []);

    const getTransform = () => {
        switch (direction) {
            case 'up': return `translateY(${distance}px)`;
            case 'down': return `translateY(-${distance}px)`;
            case 'left': return `translateX(${distance}px)`;
            case 'right': return `translateX(-${distance}px)`;
            default: return `translateY(${distance}px)`;
        }
    };

    const childrenArray = React.Children.toArray(children);

    return (
        <div ref={ref} className={className}>
            {childrenArray.map((child, i) => (
                <div
                    key={i}
                    className={itemClassName}
                    style={{
                        opacity: isVisible ? 1 : 0,
                        transform: isVisible ? 'translate(0, 0)' : getTransform(),
                        transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)`,
                        transitionDelay: `${delayMs + (i * staggerMs)}ms`,
                        willChange: 'opacity, transform'
                    }}
                >
                    {child}
                </div>
            ))}
        </div>
    );
}
