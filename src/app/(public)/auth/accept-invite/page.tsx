'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/Button/Button';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Lock, ArrowRight, CheckCircle, AlertCircle, Eye, EyeOff, UserPlus } from 'lucide-react';
import Link from 'next/link';
import styles from '../reset-password/page.module.css';

/**
 * Accept Invite Page (/auth/accept-invite)
 *
 * Supabase invite flow:
 * 1. Admin sends invite via POST /api/admin/invite
 * 2. Supabase sends an invite email with a secure magic link
 * 3. The link contains a token that redirects here
 * 4. Supabase auto-establishes a session via the URL hash fragment (SIGNED_IN event)
 * 5. This page lets the user set their password via supabase.auth.updateUser()
 * 6. After setting the password, the DB trigger has already created their accounts row
 */
export default function AcceptInvitePage() {
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
    const [userName, setUserName] = useState<string>('');

    // Listen for auth events from the invite token
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY' || event === 'TOKEN_REFRESHED') {
                setSessionReady(true);
                setCheckingSession(false);

                // Extract invited user's name from metadata if available
                const meta = session?.user?.user_metadata;
                if (meta?.first_name) {
                    setUserName(meta.first_name);
                }
            }
        });

        // Also check if there's already a session (e.g. user navigated directly)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setSessionReady(true);
                const meta = session.user?.user_metadata;
                if (meta?.first_name) {
                    setUserName(meta.first_name);
                }
            }
            // Stop spinner after a brief wait
            setTimeout(() => setCheckingSession(false), 2500);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

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
                // Redirect to dashboard after success
                setTimeout(() => {
                    router.push('/dashboard');
                }, 3000);
            }
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Loading state — verifying invite token
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
                        <p className={styles.statusText}>Verifying your invite link...</p>
                    </div>
                </div>
            </div>
        );
    }

    // No valid session — invite link expired or invalid
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
                        <h2 className={styles.title}>Invite Link Expired</h2>
                        <p className={styles.subtitle}>
                            This invite link has expired or is invalid.
                            Please contact your administrator to send a new invite.
                        </p>
                        <Link href="/auth/signin" className={styles.backToSignIn}>
                            Go to Sign In
                            <ArrowRight size={16} />
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Success state — password set, account is ready
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
                        <h2 className={styles.title}>You&apos;re All Set!</h2>
                        <p className={styles.subtitle}>
                            Your password has been set and your account is ready.
                            Redirecting you to the dashboard...
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

    // Main form — set password
    return (
        <div className={styles.container}>
            <div className={styles.formWrapper}>
                {/* Brand Header */}
                <div className={styles.brandHeader}>
                    <Link href="/" className={styles.brandLink}>
                        <BrandLogo variant="horizontal" size="lg" />
                    </Link>
                    <p className={styles.brandTagline}>
                        {userName ? (
                            <>Welcome, <strong>{userName}</strong>! Set your password to get started.</>
                        ) : (
                            <>Welcome! Set your password to activate your account.</>
                        )}
                    </p>
                </div>

                {/* Welcome banner */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-success-subtle, rgba(34,197,94,0.08))',
                    border: '1px solid rgba(34,197,94,0.2)',
                    borderRadius: 'var(--radius-md, 8px)',
                    marginBottom: '1.5rem',
                    fontSize: '0.82rem',
                    color: 'var(--status-success, #22c55e)',
                    fontWeight: 500,
                }}>
                    <UserPlus size={16} style={{ flexShrink: 0 }} />
                    Your invite has been verified. Choose a secure password below.
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
                            Password <span className={styles.required}>*</span>
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
                                placeholder="Re-enter your password"
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
                        Set Password & Get Started
                        <ArrowRight size={18} style={{ marginLeft: '0.5rem' }} />
                    </Button>
                </form>

                {/* Footer */}
                <div className={styles.toggleText}>
                    Already have an account?{' '}
                    <Link href="/auth/signin" className={styles.toggleLink}>
                        Sign in
                    </Link>
                </div>
            </div>
        </div>
    );
}
