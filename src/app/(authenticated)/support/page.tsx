'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SupportModal } from '@/components/shared/SupportModal';
import { useState } from 'react';

/**
 * /support — Canonical support entry point.
 * Used in Postmark email templates as the support_url.
 * Opens the SupportModal immediately; closing it redirects to dashboard.
 */
export default function SupportPage() {
    const router = useRouter();
    const [open, setOpen] = useState(true);

    const handleClose = () => {
        setOpen(false);
        router.push('/dashboard');
    };

    return (
        <>
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Fallback content behind the modal */}
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Loading support…
                </div>
            </div>
            <SupportModal isOpen={open} onClose={handleClose} />
        </>
    );
}
