'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

/**
 * Standalone layout for the /report/[id] pages.
 * No sidebar, no footer — just authentication guard + a clean document shell.
 */
export default function ReportLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const router = useRouter();
    const [authenticated, setAuthenticated] = useState(false);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                router.replace('/auth/signin');
            } else {
                setAuthenticated(true);
            }
        });
    }, [router]);

    if (!authenticated) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8fafc', color: '#64748b' }}>
                Loading...
            </div>
        );
    }

    return <>{children}</>;
}
