'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Mail, MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getUserProfile } from '@/lib/auth';
import { SupportModal } from '@/components/shared/SupportModal';
import styles from './Footer.module.css';

export function Footer() {
    const currentYear = new Date().getFullYear();
    const [supportOpen, setSupportOpen] = useState(false);
    const [userName, setUserName] = useState<string | undefined>(undefined);
    const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
    const [userRole, setUserRole] = useState<string | null>(null);

    useEffect(() => {
        async function checkAuth() {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setUserEmail(session.user.email || undefined);
                const profile = await getUserProfile();
                if (profile) {
                    setUserRole(profile.role);
                    if (profile.first_name) setUserName(`${profile.first_name}${profile.last_name ? ' ' + profile.last_name : ''}`);
                } else if (session.user.email) {
                    setUserName(undefined);
                }
            }
        }
        checkAuth();
    }, []);

    const isClient = userRole === 'customer';
    const productLinks = isClient ? [
        { href: '/portal', label: 'My Portal' },
        { href: '/submit', label: 'Submit Declaration' },
    ] : [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/submit', label: 'Submit Declaration' },
        { href: '/flags', label: 'Flags' },
    ];

    return (<>
        <footer className={styles.footer}>
            <div className={styles.container}>
                <div className={styles.grid}>
                    {/* Company Info */}
                    <div>
                        <div className={styles.logoWrapper}>
                            <BrandLogo variant="horizontal" size="sm" iconSize={24} />
                        </div>
                        <p className={styles.description}>
                            Streamlining policy review, RCE validation, and coverage analysis for Alsop & Associates Insurance Agency.
                        </p>
                    </div>

                    {/* Product Links */}
                    <div>
                        <h3 className={styles.sectionTitle}>Product</h3>
                        <ul className={styles.linkList}>
                            {productLinks.map(link => (
                                <li key={link.href}>
                                    <Link href={link.href} className={styles.link}>
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Support Links */}
                    <div>
                        <h3 className={styles.sectionTitle}>Support</h3>
                        <ul className={styles.linkList}>
                            <li>
                                <Link href="/settings" className={styles.link}>
                                    Settings
                                </Link>
                            </li>
                            <li>
                                <button
                                    onClick={() => setSupportOpen(true)}
                                    className={styles.link}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                >
                                    <MessageSquare size={12} />
                                    Contact Support
                                </button>
                            </li>
                        </ul>
                    </div>

                    {/* Contact Info */}
                    <div>
                        <h3 className={styles.sectionTitle}>Contact</h3>
                        <ul className={styles.linkList}>
                            <li className={styles.contactItem}>
                                <Mail className={styles.contactIcon} />
                                <a href="mailto:support@coveragechecknow.com" className={styles.contactLink}>
                                    support@coveragechecknow.com
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className={styles.bottomBar}>
                    <p className={styles.copyright}>
                        © {currentYear} CoverageCheckNow. A service of Alsop & Associates Insurance Agency. All rights reserved.
                    </p>
                    <div className={styles.legalLinks}>
                        <Link href="/legal/privacy" className={styles.legalLink}>
                            Privacy Policy
                        </Link>
                        <Link href="/legal/terms" className={styles.legalLink}>
                            Terms of Service
                        </Link>
                        <Link href="/legal/cookies" className={styles.legalLink}>
                            Cookie Policy
                        </Link>
                    </div>
                </div>
            </div>
        </footer>

        <SupportModal
            isOpen={supportOpen}
            onClose={() => setSupportOpen(false)}
            clientName={userName}
            clientEmail={userEmail}
        />
    </>);
}
