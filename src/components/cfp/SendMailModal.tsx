'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
    X,
    Send,
    Loader2,
    CheckCircle2,
    Mail,
    UserCheck,
    FileText,
    Shield,
    AlertTriangle,
    Eye,
    Edit3,
    Plus,
    Paperclip,
    ShieldCheck,
    CheckSquare,
    Square,
    AlertCircle,
    Info,
    DollarSign,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import styles from './SendMailModal.module.scss';
import type { CFPTermRow } from '@/app/api/cfp-summary/route';

export interface TeamRecipient {
    id: string;
    name: string;
    email: string;
    avatarText: string;
    roleText?: string;
}

export interface AttachmentItem {
    id: string;
    label: string;
    badge: string;
    fileName: string;
    storagePath: string;
    bucket: 'cfp-platform-documents' | 'cfp-raw-decpage';
    docCategory: 'dec' | 'renewal' | 'rce' | 'quote' | 'dic' | 'other';
}

export const TEAM_RECIPIENTS: TeamRecipient[] = [
    { id: 'nancy', name: 'Nancy Maldonado', email: 'nmaldonado@allstate.com', avatarText: 'NM', roleText: 'Admin' },
    { id: 'olga', name: 'Olga Soto', email: 'olgasoto@allstate.com', avatarText: 'OS', roleText: 'Service' },
    { id: 'johnpaul', name: 'John Paul Dizon', email: 'johndizon2@allstate.com', avatarText: 'JP', roleText: 'Admin' },
    { id: 'esmeralda', name: 'Esmeralda Cervantes', email: 'egamboa-cerva@allstate.com', avatarText: 'EC', roleText: 'Admin' },
    { id: 'eric', name: 'Eric Alsop', email: 'ealsop@allstate.com', avatarText: 'EA', roleText: 'Manager' },
    { id: 'phoebe', name: 'Phoebe Hernandez', email: 'phoebe@coveragechecknow.com', avatarText: 'PH', roleText: 'Support' },
    { id: 'danicah', name: 'Danicah Jesoro', email: 'danicah@coveragechecknow.com', avatarText: 'DJ', roleText: 'Support' },
    { id: 'paula', name: 'Paula Veloza', email: 'paula@coveragechecknow.com', avatarText: 'PV', roleText: 'Support' },
];

