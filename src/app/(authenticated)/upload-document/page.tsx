'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Loader2,
    CheckCircle,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    ArrowLeft,
    FileUp,
    ExternalLink,
    Clock,
    User,
    MapPin,
    Shield,
    FileText,
    Zap,
    ChevronRight,
    Copy,
    Search,
    RefreshCw,
    UserPlus,
    Trash2,
    X,
    Plus,
    Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/Button/Button';
import Link from 'next/link';

/* ── Constants ──────────────────────────────────────────────────────── */

const DOC_TYPES = [
    {
        key: 'dec_page',
        label: 'Dec Page',
        fullLabel: 'Declaration Page (Batch up to 20)',
        description: 'FAIR Plan declaration pages — batch up to 20 files with full enrichment',
        color: '#6366f1',
        icon: '📋',
    },
    {
        key: 'rce',
        label: 'RCE',
        fullLabel: 'Replacement Cost Estimator',
        description: 'Replacement cost valuation PDFs (360Value, American Modern, RCT Express)',
        color: '#10b981',
        icon: '📊',
    },
    {
        key: 'dic_dec_page',
        label: 'DIC Dec Page',
        fullLabel: 'DIC Carrier Declaration Page',
        description: 'Declaration pages from PSIC, Bamboo, Aegis, or other DIC carriers',
        color: '#f97316',
        icon: '📄',
    },
    {
        key: 'other',
        label: 'Other',
        fullLabel: 'All Other File Types (E&S, Quotes, Endorsements)',
        description: 'Auto-classifies E&S quotes/policies, endorsements, or other file types',
        color: '#8b5cf6',
        icon: '📁',
    },
] as const;

type DocTypeKey = typeof DOC_TYPES[number]['key'];

const PIPELINE_STEPS = [
    { key: 'queued', label: 'Queued', description: 'Waiting for worker to pick up' },
    { key: 'extracting_text', label: 'Extracting Text', description: 'Reading PDF content with OCR fallback' },
    { key: 'parsing_fields', label: 'Parsing Fields', description: 'AI-powered field extraction' },
    { key: 'matching_policy', label: 'Matching Policy', description: 'Finding matching policy by owner & address' },
    { key: 'saving_data', label: 'Saving Data', description: 'Persisting extracted data' },
    { key: 'writing_policy_data', label: 'Updating Policy', description: 'Writing enrichments to policy records' },
    { key: 'complete', label: 'Complete', description: 'Processing finished' },
] as const;

const DEC_PIPELINE = [
    { key: 'extracting_text', label: 'Extracting Text', desc: 'Reading PDF content with OCR fallback' },
    { key: 'parsing_fields', label: 'Parsing Fields', desc: 'AI-powered field extraction' },
    { key: 'creating_records', label: 'Creating Records', desc: 'Creating client and policy records' },
    { key: 'enriching_property', label: 'Enriching Property', desc: 'ATTOM, satellite imagery, and AI analysis' },
    { key: 'evaluating_flags', label: 'Evaluating Flags', desc: 'Running flag evaluation rules' },
    { key: 'generating_report', label: 'Generating Report', desc: 'Creating AI coverage report' },
    { key: 'complete', label: 'Complete', desc: 'Processing finished' },
] as const;

/* ── Types ──────────────────────────────────────────────────────────── */

interface DocumentStatus {
    id: string;
    doc_type: string;
    file_name: string;
    parse_status: string;
    processing_step: string;
    match_status: string;
    match_confidence: number | null;
    match_log: Array<{ step: string; result: string; candidates?: number; reason?: string; details?: Record<string, any> }> | null;
    error_message: string | null;
    policy_id: string | null;
    client_id: string | null;
    policy_term_id: string | null;
    extracted_owner_name: string | null;
    extracted_address: string | null;
    writeback_status: string | null;
    writeback_log: Array<{ field?: string; target?: string; action: string; old_value?: string; new_value?: string; existing_value?: string; value?: string }> | null;
    created_at: string;
    updated_at: string;
    policies: { id: string; policy_number: string; carrier_name: string; property_address_raw?: string; client_id?: string; clients?: { id: string; named_insured: string } | null } | null;
    clients: { id: string; named_insured: string } | null;
    status_message: string;
    action_required: string | null;
}

export type QueueItemStatus =
    | 'queued'
    | 'classifying'
    | 'uploading'
    | 'polling'
    | 'complete'
    | 'needs_review'
    | 'duplicate'
    | 'failed';

export interface QueueItem {
    id: string;
    file: File;
    fileName: string;
    fileSize: number;
    status: QueueItemStatus;
    detectedType: DocTypeKey | null;
    uploadProgress: number;
    currentStep: string | null;
    statusMessage?: string | null;
    errorMessage?: string | null;

    // Platform doc specific
    documentId?: string | null;
    docStatus?: DocumentStatus | null;
    isDuplicate?: boolean;

    // Dec page specific
    submissionId?: string | null;
    decPageStatus?: 'uploading' | 'queued' | 'processing' | 'parsed' | 'failed' | null;
    decPageStep?: string | null;

    // Result metadata
    policyId?: string | null;
    policyNumber?: string | null;
    carrierName?: string | null;
    clientName?: string | null;
    insuredName?: string | null;
    clientId?: string | null;
    propertyAddress?: string | null;
    matchConfidence?: number | null;

    // Timing
    startTime: number;
    elapsedSeconds: number;
    completedAt?: number;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
}

/* ── Main component ─────────────────────────────────────────────────── */

