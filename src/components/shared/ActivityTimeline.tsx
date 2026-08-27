'use client';

import React, { useState, useEffect } from 'react';
import {
    FileText, RefreshCw, UserPlus, Clock, MessageSquare,
    Pin, Archive, Pencil, Upload, Sparkles, FileBarChart, Zap, CheckCircle2, XCircle, Shield, Merge, FileUp
} from 'lucide-react';
import styles from './ActivityTimeline.module.css';
import { fetchActivityEvents, ActivityEventRow } from '@/lib/notes';
import { logger } from '@/lib/logger';


interface ActivityTimelineProps {
    clientId?: string;
    policyId?: string;
}

const EVENT_CONFIG: Record<string, { icon: React.ReactNode; css: string }> = {
    'note.added': { icon: <MessageSquare size={16} />, css: 'note_event' },
    'note.edited': { icon: <Pencil size={16} />, css: 'note_event' },
    'note.archived': { icon: <Archive size={16} />, css: 'note_event' },
    'note.unarchived': { icon: <Archive size={16} />, css: 'note_event' },
    'note.pinned': { icon: <Pin size={16} />, css: 'note_event' },
    'note.unpinned': { icon: <Pin size={16} />, css: 'note_event' },
    'dec.uploaded': { icon: <FileText size={16} />, css: 'dec_upload' },
    'dec.parsed': { icon: <FileText size={16} />, css: 'dec_upload' },
    'term.created': { icon: <RefreshCw size={16} />, css: 'term_renewal' },
    'policy.created': { icon: <FileText size={16} />, css: 'policy_created' },
    'client.created': { icon: <UserPlus size={16} />, css: 'client_created' },
    'import.row': { icon: <Upload size={16} />, css: 'dec_upload' },
    'import.csv': { icon: <Upload size={16} />, css: 'dec_upload' },
    'client.updated': { icon: <Pencil size={16} />, css: 'note_event' },
    'policy.updated': { icon: <Pencil size={16} />, css: 'policy_created' },
    'policy_term.updated': { icon: <Pencil size={16} />, css: 'term_renewal' },
    'enrichment.completed': { icon: <Sparkles size={16} />, css: 'term_renewal' },
    'report.generated': { icon: <FileBarChart size={16} />, css: 'policy_created' },
    'workup.started': { icon: <Zap size={16} />, css: 'term_renewal' },
    'workup.completed': { icon: <CheckCircle2 size={16} />, css: 'policy_created' },
    'workup.failed': { icon: <XCircle size={16} />, css: 'dec_upload' },
    'flags.checked': { icon: <Shield size={16} />, css: 'term_renewal' },
    'merge.client': { icon: <Merge size={16} />, css: 'merge_event' },
    'merge.policy': { icon: <Merge size={16} />, css: 'merge_event' },
    'doc.uploaded.rce': { icon: <FileUp size={16} />, css: 'dec_upload' },
    'doc.uploaded.dic_dec_page': { icon: <FileUp size={16} />, css: 'dec_upload' },
    'valuation.completed': { icon: <FileBarChart size={16} />, css: 'policy_created' },
};

export function ActivityTimeline({ clientId, policyId }: ActivityTimelineProps) {
    const [events, setEvents] = useState<ActivityEventRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchActivityEvents({
                    clientId,
                    policyId,
                    limit: 50,
                });
                setEvents(data);
            } catch (error) {
                logger.error('ActivityTimeline', 'Error loading activity:', { error: error instanceof Error ? error.message : String(error) })
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [clientId, policyId]);

    const getConfig = (eventType: string) => {
        return EVENT_CONFIG[eventType] || { icon: <Clock size={16} />, css: '' };
    };

    const formatTime = (ts: string) => {
        try {
            const d = new Date(ts);
            return d.toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit',
            });
        } catch {
            return ts;
        }
    };

    if (loading) {
        return <div className={styles.container}><p className={styles.loading}>Loading activity...</p></div>;
    }

    if (events.length === 0) {
        return <div className={styles.container}><p className={styles.empty}>No activity yet.</p></div>;
    }

    return (
        <div className={styles.container}>
            <h3 className={styles.title}>Activity Timeline</h3>
            <div className={styles.timeline}>
                {events.map((e) => {
                    const config = getConfig(e.event_type);
                    return (
                        <div key={e.id} className={styles.event}>
                            <div className={`${styles.icon} ${config.css ? styles[config.css] : ''}`}>
                                {config.icon}
                            </div>
                            <div className={styles.content}>
                                <div className={styles.eventTitle}>
                                    {e.title || e.event_type}
                                </div>
                                {e.detail && <div className={styles.eventDetail}>{e.detail}</div>}
                                <div className={styles.eventTime}>
                                    {e.actor_name && (
                                        <span style={{ color: 'var(--text-mid)', fontWeight: 500, marginRight: '0.375rem' }}>
                                            {e.actor_name}
                                        </span>
                                    )}
                                    {formatTime(e.created_at)}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
