'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import styles from './LineChartKPI.module.css';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';


interface DailyData {
    date: Date;
    label: string;
    count: number;
}

export function LineChartKPI() {
    const [data, setData] = useState<DailyData[]>([]);
    const [loading, setLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [hoveredPoint, setHoveredPoint] = useState<{ x: number, y: number, data: DailyData } | null>(null);

    useEffect(() => {
        async function fetchData() {
            // Last 14 days
            const daysToFetch = 14;
            const buckets: DailyData[] = [];
            const today = new Date();
            today.setHours(0,0,0,0);

            for (let i = daysToFetch - 1; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                buckets.push({
                    date: d,
                    label: `${d.getMonth() + 1}/${d.getDate()}`,
                    count: 0
                });
            }

            const startDate = buckets[0].date.toISOString().split('T')[0];

            try {
                const { data: records, error } = await supabase
                    .from('dec_page_submissions')
                    .select('created_at')
                    .gte('created_at', startDate)
                    .neq('status', 'failed');

                if (!error && records) {
                    records.forEach(r => {
                        const recDate = new Date(r.created_at);
                        recDate.setHours(0,0,0,0);
                        const match = buckets.find(b => b.date.getTime() === recDate.getTime());
                        if (match) match.count += 1;
                    });
                }
            } catch (e) {
                logger.error('LineChartKPI', "Error fetching line chart KPI", { error: e instanceof Error ? e.message : String(e) })
            }

            setData(buckets);
            setLoading(false);
        }

        fetchData();
    }, []);

    // Observe container resize
    useEffect(() => {
        const resizeObserver = new ResizeObserver(entries => {
            if (entries[0]) {
                setDimensions({
                    width: entries[0].contentRect.width,
                    height: entries[0].contentRect.height
                });
            }
        });
        
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }
        
        return () => resizeObserver.disconnect();
    }, []);

    const totalUploads = useMemo(() => data.reduce((sum, d) => sum + d.count, 0), [data]);
    const maxVal = useMemo(() => Math.max(...data.map(d => d.count), 5), [data]);

    // SVG plotting
    const padX = 20;
    const padYTop = 10;
    const padYBottom = 20;

    const useWidth = Math.max(dimensions.width, 200);
    const useHeight = Math.max(dimensions.height, 100);

    const chartW = useWidth - padX * 2;
    const chartH = useHeight - padYTop - padYBottom;

    const points = data.map((d, i) => {
        const x = padX + (i / Math.max(data.length - 1, 1)) * chartW;
        const y = padYTop + chartH - (d.count / maxVal) * chartH;
        return { x, y, d };
    });

    // Build SVG path
    const linePath = points.length > 0 
        ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}` 
        : '';
        
    const areaPath = points.length > 0
        ? `${linePath} L ${points[points.length - 1].x},${useHeight - padYBottom} L ${padX},${useHeight - padYBottom} Z`
        : '';

    return (
        <div className={styles.chartContainer}>
            <div className={styles.chartHeader}>
                <div>
                    <h3 className={styles.title}>Dec Page Uploads</h3>
                    <p className={styles.subtitle}>Past 14 Days</p>
                </div>
                <div className={styles.statValue}>
                    {loading ? '--' : totalUploads}
                </div>
            </div>
            
            <div className={styles.svgContainer} ref={containerRef}>
                {dimensions.width > 0 && dimensions.height > 0 && !loading && (
                    <svg width={dimensions.width} height={dimensions.height}>
                        <defs>
                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.5" />
                                <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
                            </linearGradient>
                        </defs>

                        {/* Grid Lines (Horizontal) */}
                        <line x1={padX} y1={padYTop} x2={useWidth - padX} y2={padYTop} className={styles.gridLine} />
                        <line x1={padX} y1={padYTop + chartH/2} x2={useWidth - padX} y2={padYTop + chartH/2} className={styles.gridLine} />
                        <line x1={padX} y1={padYTop + chartH} x2={useWidth - padX} y2={padYTop + chartH} className={styles.gridLine} />

                        {/* X-Axis labels (First, Middle, Last) */}
                        {points.length > 0 && (
                            <>
                                <text x={points[0].x} y={useHeight - 5} className={styles.axisText} textAnchor="start">
                                    {points[0].d.label}
                                </text>
                                <text x={points[Math.floor(points.length/2)].x} y={useHeight - 5} className={styles.axisText} textAnchor="middle">
                                    {points[Math.floor(points.length/2)].d.label}
                                </text>
                                <text x={points[points.length-1].x} y={useHeight - 5} className={styles.axisText} textAnchor="end">
                                    {points[points.length-1].d.label}
                                </text>
                            </>
                        )}
                        
                        {/* Area Fill */}
                        <path d={areaPath} className={styles.chartArea} />
                        
                        {/* Line Stroke */}
                        <path d={linePath} className={styles.chartLine} />

                        {/* Data Points */}
                        {points.map((p, i) => (
                            <circle 
                                key={i}
                                cx={p.x} 
                                cy={p.y} 
                                r={hoveredPoint?.data.date.getTime() === p.d.date.getTime() ? 6 : 3} 
                                className={styles.chartPoint} 
                                style={{ pointerEvents: 'auto' }}
                                onMouseEnter={() => setHoveredPoint({ x: p.x, y: p.y, data: p.d })}
                                onMouseLeave={() => setHoveredPoint(null)}
                            />
                        ))}
                    </svg>
                )}

                {/* Custom Overlay Tooltip */}
                {hoveredPoint && (
                    <div style={{
                        position: 'absolute',
                        left: hoveredPoint.x,
                        top: hoveredPoint.y - 12,
                        transform: 'translate(-50%, -100%)',
                        background: 'var(--bg-inverse, #1f2937)',
                        color: 'var(--text-inverse-high, #fff)',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                        zIndex: 10
                    }}>
                        <strong>{hoveredPoint.data.label}:</strong> {hoveredPoint.data.count} uploads
                    </div>
                )}
            </div>
        </div>
    );
}
