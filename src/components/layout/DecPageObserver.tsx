'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast/Toast';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';


const TRACKING_KEY = 'cfp_pending_dec_uploads';
const POLL_INTERVAL_MS = 3000;

/**
 * A headless component that mounts globally in the Authenticated Layout.
 * It checks sessionStorage for any recently uploaded Dec Page submission IDs.
 * Only starts polling when pending IDs exist (no unnecessary network traffic).
 * When a submission reaches 'parsed' or 'failed', it fires a Toast notification
 * and removes the ID from storage. Stops polling when no IDs remain.
 */
export function DecPageObserver() {
    const { success, error, info, loading, removeToast } = useToast();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const isPolling = useRef(false);
    const activeToasts = useRef<Record<string, string>>({});

    const stopPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        isPolling.current = false;
    }, []);

    const checkStatuses = useCallback(async () => {
        try {
            const stored = sessionStorage.getItem(TRACKING_KEY);
            if (!stored) {
                stopPolling();
                return;
            }

            let pendingIds: string[] = [];
            try {
                pendingIds = JSON.parse(stored);
            } catch {
                sessionStorage.removeItem(TRACKING_KEY);
                stopPolling();
                return;
            }

            if (!Array.isArray(pendingIds) || pendingIds.length === 0) {
                sessionStorage.removeItem(TRACKING_KEY);
                stopPolling();
                return;
            }

            // Get auth token for secure API route
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return;

            const res = await fetch(`/api/upload/status?ids=${pendingIds.join(',')}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                },
            });

            if (!res.ok) return;

            const json = await res.json();
            if (!json.success || !json.data) return;

            const dbStatuses = json.data as Array<{
                id: string;
                status: string;
                error_message?: string;
                file_name: string;
            }>;

            // Process updates
            let stillPending = [...pendingIds];

            for (const row of dbStatuses) {
                // If we haven't shown a loading toast yet for this pending item, show it
                if (!activeToasts.current[row.id] && !['parsed', 'failed', 'duplicate'].includes(row.status)) {
                    activeToasts.current[row.id] = loading(`Processing ${row.file_name}...`);
                }

                if (row.status === 'parsed') {
                    if (activeToasts.current[row.id]) {
                        removeToast(activeToasts.current[row.id]);
                        delete activeToasts.current[row.id];
                    }
                    success(`Declaration processed successfully: ${row.file_name}`);
                    window.dispatchEvent(new CustomEvent('decPageParsed'));
                    stillPending = stillPending.filter(id => id !== row.id);
                } else if (row.status === 'failed') {
                    if (activeToasts.current[row.id]) {
                        removeToast(activeToasts.current[row.id]);
                        delete activeToasts.current[row.id];
                    }
                    error(`Failed to process ${row.file_name}: ${row.error_message || 'Unknown error'}`);
                    stillPending = stillPending.filter(id => id !== row.id);
                } else if (row.status === 'duplicate') {
                    if (activeToasts.current[row.id]) {
                        removeToast(activeToasts.current[row.id]);
                        delete activeToasts.current[row.id];
                    }
                    info(`${row.file_name} was recognized as a duplicate upload.`);
                    stillPending = stillPending.filter(id => id !== row.id);
                }
                // pending, uploaded, queued, processing -> keep waiting
            }

            // If any IDs are missing from DB completely, stop tracking them
            const dbIds = new Set(dbStatuses.map(r => r.id));
            stillPending = stillPending.filter(id => dbIds.has(id));

            if (stillPending.length === 0) {
                sessionStorage.removeItem(TRACKING_KEY);
                stopPolling();
            } else if (stillPending.length !== pendingIds.length) {
                sessionStorage.setItem(TRACKING_KEY, JSON.stringify(stillPending));
            }

        } catch (err) {
            logger.error('DecPageObserver', '[DecPageObserver] Polling error:', { error: err instanceof Error ? err.message : String(err) })
        }
    }, [success, error, info, stopPolling]);

    const startPolling = useCallback(() => {
        if (isPolling.current) return; // Already polling
        isPolling.current = true;
        checkStatuses(); // Immediate first check
        intervalRef.current = setInterval(checkStatuses, POLL_INTERVAL_MS);
    }, [checkStatuses]);

    useEffect(() => {
        // Check if there are pending IDs on mount
        const stored = sessionStorage.getItem(TRACKING_KEY);
        if (stored) {
            try {
                const ids = JSON.parse(stored);
                if (Array.isArray(ids) && ids.length > 0) {
                    startPolling();
                }
            } catch {
                sessionStorage.removeItem(TRACKING_KEY);
            }
        }

        // Listen for new uploads from CFPForm via a custom event
        const handleNewUpload = () => {
            startPolling();
        };
        window.addEventListener('decPageUploaded', handleNewUpload);

        // Also listen for storage changes (when CFPForm writes to sessionStorage)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === TRACKING_KEY && e.newValue) {
                startPolling();
            }
        };
        window.addEventListener('storage', handleStorageChange);

        return () => {
            stopPolling();
            window.removeEventListener('decPageUploaded', handleNewUpload);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [startPolling, stopPolling]);

    // Headless component
    return null;
}
