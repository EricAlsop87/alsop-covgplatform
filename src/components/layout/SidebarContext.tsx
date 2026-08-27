'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface SidebarContextValue {
    collapsed: boolean;
    toggle: () => void;
    mobileOpen: boolean;
    setMobileOpen: (open: boolean) => void;
    closeMobile: () => void;
    isMobile: boolean;
}

const SidebarContext = createContext<SidebarContextValue>({
    collapsed: false,
    toggle: () => { },
    mobileOpen: false,
    setMobileOpen: () => { },
    closeMobile: () => { },
    isMobile: false,
});

export function useSidebar() {
    return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    const toggle = useCallback(() => setCollapsed(c => !c), []);
    const closeMobile = useCallback(() => setMobileOpen(false), []);

    // Detect mobile viewport
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)');
        const handler = (e: MediaQueryListEvent | MediaQueryList) => {
            setIsMobile(e.matches);
            if (e.matches) {
                setMobileOpen(false); // close sidebar when switching to mobile
            }
        };
        handler(mq); // initial check
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Lock body scroll when mobile sidebar is open
    useEffect(() => {
        if (mobileOpen && isMobile) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [mobileOpen, isMobile]);

    return (
        <SidebarContext.Provider value={{ collapsed, toggle, mobileOpen, setMobileOpen, closeMobile, isMobile }}>
            {children}
        </SidebarContext.Provider>
    );
}
