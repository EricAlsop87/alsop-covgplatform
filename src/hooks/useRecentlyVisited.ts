'use client';

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'cfp-recently-visited';
const MAX_ITEMS = 8;
const EVENT_NAME = 'cfp-recent-visit-updated';

export interface RecentItem {
    id: string;
    type: 'client' | 'policy';
    label: string;       // Client name or policy number
    sublabel?: string;    // Email for clients, address for policies
    href: string;
    timestamp: number;
}

export function useRecentlyVisited() {
    const [items, setItems] = useState<RecentItem[]>([]);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) setItems(JSON.parse(raw));
        } catch { /* ignore */ }
    }, []);

    // Listen for updates from other components (cross-component sync)
    useEffect(() => {
        const handler = () => {
            // Defer to next tick to avoid "Cannot update a component while rendering
            // a different component" when addVisit dispatches this event synchronously
            setTimeout(() => {
                try {
                    const raw = localStorage.getItem(STORAGE_KEY);
                    if (raw) setItems(JSON.parse(raw));
                } catch { /* ignore */ }
            }, 0);
        };

        // Custom event from same window
        window.addEventListener(EVENT_NAME, handler);
        // Storage event from other tabs
        window.addEventListener('storage', (e) => {
            if (e.key === STORAGE_KEY) handler();
        });

        return () => {
            window.removeEventListener(EVENT_NAME, handler);
            window.removeEventListener('storage', handler);
        };
    }, []);

    // Add an item to recently visited
    const addVisit = useCallback((item: Omit<RecentItem, 'timestamp'>) => {
        setItems(prev => {
            // Remove duplicate if exists
            const filtered = prev.filter(i => !(i.id === item.id && i.type === item.type));
            const newItem: RecentItem = { ...item, timestamp: Date.now() };
            const updated = [newItem, ...filtered].slice(0, MAX_ITEMS);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                // Dispatch custom event to notify other components (like sidebar)
                window.dispatchEvent(new Event(EVENT_NAME));
            } catch { /* ignore */ }
            return updated;
        });
    }, []);

    // Clear all
    const clearAll = useCallback(() => {
        setItems([]);
        try {
            localStorage.removeItem(STORAGE_KEY);
            window.dispatchEvent(new Event(EVENT_NAME));
        } catch { /* ignore */ }
    }, []);

    return { items, addVisit, clearAll };
}
