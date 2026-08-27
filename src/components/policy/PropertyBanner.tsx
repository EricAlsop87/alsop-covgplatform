'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { MapPin, Satellite, Maximize2, X, RefreshCw, ImageOff, Loader2, ExternalLink, Zap, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import styles from './PropertyBanner.module.css';

/* ─── Types ─── */
interface ImageSource {
    name: string;
    type: string;
    url: string | null;
    fetchedAt: string;
    confidence: string;
    captureDate?: string | null;
}

interface CarouselSlide {
    src: string;
    label: string;
    icon: React.ReactNode;
    source: ImageSource | null;
    alt: string;
}

interface PropertyBannerProps {
    /** Real satellite image URL from enrichment, or null */
    imageSrc: string | null;
    /** Source metadata for the satellite image */
    imageSource: ImageSource | null;
    /** Street view image URL, or null */
    streetViewSrc?: string | null;
    /** Source metadata for the street view image */
    streetViewSource?: ImageSource | null;
    /** Fire risk label (e.g. "High", "Very Low") */
    fireRiskLabel: string | null;
    /** Property address to display in the placeholder */
    propertyAddress: string | null;
    /** Whether enrichment is currently running */
    isEnriching: boolean;
    /** Current enrichment step text */
    enrichStep: string | null;
    /** Callback to trigger enrichment */
    onEnrich: () => void;
}

/* ─── Fire risk colors ─── */
function getFireRiskColor(label: string | null): string {
    switch (label) {
        case 'Very High': return '#ef4444';
        case 'High': return '#f97316';
        case 'Moderate': return '#eab308';
        case 'Low': return '#22c55e';
        case 'Very Low': return '#16a34a';
        default: return '#6b7280';
    }
}

/* ═══════════════════════════════════════════════════════════════
   PropertyBanner — Carousel property image component
   
   States:
   1. NOT ENRICHED - No satellite image, show placeholder with CTA
   2. LOADING       - Enrichment in progress, show shimmer
   3. ENRICHED      - Image carousel (satellite + street view)
   4. ERROR         - Image failed to load, retry option
   ═══════════════════════════════════════════════════════════════ */
