'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import styles from './Sidebar.module.scss';
import { supabase } from '@/lib/supabaseClient';
import { useSidebar } from './SidebarContext';
import { SidebarSearch } from './SidebarSearch';
import { SidebarRecent } from './SidebarRecent';
import { type UserRole } from '@/lib/auth';
import { BrandLogo, BrandEmblem } from '@/components/brand/BrandLogo';
import {
    LayoutDashboard,
    FileText,
    Settings,
    LogOut,
    ChevronsLeft,
    ChevronsRight,
    Flag,
    Briefcase,
    X,
    Mail,
    FileUp,
    Calendar,
} from 'lucide-react';
import { clsx } from 'clsx';

interface SidebarProps {
    userRole?: UserRole | null;
}

export function Sidebar({ userRole }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { collapsed, toggle, mobileOpen, closeMobile, isMobile } = useSidebar();

    const isAgent = userRole === 'admin' || userRole === 'service';
    const isClient = userRole === 'customer';

    const agentNavItems = [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Flags', href: '/flags', icon: Flag },
        { label: 'Email Center', href: '/email', icon: Mail },
        { label: 'Campaigns', href: '/campaigns', icon: Calendar },
        { label: 'Upload Documents', href: '/upload-document', icon: FileUp },
    ];

    // Admin/Service shared nav items
    const adminNavItems = (userRole === 'admin' || userRole === 'service') ? [
        { label: 'Operations', href: '/admin/submissions', icon: FileText },
    ] : [];

    // Client nav items
    const clientNavItems = [
        { label: 'My Portal', href: '/portal', icon: Briefcase },
        { label: 'Submit Declaration', href: '/submit', icon: FileText },
    ];

    const navItems = isClient ? clientNavItems : agentNavItems;
    const bottomNavItems = isClient ? [] : adminNavItems;

    const accountItems = [
        { label: 'Settings', href: '/settings', icon: Settings },
    ];

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/');
    };

    const handleNavClick = () => {
        // Close mobile sidebar on navigation
        if (isMobile) {
            closeMobile();
        }
    };

    // Determine sidebar visibility class
    const sidebarClasses = clsx(
        styles.sidebar,
        collapsed && !isMobile && styles.collapsed,
        isMobile && styles.mobile,
        isMobile && mobileOpen && styles.mobileOpen,
    );

    return (
        <>
            {/* Backdrop overlay for mobile */}
            {isMobile && mobileOpen && (
                <div className={styles.backdrop} onClick={closeMobile} />
            )}

            <aside className={sidebarClasses}>
                <div className={styles.brandRow}>
                    <Link href="/" className={styles.brand} style={{ textDecoration: 'none', color: 'inherit' }} onClick={handleNavClick}>
                        {collapsed && !isMobile ? (
                            <BrandEmblem size={24} />
                        ) : (
                            <BrandLogo variant="horizontal" size="xs" iconSize={22} fontSize="1.08rem" />
                        )}
                    </Link>
                    {isMobile ? (
                        <button className={styles.collapseBtn} onClick={closeMobile} title="Close menu">
                            <X size={18} />
                        </button>
                    ) : (
                        <button className={styles.collapseBtn} onClick={toggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
                        </button>
                    )}
                </div>

                {/* Global Search — agents only */}
                {isAgent && (
                    <div style={{ padding: '0.75rem 0 0.25rem' }}>
                        <SidebarSearch collapsed={collapsed && !isMobile} />
                    </div>
                )}

                {/* Recently Visited — agents only */}
                {isAgent && <SidebarRecent collapsed={collapsed && !isMobile} />}

                <nav className={styles.nav}>
                    {(!collapsed || isMobile) && <div className={styles.sectionTitle}>{isClient ? 'Menu' : 'Main Menu'}</div>}
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={clsx(styles.navItem, isActive && styles.active)}
                                title={collapsed && !isMobile ? item.label : undefined}
                                onClick={handleNavClick}
                            >
                                <item.icon />
                                {(!collapsed || isMobile) && <span>{item.label}</span>}
                            </Link>
                        );
                    })}

                    {/* Admin-only section */}
                    {bottomNavItems.length > 0 && (
                        <>
                            {(!collapsed || isMobile) && <div className={styles.sectionTitle} style={{ marginTop: '1.5rem' }}>Operations</div>}
                            {collapsed && !isMobile && <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }} />}
                            {bottomNavItems.map((item) => {
                                const isActive = pathname.startsWith(item.href);
                                return (
                                    <Link
                                        key={item.label}
                                        href={item.href}
                                        className={clsx(styles.navItem, isActive && styles.active)}
                                        title={collapsed && !isMobile ? item.label : undefined}
                                        onClick={handleNavClick}
                                    >
                                        <item.icon />
                                        {(!collapsed || isMobile) && <span>{item.label}</span>}
                                    </Link>
                                );
                            })}
                        </>
                    )}

                    {(!collapsed || isMobile) && <div className={styles.sectionTitle} style={{ marginTop: '2rem' }}>Account</div>}
                    {collapsed && !isMobile && <div style={{ marginTop: '1.5rem' }} />}
                    {accountItems.map((item) => {
                        const isActive = pathname.startsWith(item.href) && item.href !== '#';
                        return (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={clsx(styles.navItem, isActive && styles.active)}
                                title={collapsed && !isMobile ? item.label : undefined}
                                onClick={handleNavClick}
                            >
                                <item.icon />
                                {(!collapsed || isMobile) && <span>{item.label}</span>}
                            </Link>
                        );
                    })}
                </nav>

                <div className={styles.footer}>
                    <button
                        onClick={() => { handleLogout(); handleNavClick(); }}
                        className={styles.navItem}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%' }}
                        title={collapsed && !isMobile ? 'Logout' : undefined}
                    >
                        <LogOut />
                        {(!collapsed || isMobile) && <span>Logout</span>}
                    </button>
                    {(!collapsed || isMobile) && (
                        <div style={{ marginTop: '1rem', fontSize: '0.63rem', color: 'var(--text-muted)' }}>
                            &copy; 2026 Alsop and Associates Insurance Agency
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
