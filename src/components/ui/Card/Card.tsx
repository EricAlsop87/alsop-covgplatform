import React from 'react';
import styles from './Card.module.scss';
import { clsx } from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'glass';
    hoverable?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
    ({ className, variant = 'default', hoverable, children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={clsx(
                    styles.card,
                    variant === 'glass' && styles.glass,
                    hoverable && styles.hoverable,
                    className
                )}
                {...props}
            >
                {children}
            </div>
        );
    }
);

Card.displayName = "Card";
