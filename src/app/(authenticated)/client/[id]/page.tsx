'use client';

import { use } from 'react';
import { ClientInfo } from '@/components/client/ClientInfo';
import { ClientPolicyList } from '@/components/client/ClientPolicyList';
import { ClientSummaryStats } from '@/components/client/ClientSummaryStats';
import { ClientFiles } from '@/components/client/ClientFiles';
import { ActivityTimeline } from '@/components/shared/ActivityTimeline';
import { NotesPanel } from '@/components/shared/NotesPanel';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs/Breadcrumbs';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function ClientPage({ params }: PageProps) {
    const { id } = use(params);

    return (
        <main style={{
            minHeight: '100vh',
            color: 'var(--text-high)',
        }}>
            <Breadcrumbs items={[
                { label: 'Dashboard', href: '/dashboard' },
                { label: 'Client' },
            ]} />

            <ClientInfo clientId={id} />
            <ClientSummaryStats clientId={id} />
            <ClientPolicyList clientId={id} />
            <ClientFiles clientId={id} />

            {/* Notes Section */}
            <div style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-default)',
                padding: '1.25rem',
                marginTop: '1.5rem',
            }}>
                <h3 style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: 'var(--text-high)',
                    marginBottom: '1rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid var(--border-default)',
                }}>Notes</h3>
                <NotesPanel clientId={id} />
            </div>

            {/* Activity Timeline */}
            <ActivityTimeline clientId={id} />
        </main>
    );
}