export function PropertyBanner({
    imageSrc,
    imageSource,
    streetViewSrc,
    streetViewSource,
    fireRiskLabel,
    propertyAddress,
    isEnriching,
    enrichStep,
    onEnrich,
}: PropertyBannerProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [activeSlide, setActiveSlide] = useState(0);
    const [streetViewLoaded, setStreetViewLoaded] = useState(false);
    const [streetViewError, setStreetViewError] = useState(false);

    const fireRiskColor = getFireRiskColor(fireRiskLabel);

    // Build carousel slides
    const slides: CarouselSlide[] = [];
    if (imageSrc && !imageError) {
        slides.push({
            src: imageSrc,
            label: 'Satellite View',
            icon: <Satellite size={14} />,
            source: imageSource,
            alt: `Satellite view of property${propertyAddress ? ` at ${propertyAddress}` : ''}`,
        });
    }
    if (streetViewSrc && !streetViewError) {
        slides.push({
            src: streetViewSrc,
            label: 'Street View',
            icon: <Eye size={14} />,
            source: streetViewSource || null,
            alt: `Street view of property${propertyAddress ? ` at ${propertyAddress}` : ''}`,
        });
    }

    const hasStreetView = !!streetViewSrc && !streetViewError;
    const totalSlides = slides.length;

    // Keep active slide in bounds
    useEffect(() => {
        if (activeSlide >= totalSlides && totalSlides > 0) {
            setActiveSlide(0);
        }
    }, [totalSlides, activeSlide]);

    const goToSlide = useCallback((idx: number) => {
        setActiveSlide(idx);
    }, []);

    const nextSlide = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (totalSlides > 1) setActiveSlide(prev => (prev + 1) % totalSlides);
    }, [totalSlides]);

    const prevSlide = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (totalSlides > 1) setActiveSlide(prev => (prev - 1 + totalSlides) % totalSlides);
    }, [totalSlides]);

    // Reset error state when imageSrc changes
    const handleImageError = useCallback(() => {
        setImageError(true);
        setImageLoaded(false);
    }, []);

    const handleImageLoad = useCallback(() => {
        setImageLoaded(true);
        setImageError(false);
    }, []);

    // Determine state
    const hasRealImage = imageSrc && !imageError;
    const isLoading = isEnriching;
    const currentSlide = slides[activeSlide] || slides[0];

    /* ─── State: Loading (Enrichment in progress) ─── */
    if (isLoading && !hasRealImage) {
        return (
            <div className={styles.banner}>
                <div className={styles.loadingState}>
                    <div className={styles.loadingShimmer} />
                    <div className={styles.loadingOverlay}>
                        <div className={styles.loadingContent}>
                            <div className={styles.loadingIcon}>
                                <Satellite size={32} />
                            </div>
                            <h3 className={styles.loadingTitle}>Fetching Property Imagery</h3>
                            <p className={styles.loadingStep}>
                                {enrichStep || 'Initializing enrichment…'}
                            </p>
                            <div className={styles.loadingBar}>
                                <div className={styles.loadingBarFill} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    /* ─── State: Error (Image failed to load) ─── */
    if (imageSrc && imageError) {
        return (
            <div className={styles.banner}>
                <div className={styles.errorState} onClick={() => setIsModalOpen(true)}>
                    <div className={styles.errorContent}>
                        <div className={styles.errorIcon}>
                            <ImageOff size={36} />
                        </div>
                        <h3 className={styles.errorTitle}>Satellite Image Unavailable</h3>
                        <p className={styles.errorSubtitle}>
                            The image could not be loaded. This may be a temporary issue with the imagery provider.
                        </p>
                        <div className={styles.errorActions}>
                            <button
                                className={styles.retryBtn}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setImageError(false);
                                    setImageLoaded(false);
                                    onEnrich();
                                }}
                            >
                                <RefreshCw size={14} />
                                Re-fetch Imagery
                            </button>
                        </div>
                        {imageSource && (
                            <p className={styles.errorMeta}>
                                Last attempt: {imageSource.name} · {new Date(imageSource.fetchedAt).toLocaleDateString()}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    /* ─── State: Not Enriched (No satellite image) ─── */
    if (!hasRealImage) {
        return (
            <div className={styles.banner}>
                <div className={styles.placeholderState}>
                    {/* Decorative grid pattern */}
                    <div className={styles.gridPattern} />

                    <div className={styles.placeholderContent}>
                        <div className={styles.placeholderIcon}>
                            <MapPin size={28} strokeWidth={1.5} />
                        </div>
                        <h3 className={styles.placeholderTitle}>Property Imagery Not Available</h3>
                        {propertyAddress ? (
                            <p className={styles.placeholderAddress}>{propertyAddress}</p>
                        ) : (
                            <p className={styles.placeholderAddress} style={{ fontStyle: 'italic', opacity: 0.5 }}>
                                No property address on file
                            </p>
                        )}
                        <p className={styles.placeholderHint}>
                            Gather property intelligence to fetch satellite imagery, county assessor details, building records, and vision analysis.
                        </p>
                        <button
                            className={styles.enrichCta}
                            onClick={onEnrich}
                            disabled={isEnriching || !propertyAddress}
                        >
                            {isEnriching ? (
                                <>
                                    <Loader2 size={16} className={styles.spinning} />
                                    Gathering Data…
                                </>
                            ) : (
                                <>
                                    <Zap size={16} />
                                    Gather Property Data
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    /* ─── State: Enriched — Image Carousel ─── */
    return (
        <>
            <div className={styles.banner}>
                <div className={styles.enrichedState} onClick={() => setIsModalOpen(true)}>
                    {/* Carousel slides */}
                    <div className={styles.carouselTrack}>
                        {slides.map((slide, idx) => (
                            <div
                                key={idx}
                                className={`${styles.carouselSlide} ${idx === activeSlide ? styles.slideActive : styles.slideHidden}`}
                            >
                                {/* Loading shimmer while image loads */}
                                {idx === 0 && !imageLoaded && (
                                    <div className={styles.imageLoadingShimmer} />
                                )}
                                {idx === 1 && !streetViewLoaded && (
                                    <div className={styles.imageLoadingShimmer} />
                                )}
                                <Image
                                    src={slide.src}
                                    alt={slide.alt}
                                    fill
                                    unoptimized
                                    className={`${styles.bannerImage} ${
                                        (idx === 0 && imageLoaded) || (idx === 1 && streetViewLoaded)
                                            ? styles.imageVisible
                                            : styles.imageHidden
                                    }`}
                                    onLoad={idx === 0 ? handleImageLoad : () => setStreetViewLoaded(true)}
                                    onError={idx === 0 ? handleImageError : () => setStreetViewError(true)}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Navigation arrows (only if multiple slides) */}
                    {totalSlides > 1 && (
                        <>
                            <button className={`${styles.carouselArrow} ${styles.arrowLeft}`} onClick={prevSlide}>
                                <ChevronLeft size={20} />
                            </button>
                            <button className={`${styles.carouselArrow} ${styles.arrowRight}`} onClick={nextSlide}>
                                <ChevronRight size={20} />
                            </button>
                        </>
                    )}

                    {/* Slide indicator dots + label */}
                    <div className={styles.carouselIndicators}>
                        <div className={styles.slideLabel}>
                            {currentSlide?.icon}
                            <span>{currentSlide?.label}</span>
                        </div>
                        {totalSlides > 1 && (
                            <div className={styles.dots}>
                                {slides.map((slide, idx) => (
                                    <button
                                        key={idx}
                                        className={`${styles.dot} ${idx === activeSlide ? styles.dotActive : ''}`}
                                        onClick={(e) => { e.stopPropagation(); goToSlide(idx); }}
                                        title={slide.label}
                                    />
                                ))}
                            </div>
                        )}
                        {/* No street view indicator */}
                        {!hasStreetView && imageSrc && (
                            <div className={styles.noStreetView}>
                                <EyeOff size={12} />
                                <span>Street View not available</span>
                            </div>
                        )}
                    </div>

                    {/* Bottom gradient overlay */}
                    <div className={styles.bannerOverlay}>
                        <div className={styles.bannerContent}>
                            <div className={styles.bannerRow}>
                                <div>
                                    <h2 className={styles.bannerTitle}>Property Analysis</h2>
                                    <p className={styles.bannerSubtitle}>
                                        {currentSlide?.source?.captureDate ? (
                                            <>
                                                Source: {currentSlide.source.name} · <span style={{ color: '#38bdf8', fontWeight: 600 }}>Photo Taken: {currentSlide.source.captureDate}</span>
                                            </>
                                        ) : currentSlide?.label === 'Satellite View' ? (
                                            <>
                                                Source: Google Satellite Vision · Aerial Imagery © Google
                                            </>
                                        ) : (
                                            <>
                                                Source: {currentSlide?.source?.name || 'Unknown'} · Fetched {currentSlide?.source ? new Date(currentSlide.source.fetchedAt).toLocaleDateString() : 'N/A'}
                                            </>
                                        )}
                                    </p>
                                </div>
                                <div className={styles.bannerActions}>
                                    {fireRiskLabel && (
                                        <div
                                            className={styles.fireRiskBadge}
                                            style={{ borderColor: `${fireRiskColor}40` }}
                                        >
                                            <span className={styles.fireRiskLabel}>🔥 FIRE RISK</span>
                                            <span
                                                className={styles.fireRiskValue}
                                                style={{ color: fireRiskColor }}
                                            >
                                                {fireRiskLabel}
                                            </span>
                                        </div>
                                    )}
                                    <button className={styles.viewFullBtn}>
                                        <Maximize2 size={16} />
                                        View Full Image
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Source badge (bottom right) */}
                    {currentSlide?.source && (
                        <div className={styles.sourceBadge}>
                            {currentSlide.icon}
                            <span>{currentSlide.source.name}</span>
                            <span className={styles.sourceDot}>·</span>
                            <span className={styles.sourceType}>{(currentSlide.source.type || 'unknown').replace('_', ' ')}</span>
                            {currentSlide.source.confidence === 'high' && (
                                <span className={styles.confidenceCheck}>✓</span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Full-screen Modal ─── */}
            {isModalOpen && currentSlide && (
                <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
                    <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalTopBar}>
                            {/* Modal slide tabs */}
                            <div className={styles.modalTabs}>
                                {slides.map((slide, idx) => (
                                    <button
                                        key={idx}
                                        className={`${styles.modalTab} ${idx === activeSlide ? styles.modalTabActive : ''}`}
                                        onClick={() => goToSlide(idx)}
                                    >
                                        {slide.icon}
                                        <span>{slide.label}</span>
                                    </button>
                                ))}
                                {!hasStreetView && (
                                    <div className={styles.modalTabDisabled}>
                                        <EyeOff size={13} />
                                        <span>Street View N/A</span>
                                    </div>
                                )}
                            </div>
                            <button
                                className={styles.closeButton}
                                onClick={() => setIsModalOpen(false)}
                            >
                                <X size={18} />
                                Close
                            </button>
                        </div>

                        <div className={styles.modalImageWrapper}>
                            {totalSlides > 1 && (
                                <>
                                    <button
                                        className={`${styles.modalArrow} ${styles.modalArrowLeft}`}
                                        onClick={() => setActiveSlide(prev => (prev - 1 + totalSlides) % totalSlides)}
                                    >
                                        <ChevronLeft size={24} />
                                    </button>
                                    <button
                                        className={`${styles.modalArrow} ${styles.modalArrowRight}`}
                                        onClick={() => setActiveSlide(prev => (prev + 1) % totalSlides)}
                                    >
                                        <ChevronRight size={24} />
                                    </button>
                                </>
                            )}
                            <Image
                                src={currentSlide.src}
                                alt={currentSlide.alt}
                                fill
                                unoptimized
                                className={styles.modalImage}
                            />
                        </div>

                        {currentSlide.source && (
                            <div className={styles.modalMeta}>
                                <div className={styles.modalMetaItem}>
                                    <span className={styles.modalMetaLabel}>Source</span>
                                    <span>{currentSlide.source.name}</span>
                                </div>
                                {currentSlide.source.captureDate && (
                                    <div className={styles.modalMetaItem}>
                                        <span className={styles.modalMetaLabel}>Photo Captured</span>
                                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>{currentSlide.source.captureDate}</span>
                                    </div>
                                )}
                                <div className={styles.modalMetaItem}>
                                    <span className={styles.modalMetaLabel}>Type</span>
                                    <span style={{ textTransform: 'capitalize' }}>{(currentSlide.source.type || 'unknown').replace('_', ' ')}</span>
                                </div>
                                <div className={styles.modalMetaItem}>
                                    <span className={styles.modalMetaLabel}>Fetched</span>
                                    <span>{new Date(currentSlide.source.fetchedAt).toLocaleString()}</span>
                                </div>
                                <div className={styles.modalMetaItem}>
                                    <span className={styles.modalMetaLabel}>Confidence</span>
                                    <span style={{
                                        color: currentSlide.source.confidence === 'high' ? '#34d399' : '#94a3b8',
                                        fontWeight: 600,
                                    }}>
                                        {currentSlide.source.confidence}
                                    </span>
                                </div>
                                {fireRiskLabel && (
                                    <div className={styles.modalMetaItem}>
                                        <span className={styles.modalMetaLabel}>🔥 Fire Risk</span>
                                        <span style={{ color: fireRiskColor, fontWeight: 700 }}>
                                            {fireRiskLabel}
                                        </span>
                                    </div>
                                )}
                                {currentSlide.source.url && (
                                    <a
                                        href={currentSlide.source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.modalMetaLink}
                                    >
                                        <ExternalLink size={13} />
                                        View on {currentSlide.source.name}
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
