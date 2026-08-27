import React from 'react';
import styles from './Button.module.scss';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'excel';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    fullWidth?: boolean;
    isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', fullWidth, isLoading, children, disabled, ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={clsx(
                    styles.button,
                    styles[variant],
                    styles[size],
                    fullWidth && styles.fullWidth,
                    className
                )}
                disabled={disabled || isLoading}
                {...props}
            >
                <span className={styles.glow} aria-hidden="true" />
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" style={{ marginRight: '0.5rem' }} />}
                {children}
            </button>
        );
    }
);

Button.displayName = "Button";
