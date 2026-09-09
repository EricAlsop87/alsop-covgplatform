'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Loader2,
    CheckCircle,
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
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/Button/Button';
import Link from 'next/link';

/* ── Constants ──────────────────────────────────────────────────────── */

const DOC_TYPES = [
    {
        key: 'dec_page',
        label: 'Dec Page',
        fullLabel: 'Declaration Page',
        description: 'FAIR Plan declaration pages — processed through the full Dec Page pipeline',
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

type TrackerPhase = 'idle' | 'uploading' | 'polling' | 'done';

/* ── Main component ─────────────────────────────────────────────────── */

export default function UploadDocumentPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [selectedType, setSelectedType] = useState<DocTypeKey | null>(null);
    const [detectedType, setDetectedType] = useState<DocTypeKey | null>(null);
    const [isClassifying, setIsClassifying] = useState(false);
    const [successToast, setSuccessToast] = useState<{ message: string; docType: string } | null>(null);
    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounterRef = useRef(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Tracker state
    const [phase, setPhase] = useState<TrackerPhase>('idle');
    const [documentId, setDocumentId] = useState<string | null>(null);
    const [uploadedFileName, setUploadedFileName] = useState<string>('');
    const [docStatus, setDocStatus] = useState<DocumentStatus | null>(null);
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [startTime, setStartTime] = useState<number | null>(null);
    const startTimeRef = useRef<number>(0);
    const [processingTime, setProcessingTime] = useState('');
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Dec Page engine state (separate from platform documents engine)
    const [decPageStatus, setDecPageStatus] = useState<'uploading' | 'queued' | 'processing' | 'parsed' | 'failed' | null>(null);
    const [decPageStep, setDecPageStep] = useState<string | null>(null);
    const [decPageUploadProgress, setDecPageUploadProgress] = useState(0);
    const [decPageSubmissionId, setDecPageSubmissionId] = useState<string | null>(null);
    const decPagePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Manual Assign State
    const [isAssigning, setIsAssigning] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [autoRecommendations, setAutoRecommendations] = useState<any[]>([]);
    const [autoSearchDone, setAutoSearchDone] = useState(false);
    const autoSearchRanRef = useRef(false);
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

    // ── Reassign mode: load document info from ?reassign=DOC_ID ──
    useEffect(() => {
        const reassignId = searchParams.get('reassign');
        if (!reassignId || reassignInitRef.current) return;
        reassignInitRef.current = true;

        setIsReassignMode(true);
        setDocumentId(reassignId);
        setPhase('done');

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
                    setUploadedFileName(doc.file_name || '');
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
                        setUploadedFileName(sub?.file_name || 'Declaration Page.pdf');
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
                // Extract search terms from the insured name
                const stopWords = new Set(['trust', 'family', 'the', 'and', 'of', 'for', 'inc', 'llc', 'ltd']);
                const terms = insuredName
                    .replace(/[^a-zA-Z\s-]/g, '')
                    .split(/\s+/)
                    .filter(w => w.length >= 3 && !stopWords.has(w.toLowerCase()))
                    .slice(0, 3);

                const allResults: any[] = [];
                const seenIds = new Set<string>();

                // Exclude the current policy from results
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

    // Clean up on unmount
    useEffect(() => () => { 
        if (pollRef.current) clearInterval(pollRef.current); 
        if (decPagePollRef.current) clearInterval(decPagePollRef.current); 
    }, []);

    // Live timer
    useEffect(() => {
        if (!startTime || phase !== 'polling') return;
        const t = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            setProcessingTime(elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`);
        }, 250);
        return () => clearInterval(t);
    }, [startTime, phase]);

    /* ── Polling ─────────────────────────────────────────────────────── */

    const startPolling = useCallback((docId: string) => {
        setPhase('polling');
        const now = Date.now();
        setStartTime(now);
        startTimeRef.current = now;

        const fetchStatus = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const res = await fetch(`/api/documents/upload/status?ids=${docId}`, {
                    headers: { 'Authorization': `Bearer ${session.access_token}` },
                });
                if (!res.ok) return;

                const json = await res.json();
                const doc = json.documents?.[0] as DocumentStatus | undefined;
                if (!doc) return;

                setDocStatus(doc);

                // Stop polling on terminal state
                const terminal = ['parsed', 'needs_review', 'failed'].includes(doc.parse_status);
                const noMatchDone = doc.match_status === 'no_match' && doc.processing_step === 'complete';

                // Detect stalled: stuck in 'processing' for > 5 minutes
                const isDocStalled = doc.parse_status === 'processing' && doc.updated_at &&
                    (Date.now() - new Date(doc.updated_at).getTime()) > 5 * 60 * 1000;

                if (terminal || noMatchDone || isDocStalled) {
                    setPhase('done');
                    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
                    setProcessingTime(elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`);
                }
            } catch { /* swallow */ }
        };

        fetchStatus(); // immediate
        pollRef.current = setInterval(fetchStatus, 2000);
    }, []);

    /* ── Dec Page Polling (uses /api/upload/status) ─────────────────── */

    const startDecPagePolling = useCallback((submissionId: string) => {
        setPhase('polling');
        const now = Date.now();
        setStartTime(now);
        startTimeRef.current = now;
        setDecPageStatus('queued');

        const fetchStatus = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.access_token) return;

                const res = await fetch(`/api/upload/status?ids=${submissionId}`, {
                    headers: { 'Authorization': `Bearer ${session.access_token}` },
                });
                if (!res.ok) return;

                const json = await res.json();
                if (!json.success || !json.data?.[0]) return;

                const status = json.data[0].status as typeof decPageStatus;
                const step = json.data[0].processing_step as string | null;
                setDecPageStatus(status);
                setDecPageStep(step);

                if (status === 'parsed' || status === 'failed') {
                    setPhase('done');
                    if (decPagePollRef.current) { clearInterval(decPagePollRef.current); decPagePollRef.current = null; }
                    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
                    setProcessingTime(elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`);
                    if (status === 'parsed') {
                        window.dispatchEvent(new CustomEvent('decPageParsed'));
                    }
                }
            } catch { /* swallow */ }
        };

        fetchStatus();
        decPagePollRef.current = setInterval(fetchStatus, 3000);
    }, []);

    /* ── Load existing doc for duplicate ─────────────────────────────── */

    const loadExistingDoc = useCallback(async (docId: string) => {
        setDocumentId(docId);
        setIsDuplicate(true);
        setPhase('done');
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const res = await fetch(`/api/documents/upload/status?ids=${docId}`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` },
            });
            if (!res.ok) return;
            const json = await res.json();
            if (json.documents?.[0]) setDocStatus(json.documents[0]);
        } catch { /* swallow */ }
    }, []);

    /* ── Upload ──────────────────────────────────────────────────────── */

    const handleUpload = useCallback(async (file: File) => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (ext !== '.pdf') { setUploadError(`Only PDF files are accepted.`); return; }
        if (file.size === 0) { setUploadError('File is empty.'); return; }
        if (file.size > 10 * 1024 * 1024) { setUploadError(`File exceeds 10MB limit.`); return; }

        setPhase('uploading');
        setUploadError(null);
        setDocumentId(null);
        setDocStatus(null);
        setIsDuplicate(false);
        setProcessingTime('');
        setUploadedFileName(file.name);
        setDetectedType(null);
        // Reset dec page state
        setDecPageStatus(null);
        setDecPageStep(null);
        setDecPageUploadProgress(0);
        setDecPageSubmissionId(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) { setUploadError('Session expired.'); setPhase('idle'); return; }

            // ── Step 1: Auto-classify the document ──
            setIsClassifying(true);
            let classifiedType: DocTypeKey = 'other';
            try {
                const classifyForm = new FormData();
                classifyForm.set('file', file);
                const classifyRes = await fetch('/api/documents/classify', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}` },
                    body: classifyForm,
                });
                if (classifyRes.ok) {
                    const classifyJson = await classifyRes.json();
                    classifiedType = classifyJson.detectedType as DocTypeKey;
                }
            } catch {
                // Classification failed — fall back to 'other'
            }
            setIsClassifying(false);
            setDetectedType(classifiedType);
            setSelectedType(classifiedType);

            // ── Step 2: Route to the correct engine ──
            if (classifiedType === 'dec_page') {
                // ── Dec Page Engine: XHR to /api/upload ──
                const formData = new FormData();
                formData.set('file', file);

                const result = await new Promise<{ ok: boolean; data: Record<string, unknown> }>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();

                    xhr.upload.addEventListener('progress', (event) => {
                        if (event.lengthComputable) {
                            setDecPageUploadProgress(Math.round((event.loaded / event.total) * 100));
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

                if (!result.ok || !result.data.success) {
                    setUploadError((result.data.message as string) || 'Upload failed.');
                    setPhase('idle');
                    return;
                }

                const responseData = result.data.data as Record<string, unknown> | undefined;
                const submissionId = responseData?.submissionId as string | undefined;

                if (submissionId) {
                    setDecPageSubmissionId(submissionId);
                    try {
                        const key = 'cfp_pending_dec_uploads';
                        const stored = sessionStorage.getItem(key);
                        const pending = stored ? JSON.parse(stored) : [];
                        if (!pending.includes(submissionId)) {
                            pending.push(submissionId);
                            sessionStorage.setItem(key, JSON.stringify(pending));
                        }
                    } catch { /* storage error */ }
                    startDecPagePolling(submissionId);
                } else {
                    setUploadError('Upload succeeded but no submission ID returned.');
                    setPhase('idle');
                }
            } else {
                // ── Platform Documents Engine: fetch to /api/documents/upload ──
                const formData = new FormData();
                formData.set('file', file);
                formData.set('doc_type', classifiedType);

                const res = await fetch('/api/documents/upload', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}` },
                    body: formData,
                });

                const json = await res.json();

                if (res.status === 409) {
                    const existingId = json.data?.existingDocumentId;
                    if (existingId) {
                        loadExistingDoc(existingId);
                    } else {
                        setPhase('done');
                        setIsDuplicate(true);
                        setDocStatus(null);
                    }
                } else if (res.ok && json.success) {
                    const newDocId = json.data?.documentId;
                    if (newDocId) {
                        setDocumentId(newDocId);
                        startPolling(newDocId);
                    } else {
                        setUploadError('Upload succeeded but no document ID returned.');
                        setPhase('idle');
                    }
                } else {
                    setUploadError(json.message || 'Upload failed.');
                    setPhase('idle');
                }
            }
        } catch {
            setUploadError('Network error. Please try again.');
            setPhase('idle');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [startPolling, loadExistingDoc, startDecPagePolling]);

    const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current++; setIsDragOver(true); };
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current--; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDragOver(false); } };
    const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current = 0; setIsDragOver(false); if (e.dataTransfer.files?.[0]) handleUpload(e.dataTransfer.files[0]); };
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); };

    /* ── Auto-Recommend from backend candidates ─────────────────────────── */

    useEffect(() => {
        if (!docStatus || autoSearchRanRef.current) return;
        const isNR = docStatus.parse_status === 'needs_review' || docStatus.match_status === 'no_match' || docStatus.match_status === 'needs_review';
        if (!isNR) return;

        autoSearchRanRef.current = true;

        // Extract candidates from the match_log (populated by backend matcher)
        const candidateStep = docStatus.match_log?.find((l: any) => l.step === 'candidates');
        const backendCandidates = candidateStep?.details?.candidates as any[] | undefined;

        // If backend ran the matcher and returned candidates (even empty array), trust it — skip fallback
        if (backendCandidates !== undefined) {
            if (backendCandidates.length > 0) {
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
            }
            // 0 candidates = no match, don't run fallback
            setAutoSearchDone(true);
            return;
        }

        // Fallback: client-side search ONLY for older documents processed before the matcher update
        if (!docStatus.extracted_owner_name && !docStatus.file_name) {
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

                if (docStatus.file_name) {
                    const nameNoExt = docStatus.file_name.replace(/\.[^.]+$/, '');
                    for (const w of nameNoExt.replace(/[^a-zA-Z\s-]/g, ' ').split(/\s+/).filter(Boolean)) {
                        if (!stopWords.has(w.toLowerCase())) addTerm(w);
                    }
                }
                if (docStatus.extracted_owner_name) {
                    for (const w of docStatus.extracted_owner_name.replace(/[^a-zA-Z\s-]/g, '').split(/\s+/).filter(Boolean)) {
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
    }, [docStatus]);

    /* ── Manual Search ────────────────────────────────────────────────── */

    const handleSearchPolicies = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            // Run two queries: one for policy fields, one for client name
            // The !inner join + .or() doesn't work correctly across tables in Supabase
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

            // Merge + deduplicate
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

    /* ── Assign Handler ───────────────────────────────────────────────── */

    const handleAssign = async (policyId: string) => {
        if (!documentId) return;
        setIsAssigning(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            // In reassign mode, use the reassign endpoint (cleans up old data)
            const endpoint = isReassignMode ? '/api/documents/reassign' : '/api/documents/assign';
            const body = isReassignMode
                ? { documentId, newPolicyId: policyId }
                : { documentId, policyId };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                setSearchQuery('');
                setSearchResults([]);
                setAutoRecommendations([]);
                setAutoSearchDone(false);
                autoSearchRanRef.current = false;
                setIsAssigning(false);
                setDocStatus(null);
                setIsDuplicate(false);
                setIsReassignMode(false);
                setReassignDocInfo(null);
                startPolling(documentId);
            } else {
                setUploadError(`Failed to ${isReassignMode ? 'reassign' : 'assign'} document. Please try again.`);
                setIsAssigning(false);
            }
        } catch {
            setUploadError(`Network error during ${isReassignMode ? 'reassignment' : 'assignment'}.`);
            setIsAssigning(false);
        }
    };

    const handleCreateAndAssign = async (createPolicy = true) => {
        if (!documentId || !docStatus) return;
        setIsCreatingClient(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const res = await fetch('/api/documents/create-and-assign', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    documentId,
                    ownerName: docStatus.extracted_owner_name || 'Unknown Insured',
                    propertyAddress: docStatus.extracted_address || '',
                    carrierName: 'California FAIR Plan',
                    createPolicy,
                }),
            });
            if (res.ok) {
                const result = await res.json();
                if (result.success && result.clientId) {
                    router.push(`/client/${result.clientId}`);
                } else {
                    // Re-poll to get updated status
                    setAutoRecommendations([]);
                    autoSearchRanRef.current = false;
                    startPolling(documentId);
                }
            } else {
                const err = await res.json();
                setUploadError(err.error || 'Failed to create client');
            }
        } catch {
            setUploadError('Network error creating client');
        } finally {
            setIsCreatingClient(false);
        }
    };

    // ── Create new client + policy during reassign (cleans up old data first) ──
    const handleReassignCreateNew = async () => {
        if (!documentId || !reassignDocInfo) return;
        setIsCreatingClient(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const res = await fetch('/api/documents/reassign', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    documentId,
                    createNew: true,
                    ownerName: reassignDocInfo.insured_name || 'Unknown Insured',
                    propertyAddress: reassignDocInfo.property_address || '',
                }),
            });
            const result = await res.json();
            if (res.ok && result.success) {
                router.push(`/client/${result.clientId}`);
            } else {
                setUploadError(result.message || 'Failed to create client');
            }
        } catch {
            setUploadError('Network error creating client');
        } finally {
            setIsCreatingClient(false);
        }
    };

    // ── Keep Current Policy Handler (Cancel reassignment & confirm) ──
    const [isKeepingPolicy, setIsKeepingPolicy] = useState(false);

    const handleKeepCurrentPolicy = useCallback(async () => {
        const policyId = reassignDocInfo?.policy_id;
        const docId = reassignDocInfo?.id || documentId;

        setIsKeepingPolicy(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && docId) {
                // Update platform_documents match_status to manual / confirmed
                await supabase
                    .from('platform_documents')
                    .update({ match_status: 'manual', writeback_status: 'confirmed' })
                    .eq('id', docId);

                // Update dec_pages if applicable
                await supabase
                    .from('dec_pages')
                    .update({ review_status: 'approved', needs_review: false })
                    .eq('id', docId);
            }

            setSuccessToast({
                message: 'Current policy confirmed. Redirecting...',
                docType: reassignDocInfo?.doc_type || 'document',
            });

            setTimeout(() => {
                if (policyId) {
                    window.location.href = `/policy/${policyId}`;
                } else {
                    window.location.href = '/dashboard';
                }
            }, 250);
        } catch (err) {
            console.error('Failed to keep current policy:', err);
            if (policyId) {
                window.location.href = `/policy/${policyId}`;
            } else {
                router.back();
            }
        }
    }, [reassignDocInfo, documentId, router]);

    const selectedTypeInfo = DOC_TYPES.find(t => t.key === selectedType);
    const showSelector = phase === 'idle' && !isReassignMode;
    const showTracker = phase !== 'idle' && !isReassignMode;
    const isTerminal = phase === 'done';
    const isSuccess = docStatus?.parse_status === 'parsed' && docStatus?.match_status === 'matched';
    const needsReview = docStatus?.parse_status === 'needs_review' || docStatus?.match_status === 'needs_review' || docStatus?.match_status === 'no_match';
    const isFailed = docStatus?.parse_status === 'failed';
    const isStalled = phase === 'done' && docStatus?.parse_status === 'processing' && docStatus?.updated_at &&
        (Date.now() - new Date(docStatus.updated_at).getTime()) > 5 * 60 * 1000;
    const [isRetrying, setIsRetrying] = useState(false);

    const handleRetry = async () => {
        if (!documentId) return;
        setIsRetrying(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const res = await fetch('/api/documents/retry', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ documentId }),
            });
            if (res.ok) {
                setIsRetrying(false);
                setDocStatus(null);
                setIsDuplicate(false);
                setAutoRecommendations([]);
                setAutoSearchDone(false);
                autoSearchRanRef.current = false;
                startPolling(documentId);
            } else {
                setUploadError('Retry failed. Please try again.');
                setIsRetrying(false);
            }
        } catch {
            setUploadError('Network error during retry.');
            setIsRetrying(false);
        }
    };

    const resetForNewUpload = useCallback(() => {
        setPhase('idle');
        setDocumentId(null);
        setDocStatus(null);
        setUploadError(null);
        setIsDuplicate(false);
        setProcessingTime('');
        setSelectedType(null);
        setDetectedType(null);
        setIsClassifying(false);
        setUploadedFileName('');
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        // Reset dec page engine state
        setDecPageStatus(null);
        setDecPageStep(null);
        setDecPageUploadProgress(0);
        setDecPageSubmissionId(null);
        if (decPagePollRef.current) { clearInterval(decPagePollRef.current); decPagePollRef.current = null; }
        // Reset manual assign state
        setSearchQuery('');
        setSearchResults([]);
        setAutoRecommendations([]);
        setAutoSearchDone(false);
        autoSearchRanRef.current = false;
    }, []);

    // ── Auto-reset after successful processing ──
    useEffect(() => {
        if (phase !== 'done') return;

        // Don't auto-reset if the document needs manual review
        const needsReview = docStatus?.parse_status === 'needs_review' ||
            docStatus?.match_status === 'no_match' ||
            docStatus?.match_status === 'needs_review' ||
            docStatus?.parse_status === 'failed';

        // Don't auto-reset in reassign mode
        if (isReassignMode || needsReview) return;

        // For Dec Pages: auto-reset after success
        const isDecSuccess = selectedType === 'dec_page' && decPageStatus === 'parsed';
        // For Platform Docs: auto-reset after success
        const isPlatformSuccess = selectedType !== 'dec_page' && docStatus?.parse_status === 'parsed';

        if (isDecSuccess || isPlatformSuccess) {
            const typeLabel = DOC_TYPES.find(t => t.key === selectedType)?.label || 'Document';
            const policyNum = docStatus?.policies?.policy_number;
            const toastMsg = policyNum
                ? `${typeLabel} processed — matched to ${policyNum}`
                : `${typeLabel} processed successfully`;

            setSuccessToast({ message: toastMsg, docType: selectedType || 'other' });

            // Clear toast after 8 seconds
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => setSuccessToast(null), 8000);

            // Auto-reset form after 3 seconds
            if (autoResetTimeoutRef.current) clearTimeout(autoResetTimeoutRef.current);
            autoResetTimeoutRef.current = setTimeout(() => {
                resetForNewUpload();
            }, 3000);
        }

        return () => {
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            if (autoResetTimeoutRef.current) clearTimeout(autoResetTimeoutRef.current);
        };
    }, [phase, docStatus, decPageStatus, selectedType, isReassignMode, resetForNewUpload]);

    return (
        <main style={{ padding: '2rem', maxWidth: '48rem', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
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
                            {isReassignMode ? 'Reassign Document' : 'Upload Document'}
                        </h1>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {isReassignMode
                                ? 'Move this document to a different policy. Old data will be cleaned up automatically.'
                                : 'Upload declaration pages, RCE, DIC, or other policy documents for automatic processing'}
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Success Toast ── */}
            {successToast && (
                <div style={{
                    position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999,
                    padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-lg)',
                    background: '#10b981', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    animation: 'slideIn 0.3s ease-out',
                    maxWidth: '400px',
                }}>
                    <CheckCircle size={18} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{successToast.message}</span>
                </div>
            )}

            {/* ── Reassign Context Banner ── */}
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
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.75rem', lineHeight: 1.5, marginBottom: 0 }}>
                        Search for a new policy below only if you want to move this document to a different policy. If it is already on the correct policy, click <strong>&ldquo;Keep Current Policy&rdquo;</strong> above.
                    </p>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════
                 REASSIGN MODE — Standalone Assignment Panel
                 ═══════════════════════════════════════════════════════════ */}
            {isReassignMode && (
                <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid #f59e0b30',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    marginBottom: '1.25rem',
                }}>
                    <div style={{ padding: '1rem 1.25rem', background: '#f59e0b08', borderBottom: '1px solid var(--border-default)' }}>
                        <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-high)', marginBottom: '0.25rem' }}>
                            🔄 Select New Policy
                        </h4>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                            Search by client name, property address, or policy number to find the correct policy.
                        </p>
                    </div>

                    <div style={{ padding: '1.25rem' }}>
                        {/* Error message */}
                        {uploadError && (
                            <div style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', background: '#ef444410', border: '1px solid #ef444430', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <XCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.8rem', color: '#ef4444' }}>{uploadError}</span>
                            </div>
                        )}

                        {/* Loading state while auto-searching */}
                        {!reassignAutoSearchDone && (
                            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.5rem' }} />
                                <div style={{ fontSize: '0.78rem' }}>Searching for matching policies…</div>
                            </div>
                        )}

                        {/* ── Auto Recommendations ── */}
                        {reassignAutoSearchDone && reassignCandidates.length > 0 && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                                    Possible Matches ({reassignCandidates.length})
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    {reassignCandidates.map(p => (
                                        <CandidateCard
                                            key={p.id}
                                            policy={p}
                                            docStatus={docStatus}
                                            isAssigning={isAssigning}
                                            onAssign={() => handleAssign(p.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── No Matches Found ── */}
                        {reassignAutoSearchDone && reassignCandidates.length === 0 && (
                            <div style={{ padding: '1.25rem', borderRadius: '0.5rem', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)', marginBottom: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-high)' }}>No Other Matching Policies Found</span>
                                </div>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                                    No other policies match &ldquo;{reassignDocInfo?.insured_name || 'the insured'}&rdquo;.
                                    You can create a new client profile, or search manually below.
                                </p>
                                <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={handleReassignCreateNew}
                                    disabled={isCreatingClient}
                                >
                                    {isCreatingClient
                                        ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite', marginRight: 6 }} /> Creating Profile…</>
                                        : <><UserPlus size={14} style={{ marginRight: 6 }} /> Create New Client Profile</>}
                                </Button>
                            </div>
                        )}

                        {/* ── Manual Search ── */}
                        {reassignAutoSearchDone && (
                            <div style={{ borderTop: reassignCandidates.length > 0 ? '1px solid var(--border-default)' : 'none', paddingTop: reassignCandidates.length > 0 ? '1rem' : 0 }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                    {reassignCandidates.length > 0 ? 'Or Search Manually' : 'Search for a Policy'}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: searchResults.length > 0 ? '0.75rem' : 0 }}>
                                    <input
                                        type="text"
                                        placeholder="Client name, address, or policy number..."
                                        value={searchQuery}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSearchPolicies()}
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
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {searchResults.map(p => (
                                            <CandidateCard
                                                key={p.id}
                                                policy={p}
                                                docStatus={docStatus}
                                                isAssigning={isAssigning}
                                                onAssign={() => handleAssign(p.id)}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* Create New Client button — also shown below manual search when there ARE auto-results */}
                                {reassignCandidates.length > 0 && (
                                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-default)' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                            Or Create New
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={handleReassignCreateNew}
                                            disabled={isCreatingClient}
                                        >
                                            {isCreatingClient
                                                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite', marginRight: 6 }} /> Creating…</>
                                                : <><UserPlus size={14} style={{ marginRight: 6 }} /> Create New Client Profile</>}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Cancel button */}
                        <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-default)', display: 'flex', gap: '0.5rem' }}>
                            <Button size="sm" variant="ghost" onClick={() => router.back()}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            )}


            {/* ═══════════════════════════════════════════════════════════
                 SELECTOR / DROP ZONE (only shown in idle state)
                 ═══════════════════════════════════════════════════════════ */}
            {showSelector && (
                <>
                    {/* Supported Document Types — informational only */}
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1rem' }}>
                        <h2 style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Supported Document Types
                        </h2>
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
                                    <span style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>{type.icon}</span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.03em', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', backgroundColor: `${type.color}18`, color: type.color, marginBottom: '0.3rem' }}>{type.label}</span>
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>{type.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Upload Dropzone */}
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.25rem' }}>
                        <div
                            onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: isDragOver ? `2px dashed var(--accent-primary)` : '2px dashed var(--border-default)',
                                borderRadius: '0.75rem', padding: '2.5rem 2rem', textAlign: 'center', cursor: 'pointer',
                                background: isDragOver ? `var(--accent-primary)08` : 'var(--bg-surface-raised)',
                                transition: 'all 0.2s',
                            }}
                        >
                            <input type="file" ref={fileInputRef} accept=".pdf" style={{ display: 'none' }} onChange={handleFileChange} />
                            <div style={{ pointerEvents: 'none' }}>
                                <FileUp size={36} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
                                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-high)' }}>
                                    {isDragOver ? <span style={{ color: 'var(--accent-primary)' }}>Drop PDF here</span> : <>Drop any policy document PDF here or <span style={{ color: 'var(--accent-primary)' }}>click to browse</span></>}
                                </p>
                                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>PDF only · Max 10MB · Auto-detects document type</p>
                            </div>
                        </div>
                        {uploadError && (
                            <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', borderRadius: '0.5rem', background: '#ef444410', border: '1px solid #ef444430', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <XCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.8rem', color: '#ef4444' }}>{uploadError}</span>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ═══════════════════════════════════════════════════════════
                 DEC PAGE PROCESSING TRACKER (uses Dec Page engine)
                 ═══════════════════════════════════════════════════════════ */}
            {selectedType === 'dec_page' && phase !== 'idle' && (() => {
                const DEC_PIPELINE = [
                    { key: 'extracting_text', label: 'Extracting Text', desc: 'Reading PDF content with OCR fallback' },
                    { key: 'parsing_fields', label: 'Parsing Fields', desc: 'AI-powered field extraction' },
                    { key: 'creating_records', label: 'Creating Records', desc: 'Creating client and policy records' },
                    { key: 'enriching_property', label: 'Enriching Property', desc: 'ATTOM, satellite imagery, and AI analysis' },
                    { key: 'evaluating_flags', label: 'Evaluating Flags', desc: 'Running flag evaluation rules' },
                    { key: 'generating_report', label: 'Generating Report', desc: 'Creating AI coverage report' },
                    { key: 'complete', label: 'Complete', desc: 'Processing finished' },
                ];
                const isDecSuccess = decPageStatus === 'parsed';
                const isDecFailed = decPageStatus === 'failed';

                return (
                    <div style={{
                        background: 'var(--bg-surface)',
                        border: `1px solid ${isDecSuccess ? '#10b98140' : isDecFailed ? '#ef444440' : 'var(--border-default)'}`,
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                        marginBottom: '1.25rem',
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            borderBottom: '1px solid var(--border-default)',
                            background: isDecSuccess ? '#10b98108' : isDecFailed ? '#ef444408' : 'transparent',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                {(phase === 'uploading' || phase === 'polling') && <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#6366f1' }} />}
                                {isDecSuccess && <CheckCircle size={18} style={{ color: '#10b981' }} />}
                                {isDecFailed && <XCircle size={18} style={{ color: '#ef4444' }} />}
                                <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-high)' }}>
                                    {isClassifying ? 'Classifying document…' : phase === 'uploading' ? 'Uploading…' :
                                     phase === 'polling' ? 'Processing Dec Page…' :
                                     isDecSuccess ? 'Dec Page Processed Successfully' :
                                     isDecFailed ? 'Processing Failed' : 'Processing…'}
                                </span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '0.25rem', backgroundColor: '#6366f120', color: '#6366f1' }}>Dec Page</span>
                            </div>
                            {processingTime && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <Clock size={13} style={{ color: 'var(--text-muted)' }} />
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{processingTime}</span>
                                </div>
                            )}
                        </div>

                        {/* Pipeline Steps */}
                        <div style={{ padding: '1.25rem 1.5rem' }}>
                            {phase === 'uploading' && (
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0', marginBottom: '0.75rem' }}>
                                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Loader2 size={13} style={{ color: '#fff', animation: 'spin 1s linear infinite' }} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-high)' }}>Uploading to server</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{uploadedFileName}</div>
                                        </div>
                                    </div>
                                    {/* XHR Progress Bar */}
                                    <div style={{ background: 'var(--bg-surface-raised)', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${decPageUploadProgress}%`, background: '#6366f1', borderRadius: '6px', transition: 'width 0.3s ease' }} />
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem', textAlign: 'right' as const }}>{decPageUploadProgress}%</div>
                                </div>
                            )}

                            {phase === 'polling' && DEC_PIPELINE.map((step, i) => {
                                const currentIdx = DEC_PIPELINE.findIndex(s => s.key === (decPageStep || 'extracting_text'));
                                const isDone = i < currentIdx;
                                const isCurrent = i === currentIdx;
                                const isPending = i > currentIdx;

                                return (
                                    <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.4rem 0' }}>
                                        <div style={{
                                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: isDone ? '#10b981' : isCurrent ? '#6366f1' : 'var(--bg-surface-raised)',
                                            border: isPending ? '2px solid var(--border-default)' : 'none',
                                        }}>
                                            {isDone && <CheckCircle size={13} style={{ color: '#fff' }} />}
                                            {isCurrent && <Loader2 size={13} style={{ color: '#fff', animation: 'spin 1s linear infinite' }} />}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: isDone || isCurrent ? 600 : 400, color: isDone ? '#10b981' : isCurrent ? 'var(--text-high)' : 'var(--text-muted)' }}>
                                                {step.label}
                                            </div>
                                            {isCurrent && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{step.desc}</div>}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Success State */}
                            {isDecSuccess && (
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <CheckCircle size={20} style={{ color: '#10b981' }} />
                                        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#10b981' }}>Declaration page processed successfully</span>
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-mid)', lineHeight: 1.5, marginBottom: '1rem' }}>
                                        The dec page has been parsed, policy and client records created, property enrichment completed, flags evaluated, and an AI report generated.
                                    </p>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <Button size="sm" variant="primary" onClick={resetForNewUpload}>
                                            <FileUp size={14} style={{ marginRight: 6 }} /> Upload Another
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Failed State */}
                            {isDecFailed && (
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                        <XCircle size={20} style={{ color: '#ef4444' }} />
                                        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ef4444' }}>Processing failed</span>
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-mid)', lineHeight: 1.5, marginBottom: '1rem' }}>
                                        The declaration page could not be processed. This may happen if the PDF is corrupt, unreadable, or not a valid dec page. Please try again with a different file.
                                    </p>
                                    <Button size="sm" variant="primary" onClick={resetForNewUpload}>
                                        <FileUp size={14} style={{ marginRight: 6 }} /> Try Again
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* ═══════════════════════════════════════════════════════════
                 LIVE PROCESSING TRACKER (Platform Documents only)
                 ═══════════════════════════════════════════════════════════ */}
            {showTracker && selectedType !== 'dec_page' && (
                <div style={{
                    background: 'var(--bg-surface)',
                    border: `1px solid ${isSuccess ? '#10b98140' : needsReview ? '#f59e0b40' : isFailed ? '#ef444440' : isDuplicate ? '#6366f140' : 'var(--border-default)'}`,
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    marginBottom: '1.25rem',
                }}>
                    {/* ── Header Bar ── */}
                    <div style={{
                        padding: '1rem 1.5rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        borderBottom: '1px solid var(--border-default)',
                        background: isSuccess ? '#10b98108' : needsReview ? '#f59e0b08' : (isFailed || isStalled) ? '#ef444408' : isDuplicate ? '#6366f108' : 'transparent',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            {phase === 'uploading' && <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-primary)' }} />}
                            {phase === 'polling' && <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-primary)' }} />}
                            {isSuccess && <CheckCircle size={18} style={{ color: '#10b981' }} />}
                            {needsReview && <AlertTriangle size={18} style={{ color: '#f59e0b' }} />}
                            {isFailed && <XCircle size={18} style={{ color: '#ef4444' }} />}
                            {isStalled && <AlertTriangle size={18} style={{ color: '#ef4444' }} />}
                            {isDuplicate && !docStatus && <Copy size={18} style={{ color: '#6366f1' }} />}
                            {isDuplicate && docStatus && !isSuccess && !needsReview && !isFailed && !isStalled && <Copy size={18} style={{ color: '#6366f1' }} />}

                            <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-high)' }}>
                                {isClassifying ? 'Classifying document…' : phase === 'uploading' ? 'Uploading…' :
                                 phase === 'polling' ? 'Processing Document…' :
                                 isStalled ? 'Processing Stalled' :
                                 isDuplicate && !isSuccess && !needsReview && !isFailed ? 'Duplicate — Already Uploaded' :
                                 isSuccess ? 'Processing Complete' :
                                 needsReview ? 'Review Required' :
                                 isFailed ? 'Processing Failed' : 'Processing Complete'}
                            </span>

                            {selectedTypeInfo && (
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '0.25rem', backgroundColor: `${selectedTypeInfo.color}20`, color: selectedTypeInfo.color }}>
                                    {selectedTypeInfo.label}
                                </span>
                            )}
                        </div>
                        {(phase === 'polling' || isTerminal) && processingTime && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Clock size={13} style={{ color: 'var(--text-muted)' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{processingTime}</span>
                            </div>
                        )}
                    </div>

                    {/* ── Pipeline Steps (shown during uploading/polling) ── */}
                    {(phase === 'uploading' || phase === 'polling') && (
                        <div style={{ padding: '1.25rem 1.5rem' }}>
                            {phase === 'uploading' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0' }}>
                                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Loader2 size={13} style={{ color: '#fff', animation: 'spin 1s linear infinite' }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-high)' }}>Uploading to server</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{uploadedFileName}</div>
                                    </div>
                                </div>
                            )}
                            {phase === 'polling' && PIPELINE_STEPS.map((step, i) => {
                                const currentIdx = PIPELINE_STEPS.findIndex(s => s.key === (docStatus?.processing_step || 'queued'));
                                const isDone = i < currentIdx;
                                const isCurrent = i === currentIdx;
                                const isPending = i > currentIdx;
                                if (step.key === 'writing_policy_data' && docStatus?.match_status !== 'matched' && !isDone) return null;

                                return (
                                    <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.4rem 0' }}>
                                        <div style={{
                                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: isDone ? '#10b981' : isCurrent ? 'var(--accent-primary)' : 'var(--bg-surface-raised)',
                                            border: isPending ? '2px solid var(--border-default)' : 'none',
                                        }}>
                                            {isDone && <CheckCircle size={13} style={{ color: '#fff' }} />}
                                            {isCurrent && <Loader2 size={13} style={{ color: '#fff', animation: 'spin 1s linear infinite' }} />}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: isDone || isCurrent ? 600 : 400, color: isDone ? '#10b981' : isCurrent ? 'var(--text-high)' : 'var(--text-muted)' }}>
                                                {step.label}
                                            </div>
                                            {isCurrent && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{step.description}</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Post-Processing Report (shown when terminal) ── */}
                    {isTerminal && (
                        <div style={{ padding: '1.25rem 1.5rem' }}>

                            {/* Duplicate notice */}
                            {isDuplicate && (
                                <div style={{ padding: '0.85rem 1rem', borderRadius: '0.5rem', background: '#6366f108', border: '1px solid #6366f130', marginBottom: '1rem' }}>
                                    <p style={{ fontSize: '0.8rem', color: '#6366f1', fontWeight: 600, marginBottom: '0.2rem' }}>📋 This document was already uploaded</p>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                        The file you uploaded matches an existing document. Here is the current status and data:
                                    </p>
                                </div>
                            )}

                            {/* File & Extraction Info */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.5rem', marginBottom: '1rem' }}>
                                <ReportField icon={<FileText size={14} />} label="File" value={docStatus?.file_name || uploadedFileName || '—'} />
                                {processingTime && !isDuplicate && <ReportField icon={<Clock size={14} />} label="Processing Time" value={processingTime} />}
                                {docStatus?.doc_type && <ReportField icon={<FileUp size={14} />} label="Document Type" value={
                                    docStatus.doc_type === 'rce' ? 'Replacement Cost Estimate (RCE)' :
                                    docStatus.doc_type === 'dic_dec_page' ? 'DIC Carrier Dec Page' :
                                    docStatus.doc_type === 'es_doc' ? 'E&S Document' :
                                    docStatus.doc_type === 'other' ? 'Other File Type' :
                                    docStatus.doc_type
                                } />}
                                {docStatus?.extracted_owner_name && <ReportField icon={<User size={14} />} label="Insured / Owner" value={docStatus.extracted_owner_name} />}
                                {docStatus?.extracted_address && <ReportField icon={<MapPin size={14} />} label="Property Address" value={docStatus.extracted_address} />}
                                {docStatus?.policies?.carrier_name && <ReportField icon={<Shield size={14} />} label="Carrier" value={docStatus.policies.carrier_name} />}
                            </div>

                            {/* Match Result Banner */}
                            {docStatus && (
                                <div style={{
                                    padding: '0.85rem 1rem',
                                    borderRadius: '0.5rem',
                                    marginBottom: '1rem',
                                    background: isSuccess ? '#10b98108' : (isStalled || isFailed) ? '#ef444408' : needsReview ? '#f59e0b08' : '#6366f108',
                                    border: `1px solid ${isSuccess ? '#10b98130' : (isStalled || isFailed) ? '#ef444430' : needsReview ? '#f59e0b30' : '#6366f130'}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                        <span style={{
                                            fontSize: '0.82rem', fontWeight: 700,
                                            color: isSuccess ? '#10b981' : (isStalled || isFailed) ? '#ef4444' : needsReview ? '#f59e0b' : '#6366f1',
                                        }}>
                                            {isSuccess ? '✓ Policy Matched' :
                                             isStalled ? '⚠ Processing Stalled — Worker Crashed' :
                                             isFailed ? '✕ Processing Failed' :
                                             docStatus.match_status === 'no_match' ? '✕ No Policy Match Found' :
                                             needsReview ? '⚠ Review Needed' : '✓ Complete'}
                                        </span>
                                        {docStatus.match_confidence !== null && docStatus.match_confidence > 0 && (
                                            <span style={{
                                                fontSize: '0.72rem', fontWeight: 600,
                                                padding: '0.1rem 0.5rem', borderRadius: '999px',
                                                background: docStatus.match_confidence > 0.8 ? '#10b98120' : '#f59e0b20',
                                                color: docStatus.match_confidence > 0.8 ? '#10b981' : '#f59e0b',
                                            }}>
                                                {Math.round(docStatus.match_confidence * 100)}% confidence
                                            </span>
                                        )}
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-mid)', lineHeight: 1.5, margin: 0 }}>
                                        {isStalled
                                            ? `This document got stuck at "${docStatus.processing_step}" and hasn't progressed. The processing worker may have crashed. Click Retry to re-queue it.`
                                            : docStatus.status_message}
                                    </p>
                                    {(isStalled || isFailed) && (
                                        <div style={{ marginTop: '0.75rem' }}>
                                            <Button size="sm" variant="primary" onClick={handleRetry} disabled={isRetrying}>
                                                {isRetrying
                                                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite', marginRight: 6 }} /> Retrying…</>
                                                    : <><RefreshCw size={14} style={{ marginRight: 6 }} /> Retry Processing</>}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Policy & Client Actionable Cards */}
                            {docStatus?.policy_id && (() => {
                                // Resolve client from document or through policy
                                const resolvedClient = docStatus.clients || docStatus.policies?.clients || null;
                                const resolvedClientId = docStatus.client_id || docStatus.policies?.client_id || null;
                                return (
                                <div style={{ display: 'grid', gridTemplateColumns: resolvedClient ? '1fr 1fr' : '1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                    <Link href={`/policy/${docStatus.policy_id}`} style={{ textDecoration: 'none' }}>
                                        <div
                                            style={{
                                                padding: '0.85rem 1rem', borderRadius: '0.5rem',
                                                border: '1px solid var(--border-default)',
                                                background: 'var(--bg-surface-raised)',
                                                cursor: 'pointer', transition: 'border-color 0.15s',
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
                                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                                                <Shield size={14} style={{ color: 'var(--accent-primary)' }} />
                                                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Matched Policy</span>
                                                <ExternalLink size={11} style={{ color: 'var(--text-muted)', marginLeft: 'auto' }} />
                                            </div>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-high)' }}>
                                                {docStatus.policies?.policy_number || 'View Policy'}
                                            </div>
                                            {docStatus.policies?.carrier_name && (
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{docStatus.policies.carrier_name}</div>
                                            )}
                                            {docStatus.policies?.property_address_raw && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px solid var(--border-default)' }}>
                                                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Address: </span>
                                                    {docStatus.policies.property_address_raw}
                                                </div>
                                            )}
                                        </div>
                                    </Link>
                                    {resolvedClient && (
                                        <Link href={`/client/${resolvedClientId || resolvedClient.id}`} style={{ textDecoration: 'none' }}>
                                            <div
                                                style={{
                                                    padding: '0.85rem 1rem', borderRadius: '0.5rem',
                                                    border: '1px solid var(--border-default)',
                                                    background: 'var(--bg-surface-raised)',
                                                    cursor: 'pointer', transition: 'border-color 0.15s',
                                                    height: '100%',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.borderColor = '#8b5cf6')}
                                                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                                                    <User size={14} style={{ color: '#8b5cf6' }} />
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Client / Insured</span>
                                                    <ExternalLink size={11} style={{ color: 'var(--text-muted)', marginLeft: 'auto' }} />
                                                </div>
                                                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-high)' }}>{resolvedClient.named_insured}</div>
                                                {docStatus.extracted_owner_name && resolvedClient.named_insured.toLowerCase() !== docStatus.extracted_owner_name.toLowerCase() && (
                                                    <div style={{ fontSize: '0.68rem', color: '#f59e0b', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                        <AlertTriangle size={11} />
                                                        <span>Document says: {docStatus.extracted_owner_name}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </Link>
                                    )}
                                </div>
                                );
                            })()}

                            {/* Writeback Log */}
                            {docStatus?.writeback_log && docStatus.writeback_log.length > 0 && (
                                <div style={{ marginBottom: '1rem' }}>
                                    <h4 style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-mid)', marginBottom: '0.5rem' }}>
                                        <Zap size={13} style={{ verticalAlign: 'middle', marginRight: '0.25rem', color: '#10b981' }} />
                                        Data Written to Policy
                                    </h4>
                                    <div style={{ borderRadius: '0.5rem', border: '1px solid var(--border-default)', overflow: 'hidden', fontSize: '0.75rem' }}>
                                        {docStatus.writeback_log.filter(entry => entry.field && entry.action).map((entry, i) => (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                padding: '0.4rem 0.75rem',
                                                borderBottom: i < (docStatus.writeback_log?.length || 0) - 1 ? '1px solid var(--border-default)' : 'none',
                                                background: entry.action === 'conflict' ? '#ef444408' : 'transparent',
                                            }}>
                                                {entry.action === 'written' && <CheckCircle size={12} style={{ color: '#10b981', flexShrink: 0 }} />}
                                                {entry.action === 'skipped' && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', width: 12, textAlign: 'center' }}>—</span>}
                                                {entry.action === 'conflict' && <AlertTriangle size={12} style={{ color: '#ef4444', flexShrink: 0 }} />}
                                                <span style={{ fontWeight: 600, color: 'var(--text-mid)', minWidth: '10rem' }}>{formatFieldName(entry.field || entry.target || '')}</span>
                                                <span style={{ color: 'var(--text-muted)' }}>
                                                    {entry.action === 'written' ? `→ ${entry.new_value || entry.value || ''}` :
                                                     entry.action === 'skipped' ? 'Already correct' :
                                                     `Conflict: existing "${entry.old_value || entry.existing_value || ''}" vs new "${entry.new_value || entry.value || ''}"`}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Pipeline Steps (completed view for terminal) */}
                            {!isDuplicate && docStatus && (
                                <div style={{ marginBottom: '1rem' }}>
                                    <h4 style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-mid)', marginBottom: '0.5rem' }}>Pipeline Steps</h4>
                                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                        {PIPELINE_STEPS.map((step, i) => {
                                            const currentIdx = PIPELINE_STEPS.findIndex(s => s.key === docStatus.processing_step);
                                            const isDone = i < currentIdx || (i === currentIdx && isTerminal);
                                            const wasFailed = isFailed && i === currentIdx;
                                            if (step.key === 'writing_policy_data' && docStatus.match_status !== 'matched' && !isDone) return null;

                                            return (
                                                <span key={step.key} style={{
                                                    fontSize: '0.68rem', fontWeight: 600,
                                                    padding: '0.2rem 0.5rem', borderRadius: '999px',
                                                    background: isDone ? '#10b98115' : wasFailed ? '#ef444415' : 'var(--bg-surface-raised)',
                                                    color: isDone ? '#10b981' : wasFailed ? '#ef4444' : 'var(--text-muted)',
                                                    border: `1px solid ${isDone ? '#10b98130' : wasFailed ? '#ef444430' : 'var(--border-default)'}`,
                                                }}>
                                                    {isDone ? '✓' : wasFailed ? '✕' : '○'} {step.label}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid var(--border-default)' }}>
                                {docStatus?.policy_id && (
                                    <Link href={`/policy/${docStatus.policy_id}`}>
                                        <Button size="sm" variant="primary">
                                            <ChevronRight style={{ width: 13, height: 13, marginRight: 4 }} /> View Policy
                                        </Button>
                                    </Link>
                                )}
                                <Button size="sm" variant="outline" onClick={resetForNewUpload}>
                                    <FileUp style={{ width: 13, height: 13, marginRight: 5 }} /> Upload Another
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => router.push('/dashboard')}>
                                    Back to Dashboard
                                </Button>
                            </div>

                            {/* ═══ Assignment Panel ═══ */}
                            {(needsReview || isReassignMode) && (
                                <div style={{ marginTop: '1.5rem', borderRadius: '0.75rem', border: `1px solid ${isReassignMode ? '#f59e0b30' : 'var(--border-default)'}`, overflow: 'hidden' }}>
                                    {/* Panel Header */}
                                    <div style={{ padding: '1rem 1.25rem', background: isReassignMode ? '#f59e0b08' : 'var(--bg-surface-raised)', borderBottom: '1px solid var(--border-default)' }}>
                                        <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-high)', marginBottom: '0.25rem' }}>
                                            {isReassignMode ? '🔄 Select New Policy' : '🔍 Assign to Policy'}
                                        </h4>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                                            Review the recommendations below, or search manually. Click a policy number to inspect it in a new tab before assigning.
                                        </p>
                                    </div>

                                    <div style={{ padding: '1.25rem' }}>
                                        {/* ── Auto Recommendations ── */}
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
                                                            docStatus={docStatus}
                                                            isAssigning={isAssigning}
                                                            onAssign={() => handleAssign(p.id)}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {autoSearchDone && autoRecommendations.length === 0 && (
                                            <div style={{ padding: '1.25rem', borderRadius: '0.5rem', background: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)', marginBottom: '1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                    <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-high)' }}>No Matching Policies Found</span>
                                                </div>
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                                                    No existing policies match &ldquo;{docStatus?.extracted_owner_name}&rdquo; at &ldquo;{docStatus?.extracted_address}&rdquo;.
                                                    You can create a new client profile, or search manually below.
                                                </p>
                                                <Button
                                                    size="sm"
                                                    variant="primary"
                                                    onClick={() => handleCreateAndAssign(false)}
                                                    disabled={isCreatingClient}
                                                >
                                                    {isCreatingClient
                                                        ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite', marginRight: 6 }} /> Creating Profile…</>
                                                        : <><UserPlus size={14} style={{ marginRight: 6 }} /> Create Client Profile Only</>}
                                                </Button>
                                            </div>
                                        )}

                                        {/* ── Manual Search ── */}
                                        <div style={{ borderTop: autoRecommendations.length > 0 ? '1px solid var(--border-default)' : 'none', paddingTop: autoRecommendations.length > 0 ? '1rem' : 0 }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                                {autoRecommendations.length > 0 ? 'Or Search Manually' : 'Search for a Policy'}
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: searchResults.length > 0 ? '0.75rem' : 0 }}>
                                                <input
                                                    type="text"
                                                    placeholder="Client name, address, or policy number..."
                                                    value={searchQuery}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                                                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSearchPolicies()}
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
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                                    {searchResults.map(p => (
                                                        <CandidateCard
                                                            key={p.id}
                                                            policy={p}
                                                            docStatus={docStatus}
                                                            isAssigning={isAssigning}
                                                            onAssign={() => handleAssign(p.id)}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </main>
    );
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function ReportField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <div style={{ color: 'var(--text-muted)', marginTop: '0.1rem', flexShrink: 0 }}>{icon}</div>
            <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-high)', marginTop: '0.1rem' }}>{value}</div>
            </div>
        </div>
    );
}

function formatFieldName(field: string): string {
    if (!field) return '—';
    return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

    // Backend-scored similarities (from match_candidates_for_review)
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
            {/* Match source badge */}
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

            {/* Comparison Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '0.75rem' }}>
                {/* Header row */}
                <div style={{ padding: '0.5rem 0.75rem', background: '#6366f108', borderBottom: '1px solid var(--border-default)', borderRight: '1px solid var(--border-default)' }}>
                    <span style={{ fontWeight: 700, color: '#6366f1', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>From Document</span>
                </div>
                <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-surface-raised)', borderBottom: '1px solid var(--border-default)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>In System</span>
                </div>

                {/* Name row */}
                <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-default)', borderRight: '1px solid var(--border-default)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Insured Name</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-high)' }}>{docName}</div>
                </div>
                <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-default)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Named Insured</div>
                    <div style={{ fontWeight: 600, color: nameSim !== null && nameSim >= 0.85 ? '#10b981' : 'var(--text-high)' }}>{clientName}</div>
                </div>

                {/* Address row */}
                <div style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border-default)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Property Address</div>
                    <div style={{ color: 'var(--text-mid)' }}>{docAddress}</div>
                </div>
                <div style={{ padding: '0.5rem 0.75rem' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Property Address</div>
                    <div style={{ color: sysAddress === 'No address on file' ? 'var(--text-muted)' : addrSim !== null && addrSim >= 0.85 ? '#10b981' : 'var(--text-mid)', fontStyle: sysAddress === 'No address on file' ? 'italic' : 'normal' }}>{sysAddress}</div>
                </div>
            </div>

            {/* Action row */}
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