export function toTitleCase(str: string): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .replace(/(?:^|[\s/,\-\(\).#])([a-z])/g, m => m.toUpperCase())
        .replace(/\bCa\b/g, 'CA')
        .replace(/\bNv\b/g, 'NV')
        .replace(/\bAz\b/g, 'AZ')
        .replace(/\bOr\b/g, 'OR')
        .replace(/\bWa\b/g, 'WA')
        .replace(/\bTx\b/g, 'TX')
        .replace(/\bFl\b/g, 'FL')
        .replace(/\bCo\b/g, 'CO')
        .replace(/\bUt\b/g, 'UT')
        .replace(/\bId\b/g, 'ID')
        .replace(/\bPo Box\b/gi, 'PO Box')
        .replace(/\bApt\b/gi, 'Apt')
        .replace(/\bSte\b/gi, 'Ste')
        .replace(/\bUnit\b/gi, 'Unit')
        .replace(/\bLlc\b/gi, 'LLC')
        .replace(/\bInc\b/gi, 'Inc')
        .replace(/\bTr\b/gi, 'TR')
        .replace(/\bN\b/g, 'N')
        .replace(/\bS\b/g, 'S')
        .replace(/\bE\b/g, 'E')
        .replace(/\bW\b/g, 'W')
        .replace(/\bNe\b/g, 'NE')
        .replace(/\bNw\b/g, 'NW')
        .replace(/\bSe\b/g, 'SE')
        .replace(/\bSw\b/g, 'SW')
        .trim();
}

export function buildDefaultSubject(term: CFPTermRow, isUrgent: boolean): string {
    const rawPol = term.policy_number || 'Policy';
    const cleanPol = rawPol.replace(/^CFP\s*/i, '').trim();
    const cfpPart = `CFP ${cleanPol}`;
    const insuredPart = toTitleCase(term.named_insured || '');
    const addrPart = toTitleCase(term.property_address || '');

    const parts = [cfpPart, insuredPart, addrPart].filter(Boolean);
    const base = parts.join(' - ');
    return isUrgent ? `URGENT: ${base}` : base;
}

export type RecipientRole = 'to' | 'cc' | 'none';

export interface SentMailDetails {
    sent_to: string[];
    sent_to_names: string[];
    sent_cc: string[];
    sent_cc_names: string[];
    sent_by: string;
    sent_at: string;
    subject: string;
    attachments: string[];
}

interface SendMailModalProps {
    term: CFPTermRow | null;
    isOpen: boolean;
    onClose: () => void;
    onSentSuccess: (termId: string, details: SentMailDetails | string[]) => void;
}

export function SendMailModal({ term, isOpen, onClose, onSentSuccess }: SendMailModalProps) {
    const [recipientRoles, setRecipientRoles] = useState<Record<string, RecipientRole>>({
        nancy: 'to',
        olga: 'to',
        johnpaul: 'to',
        esmeralda: 'none',
        eric: 'none',
        phoebe: 'none',
    });
    const [customTo, setCustomTo] = useState('');
    const [customCc, setCustomCc] = useState('');
    const [isUrgent, setIsUrgent] = useState<boolean>(false);
    const [subject, setSubject] = useState('');
    const [customNotes, setCustomNotes] = useState('');
    const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
    const [previewingId, setPreviewingId] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [liveTitlePro, setLiveTitlePro] = useState<any>(term?.title_pro || null);
    const [previewMode, setPreviewMode] = useState<'full_email' | 'table_only'>('full_email');
    const [activeModalTab, setActiveModalTab] = useState<'compose' | 'preview'>('compose');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmWarnings, setConfirmWarnings] = useState<Array<{ id: string; label: string; desc: string; severity: 'warning' | 'info' }>>([]);
    const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
    const [currentUserName, setCurrentUserName] = useState<string>('');
    const [rceReplacementCost, setRceReplacementCost] = useState<number | null>(term?.rce_replacement_cost || null);
    const [rceCarrier, setRceCarrier] = useState<string>(term?.rce_carrier || 'Bamboo');

    useEffect(() => {
        if (term) {
            setRceReplacementCost(term.rce_replacement_cost || null);
            setRceCarrier(term.rce_carrier || 'Bamboo');
        }
    }, [term]);

    const saveRceValuationAsync = async (cost: number | null, carrierName: string) => {
        if (!term?.policy_id) return;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            await fetch('/api/cfp-summary/rce-valuation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    policy_id: term.policy_id,
                    replacement_cost: cost,
                    carrier: carrierName,
                    storage_path: term.rce_storage_path || null,
                    file_name: term.rce_file_name || null,
                }),
            });
        } catch (err) {
            console.error('Failed to auto-save RCE valuation in SendMailModal:', err);
        }
    };

    // Fetch live Title Pro via API route to guarantee 100% real-time accuracy and bypass client RLS restrictions
    useEffect(() => {
        if (term?.title_pro) {
            setLiveTitlePro(term.title_pro);
        }
        if (!isOpen || !term?.policy_id) return;

        let isMounted = true;
        (async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const res = await fetch(`/api/cfp-summary/title-pro?policy_id=${encodeURIComponent(term.policy_id)}`, {
                    headers: {
                        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                    },
                });
                if (res.ok) {
                    const json = await res.json();
                    if (isMounted) {
                        if (json.title_pro) {
                            setLiveTitlePro(json.title_pro);
                        } else if (term?.title_pro) {
                            setLiveTitlePro(term.title_pro);
                        }
                    }
                }
            } catch {
                // Keep initial term?.title_pro
            }
        })();

        return () => {
            isMounted = false;
        };
    }, [isOpen, term?.policy_id, term?.title_pro]);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user?.email) {
                const em = data.user.email.toLowerCase();
                setCurrentUserEmail(em);

                const VA_NAMES: Record<string, string> = {
                    'admin@coveragechecknow.com': 'Coverage Check Team',
                    'phoebe@coveragechecknow.com': 'Phoebe Hernandez',
                    'paula@coveragechecknow.com': 'Paula Veloza',
                    'danicah@coveragechecknow.com': 'Danicah Jesoro',
                    'alsopva01@gmail.com': 'Paula Veloza',
                    'alsopva02@gmail.com': 'Phoebe Hernandez',
                    'alsopva03@gmail.com': 'Danicah Jesoro',
                };

                const metaName = data.user.user_metadata?.first_name
                    ? `${data.user.user_metadata.first_name} ${data.user.user_metadata.last_name || ''}`.trim()
                    : data.user.user_metadata?.name;

                setCurrentUserName(metaName || VA_NAMES[em] || 'Coverage Check Team');
            }
        });
    }, []);

    // Fetch live platform_documents for policy_id on modal load
    const [livePlatformDocs, setLivePlatformDocs] = useState<Array<{ id: string; doc_type?: string; file_name?: string; storage_path?: string; bucket?: string }>>([]);

    useEffect(() => {
        if (!isOpen || !term?.policy_id) {
            setLivePlatformDocs([]);
            return;
        }
        let isMounted = true;
        (async () => {
            try {
                const { data } = await supabase
                    .from('platform_documents')
                    .select('id, doc_type, file_name, storage_path, bucket')
                    .eq('policy_id', term.policy_id);
                if (isMounted && data) {
                    setLivePlatformDocs(data as any[]);
                }
            } catch {
                // Non-blocking
            }
        })();
        return () => {
            isMounted = false;
        };
    }, [isOpen, term?.policy_id]);

    // Compute all candidate attachments available for this policy term (deduplicated by storagePath)
    const availableAttachments = useMemo<AttachmentItem[]>(() => {
        if (!term) return [];
        const items: AttachmentItem[] = [];
        const seenStoragePaths = new Set<string>();

        const addCandidate = (item: AttachmentItem) => {
            if (!item.storagePath) return;
            const cleanPath = item.storagePath.trim().replace(/^\/+/, '').toLowerCase();
            if (seenStoragePaths.has(cleanPath)) return;
            seenStoragePaths.add(cleanPath);
            items.push(item);
        };

        // Helper to find matching live document by carrier name, doc_type, or file_name
        const findLiveDoc = (carrierOrType: string) => {
            const needle = carrierOrType.toLowerCase();
            return livePlatformDocs.find(d => {
                if (!d.storage_path) return false;
                const fn = (d.file_name || '').toLowerCase();
                const dt = (d.doc_type || '').toLowerCase();
                return fn.includes(needle) || dt.includes(needle);
            });
        };

        // 1. Dec page
        const decDoc = findLiveDoc('dec');
        const decPath = term.dec_storage_path || decDoc?.storage_path;
        if ((term.has_dec || decPath) && decPath) {
            addCandidate({
                id: 'dec',
                label: 'FAIR Plan Dec Page',
                badge: 'DEC PAGE',
                fileName: term.dec_file_name || decDoc?.file_name || `FAIR_Plan_Dec_${term.policy_number}.pdf`,
                storagePath: decPath,
                bucket: (term.dec_bucket as any) || (decDoc?.bucket as any) || 'cfp-raw-decpage',
                docCategory: 'dec',
            });
        }

        // 2. Renewal Dec
        const renewalDoc = findLiveDoc('renewal');
        const renewalPath = term.renewal_dec_storage_path || renewalDoc?.storage_path;
        if ((term.has_renewal_dec || renewalPath) && renewalPath) {
            addCandidate({
                id: 'renewal_dec',
                label: 'Renewal Offer Dec Page',
                badge: 'RENEWAL DEC',
                fileName: term.renewal_dec_file_name || renewalDoc?.file_name || `Renewal_Offer_${term.policy_number}.pdf`,
                storagePath: renewalPath,
                bucket: (term.renewal_dec_bucket as any) || 'cfp-platform-documents',
                docCategory: 'renewal',
            });
        }

        // 3. RCE Valuation
        const effectiveRceCost = rceReplacementCost ?? term.rce_replacement_cost;
        const effectiveRceCarrier = rceCarrier || term.rce_carrier || 'Bamboo';
        const rceDoc = findLiveDoc('rce') || findLiveDoc('valuation') || findLiveDoc('360value');
        const rcePath = term.rce_storage_path || rceDoc?.storage_path;
        if ((term.has_rce || effectiveRceCost || rcePath) && rcePath) {
            const rceValuationStr = effectiveRceCost ? ` - $${Math.round(Number(effectiveRceCost)).toLocaleString()}` : '';
            addCandidate({
                id: 'rce',
                label: `RCE Valuation (${effectiveRceCarrier}${rceValuationStr})`,
                badge: 'RCE REPORT',
                fileName: term.rce_file_name || rceDoc?.file_name || 'RCE_Valuation_Report.pdf',
                storagePath: rcePath,
                bucket: 'cfp-platform-documents',
                docCategory: 'rce',
            });
        }

        // 4. Bamboo Quote
        const bambooDoc = findLiveDoc('bamboo') || livePlatformDocs.find(d => d.doc_type === 'es_doc' || d.doc_type === 'quote');
        const bambooPath = term.carrier_quotes?.bamboo?.storage_path || bambooDoc?.storage_path;
        if (bambooPath || term.carrier_quotes?.bamboo) {
            if (bambooPath) {
                addCandidate({
                    id: 'bamboo',
                    label: 'Bamboo Companion Quote',
                    badge: 'BAMBOO QUOTE',
                    fileName: term.carrier_quotes?.bamboo?.file_name || term.carrier_quotes?.bamboo?.doc_file_name || bambooDoc?.file_name || 'Bamboo_Quote.pdf',
                    storagePath: bambooPath,
                    bucket: 'cfp-platform-documents',
                    docCategory: 'quote',
                });
            }
        }

        // 5. Aegis Quote
        const aegisDoc = findLiveDoc('aegis');
        const aegisPath = term.carrier_quotes?.aegis?.storage_path || aegisDoc?.storage_path;
        if (aegisPath || term.carrier_quotes?.aegis) {
            if (aegisPath) {
                addCandidate({
                    id: 'aegis',
                    label: 'Aegis Security / General Quote',
                    badge: 'AEGIS QUOTE',
                    fileName: term.carrier_quotes?.aegis?.file_name || term.carrier_quotes?.aegis?.doc_file_name || aegisDoc?.file_name || 'Aegis_Quote.pdf',
                    storagePath: aegisPath,
                    bucket: 'cfp-platform-documents',
                    docCategory: 'quote',
                });
            }
        }

        // 6. PSIC Quote
        const psicDoc = findLiveDoc('psic') || findLiveDoc('pacific');
        const psicPath = term.carrier_quotes?.psic?.storage_path || psicDoc?.storage_path;
        if (psicPath || term.carrier_quotes?.psic) {
            if (psicPath) {
                addCandidate({
                    id: 'psic',
                    label: 'Pacific Specialty (PSIC) Quote',
                    badge: 'PSIC QUOTE',
                    fileName: term.carrier_quotes?.psic?.file_name || term.carrier_quotes?.psic?.doc_file_name || psicDoc?.file_name || 'PSIC_Quote.pdf',
                    storagePath: psicPath,
                    bucket: 'cfp-platform-documents',
                    docCategory: 'quote',
                });
            }
        }

        // 7. SageSure Quote
        const sageDoc = findLiveDoc('sagesure') || findLiveDoc('sage');
        const sagePath = term.carrier_quotes?.sagesure?.storage_path || sageDoc?.storage_path;
        if (sagePath) {
            addCandidate({
                id: 'sagesure',
                label: 'SageSure Quote',
                badge: 'SAGESURE QUOTE',
                fileName: term.carrier_quotes?.sagesure?.file_name || sageDoc?.file_name || 'SageSure_Quote.pdf',
                storagePath: sagePath,
                bucket: 'cfp-platform-documents',
                docCategory: 'quote',
            });
        }

        // 8. American Modern Quote
        const amDoc = findLiveDoc('american modern') || findLiveDoc('am_quote');
        const amPath = term.carrier_quotes?.am?.storage_path || amDoc?.storage_path;
        if (amPath) {
            addCandidate({
                id: 'am',
                label: 'American Modern Quote',
                badge: 'AM QUOTE',
                fileName: term.carrier_quotes?.am?.file_name || amDoc?.file_name || 'American_Modern_Quote.pdf',
                storagePath: amPath,
                bucket: 'cfp-platform-documents',
                docCategory: 'quote',
            });
        }

        // 9. In-force DIC Dec Page / Standalone DIC Document
        const dicDoc = findLiveDoc('dic') || livePlatformDocs.find(d => d.doc_type === 'dic_dec_page');
        const dicPath = term.dic_storage_path || dicDoc?.storage_path;
        if ((term.has_dic || dicPath) && dicPath) {
            addCandidate({
                id: 'dic',
                label: `DIC Dec Page / Quote (${term.dic_carrier || dicDoc?.file_name || 'DIC'})`,
                badge: 'DIC DOC',
                fileName: term.dic_file_name || dicDoc?.file_name || 'DIC_Document.pdf',
                storagePath: dicPath,
                bucket: 'cfp-platform-documents',
                docCategory: 'dic',
            });
        }

        // 10. Append any remaining documents in livePlatformDocs not yet added
        for (const doc of livePlatformDocs) {
            if (!doc.storage_path) continue;
            const fn = doc.file_name || 'Document.pdf';
            const docCat = doc.doc_type === 'rce' ? 'rce' : doc.doc_type === 'dic_dec_page' ? 'dic' : doc.doc_type === 'dec_page' ? 'dec' : 'quote';
            addCandidate({
                id: doc.id || `doc_${doc.storage_path}`,
                label: `${(doc.doc_type || 'DOCUMENT').toUpperCase()}: ${fn}`,
                badge: 'DOCUMENT',
                fileName: fn,
                storagePath: doc.storage_path,
                bucket: (doc.bucket as any) || 'cfp-platform-documents',
                docCategory: docCat,
            });
        }

        return items;
    }, [term, livePlatformDocs, rceReplacementCost, rceCarrier]);

    // Initialize subject, notes & pre-selected attachments when modal opens with term
    useEffect(() => {
        if (!isOpen || !term) return;
        setIsUrgent(false);
        setSubject(buildDefaultSubject(term, false));
        setCustomNotes('');
        setCustomTo('');
        setCustomCc('');
        setError(null);
        setSuccessMsg(null);
        setRecipientRoles({
            nancy: 'to',
            olga: 'to',
            johnpaul: 'to',
            esmeralda: 'none',
            eric: 'none',
            phoebe: 'none',
        });
        // Guardrail: Pre-select all available detected attachments by default
        setSelectedAttachmentIds(availableAttachments.map(a => a.id));
    }, [isOpen, term?.policy_term_id, availableAttachments]);

    const handleToggleUrgent = () => {
        setIsUrgent(prev => {
            const next = !prev;
            setSubject(currSubj => {
                const cleanSubj = currSubj
                    .replace(/^URGENT:\s*/i, '')
                    .replace(/^\[URGENT\]\s*/i, '')
                    .replace(/^URGENT\s*-\s*/i, '')
                    .trim();
                return next ? `URGENT: ${cleanSubj}` : cleanSubj;
            });
            return next;
        });
    };

    const toggleAttachment = (id: string) => {
        setSelectedAttachmentIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleSelectAllAttachments = () => {
        setSelectedAttachmentIds(availableAttachments.map(a => a.id));
    };

    const handleDeselectAllAttachments = () => {
        setSelectedAttachmentIds([]);
    };

    // Helper to preview PDF in a new tab via signed URL
    const handlePreviewPdf = async (att: AttachmentItem) => {
        setPreviewingId(att.id);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/documents/signed-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
                },
                body: JSON.stringify({
                    storagePath: att.storagePath,
                    bucket: att.bucket,
                }),
            });
            const data = await res.json();
            if (data.signedUrl) {
                window.open(data.signedUrl, '_blank');
            } else {
                setError(data.error || 'Could not generate preview link for this document.');
            }
        } catch (err: any) {
            setError(err.message || 'Error opening PDF preview.');
        } finally {
            setPreviewingId(null);
        }
    };

    // Build structured document items covering all 5 companion carriers + Dec + RCE + Title
    const docItems = useMemo(() => {
        if (!term) return [];

        const formatQuote = (carrierName: string, carrierKey: string, q: any) => {
            if (!q) {
                return {
                    name: `${carrierName} Quote`,
                    status: 'Not Quoted',
                    statusType: 'not_quoted' as const,
                    premium: '$0',
                    details: 'No companion quote generated',
                };
            }

            if (q.coverage_type === 'UNAVAILABLE') {
                return {
                    name: `${carrierName} Quote`,
                    status: 'Unable to Quote',
                    statusType: 'declined' as const,
                    premium: '$0',
                    details: q.notes ? `Reason: ${q.notes}` : '✕ Ineligible / No Option',
                };
            }

            if (q.coverage_type === 'AGENT_REVIEW') {
                const premStr = q.premium ? `$${Number(q.premium).toLocaleString()}` : '$0';
                const quoteStr = q.quote_number ? `Quote #: ${q.quote_number}` : 'Quote # Pending';
                const remarksStr = q.notes ? `UW Remarks: ${q.notes}` : 'Needs agent review in carrier portal';
                return {
                    name: `${carrierName} Quote`,
                    status: 'Quoted • Needs UW',
                    statusType: 'needs_uw' as const,
                    premium: premStr,
                    details: `${quoteStr} • ${remarksStr}`,
                };
            }

            const premStr = q.premium ? `$${Number(q.premium).toLocaleString()}` : '$0';
            const quotePart = q.quote_number ? `Quote #: ${q.quote_number}` : null;
            const typePart = q.coverage_type && q.coverage_type !== 'QUOTE' ? `Type: ${q.coverage_type}` : null;
            const remarksPart = q.notes ? `Remarks: ${q.notes}` : null;

            const detailParts = [quotePart, typePart, remarksPart].filter(Boolean);
            const details = detailParts.length > 0 ? detailParts.join(' • ') : 'Quote Available';

            const statusLabel = q.coverage_type === 'FULL' ? 'Quoted (Full)' : q.coverage_type === 'DIC' ? 'Quoted (DIC)' : 'Quoted';

            return {
                name: `${carrierName} Quote`,
                status: statusLabel,
                statusType: 'quoted' as const,
                premium: premStr,
                details,
            };
        };

        const bamboo = formatQuote('Bamboo', 'bamboo', term.carrier_quotes?.bamboo);
        const aegis = formatQuote('Aegis', 'aegis', term.carrier_quotes?.aegis);
        const psic = formatQuote('PSIC', 'psic', term.carrier_quotes?.psic);

        const effectiveTitlePro = liveTitlePro || term.title_pro;

        let titleStatus = 'UNMATCHED';
        let titleStatusType: 'available' | 'needs_uw' | 'declined' | 'not_quoted' | 'missing' = 'missing';
        let titleDetails = '✕ Pending title record verification • Not verified';

        if (effectiveTitlePro) {
            const ownerName = effectiveTitlePro.title_name ? `Owner on Record: ${effectiveTitlePro.title_name}` : 'Verified on Title';
            const noteSuffix = effectiveTitlePro.notes ? ` • Note: ${effectiveTitlePro.notes}` : '';

            if (effectiveTitlePro.match_status === 'matched') {
                titleStatus = 'MATCH';
                titleStatusType = 'available';
                titleDetails = `✓ Title Matches Named Insured • ${ownerName}${noteSuffix}`;
            } else if (effectiveTitlePro.match_status === 'partial') {
                titleStatus = 'TRUST / LLC';
                titleStatusType = 'needs_uw';
                titleDetails = `⚠️ Trust / LLC Entity Match • ${ownerName}${noteSuffix}`;
            } else if (effectiveTitlePro.match_status === 'mismatch') {
                titleStatus = 'UNMATCHED';
                titleStatusType = 'declined';
                titleDetails = `✕ Name Mismatch on Title • ${ownerName}${noteSuffix}`;
            } else if (effectiveTitlePro.match_status === 'missing') {
                titleStatus = 'MISSING / NOT FOUND';
                titleStatusType = 'declined';
                titleDetails = `⚠️ Name Nowhere to be Found on Title Record${effectiveTitlePro.notes ? ` • Note: ${effectiveTitlePro.notes}` : (effectiveTitlePro.title_name && effectiveTitlePro.title_name !== 'Name Not Found' ? ` • Searched: ${effectiveTitlePro.title_name}` : '')}`;
            } else {
                titleStatus = 'MATCH';
                titleStatusType = 'available';
                titleDetails = `✓ Verified on Title • ${ownerName}${noteSuffix}`;
            }
        }

        const isDecAttached = selectedAttachmentIds.includes('dec');
        const isRenewalAttached = selectedAttachmentIds.includes('renewal_dec');
        const isRceAttached = selectedAttachmentIds.includes('rce');

        const currentPremVal = term.annual_premium ? Number(term.annual_premium) : null;
        const renewalPremVal = term.renewal_annual_premium ? Number(term.renewal_annual_premium) : null;

        const currentPremStr = currentPremVal ? `$${Math.round(currentPremVal).toLocaleString()}` : null;
        const renewalPremStr = renewalPremVal ? `$${Math.round(renewalPremVal).toLocaleString()}` : null;

        let displayPrem = '$0';
        if (currentPremStr && renewalPremStr && currentPremStr !== renewalPremStr) {
            displayPrem = `${currentPremStr} (Current) / ${renewalPremStr} (Renewal)`;
        } else if (renewalPremStr) {
            displayPrem = `${renewalPremStr} (Renewal Offer)`;
        } else if (currentPremStr) {
            displayPrem = currentPremStr;
        }

        let decStatus = 'Missing';
        let decStatusType: 'available' | 'missing' = 'missing';
        let decName = 'FAIR Plan Dec Page';
        let decDetails = 'No Dec Page on file';

        if (term.has_dec && term.has_renewal_dec) {
            decName = 'FAIR Plan Dec & Renewal Offer';
            decStatus = 'Available + Renewal';
            decStatusType = 'available';
            const expPart = term.expiration_date ? `Current Exp: ${term.expiration_date}` : '';
            const renExpPart = term.renewal_expiration_date ? `Renewal Exp: ${term.renewal_expiration_date}` : '';
            const attPart = `Dec ${isDecAttached ? '✓ Attached' : '(Not Attached)'}, Renewal ${isRenewalAttached ? '✓ Attached' : '(Not Attached)'}`;
            decDetails = [expPart, renExpPart, attPart].filter(Boolean).join(' • ');
        } else if (term.has_renewal_dec) {
            decName = 'Renewal Offer Dec Page';
            decStatus = 'Renewal Available';
            decStatusType = 'available';
            const expPart = term.renewal_expiration_date || term.expiration_date ? `Exp: ${term.renewal_expiration_date || term.expiration_date}` : '';
            decDetails = `Renewal Offer ${isRenewalAttached ? '(Attached)' : '(Not Attached)'}${expPart ? ` • ${expPart}` : ''}`;
        } else if (term.has_dec) {
            decName = 'FAIR Plan Dec Page';
            decStatus = 'Available';
            decStatusType = 'available';
            const expPart = term.expiration_date ? `Exp: ${term.expiration_date}` : '';
            decDetails = `FAIR Plan Dec ${isDecAttached ? '(Attached)' : '(Not Attached)'}${expPart ? ` • ${expPart}` : ''}`;
        }

        const effectiveRceCost = rceReplacementCost ?? term.rce_replacement_cost;
        const effectiveRceCarrier = rceCarrier || term.rce_carrier || 'Bamboo';
        const hasEffectiveRce = term.has_rce || !!effectiveRceCost;

        const rceDetails = hasEffectiveRce
            ? `${effectiveRceCarrier} Valuation ${isRceAttached ? '(Attached)' : '(Not Attached)'}`
            : 'No RCE uploaded';

        const rceValueStr = effectiveRceCost
            ? `$${Math.round(Number(effectiveRceCost)).toLocaleString()}`
            : '$0';

        return [
            {
                name: decName,
                status: decStatus,
                statusType: decStatusType,
                premium: displayPrem,
                details: decDetails,
            },
            {
                name: 'RCE Valuation Report',
                status: hasEffectiveRce ? 'Available' : 'Missing',
                statusType: hasEffectiveRce ? ('available' as const) : ('missing' as const),
                premium: rceValueStr,
                details: rceDetails,
            },
            bamboo,
            aegis,
            psic,
            {
                name: 'Title Pro Report',
                status: titleStatus,
                statusType: titleStatusType,
                premium: '—',
                details: titleDetails,
            },
        ];
    }, [term, selectedAttachmentIds, liveTitlePro, rceReplacementCost, rceCarrier]);

    // Build the executive HTML Email Body with professional blue theme
    const htmlBody = useMemo(() => {
        if (!term) return '';
        const polNum = term.policy_number || 'Policy';
        const cleanPolNum = polNum.replace(/^CFP\s*/i, '');
        const insured = term.named_insured || 'Insured';
        const addr = term.property_address || 'Address on file';
        const exp = term.expiration_date || '—';

        const currentPremVal = term.annual_premium ? Number(term.annual_premium) : null;
        const renewalPremVal = term.renewal_annual_premium ? Number(term.renewal_annual_premium) : null;
        const currentPremStr = currentPremVal ? `$${Math.round(currentPremVal).toLocaleString()}` : null;
        const renewalPremStr = renewalPremVal ? `$${Math.round(renewalPremVal).toLocaleString()}` : null;

        let displayPrem = '$0';
        if (currentPremStr && renewalPremStr && currentPremStr !== renewalPremStr) {
            displayPrem = `${currentPremStr} (Current) &bull; ${renewalPremStr} (Renewal)`;
        } else if (renewalPremStr) {
            displayPrem = `${renewalPremStr} (Renewal Offer)`;
        } else if (currentPremStr) {
            displayPrem = currentPremStr;
        }

        const attachedFilesList = availableAttachments
            .filter(a => selectedAttachmentIds.includes(a.id))
            .map(a => `${a.label} (${a.fileName})`);

        const rowsHtml = docItems.map(item => {
            let badgeHtml = '';
            if (item.statusType === 'available' || item.statusType === 'quoted') {
                badgeHtml = `<span style="display:inline-block;padding:3px 8px;border-radius:4px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-weight:700;font-size:11px;letter-spacing:0.02em;text-transform:uppercase;">${item.status}</span>`;
            } else if (item.statusType === 'needs_uw') {
                badgeHtml = `<span style="display:inline-block;padding:3px 8px;border-radius:4px;background:#fef3c7;color:#b45309;border:1px solid #fde68a;font-weight:700;font-size:11px;letter-spacing:0.02em;text-transform:uppercase;">${item.status}</span>`;
            } else if (item.statusType === 'declined') {
                badgeHtml = `<span style="display:inline-block;padding:3px 8px;border-radius:4px;background:#f8fafc;color:#475569;border:1px solid #cbd5e1;font-weight:700;font-size:11px;letter-spacing:0.02em;text-transform:uppercase;">${item.status}</span>`;
            } else if (item.statusType === 'not_quoted') {
                badgeHtml = `<span style="display:inline-block;padding:3px 8px;border-radius:4px;background:#f8fafc;color:#94a3b8;border:1px solid #e2e8f0;font-weight:600;font-size:11px;letter-spacing:0.02em;text-transform:uppercase;">${item.status}</span>`;
            } else {
                badgeHtml = `<span style="display:inline-block;padding:3px 8px;border-radius:4px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;font-weight:700;font-size:11px;letter-spacing:0.02em;text-transform:uppercase;">${item.status}</span>`;
            }

            if (item.name === 'Title Pro Report') {
                return `
            <tr style="border-bottom:1px solid #e2e8f0;background:#f8fafc;">
              <td style="width:28%;padding:9px 12px;font-weight:600;color:#0f172a;font-size:13px;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${item.name}</td>
              <td style="width:18%;padding:9px 8px;text-align:center;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${badgeHtml}</td>
              <td colspan="2" style="width:54%;padding:9px 12px;color:#334155;font-size:12px;line-height:1.4;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${item.details}</td>
            </tr>`;
            }

            return `
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="width:28%;padding:9px 12px;font-weight:600;color:#0f172a;font-size:13px;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${item.name}</td>
              <td style="width:18%;padding:9px 8px;text-align:center;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${badgeHtml}</td>
              <td style="width:18%;padding:9px 12px;color:#334155;font-weight:600;font-size:13px;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${item.premium}</td>
              <td style="width:36%;padding:9px 12px;color:#475569;font-size:12px;line-height:1.4;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${item.details}</td>
            </tr>`;
        }).join('');

        const notesBlock = customNotes.trim()
            ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:680px;margin-top:16px;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1e40af;border-radius:4px;">
                 <tr>
                   <td style="padding:12px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                     <strong style="color:#0f172a;font-size:13px;">Additional Remarks:</strong>
                     <p style="margin:6px 0 0 0;color:#334155;font-size:13px;line-height:1.5;">${customNotes.replace(/\n/g, '<br/>')}</p>
                   </td>
                 </tr>
               </table>`
            : '';

        const attachmentNoticeHtml = attachedFilesList.length > 0
            ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:680px;margin-top:16px;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #2563eb;border-radius:4px;">
                 <tr>
                   <td style="padding:10px 14px;font-size:12.5px;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                     <strong>Attached Files (${attachedFilesList.length}):</strong> ${attachedFilesList.join(', ')}
                   </td>
                 </tr>
               </table>`
            : `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:680px;margin-top:16px;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #64748b;border-radius:4px;">
                 <tr>
                   <td style="padding:10px 14px;font-size:12.5px;color:#475569;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                     <strong>Notice:</strong> No documents attached (Status Summary Only).
                   </td>
                 </tr>
               </table>`;

        const urgentBannerHtml = isUrgent
            ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:680px;margin-bottom:16px;border-collapse:collapse;background:#fef2f2;border:1.5px solid #ef4444;border-left:5px solid #dc2626;border-radius:6px;">
                 <tr>
                   <td style="padding:10px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                     <strong style="color:#b91c1c;font-size:12.5px;letter-spacing:0.04em;text-transform:uppercase;">🚨 URGENT &bull; High Priority Request</strong>
                     <p style="margin:4px 0 0 0;color:#7f1d1d;font-size:12px;">This policy requires immediate attention / expedited action.</p>
                   </td>
                 </tr>
               </table>`
            : '';

        return `
        <div style="margin:0;padding:0;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px;width:100%;margin:0;text-align:left;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.5;">
            <tr>
              <td align="left" style="padding:0;text-align:left;">
                ${urgentBannerHtml}
                
                <!-- Title Row: Table based for perfect Outlook alignment -->
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:680px;border-bottom:2px solid #1e3a8a;padding-bottom:10px;margin-bottom:16px;">
                  <tr>
                    <td align="left" style="vertical-align:middle;">
                      <h2 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                        CFP Policy Document &amp; Quoting Summary
                      </h2>
                    </td>
                    <td align="right" style="vertical-align:middle;white-space:nowrap;padding-left:12px;">
                      <span style="font-size:12px;color:#1e40af;font-weight:700;background:#eff6ff;border:1px solid #dbeafe;padding:3px 8px;border-radius:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                        CFP ${cleanPolNum}
                      </span>
                    </td>
                  </tr>
                </table>

                <p style="font-size:14px;color:#334155;margin:0 0 16px 0;line-height:1.5;">
                  Hello,<br/><br/>
                  Please review the current document verification and companion quote status for policy <strong>CFP ${cleanPolNum}</strong>:
                </p>

                <!-- Insured & Property Header Card -->
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:680px;border-collapse:collapse;background:#f0f7ff;border:1px solid #bfdbfe;border-left:4px solid #2563eb;border-radius:6px;margin-bottom:20px;">
                  <tr>
                    <td style="padding:12px 16px;font-size:13px;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                      <div style="margin-bottom:4px;"><strong style="color:#1e40af;">Named Insured:</strong> ${insured}</div>
                      <div style="margin-bottom:4px;"><strong style="color:#1e40af;">Property Address:</strong> ${addr}</div>
                      <div><strong style="color:#1e40af;">Expiration Date:</strong> ${exp}${term.renewal_expiration_date ? ` &nbsp;&bull;&nbsp; <strong style="color:#1e40af;">Renewal Exp:</strong> ${term.renewal_expiration_date}` : ''} &nbsp;&bull;&nbsp; <strong style="color:#1e40af;">FAIR Plan Premium:</strong> ${displayPrem}</div>
                    </td>
                  </tr>
                </table>

                <!-- Quoting & Document Breakdown Table -->
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:680px;border-collapse:collapse;margin:16px 0;font-size:13px;background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
                  <thead>
                    <tr style="background:#f8fafc;text-align:left;border-bottom:2px solid #cbd5e1;">
                      <th style="width:28%;padding:10px 12px;color:#1e293b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;text-align:left;">Item / Carrier</th>
                      <th style="width:18%;padding:10px 8px;color:#1e293b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;text-align:center;">Status</th>
                      <th style="width:18%;padding:10px 12px;color:#1e293b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;text-align:left;">Amount / Premium</th>
                      <th style="width:36%;padding:10px 12px;color:#1e293b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;text-align:left;">Quote # &amp; Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml}
                  </tbody>
                </table>

                ${attachmentNoticeHtml}

                ${notesBlock}

                <!-- Signature & Footer -->
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:680px;margin-top:24px;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #2563eb;border-radius:6px;">
                  <tr>
                    <td style="padding:14px 16px;font-size:13px;color:#334155;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                      <div style="font-weight:700;color:#0f172a;font-size:13.5px;">Prepared &amp; Sent by: ${currentUserName || 'Coverage Check Team'}</div>
                      <div style="font-size:12px;color:#64748b;margin-top:4px;">
                        Coverage Check &bull; All replies are routed directly to our servicing team
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
        `;
    }, [term, docItems, customNotes, availableAttachments, selectedAttachmentIds, currentUserName]);

    if (!isOpen || !term) return null;

    const toRecipients = useMemo(() => TEAM_RECIPIENTS.filter(r => recipientRoles[r.id] === 'to'), [recipientRoles]);
    const ccRecipients = useMemo(() => TEAM_RECIPIENTS.filter(r => recipientRoles[r.id] === 'cc'), [recipientRoles]);

    const extraToCount = useMemo(() => {
        return customTo ? customTo.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes('@')).length : 0;
    }, [customTo]);
    const totalToCount = toRecipients.length + extraToCount;

    const setMemberRole = (id: string, role: RecipientRole) => {
        setRecipientRoles(prev => ({
            ...prev,
            [id]: prev[id] === role ? 'none' : role,
        }));
    };

    const applyPreset = (preset: 'olga_to_nancy_cc' | 'nancy_to_olga_cc' | 'olga_nancy_to' | 'clear') => {
        if (preset === 'olga_to_nancy_cc') {
            setRecipientRoles({
                olga: 'to',
                nancy: 'cc',
                johnpaul: 'cc',
                esmeralda: 'none',
                eric: 'none',
                phoebe: 'none',
            });
        } else if (preset === 'nancy_to_olga_cc') {
            setRecipientRoles({
                nancy: 'to',
                olga: 'cc',
                johnpaul: 'cc',
                esmeralda: 'none',
                eric: 'none',
                phoebe: 'none',
            });
        } else if (preset === 'olga_nancy_to') {
            setRecipientRoles({
                olga: 'to',
                nancy: 'to',
                johnpaul: 'none',
                esmeralda: 'none',
                eric: 'none',
                phoebe: 'none',
            });
        } else if (preset === 'clear') {
            setRecipientRoles({
                olga: 'none',
                nancy: 'none',
                johnpaul: 'none',
                esmeralda: 'none',
                eric: 'none',
                phoebe: 'none',
            });
        }
    };

    const handleInitiateSend = () => {
        if (toRecipients.length === 0 && ccRecipients.length === 0 && !customCc.trim()) {
            setError('Please select at least one recipient (TO or CC).');
            return;
        }

        if (!subject.trim()) {
            setError('Please enter a subject line.');
            return;
        }

        const effectiveTitlePro = liveTitlePro || term?.title_pro;
        const warnings: Array<{ id: string; label: string; desc: string; severity: 'warning' | 'info' }> = [];

        // 1. Missing Title Pro Verification
        if (!effectiveTitlePro) {
            warnings.push({
                id: 'title_pro',
                label: 'Missing Title Pro',
                desc: 'Title Pro record has not been matched or verified for this property.',
                severity: 'warning',
            });
        } else if (effectiveTitlePro.match_status === 'mismatch') {
            warnings.push({
                id: 'title_pro_mismatch',
                label: 'Title Pro Unmatched',
                desc: `Owner on record does not match insured: ${effectiveTitlePro.title_name || 'Mismatch'}.`,
                severity: 'warning',
            });
        } else if (effectiveTitlePro.match_status === 'missing') {
            warnings.push({
                id: 'title_pro_missing',
                label: 'Title Pro: Name Not Found',
                desc: `Insured name was nowhere to be found on Title Pro records${effectiveTitlePro.notes ? ` (${effectiveTitlePro.notes})` : ''}.`,
                severity: 'warning',
            });
        }

        // 2. Missing FAIR Plan Premium Amount
        const curPrem = term?.annual_premium ? Number(term.annual_premium) : 0;
        const renPrem = term?.renewal_annual_premium ? Number(term.renewal_annual_premium) : 0;
        if (!curPrem && !renPrem) {
            warnings.push({
                id: 'fair_plan_amount',
                label: 'Missing Fair Plan Amount',
                desc: 'FAIR Plan premium amount is $0 or missing from dec page / renewal.',
                severity: 'warning',
            });
        }

        // 3. Missing FAIR Plan Dec Page / Renewal PDF
        if (!term?.has_dec && !term?.has_renewal_dec) {
            warnings.push({
                id: 'dec_page',
                label: 'Missing Fair Plan Dec Page',
                desc: 'No current FAIR Plan Dec Page or Renewal Offer PDF is on file.',
                severity: 'warning',
            });
        }

        // 4. Missing Bamboo Quote (SOP Mandatory Carrier 1 of 3)
        const bambooQ = term?.carrier_quotes?.bamboo;
        if (!bambooQ) {
            warnings.push({
                id: 'bamboo_quote',
                label: 'Missing Bamboo Quote',
                desc: 'No Bamboo quote or ineligibility notation recorded. (Mandatory SOP Carrier)',
                severity: 'warning',
            });
        } else if (!bambooQ.premium && bambooQ.coverage_type !== 'AGENT_REVIEW' && bambooQ.coverage_type !== 'UNAVAILABLE') {
            warnings.push({
                id: 'bamboo_quote',
                label: 'Missing Bamboo Premium',
                desc: 'Bamboo quote is missing premium amount or ineligibility notation.',
                severity: 'warning',
            });
        }

        // 5. Missing Aegis Quote (SOP Mandatory Carrier 2 of 3)
        const aegisQ = term?.carrier_quotes?.aegis;
        if (!aegisQ) {
            warnings.push({
                id: 'aegis_quote',
                label: 'Missing Aegis Quote',
                desc: 'No Aegis quote or ineligibility notation recorded. (Mandatory SOP Carrier)',
                severity: 'warning',
            });
        } else if (!aegisQ.premium && aegisQ.coverage_type !== 'AGENT_REVIEW' && aegisQ.coverage_type !== 'UNAVAILABLE') {
            warnings.push({
                id: 'aegis_quote',
                label: 'Missing Aegis Premium',
                desc: 'Aegis quote is missing premium amount or ineligibility notation.',
                severity: 'warning',
            });
        }

        // 6. Missing PSIC Quote (SOP Mandatory Carrier 3 of 3)
        const psicQ = term?.carrier_quotes?.psic;
        if (!psicQ) {
            warnings.push({
                id: 'psic_quote',
                label: 'Missing PSIC Quote',
                desc: 'No Pacific Specialty (PSIC) quote or ineligibility notation recorded. (Mandatory SOP Carrier)',
                severity: 'warning',
            });
        } else if (!psicQ.premium && psicQ.coverage_type !== 'AGENT_REVIEW' && psicQ.coverage_type !== 'UNAVAILABLE') {
            warnings.push({
                id: 'psic_quote',
                label: 'Missing PSIC Premium',
                desc: 'Pacific Specialty (PSIC) quote is missing premium amount or ineligibility notation.',
                severity: 'warning',
            });
        }

        // Note: American Modern (AM) and SageSure are supplemental/optional companion carriers per SOP and do not block sending.

        // 9. Missing RCE Valuation Amount & Missing RCE PDF
        const effectiveRceCost = rceReplacementCost ?? term?.rce_replacement_cost;
        if (!effectiveRceCost) {
            warnings.push({
                id: 'rce',
                label: 'Missing RCE Valuation Amount',
                desc: 'RCE Replacement Cost valuation is $0 / not calculated.',
                severity: 'info',
            });
        } else if (!selectedAttachmentIds.includes('rce')) {
            warnings.push({
                id: 'rce_attachment',
                label: 'Missing RCE PDF Attachment',
                desc: `RCE valuation ($${Math.round(Number(effectiveRceCost)).toLocaleString()}) is recorded, but no RCE PDF is attached.`,
                severity: 'warning',
            });
        }

        // 10. Check Missing PDF Attachments for Quoted Carriers
        if (bambooQ && (bambooQ.coverage_type === 'FULL' || bambooQ.coverage_type === 'DIC' || bambooQ.coverage_type === 'QUOTE' || Number(bambooQ.premium) > 0)) {
            if (!selectedAttachmentIds.includes('bamboo')) {
                warnings.push({
                    id: 'bamboo_pdf_missing',
                    label: 'Missing Bamboo PDF Attachment',
                    desc: 'Bamboo quote is recorded, but no Bamboo quote PDF document is attached.',
                    severity: 'warning',
                });
            }
        }

        if (aegisQ && (aegisQ.coverage_type === 'FULL' || aegisQ.coverage_type === 'DIC' || aegisQ.coverage_type === 'QUOTE' || Number(aegisQ.premium) > 0)) {
            if (!selectedAttachmentIds.includes('aegis')) {
                warnings.push({
                    id: 'aegis_pdf_missing',
                    label: 'Missing Aegis PDF Attachment',
                    desc: 'Aegis quote is recorded, but no Aegis quote PDF document is attached.',
                    severity: 'warning',
                });
            }
        }

        if (psicQ && (psicQ.coverage_type === 'FULL' || psicQ.coverage_type === 'DIC' || psicQ.coverage_type === 'QUOTE' || Number(psicQ.premium) > 0)) {
            if (!selectedAttachmentIds.includes('psic')) {
                warnings.push({
                    id: 'psic_pdf_missing',
                    label: 'Missing PSIC PDF Attachment',
                    desc: 'PSIC quote is recorded, but no PSIC quote PDF document is attached.',
                    severity: 'warning',
                });
            }
        }

        // 11. Missing Dec / Renewal PDF Attachment
        if ((term?.has_dec || term?.has_renewal_dec) && !selectedAttachmentIds.includes('dec') && !selectedAttachmentIds.includes('renewal_dec')) {
            warnings.push({
                id: 'dec_pdf_missing',
                label: 'Missing Dec Page Attachment',
                desc: 'FAIR Plan Dec Page / Renewal is available, but no Dec PDF is selected for attachment.',
                severity: 'warning',
            });
        }

        // 12. No Attachments Selected
        if (selectedAttachmentIds.length === 0) {
            warnings.push({
                id: 'no_attachments',
                label: 'No Attached PDFs',
                desc: 'Email will be sent as a status summary only with no attached PDF documents.',
                severity: 'info',
            });
        }

        setConfirmWarnings(warnings);
        setShowConfirmModal(true);
    };

    const handleSend = async () => {
        if (toRecipients.length === 0 && ccRecipients.length === 0 && !customCc.trim()) {
            setError('Please select at least one recipient (TO or CC).');
            return;
        }

        if (!subject.trim()) {
            setError('Please enter a subject line.');
            return;
        }

        setSending(true);
        setError(null);

        const toEmails = toRecipients.map(r => r.email);
        const toNames = toRecipients.map(r => r.name.split(' ')[0]);
        const ccEmails = ccRecipients.map(r => r.email);
        const ccNames = ccRecipients.map(r => r.name.split(' ')[0]);

        const selectedAttachmentsPayload = availableAttachments
            .filter(a => selectedAttachmentIds.includes(a.id))
            .map(a => ({
                storagePath: a.storagePath,
                fileName: a.fileName,
                bucket: a.bucket,
            }));

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                setError('Session expired. Please log in again.');
                setSending(false);
                return;
            }

            const res = await fetch('/api/cfp-summary/send-mail', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    policyId: term.policy_id,
                    policyNumber: term.policy_number,
                    toRecipients: toEmails,
                    toNames,
                    customTo: customTo.trim() || undefined,
                    ccRecipients: ccEmails,
                    ccNames,
                    customCc: customCc.trim() || undefined,
                    subject,
                    htmlBody,
                    selectedAttachments: selectedAttachmentsPayload,
                }),
            });

            const json = await res.json();

            if (res.ok && json.success) {
                const namesSummary = toNames.length > 0 ? toNames.join(', ') : (ccNames.join(', ') || 'team');
                setSuccessMsg(`✓ Email successfully sent to ${namesSummary} (${selectedAttachmentsPayload.length} files attached)!`);
                onSentSuccess(term.policy_id, {
                    sent_to: json.sent_to || toEmails,
                    sent_to_names: json.sent_to_names || toNames,
                    sent_cc: json.sent_cc || ccEmails,
                    sent_cc_names: json.sent_cc_names || ccNames,
                    sent_by: json.sent_by || 'Staff Member',
                    sent_at: json.sent_at || new Date().toISOString(),
                    subject: json.subject || subject,
                    attachments: json.attachments || selectedAttachmentsPayload.map(a => a.fileName),
                });
                setTimeout(() => {
                    onClose();
                }, 1200);
            } else {
                setError(json.error || 'Failed to send email. Please try again.');
            }
        } catch (err: any) {
            setError(err.message || 'Network error sending email.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.modalHeader}>
                    <div className={styles.modalHeaderInfo}>
                        <div className={styles.modalTitleRow}>
                            <span className={styles.mailIconBadge}>
                                <Mail size={16} />
                            </span>
                            <h3 className={styles.modalTitle}>Send Policy Document Status</h3>
                        </div>
                        <p className={styles.modalSubtitle}>
                            {term.policy_number} &bull; {term.named_insured} &bull; {term.property_address || 'No address'}
                        </p>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={onClose} title="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* Top Navigation Bar: Compose & Attachments vs Live Email Preview */}
                <div className={styles.topTabBar}>
                    <button
                        type="button"
                        className={`${styles.topTabBtn} ${activeModalTab === 'compose' ? styles.topTabActive : ''}`}
                        onClick={() => setActiveModalTab('compose')}
                    >
                        <Edit3 size={14} />
                        <span>1. Compose &amp; Documents ({selectedAttachmentIds.length} Attached)</span>
                    </button>
                    <button
                        type="button"
                        className={`${styles.topTabBtn} ${activeModalTab === 'preview' ? styles.topTabActive : ''}`}
                        onClick={() => setActiveModalTab('preview')}
                    >
                        <Eye size={14} />
                        <span>2. Live Email Preview (WYSIWYG)</span>
                        <span className={styles.liveDot}>● Live</span>
                    </button>
                </div>

                {/* Body */}
                <div className={styles.modalBody}>
                    {activeModalTab === 'compose' ? (
                        <>
                            {/* Recipient Selection */}
                            <div className={styles.formSection}>
                                <label className={styles.fieldLabel}>
                                    <UserCheck size={14} /> Team Recipients (Select TO or CC)
                                </label>

                                {/* Quick Presets */}
                                <div className={styles.presetButtonsRow}>
                                    <span className={styles.presetLabel}>Quick:</span>
                                    <button
                                        type="button"
                                        className={`${styles.presetBtn} ${recipientRoles.olga === 'to' && recipientRoles.nancy === 'cc' && recipientRoles.johnpaul === 'cc' ? styles.presetActive : ''}`}
                                        onClick={() => applyPreset('olga_to_nancy_cc')}
                                        title="Set Olga as TO, Nancy and JP as CC"
                                    >
                                        ⚡ To Olga (CC Nancy &amp; JP)
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.presetBtn} ${recipientRoles.nancy === 'to' && recipientRoles.olga === 'cc' && recipientRoles.johnpaul === 'cc' ? styles.presetActive : ''}`}
                                        onClick={() => applyPreset('nancy_to_olga_cc')}
                                        title="Set Nancy as TO, Olga and JP as CC"
                                    >
                                        ⚡ To Nancy (CC Olga &amp; JP)
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.presetBtn} ${recipientRoles.olga === 'to' && recipientRoles.nancy === 'to' && recipientRoles.johnpaul === 'none' ? styles.presetActive : ''}`}
                                        onClick={() => applyPreset('olga_nancy_to')}
                                        title="Set both Olga and Nancy as TO"
                                    >
                                        ⚡ To Olga &amp; Nancy
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.presetBtn} ${styles.presetClear}`}
                                        onClick={() => applyPreset('clear')}
                                        title="Clear all team recipients"
                                    >
                                        Clear
                                    </button>
                                </div>

                                {/* Recipient Cards Grid */}
                                <div className={styles.recipientPillsGrid}>
                                    {TEAM_RECIPIENTS.map(r => {
                                        const role = recipientRoles[r.id] || 'none';
                                        return (
                                            <div
                                                key={r.id}
                                                className={`${styles.recipientCard} ${role === 'to' ? styles.roleTo : role === 'cc' ? styles.roleCc : ''}`}
                                            >
                                                <div className={styles.recipientLeft}>
                                                    <span className={styles.avatar}>{r.avatarText}</span>
                                                    <div className={styles.recipientInfo}>
                                                        <span className={styles.name}>{r.name}</span>
                                                        <span className={styles.email}>{r.email}</span>
                                                    </div>
                                                </div>
                                                <div className={styles.roleToggleGroup}>
                                                    <button
                                                        type="button"
                                                        className={`${styles.roleBtn} ${role === 'to' ? styles.toActive : ''}`}
                                                        onClick={() => setMemberRole(r.id, 'to')}
                                                        title={`Set ${r.name} as primary TO`}
                                                    >
                                                        TO
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`${styles.roleBtn} ${role === 'cc' ? styles.ccActive : ''}`}
                                                        onClick={() => setMemberRole(r.id, 'cc')}
                                                        title={`Set ${r.name} as copy CC`}
                                                    >
                                                        CC
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* VA Team Auto-CC Info */}
                                <div style={{
                                    marginTop: '10px',
                                    padding: '8px 12px',
                                    background: 'rgba(34, 67, 182, 0.06)',
                                    border: '1px solid rgba(34, 67, 182, 0.2)',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '0.78rem',
                                    color: '#1e3a8a'
                                }}>
                                    <CheckCircle2 size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
                                    <span>
                                        {currentUserEmail.includes('paula') || currentUserEmail.includes('alsopva01') ? (
                                            <><strong>Auto-CC Active:</strong> Phoebe Hernandez (<code>phoebe@coveragechecknow.com</code>) and Danicah Jesoro (<code>danicah@coveragechecknow.com</code>) will be CC&apos;d so all VA inboxes stay synced.</>
                                        ) : currentUserEmail.includes('phoebe') || currentUserEmail.includes('alsopva02') ? (
                                            <><strong>Auto-CC Active:</strong> Paula Veloza (<code>paula@coveragechecknow.com</code>) and Danicah Jesoro (<code>danicah@coveragechecknow.com</code>) will be CC&apos;d so all VA inboxes stay synced.</>
                                        ) : currentUserEmail.includes('danicah') || currentUserEmail.includes('alsopva03') ? (
                                            <><strong>Auto-CC Active:</strong> Paula Veloza (<code>paula@coveragechecknow.com</code>) and Phoebe Hernandez (<code>phoebe@coveragechecknow.com</code>) will be CC&apos;d so all VA inboxes stay synced.</>
                                        ) : (
                                            <><strong>Auto-CC Active:</strong> Support team inboxes (<code>phoebe@coveragechecknow.com</code>, <code>danicah@coveragechecknow.com</code>, <code>paula@coveragechecknow.com</code>) will be auto-CC&apos;d so all team inboxes stay synced.</>
                                        )}
                                    </span>
                                </div>
                            </div>

                            {/* Custom TO / Additional Primary Emails */}
                            <div className={styles.formSection}>
                                <label className={styles.fieldLabel}>
                                    <Plus size={13} /> Additional TO / Custom Primary Email (Optional)
                                </label>
                                <input
                                    type="text"
                                    className={styles.textInput}
                                    placeholder="e.g. producer@allstate.com, csr@allstate.com"
                                    value={customTo}
                                    onChange={e => setCustomTo(e.target.value)}
                                />
                            </div>

                            {/* Custom CC / Additional Emails */}
                            <div className={styles.formSection}>
                                <label className={styles.fieldLabel}>
                                    <Plus size={13} /> Additional CC / Custom Email (Optional)
                                </label>
                                <input
                                    type="text"
                                    className={styles.textInput}
                                    placeholder="e.g. manager@allstate.com, team@agency.com"
                                    value={customCc}
                                    onChange={e => setCustomCc(e.target.value)}
                                />
                            </div>

                            {/* Subject Line with URGENT Toggle */}
                            <div className={styles.formSection}>
                                <div className={styles.subjectHeaderRow}>
                                    <label className={styles.fieldLabel} style={{ marginBottom: 0 }}>
                                        <FileText size={14} /> Subject
                                    </label>
                                    <button
                                        type="button"
                                        className={`${styles.urgentToggleBtn} ${isUrgent ? styles.urgentActive : ''}`}
                                        onClick={handleToggleUrgent}
                                        title={isUrgent ? 'Click to remove URGENT flag' : 'Click to mark this email as URGENT'}
                                    >
                                        <AlertTriangle size={12} />
                                        <span>{isUrgent ? 'URGENT: ON' : 'Mark URGENT'}</span>
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    className={`${styles.textInput} ${isUrgent ? styles.urgentSubjectInput : ''}`}
                                    value={subject}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setSubject(val);
                                        const hasUrgent = /^URGENT[:\- ]/i.test(val.trim()) || /^\[URGENT\]/i.test(val.trim());
                                        if (hasUrgent !== isUrgent) {
                                            setIsUrgent(hasUrgent);
                                        }
                                    }}
                                    placeholder="CFP No - Insured Name - Address"
                                />
                            </div>

                            {/* Additional Notes to Include */}
                            <div className={styles.formSection}>
                                <label className={styles.fieldLabel}>
                                    <Edit3 size={14} /> Custom Notes / Remarks to Include (Optional)
                                </label>
                                <textarea
                                    className={styles.textareaInput}
                                    placeholder="Add any specific instructions or remarks to Nancy, Olga, or the team..."
                                    rows={2}
                                    value={customNotes}
                                    onChange={e => setCustomNotes(e.target.value)}
                                    />
                            </div>

                            {/* RCE Valuation Amount Entry / Override */}
                            <div className={styles.formSection}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <label className={styles.fieldLabel} style={{ marginBottom: 0 }}>
                                        <DollarSign size={14} /> RCE Valuation Amount (Replacement Cost)
                                    </label>
                                    {term.rce_storage_path && (
                                        <span style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: 600 }}>
                                            {term.rce_file_name || 'RCE PDF Attached'}
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.875rem', fontWeight: 600 }}>$</span>
                                        <input
                                            type="text"
                                            className={styles.textInput}
                                            style={{ paddingLeft: '24px' }}
                                            placeholder="e.g. 625183"
                                            value={rceReplacementCost ? String(Math.round(Number(rceReplacementCost))) : ''}
                                            onChange={e => {
                                                const raw = e.target.value.replace(/[^0-9.]/g, '');
                                                const num = raw ? parseFloat(raw) : null;
                                                setRceReplacementCost(num);
                                                if (num) {
                                                    saveRceValuationAsync(num, rceCarrier);
                                                }
                                            }}
                                        />
                                    </div>
                                    <select
                                        className={styles.textInput}
                                        style={{ width: '130px', flexShrink: 0 }}
                                        value={rceCarrier}
                                        onChange={e => {
                                            const newCarrier = e.target.value;
                                            setRceCarrier(newCarrier);
                                            if (rceReplacementCost) {
                                                saveRceValuationAsync(rceReplacementCost, newCarrier);
                                            }
                                        }}
                                    >
                                        <option value="Bamboo">Bamboo</option>
                                        <option value="Aegis">Aegis</option>
                                        <option value="AM">AM</option>
                                        <option value="360Value">360Value</option>
                                        <option value="CoreLogic">CoreLogic</option>
                                        <option value="SageSure">SageSure</option>
                                        <option value="PSIC">PSIC</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>

                            {/* Guardrail: Attachment Pre-Selection & PDF Verification */}
                            <div className={styles.formSection}>
                                <div className={styles.attachmentSectionHeader}>
                                    <label className={styles.fieldLabel} style={{ marginBottom: 0 }}>
                                        <Paperclip size={14} /> Attachments &amp; PDF Guardrail (Pre-Select Files)
                                    </label>
                                    {availableAttachments.length > 0 && (
                                        <div className={styles.attachmentQuickActions}>
                                            <button
                                                type="button"
                                                className={styles.quickActionBtn}
                                                onClick={handleSelectAllAttachments}
                                            >
                                                Select All ({availableAttachments.length})
                                            </button>
                                            <span className={styles.divider}>&bull;</span>
                                            <button
                                                type="button"
                                                className={styles.quickActionBtn}
                                                onClick={handleDeselectAllAttachments}
                                            >
                                                Clear All
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className={styles.guardrailNotice}>
                                    <ShieldCheck size={14} className={styles.guardrailIcon} />
                                    <span>
                                        <strong>Accuracy Guardrail:</strong> Check the exact documents to attach. Click <strong>Preview</strong> to inspect any PDF before sending so no incorrect Dec page or quote is attached.
                                    </span>
                                </div>

                                {availableAttachments.length === 0 ? (
                                    <div className={styles.noAttachmentsBox}>
                                        No uploaded PDF documents found for this term. (Email will be sent as status summary only).
                                    </div>
                                ) : (
                                    <div className={styles.attachmentGrid}>
                                        {availableAttachments.map(att => {
                                            const isChecked = selectedAttachmentIds.includes(att.id);
                                            const isPreviewing = previewingId === att.id;
                                            return (
                                                <div
                                                    key={att.id}
                                                    className={`${styles.attachmentCard} ${isChecked ? styles.checked : ''}`}
                                                >
                                                    <div
                                                        className={styles.attachmentMain}
                                                        onClick={() => toggleAttachment(att.id)}
                                                    >
                                                        <span className={styles.checkboxIcon}>
                                                            {isChecked ? <CheckSquare size={16} color="#1d4ed8" /> : <Square size={16} color="#94a3b8" />}
                                                        </span>
                                                        <div className={styles.attachmentInfo}>
                                                            <div className={styles.attachmentLabelRow}>
                                                                <span className={styles.attBadge}>{att.badge}</span>
                                                                <span className={styles.attLabel}>{att.label}</span>
                                                            </div>
                                                            <span className={styles.attFileName} title={att.fileName}>
                                                                {att.fileName}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className={styles.previewBtn}
                                                        onClick={() => handlePreviewPdf(att)}
                                                        disabled={isPreviewing}
                                                        title="Preview PDF in new tab"
                                                    >
                                                        {isPreviewing ? (
                                                            <Loader2 size={12} className="animate-spin" />
                                                        ) : (
                                                            <Eye size={12} />
                                                        )}
                                                        <span>Preview</span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Live Email & Document Preview Section inside scrollable body */}
                            <div className={styles.previewContainer}>
                                <div className={styles.previewHeader}>
                                    <div className={styles.previewHeaderLeft}>
                                        <span className={styles.previewTitle}>
                                            <Eye size={14} /> Live Email Preview (What Recipient Sees)
                                        </span>
                                        <span className={styles.liveBadge}>● Real-Time</span>
                                    </div>
                                    <div className={styles.previewHeaderRight}>
                                        <button
                                            type="button"
                                            className={styles.expandPreviewBtn}
                                            onClick={() => setActiveModalTab('preview')}
                                        >
                                            <Eye size={12} />
                                            <span>Full Screen Preview</span>
                                        </button>
                                    </div>
                                </div>

                                <div className={styles.emailMockWrapper}>
                                    <div className={styles.emailMetaBar}>
                                        <div className={styles.metaRow}>
                                            <span className={styles.metaLabel}>From:</span>
                                            <span className={styles.metaValue}>
                                                <strong>{currentUserName || 'Coverage Check Team'}</strong> &lt;admin@coveragechecknow.com&gt;
                                            </span>
                                        </div>
                                        <div className={styles.metaRow}>
                                            <span className={styles.metaLabel}>To:</span>
                                            <div className={styles.metaPills}>
                                                {toRecipients.map(r => (
                                                    <span key={r.id} className={styles.toPill}>{r.name} &lt;{r.email}&gt;</span>
                                                ))}
                                                {customTo && customTo.split(/[,;\s]+/).filter(e => e.includes('@')).map((e, idx) => (
                                                    <span key={idx} className={styles.toPill}>{e}</span>
                                                ))}
                                                {toRecipients.length === 0 && !customTo && (
                                                    <span className={styles.emptyMetaNotice}>No TO recipient selected</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className={styles.metaRow}>
                                            <span className={styles.metaLabel}>CC:</span>
                                            <div className={styles.metaPills}>
                                                {ccRecipients.map(r => (
                                                    <span key={r.id} className={styles.ccPill}>{r.name} &lt;{r.email}&gt;</span>
                                                ))}
                                                {customCc && customCc.split(/[,;\s]+/).filter(e => e.includes('@')).map((e, idx) => (
                                                    <span key={idx} className={styles.ccPill}>{e}</span>
                                                ))}
                                                <span className={styles.autoCcNotice}>+ Auto-CC: Support team</span>
                                            </div>
                                        </div>
                                        <div className={styles.metaRow}>
                                            <span className={styles.metaLabel}>Subject:</span>
                                            <span className={styles.subjectValue}>
                                                {isUrgent && <span className={styles.urgentBadge}>🚨 URGENT</span>}
                                                {subject || 'No subject'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className={styles.emailBodyCanvas}>
                                        <div dangerouslySetInnerHTML={{ __html: htmlBody }} />
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* Dedicated Tab: Full Live Preview */
                        <div className={styles.fullPreviewTabContainer}>
                            <div className={styles.previewHeader}>
                                <div className={styles.previewHeaderLeft}>
                                    <span className={styles.previewTitle}>
                                        <Eye size={15} /> Exact Email Preview (Live WYSIWYG)
                                    </span>
                                    <span className={styles.liveBadge}>● Real-Time Ready</span>
                                </div>
                                <div className={styles.previewHeaderRight}>
                                    <div className={styles.previewTabGroup}>
                                        <button
                                            type="button"
                                            className={`${styles.previewTabBtn} ${previewMode === 'full_email' ? styles.tabActive : ''}`}
                                            onClick={() => setPreviewMode('full_email')}
                                        >
                                            Full Email View
                                        </button>
                                        <button
                                            type="button"
                                            className={`${styles.previewTabBtn} ${previewMode === 'table_only' ? styles.tabActive : ''}`}
                                            onClick={() => setPreviewMode('table_only')}
                                        >
                                            Table Only
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {previewMode === 'full_email' ? (
                                <div className={styles.emailMockWrapper}>
                                    <div className={styles.emailMetaBar}>
                                        <div className={styles.metaRow}>
                                            <span className={styles.metaLabel}>From:</span>
                                            <span className={styles.metaValue}>
                                                <strong>{currentUserName || 'Coverage Check Team'}</strong> &lt;admin@coveragechecknow.com&gt;
                                            </span>
                                        </div>
                                        <div className={styles.metaRow}>
                                            <span className={styles.metaLabel}>To:</span>
                                            <div className={styles.metaPills}>
                                                {toRecipients.map(r => (
                                                    <span key={r.id} className={styles.toPill}>{r.name} &lt;{r.email}&gt;</span>
                                                ))}
                                                {customTo && customTo.split(/[,;\s]+/).filter(e => e.includes('@')).map((e, idx) => (
                                                    <span key={idx} className={styles.toPill}>{e}</span>
                                                ))}
                                                {toRecipients.length === 0 && !customTo && (
                                                    <span className={styles.emptyMetaNotice}>No TO recipient selected</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className={styles.metaRow}>
                                            <span className={styles.metaLabel}>CC:</span>
                                            <div className={styles.metaPills}>
                                                {ccRecipients.map(r => (
                                                    <span key={r.id} className={styles.ccPill}>{r.name} &lt;{r.email}&gt;</span>
                                                ))}
                                                {customCc && customCc.split(/[,;\s]+/).filter(e => e.includes('@')).map((e, idx) => (
                                                    <span key={idx} className={styles.ccPill}>{e}</span>
                                                ))}
                                                <span className={styles.autoCcNotice}>+ Auto-CC: Support team</span>
                                            </div>
                                        </div>
                                        <div className={styles.metaRow}>
                                            <span className={styles.metaLabel}>Subject:</span>
                                            <span className={styles.subjectValue}>
                                                {isUrgent && <span className={styles.urgentBadge}>🚨 URGENT</span>}
                                                {subject || 'No subject'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className={styles.emailBodyCanvas}>
                                        <div dangerouslySetInnerHTML={{ __html: htmlBody }} />
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.tableScroll}>
                                    <table className={styles.previewTable}>
                                        <thead>
                                            <tr>
                                                <th>Document / Carrier</th>
                                                <th style={{ textAlign: 'center' }}>Status</th>
                                                <th>Type / Premium</th>
                                                <th>Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {docItems.map((item, i) => (
                                                <tr key={i}>
                                                    <td className={styles.docName}>{item.name}</td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {(item.statusType === 'available' || item.statusType === 'quoted') && (
                                                            <span className={`${styles.statusBadge} ${styles.available}`}>{item.status}</span>
                                                        )}
                                                        {item.statusType === 'needs_uw' && (
                                                            <span className={`${styles.statusBadge} ${styles.needsUw}`}>{item.status}</span>
                                                        )}
                                                        {item.statusType === 'declined' && (
                                                            <span className={`${styles.statusBadge} ${styles.declined}`}>{item.status}</span>
                                                        )}
                                                        {item.statusType === 'not_quoted' && (
                                                            <span className={`${styles.statusBadge} ${styles.notQuoted}`}>{item.status}</span>
                                                        )}
                                                        {item.statusType === 'missing' && (
                                                            <span className={`${styles.statusBadge} ${styles.missing}`}>{item.status}</span>
                                                        )}
                                                    </td>
                                                    {item.name === 'Title Pro Report' ? (
                                                        <td colSpan={2} className={styles.docDetails} style={{ color: '#1e293b' }}>{item.details}</td>
                                                    ) : (
                                                        <>
                                                            <td className={styles.docPremium}>{item.premium}</td>
                                                            <td className={styles.docDetails}>{item.details}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error / Success Notifications */}
                    {error && (
                        <div className={styles.errorBanner}>
                            <AlertTriangle size={15} />
                            <span>{error}</span>
                        </div>
                    )}
                    {successMsg && (
                        <div className={styles.successBanner}>
                            <CheckCircle2 size={15} />
                            <span>{successMsg}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={styles.modalFooter}>
                    <div className={styles.footerLeft}>
                        {activeModalTab === 'compose' ? (
                            <button
                                type="button"
                                className={styles.togglePreviewBtn}
                                onClick={() => setActiveModalTab('preview')}
                            >
                                <Eye size={14} />
                                <span>Preview Email (WYSIWYG)</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                className={styles.togglePreviewBtn}
                                onClick={() => setActiveModalTab('compose')}
                            >
                                <Edit3 size={14} />
                                <span>Back to Edit Details</span>
                            </button>
                        )}
                    </div>
                    <div className={styles.footerRight}>
                        <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={sending}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className={styles.sendBtn}
                            onClick={handleInitiateSend}
                            disabled={sending || (totalToCount === 0 && ccRecipients.length === 0 && !customCc.trim())}
                        >
                            {sending ? (
                                <>
                                    <Loader2 size={15} className="animate-spin" />
                                    <span>Sending...</span>
                                </>
                            ) : (
                                <>
                                    <Send size={15} />
                                    <span>
                                        Send Mail ({totalToCount} TO{ccRecipients.length > 0 ? `, ${ccRecipients.length} CC` : ''} &bull; {selectedAttachmentIds.length} Attached)
                                    </span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Pre-Send Confirmation Checkpoint Modal ── */}
            {showConfirmModal && (
                <div className={styles.confirmOverlay} onClick={() => setShowConfirmModal(false)}>
                    <div className={styles.confirmModal} onClick={e => e.stopPropagation()}>
                        <div className={styles.confirmHeader}>
                            <div className={styles.confirmHeaderIcon}>
                                {confirmWarnings.length > 0 ? (
                                    <AlertTriangle size={22} color="#dc2626" />
                                ) : (
                                    <ShieldCheck size={22} color="#16a34a" />
                                )}
                            </div>
                            <div className={styles.confirmHeaderTexts}>
                                <h4 className={styles.confirmTitle}>Are you sure you want to send this email?</h4>
                                <p className={styles.confirmSubtitle}>
                                    {confirmWarnings.length > 0
                                        ? `Please review the guardrail checklist and email preview below before sending for CFP ${term.policy_number?.replace(/^CFP\s*/i, '')}:`
                                        : `Review the email preview below before sending for CFP ${term.policy_number?.replace(/^CFP\s*/i, '')}:`}
                                </p>
                            </div>
                            <button
                                type="button"
                                className={styles.confirmCloseBtn}
                                onClick={() => setShowConfirmModal(false)}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className={styles.confirmBody}>
                            {/* Guardrail Checklist / Warnings */}
                            {confirmWarnings.length > 0 ? (
                                <div className={styles.warningList}>
                                    <div className={styles.guardrailHeaderLabel}>
                                        <AlertCircle size={14} />
                                        <span>Guardrail Alerts &bull; Incomplete or Missing Items ({confirmWarnings.length})</span>
                                    </div>
                                    {confirmWarnings.map(w => (
                                        <div
                                            key={w.id}
                                            className={`${styles.warningItem} ${w.severity === 'warning' ? styles.warningSevere : styles.warningInfo}`}
                                        >
                                            <div className={styles.warningItemIcon}>
                                                {w.severity === 'warning' ? (
                                                    <AlertCircle size={17} />
                                                ) : (
                                                    <Info size={17} />
                                                )}
                                            </div>
                                            <div className={styles.warningItemContent}>
                                                <strong className={styles.warningItemLabel}>{w.label}</strong>
                                                <span className={styles.warningItemDesc}>{w.desc}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={styles.allClearedBanner}>
                                    <CheckCircle2 size={18} />
                                    <span>All Guardrails Cleared &bull; Quotes, amounts, Title Pro &amp; attachments are ready!</span>
                                </div>
                            )}

                            {/* Live WYSIWYG Email Preview Checkpoint Container */}
                            <div className={styles.confirmEmailPreviewContainer}>
                                <div className={styles.confirmEmailPreviewHeader}>
                                    <span className={styles.confirmEmailPreviewTitle}>
                                        <Eye size={13} /> Live WYSIWYG Email Preview
                                    </span>
                                    <span className={styles.confirmEmailPreviewBadge}>● Live Output</span>
                                </div>

                                <div className={styles.confirmEmailMock}>
                                    <div className={styles.confirmEmailMetaBar}>
                                        <div className={styles.confirmMetaRow}>
                                            <span className={styles.confirmMetaLabel}>From:</span>
                                            <span className={styles.confirmMetaVal}>
                                                <strong>{currentUserName || 'Coverage Check Team'}</strong> &lt;admin@coveragechecknow.com&gt;
                                            </span>
                                        </div>
                                        <div className={styles.confirmMetaRow}>
                                            <span className={styles.confirmMetaLabel}>To:</span>
                                            <div className={styles.confirmMetaPills}>
                                                {toRecipients.map(r => (
                                                    <span key={r.id} className={styles.toPill}>{r.name} &lt;{r.email}&gt;</span>
                                                ))}
                                                {customTo && customTo.split(/[,;\s]+/).filter(e => e.includes('@')).map((e, idx) => (
                                                    <span key={idx} className={styles.toPill}>{e}</span>
                                                ))}
                                            </div>
                                        </div>
                                        {ccRecipients.length > 0 && (
                                            <div className={styles.confirmMetaRow}>
                                                <span className={styles.confirmMetaLabel}>CC:</span>
                                                <div className={styles.confirmMetaPills}>
                                                    {ccRecipients.map(r => (
                                                        <span key={r.id} className={styles.ccPill}>{r.name} &lt;{r.email}&gt;</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className={styles.confirmMetaRow}>
                                            <span className={styles.confirmMetaLabel}>Subject:</span>
                                            <span className={styles.confirmSubjectVal}>
                                                {isUrgent && <span className={styles.urgentBadge}>🚨 URGENT</span>}
                                                {subject || 'No subject'}
                                            </span>
                                        </div>
                                        <div className={styles.confirmMetaRow}>
                                            <span className={styles.confirmMetaLabel}>Files:</span>
                                            <span className={styles.confirmFilesVal}>
                                                {selectedAttachmentIds.length > 0
                                                    ? `${selectedAttachmentIds.length} PDF(s) attached (${availableAttachments.filter(a => selectedAttachmentIds.includes(a.id)).map(a => a.badge).join(', ')})`
                                                    : 'No PDFs attached (Status summary only)'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className={styles.confirmEmailCanvas}>
                                        <div dangerouslySetInnerHTML={{ __html: htmlBody }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.confirmFooter}>
                            <button
                                type="button"
                                className={styles.confirmBackBtn}
                                onClick={() => setShowConfirmModal(false)}
                                disabled={sending}
                            >
                                Cancel &amp; Edit Details
                            </button>
                            <button
                                type="button"
                                className={styles.confirmSendAnywayBtn}
                                onClick={() => {
                                    setShowConfirmModal(false);
                                    handleSend();
                                }}
                                disabled={sending}
                            >
                                {sending ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        <span>Sending...</span>
                                    </>
                                ) : (
                                    <>
                                        <Send size={14} />
                                        <span>Yes, Send Email Now</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
