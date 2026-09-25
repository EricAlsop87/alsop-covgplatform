'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import ExcelJS from 'exceljs';
import { toBlob, toPng } from 'html-to-image';
import { 
    Calendar, 
    FileSpreadsheet, 
    RefreshCw, 
    Copy, 
    Check, 
    ArrowUpRight,
    Camera,
    Download
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import styles from './CFPMonthlyMatrix.module.scss';
import type { MonthlyMatrixRow, MonthlyMatrixTotals } from '@/app/api/cfp-summary/monthly-matrix/route';

const CURRENT_YEAR = String(new Date().getFullYear());
const CURRENT_MONTH = new Date().getMonth() + 1;

// Global memory cache for instant sub-page switching
const clientMatrixCache = new Map<string, { matrix: MonthlyMatrixRow[]; totals: MonthlyMatrixTotals | null; timestamp: number }>();
const CLIENT_TTL_MS = 60_000;

export function CFPMonthlyMatrix() {
    const [year, setYear] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('ccn_cfp_matrix_year');
            if (saved) return saved;
        }
        return 'all';
    });

    const cachedInitial = clientMatrixCache.get(`matrix_${year}`);
    const [matrix, setMatrix] = useState<MonthlyMatrixRow[]>(() => cachedInitial?.matrix || []);
    const [totals, setTotals] = useState<MonthlyMatrixTotals | null>(() => cachedInitial?.totals || null);
    const [loading, setLoading] = useState(() => !cachedInitial);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [imageCapturing, setImageCapturing] = useState(false);

    const cardRef = useRef<HTMLDivElement | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3500);
    };

    const handleYearChange = (newYear: string) => {
        setYear(newYear);
        if (typeof window !== 'undefined') {
            localStorage.setItem('ccn_cfp_matrix_year', newYear);
        }
    };

    const fetchMatrixData = useCallback(async (tokenOverride?: string, forceRefresh = false) => {
        const cacheKey = `matrix_${year}`;
        const cached = clientMatrixCache.get(cacheKey);

        if (!forceRefresh && cached && Date.now() - cached.timestamp < CLIENT_TTL_MS) {
            setMatrix(cached.matrix);
            setTotals(cached.totals);
            setLoading(false);
            return;
        }

        if (!cached) setLoading(true);
        setErrorMsg(null);

        try {
            let token = tokenOverride;
            if (!token) {
                const { data: { session } } = await supabase.auth.getSession();
                token = session?.access_token;
            }

            const res = await fetch(`/api/cfp-summary/monthly-matrix?year=${year}`, {
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });

            const json = await res.json();
            if (json.success) {
                setMatrix(json.matrix || []);
                setTotals(json.totals || null);
                clientMatrixCache.set(cacheKey, {
                    matrix: json.matrix || [],
                    totals: json.totals || null,
                    timestamp: Date.now(),
                });
            } else {
                setErrorMsg(json.error || json.message || 'Failed to load matrix data');
            }
        } catch (err: any) {
            console.error('Failed to load CFP Monthly Matrix:', err);
            setErrorMsg(err?.message || 'Network error loading matrix');
        } finally {
            setLoading(false);
        }
    }, [year]);

    useEffect(() => {
        fetchMatrixData();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.access_token) {
                fetchMatrixData(session.access_token);
            }
        });

        return () => subscription.unsubscribe();
    }, [fetchMatrixData]);

    // 1. Copy Image to Clipboard (formatted specifically for crystal clear email embedding)
    const handleCopyImage = async () => {
        if (!cardRef.current) return;
        setImageCapturing(true);

        try {
            const blob = await toBlob(cardRef.current, {
                quality: 1,
                pixelRatio: 2.5, // Ultra-sharp 2.5x retina quality for email
                backgroundColor: '#ffffff',
            });

            if (!blob) {
                throw new Error('Could not generate image blob');
            }

            if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
                const item = new ClipboardItem({ 'image/png': blob });
                await navigator.clipboard.write([item]);
                showToast('Image copied to clipboard! Paste directly into your email body (Ctrl+V).');
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `CFP_Monthly_Matrix_${year}.png`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('Image downloaded to your computer.');
            }
        } catch (err) {
            console.error('Failed to copy image:', err);
            showToast('Could not copy image. Try "Save PNG" instead.');
        } finally {
            setImageCapturing(false);
        }
    };

    // 2. Save Image as PNG file
    const handleSaveImage = async () => {
        if (!cardRef.current) return;
        setImageCapturing(true);

        try {
            const dataUrl = await toPng(cardRef.current, {
                quality: 1,
                pixelRatio: 2.5,
                backgroundColor: '#ffffff',
            });

            const link = document.createElement('a');
            link.download = `CFP_Monthly_Matrix_${year}_${new Date().toISOString().split('T')[0]}.png`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('Image saved as PNG!');
        } catch (err) {
            console.error('Failed to save image:', err);
            showToast('Error saving PNG image.');
        } finally {
            setImageCapturing(false);
        }
    };

    // 3. Copy table text (TSV) to clipboard
    const handleCopyTable = () => {
        if (!matrix || matrix.length === 0) return;

        const headers = [
            'Month',
            'Policies',
            'DEC Uploaded',
            'RCE Uploaded',
            'With Addr',
            'No Addr',
            'Quoted',
            'Unquotable'
        ];

        const rows = matrix.map(r => [
            r.monthName,
            r.totalUniquePolicies,
            r.decUploaded,
            r.rceUploaded,
            r.totalWithAddress,
            r.totalNoAddress,
            r.quotedCount,
            r.unquotableCount
        ].join('\t'));

        if (totals) {
            rows.push([
                'GRAND TOTAL (PORTFOLIO)',
                totals.totalUniquePolicies,
                totals.decUploaded,
                totals.rceUploaded,
                totals.totalWithAddress,
                totals.totalNoAddress,
                totals.quotedCount,
                totals.unquotableCount
            ].join('\t'));
        }

        const tsv = [headers.join('\t'), ...rows].join('\n');
        navigator.clipboard.writeText(tsv).then(() => {
            showToast('Table copied to clipboard (TSV format for Excel / Sheets).');
        });
    };

    // 4. Export to styled Excel workbook
    const exportToExcel = async () => {
        if (!matrix || matrix.length === 0) return;

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Coverage Check';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet(`CFP Matrix ${year === 'all' ? 'All Years' : year}`, {
            views: [{ state: 'frozen', ySplit: 1 }],
        });

        sheet.columns = [
            { header: 'Month', key: 'month', width: 16 },
            { header: 'Policies', key: 'unique_policies', width: 18 },
            { header: 'DEC Uploaded', key: 'dec_uploaded', width: 18 },
            { header: 'RCE Uploaded', key: 'rce_uploaded', width: 18 },
            { header: 'With Addr', key: 'with_address', width: 16 },
            { header: 'No Addr', key: 'no_address', width: 16 },
            { header: 'Quoted', key: 'quoted', width: 16 },
            { header: 'Unquotable', key: 'unquotable', width: 18 },
        ];

        const headerRow = sheet.getRow(1);
        headerRow.height = 24;
        headerRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0C1B33' },
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        for (const row of matrix) {
            const addedRow = sheet.addRow({
                month: row.monthName,
                unique_policies: row.totalUniquePolicies,
                dec_uploaded: row.decUploaded,
                rce_uploaded: row.rceUploaded,
                with_address: row.totalWithAddress,
                no_address: row.totalNoAddress,
                quoted: row.quotedCount,
                unquotable: row.unquotableCount,
            });
            addedRow.height = 19;
            addedRow.alignment = { vertical: 'middle', horizontal: 'center' };
            addedRow.getCell('month').alignment = { vertical: 'middle', horizontal: 'left' };
        }

        if (totals) {
            const totalRow = sheet.addRow({
                month: 'GRAND TOTAL (PORTFOLIO)',
                unique_policies: totals.totalUniquePolicies,
                dec_uploaded: totals.decUploaded,
                rce_uploaded: totals.rceUploaded,
                with_address: totals.totalWithAddress,
                no_address: totals.totalNoAddress,
                quoted: totals.quotedCount,
                unquotable: totals.unquotableCount,
            });
            totalRow.height = 22;
            totalRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            totalRow.alignment = { vertical: 'middle', horizontal: 'center' };
            totalRow.getCell('month').alignment = { vertical: 'middle', horizontal: 'left' };
            totalRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF0C1B33' },
            };
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CFP_Monthly_Matrix_${year}_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className={styles.container}>
            {/* Top Toolbar */}
            <div className={styles.topBar}>
                <div className={styles.filterControls}>
                    <div className={styles.filterGroup}>
                        <Calendar size={14} color="#475569" />
                        <span>Filter:</span>
                        <select
                            className={styles.select}
                            value={year}
                            onChange={(e) => handleYearChange(e.target.value)}
                        >
                            <option value="all">All Years (2024-2027)</option>
                            <option value="2026">Year 2026</option>
                            <option value="2025">Year 2025</option>
                            <option value="2024">Year 2024</option>
                            <option value="2027">Year 2027</option>
                        </select>
                    </div>
                </div>

                <div className={styles.actions}>
                    <button 
                        className={`${styles.btnAction} ${styles.imageButton}`} 
                        onClick={handleCopyImage} 
                        disabled={imageCapturing}
                        title="Copy compressed high-resolution image to clipboard for email (Ctrl+V into Gmail/Outlook)"
                    >
                        <Camera size={13} />
                        <span>{imageCapturing ? 'Capturing...' : 'Copy Image for Email'}</span>
                    </button>
                    <button 
                        className={styles.btnAction} 
                        onClick={handleSaveImage} 
                        disabled={imageCapturing}
                        title="Save as PNG image"
                    >
                        <Download size={13} />
                        <span>Save PNG</span>
                    </button>
                    <button 
                        className={styles.btnAction} 
                        onClick={handleCopyTable} 
                        title="Copy table data (TSV) to clipboard"
                    >
                        <Copy size={13} />
                        <span>Copy Table</span>
                    </button>
                    <button 
                        className={`${styles.btnAction} ${styles.success}`} 
                        onClick={exportToExcel} 
                        title="Download Excel spreadsheet"
                    >
                        <FileSpreadsheet size={13} />
                        <span>Excel</span>
                    </button>
                    <button 
                        className={styles.btnAction} 
                        onClick={() => fetchMatrixData(undefined, true)} 
                        title="Refresh Data"
                    >
                        <RefreshCw size={12} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Error banner if any */}
            {errorMsg && (
                <div style={{ maxWidth: 700, width: '100%', padding: '0.5rem 0.85rem', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{errorMsg}</span>
                    <button onClick={() => fetchMatrixData(undefined, true)} style={{ padding: '0.15rem 0.5rem', background: '#991b1b', color: '#fff', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}>
                        Retry
                    </button>
                </div>
            )}

            {/* 
              EXECUTIVE PRESENTATION CARD (Modeled on MTD Ranking Card)
              This element is captured when clicking "Copy Image for Email"
            */}
            <div ref={cardRef} className={styles.presentationCard}>
                {/* Dark Navy Card Header */}
                <div className={styles.cardHeader}>
                    <div className={styles.headerLeft}>
                        <span className={styles.brandPill}>ALSOP AGENCY • CFP TRACKING</span>
                        <span className={styles.mainTitle}>California FAIR Plan Monthly Matrix</span>
                    </div>
                    <div className={styles.headerRight}>
                        <span className={styles.badgePeriod}>
                            {year === 'all' ? 'All Years (2024–2027)' : `Year ${year}`}
                        </span>
                        <span className={styles.headerDate}>
                            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                    </div>
                </div>

                {/* Compact Table */}
                {loading ? (
                    <div className={styles.loadingBox}>
                        <div className={styles.spinner} />
                        <span>Loading CFP Monthly Matrix...</span>
                    </div>
                ) : (
                    <table className={styles.matrixTable}>
                        <thead>
                            <tr>
                                <th>MONTH</th>
                                <th className={styles.center}>POLICIES</th>
                                <th className={styles.center}>DEC UPLOADED</th>
                                <th className={styles.center}>RCE UPLOADED</th>
                                <th className={styles.center}>WITH ADDR</th>
                                <th className={styles.center}>NO ADDR</th>
                                <th className={`${styles.center} ${styles.thQuoted}`}>QUOTED</th>
                                <th className={`${styles.center} ${styles.thUnquotable}`}>UNQUOTABLE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {matrix.map((row) => {
                                const isCurrentMonth = String(row.month) === String(CURRENT_MONTH) && (year === CURRENT_YEAR || year === 'all');
                                return (
                                    <tr key={row.month} className={isCurrentMonth ? styles.currentMonthRow : ''}>
                                        <td>
                                            <Link
                                                href={`/cfp-summary?month=${row.month}&year=${year === 'all' ? '' : year}`}
                                                onClick={() => {
                                                    if (typeof window !== 'undefined') {
                                                        localStorage.setItem('ccn_cfp_summary_month', String(row.month));
                                                        localStorage.setItem('ccn_cfp_summary_year', year === 'all' ? '' : year);
                                                    }
                                                }}
                                                className={styles.monthCell}
                                            >
                                                <span className={styles.monthNum}>#{row.month}</span>
                                                <span>{row.monthName}</span>
                                            </Link>
                                        </td>
                                        <td className={styles.center}>
                                            <Link
                                                href={`/cfp-summary?month=${row.month}&year=${year === 'all' ? '' : year}`}
                                                onClick={() => {
                                                    if (typeof window !== 'undefined') {
                                                        localStorage.setItem('ccn_cfp_summary_month', String(row.month));
                                                        localStorage.setItem('ccn_cfp_summary_year', year === 'all' ? '' : year);
                                                    }
                                                }}
                                                className={styles.linkPill}
                                                title={`View ${row.monthName} policy details`}
                                            >
                                                <span>{row.totalUniquePolicies.toLocaleString()}</span>
                                                <ArrowUpRight size={10} color="#64748b" />
                                            </Link>
                                        </td>
                                        <td className={`${styles.center} ${styles.tdDec}`}>
                                            {row.decUploaded.toLocaleString()}
                                        </td>
                                        <td className={`${styles.center} ${styles.tdRce}`}>
                                            {row.rceUploaded.toLocaleString()}
                                        </td>
                                        <td className={`${styles.center} ${styles.tdWithAddr}`}>
                                            {row.totalWithAddress.toLocaleString()}
                                        </td>
                                        <td className={`${styles.center} ${styles.tdNoAddr}`}>
                                            {row.totalNoAddress.toLocaleString()}
                                        </td>
                                        <td className={`${styles.center} ${styles.tdQuoted}`}>
                                            {row.quotedCount.toLocaleString()}
                                        </td>
                                        <td className={`${styles.center} ${styles.tdUnquotable}`}>
                                            {row.unquotableCount.toLocaleString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {totals && (
                            <tfoot>
                                <tr>
                                    <td>GRAND TOTAL (PORTFOLIO)</td>
                                    <td className={styles.center}>{totals.totalUniquePolicies.toLocaleString()}</td>
                                    <td className={`${styles.center} ${styles.tdDec}`}>{totals.decUploaded.toLocaleString()}</td>
                                    <td className={`${styles.center} ${styles.tdRce}`}>{totals.rceUploaded.toLocaleString()}</td>
                                    <td className={`${styles.center} ${styles.tdWithAddr}`}>{totals.totalWithAddress.toLocaleString()}</td>
                                    <td className={`${styles.center} ${styles.tdNoAddr}`}>{totals.totalNoAddress.toLocaleString()}</td>
                                    <td className={`${styles.center} ${styles.tdQuoted}`}>{totals.quotedCount.toLocaleString()}</td>
                                    <td className={`${styles.center} ${styles.tdUnquotable}`}>{totals.unquotableCount.toLocaleString()}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                )}

                {/* Clean Muted Sub-Footer */}
                <div className={styles.cardFooter}>
                    <span>Exported: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • Alsop Coverage Check Platform</span>
                    <span>Excludes 66 floating Bamboo pipeline policies</span>
                </div>
            </div>

            {toastMessage && (
                <div className={styles.copiedToast}>
                    <Check size={16} color="#4ade80" />
                    <span>{toastMessage}</span>
                </div>
            )}
        </div>
    );
}
