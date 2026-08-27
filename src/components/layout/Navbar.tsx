'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import styles from './Navbar.module.css';
import { Button } from '@/components/ui/Button/Button';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { LogIn, LogOut, User, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getUserProfile, UserRole } from '@/lib/auth';

const navLinks = [
    { href: '/dashboard', label: 'Dashboard', authRequired: true, hideForRole: 'customer' },
    { href: '/submit', label: 'Check My Coverage', authRequired: false, hideForRole: 'customer' },
];

export function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const [firstName, setFirstName] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        async function loadUser() {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setIsLoggedIn(true);
                setUserId(session.user.id);

                const profile = await getUserProfile();
                if (profile) {
                    setUserRole(profile.role);
                    setFirstName(profile.first_name || profile.email.split('@')[0] || 'User');
                } else {
                    setFirstName(session.user.email?.split('@')[0] || 'User');
                }
            }
            setAuthLoading(false);
        }

        loadUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session) {
                setIsLoggedIn(false);
                setFirstName(null);
                setUserId(null);
            } else {
                setIsLoggedIn(true);
                setUserId(session.user.id);
                getUserProfile().then(profile => {
                    if (profile) {
                        setUserRole(profile.role);
                        setFirstName(profile.first_name || profile.email.split('@')[0] || 'User');
                    }
                });
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        setIsLoggedIn(false);
        setFirstName(null);
        setUserId(null);
        setUserRole(null);
        router.push('/');
    };

    const isClient = userRole === 'customer';
    const destinationPath = isClient ? '/portal' : '/dashboard';
    const destinationLabel = isClient ? 'My Portal' : 'Dashboard';

    return (
        <nav className={styles.navbar}>
            <div className={styles.container}>
                <Link href="/" className={styles.logo}>
                    <BrandLogo variant="horizontal" size="sm" iconSize={26} />
                </Link>

                <div className={styles.navLinks}>
                    {!authLoading && navLinks
                        .filter((link) => !link.authRequired || isLoggedIn)
                        .filter((link) => !(link.hideForRole && link.hideForRole === userRole))
                        .map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`${styles.navLink} ${pathname === link.href ? styles.active : ''}`}
                            >
                                {link.label}
                            </Link>
                        ))}
                </div>

                <div className={styles.navActions}>
                    {authLoading ? null : isLoggedIn ? (
                        <>
                            <Link href={destinationPath} className={styles.welcomeLink} title={`Go to ${destinationLabel}`}>
                                <div className={styles.welcomeSection}>
                                    <User size={15} className={styles.welcomeIcon} />
                                    <span className={styles.welcomeText}>
                                        Welcome, <strong>{firstName}</strong>
                                    </span>
                                    <span className={styles.destinationTag}>
                                        {destinationLabel}
                                        <ArrowRight size={13} className={styles.destinationArrow} />
                                    </span>
                                </div>
                            </Link>
                            <button onClick={handleSignOut} className={styles.signOutButton} title="Sign Out">
                                <LogOut size={16} />
                                <span className={styles.signOutText}>Sign Out</span>
                            </button>
                        </>
                    ) : (
                        <>
                            <Link href="/auth/signin">
                                <Button size="sm" variant="outline" className={styles.signInButton}>
                                    <LogIn size={16} style={{ marginRight: '0.4rem' }} />
                                    Sign In
                                </Button>
                            </Link>
                            <Link href="/submit">
                                <Button size="sm" className={styles.ctaButton}>
                                    Check My Coverage
                                </Button>
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
