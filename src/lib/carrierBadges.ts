/**
 * Carrier badge definitions and normalization logic.
 * Standardizes carrier identification for RCE and DIC documents.
 */

export interface CarrierBadgeInfo {
    label: string;
    carrierKey: 'bamboo' | 'american_modern' | 'psic' | 'aegis' | 'sagesure' | 'other' | 'none';
    tooltip: string;
    textColor: string;
    bgColor: string;
    borderColor: string;
    hasDoc: boolean;
}

/**
 * Palette definitions for the 5 primary carriers + missing/other
 */
export const CARRIER_STYLES: Record<CarrierBadgeInfo['carrierKey'], {
    textColor: string;
    bgColor: string;
    borderColor: string;
}> = {
    // 1. Bamboo - Vibrant Orange (matches the Orange circular icon with bamboo stalks)
    bamboo: {
        textColor: '#ea580c',
        bgColor: 'rgba(234, 88, 12, 0.12)',
        borderColor: 'rgba(234, 88, 12, 0.30)',
    },
    // 2. American Modern - Teal / Cyan Blue (matches the multi-colored pinwheel icon)
    american_modern: {
        textColor: '#0891b2',
        bgColor: 'rgba(8, 145, 178, 0.12)',
        borderColor: 'rgba(8, 145, 178, 0.30)',
    },
    // 3. PSIC (Pacific Specialty) - Classic Navy / Blue (matches the psic wordmark)
    psic: {
        textColor: '#1d4ed8',
        bgColor: 'rgba(29, 78, 216, 0.12)',
        borderColor: 'rgba(29, 78, 216, 0.30)',
    },
    // 4. Aegis General - Slate / Steel Shield (matches the silver-slate shield outline icon)
    aegis: {
        textColor: '#475569',
        bgColor: 'rgba(71, 85, 105, 0.12)',
        borderColor: 'rgba(71, 85, 105, 0.30)',
    },
    // 5. SageSure - Vibrant Lime Green (matches the bright green 'S' leaf logo)
    sagesure: {
        textColor: '#65a30d',
        bgColor: 'rgba(101, 163, 13, 0.12)',
        borderColor: 'rgba(101, 163, 13, 0.30)',
    },
    other: {
        textColor: '#6366f1',
        bgColor: 'rgba(99, 102, 241, 0.12)',
        borderColor: 'rgba(99, 102, 241, 0.30)',
    },
    none: {
        textColor: '#dc2626',
        bgColor: 'rgba(239, 68, 68, 0.10)',
        borderColor: 'rgba(239, 68, 68, 0.20)',
    },
};

/**
 * Normalizes any carrier name, source string, or raw text into a standardized CarrierBadgeInfo.
 */
export function getCarrierBadge(
    carrierOrSource: string | null | undefined,
    hasDoc: boolean,
    docType: 'rce' | 'dic' = 'dic'
): CarrierBadgeInfo {
    if (!hasDoc) {
        return {
            label: 'No',
            carrierKey: 'none',
            tooltip: `No ${docType === 'rce' ? 'RCE' : 'DIC'} document linked`,
            textColor: CARRIER_STYLES.none.textColor,
            bgColor: CARRIER_STYLES.none.bgColor,
            borderColor: CARRIER_STYLES.none.borderColor,
            hasDoc: false,
        };
    }

    const raw = (carrierOrSource || '').trim();
    const lower = raw.toLowerCase();

    // 1. Bamboo
    if (
        lower.includes('bamboo') ||
        lower.includes('guidewire@bamboo') ||
        lower.includes('bamboo insurance')
    ) {
        return {
            label: 'Bamboo',
            carrierKey: 'bamboo',
            tooltip: `Bamboo Insurance (${docType.toUpperCase()})`,
            ...CARRIER_STYLES.bamboo,
            hasDoc: true,
        };
    }

    // 2. American Modern
    if (
        lower.includes('american modern') ||
        lower.includes('americanmodern') ||
        lower.includes('rce_american_modern') ||
        lower.includes('cotality') ||
        lower.includes('am rce') ||
        lower.includes('rce am') ||
        lower.includes('rcm am') ||
        lower.includes('quote am') ||
        lower.includes('dic am') ||
        lower.includes('homeowners flex') ||
        /\bAM\b/i.test(raw)
    ) {
        return {
            label: 'American Modern',
            carrierKey: 'american_modern',
            tooltip: `American Modern Insurance (${docType.toUpperCase()})`,
            ...CARRIER_STYLES.american_modern,
            hasDoc: true,
        };
    }

    // 3. PSIC (Pacific Specialty)
    if (
        lower.includes('pacific specialty') ||
        lower.includes('pacificspecialty') ||
        lower.includes('psic')
    ) {
        return {
            label: 'PSIC',
            carrierKey: 'psic',
            tooltip: `Pacific Specialty Insurance Company (PSIC ${docType.toUpperCase()})`,
            ...CARRIER_STYLES.psic,
            hasDoc: true,
        };
    }

    // 4. Aegis
    if (
        lower.includes('aegis') ||
        lower.includes('aegis general') ||
        lower.includes('aegis security')
    ) {
        return {
            label: 'Aegis',
            carrierKey: 'aegis',
            tooltip: `Aegis Security Insurance Company (${docType.toUpperCase()})`,
            ...CARRIER_STYLES.aegis,
            hasDoc: true,
        };
    }

    // 360Value default (commonly Bamboo in this system)
    if (lower === 'rce_360value' || lower === '360value') {
        return {
            label: 'Bamboo',
            carrierKey: 'bamboo',
            tooltip: 'Bamboo 360Value Replacement Cost Estimator',
            ...CARRIER_STYLES.bamboo,
            hasDoc: true,
        };
    }

    // Default / Other recognized carrier
    if (raw) {
        const shortLabel = raw.length > 16 ? `${raw.slice(0, 14)}...` : raw;
        return {
            label: shortLabel,
            carrierKey: 'other',
            tooltip: `${raw} (${docType.toUpperCase()})`,
            ...CARRIER_STYLES.other,
            hasDoc: true,
        };
    }

    // If hasDoc is true but no specific carrier was identified
    return {
        label: 'Bamboo',
        carrierKey: 'bamboo',
        tooltip: docType === 'rce' ? 'Bamboo 360Value RCE' : 'Bamboo DIC Policy',
        ...CARRIER_STYLES.bamboo,
        hasDoc: true,
    };
}

