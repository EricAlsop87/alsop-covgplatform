'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/Button/Button';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Mail, Lock, ArrowRight, UserPlus, LogIn, User, Phone } from 'lucide-react';
import Link from 'next/link';
import styles from './page.module.css';

export default function SignInPage() {
    return (
        <Suspense fallback={
            <div className={styles.container}>
                <div className={styles.formWrapper}>
                    <div className={styles.brandHeader}>
                        <div className={styles.brandLink}>
                            <BrandLogo variant="horizontal" size="md" />
                        </div>
                        <p className={styles.brandTagline}>Loading...</p>
                    </div>
                </div>
            </div>
        }>
            <SignInContent />
        </Suspense>
    );
}

function SignInContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [forgotMode, setForgotMode] = useState(false);
    const [resetEmail, setResetEmail] = useState('');

    // Auto-redirect if already authenticated
    useEffect(() => {
        async function checkExistingSession() {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data: account } = await supabase
                    .from('accounts')
                    .select('role')
                    .eq('id', session.user.id)
                    .single();
                const redirect = searchParams.get('redirect');
                if (redirect) {
                    router.replace(redirect);
                } else if (account?.role === 'customer') {
                    router.replace('/portal');
                } else {
                    router.replace('/dashboard');
                }
            }
        }
        checkExistingSession();
    }, [router, searchParams]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setLoading(true);

        try {
            if (isSignUp) {
                // Validate sign-up fields
                if (!firstName.trim() || !lastName.trim()) {
                    setError('First name and last name are required');
                    setLoading(false);
                    return;
                }
                if (!phoneNumber.trim()) {
                    setError('Phone number is required');
                    setLoading(false);
                    return;
                }
                if (password !== confirmPassword) {
                    setError('Passwords do not match');
                    setLoading(false);
                    return;
                }
                if (password.length < 6) {
                    setError('Password must be at least 6 characters');
                    setLoading(false);
                    return;
                }

                const { error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            first_name: firstName.trim(),
                            last_name: lastName.trim(),
                            phone: phoneNumber.trim(),
                        },
                    },
                });

                if (signUpError) {
                    setError(signUpError.message);
                } else {
                    setSuccess('Account created! Please check your email for a confirmation link, then sign in.');
                    setIsSignUp(false);
                    setPassword('');
                    setConfirmPassword('');
                }
            } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (signInError) {
                    setError(signInError.message);
                } else {
                    // Check role to determine redirect
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        const { data: account } = await supabase
                            .from('accounts')
                            .select('role')
                            .eq('id', user.id)
                            .single();
                        const role = account?.role;
                        if (role === 'customer') {
                            router.push('/portal');
                        } else {
                            router.push('/dashboard');
                        }
                    } else {
                        router.push('/dashboard');
                    }
                }
            }
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = (toSignUp: boolean) => {
        setIsSignUp(toSignUp);
        setForgotMode(false);
        setError(null);
        setSuccess(null);
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setLoading(true);

        try {
            const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail || email, {
                redirectTo: `${siteUrl}/auth/reset-password`,
            });

            if (resetError) {
                setError(resetError.message);
            } else {
                setSuccess('Password reset email sent! Check your inbox (and spam folder) for a link to reset your password.');
            }
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.formWrapper}>
                {/* Brand Header */}
                <div className={styles.brandHeader}>
                    <Link href="/" className={styles.brandLink}>
                        <BrandLogo variant="horizontal" size="lg" />
                    </Link>
                    <p className={styles.brandTagline}>
                        Intelligent coverage gap analysis &amp; policy review
                    </p>
                </div>

                {/* Tab Toggle */}
                <div className={styles.tabToggle}>
                    <button
                        className={`${styles.tab} ${!isSignUp ? styles.activeTab : ''}`}
                        onClick={() => resetForm(false)}
                    >
                        <LogIn size={16} />
                        Sign In
                    </button>
                    <button
                        className={`${styles.tab} ${isSignUp ? styles.activeTab : ''}`}
                        onClick={() => resetForm(true)}
                    >
                        <UserPlus size={16} />
                        Sign Up
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className={styles.form}>
                    {error && (
                        <div className={styles.errorAlert}>
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className={styles.successAlert}>
                            {success}
                        </div>
                    )}

                    {/* Sign-Up Only Fields */}
                    {isSignUp && (
                        <>
                            <div className={styles.nameRow}>
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>First Name <span className={styles.required}>*</span></label>
                                    <div className={styles.inputWrapper}>
                                        <User size={18} className={styles.inputIcon} />
                                        <input
                                            type="text"
                                            value={firstName}
                                            onChange={(e) => setFirstName(e.target.value)}
                                            placeholder="John"
                                            className={styles.input}
                                            required
                                            autoComplete="given-name"
                                        />
                                    </div>
                                </div>

                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Last Name <span className={styles.required}>*</span></label>
                                    <div className={styles.inputWrapper}>
                                        <User size={18} className={styles.inputIcon} />
                                        <input
                                            type="text"
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                            placeholder="Doe"
                                            className={styles.input}
                                            required
                                            autoComplete="family-name"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Phone Number <span className={styles.required}>*</span></label>
                                <div className={styles.inputWrapper}>
                                    <Phone size={18} className={styles.inputIcon} />
                                    <input
                                        type="tel"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        placeholder="(555) 123-4567"
                                        className={styles.input}
                                        required
                                        autoComplete="tel"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Email <span className={styles.required}>*</span></label>
                        <div className={styles.inputWrapper}>
                            <Mail size={18} className={styles.inputIcon} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className={styles.input}
                                required
                                autoComplete="email"
                            />
                        </div>
                    </div>

                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Password <span className={styles.required}>*</span></label>
                        <div className={styles.inputWrapper}>
                            <Lock size={18} className={styles.inputIcon} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={isSignUp ? 'Min. 6 characters' : '••••••••'}
                                className={styles.input}
                                required
                                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                            />
                        </div>
                    </div>

                    {isSignUp && (
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Confirm Password <span className={styles.required}>*</span></label>
                            <div className={styles.inputWrapper}>
                                <Lock size={18} className={styles.inputIcon} />
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Re-enter password"
                                    className={styles.input}
                                    required
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>
                    )}

                    <Button
                        type="submit"
                        fullWidth
                        isLoading={loading}
                        className={styles.submitButton}
                    >
                        {isSignUp ? 'Create Account' : 'Sign In'}
                        <ArrowRight size={18} style={{ marginLeft: '0.5rem' }} />
                    </Button>

                    {/* Forgot Password Link — sign-in mode only */}
                    {!isSignUp && !forgotMode && (
                        <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setForgotMode(true);
                                    setResetEmail(email);
                                    setError(null);
                                    setSuccess(null);
                                }}
                                className={styles.toggleLink}
                                style={{ fontSize: '0.8rem' }}
                            >
                                Forgot your password?
                            </button>
                        </div>
                    )}
                </form>

                {/* ─── Forgot Password Inline Form ─── */}
                {forgotMode && (
                    <form onSubmit={handleForgotPassword} style={{
                        marginTop: '1.25rem',
                        padding: '1.25rem',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--bg-surface-raised)',
                    }}>
                        <h3 style={{
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            color: 'var(--text-high)',
                            marginBottom: '0.5rem',
                        }}>Reset Password</h3>
                        <p style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-muted)',
                            marginBottom: '1rem',
                            lineHeight: 1.5,
                        }}>
                            Enter your email and we&apos;ll send you a link to reset your password.
                        </p>

                        {error && (
                            <div className={styles.errorAlert} style={{ marginBottom: '0.75rem' }}>
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className={styles.successAlert} style={{ marginBottom: '0.75rem' }}>
                                {success}
                            </div>
                        )}

                        <div className={styles.inputGroup} style={{ marginBottom: '1rem' }}>
                            <div className={styles.inputWrapper}>
                                <Mail size={18} className={styles.inputIcon} />
                                <input
                                    type="email"
                                    value={resetEmail}
                                    onChange={(e) => setResetEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className={styles.input}
                                    required
                                    autoComplete="email"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <Button
                                type="submit"
                                fullWidth
                                isLoading={loading}
                                className={styles.submitButton}
                            >
                                Send Reset Link
                            </Button>
                            <button
                                type="button"
                                onClick={() => {
                                    setForgotMode(false);
                                    setError(null);
                                    setSuccess(null);
                                }}
                                style={{
                                    padding: '0.625rem 1rem',
                                    background: 'transparent',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 'var(--radius-md)',
                                    color: 'var(--text-muted)',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                )}

                {/* Footer Toggle */}
                <div className={styles.toggleText}>
                    {isSignUp ? (
                        <>
                            Already have an account?{' '}
                            <button className={styles.toggleLink} onClick={() => resetForm(false)}>
                                Sign in
                            </button>
                        </>
                    ) : (
                        <>
                            Don&apos;t have an account?{' '}
                            <button className={styles.toggleLink} onClick={() => resetForm(true)}>
                                Create one
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
