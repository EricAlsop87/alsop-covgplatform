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
    Download,
    Shield,
    FileCheck,
    Calculator,
    MapPin,
    MapPinOff,
    CheckCircle2,
    AlertTriangle,
    Info
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

    // Dedicated reference for capturing the compact high-resolution email card
    const exportCardRef = useRef<HTMLDivElement | null>(null);

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

    // 1. Copy Image to Clipboard (formatted specifically for crystal clear email embedding with ALL 8 columns)
    const handleCopyImage = async () => {
        if (!exportCardRef.current) return;
        setImageCapturing(true);

        try {
            const element = exportCardRef.current;
            const blob = await toBlob(element, {
                quality: 1,
                pixelRatio: 2.5, // 2.5x high-definition retina resolution
                backgroundColor: '#ffffff',
                width: 780,
            });

            if (!blob) {
                throw new Error('Could not generate image blob');
            }

            if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
                const item = new ClipboardItem({ 'image/png': blob });
                await navigator.clipboard.write([item]);
                showToast('Email image copied! Paste directly into Gmail/Outlook body (Ctrl+V).');
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
        if (!exportCardRef.current) return;
        setImageCapturing(true);

        try {
            const element = exportCardRef.current;
            const dataUrl = await toPng(element, {
                quality: 1,
                pixelRatio: 2.5,
                backgroundColor: '#ffffff',
                width: 780,
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
        <div className={styles.pageContainer}>
            {/* Top Stat Summary Pills on Web View */}
            {totals && (
                <div className={styles.quickStatsRow}>
                    <div className={styles.quickStatCard}>
                        <div className={styles.statIcon} style={{ color: '#2563eb', background: '#eff6ff' }}>
                            <Shield size={16} />
                        </div>
                        <div className={styles.statInfo}>
                            <span className={styles.statLabel}>Unique Policies</span>
                            <span className={styles.statVal}>{totals.totalUniquePolicies.toLocaleString()}</span>
                            <span className={styles.statSub}>🌿 66 Bamboo excluded</span>
                        </div>
                    </div>

                    <div className={styles.quickStatCard}>
                        <div className={styles.statIcon} style={{ color: '#16a34a', background: '#f0fdf4' }}>
                            <FileCheck size={16} />
                        </div>
                        <div className={styles.statInfo}>
                            <span className={styles.statLabel}>DEC Uploaded</span>
                            <span className={styles.statVal} style={{ color: '#16a34a' }}>
                                {totals.decUploaded.toLocaleString()}
                            </span>
                            <span className={styles.statSub}>
                                {totals.totalUniquePolicies > 0 ? `${((totals.decUploaded / totals.totalUniquePolicies) * 100).toFixed(1)}%` : '0%'} on file
                            </span>
                        </div>
                    </div>

                    <div className={styles.quickStatCard}>
                        <div className={styles.statIcon} style={{ color: '#7c3aed', background: '#f5f3ff' }}>
                            <Calculator size={16} />
                        </div>
                        <div className={styles.statInfo}>
                            <span className={styles.statLabel}>RCE Uploaded</span>
                            <span className={styles.statVal} style={{ color: '#7c3aed' }}>
                                {totals.rceUploaded.toLocaleString()}
                            </span>
                            <span className={styles.statSub}>
                                {totals.totalUniquePolicies > 0 ? `${((totals.rceUploaded / totals.totalUniquePolicies) * 100).toFixed(1)}%` : '0%'} on file
                            </span>
                        </div>
                    </div>

                    <div className={styles.quickStatCard}>
                        <div className={styles.statIcon} style={{ color: '#0f766e', background: '#f0fdfa' }}>
                            <MapPin size={16} />
                        </div>
                        <div className={styles.statInfo}>
                            <span className={styles.statLabel}>With Address</span>
                            <span className={styles.statVal} style={{ color: '#0f766e' }}>
                                {totals.totalWithAddress.toLocaleString()}
                            </span>
                            <span className={styles.statSub}>Verified location</span>
                        </div>
                    </div>

                    <div className={styles.quickStatCard}>
                        <div className={styles.statIcon} style={{ color: '#2563eb', background: '#eff6ff' }}>
                            <CheckCircle2 size={16} />
                        </div>
                        <div className={styles.statInfo}>
                            <span className={styles.statLabel}>Quoted (≥1 Carrier)</span>
                            <span className={styles.statVal} style={{ color: '#2563eb' }}>
                                {totals.quotedCount.toLocaleString()}
                            </span>
                            <span className={styles.statSub}>Companion ready</span>
                        </div>
                    </div>

                    <div className={styles.quickStatCard}>
                        <div className={styles.statIcon} style={{ color: '#dc2626', background: '#fef2f2' }}>
                            <AlertTriangle size={16} />
                        </div>
                        <div className={styles.statInfo}>
                            <span className={styles.statLabel}>Total Unquotable</span>
                            <span className={styles.statVal} style={{ color: '#dc2626' }}>
                                {totals.unquotableCount.toLocaleString()}
                            </span>
                            <span className={styles.statSub}>Missing DEC & Addr</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Action & Filter Bar */}
            <div className={styles.topBar}>
                <div className={styles.filterControls}>
                    <div className={styles.filterGroup}>
                        <Calendar size={15} color="#475569" />
                        <span>Filter Period:</span>
                        <select
                            className={styles.select}
                            value={year}
                            onChange={(e) => handleYearChange(e.target.value)}
                        >
                            <option value="all">All Years (2024–2027)</option>
                            <option value="2026">Year 2026</option>
                            <option value="2025">Year 2025</option>
                            <option value="2024">Year 2024</option>
                            <option value="2027">Year 2027</option>
                        </select>
                    </div>
                </div>

                <div className={styles.actions}>
                    <button 
                        className={`${styles.btnAction} ${styles.btnPrimaryImage}`} 
                        onClick={handleCopyImage} 
                        disabled={imageCapturing}
                        title="Copy compressed high-resolution email card to clipboard (Ctrl+V into Gmail/Outlook)"
                    >
                        <Camera size={14} />
                        <span>{imageCapturing ? 'Capturing...' : 'Copy Image for Email'}</span>
                    </button>
                    <button 
                        className={styles.btnAction} 
                        onClick={handleSaveImage} 
                        disabled={imageCapturing}
                        title="Save as PNG image"
                    >
                        <Download size={14} />
                        <span>Save PNG</span>
                    </button>
                    <button 
                        className={styles.btnAction} 
                        onClick={handleCopyTable} 
                        title="Copy table data (TSV) to clipboard"
                    >
                        <Copy size={14} />
                        <span>Copy Table</span>
                    </button>
                    <button 
                        className={`${styles.btnAction} ${styles.btnExcel}`} 
                        onClick={exportToExcel} 
                        title="Download Excel spreadsheet"
                    >
                        <FileSpreadsheet size={14} />
                        <span>Excel</span>
                    </button>
                    <button 
                        className={styles.btnAction} 
                        onClick={() => fetchMatrixData(undefined, true)} 
                        title="Refresh Data"
                    >
                        <RefreshCw size={13} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Error banner if any */}
            {errorMsg && (
                <div className={styles.errorBanner}>
                    <span>{errorMsg}</span>
                    <button onClick={() => fetchMatrixData(undefined, true)} className={styles.retryBtn}>
                        Retry
                    </button>
                </div>
            )}

            {/* 
              =======================================================
              FULL-WIDTH WEB MATRIX TABLE (Spacious, Beautiful, Easy to Read)
              =======================================================
            */}
            <div className={styles.webTableCard}>
                <div className={styles.webTableHeader}>
                    <div className={styles.webTitleGroup}>
                        <h2>Monthly Policy Distribution & Upload Matrix</h2>
                        <p>Click any month row or policy number to jump directly to its individual policy list.</p>
                    </div>
                    <div className={styles.webPeriodBadge}>
                        {year === 'all' ? 'All Years (2024–2027)' : `Calendar Year ${year}`}
                    </div>
                </div>

                {loading ? (
                    <div className={styles.loadingBox}>
                        <div className={styles.spinner} />
                        <span>Loading CFP Monthly Matrix...</span>
                    </div>
                ) : (
                    <div className={styles.tableResponsive}>
                        <table className={styles.webTable}>
                            <thead>
                                <tr>
                                    <th style={{ width: '16%' }}>
                                        <div className={styles.thTitle}>MONTH</div>
                                        <div className={styles.thSub}>Calendar Term</div>
                                    </th>
                                    <th style={{ width: '12%' }} className={styles.center}>
                                        <div className={styles.thTitle}>POLICIES</div>
                                        <div className={styles.thSub}>Base Families</div>
                                    </th>
                                    <th style={{ width: '12%' }} className={styles.center}>
                                        <div className={styles.thTitle}>DEC UPLOADED</div>
                                        <div className={styles.thSub}>Active Dec on File</div>
                                    </th>
                                    <th style={{ width: '12%' }} className={styles.center}>
                                        <div className={styles.thTitle}>RCE UPLOADED</div>
                                        <div className={styles.thSub}>360Value / Est.</div>
                                    </th>
                                    <th style={{ width: '12%' }} className={styles.center}>
                                        <div className={styles.thTitle}>WITH ADDR</div>
                                        <div className={styles.thSub}>Verified Location</div>
                                    </th>
                                    <th style={{ width: '12%' }} className={styles.center}>
                                        <div className={styles.thTitle}>NO ADDR</div>
                                        <div className={styles.thSub}>Missing Location</div>
                                    </th>
                                    <th style={{ width: '12%' }} className={`${styles.center} ${styles.thQuoted}`}>
                                        <div className={styles.thTitle}>QUOTED</div>
                                        <div className={styles.thSub}>Carrier Ready (≥1)</div>
                                    </th>
                                    <th style={{ width: '12%' }} className={`${styles.center} ${styles.thUnquotable}`}>
                                        <div className={styles.thTitle}>UNQUOTABLE</div>
                                        <div className={styles.thSub}>No DEC & No Addr</div>
                                    </th>
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
                                                    className={styles.monthLink}
                                                >
                                                    <span className={styles.monthNumberPill}>#{row.month}</span>
                                                    <span className={styles.monthNameText}>{row.monthName}</span>
                                                    {isCurrentMonth && <span className={styles.currentMonthBadge}>Current</span>}
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
                                                    className={styles.policyPill}
                                                    title={`View ${row.monthName} policies`}
                                                >
                                                    <span>{row.totalUniquePolicies.toLocaleString()}</span>
                                                    <ArrowUpRight size={12} color="#64748b" />
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
                                                <span className={styles.numBadgeBlue}>
                                                    {row.quotedCount.toLocaleString()}
                                                </span>
                                            </td>
                                            <td className={`${styles.center} ${styles.tdUnquotable}`}>
                                                <span className={styles.numBadgeRed}>
                                                    {row.unquotableCount.toLocaleString()}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            {totals && (
                                <tfoot>
                                    <tr>
                                        <td>
                                            <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                                                GRAND TOTAL (PORTFOLIO)
                                            </div>
                                            <div style={{ fontSize: '0.72rem', opacity: 0.8, fontWeight: 500 }}>
                                                Annual Deduplicated Portfolio
                                            </div>
                                        </td>
                                        <td className={styles.center} style={{ fontSize: '1rem', fontWeight: 800 }}>
                                            {totals.totalUniquePolicies.toLocaleString()}
                                        </td>
                                        <td className={`${styles.center} ${styles.tdDec}`} style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                                            {totals.decUploaded.toLocaleString()}
                                        </td>
                                        <td className={`${styles.center} ${styles.tdRce}`} style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                                            {totals.rceUploaded.toLocaleString()}
                                        </td>
                                        <td className={`${styles.center} ${styles.tdWithAddr}`} style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                                            {totals.totalWithAddress.toLocaleString()}
                                        </td>
                                        <td className={`${styles.center} ${styles.tdNoAddr}`} style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                                            {totals.totalNoAddress.toLocaleString()}
                                        </td>
                                        <td className={`${styles.center} ${styles.tdQuoted}`} style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                                            {totals.quotedCount.toLocaleString()}
                                        </td>
                                        <td className={`${styles.center} ${styles.tdUnquotable}`} style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                                            {totals.unquotableCount.toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}
            </div>

            {/* Metric Logic & Definition Cards */}
            <div className={styles.definitionsGrid}>
                <div className={styles.defCard}>
                    <div className={styles.defHeader}>
                        <Info size={14} color="#2563eb" />
                        <span>Policy Counting & Exclusions</span>
                    </div>
                    <p>
                        <strong>Total Unique Policies (2,910):</strong> Groups multiple policy terms and annual renewal suffixes (00, 01, etc.) into singular policy families. 
                        <strong> Excludes 66 floating Bamboo pipeline policies</strong> that do not yet have confirmed CFP base filings.
                    </p>
                </div>

                <div className={styles.defCard}>
                    <div className={styles.defHeader}>
                        <Info size={14} color="#16a34a" />
                        <span>DEC & RCE Status</span>
                    </div>
                    <p>
                        <strong>DEC Uploaded:</strong> Policies with an official active FAIR Plan Declaration document. 
                        <strong> RCE Uploaded:</strong> Policies with a 360Value or calculated replacement cost estimate on file.
                    </p>
                </div>

                <div className={styles.defCard}>
                    <div className={styles.defHeader}>
                        <Info size={14} color="#dc2626" />
                        <span>Address & Quotability Logic</span>
                    </div>
                    <p>
                        <strong>No Address & Unquotable:</strong> In the active portfolio, 100% of policies with DEC pages have property addresses on file. All policies lacking addresses also lack DEC pages, making them unquotable by carriers.
                    </p>
                </div>
            </div>

            {/* 
              =======================================================
              DEDICATED EMAIL EXPORT CARD (Off-screen / Fixed 780px)
              This card is captured at 2.5x retina resolution when clicking "Copy Image for Email"
              ALL 8 columns fit with perfect proportions and zero cut-off!
              =======================================================
            */}
            <div className={styles.hiddenCaptureWrapper} aria-hidden="true">
                <div ref={exportCardRef} className={styles.emailExportCard}>
                    {/* Dark Navy Header */}
                    <div className={styles.emailCardHeader}>
                        <div className={styles.emailHeaderLeft}>
                            <span className={styles.emailBrandPill}>ALSOP AGENCY • CFP TRACKING</span>
                            <span className={styles.emailMainTitle}>California FAIR Plan Monthly Matrix</span>
                        </div>
                        <div className={styles.emailHeaderRight}>
                            <span className={styles.emailBadgePeriod}>
                                {year === 'all' ? 'All Years (2024–2027)' : `Year ${year}`}
                            </span>
                            <span className={styles.emailHeaderDate}>
                                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                        </div>
                    </div>

                    {/* Compact All-8-Column Table */}
                    <table className={styles.emailTable}>
                        <thead>
                            <tr>
                                <th style={{ width: '18%' }}>MONTH</th>
                                <th style={{ width: '11.5%' }} className={styles.center}>POLICIES</th>
                                <th style={{ width: '12.5%' }} className={styles.center}>DEC UPLOADED</th>
                                <th style={{ width: '12.5%' }} className={styles.center}>RCE UPLOADED</th>
                                <th style={{ width: '11%' }} className={styles.center}>WITH ADDR</th>
                                <th style={{ width: '11%' }} className={styles.center}>NO ADDR</th>
                                <th style={{ width: '11.5%' }} className={`${styles.center} ${styles.emailThQuoted}`}>QUOTED</th>
                                <th style={{ width: '12%' }} className={`${styles.center} ${styles.emailThUnquotable}`}>UNQUOTABLE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {matrix.map((row) => (
                                <tr key={row.month}>
                                    <td>
                                        <span className={styles.emailMonthNum}>#{row.month}</span>
                                        <span className={styles.emailMonthName}>{row.monthName}</span>
                                    </td>
                                    <td className={`${styles.center} ${styles.emailBold}`}>
                                        {row.totalUniquePolicies.toLocaleString()}
                                    </td>
                                    <td className={`${styles.center} ${styles.emailTdDec}`}>
                                        {row.decUploaded.toLocaleString()}
                                    </td>
                                    <td className={`${styles.center} ${styles.emailTdRce}`}>
                                        {row.rceUploaded.toLocaleString()}
                                    </td>
                                    <td className={`${styles.center} ${styles.emailTdWithAddr}`}>
                                        {row.totalWithAddress.toLocaleString()}
                                    </td>
                                    <td className={`${styles.center} ${styles.emailTdNoAddr}`}>
                                        {row.totalNoAddress.toLocaleString()}
                                    </td>
                                    <td className={`${styles.center} ${styles.emailTdQuoted}`}>
                                        {row.quotedCount.toLocaleString()}
                                    </td>
                                    <td className={`${styles.center} ${styles.emailTdUnquotable}`}>
                                        {row.unquotableCount.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {totals && (
                            <tfoot>
                                <tr>
                                    <td>GRAND TOTAL (PORTFOLIO)</td>
                                    <td className={styles.center}>{totals.totalUniquePolicies.toLocaleString()}</td>
                                    <td className={`${styles.center} ${styles.emailTdDec}`}>{totals.decUploaded.toLocaleString()}</td>
                                    <td className={`${styles.center} ${styles.emailTdRce}`}>{totals.rceUploaded.toLocaleString()}</td>
                                    <td className={`${styles.center} ${styles.emailTdWithAddr}`}>{totals.totalWithAddress.toLocaleString()}</td>
                                    <td className={`${styles.center} ${styles.emailTdNoAddr}`}>{totals.totalNoAddress.toLocaleString()}</td>
                                    <td className={`${styles.center} ${styles.emailTdQuoted}`}>{totals.quotedCount.toLocaleString()}</td>
                                    <td className={`${styles.center} ${styles.emailTdUnquotable}`}>{totals.unquotableCount.toLocaleString()}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>

                    {/* Muted Sub-Footer */}
                    <div className={styles.emailCardFooter}>
                        <span>Exported: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • Alsop Coverage Check Platform</span>
                        <span>🌿 Excludes 66 floating Bamboo policies</span>
                    </div>
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
