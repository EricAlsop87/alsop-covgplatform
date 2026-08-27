'use client';

import React, { useState } from 'react';
import { Shield, ChevronDown, ChevronUp, AlertCircle, Info, Database } from 'lucide-react';
import { EstimationResult } from '@/lib/rce/InterimEstimator';
import { Tooltip } from '@/components/ui/Tooltip/Tooltip';

interface InterimRceWidgetProps {
    estimate: EstimationResult | null;
}

export function InterimRceWidget({ estimate }: InterimRceWidgetProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!estimate) {
        return (
            <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                padding: '1.25rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1rem'
            }}>
                <AlertCircle size={24} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                <div>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>
                        Replacement Cost Estimate Unavailable
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                        Insufficient structural data to calculate a reliable rebuild range. 
                        Please enrich the property or input square footage to generate an interim estimate.
                    </p>
                </div>
            </div>
        );
    }

    const { rangeMin, rangeMax, confidence, usedInputs, missingInputs, appliedMultipliers, baseCostPerSqft, exceedsFairPlanMax } = estimate;

    const getConfidenceColor = (conf: string) => {
        if (conf === 'High') return '#10b981'; // green
        if (conf === 'Medium') return '#f59e0b'; // amber
        return '#ef4444'; // red
    };

    const confColor = getConfidenceColor(confidence);

    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            overflow: 'hidden'
        }}>
            {/* Header Content */}
            <div 
                style={{ padding: '1.25rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: '#3b82f6',
                        padding: '0.5rem',
                        borderRadius: '6px'
                    }}>
                        <Shield size={20} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Interim Rebuild Estimate
                            </h3>
                            <span style={{
                                fontSize: '0.7rem',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: `${confColor}15`,
                                color: confColor,
                                fontWeight: 600,
                                border: `1px solid ${confColor}30`
                            }}>
                                {confidence} Confidence
                            </span>
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                            ${(rangeMin / 1000).toFixed(0)}k - ${(rangeMax / 1000).toFixed(0)}k
                        </div>
                    </div>
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
            </div>

            {exceedsFairPlanMax && (
                <div style={{
                    background: 'var(--bg-error-subtle)',
                    color: 'var(--status-error)',
                    padding: '0.6rem 1.25rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    borderTop: '1px solid rgba(239, 68, 68, 0.2)',
                    borderBottom: '1px solid rgba(239, 68, 68, 0.2)'
                }}>
                    <AlertCircle size={16} />
                    <span>OVER MAXIMUM ALLOWABLE LIMIT: Rebuild estimate exceeds the $3,000,000 statutory limit for the California FAIR Plan. Alternative marketplace (DIC/Wrap) may be required.</span>
                </div>
            )}

            {/* Expandable Details */}
            {isExpanded && (
                <div style={{
                    borderTop: '1px solid var(--border-light)',
                    padding: '1.25rem',
                    background: 'var(--bg-core)',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)'
                }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', background: '#3b82f610', padding: '0.75rem', borderRadius: '6px', color: '#3b82f6' }}>
                        <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span style={{ lineHeight: 1.4 }}>
                            <strong>Interim Workflow Note:</strong> This is a directional modeled estimate and should NOT replace a certified RCE (like 360Value or e2Value) for final binding. Integration with a certified RCE vendor is planned for a future platform update.
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                        
                        {/* Source Data Column */}
                        <div>
                            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Database size={12} /> Inputs Used
                            </h4>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {Object.entries(usedInputs).map(([k, v], i) => (
                                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border-light)', paddingBottom: '2px' }}>
                                        <span>{k}</span>
                                        <strong style={{ color: 'var(--text-primary)' }}>{String(v)}</strong>
                                    </li>
                                ))}
                                <li style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border-light)', paddingBottom: '2px' }}>
                                    <span>Regional Base Cost</span>
                                    <strong style={{ color: 'var(--text-primary)' }}>${baseCostPerSqft}/sqft</strong>
                                </li>
                            </ul>

                            {missingInputs.length > 0 && (
                                <div style={{ marginTop: '1rem' }}>
                                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#ef4444', marginBottom: '0.5rem' }}>
                                        Missing Critical Inputs
                                    </h4>
                                    <ul style={{ paddingLeft: '1.25rem', color: '#ef4444', margin: 0 }}>
                                        {missingInputs.map((m, i) => <li key={i}>{m} (reduces confidence)</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>

                        {/* Multipliers Column */}
                        <div>
                            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                                Applied Multipliers
                            </h4>
                            {appliedMultipliers.length === 0 ? (
                                <span style={{ color: 'var(--text-muted)' }}>None - standard tract build assumed.</span>
                            ) : (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {appliedMultipliers.map((m, i) => (
                                        <Tooltip 
                                            key={i} 
                                            position="bottom" 
                                            rich 
                                            content={
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <strong style={{ color: 'var(--text-inverse-high, #fff)', fontSize: '0.8rem' }}>{m.cause} Multiplier (x{m.factor.toFixed(2)})</strong>
                                                    <span style={{ color: 'var(--text-inverse-mid, #d1d5db)' }}>{m.explanation}</span>
                                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px', fontSize: '0.7rem', color: 'var(--text-inverse-muted, #9ca3af)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Database size={10} /> Source: {m.source}
                                                    </div>
                                                </div>
                                            }
                                            className="full-width" // Optionally add CSS if we need the li to span full
                                        >
                                            <li 
                                                style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border-light)', paddingBottom: '2px', cursor: 'help', width: '100%' }}
                                            >
                                                <span style={{ borderBottom: '1px dotted var(--text-muted)' }}>{m.cause}</span>
                                                <strong style={{ color: 'var(--text-primary)' }}>x{m.factor.toFixed(2)}</strong>
                                            </li>
                                        </Tooltip>
                                    ))}
                                </ul>
                            )}
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