export default function UploadDocumentPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Queue state
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounterRef = useRef(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Active review drawer/modal for a specific queue item needing manual assignment
    const [reviewingItemId, setReviewingItemId] = useState<string | null>(null);

    // Manual Assign State for reviewing item
    const [isAssigning, setIsAssigning] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [autoRecommendations, setAutoRecommendations] = useState<any[]>([]);
    const [autoSearchDone, setAutoSearchDone] = useState(false);
    const autoSearchRanRef = useRef<Record<string, boolean>>({});
    const [isCreatingClient, setIsCreatingClient] = useState(false);

    // Reassign mode state
    const [isReassignMode, setIsReassignMode] = useState(false);
    const [reassignDocInfo, setReassignDocInfo] = useState<{
        id: string;
        file_name: string;
        doc_type: string;
        policy_number?: string;
        insured_name?: string;
        property_address?: string;
        policy_id?: string;
        client_id?: string;
    } | null>(null);
    const reassignInitRef = useRef(false);
    const [reassignCandidates, setReassignCandidates] = useState<any[]>([]);
    const [reassignAutoSearchDone, setReassignAutoSearchDone] = useState(false);
    const reassignAutoSearchRef = useRef(false);
    const [isKeepingPolicy, setIsKeepingPolicy] = useState(false);

    // ── Reassign mode: load document info from ?reassign=DOC_ID ──
    useEffect(() => {
        const reassignId = searchParams.get('reassign');
        if (!reassignId || reassignInitRef.current) return;
        reassignInitRef.current = true;

        setIsReassignMode(true);

        (async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const urlPolicyId = searchParams.get('policy_id') || searchParams.get('policyId');

                // Fetch the document with its policy/client info
                const { data: doc } = await supabase
                    .from('platform_documents')
                    .select(`
                        id, file_name, doc_type, policy_id, client_id,
                        extracted_owner_name, extracted_address,
                        policies (id, policy_number, property_address_raw, carrier_name,
                            clients (id, named_insured)
                        )
                    `)
                    .eq('id', reassignId)
                    .maybeSingle();

                if (doc) {
                    const policy = Array.isArray(doc.policies) ? doc.policies[0] : (doc.policies as any);
                    const client = Array.isArray(policy?.clients) ? policy?.clients[0] : (policy?.clients as any);
                    setReassignDocInfo({
                        id: doc.id,
                        file_name: doc.file_name || 'Unknown file',
                        doc_type: doc.doc_type || 'rce',
                        policy_number: policy?.policy_number,
                        insured_name: client?.named_insured || doc.extracted_owner_name,
                        property_address: policy?.property_address_raw || doc.extracted_address,
                        policy_id: doc.policy_id || urlPolicyId || undefined,
                        client_id: doc.client_id,
                    });
                } else {
                    // Try dec_pages table fallback
                    const { data: decDoc } = await supabase
                        .from('dec_pages')
                        .select(`
                            id, policy_number, insured_name, property_location, policy_id, client_id,
                            policies (id, policy_number, property_address_raw, carrier_name,
                                clients (id, named_insured)
                            ),
                            dec_page_submissions (file_name)
                        `)
                        .eq('id', reassignId)
                        .maybeSingle();
                    if (decDoc) {
                        const policy = Array.isArray(decDoc.policies) ? decDoc.policies[0] : (decDoc.policies as any);
                        const client = Array.isArray(policy?.clients) ? policy?.clients[0] : (policy?.clients as any);
                        const sub = Array.isArray(decDoc.dec_page_submissions) ? decDoc.dec_page_submissions[0] : decDoc.dec_page_submissions;
                        setReassignDocInfo({
                            id: decDoc.id,
                            file_name: sub?.file_name || 'Declaration Page.pdf',
                            doc_type: 'dec_page',
                            policy_number: policy?.policy_number || decDoc.policy_number,
                            insured_name: client?.named_insured || decDoc.insured_name,
                            property_address: policy?.property_address_raw || decDoc.property_location,
                            policy_id: decDoc.policy_id || urlPolicyId || undefined,
                            client_id: decDoc.client_id,
                        });
                    }
                }
            } catch {
                setUploadError('Failed to load document for reassignment.');
            }
        })();
    }, [searchParams]);

    // ── Reassign mode: auto-search for candidate policies by insured name ──
    useEffect(() => {
        if (!reassignDocInfo || reassignAutoSearchRef.current) return;
        reassignAutoSearchRef.current = true;

        const insuredName = reassignDocInfo.insured_name;
        if (!insuredName) {
            setReassignAutoSearchDone(true);
            return;
        }

        (async () => {
            try {
                const stopWords = new Set(['trust', 'family', 'the', 'and', 'of', 'for', 'inc', 'llc', 'ltd']);
                const terms = insuredName
                    .replace(/[^a-zA-Z\s-]/g, '')
                    .split(/\s+/)
                    .filter(w => w.length >= 3 && !stopWords.has(w.toLowerCase()))
                    .slice(0, 3);

                const allResults: any[] = [];
                const seenIds = new Set<string>();
                const currentPolicyId = reassignDocInfo.policy_id;

                for (const term of terms) {
                    const { data } = await supabase
                        .from('policies')
                        .select(`id, policy_number, property_address_raw, carrier_name, client_id, clients!inner (id, named_insured)`)
                        .ilike('clients.named_insured', `%${term}%`)
                        .limit(8);
                    if (data) {
                        for (const row of data) {
                            if (!seenIds.has(row.id) && row.id !== currentPolicyId) {
                                seenIds.add(row.id);
                                allResults.push(row);
                            }
                        }
                    }
                }
                setReassignCandidates(allResults.slice(0, 8));
            } catch {
                // Best effort
            }
            setReassignAutoSearchDone(true);
        })();
    }, [reassignDocInfo]);

    // ── Timer updater for in-progress queue items ──
    useEffect(() => {
        const timer = setInterval(() => {
            setQueue(prev =>
                prev.map(item => {
                    if (['complete', 'duplicate', 'failed'].includes(item.status)) return item;
                    const elapsed = Math.floor((Date.now() - item.startTime) / 1000);
                    return { ...item, elapsedSeconds: elapsed };
                })
            );
        }, 500);
        return () => clearInterval(timer);
    }, []);

    // ── Concurrency Controller (Active background processing) ──
    const activeProcessingRef = useRef<Set<string>>(new Set());

    const updateItem = useCallback((id: string, updates: Partial<QueueItem>) => {
        setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    }, []);

    const processQueueItem = useCallback(async (item: QueueItem) => {
        const itemId = item.id;
        if (activeProcessingRef.current.has(itemId)) return;
        activeProcessingRef.current.add(itemId);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                updateItem(itemId, { status: 'failed', errorMessage: 'Session expired. Please log in again.' });
                activeProcessingRef.current.delete(itemId);
                return;
            }

            // Step 1: Classify document
            updateItem(itemId, { status: 'classifying', currentStep: 'Classifying document...' });

            let classifiedType: DocTypeKey = 'other';
            try {
                const classifyForm = new FormData();
                classifyForm.set('file', item.file);
                const classifyRes = await fetch('/api/documents/classify', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}` },
                    body: classifyForm,
                });
                if (classifyRes.ok) {
                    const classifyJson = await classifyRes.json();
                    if (classifyJson.detectedType) {
                        classifiedType = classifyJson.detectedType as DocTypeKey;
                    }
                }
            } catch {
                classifiedType = 'other';
            }

            updateItem(itemId, { detectedType: classifiedType });

            // Step 2: Route to Dec Page Engine or Platform Docs Engine
            if (classifiedType === 'dec_page') {
                // ── Dec Page Pipeline ──
                updateItem(itemId, { status: 'uploading', currentStep: 'Uploading Dec Page...', uploadProgress: 10 });

                const formData = new FormData();
                formData.set('file', item.file);

                const uploadResult = await new Promise<{ ok: boolean; data: any }>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.upload.addEventListener('progress', (event) => {
                        if (event.lengthComputable) {
                            const pct = Math.round((event.loaded / event.total) * 90);
                            updateItem(itemId, { uploadProgress: Math.max(10, pct) });
                        }
                    });
                    xhr.addEventListener('load', () => {
                        try {
                            const json = JSON.parse(xhr.responseText);
                            resolve({ ok: xhr.status >= 200 && xhr.status < 300, data: json });
                        } catch {
                            reject(new Error(`Server returned an invalid response (HTTP ${xhr.status})`));
                        }
                    });
                    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
                    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
                    xhr.addEventListener('timeout', () => reject(new Error('Upload timed out.')));
                    xhr.timeout = 90000;
                    xhr.open('POST', '/api/upload');
                    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
                    xhr.send(formData);
                });

                if (!uploadResult.ok || !uploadResult.data?.success) {
                    updateItem(itemId, {
                        status: 'failed',
                        errorMessage: uploadResult.data?.message || 'Upload failed.',
                    });
                    activeProcessingRef.current.delete(itemId);
                    return;
                }

                const submissionId = uploadResult.data?.data?.submissionId as string;
                if (!submissionId) {
                    updateItem(itemId, { status: 'failed', errorMessage: 'No submission ID returned.' });
                    activeProcessingRef.current.delete(itemId);
                    return;
                }

                updateItem(itemId, {
                    status: 'polling',
                    submissionId,
                    uploadProgress: 100,
                    decPageStatus: 'queued',
                    currentStep: 'Queued for processing',
                });

                // Poll /api/upload/status until parsed or failed
                const pollInterval = setInterval(async () => {
                    try {
                        const { data: { session: currentSession } } = await supabase.auth.getSession();
                        if (!currentSession?.access_token) return;

                        const res = await fetch(`/api/upload/status?ids=${submissionId}`, {
                            headers: { 'Authorization': `Bearer ${currentSession.access_token}` },
                        });
                        if (!res.ok) return;

                        const json = await res.json();
                        if (!json.success || !json.data?.[0]) return;

                        const doc = json.data[0];
                        const status = doc.status;
                        const step = doc.processing_step;
                        const policyId = doc.policy_id;
                        const clientId = doc.client_id;
                        const policyNum = doc.policy_number;
                        const insured = doc.insured_name;

                        let stepLabel = 'Processing...';
                        if (step) {
                            const matchedStep = DEC_PIPELINE.find(s => s.key === step);
                            stepLabel = matchedStep ? matchedStep.label : step;
                        }

                        if (status === 'parsed') {
                            clearInterval(pollInterval);
                            activeProcessingRef.current.delete(itemId);
                            updateItem(itemId, {
                                status: 'complete',
                                decPageStatus: 'parsed',
                                decPageStep: step,
                                currentStep: 'Completed',
                                policyId,
                                clientId,
                                policyNumber: policyNum,
                                clientName: insured,
                                insuredName: insured,
                                completedAt: Date.now(),
                            });
                            window.dispatchEvent(new CustomEvent('decPageParsed'));
                        } else if (status === 'failed') {
                            clearInterval(pollInterval);
                            activeProcessingRef.current.delete(itemId);
                            updateItem(itemId, {
                                status: 'failed',
                                decPageStatus: 'failed',
                                decPageStep: step,
                                errorMessage: doc.error_message || 'Processing failed.',
                            });
                        } else {
                            updateItem(itemId, {
                                decPageStatus: status,
                                decPageStep: step,
                                currentStep: stepLabel,
                                policyId: policyId || undefined,
                                clientId: clientId || undefined,
                                policyNumber: policyNum || undefined,
                                clientName: insured || undefined,
                                insuredName: insured || undefined,
                            });
                        }
                    } catch {
                        // Swallow temporary network glitch during poll
                    }
                }, 3000);

            } else {
                // ── Platform Documents Pipeline ──
                updateItem(itemId, { status: 'uploading', currentStep: 'Uploading document...', uploadProgress: 50 });

                const formData = new FormData();
                formData.set('file', item.file);
                formData.set('doc_type', classifiedType);

                const res = await fetch('/api/documents/upload', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}` },
                    body: formData,
                });

                const json = await res.json();

                if (res.status === 409) {
                    // Duplicate found
                    const existingId = json.data?.existingDocumentId;
                    if (existingId) {
                        const statusRes = await fetch(`/api/documents/upload/status?ids=${existingId}`, {
                            headers: { 'Authorization': `Bearer ${session.access_token}` },
                        });
                        const statusJson = await statusRes.json();
                        const existingDoc = statusJson.documents?.[0] as DocumentStatus | undefined;
                        updateItem(itemId, {
                            status: 'duplicate',
                            documentId: existingId,
                            docStatus: existingDoc,
                            isDuplicate: true,
                            policyId: existingDoc?.policy_id || undefined,
                            policyNumber: existingDoc?.policies?.policy_number || undefined,
                            clientName: existingDoc?.clients?.named_insured || existingDoc?.extracted_owner_name || undefined,
                            currentStep: 'Duplicate — already uploaded',
                            completedAt: Date.now(),
                        });
                    } else {
                        updateItem(itemId, {
                            status: 'duplicate',
                            isDuplicate: true,
                            currentStep: 'Duplicate — already uploaded',
                            completedAt: Date.now(),
                        });
                    }
                    activeProcessingRef.current.delete(itemId);
                    return;
                }

                if (!res.ok || !json.success || !json.data?.documentId) {
                    updateItem(itemId, {
                        status: 'failed',
                        errorMessage: json.message || 'Upload failed.',
                    });
                    activeProcessingRef.current.delete(itemId);
                    return;
                }

                const docId = json.data.documentId as string;
                updateItem(itemId, {
                    status: 'polling',
                    documentId: docId,
                    uploadProgress: 100,
                    currentStep: 'Queued for parsing',
                });

                // Poll /api/documents/upload/status
                const pollInterval = setInterval(async () => {
                    try {
                        const { data: { session: currentSession } } = await supabase.auth.getSession();
                        if (!currentSession?.access_token) return;

                        const pollRes = await fetch(`/api/documents/upload/status?ids=${docId}`, {
                            headers: { 'Authorization': `Bearer ${currentSession.access_token}` },
                        });
                        if (!pollRes.ok) return;

                        const pollJson = await pollRes.json();
                        const doc = pollJson.documents?.[0] as DocumentStatus | undefined;
                        if (!doc) return;

                        const isParsed = doc.parse_status === 'parsed' && doc.match_status === 'matched';
                        const isReview = doc.parse_status === 'needs_review' || doc.match_status === 'needs_review' || doc.match_status === 'no_match';
                        const isFailed = doc.parse_status === 'failed';

                        let stepLabel = doc.processing_step || 'Processing...';
                        const matchedStep = PIPELINE_STEPS.find(s => s.key === doc.processing_step);
                        if (matchedStep) stepLabel = matchedStep.label;

                        if (isParsed) {
                            clearInterval(pollInterval);
                            activeProcessingRef.current.delete(itemId);
                            updateItem(itemId, {
                                status: 'complete',
                                docStatus: doc,
                                currentStep: 'Completed',
                                policyId: doc.policy_id,
                                policyNumber: doc.policies?.policy_number,
                                carrierName: doc.policies?.carrier_name,
                                clientName: doc.clients?.named_insured || doc.extracted_owner_name,
                                clientId: doc.client_id || doc.policies?.client_id,
                                propertyAddress: doc.extracted_address || doc.policies?.property_address_raw,
                                matchConfidence: doc.match_confidence,
                                completedAt: Date.now(),
                            });
                        } else if (isReview) {
                            clearInterval(pollInterval);
                            activeProcessingRef.current.delete(itemId);
                            updateItem(itemId, {
                                status: 'needs_review',
                                docStatus: doc,
                                currentStep: 'Needs Review',
                                policyId: doc.policy_id,
                                policyNumber: doc.policies?.policy_number,
                                carrierName: doc.policies?.carrier_name,
                                clientName: doc.clients?.named_insured || doc.extracted_owner_name,
                                clientId: doc.client_id || doc.policies?.client_id,
                                propertyAddress: doc.extracted_address || doc.policies?.property_address_raw,
                                matchConfidence: doc.match_confidence,
                                statusMessage: doc.status_message,
                            });
                        } else if (isFailed) {
                            clearInterval(pollInterval);
                            activeProcessingRef.current.delete(itemId);
                            updateItem(itemId, {
                                status: 'failed',
                                docStatus: doc,
                                currentStep: 'Failed',
                                errorMessage: doc.error_message || doc.status_message || 'Processing failed.',
                            });
                        } else {
                            updateItem(itemId, {
                                docStatus: doc,
                                currentStep: stepLabel,
                                policyId: doc.policy_id || undefined,
                                policyNumber: doc.policies?.policy_number || undefined,
                                carrierName: doc.policies?.carrier_name || undefined,
                                clientName: doc.clients?.named_insured || doc.extracted_owner_name || undefined,
                                propertyAddress: doc.extracted_address || doc.policies?.property_address_raw || undefined,
                            });
                        }
                    } catch {
                        // Ignore periodic polling error
                    }
                }, 2000);
            }
        } catch (err: any) {
            updateItem(itemId, {
                status: 'failed',
                errorMessage: err.message || 'Network error during upload.',
            });
            activeProcessingRef.current.delete(itemId);
        }
    }, [updateItem]);

    // Loop through queued items with concurrency limit = 3
    useEffect(() => {
        const MAX_CONCURRENT = 3;
        const activeCount = activeProcessingRef.current.size;
        if (activeCount >= MAX_CONCURRENT) return;

        const queuedItems = queue.filter(item => item.status === 'queued' && !activeProcessingRef.current.has(item.id));
        const toStart = queuedItems.slice(0, MAX_CONCURRENT - activeCount);

        for (const item of toStart) {
            processQueueItem(item);
        }
    }, [queue, processQueueItem]);

    // ── Handle adding files into queue ──
    const handleAddFiles = useCallback((files: FileList | File[]) => {
        setUploadError(null);
        const fileArray = Array.from(files);
        if (fileArray.length === 0) return;

        // Dec page batch limit is 20 files
        let validFiles = fileArray.filter(file => {
            const ext = '.' + file.name.split('.').pop()?.toLowerCase();
            return ext === '.pdf' && file.size > 0 && file.size <= 10 * 1024 * 1024;
        });

        if (fileArray.length > 20) {
            setUploadError(`Batch limit is 20 files per upload. Queuing the first 20 valid PDF files.`);
            validFiles = validFiles.slice(0, 20);
        } else if (validFiles.length < fileArray.length) {
            setUploadError('Some files were skipped because they are not valid PDFs or exceed 10MB.');
        }

        if (validFiles.length === 0) return;

        const newItems: QueueItem[] = validFiles.map((file, idx) => ({
            id: `${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
            file,
            fileName: file.name,
            fileSize: file.size,
            status: 'queued',
            detectedType: null,
            uploadProgress: 0,
            currentStep: 'Waiting in queue...',
            startTime: Date.now(),
            elapsedSeconds: 0,
        }));

        setQueue(prev => [...prev, ...newItems]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current++; setIsDragOver(true); };
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current--; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDragOver(false); } };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = 0;
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleAddFiles(e.dataTransfer.files);
        }
    };
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleAddFiles(e.target.files);
        }
    };

    const clearCompleted = () => {
        setQueue(prev => prev.filter(item => item.status !== 'complete' && item.status !== 'duplicate'));
    };

    const retryItem = (item: QueueItem) => {
        activeProcessingRef.current.delete(item.id);
        updateItem(item.id, {
            status: 'queued',
            errorMessage: null,
            uploadProgress: 0,
            currentStep: 'Waiting in queue...',
            startTime: Date.now(),
            elapsedSeconds: 0,
        });
    };

    const removeItem = (id: string) => {
        activeProcessingRef.current.delete(id);
        setQueue(prev => prev.filter(item => item.id !== id));
        if (reviewingItemId === id) setReviewingItemId(null);
    };

    // ── Review & Manual Assign handlers ──
    const activeReviewItem = useMemo(() => {
        return queue.find(q => q.id === reviewingItemId) || null;
    }, [queue, reviewingItemId]);

    // Auto-search recommendations when review drawer is opened
    useEffect(() => {
        if (!activeReviewItem || !activeReviewItem.docStatus) return;
        const docId = activeReviewItem.docStatus.id;
        if (autoSearchRanRef.current[docId]) return;
        autoSearchRanRef.current[docId] = true;

        const candidateStep = activeReviewItem.docStatus.match_log?.find((l: any) => l.step === 'candidates');
        const backendCandidates = candidateStep?.details?.candidates as any[] | undefined;

        if (backendCandidates !== undefined && backendCandidates.length > 0) {
            const transformed = backendCandidates.map((c: any) => ({
                id: c.policy_id,
                policy_number: c.policy_number,
                property_address_raw: c.property_address_raw,
                carrier_name: c.carrier_name,
                client_id: c.client_id,
                clients: { id: c.client_id, named_insured: c.named_insured },
                _name_similarity: c.name_similarity,
                _address_similarity: c.address_similarity,
                _match_source: c.match_source,
            }));
            setAutoRecommendations(transformed);
            setAutoSearchDone(true);
            return;
        }

        (async () => {
            try {
                const searchTerms: string[] = [];
                const seen = new Set<string>();
                const addTerm = (t: string) => {
                    const clean = t.toLowerCase().trim();
                    if (clean.length >= 3 && !seen.has(clean)) { seen.add(clean); searchTerms.push(clean); }
                };
                const stopWords = new Set([
                    'dec', 'page', 'pdf', 'updated', 'new', 'bamboo', 'aegis', 'psic', 'dic', 'document', 'scan', 'copy', 'file',
                    'trust', 'family', 'dated', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'
                ]);

                if (activeReviewItem.docStatus?.file_name) {
                    const nameNoExt = activeReviewItem.docStatus.file_name.replace(/\.[^.]+$/, '');
                    for (const w of nameNoExt.replace(/[^a-zA-Z\s-]/g, ' ').split(/\s+/).filter(Boolean)) {
                        if (!stopWords.has(w.toLowerCase())) addTerm(w);
                    }
                }
                if (activeReviewItem.docStatus?.extracted_owner_name) {
                    for (const w of activeReviewItem.docStatus.extracted_owner_name.replace(/[^a-zA-Z\s-]/g, '').split(/\s+/).filter(Boolean)) {
                        if (!stopWords.has(w.toLowerCase())) addTerm(w);
                    }
                }

                const allResults: any[] = [];
                const seenIds = new Set<string>();
                for (const term of searchTerms.slice(0, 4)) {
                    const { data } = await supabase
                        .from('policies')
                        .select(`id, policy_number, property_address_raw, carrier_name, client_id, clients!inner (id, named_insured)`)
                        .ilike('clients.named_insured', `%${term}%`)
                        .limit(6);
                    if (data) {
                        for (const row of data) {
                            if (!seenIds.has(row.id)) { seenIds.add(row.id); allResults.push(row); }
                        }
                    }
                }
                setAutoRecommendations(allResults.slice(0, 8));
            } catch { /* best effort */ }
            setAutoSearchDone(true);
        })();
    }, [activeReviewItem]);

    const handleSearchPolicies = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const q = searchQuery.trim();
            const safe = q.replace(/[%_,().*+?^${}|\[\]\\]/g, '');
            if (safe.length < 2) { setIsSearching(false); return; }
            const [byPolicy, byClient] = await Promise.all([
                supabase
                    .from('policies')
                    .select(`id, policy_number, property_address_raw, carrier_name, client_id, clients (id, named_insured)`)
                    .or(`policy_number.ilike.%${safe}%,property_address_raw.ilike.%${safe}%`)
                    .limit(5),
                supabase
                    .from('policies')
                    .select(`id, policy_number, property_address_raw, carrier_name, client_id, clients!inner (id, named_insured)`)
                    .ilike('clients.named_insured', `%${safe}%`)
                    .limit(5),
            ]);

            const merged: any[] = [];
            const seenIds = new Set<string>();
            for (const row of [...(byClient.data || []), ...(byPolicy.data || [])]) {
                if (!seenIds.has(row.id)) {
                    seenIds.add(row.id);
                    merged.push(row);
                }
            }
            setSearchResults(merged.slice(0, 8));
        } catch {
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleAssign = async (policyId: string) => {
        const docId = activeReviewItem?.documentId || activeReviewItem?.docStatus?.id || reassignDocInfo?.id;
        if (!docId) return;
        setIsAssigning(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const endpoint = isReassignMode ? '/api/documents/reassign' : '/api/documents/assign';
            const body = isReassignMode
                ? { documentId: docId, newPolicyId: policyId }
                : { documentId: docId, policyId };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                if (activeReviewItem) {
                    updateItem(activeReviewItem.id, {
                        status: 'complete',
                        policyId,
                        currentStep: 'Assigned to Policy',
                        completedAt: Date.now(),
                    });
                    setReviewingItemId(null);
                }
                if (isReassignMode) {
                    window.location.href = `/policy/${policyId}`;
                }
            } else {
                setUploadError('Failed to assign document.');
            }
        } catch {
            setUploadError('Network error during assignment.');
        } finally {
            setIsAssigning(false);
        }
    };

    const handleCreateAndAssign = async () => {
        const doc = activeReviewItem?.docStatus;
        if (!doc) return;
        setIsCreatingClient(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const res = await fetch('/api/documents/create-and-assign', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    documentId: doc.id,
                    ownerName: doc.extracted_owner_name || 'Unknown Insured',
                    propertyAddress: doc.extracted_address || '',
                    carrierName: 'California FAIR Plan',
                    createPolicy: false,
                }),
            });
            if (res.ok) {
                const result = await res.json();
                if (result.success && result.clientId) {
                    router.push(`/client/${result.clientId}`);
                }
            }
        } catch {
            setUploadError('Failed to create client.');
        } finally {
            setIsCreatingClient(false);
        }
    };

    const handleKeepCurrentPolicy = useCallback(async () => {
        const policyId = reassignDocInfo?.policy_id;
        const docId = reassignDocInfo?.id;
        setIsKeepingPolicy(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && docId) {
                await supabase
                    .from('platform_documents')
                    .update({ match_status: 'manual', parse_status: 'parsed', error_message: null })
                    .eq('id', docId);

                await supabase
                    .from('dec_pages')
                    .update({ review_status: 'approved', needs_review: false })
                    .eq('id', docId);
            }
            if (policyId) window.location.href = `/policy/${policyId}`;
            else router.back();
        } catch {
            if (policyId) window.location.href = `/policy/${policyId}`;
            else router.back();
        }
    }, [reassignDocInfo, router]);

    // Queue summary stats
    const queueStats = useMemo(() => {
        const total = queue.length;
        const complete = queue.filter(q => q.status === 'complete' || q.status === 'duplicate').length;
        const processing = queue.filter(q => ['classifying', 'uploading', 'polling', 'queued'].includes(q.status)).length;
        const review = queue.filter(q => q.status === 'needs_review').length;
        const failed = queue.filter(q => q.status === 'failed').length;
        return { total, complete, processing, review, failed };
    }, [queue]);

    return (
        <main style={{ padding: '2rem', maxWidth: '52rem', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        type="button"
                        onClick={() => {
                            if (reassignDocInfo?.policy_id) {
                                window.location.href = `/policy/${reassignDocInfo.policy_id}`;
                            } else {
                                router.back();
                            }
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem' }}
                        title="Go back"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-high)', marginBottom: '0.15rem' }}>
                            {isReassignMode ? 'Reassign Document' : 'Upload Documents'}
                        </h1>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {isReassignMode
                                ? 'Move this document to a different policy. Old data will be cleaned up automatically.'
                                : 'Continuous upload & batch processing (up to 20 Dec Pages at once)'}
                        </p>
                    </div>
                </div>

                {!isReassignMode && queue.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {queueStats.complete > 0 && (
                            <Button size="sm" variant="ghost" onClick={clearCompleted} style={{ fontSize: '0.75rem' }}>
                                <Trash2 size={13} style={{ marginRight: 4 }} /> Clear Completed ({queueStats.complete})
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="primary"
                            onClick={() => fileInputRef.current?.click()}
                            style={{ fontSize: '0.75rem' }}
                        >
                            <Plus size={14} style={{ marginRight: 4 }} /> Add More Files
                        </Button>
                    </div>
                )}
            </div>

            {/* ── Reassign Context Banner (if reassign mode) ── */}
            {isReassignMode && reassignDocInfo && (
                <div style={{
                    background: '#f59e0b08',
                    border: '1px solid #f59e0b30',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.25rem 1.5rem',
                    marginBottom: '1.25rem',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <RefreshCw size={16} style={{ color: '#f59e0b' }} />
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f59e0b' }}>Reassigning Document</span>
                            <span style={{
                                fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem',
                                borderRadius: '0.25rem', backgroundColor: '#10b98120', color: '#10b981',
                                marginLeft: '0.25rem',
                            }}>
                                {reassignDocInfo.doc_type?.toUpperCase() || 'RCE'}
                            </span>
                        </div>
                        {reassignDocInfo.policy_id && (
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                onClick={handleKeepCurrentPolicy}
                                disabled={isKeepingPolicy}
                                style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 600 }}
                            >
                                {isKeepingPolicy ? (
                                    <>
                                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', marginRight: '0.4rem' }} />
                                        Confirming...
                                    </>
                                ) : (
                                    '✓ Keep Current Policy (Do Not Reassign)'
                                )}
                            </Button>
                        )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 1.5rem', fontSize: '0.78rem' }}>
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>File</span>
                            <div style={{ color: 'var(--text-high)', fontWeight: 600, marginTop: '0.15rem' }}>{reassignDocInfo.file_name}</div>
                        </div>
                        {reassignDocInfo.insured_name && (
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Currently Assigned To</span>
                                <div style={{ color: 'var(--text-high)', fontWeight: 600, marginTop: '0.15rem' }}>{reassignDocInfo.insured_name}</div>
                            </div>
                        )}
                        {reassignDocInfo.policy_number && (
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current Policy</span>
                                <div style={{ color: 'var(--text-high)', fontWeight: 600, marginTop: '0.15rem' }}>{reassignDocInfo.policy_number}</div>
                            </div>
                        )}
                        {reassignDocInfo.property_address && (
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Property Address</span>
                                <div style={{ color: 'var(--text-high)', fontWeight: 600, marginTop: '0.15rem' }}>{reassignDocInfo.property_address}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Normal Upload Experience ── */}
            {!isReassignMode && (
                <>
                    {/* Supported Document Types Cards */}
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <h2 style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                                Supported Formats
                            </h2>
                            <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                ⚡ Dec Pages support up to 20 files at once
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem' }}>
                            {DOC_TYPES.map(type => (
                                <div
                                    key={type.key}
                                    style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                                        padding: '0.75rem 0.5rem', borderRadius: '0.6rem',
                                        border: `1px solid ${type.color}20`,
                                        background: `${type.color}06`,
                                        textAlign: 'center',
                                    }}
                                >
                                    <span style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>{type.icon}</span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.03em', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', backgroundColor: `${type.color}18`, color: type.color, marginBottom: '0.25rem' }}>{type.label}</span>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{type.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Continuous Dropzone */}
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1.25rem' }}>
                        <div
                            onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: isDragOver ? `2px dashed var(--accent-primary)` : '2px dashed var(--border-default)',
                                borderRadius: '0.75rem', padding: queue.length > 0 ? '1.5rem 1rem' : '2.25rem 1.5rem', textAlign: 'center', cursor: 'pointer',
                                background: isDragOver ? `var(--accent-primary)08` : 'var(--bg-surface-raised)',
                                transition: 'all 0.2s',
                            }}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept=".pdf"
                                multiple
                                style={{ display: 'none' }}
                                onChange={handleFileChange}
                            />
                            <div style={{ pointerEvents: 'none' }}>
                                <FileUp size={queue.length > 0 ? 28 : 36} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                                <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-high)', margin: '0 0 0.25rem 0' }}>
                                    {isDragOver
                                        ? <span style={{ color: 'var(--accent-primary)' }}>Drop PDF files here</span>
                                        : <>Drop single or multiple PDFs here, or <span style={{ color: 'var(--accent-primary)' }}>browse files</span></>}
                                </p>
                                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                                    Batch up to 20 Dec Pages · Max 10MB per PDF · Upload more anytime while processing
                                </p>
                            </div>
                        </div>

                        {uploadError && (
                            <div style={{ marginTop: '0.75rem', padding: '0.65rem 0.85rem', borderRadius: '0.5rem', background: '#ef444410', border: '1px solid #ef444430', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <XCircle size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.78rem', color: '#ef4444' }}>{uploadError}</span>
                            </div>
                        )}
                    </div>

                    {/* Queue Header & Status Bar */}
                    {queue.length > 0 && (
                        <div style={{ marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-high)', margin: 0 }}>
                                        Upload Queue ({queue.length})
                                    </h3>
                                    {queueStats.processing > 0 && (
                                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6366f1', background: '#6366f115', padding: '0.15rem 0.5rem', borderRadius: '999px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                                            {queueStats.processing} processing
                                        </span>
                                    )}
                                    {queueStats.complete > 0 && (
                                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#10b981', background: '#10b98115', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                                            ✓ {queueStats.complete} done
                                        </span>
                                    )}
                                    {queueStats.review > 0 && (
                                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f59e0b', background: '#f59e0b15', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                                            ⚠ {queueStats.review} review needed
                                        </span>
                                    )}
                                    {queueStats.failed > 0 && (
                                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#ef4444', background: '#ef444415', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                                            ✕ {queueStats.failed} failed
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Queue Item Cards */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                {queue.map((item) => {
                                    const isComplete = item.status === 'complete';
                                    const isDuplicate = item.status === 'duplicate';
                                    const isFailed = item.status === 'failed';
                                    const isReview = item.status === 'needs_review';
                                    const isWorking = ['queued', 'classifying', 'uploading', 'polling'].includes(item.status);

                                    const typeInfo = DOC_TYPES.find(t => t.key === item.detectedType);

                                    return (
                                        <div
                                            key={item.id}
                                            style={{
                                                background: 'var(--bg-surface)',
                                                border: `1px solid ${isComplete ? '#10b98135' : isReview ? '#f59e0b35' : isFailed ? '#ef444435' : isDuplicate ? '#6366f135' : 'var(--border-default)'}`,
                                                borderRadius: 'var(--radius-md, 8px)',
                                                padding: '0.85rem 1.1rem',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.5rem',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                            }}
                                        >
                                            {/* Row 1: File name, type badge, status icon, timer, close */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                                                    <FileText size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-high)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.fileName}>
                                                        {item.fileName}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                                                        ({formatFileSize(item.fileSize)})
                                                    </span>
                                                    {typeInfo && (
                                                        <span style={{
                                                            fontSize: '0.65rem', fontWeight: 700, padding: '0.08rem 0.4rem',
                                                            borderRadius: '0.25rem', backgroundColor: `${typeInfo.color}18`, color: typeInfo.color,
                                                            flexShrink: 0,
                                                        }}>
                                                            {typeInfo.label}
                                                        </span>
                                                    )}
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        <Clock size={12} />
                                                        <span>{formatDuration(item.elapsedSeconds)}</span>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(item.id)}
                                                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.15rem' }}
                                                        title="Remove from queue"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Row 2: Status & Progress or Matched Policy Link */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem' }}>
                                                    {isWorking && (
                                                        <>
                                                            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-primary)' }} />
                                                            <span style={{ color: 'var(--text-mid)', fontWeight: 500 }}>{item.currentStep || 'Processing...'}</span>
                                                        </>
                                                    )}
                                                    {isComplete && (
                                                        <>
                                                            <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                                                            <span style={{ color: '#10b981', fontWeight: 600 }}>
                                                                {item.policyNumber ? `Matched to Policy ${item.policyNumber}` : 'Processed successfully'}
                                                            </span>
                                                            {item.clientName && (
                                                                <span style={{ color: 'var(--text-muted)' }}>• {item.clientName}</span>
                                                            )}
                                                        </>
                                                    )}
                                                    {isDuplicate && (
                                                        <>
                                                            <Copy size={14} style={{ color: '#6366f1' }} />
                                                            <span style={{ color: '#6366f1', fontWeight: 600 }}>Duplicate Document</span>
                                                            {item.policyNumber && (
                                                                <span style={{ color: 'var(--text-muted)' }}>• Policy {item.policyNumber}</span>
                                                            )}
                                                        </>
                                                    )}
                                                    {isReview && (
                                                        <>
                                                            <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
                                                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>Policy match needs review</span>
                                                        </>
                                                    )}
                                                    {isFailed && (
                                                        <>
                                                            <XCircle size={14} style={{ color: '#ef4444' }} />
                                                            <span style={{ color: '#ef4444', fontWeight: 500 }}>{item.errorMessage || 'Processing failed'}</span>
                                                        </>
                                                    )}
                                                </div>

                                                {/* Action buttons per queue item */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    {item.policyId && (
                                                        <Link href={`/policy/${item.policyId}`} style={{ textDecoration: 'none' }}>
                                                            <Button size="sm" variant="outline" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', height: 'auto' }}>
                                                                <Shield size={11} style={{ marginRight: 4 }} /> View Policy
                                                            </Button>
                                                        </Link>
                                                    )}

                                                    {isReview && (
                                                        <Button
                                                            size="sm"
                                                            variant="primary"
                                                            onClick={() => setReviewingItemId(item.id)}
                                                            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', height: 'auto', background: '#f59e0b', borderColor: '#f59e0b' }}
                                                        >
                                                            <Search size={11} style={{ marginRight: 4 }} /> Review / Assign
                                                        </Button>
                                                    )}

                                                    {isFailed && (
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            onClick={() => retryItem(item)}
                                                            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', height: 'auto' }}
                                                        >
                                                            <RefreshCw size={11} style={{ marginRight: 4 }} /> Retry
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Progress Bar (during uploading) */}
                                            {item.status === 'uploading' && (
                                                <div style={{ background: 'var(--bg-surface-raised)', borderRadius: '4px', height: '4px', overflow: 'hidden', width: '100%', marginTop: '0.15rem' }}>
                                                    <div style={{ height: '100%', width: `${item.uploadProgress}%`, background: 'var(--accent-primary)', transition: 'width 0.2s ease' }} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ═══════════════════════════════════════════════════════════
                 REVIEW / ASSIGN PANEL (for queue item or reassign mode)
                 ═══════════════════════════════════════════════════════════ */}
            {(isReassignMode || reviewingItemId) && (
                <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid #f59e0b30',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    marginTop: '1.5rem',
                    marginBottom: '1.25rem',
                }}>
                    <div style={{ padding: '1rem 1.25rem', background: '#f59e0b08', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-high)', margin: '0 0 0.2rem 0' }}>
                                {isReassignMode ? '🔄 Select New Policy' : '🔍 Review & Assign to Policy'}
                            </h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                                {activeReviewItem
                                    ? `Reviewing: ${activeReviewItem.fileName} (Extracted: ${activeReviewItem.docStatus?.extracted_owner_name || 'Unknown'})`
                                    : 'Search by client name, address, or policy number to assign.'}
                            </p>
                        </div>
                        {reviewingItemId && (
                            <button
                                type="button"
                                onClick={() => setReviewingItemId(null)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
                            >
                                <X size={18} />
                            </button>
                        )}
                    </div>

                    <div style={{ padding: '1.25rem' }}>
                        {/* Auto Recommendations */}
                        {autoRecommendations.length > 0 && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                                    Possible Matches ({autoRecommendations.length})
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    {autoRecommendations.map(p => (
                                        <CandidateCard
                                            key={p.id}
                                            policy={p}
                                            docStatus={activeReviewItem?.docStatus || null}
                                            isAssigning={isAssigning}
                                            onAssign={() => handleAssign(p.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Search Bar for manual search */}
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                {autoRecommendations.length > 0 ? 'Or Search Manually' : 'Search for a Policy'}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: searchResults.length > 0 ? '0.75rem' : 0 }}>
                                <input
                                    type="text"
                                    placeholder="Client name, address, or policy number..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchPolicies()}
                                    style={{
                                        flex: 1, padding: '0.5rem 0.75rem', borderRadius: '0.375rem',
                                        border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
                                        color: 'var(--text-high)', fontSize: '0.82rem', outline: 'none',
                                    }}
                                />
                                <Button variant="secondary" onClick={handleSearchPolicies} disabled={isSearching}>
                                    {isSearching ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={16} />}
                                    <span style={{ marginLeft: 6 }}>Search</span>
                                </Button>
                            </div>

                            {searchResults.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.75rem' }}>
                                    {searchResults.map(p => (
                                        <CandidateCard
                                            key={p.id}
                                            policy={p}
                                            docStatus={activeReviewItem?.docStatus || null}
                                            isAssigning={isAssigning}
                                            onAssign={() => handleAssign(p.id)}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Create Client Profile Button */}
                            {activeReviewItem && (
                                <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-default)' }}>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleCreateAndAssign}
                                        disabled={isCreatingClient}
                                    >
                                        {isCreatingClient
                                            ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite', marginRight: 6 }} /> Creating…</>
                                            : <><UserPlus size={14} style={{ marginRight: 6 }} /> Create New Client Profile</>}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </main>
    );
}

/* ── Candidate Comparison Card ────────────────────────────────────── */

function CandidateCard({ policy, docStatus, isAssigning, onAssign }: {
    policy: any;
    docStatus: DocumentStatus | null;
    isAssigning: boolean;
    onAssign: () => void;
}) {
    const clientName = policy.clients?.named_insured || '—';
    const sysAddress = policy.property_address_raw || 'No address on file';
    const docName = docStatus?.extracted_owner_name || '—';
    const docAddress = docStatus?.extracted_address || '—';

    const nameSim: number | null = policy._name_similarity ?? null;
    const addrSim: number | null = policy._address_similarity ?? null;
    const matchSource: string | null = policy._match_source ?? null;

    const sourceColor = matchSource === 'both' ? '#10b981' : matchSource === 'name' ? '#6366f1' : '#f59e0b';
    const sourceLabel = matchSource === 'both' ? 'Name + Address' : matchSource === 'name' ? 'Name Match' : matchSource === 'address' ? 'Address Match' : null;

    return (
        <div style={{
            borderRadius: '0.5rem',
            border: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
            overflow: 'hidden',
        }}>
            {sourceLabel && (
                <div style={{ padding: '0.4rem 0.75rem', background: `${sourceColor}08`, borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                        fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem',
                        borderRadius: '999px', background: `${sourceColor}18`, color: sourceColor,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>{sourceLabel}</span>
                    {nameSim !== null && nameSim > 0 && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            Name: <strong style={{ color: nameSim >= 0.85 ? '#10b981' : nameSim >= 0.6 ? '#f59e0b' : 'var(--text-muted)' }}>{Math.round(nameSim * 100)}%</strong>
                        </span>
                    )}
                    {addrSim !== null && addrSim > 0 && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            Address: <strong style={{ color: addrSim >= 0.85 ? '#10b981' : addrSim >= 0.6 ? '#f59e0b' : 'var(--text-muted)' }}>{Math.round(addrSim * 100)}%</strong>
                        </span>
                    )}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '0.75rem' }}>
                <div style={{ padding: '0.5rem 0.75rem', background: '#6366f108', borderBottom: '1px solid var(--border-default)', borderRight: '1px solid var(--border-default)' }}>
                    <span style={{ fontWeight: 700, color: '#6366f1', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>From Document</span>
                </div>
                <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-surface-raised)', borderBottom: '1px solid var(--border-default)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>In System</span>
                </div>

                <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-default)', borderRight: '1px solid var(--border-default)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Insured Name</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-high)' }}>{docName}</div>
                </div>
                <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-default)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Named Insured</div>
                    <div style={{ fontWeight: 600, color: nameSim !== null && nameSim >= 0.85 ? '#10b981' : 'var(--text-high)' }}>{clientName}</div>
                </div>

                <div style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border-default)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Property Address</div>
                    <div style={{ color: 'var(--text-mid)' }}>{docAddress}</div>
                </div>
                <div style={{ padding: '0.5rem 0.75rem' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Property Address</div>
                    <div style={{ color: sysAddress === 'No address on file' ? 'var(--text-muted)' : addrSim !== null && addrSim >= 0.85 ? '#10b981' : 'var(--text-mid)', fontStyle: sysAddress === 'No address on file' ? 'italic' : 'normal' }}>{sysAddress}</div>
                </div>
            </div>

            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.6rem 0.75rem',
                borderTop: '1px solid var(--border-default)',
                background: 'var(--bg-surface-raised)',
            }}>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.72rem' }}>
                    <a
                        href={`/policy/${policy.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                        <Shield size={12} /> {policy.policy_number}
                        <ExternalLink size={10} style={{ opacity: 0.6 }} />
                    </a>
                    {policy.carrier_name && (
                        <span style={{ color: 'var(--text-muted)' }}>{policy.carrier_name}</span>
                    )}
                </div>
                <Button size="sm" variant="primary" disabled={isAssigning} onClick={onAssign}>
                    {isAssigning ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Assign to This Policy'}
                </Button>
            </div>
        </div>
    );
}
