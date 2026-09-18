'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { FileText, Loader2, Download, Eye, AlertCircle, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import {
  fetchPlatformDocumentsByClientId,
  fetchDecPageFilesByClientId,
  getPlatformDocDownloadUrl,
  getDecPageFileDownloadUrl,
  deleteDocument,
  PlatformDocumentInfo,
  DecPageFileInfo,
} from '@/lib/api';
import { useToast } from '@/components/ui/Toast/Toast';
import { detectDocumentCarrier } from '@/lib/carrierBadges';
import styles from './ClientFiles.module.css';
import { logger } from '@/lib/logger';

interface ClientFilesProps {
  clientId: string;
}

interface UnifiedClientFile {
  id: string;
  source: 'dec_page' | 'platform';
  doc_type: string;
  file_name: string | null;
  file_size: number | null;
  storage_path: string | null;
  parse_status: string | null;
  processing_step?: string | null;
  match_status?: string;
  error_message?: string | null;
  created_at: string;
  uploaded_by?: string | null;
  carrier_name?: string | null;
  source_name?: string | null;
  created_by?: string | null;
  policy_id?: string | null;
  policy_number?: string | null;
  bucket?: string;
  dic_data?: {
    carrier_name?: string | null;
    policy_number?: string | null;
    document_type?: string | null;
    has_dic_endorsement?: boolean | null;
    basic_premium?: number | null;
    total_charge?: number | null;
    cov_a_dwelling?: string | null;
  } | null;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getParseStatusBadge(status: string | null): { label: string; color: string; icon: React.ReactNode } {
  switch (status) {
    case 'parsed': return { label: 'Complete', color: 'var(--status-success)', icon: <CheckCircle size={12} /> };
    case 'needs_review': return { label: 'Needs Review', color: 'var(--status-warning)', icon: <AlertCircle size={12} /> };
    case 'failed': return { label: 'Failed', color: 'var(--status-error)', icon: <XCircle size={12} /> };
    case 'processing': return { label: 'Processing', color: 'var(--accent-secondary, #6366f1)', icon: <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> };
    case 'queued': return { label: 'Queued', color: 'var(--accent-secondary, #8b5cf6)', icon: <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> };
    case 'manual': return { label: 'Complete', color: 'var(--status-success)', icon: <CheckCircle size={12} /> };
    case 'duplicate': return { label: 'Duplicate', color: 'var(--text-muted)', icon: <CheckCircle size={12} /> };
    default: return { label: 'Processing', color: 'var(--text-muted)', icon: <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> };
  }
}

const DOC_TYPE_LABELS: Record<string, { label: string; color: string; groupLabel: string }> = {
  dec_page: { label: 'DEC PAGE', color: '#3b82f6', groupLabel: 'Declaration Pages' },
  quote: { label: 'QUOTE', color: '#06b6d4', groupLabel: 'Carrier Quotes' },
  rce: { label: 'RCE', color: '#10b981', groupLabel: 'RCE Documents' },
  dic_dec_page: { label: 'DIC', color: '#f97316', groupLabel: 'DIC Documents' },
  es_doc: { label: 'E&S', color: '#8b5cf6', groupLabel: 'E&S Documents' },
  other: { label: 'OTHER', color: '#a855f7', groupLabel: 'Other Documents' },
  invoice: { label: 'INVOICE', color: '#8b5cf6', groupLabel: 'Invoices' },
  inspection: { label: 'INSPECTION', color: '#ec4899', groupLabel: 'Inspections' },
  endorsement: { label: 'ENDORSEMENT', color: '#06b6d4', groupLabel: 'Endorsements' },
  questionnaire: { label: 'QUESTIONNAIRE', color: '#84cc16', groupLabel: 'Questionnaires' },
};

export function ClientFiles({ clientId }: ClientFilesProps) {
  const [platformDocs, setPlatformDocs] = useState<PlatformDocumentInfo[]>([]);
  const [decFiles, setDecFiles] = useState<DecPageFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const toast = useToast();

  const loadFiles = useCallback(async () => {
    try {
      const [platformData, decData] = await Promise.all([
        fetchPlatformDocumentsByClientId(clientId),
        fetchDecPageFilesByClientId(clientId),
      ]);
      setPlatformDocs(platformData);
      setDecFiles(decData);
    } catch (err) {
      logger.error('ClientFiles', 'Failed to fetch client files:', { error: err instanceof Error ? err.message : String(err) })
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // View: opens signed URL in new tab
  const handleView = useCallback(async (file: UnifiedClientFile) => {
    if (!file.storage_path) return;
    setActionId(file.id + '_view');
    try {
      let url: string | null = null;
      if (file.source === 'dec_page') {
        url = await getDecPageFileDownloadUrl(file.storage_path);
      } else {
        url = await getPlatformDocDownloadUrl(file.storage_path, file.bucket);
      }
      if (url) {
        window.open(url, '_blank');
      } else {
        toast.error('Could not generate preview link.');
      }
    } catch (err) {
      logger.error('ClientFiles', 'View failed:', { error: err instanceof Error ? err.message : String(err) })
      toast.error('Failed to open file.');
    } finally {
      setActionId(null);
    }
  }, [toast]);

  // Download URL
  const handleDownload = useCallback(async (file: UnifiedClientFile) => {
    if (!file.storage_path) return;
    setActionId(file.id + '_dl');
    try {
      let url: string | null = null;
      if (file.source === 'dec_page') {
        url = await getDecPageFileDownloadUrl(file.storage_path);
      } else {
        url = await getPlatformDocDownloadUrl(file.storage_path, file.bucket);
      }
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = file.file_name || 'document.pdf';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 100);
      } else {
        toast.error('Could not generate download link.');
      }
    } catch (err) {
      logger.error('ClientFiles', 'Download failed:', { error: err instanceof Error ? err.message : String(err) })
      toast.error('Failed to download file.');
    } finally {
      setActionId(null);
    }
  }, [toast]);

  // Delete
  const handleDelete = useCallback(async (file: UnifiedClientFile) => {
    const isRce = file.source === 'platform' && file.doc_type === 'rce';
    const confirmMsg = isRce
      ? `Delete "${file.file_name || 'this RCE'}"?\n\nThis will also remove all RCE enrichment data associated with this client.\n\nThis action cannot be undone.`
      : `Are you sure you want to delete ${file.file_name || 'this document'}?\nThis action cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setActionId(file.id + '_delete');
    try {
      const success = await deleteDocument(file.id, file.source);
      if (success) {
        toast.success('Document deleted successfully.');
        await loadFiles();
      } else {
        toast.error('Failed to delete document.');
      }
    } catch (err) {
      logger.error('ClientFiles', 'Delete failed:', { error: err instanceof Error ? err.message : String(err) })
      toast.error('Failed to delete document.');
    } finally {
      setActionId(null);
    }
  }, [toast, loadFiles]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <Loader2 className={styles.spinner} />
          <span>Loading client documents...</span>
        </div>
      </div>
    );
  }

  // Deduplicate and combine files
  const decFileNames = new Set(decFiles.map(f => (f.file_name || '').toLowerCase()));
  const decStoragePaths = new Set(decFiles.map(f => (f.storage_path || '').toLowerCase()));

  const filteredPlatformDocs = platformDocs.filter(d => {
    const fn = (d.file_name || '').toLowerCase();
    const sp = (d.storage_path || '').toLowerCase();
    if ((d.doc_type as string) === 'other' && (decFileNames.has(fn) || decStoragePaths.has(sp))) {
      return false;
    }
    return true;
  });

  const allFiles: UnifiedClientFile[] = [
    ...decFiles.map(f => ({
      id: f.id,
      source: 'dec_page' as const,
      doc_type: 'dec_page',
      file_name: f.file_name,
      file_size: f.file_size,
      storage_path: f.storage_path,
      parse_status: f.parse_status,
      created_at: f.uploaded_at,
      uploaded_by: f.uploaded_by,
      policy_number: f.policy_number,
      bucket: 'cfp-raw-decpage',
    })),
    ...filteredPlatformDocs.map(d => ({
      id: d.id,
      source: 'platform' as const,
      doc_type: d.doc_type,
      file_name: d.file_name,
      file_size: d.file_size,
      storage_path: d.storage_path,
      parse_status: d.parse_status,
      processing_step: d.processing_step,
      match_status: d.match_status,
      error_message: d.error_message,
      created_at: d.created_at,
      uploaded_by: d.uploaded_by,
      carrier_name: d.carrier_name,
      source_name: d.source,
      created_by: d.created_by,
      policy_id: d.policy_id,
      bucket: 'cfp-platform-documents',
      dic_data: d.dic_data,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Group files by doc_type
  const groupOrder = ['dec_page', 'quote', 'dic_dec_page', 'es_doc', 'rce', 'invoice', 'inspection', 'endorsement', 'questionnaire'];
  const grouped = new Map<string, UnifiedClientFile[]>();
  allFiles.forEach(d => {
    const fn = (d.file_name || '').toLowerCase();
    const dicDocType = (d.dic_data?.document_type || '').toLowerCase();
    let key = d.doc_type;
    if (d.doc_type === 'rce' || (fn.includes('rce') && !fn.includes('quote')) || fn.includes('360value') || fn.includes('valuation')) {
      key = 'rce';
    } else if (d.doc_type === 'quote' || (fn.includes('quote') && !fn.includes('dec')) || dicDocType.includes('quote')) {
      key = 'quote';
    } else if (
      d.doc_type === 'dec_page' ||
      (fn.includes('dec') && !fn.includes('quote') && !fn.includes('rce')) ||
      fn.includes('declaration') ||
      (d.carrier_name && d.carrier_name.toLowerCase().includes('california fair plan'))
    ) {
      key = 'dec_page';
    }
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(d);
  });

  const sortedGroupKeys = [...grouped.keys()].sort((a, b) => {
    const ai = groupOrder.indexOf(a);
    const bi = groupOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <div className={styles.filesSection}>
      <h3 className={styles.sectionTitle}>
        Client Documents
        <span className={styles.fileCount}>({allFiles.length})</span>
      </h3>

      {allFiles.length === 0 ? (
        <div className={styles.emptyState}>
          <FileText className={styles.emptyIcon} />
          <p>No documents linked to this client profile yet.</p>
          <p className={styles.emptyHint}>
            Upload a document via the Upload tool and assign it to this client.
          </p>
        </div>
      ) : (
        <div className={styles.fileGroups}>
          {sortedGroupKeys.map(groupKey => {
            const files = grouped.get(groupKey)!;
            const typeInfo = DOC_TYPE_LABELS[groupKey] || { label: groupKey.toUpperCase(), color: 'var(--text-muted)', groupLabel: groupKey };
            return (
              <div key={groupKey} className={styles.fileGroup}>
                <div className={styles.fileGroupHeader}>
                  <span
                    className={styles.fileGroupDot}
                    style={{ background: typeInfo.color }}
                  />
                  <span className={styles.fileGroupTitle}>{typeInfo.groupLabel}</span>
                  <span className={styles.fileGroupCount}>{files.length}</span>
                </div>
                <div className={styles.fileList}>
                  {files.map(file => {
                    const parseStatus = getParseStatusBadge(file.parse_status);
                    const docTypeInfo = DOC_TYPE_LABELS[file.doc_type] || { label: file.doc_type.toUpperCase(), color: 'var(--text-muted)' };
                    const carrierBadge = detectDocumentCarrier({
                      file_name: file.file_name,
                      doc_type: file.doc_type,
                      carrier_name: file.carrier_name,
                      source: file.source,
                      created_by: file.created_by,
                    });

                    const fnLower = (file.file_name || '').toLowerCase();
                    const isDecPage = groupKey === 'dec_page' || file.doc_type === 'dec_page' || (fnLower.includes('dec') && !fnLower.includes('quote') && !fnLower.includes('rce')) || fnLower.includes('declaration') || (file.carrier_name && file.carrier_name.toLowerCase().includes('california fair plan'));
                    const isQuote = groupKey === 'quote' || file.doc_type === 'quote';
                    const isRce = groupKey === 'rce' || file.doc_type === 'rce';

                    let docBadgeLabel = docTypeInfo.label;
                    let docBadgeColor = docTypeInfo.color;

                    if (isDecPage) {
                      docBadgeLabel = 'DEC PAGE';
                      docBadgeColor = '#3b82f6';
                    } else if (isQuote) {
                      docBadgeLabel = 'QUOTE';
                      docBadgeColor = '#06b6d4';
                    } else if (isRce) {
                      docBadgeLabel = 'RCE';
                      docBadgeColor = '#10b981';
                    }

                    return (
                      <div key={`${file.source}-${file.id}`} className={styles.fileItem}>
                        <div className={styles.fileInfo}>
                          <div className={styles.fileIconWrap} style={{ '--doc-color': docBadgeColor } as React.CSSProperties}>
                            <FileText size={18} />
                          </div>
                          <div className={styles.fileDetails}>
                            <div className={styles.fileName}>
                              <span
                                className={styles.docTypeBadge}
                                style={{
                                  backgroundColor: `${docBadgeColor}18`,
                                  color: docBadgeColor,
                                  borderColor: `${docBadgeColor}30`,
                                }}
                              >
                                {docBadgeLabel}
                              </span>
                              {carrierBadge && (
                                <span
                                  className={styles.carrierBadge}
                                  style={{
                                    backgroundColor: carrierBadge.bgColor,
                                    color: carrierBadge.textColor,
                                    borderColor: carrierBadge.borderColor,
                                  }}
                                  title={carrierBadge.tooltip}
                                >
                                  {carrierBadge.label}
                                </span>
                              )}
                              <span className={styles.fileNameText}>{file.file_name || 'Document'}</span>
                              {file.policy_number && (
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '4px',
                                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                                    color: '#60a5fa',
                                    border: '1px solid rgba(59, 130, 246, 0.25)',
                                    marginLeft: '0.5rem',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {file.policy_number}
                                </span>
                              )}
                              {!file.policy_id && !file.policy_number && file.source !== 'dec_page' && (
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '4px',
                                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                                    color: '#fbbf24',
                                    border: '1px solid rgba(245, 158, 11, 0.25)',
                                    marginLeft: '0.5rem',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  Unassigned
                                </span>
                              )}
                            </div>
                            <div className={styles.fileMeta}>
                              <span
                                className={styles.statusBadge}
                                style={{
                                  backgroundColor: `color-mix(in srgb, ${parseStatus.color} 12%, transparent)`,
                                  color: parseStatus.color,
                                }}
                              >
                                {parseStatus.icon}
                                <span>{parseStatus.label}</span>
                              </span>
                              {file.processing_step && file.parse_status === 'processing' && (
                                <span className={styles.processingStep}>
                                  {file.processing_step.replace(/_/g, ' ')}
                                </span>
                              )}
                              <span>{formatFileSize(file.file_size)}</span>
                              <span>{formatDate(file.created_at)}</span>
                              {file.uploaded_by && (
                                <span className={styles.uploadedByText}>
                                  Uploaded by: <strong className={styles.uploadedByName}>{file.uploaded_by}</strong>
                                </span>
                              )}
                            </div>
                            {file.error_message && file.parse_status !== 'parsed' && (
                              <div className={styles.errorMessage}>
                                {file.error_message}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={styles.fileActions}>
                          <button
                            className={styles.actionBtn}
                            title="View in new tab"
                            onClick={() => handleView(file)}
                            disabled={!file.storage_path || actionId === file.id + '_view'}
                          >
                            {actionId === file.id + '_view'
                              ? <Loader2 size={16} className={styles.spinnerSmall} />
                              : <Eye size={16} />
                            }
                          </button>
                          <button
                            className={styles.actionBtn}
                            title="Download file"
                            onClick={() => handleDownload(file)}
                            disabled={!file.storage_path || actionId === file.id + '_dl'}
                          >
                            {actionId === file.id + '_dl'
                              ? <Loader2 size={16} className={styles.spinnerSmall} />
                              : <Download size={16} />
                            }
                          </button>
                          <button
                            className={styles.actionBtn}
                            title="Delete file"
                            onClick={() => handleDelete(file)}
                            disabled={actionId === file.id + '_delete'}
                          >
                            {actionId === file.id + '_delete'
                              ? <Loader2 size={16} className={styles.spinnerSmall} />
                              : <Trash2 size={16} style={{ color: 'var(--status-error)' }} />
                            }
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
