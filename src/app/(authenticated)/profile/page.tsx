'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Profile page is now consolidated into Settings > Account section
export default function ProfilePage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/settings');
    }, [router]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Redirecting to Settings...</span>
        </div>
    );
}
