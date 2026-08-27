'use client';

import { useEffect, useState } from 'react';
import { CFPForm } from '@/components/forms/CFPForm';
import Link from 'next/link';
import { ChevronLeft, LogIn, UserPlus, Mail, Lock, User, Phone, ArrowRight } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/Button/Button';
import type { UserRole } from '@/lib/auth';
import styles from './page.module.css';

export default function SubmitPage() {
    const [authLoading, setAuthLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<UserRole | undefined>(undefined);

    useEffect(() => {
        async function checkSession() {
            const { data: { session } } = await supabase.auth.getSession();
            const uid = session?.user?.id ?? null;
            setUserId(uid);
            if (uid) {
                const { data } = await supabase.from('accounts').select('role').eq('id', uid).single();
                setUserRole((data?.role as UserRole) || undefined);
            }
            setAuthLoading(false);
        }
        checkSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            const uid = session?.user?.id ?? null;
            setUserId(uid);
            if (uid) {
                const { data } = await supabase.from('accounts').select('role').eq('id', uid).single();
                setUserRole((data?.role as UserRole) || undefined);
            }
            setAuthLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const isAuthed = !!userId;

    return (
        <main className={styles.page}>
            <div className={styles.bgDecoration} />

            <div className={styles.inner}>
                <div style={{ display: 'flex' }}>
                    <Link href="/" className={styles.backLink}>
                        <ChevronLeft style={{ width: '1rem', height: '1rem', marginRight: '0.3rem' }} />
                        Back to Home
                    </Link>
                </div>

                {authLoading ? (
                    <div className={styles.loadingSkeleton}>
                        <div className={styles.spinner} />
                    </div>
                ) : isAuthed ? (
                    <CFPForm userId={userId!} userRole={userRole} />
                ) : (
                    <AuthGate />
                )}
            </div>
        </main>
    );
}

function AuthGate() {
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setLoading(true);

        try {
            if (isSignUp) {
                if (!firstName.trim() || !lastName.trim()) { setError('First name and last name are required'); setLoading(false); return; }
                if (!phoneNumber.trim()) { setError('Phone number is required'); setLoading(false); return; }
                if (password !== confirmPassword) { setError('Passwords do not match'); setLoading(false); return; }
                if (password.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return; }

                const { error: signUpError } = await supabase.auth.signUp({
                    email, password,
                    options: { data: { first_name: firstName.trim(), last_name: lastName.trim(), phone: phoneNumber.trim() } },
                });
                if (signUpError) { setError(signUpError.message); }
                else { setSuccess('Account created! Please check your email for a confirmation link, then sign in.'); setIsSignUp(false); setPassword(''); setConfirmPassword(''); }
            } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                if (signInError) { setError(signInError.message); }
            }
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = (toSignUp: boolean) => { setIsSignUp(toSignUp); setError(null); setSuccess(null); };

    return (
        <div className={styles.authCard}>
            {/* Brand */}
            <div className={styles.brandSection}>
                <div className={styles.brandRow}>
                    <BrandLogo variant="horizontal" size="md" />
                </div>
                <p className={styles.brandTagline}>
                    Sign in to check your coverage
                </p>
            </div>

            {/* Tab Toggle */}
            <div className={styles.tabToggle}>
                <button
                    onClick={() => resetForm(false)}
                    className={`${styles.tab} ${!isSignUp ? styles.tabActive : styles.tabInactive}`}
                >
                    <LogIn size={14} /> Sign In
                </button>
                <button
                    onClick={() => resetForm(true)}
                    className={`${styles.tab} ${isSignUp ? styles.tabActive : styles.tabInactive}`}
                >
                    <UserPlus size={14} /> Sign Up
                </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className={styles.form}>
                {error && <div className={styles.alertError}>{error}</div>}
                {success && <div className={styles.alertSuccess}>{success}</div>}

                {isSignUp && (
                    <>
                        <div className={styles.nameGrid}>
                            <InputField icon={<User size={16} />} type="text" placeholder="First Name"
                                value={firstName} onChange={setFirstName} required autoComplete="given-name" />
                            <InputField icon={<User size={16} />} type="text" placeholder="Last Name"
                                value={lastName} onChange={setLastName} required autoComplete="family-name" />
                        </div>
                        <InputField icon={<Phone size={16} />} type="tel" placeholder="(555) 123-4567"
                            value={phoneNumber} onChange={setPhoneNumber} required autoComplete="tel" />
                    </>
                )}

                <InputField icon={<Mail size={16} />} type="email" placeholder="you@example.com"
                    value={email} onChange={setEmail} required autoComplete="email" />

                <InputField icon={<Lock size={16} />} type="password"
                    placeholder={isSignUp ? 'Min. 6 characters' : '••••••••'}
                    value={password} onChange={setPassword} required
                    autoComplete={isSignUp ? 'new-password' : 'current-password'} />

                {isSignUp && (
                    <InputField icon={<Lock size={16} />} type="password" placeholder="Re-enter password"
                        value={confirmPassword} onChange={setConfirmPassword} required autoComplete="new-password" />
                )}

                <Button type="submit" fullWidth isLoading={loading} style={{ marginTop: '0.25rem' }}>
                    {isSignUp ? 'Create Account' : 'Sign In'}
                    <ArrowRight size={18} style={{ marginLeft: '0.5rem' }} />
                </Button>
            </form>

            {/* Toggle */}
            <div className={styles.toggleText}>
                {isSignUp ? (
                    <>
                        Already have an account?{' '}
                        <button className={styles.toggleLink} onClick={() => resetForm(false)}>Sign in</button>
                    </>
                ) : (
                    <>
                        Don&apos;t have an account?{' '}
                        <button className={styles.toggleLink} onClick={() => resetForm(true)}>Create one</button>
                    </>
                )}
            </div>
        </div>
    );
}

function InputField({ icon, type, placeholder, value, onChange, required, autoComplete }: {
    icon: React.ReactNode;
    type: string;
    placeholder: string;
    value: string;
    onChange: (v: string) => void;
    required?: boolean;
    autoComplete?: string;
}) {
    return (
        <div className={styles.inputWrapper}>
            <span className={styles.inputIcon}>{icon}</span>
            <input
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                required={required}
                autoComplete={autoComplete}
                className={styles.input}
            />
        </div>
    );
}
