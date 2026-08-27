'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { FileText, Loader2, Download, Eye, AlertCircle, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import {
  fetchPlatformDocumentsByClientId,
  getPlatformDocDownloadUrl,
  deleteDocument,
  PlatformDocumentInfo,
} from '@/lib/api';
import { useToast } from '@/components/ui/Toast/Toast';
import styles from './ClientFiles.module.css';
import { logger } from '@/lib/logger';


interface ClientFilesProps {
  clientId: string;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
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
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const toast = useToast();

  const loadFiles = useCallback(async () => {
    try {
      const platformData = await fetchPlatformDocumentsByClientId(clientId);
      setPlatformDocs(platformData);
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
  const handleView = useCallback(async (doc: PlatformDocumentInfo) => {
    if (!doc.storage_path) return;
    setActionId(doc.id + '_view');
    try {
      const url = await getPlatformDocDownloadUrl(doc.storage_path);
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
  const handleDownload = useCallback(async (doc: PlatformDocumentInfo) => {
    if (!doc.storage_path) return;
    setActionId(doc.id + '_dl');
    try {
      const url = await getPlatformDocDownloadUrl(doc.storage_path);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.file_name || 'document.pdf';
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
  const handleDelete = useCallback(async (doc: PlatformDocumentInfo) => {
    const isRce = doc.doc_type === 'rce';
    const confirmMsg = isRce
      ? `Delete "${doc.file_name || 'this RCE'}"?\n\nThis will also remove all RCE enrichment data associated with this client.\n\nThis action cannot be undone.`
      : `Are you sure you want to delete ${doc.file_name || 'this document'}?\nThis action cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setActionId(doc.id + '_delete');
    try {
      const success = await deleteDocument(doc.id, 'platform');
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

  // Group files by doc_type
  const groupOrder = ['dic_dec_page', 'rce', 'invoice', 'inspection', 'endorsement', 'questionnaire'];
  const grouped = new Map<string, PlatformDocumentInfo[]>();
  platformDocs.forEach(d => {
    const key = d.doc_type;
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
        <span className={styles.fileCount}>({platformDocs.length})</span>
      </h3>

      {platformDocs.length === 0 ? (
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

                    return (
                      <div key={file.id} className={styles.fileItem}>
                        <div className={styles.fileInfo}>
                          <div className={styles.fileIconWrap} style={{ '--doc-color': docTypeInfo.color } as React.CSSProperties}>
                            <FileText size={18} />
                          </div>
                          <div className={styles.fileDetails}>
                            <div className={styles.fileName}>
                              <span
                                className={styles.docTypeBadge}
                                style={{
                                  backgroundColor: `${docTypeInfo.color}18`,
                                  color: docTypeInfo.color,
                                  borderColor: `${docTypeInfo.color}30`,
                                }}
                              >
                                {docTypeInfo.label}
                              </span>
                              <span className={styles.fileNameText}>{file.file_name || 'Document'}</span>
                              {!file.policy_id && (
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
