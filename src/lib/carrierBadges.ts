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
    bamboo: {
        textColor: '#16a34a',
        bgColor: 'rgba(34, 197, 94, 0.12)',
        borderColor: 'rgba(34, 197, 94, 0.30)',
    },
    american_modern: {
        textColor: '#0284c7',
        bgColor: 'rgba(2, 132, 199, 0.12)',
        borderColor: 'rgba(2, 132, 199, 0.30)',
    },
    psic: {
        textColor: '#9333ea',
        bgColor: 'rgba(147, 51, 234, 0.12)',
        borderColor: 'rgba(147, 51, 234, 0.30)',
    },
    aegis: {
        textColor: '#d97706',
        bgColor: 'rgba(217, 119, 6, 0.12)',
        borderColor: 'rgba(217, 119, 6, 0.30)',
    },
    sagesure: {
        textColor: '#0d9488',
        bgColor: 'rgba(13, 148, 136, 0.12)',
        borderColor: 'rgba(13, 148, 136, 0.30)',
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
        lower.includes('rce_american_modern') ||
        lower.includes('cotality') ||
        lower.includes('am rce') ||
        lower.includes('homeowners flex')
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

    // 5. SageSure
    if (
        lower.includes('sagesure') ||
        lower.includes('sage sure')
    ) {
        return {
            label: 'SageSure',
            carrierKey: 'sagesure',
            tooltip: `SageSure Insurance (${docType.toUpperCase()})`,
            ...CARRIER_STYLES.sagesure,
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
