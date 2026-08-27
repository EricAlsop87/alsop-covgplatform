'use client';

import React, { ReactNode, useState, useEffect } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
    children: ReactNode;
    content: ReactNode;
    position?: 'top' | 'bottom' | 'right';
    rich?: boolean;
    delay?: number;
    className?: string; // Optional class for custom styling on the container
}

export function Tooltip({ 
    children, 
    content, 
    position = 'top', 
    rich = false, 
    delay = 200,
    className = ''
}: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

    // Cleanup timeout if component unmounts while waiting
    useEffect(() => {
        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [timeoutId]);

    const handleMouseEnter = () => {
        if (delay === 0) {
            setIsVisible(true);
            return;
        }
        
        const id = setTimeout(() => {
            setIsVisible(true);
        }, delay);
        setTimeoutId(id);
    };

    const handleMouseLeave = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            setTimeoutId(null);
        }
        setIsVisible(false);
    };

    // Determine position class
    let posClass = styles.positionTop;
    if (position === 'bottom') posClass = styles.positionBottom;
    if (position === 'right') posClass = styles.positionRight;

    return (
        <div 
            className={`${styles.tooltipContainer} ${className}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onFocus={handleMouseEnter}
            onBlur={handleMouseLeave}
        >
            {children}
            
            <div 
                className={`${styles.tooltipContent} ${posClass} ${rich ? styles.richContent : ''}`}
                style={{
                    opacity: isVisible ? 1 : 0,
                    visibility: isVisible ? 'visible' : 'hidden',
                    /* The hover state in CSS won't trigger if we use a JS delay, 
                       so we manage opacity via inline styles when delay is used */
                }}
            >
                {content}
            </div>
        </div>
    );
}
