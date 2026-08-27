'use client';

import React from 'react';

interface SmoothScrollLinkProps {
    href: string;
    className?: string;
    children: React.ReactNode;
}

export function SmoothScrollLink({ href, className = '', children }: SmoothScrollLinkProps) {
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (href.startsWith('#')) {
            e.preventDefault();
            const targetId = href.substring(1);
            const elem = document.getElementById(targetId);
            if (elem) {
                elem.scrollIntoView({ behavior: 'smooth' });
            }
        }
    };

    return (
        <a href={href} className={className} onClick={handleClick}>
            {children}
        </a>
    );
}
