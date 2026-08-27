'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/Button/Button';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Lock, ArrowRight, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import styles from './page.module.css';

/**
 * Password Reset Page (/auth/reset-password)
 *
 * Supabase flow:
 * 1. User clicks "Forgot password?" on the sign-in page
 * 2. supabase.auth.resetPasswordForEmail() sends a recovery email
 * 3. The email link contains a token that redirects here
 * 4. Supabase auto-establishes a session via the URL hash fragment
 * 5. This page calls supabase.auth.updateUser({ password }) to set the new password
 */
export default function ResetPasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [sessionReady, setSessionReady] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);

    // Listen for the PASSWORD_RECOVERY event from Supabase
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                // Session is established from the recovery token
                setSessionReady(true);
                setCheckingSession(false);
            } else if (event === 'SIGNED_IN') {
                // This fires after PASSWORD_RECOVERY in some Supabase versions
                setSessionReady(true);
                setCheckingSession(false);
            }
        });

        // Also check if there's already a session (user navigated directly)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setSessionReady(true);
            }
            // After a brief delay, stop checking regardless
            setTimeout(() => setCheckingSession(false), 2000);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password,
            });

            if (updateError) {
                setError(updateError.message);
            } else {
                setSuccess(true);
                // Auto-redirect to sign-in after success
                setTimeout(() => {
                    router.push('/auth/signin');
                }, 3000);
            }
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Loading state while checking for recovery session
    if (checkingSession) {
        return (
            <div className={styles.container}>
                <div className={styles.formWrapper}>
                    <div className={styles.brandHeader}>
                        <Link href="/" className={styles.brandLink}>
                            <BrandLogo variant="horizontal" size="lg" />
                        </Link>
                    </div>
                    <div className={styles.centerContent}>
                        <div className={styles.spinner} />
                        <p className={styles.statusText}>Verifying your reset link...</p>
                    </div>
                </div>
            </div>
        );
    }

    // No valid session — link may be expired or invalid
    if (!sessionReady) {
        return (
            <div className={styles.container}>
                <div className={styles.formWrapper}>
                    <div className={styles.brandHeader}>
                        <Link href="/" className={styles.brandLink}>
                            <BrandLogo variant="horizontal" size="lg" />
                        </Link>
                    </div>
                    <div className={styles.centerContent}>
                        <div className={styles.iconCircle} data-variant="error">
                            <AlertCircle size={28} />
                        </div>
                        <h2 className={styles.title}>Reset Link Expired</h2>
                        <p className={styles.subtitle}>
                            This password reset link has expired or is invalid.
                            Please request a new one from the sign-in page.
                        </p>
                        <Link href="/auth/signin" className={styles.backToSignIn}>
                            Back to Sign In
                            <ArrowRight size={16} />
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Success state
    if (success) {
        return (
            <div className={styles.container}>
                <div className={styles.formWrapper}>
                    <div className={styles.brandHeader}>
                        <Link href="/" className={styles.brandLink}>
                            <BrandLogo variant="horizontal" size="lg" />
                        </Link>
                    </div>
                    <div className={styles.centerContent}>
                        <div className={styles.iconCircle} data-variant="success">
                            <CheckCircle size={28} />
                        </div>
                        <h2 className={styles.title}>Password Updated</h2>
                        <p className={styles.subtitle}>
                            Your password has been successfully changed.
                            Redirecting you to sign in...
                        </p>
                        <div className={styles.redirectSpinner}>
                            <div className={styles.spinnerSmall} />
                            <span>Redirecting...</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Main form — enter new password
    return (
        <div className={styles.container}>
            <div className={styles.formWrapper}>
                {/* Brand Header */}
                <div className={styles.brandHeader}>
                    <Link href="/" className={styles.brandLink}>
                        <BrandLogo variant="horizontal" size="lg" />
                    </Link>
                    <p className={styles.brandTagline}>
                        Set your new password
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className={styles.form}>
                    {error && (
                        <div className={styles.errorAlert}>
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    <div className={styles.inputGroup}>
                        <label className={styles.label}>
                            New Password <span className={styles.required}>*</span>
                        </label>
                        <div className={styles.inputWrapper}>
                            <Lock size={18} className={styles.inputIcon} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Min. 6 characters"
                                className={styles.input}
                                required
                                autoComplete="new-password"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className={styles.togglePasswordBtn}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {/* Password strength hint */}
                        {password.length > 0 && password.length < 6 && (
                            <p className={styles.hintText}>
                                <AlertCircle size={12} />
                                At least 6 characters required
                            </p>
                        )}
                    </div>

                    <div className={styles.inputGroup}>
                        <label className={styles.label}>
                            Confirm Password <span className={styles.required}>*</span>
                        </label>
                        <div className={styles.inputWrapper}>
                            <Lock size={18} className={styles.inputIcon} />
                            <input
                                type={showConfirm ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Re-enter your new password"
                                className={styles.input}
                                required
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm(!showConfirm)}
                                className={styles.togglePasswordBtn}
                                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                            >
                                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {/* Match validation */}
                        {confirmPassword.length > 0 && password !== confirmPassword && (
                            <p className={styles.hintText} data-variant="error">
                                <AlertCircle size={12} />
                                Passwords do not match
                            </p>
                        )}
                        {confirmPassword.length > 0 && password === confirmPassword && password.length >= 6 && (
                            <p className={styles.hintText} data-variant="success">
                                <CheckCircle size={12} />
                                Passwords match
                            </p>
                        )}
                    </div>

                    <Button
                        type="submit"
                        fullWidth
                        isLoading={loading}
                        className={styles.submitButton}
                        disabled={loading || password.length < 6 || password !== confirmPassword}
                    >
                        Update Password
                        <ArrowRight size={18} style={{ marginLeft: '0.5rem' }} />
                    </Button>
                </form>

                {/* Footer */}
                <div className={styles.toggleText}>
                    Remember your password?{' '}
                    <Link href="/auth/signin" className={styles.toggleLink}>
                        Sign in
                    </Link>
                </div>
            </div>
        </div>
    );
}
