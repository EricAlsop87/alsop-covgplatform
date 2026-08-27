'use client';

import React, { useEffect, useState, useCallback, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';
import { Button } from '@/components/ui/Button/Button';
import { Tabs } from '@/components/ui/Tabs/Tabs';
import { ArrowLeft, Mail, FileDown, Download, X, Maximize2, Copy, Check, Pencil, Flag, AlertTriangle, AlertCircle, Info, Satellite, Loader2, Settings, FileText, ExternalLink, Zap, Upload, ShieldCheck, MapPin, Phone, RotateCcw, ShieldAlert, FolderUp } from 'lucide-react';
import { PropertyBanner } from '@/components/policy/PropertyBanner';
import { getPolicyDetailById, mapPolicyDetailToDeclaration, Declaration, PolicyDetail, fetchFlagsByPolicyId, PolicyFlagRow, getPropertyEnrichments, PropertyEnrichment, runPropertyEnrichment, runFlagCheck, getLatestReportForPolicy, PolicyReportRow, fetchDecPageFilesByPolicyId, getDecPageFileDownloadUrl, fetchPlatformDocumentsByPolicyId, getPlatformDocDownloadUrl, fetchRceDocDataByPolicyId, RceDocData, fetchDicDocDataByPolicyId, DicDocData, generatePolicyReport, fetchRenewalEmailLog, RenewalEmailLogEntry, getLatestReportConfigVersion } from '@/lib/api';
import { PolicyStatusBar } from '@/components/policy/PolicyStatusBar';
import { PolicyOverviewTab } from '@/components/policy/tabs/PolicyOverviewTab';
import { PolicyCfpDetailsTab } from '@/components/policy/tabs/PolicyCfpDetailsTab';
import { PolicyDicDetailsTab } from '@/components/policy/tabs/PolicyDicDetailsTab';
import { PolicyRceTab } from '@/components/policy/tabs/PolicyRceTab';
import { AgentReviewPanel } from '@/components/policy/AIReport';
import { PolicyFiles } from '@/components/policy/PolicyFiles';
import { PolicyFlags } from '@/components/policy/PolicyFlags';
import { FlagAlertBanner } from '@/components/policy/FlagAlertBanner';
import { ActivityTimeline } from '@/components/shared/ActivityTimeline';
import { NotesPanel } from '@/components/shared/NotesPanel';
import { DecPageReview } from '@/components/policy/DecPageReview';
import { PolicyEditPanel } from '@/components/policy/PolicyEditPanel';
import { TermHistoryPanel } from '@/components/policy/TermHistoryPanel';
import { FullWorkupModal } from '@/components/dashboard/FullWorkupModal';
import { PolicyEmailComposer } from '@/components/email/PolicyEmailComposer';
import { EmailGuardrailModal, GuardrailCheck } from '@/components/email/EmailGuardrailModal';
import { useRecentlyVisited } from '@/hooks/useRecentlyVisited';
import { useToast } from '@/components/ui/Toast/Toast';
import { getUserProfile, UserRole } from '@/lib/auth';
import { ClientPolicyView } from './client-view';
import { logger } from '@/lib/logger';


const policyTabs = [
    { id: 'overview', label: 'OVERVIEW' },
    { id: 'terms', label: 'TERMS' },
    { id: 'cfp', label: 'POLICY' },
    { id: 'dic', label: 'DIC POLICY' },
    { id: 'rce', label: 'RCE DATA' },
    { id: 'flags', label: 'FLAGS' },
    { id: 'notes', label: 'NOTES' },
    { id: 'activity', label: 'ACTIVITY' },
    { id: 'files', label: 'FILES' },
];

export default function PolicyReviewPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    // Unwrap params in Next.js 15
    const { id } = use(params);
    const { addVisit } = useRecentlyVisited();
    const toast = useToast();

    const [declaration, setDeclaration] = useState<Declaration | undefined>(undefined);

    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [copied, setCopied] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [policyDetailRaw, setPolicyDetailRaw] = useState<PolicyDetail | null>(null);
    const [flagSummary, setFlagSummary] = useState<{ total: number; high: number; medium: number; low: number }>({
        total: 0, high: 0, medium: 0, low: 0
    });
    const [openFlags, setOpenFlags] = useState<PolicyFlagRow[]>([]);
    const [allFlags, setAllFlags] = useState<PolicyFlagRow[]>([]);
    const [enrichments, setEnrichments] = useState<PropertyEnrichment[]>([]);
    const [enrichStep, setEnrichStep] = useState<string | null>(null);
    const [flagCheckRunning, setFlagCheckRunning] = useState(false);
    const [reportRow, setReportRow] = useState<PolicyReportRow | null>(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [hasDecPage, setHasDecPage] = useState(false);
    const [isWorkupOpen, setIsWorkupOpen] = useState(false);
    const [decPageStoragePath, setDecPageStoragePath] = useState<string | null>(null);
    const [decPageLoading, setDecPageLoading] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const rceFileInputRef = React.useRef<HTMLInputElement>(null);
    const [rceDocStoragePath, setRceDocStoragePath] = useState<string | null>(null);
    const [rceDocLoading, setRceDocLoading] = useState(false);
    const dicFileInputRef = React.useRef<HTMLInputElement>(null);
    const [dicDocStoragePath, setDicDocStoragePath] = useState<string | null>(null);
    const [dicDocLoading, setDicDocLoading] = useState(false);
    const [showEmailComposer, setShowEmailComposer] = useState(false);
    const [showGuardrailModal, setShowGuardrailModal] = useState(false);
    const [emailLog, setEmailLog] = useState<RenewalEmailLogEntry[]>([]);
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const [roleLoading, setRoleLoading] = useState(true);
    const [bgProcessing, setBgProcessing] = useState(false);
    const [bgProcessingStep, setBgProcessingStep] = useState<string | null>(null);
    const [rceDocData, setRceDocData] = useState<RceDocData[]>([]);
    const [dicDocData, setDicDocData] = useState<DicDocData[]>([]);
    const [latestConfigVersion, setLatestConfigVersion] = useState<{ version_number: number; changed_at: string } | null>(null);

    // Detect user role for client vs agent view
    useEffect(() => {
        getUserProfile().then(p => {
            setUserRole(p?.role || null);
            setRoleLoading(false);
        });
        getLatestReportConfigVersion().then(setLatestConfigVersion);
    }, []);

    // Client-view flag — checked AFTER all hooks (React rules of hooks)
    const isCustomer = !roleLoading && userRole === 'customer';

    // Compute whether the generated report is stale
    const isReportStale = useMemo(() => {
        if (!reportRow?.created_at) return false;
        const reportTime = new Date(reportRow.created_at).getTime();

        // 1. Report config changed after report creation
        if (latestConfigVersion?.changed_at && reportTime < new Date(latestConfigVersion.changed_at).getTime()) {
            return true;
        }
        // 2. Policy updated after report creation
        if (policyDetailRaw?.updated_at && reportTime < new Date(policyDetailRaw.updated_at).getTime()) {
            return true;
        }
        // 3. Property data updated after report creation
        if (enrichments.length > 0) {
            const latestEnrichTime = Math.max(...enrichments.map(e => e.created_at ? new Date(e.created_at).getTime() : 0));
            if (latestEnrichTime > 0 && reportTime < latestEnrichTime) {
                return true;
            }
        }
        // 4. Flags updated after report creation
        if (allFlags.length > 0) {
            const latestFlagTime = Math.max(...allFlags.map(f => f.created_at ? new Date(f.created_at).getTime() : 0));
            if (latestFlagTime > 0 && reportTime < latestFlagTime) {
                return true;
            }
        }
        return false;
    }, [reportRow?.created_at, latestConfigVersion, policyDetailRaw?.updated_at, enrichments, allFlags]);

    // Handle Report Generation & Regeneration
    const handleGenerateReport = useCallback(async () => {
        setIsGeneratingReport(true);
        try {
            const result = await generatePolicyReport(id);
            if (result.report) {
                setReportRow(result.report as PolicyReportRow);
                getLatestReportConfigVersion().then(setLatestConfigVersion);
            } else {
                alert(result.error || 'Failed to generate report — please try again.');
            }
        } catch (e) {
            logger.error('page', 'Report generation failed:', { error: e instanceof Error ? e.message : String(e) });
            alert('Error generating report. Check the console for details.');
        } finally {
            setIsGeneratingReport(false);
        }
    }, [id]);

    // Derive enriched property image
    const propertyImageEnrichment = enrichments.find(e => e.field_key === 'property_image');
    const bannerImageSrc = propertyImageEnrichment?.field_value || null;
    const imageSource = propertyImageEnrichment ? {
        name: propertyImageEnrichment.source_name,
        type: propertyImageEnrichment.source_type,
        url: propertyImageEnrichment.source_url,
        fetchedAt: propertyImageEnrichment.fetched_at,
        confidence: propertyImageEnrichment.confidence,
    } : null;

    // Helper to format Google capture date (YYYY-MM to "August 2023")
    const formatCaptureDate = (dateStr?: string | null) => {
        if (!dateStr) return null;
        try {
            const parts = dateStr.split('-');
            if (parts.length === 2) {
                const [year, month] = parts;
                const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
                return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            } else if (parts.length === 3) {
                const [year, month, day] = parts;
                const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }
            return dateStr;
        } catch {
            return dateStr;
        }
    };

    // Derive street view image & capture date
    const streetViewEnrichment = enrichments.find(e => e.field_key === 'street_view_image');
    const streetViewCaptureDateEnrichment = enrichments.find(e => e.field_key === 'street_view_capture_date');
    const rawDateFromNotes = streetViewEnrichment?.notes?.match(/Date:\s*([^)]+)/)?.[1];
    const streetViewCaptureDate = streetViewCaptureDateEnrichment?.field_value
        || (rawDateFromNotes && rawDateFromNotes !== 'Unknown' ? formatCaptureDate(rawDateFromNotes) : null);

    const streetViewSrc = streetViewEnrichment?.field_value || null;
    const streetViewSource = streetViewEnrichment ? {
        name: streetViewEnrichment.source_name,
        type: streetViewEnrichment.source_type,
        url: streetViewEnrichment.source_url,
        fetchedAt: streetViewEnrichment.fetched_at,
        confidence: streetViewEnrichment.confidence,
        captureDate: streetViewCaptureDate,
    } : null;

    // Derive fire risk data
    const fireRiskEnrichment = enrichments.find(e => e.field_key === 'fire_risk_label');
    const fireRiskLabel = fireRiskEnrichment?.field_value || null;

    // ── Email Composition Guardrail Checks ──
    const emailGuardrailChecks: GuardrailCheck[] = useMemo(() => {
        const hasDecPageFile = !!decPageStoragePath;
        const hasRce = rceDocData.length > 0;
        const hasEnrichment = enrichments.length > 0;
        const flagsHaveBeenRun = allFlags.length > 0;
        const hasDic = dicDocData.length > 0;

        return [
            {
                id: 'dec_page',
                label: 'Declaration Page',
                description: hasDecPageFile ? 'Dec page uploaded and available' : 'No dec page found — upload one first',
                passed: hasDecPageFile,
                required: true,
                icon: <FileText size={16} />,
            },
            {
                id: 'rce',
                label: 'RCE Document',
                description: hasRce ? 'RCE data has been extracted' : 'No RCE document processed for this policy',
                passed: hasRce,
                required: true,
                icon: <ShieldCheck size={16} />,
            },
            {
                id: 'enrichment',
                label: 'Property Data Enrichment',
                description: hasEnrichment ? `${enrichments.length} enrichment field(s) available` : 'Property enrichment has not been run',
                passed: hasEnrichment,
                required: true,
                icon: <Satellite size={16} />,
            },
            {
                id: 'flags',
                label: 'Flag System Evaluated',
                description: flagsHaveBeenRun ? `${allFlags.length} flag(s) evaluated` : 'Flag check has not been run yet',
                passed: flagsHaveBeenRun,
                required: true,
                icon: <Flag size={16} />,
            },
            {
                id: 'dic',
                label: 'DIC Document',
                description: hasDic ? 'DIC policy data has been extracted' : 'No DIC document — recommended before emailing',
                passed: hasDic,
                required: false,
                icon: <ShieldAlert size={16} />,
            },
        ];
    }, [decPageStoragePath, rceDocData, enrichments, allFlags, dicDocData]);

    const handleComposeEmail = useCallback(() => {
        const requiredChecks = emailGuardrailChecks.filter(c => c.required);
        const allRequiredPassed = requiredChecks.every(c => c.passed);

        if (allRequiredPassed) {
            // All requirements met — go straight to composer
            setShowEmailComposer(true);
        } else {
            // Show guardrail modal
            setShowGuardrailModal(true);
        }
    }, [emailGuardrailChecks]);

    const copyPolicyNumber = () => {
        if (declaration?.policy_number) {
            navigator.clipboard.writeText(declaration.policy_number);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    useEffect(() => {
        if (!id) return;

        async function loadData() {
            setLoading(true);
            try {
                const detail = await getPolicyDetailById(id);
                if (detail) {
                    setPolicyDetailRaw(detail);
                    const decl = mapPolicyDetailToDeclaration(detail);
                    setDeclaration(decl);
                }
            } catch (error) {
                logger.error('page', "Failed to fetch policy data", { error: error instanceof Error ? error.message : String(error) })
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, [id]);

    // Fetch flag counts for the indicator pill
    useEffect(() => {
        if (!id) return;
        fetchFlagsByPolicyId(id).then(flags => {
            setAllFlags(flags);
            const open = flags.filter((f: PolicyFlagRow) => !f.status || f.status === 'open');
            setOpenFlags(open);
            setFlagSummary({
                total: open.length,
                high: open.filter((f: PolicyFlagRow) => f.severity === 'high').length,
                medium: open.filter((f: PolicyFlagRow) => f.severity === 'medium').length,
                low: open.filter((f: PolicyFlagRow) => f.severity === 'low').length,
            });
        });

        // Fetch property enrichments (source-tracked data)
        getPropertyEnrichments(id).then(setEnrichments);

        // Fetch full RCE document data (doc_data_rce)
        fetchRceDocDataByPolicyId(id).then(setRceDocData);

        // Fetch full DIC document data (doc_data_dic)
        fetchDicDocDataByPolicyId(id).then(setDicDocData);

        // Fetch report existence
        getLatestReportForPolicy(id).then(r => {
            if (r) setReportRow(r);
        });

        // Fetch dec page file for the Dec Page button
        fetchDecPageFilesByPolicyId(id).then(files => {
            if (files.length > 0 && files[0].storage_path) {
                setDecPageStoragePath(files[0].storage_path);
            }
        });

        // Fetch DIC and RCE documents for header document buttons
        fetchPlatformDocumentsByPolicyId(id).then(docs => {
            const dicDoc = docs.find(d => d.doc_type === 'dic_dec_page' && d.storage_path);
            if (dicDoc?.storage_path) {
                setDicDocStoragePath(dicDoc.storage_path);
            }
            const rceDoc = docs.find(d => d.doc_type === 'rce' && d.storage_path);
            if (rceDoc?.storage_path) {
                setRceDocStoragePath(rceDoc.storage_path);
            }
        });

        // Fetch renewal email log
        fetchRenewalEmailLog(id).then(setEmailLog);
    }, [id]);

    // Helper: refresh all policy data (enrichments, flags, report, etc.)
    const refreshAllData = useCallback(async () => {
        if (!id) return;
        try {
            const [newEnrichments, newFlags, newReport, newRceData, newDicData] = await Promise.all([
                getPropertyEnrichments(id),
                fetchFlagsByPolicyId(id),
                getLatestReportForPolicy(id),
                fetchRceDocDataByPolicyId(id),
                fetchDicDocDataByPolicyId(id),
            ]);
            setEnrichments(newEnrichments);
            setRceDocData(newRceData);
            setDicDocData(newDicData);
            setAllFlags(newFlags);
            const open = newFlags.filter((f: PolicyFlagRow) => !f.status || f.status === 'open');
            setOpenFlags(open);
            setFlagSummary({
                total: open.length,
                high: open.filter((f: PolicyFlagRow) => f.severity === 'high').length,
                medium: open.filter((f: PolicyFlagRow) => f.severity === 'medium').length,
                low: open.filter((f: PolicyFlagRow) => f.severity === 'low').length,
            });
            if (newReport) setReportRow(newReport);
            // Also refresh dec page file
            fetchDecPageFilesByPolicyId(id).then(files => {
                if (files.length > 0 && files[0].storage_path) {
                    setDecPageStoragePath(files[0].storage_path);
                }
            });
            // Also refresh DIC and RCE documents
            fetchPlatformDocumentsByPolicyId(id).then(docs => {
                const dicDoc = docs.find(d => d.doc_type === 'dic_dec_page' && d.storage_path);
                if (dicDoc?.storage_path) {
                    setDicDocStoragePath(dicDoc.storage_path);
                }
                const rceDoc = docs.find(d => d.doc_type === 'rce' && d.storage_path);
                if (rceDoc?.storage_path) {
                    setRceDocStoragePath(rceDoc.storage_path);
                }
            });
        } catch (e) {
            logger.error('page', '[PolicyPage] Failed to refresh data:', { error: e instanceof Error ? e.message : String(e) })
        }
    }, [id]);

    // Auto-refresh when a dec page finishes processing in the background
    useEffect(() => {
        const handleDecPageParsed = () => {
            logger.info('page', '[PolicyPage] Dec page parsed — refreshing all data')
            setBgProcessing(false);
            setBgProcessingStep(null);
            refreshAllData();
        };
        window.addEventListener('decPageParsed', handleDecPageParsed);
        return () => window.removeEventListener('decPageParsed', handleDecPageParsed);
    }, [refreshAllData]);

    // Detect if a dec page is being processed in the background for this policy
    useEffect(() => {
        if (!id) return;
        const TRACKING_KEY = 'cfp_pending_dec_uploads';
        const stored = sessionStorage.getItem(TRACKING_KEY);
        if (!stored) return;

        let pendingIds: string[];
        try { pendingIds = JSON.parse(stored); } catch { return; }
        if (!Array.isArray(pendingIds) || pendingIds.length === 0) return;

        // There's a pending upload — show the banner
        setBgProcessing(true);

        // Poll the processing step for richer status
        const poll = async () => {
            try {
                const { data: { session } } = await (await import('@/lib/supabaseClient')).supabase.auth.getSession();
                if (!session?.access_token) return;

                // Re-read from sessionStorage each tick (DecPageObserver may have pruned some)
                const freshStored = sessionStorage.getItem(TRACKING_KEY);
                if (!freshStored) {
                    setBgProcessing(false);
                    setBgProcessingStep(null);
                    return;
                }
                let currentIds: string[];
                try { currentIds = JSON.parse(freshStored); } catch { return; }
                if (!Array.isArray(currentIds) || currentIds.length === 0) {
                    sessionStorage.removeItem(TRACKING_KEY);
                    setBgProcessing(false);
                    setBgProcessingStep(null);
                    return;
                }

                const res = await fetch(`/api/upload/status?ids=${currentIds.join(',')}`, {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                });
                if (!res.ok) return;
                const json = await res.json();
                if (!json.success || !json.data) return;

                const statuses = json.data as Array<{ id: string; status: string; processing_step?: string }>;

                // Prune terminal IDs from sessionStorage so we stop polling them
                const terminalStatuses = new Set(['parsed', 'failed', 'duplicate']);
                const stillPending = currentIds.filter(cid => {
                    const row = statuses.find(s => s.id === cid);
                    // Keep if not found in DB (might be a timing issue) or still processing
                    return !row || !terminalStatuses.has(row.status);
                });

                if (stillPending.length !== currentIds.length) {
                    if (stillPending.length === 0) {
                        sessionStorage.removeItem(TRACKING_KEY);
                    } else {
                        sessionStorage.setItem(TRACKING_KEY, JSON.stringify(stillPending));
                    }
                }

                const active = statuses.find(s => s.status === 'processing' || s.status === 'queued');
                if (active) {
                    setBgProcessing(true);
                    const stepLabels: Record<string, string> = {
                        extracting_text: 'Extracting text from PDF…',
                        parsing_fields: 'Parsing declaration fields…',
                        creating_records: 'Creating policy records…',
                        enriching_property: 'Enriching property data…',
                        evaluating_flags: 'Evaluating flags…',
                        generating_report: 'Generating report…',
                        complete: 'Finalizing…',
                    };
                    setBgProcessingStep(stepLabels[active.processing_step || ''] || 'Processing…');
                } else {
                    // All done or none active anymore
                    setBgProcessing(false);
                    setBgProcessingStep(null);
                    refreshAllData();
                }
            } catch { /* non-fatal */ }
        };
        poll();
        const interval = setInterval(poll, 4000);
        return () => clearInterval(interval);
    }, [id, refreshAllData]);

    // Derived: enrichment status for the status bar
    const isEnriched = enrichments.length > 0;
    const lastEnrichedDate = isEnriched
        ? new Date(enrichments.reduce((latest, e) => {
            const t = new Date(e.fetched_at).getTime();
            return t > latest ? t : latest;
        }, 0)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null;

    // Derived: flag check status — if any flags exist (including resolved), the evaluator has run
    const flagsChecked = allFlags.length > 0;
    const lastCheckedDate = flagsChecked
        ? new Date(allFlags.reduce((latest, f) => {
            const t = new Date(f.created_at || 0).getTime();
            return t > latest ? t : latest;
        }, 0)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null;

    // Enrichment handler (shared between status bar)
    const handleEnrich = async () => {
        // Guard: enrichment requires a property address
        const address = policyDetailRaw?.property_address;
        if (!address) {
            toast.error('No property address on this policy — add an address before running enrichment.');
            return;
        }

        const steps = [
            'Fetching satellite image…',
            'Geocoding address…',
            'Checking fire risk…',
            'Running AI vision analysis…',
            'Finalizing…',
        ];
        let stepIdx = 0;
        setEnrichStep(steps[0]);
        const timer = setInterval(() => {
            stepIdx++;
            if (stepIdx < steps.length) {
                setEnrichStep(steps[stepIdx]);
            }
        }, 4000);
        try {
            await runPropertyEnrichment(id);
            clearInterval(timer);
            setEnrichStep('✓ Complete!');
            const updated = await getPropertyEnrichments(id);
            setEnrichments(updated);
            setTimeout(() => setEnrichStep(null), 2000);
        } catch (e: any) {
            clearInterval(timer);
            const msg = e?.message || 'Enrichment failed';
            toast.error(msg);
            setEnrichStep('✗ Failed — try again');
            setTimeout(() => setEnrichStep(null), 3000);
        }
    };

    // Flag check handler
    const handleFlagCheck = async () => {
        setFlagCheckRunning(true);
        try {
            await runFlagCheck(id);
            // Refresh flags
            const flags = await fetchFlagsByPolicyId(id);
            setAllFlags(flags);
            const open = flags.filter((f: PolicyFlagRow) => !f.status || f.status === 'open');
            setOpenFlags(open);
            setFlagSummary({
                total: open.length,
                high: open.filter((f: PolicyFlagRow) => f.severity === 'high').length,
                medium: open.filter((f: PolicyFlagRow) => f.severity === 'medium').length,
                low: open.filter((f: PolicyFlagRow) => f.severity === 'low').length,
            });
        } catch (e) {
            logger.error('page', 'Flag check failed:', { error: e instanceof Error ? e.message : String(e) })
        } finally {
            setFlagCheckRunning(false);
        }
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'overview':
                return (
                    <div className={styles.content}>
                        <PolicyOverviewTab
                            declaration={declaration!}
                            policyDetail={policyDetailRaw || undefined}
                            enrichments={enrichments}
                            onEditPolicy={() => setIsEditOpen(true)}
                        />
                        <AgentReviewPanel
                            reportRow={reportRow}
                            reportLink={reportRow ? `/report/${reportRow.id}` : undefined}
                        />
                    </div>
                );
            case 'terms':
                return (
                    <div className={styles.content}>
                        <TermHistoryPanel
                            terms={policyDetailRaw?.all_terms || []}
                            activeTermId={policyDetailRaw?.policy_term_id}
                            policyNumber={policyDetailRaw?.policy_number}
                        />
                    </div>
                );
            case 'cfp':
                return (
                    <div className={styles.content}>
                        <PolicyCfpDetailsTab declaration={declaration!} policyDetail={policyDetailRaw || undefined} enrichments={enrichments} />
                    </div>
                );
            case 'dic':
                return (
                    <div className={styles.content}>
                        <PolicyDicDetailsTab declaration={declaration!} policyDetail={policyDetailRaw || undefined} dicDocData={dicDocData} />
                    </div>
                );
            case 'rce':
                return (
                    <div className={styles.content}>
                        <PolicyRceTab declaration={declaration!} enrichments={enrichments} rceDocData={rceDocData} />
                    </div>
                );
            case 'flags':
                return (
                    <div className={styles.content}>
                        <PolicyFlags policyId={id} clientId={declaration?.client_id || undefined} />
                    </div>
                );
            case 'notes':
                return (
                    <div className={styles.content}>
                        <NotesPanel
                            clientId={declaration?.client_id || ''}
                            policyId={id}
                            showPolicySections
                        />
                    </div>
                );
            case 'activity':
                return (
                    <div className={styles.content}>
                        <ActivityTimeline policyId={id} />
                    </div>
                );
            case 'files':
                return (
                    <div className={styles.content}>
                        <PolicyFiles policyId={id} onDecPageApproved={() => {
                            getPolicyDetailById(id).then(detail => {
                                if (detail) {
                                    setPolicyDetailRaw(detail);
                                    setDeclaration(mapPolicyDetailToDeclaration(detail));
                                }
                            });
                        }} />
                    </div>
                );
            default:
                return null;
        }
    };

    // Client-specific view rendered AFTER all hooks
    if (isCustomer) {
        return <ClientPolicyView policyId={id} />;
    }

    if (loading) {
        return (
            <div className={styles.skeletonContainer}>
                <div className={styles.skeletonBanner} />
                <div className={styles.skeletonHeader}>
                    <div className={`${styles.skeletonLine} ${styles.wide}`} />
                    <div className={`${styles.skeletonLine} ${styles.medium}`} />
                    <div className={`${styles.skeletonLine} ${styles.narrow}`} />
                </div>
                <div className={styles.skeletonCards}>
                    <div className={styles.skeletonCard} />
                    <div className={styles.skeletonCard} />
                    <div className={styles.skeletonCard} />
                </div>
                <div className={styles.skeletonTabs}>
                    <div className={styles.skeletonTab} />
                    <div className={styles.skeletonTab} />
                    <div className={styles.skeletonTab} />
                    <div className={styles.skeletonTab} />
                    <div className={styles.skeletonTab} />
                </div>
                <div className={styles.skeletonContent} />
            </div>
        );
    }

    if (!declaration) {
        return (
            <div className={styles.container}>
                <Link href="/dashboard">
                    <Button variant="outline" className={styles.backButton}>
                        <ArrowLeft size={16} style={{ marginRight: '8px' }} />
                        Back to Dashboard
                    </Button>
                </Link>
                <div style={{ marginTop: '2rem' }}>Policy not found for ID: {id}</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Property Banner — state-aware (not-enriched / loading / enriched / error) */}
            <PropertyBanner
                imageSrc={bannerImageSrc}
                imageSource={imageSource}
                streetViewSrc={streetViewSrc}
                streetViewSource={streetViewSource}
                fireRiskLabel={fireRiskLabel}
                propertyAddress={policyDetailRaw?.property_address || null}
                isEnriching={enrichStep !== null && enrichStep !== '✓ Complete!' && enrichStep !== '✗ Failed — try again'}
                enrichStep={enrichStep}
                onEnrich={handleEnrich}
            />

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* Policy Identity Header                                        */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* Unified Policy Hero Card                                      */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className={styles.heroCard}>
                {/* ── Top Nav Row (Row 1) ── */}
                <div className={styles.heroNavRow}>
                    <Link href="/dashboard" style={{ textDecoration: 'none' }}>
                        <button className={styles.backButton}>
                            <ArrowLeft size={14} />
                            Dashboard
                        </button>
                    </Link>
                </div>

                {/* ── Status Bar Row (Row 2 — Full Width across card) ── */}
                <div className={styles.heroStatusBarRow}>
                    <PolicyStatusBar
                        isEnriched={isEnriched}
                        enrichmentCount={enrichments.length}
                        lastEnrichedDate={lastEnrichedDate}
                        flagsChecked={flagsChecked}
                        lastCheckedDate={lastCheckedDate}
                        openFlagCount={flagSummary.total}
                        highestSeverity={flagSummary.high > 0 ? 'high' : flagSummary.medium > 0 ? 'medium' : flagSummary.low > 0 ? 'low' : null}
                        enrichStep={enrichStep}
                        onEnrich={handleEnrich}
                        onRunFlagCheck={handleFlagCheck}
                        flagCheckRunning={flagCheckRunning}
                        enrichments={enrichments}
                        reportRow={reportRow}
                        isReportGenerating={isGeneratingReport}
                        isReportStale={isReportStale}
                        onGenerateReport={handleGenerateReport}
                        onViewReport={() => reportRow && window.open(`/report/${reportRow.id}`, '_blank')}
                    />
                </div>

                {/* ── Main Identity & Primary Actions ── */}
                <div className={styles.heroMain}>
                    <div className={styles.heroIdentity}>
                        <h1
                            className={styles.heroTitle}
                            onClick={() => declaration.client_id && router.push(`/client/${declaration.client_id}`)}
                            style={{ cursor: declaration.client_id ? 'pointer' : 'default' }}
                            title={declaration.client_id ? 'View client profile' : undefined}
                        >
                            {declaration.insured_name}
                        </h1>

                        <div className={styles.heroMeta}>
                            {/* Policy Number — Copyable chip */}
                            <div
                                onClick={copyPolicyNumber}
                                title="Click to copy policy number"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '0.2rem 0.6rem',
                                    background: 'rgba(99, 102, 241, 0.08)',
                                    border: '1px solid rgba(99, 102, 241, 0.2)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: 'var(--accent-primary)',
                                    letterSpacing: '0.01em',
                                    transition: 'all 0.15s ease',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {declaration.policy_number}
                                <span style={{ color: copied ? '#34d399' : 'var(--text-muted)', display: 'inline-flex' }}>
                                    {copied ? <Check size={12} /> : <Copy size={12} />}
                                </span>
                            </div>

                            {policyDetailRaw?.previous_policy_number && (
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '0.2rem 0.6rem',
                                    background: 'rgba(148, 163, 184, 0.08)',
                                    border: '1px solid rgba(148, 163, 184, 0.2)',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 500,
                                    color: 'var(--text-mid)',
                                    whiteSpace: 'nowrap',
                                }}>
                                    Prev: {policyDetailRaw.previous_policy_number}
                                </div>
                            )}

                            {policyDetailRaw?.property_address && (
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    fontSize: '0.8rem',
                                    color: 'var(--text-mid)',
                                    fontWeight: 500,
                                }}>
                                    <MapPin size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                    {policyDetailRaw.property_address}
                                </span>
                            )}
                            
                            <span style={{ color: 'var(--border-default)' }}>|</span>

                            {declaration.client_email && (
                                <span
                                    onClick={() => handleComposeEmail()}
                                    title="Compose email to client"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        transition: 'color 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                                >
                                    <Mail size={12} style={{ flexShrink: 0 }} />
                                    {declaration.client_email}
                                </span>
                            )}
                            {declaration.client_phone && (
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                }}>
                                    <Phone size={12} style={{ flexShrink: 0 }} />
                                    {declaration.client_phone}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className={styles.heroActions}>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleComposeEmail()}
                            title="Compose email to client"
                        >
                            <Mail size={14} />
                            Compose Email
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsWorkupOpen(true)}
                            title="Run full policy analysis"
                        >
                            <Zap size={14} />
                            Full Analysis
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsEditOpen(true)}
                            title="Edit Policy"
                        >
                            <Pencil size={14} />
                            Edit Policy
                        </Button>
                    </div>
                </div>

                {/* ── Dedicated Policy Documents Tray ── */}
                <div className={styles.heroFooter}>
                    <div className={styles.docTrayHeader}>
                        <FileText size={14} className={styles.docTrayIcon} />
                        <span className={styles.docTrayLabel}>Documents</span>
                    </div>

                    <div className={styles.docTrayItems}>
                        {/* Dec Page */}
                        {!decPageStoragePath ? (
                            <>
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        setDecPageLoading(true);
                                        try {
                                            const { supabase } = await import('@/lib/supabaseClient');
                                            const { data: { session } } = await supabase.auth.getSession();
                                            if (!session?.access_token) {
                                                toast.error('Session expired. Please refresh and sign in again.');
                                                return;
                                            }

                                            const formData = new FormData();
                                            formData.set('file', file);

                                            const res = await fetch('/api/upload', {
                                                method: 'POST',
                                                headers: { 'Authorization': `Bearer ${session.access_token}` },
                                                body: formData,
                                            });

                                            const json = await res.json();

                                            if (res.ok && json.success) {
                                                const submissionId = json.data?.submissionId;
                                                toast.success(`Declaration uploaded: ${json.data?.fileName || file.name}`);

                                                if (submissionId) {
                                                    try {
                                                        const key = 'cfp_pending_dec_uploads';
                                                        const stored = sessionStorage.getItem(key);
                                                        const pending = stored ? JSON.parse(stored) : [];
                                                        if (!pending.includes(submissionId)) {
                                                            pending.push(submissionId);
                                                            sessionStorage.setItem(key, JSON.stringify(pending));
                                                        }
                                                    } catch { /* non-critical */ }

                                                    window.dispatchEvent(new CustomEvent('decPageUploaded'));
                                                    setBgProcessing(true);
                                                    setBgProcessingStep('Queued for processing…');
                                                }
                                            } else {
                                                toast.error(json.message || 'Upload failed. Please try again.');
                                            }
                                        } catch (err) {
                                            logger.error('page', 'Error:', { error: err instanceof Error ? err.message : String(err) })
                                            toast.error('Network error during upload. Please try again.');
                                        } finally {
                                            setDecPageLoading(false);
                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    className={`${styles.docChip} ${styles.docChipEmpty}`}
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Upload Dec Page PDF"
                                    disabled={decPageLoading}
                                >
                                    {decPageLoading ? (
                                        <>
                                            <Loader2 size={13} className={styles.spin} />
                                            <span>Uploading…</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={13} />
                                            <span>Upload Dec Page</span>
                                        </>
                                    )}
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                className={styles.docChip}
                                onClick={async () => {
                                    setDecPageLoading(true);
                                    try {
                                        const url = await getDecPageFileDownloadUrl(decPageStoragePath);
                                        if (url) {
                                            window.open(url, '_blank');
                                        } else {
                                            toast.error('Could not generate download link.');
                                        }
                                    } catch {
                                        toast.error('Failed to open dec page file.');
                                    } finally {
                                        setDecPageLoading(false);
                                    }
                                }}
                                title="Open Dec Page PDF"
                                disabled={decPageLoading}
                            >
                                {decPageLoading ? (
                                    <>
                                        <Loader2 size={13} className={styles.spin} />
                                        <span>Opening…</span>
                                    </>
                                ) : (
                                    <>
                                        <FileDown size={13} style={{ color: '#6366f1' }} />
                                        <span>View Dec Page</span>
                                    </>
                                )}
                            </button>
                        )}

                        {/* RCE Document */}
                        {!rceDocStoragePath ? (
                            <>
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    ref={rceFileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        setRceDocLoading(true);
                                        try {
                                            const { supabase } = await import('@/lib/supabaseClient');
                                            const { data: { session } } = await supabase.auth.getSession();
                                            if (!session?.access_token) {
                                                toast.error('Session expired. Please refresh and sign in again.');
                                                return;
                                            }

                                            const formData = new FormData();
                                            formData.set('file', file);
                                            formData.set('doc_type', 'rce');
                                            formData.set('policy_id', id);

                                            const res = await fetch('/api/documents/upload', {
                                                method: 'POST',
                                                headers: { 'Authorization': `Bearer ${session.access_token}` },
                                                body: formData,
                                            });

                                            const json = await res.json();

                                            if (res.ok && json.success) {
                                                toast.success(`RCE uploaded: ${file.name}`);
                                                const docs = await fetchPlatformDocumentsByPolicyId(id);
                                                const rceDoc = docs.find(d => d.doc_type === 'rce' && d.storage_path);
                                                if (rceDoc?.storage_path) setRceDocStoragePath(rceDoc.storage_path);
                                                fetchRceDocDataByPolicyId(id).then(setRceDocData);
                                            } else {
                                                toast.error(json.message || 'RCE upload failed.');
                                            }
                                        } catch (err) {
                                            logger.error('page', 'Error:', { error: err instanceof Error ? err.message : String(err) });
                                            toast.error('Network error during RCE upload.');
                                        } finally {
                                            setRceDocLoading(false);
                                            if (rceFileInputRef.current) rceFileInputRef.current.value = '';
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    className={`${styles.docChip} ${styles.docChipEmpty}`}
                                    onClick={() => rceFileInputRef.current?.click()}
                                    title="Upload RCE (Replacement Cost Estimate) PDF"
                                    disabled={rceDocLoading}
                                >
                                    {rceDocLoading ? (
                                        <>
                                            <Loader2 size={13} className={styles.spin} />
                                            <span>Uploading…</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={13} />
                                            <span>Upload RCE</span>
                                        </>
                                    )}
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                className={styles.docChip}
                                onClick={async () => {
                                    setRceDocLoading(true);
                                    try {
                                        const url = await getPlatformDocDownloadUrl(rceDocStoragePath!);
                                        if (url) {
                                            window.open(url, '_blank');
                                        } else {
                                            toast.error('Could not generate RCE download link.');
                                        }
                                    } catch {
                                        toast.error('Failed to open RCE document.');
                                    } finally {
                                        setRceDocLoading(false);
                                    }
                                }}
                                title="Open Replacement Cost Estimate (RCE)"
                                disabled={rceDocLoading}
                            >
                                {rceDocLoading ? (
                                    <>
                                        <Loader2 size={13} className={styles.spin} />
                                        <span>Opening…</span>
                                    </>
                                ) : (
                                    <>
                                        <FileText size={13} style={{ color: '#f59e0b' }} />
                                        <span>View RCE</span>
                                    </>
                                )}
                            </button>
                        )}

                        {/* DIC Document */}
                        {!dicDocStoragePath ? (
                            <>
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    ref={dicFileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        setDicDocLoading(true);
                                        try {
                                            const { supabase } = await import('@/lib/supabaseClient');
                                            const { data: { session } } = await supabase.auth.getSession();
                                            if (!session?.access_token) {
                                                toast.error('Session expired. Please refresh and sign in again.');
                                                return;
                                            }

                                            const formData = new FormData();
                                            formData.set('file', file);
                                            formData.set('doc_type', 'dic_dec_page');
                                            formData.set('policy_id', id);

                                            const res = await fetch('/api/documents/upload', {
                                                method: 'POST',
                                                headers: { 'Authorization': `Bearer ${session.access_token}` },
                                                body: formData,
                                            });

                                            const json = await res.json();

                                            if (res.ok && json.success) {
                                                toast.success(`DIC uploaded: ${file.name}`);
                                                const docs = await fetchPlatformDocumentsByPolicyId(id);
                                                const dicDoc = docs.find(d => d.doc_type === 'dic_dec_page' && d.storage_path);
                                                if (dicDoc?.storage_path) setDicDocStoragePath(dicDoc.storage_path);
                                            } else {
                                                toast.error(json.message || 'DIC upload failed.');
                                            }
                                        } catch (err) {
                                            logger.error('page', 'Error:', { error: err instanceof Error ? err.message : String(err) })
                                            toast.error('Network error during DIC upload.');
                                        } finally {
                                            setDicDocLoading(false);
                                            if (dicFileInputRef.current) dicFileInputRef.current.value = '';
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    className={`${styles.docChip} ${styles.docChipEmpty}`}
                                    onClick={() => dicFileInputRef.current?.click()}
                                    title="Upload Companion DIC PDF"
                                    disabled={dicDocLoading}
                                >
                                    {dicDocLoading ? (
                                        <>
                                            <Loader2 size={13} className={styles.spin} />
                                            <span>Uploading…</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={13} />
                                            <span>Upload DIC</span>
                                        </>
                                    )}
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                className={styles.docChip}
                                onClick={async () => {
                                    setDicDocLoading(true);
                                    try {
                                        const url = await getPlatformDocDownloadUrl(dicDocStoragePath!);
                                        if (url) {
                                            window.open(url, '_blank');
                                        } else {
                                            toast.error('Could not generate DIC download link.');
                                        }
                                    } catch {
                                        toast.error('Failed to open DIC document.');
                                    } finally {
                                        setDicDocLoading(false);
                                    }
                                }}
                                title="Open DIC Document"
                                disabled={dicDocLoading}
                            >
                                {dicDocLoading ? (
                                    <>
                                        <Loader2 size={13} className={styles.spin} />
                                        <span>Opening…</span>
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck size={13} style={{ color: '#10b981' }} />
                                        <span>View DIC</span>
                                    </>
                                )}
                            </button>
                        )}

                        {/* Upload Document Button — Navigates to Files Tab */}
                        <button
                            type="button"
                            className={styles.uploadDocBtn}
                            onClick={() => {
                                setActiveTab('files');
                                document.getElementById('policy-tabs-section')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            title="Go to Files section to upload documents"
                        >
                            <FolderUp size={13} />
                            <span>Upload Document</span>
                        </button>
                    </div>
                </div>

                {/* ── Background Processing ── */}
                {bgProcessing && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.75rem 1.5rem',
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(59, 130, 246, 0.08))',
                        borderTop: '1px solid rgba(99, 102, 241, 0.2)',
                        fontSize: '0.85rem',
                        animation: 'fadeIn 0.3s ease',
                    }}>
                        <Loader2 size={16} style={{ color: '#6366f1', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                                Processing in background
                            </span>
                            <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                                {bgProcessingStep || 'Working…'}
                            </span>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                            Data will auto-refresh when complete
                        </span>
                        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                )}
            </div>



            {/* ── Flag Alert ── */}
            {openFlags.length > 0 && (
                <div className={styles.commandSection}>
                    <FlagAlertBanner flags={openFlags} onViewFlags={() => setActiveTab('flags')} />
                </div>
            )}

            {/* Tab Navigation */}
            <div id="policy-tabs-section" className={styles.tabsWrapper}>
                <Tabs tabs={policyTabs} defaultTab="overview" activeTab={activeTab} onChange={setActiveTab} />
            </div>

            {/* Tab Content */}
            {renderTabContent()}

            {/* Edit Panel */}
            {isEditOpen && policyDetailRaw && (
                <PolicyEditPanel
                    policyDetail={policyDetailRaw}
                    onClose={() => setIsEditOpen(false)}
                    onSaved={async () => {
                        setIsEditOpen(false);
                        const detail = await getPolicyDetailById(id);
                        if (detail) {
                            setPolicyDetailRaw(detail);
                            setDeclaration(mapPolicyDetailToDeclaration(detail));
                        }
                    }}
                />
            )}

            {/* Full Workup Modal */}
            <FullWorkupModal
                isOpen={isWorkupOpen}
                onClose={() => setIsWorkupOpen(false)}
                policyIds={[id]}
                onComplete={async () => {
                    // Refresh enrichment, flags, and report data
                    const [enrichData, flagData, reportData] = await Promise.all([
                        getPropertyEnrichments(id),
                        fetchFlagsByPolicyId(id),
                        getLatestReportForPolicy(id),
                    ]);
                    setEnrichments(enrichData);
                    setOpenFlags(flagData.filter(f => (!f.status && !f.resolved_at) || f.status === 'open'));
                    setAllFlags(flagData);
                    if (reportData) setReportRow(reportData);
                }}
            />

            {/* Email Guardrail Check Modal */}
            <EmailGuardrailModal
                isOpen={showGuardrailModal}
                onClose={() => setShowGuardrailModal(false)}
                checks={emailGuardrailChecks}
                onProceed={() => {
                    setShowGuardrailModal(false);
                    setShowEmailComposer(true);
                }}
                onOverride={() => {
                    setShowGuardrailModal(false);
                    setShowEmailComposer(true);
                }}
            />

            {/* Premium Email Composer */}
            <PolicyEmailComposer
                isOpen={showEmailComposer}
                onClose={() => setShowEmailComposer(false)}
                policyId={id}
                clientId={policyDetailRaw?.client_id || ''}
                reportId={reportRow?.id || ''}
                reportUrl={reportRow ? `${typeof window !== 'undefined' ? window.location.origin : ''}/report/${reportRow.id}` : undefined}
                clientEmail={policyDetailRaw?.client_email || ''}
                clientName={policyDetailRaw?.named_insured || declaration?.insured_name || ''}
                policyNumber={policyDetailRaw?.policy_number || declaration?.policy_number || ''}
                propertyAddress={policyDetailRaw?.property_address || ''}
                agentName="Alsop and Associates Insurance Agency"
                emailLog={emailLog}
                onMarkSent={(entry) => setEmailLog(prev => [entry, ...prev])}
            />
        </div>
    );
}