/**
 * Detect carrier info directly from a document object (file_name, carrier_name, doc_type, source, created_by).
 */
export function detectDocumentCarrier(doc: {
    file_name?: string | null;
    doc_type?: string | null;
    carrier_name?: string | null;
    source?: string | null;
    created_by?: string | null;
}): CarrierBadgeInfo | null {
    const fileName = doc.file_name || '';
    const docType = doc.doc_type || '';
    const carrierName = doc.carrier_name || '';
    const source = doc.source || '';
    const createdBy = doc.created_by || '';

    const combined = `${carrierName} ${source} ${createdBy} ${fileName}`.trim();
    const lower = combined.toLowerCase();

    // 1. American Modern
    if (
        lower.includes('american modern') ||
        lower.includes('americanmodern') ||
        lower.includes('rce_american_modern') ||
        lower.includes('cotality') ||
        lower.includes('homeowners flex') ||
        lower.includes('rce am') ||
        lower.includes('rcm am') ||
        lower.includes('quote am') ||
        lower.includes('dic am') ||
        /\bAM\b/.test(fileName) ||
        /[\s_]AM[\s_\.]/i.test(fileName)
    ) {
        return {
            label: 'American Modern',
            carrierKey: 'american_modern',
            tooltip: 'American Modern Insurance',
            ...CARRIER_STYLES.american_modern,
            hasDoc: true,
        };
    }

    // 2. PSIC (Pacific Specialty)
    if (
        lower.includes('pacific specialty') ||
        lower.includes('pacificspecialty') ||
        lower.includes('psic')
    ) {
        return {
            label: 'PSIC',
            carrierKey: 'psic',
            tooltip: 'Pacific Specialty Insurance Company (PSIC)',
            ...CARRIER_STYLES.psic,
            hasDoc: true,
        };
    }

    // 3. Aegis
    if (
        lower.includes('aegis') ||
        lower.includes('aegis general') ||
        lower.includes('aegis security') ||
        lower.includes('obsidian') ||
        /(?:^|[^0-9])Q5[0-9]{5,}/i.test(fileName) ||
        /(?:^|[^0-9])Q[0-9]{6,}/i.test(fileName)
    ) {
        return {
            label: 'Aegis',
            carrierKey: 'aegis',
            tooltip: 'Aegis Security / Obsidian Pacific',
            ...CARRIER_STYLES.aegis,
            hasDoc: true,
        };
    }

    // 4. Bamboo
    if (
        lower.includes('bamboo') ||
        lower.includes('guidewire@bamboo') ||
        lower.includes('360value') ||
        lower.includes('rce_360value')
    ) {
        return {
            label: 'Bamboo',
            carrierKey: 'bamboo',
            tooltip: 'Bamboo Insurance',
            ...CARRIER_STYLES.bamboo,
            hasDoc: true,
        };
    }

    // If it's a specific carrier name directly provided
    if (carrierName && carrierName !== 'unknown') {
        return {
            label: carrierName,
            carrierKey: 'other',
            tooltip: carrierName,
            ...CARRIER_STYLES.other,
            hasDoc: true,
        };
    }

    // For RCE or DIC docs without explicit carrier name, default to Bamboo (360Value standard)
    if (docType === 'rce') {
        return {
            label: 'Bamboo',
            carrierKey: 'bamboo',
            tooltip: 'Bamboo 360Value RCE',
            ...CARRIER_STYLES.bamboo,
            hasDoc: true,
        };
    }

    return null;
}
