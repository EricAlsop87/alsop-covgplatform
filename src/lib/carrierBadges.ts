/**
 * Carrier badge definitions and normalization logic.
 * Standardizes carrier identification for RCE and DIC documents.
 */

export interface CarrierBadgeInfo {
    label: string;
    carrierKey: 'bamboo' | 'american_modern' | 'psic' | 'aegis' | 'sagesure' | 'none';
    tooltip: string;
    textColor: string;
    bgColor: string;
    borderColor: string;
    hasDoc: boolean;
}

/**
 * Palette definitions for companion carriers + missing
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
    // 5. SageSure - Violet / Purple
    sagesure: {
        textColor: '#7c3aed',
        bgColor: 'rgba(124, 58, 237, 0.12)',
        borderColor: 'rgba(124, 58, 237, 0.30)',
    },
    // None
    none: {
        textColor: '#94a3b8',
        bgColor: 'rgba(148, 163, 184, 0.12)',
        borderColor: 'rgba(148, 163, 184, 0.30)',
    },
};

/**
 * Normalizes long or verbose carrier names to short clean brand names
 * (e.g. "American Modern Property and Casualty Insurance Company" -> "American Modern")
 */
export function normalizeCarrierDisplayName(raw: string | null | undefined): string {
    if (!raw) return '—';
    const lower = raw.trim().toLowerCase();
    if (lower.includes('american modern') || lower.includes('americanmodern') || lower.includes('cotality') || lower.includes('rct express') || lower === 'am') {
        return 'American Modern';
    }
    if (lower.includes('pacific specialty') || lower.includes('pacificspecialty') || lower.includes('psic')) {
        return 'PSIC';
    }
    if (lower.includes('aegis') || lower.includes('obsidian')) {
        return 'Aegis';
    }
    if (lower.includes('bamboo') || lower.includes('guidewire@bamboo')) {
        return 'Bamboo';
    }
    if (lower.includes('sagesure') || lower.includes('sage sure')) {
        return 'SageSure';
    }
    if (lower.includes('fair plan') || lower.includes('california fair') || lower.includes('cfp')) {
        return 'California FAIR Plan';
    }
    return raw.trim();
}

/**
 * Normalizes any carrier name, source string, or raw text into a standardized CarrierBadgeInfo.
 * Resolves strictly to one of the 4 supported companion carriers (Bamboo, American Modern, PSIC, Aegis).
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

    // 1. American Modern
    if (
        lower.includes('american modern') ||
        lower.includes('americanmodern') ||
        lower.includes('rce_american_modern') ||
        lower.includes('cotality') ||
        lower.includes('rct express') ||
        lower.includes('am rce') ||
        lower.includes('rce am') ||
        lower.includes('rcm am') ||
        lower.includes('quote am') ||
        lower.includes('dic am') ||
        lower.includes('homeowners flex') ||
        lower.includes('manufactured home') ||
        /\bam\b/i.test(raw) ||
        /(?:^|[^0-9])005[0-9]{6,}/.test(lower)
    ) {
        return {
            label: 'American Modern',
            carrierKey: 'american_modern',
            tooltip: `American Modern Insurance (${docType.toUpperCase()})`,
            ...CARRIER_STYLES.american_modern,
            hasDoc: true,
        };
    }

    // 2. PSIC (Pacific Specialty)
    if (
        lower.includes('pacific specialty') ||
        lower.includes('pacificspecialty') ||
        lower.includes('psic') ||
        /(?:^|[^0-9])ho62[0-9]{6,}/i.test(lower) ||
        /(?:^|[^0-9])ho6[0-9]{6,}/i.test(lower)
    ) {
        return {
            label: 'PSIC',
            carrierKey: 'psic',
            tooltip: `Pacific Specialty Insurance Company (PSIC ${docType.toUpperCase()})`,
            ...CARRIER_STYLES.psic,
            hasDoc: true,
        };
    }

    // 3. Aegis
    if (
        lower.includes('aegis') ||
        lower.includes('aegis general') ||
        lower.includes('aegis security') ||
        lower.includes('webservices@aegis') ||
        lower.includes('obsidian') ||
        /(?:^|[^0-9])q5[0-9]{5,}/i.test(lower)
    ) {
        return {
            label: 'Aegis',
            carrierKey: 'aegis',
            tooltip: `Aegis Security / Aegis General (${docType.toUpperCase()})`,
            ...CARRIER_STYLES.aegis,
            hasDoc: true,
        };
    }

    // 4. Bamboo
    if (
        lower.includes('bamboo') ||
        lower.includes('guidewire@bamboo') ||
        lower.includes('bamboo insurance') ||
        lower.includes('bamboo web services') ||
        lower.includes('casnh') ||
        /(?:^|[^0-9])q100[0-9]{5,}/i.test(lower)
    ) {
        return {
            label: 'Bamboo',
            carrierKey: 'bamboo',
            tooltip: `Bamboo Insurance (${docType.toUpperCase()})`,
            ...CARRIER_STYLES.bamboo,
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

    // Default to Bamboo for standard 360Value / Companion docs
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
 * Resolves strictly to one of the supported companion carriers: Bamboo, American Modern, PSIC, Aegis, SageSure.
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

    // Check specific carriers FIRST before any generic 360Value fallback

    // 1. American Modern (AM, Cotality, RCT Express, Homeowners Flex, 005...)
    if (
        lower.includes('american modern') ||
        lower.includes('americanmodern') ||
        lower.includes('rce_american_modern') ||
        lower.includes('cotality') ||
        lower.includes('rct express') ||
        lower.includes('homeowners flex') ||
        lower.includes('manufactured home') ||
        lower.includes('rce am') ||
        lower.includes('rcm am') ||
        lower.includes('quote am') ||
        lower.includes('dic am') ||
        /(?:^|[^0-9])005[0-9]{6,}/.test(fileName) ||
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
        lower.includes('psic') ||
        /(?:^|[^0-9])HO62[0-9]{6,}/i.test(fileName) ||
        /(?:^|[^0-9])HO6[0-9]{6,}/i.test(fileName)
    ) {
        return {
            label: 'PSIC',
            carrierKey: 'psic',
            tooltip: 'Pacific Specialty Insurance Company (PSIC)',
            ...CARRIER_STYLES.psic,
            hasDoc: true,
        };
    }

    // 3. Aegis (Obsidian, Aegis Security, Aegis General, webservices@aegis, Q5... quotes)
    if (
        lower.includes('aegis') ||
        lower.includes('aegis general') ||
        lower.includes('aegis security') ||
        lower.includes('webservices@aegis') ||
        lower.includes('obsidian') ||
        /(?:^|[^0-9])Q5[0-9]{5,}/i.test(fileName)
    ) {
        return {
            label: 'Aegis',
            carrierKey: 'aegis',
            tooltip: 'Aegis Security / Aegis General',
            ...CARRIER_STYLES.aegis,
            hasDoc: true,
        };
    }

    // 4. Bamboo (guidewire@bamboo, bamboo web services, bamboo insurance, Q100..., CASNH)
    if (
        lower.includes('bamboo') ||
        lower.includes('guidewire@bamboo') ||
        lower.includes('bamboo insurance') ||
        lower.includes('bamboo web services') ||
        lower.includes('casnh') ||
        /(?:^|[^0-9])Q100[0-9]{5,}/i.test(fileName)
    ) {
        return {
            label: 'Bamboo',
            carrierKey: 'bamboo',
            tooltip: 'Bamboo Insurance',
            ...CARRIER_STYLES.bamboo,
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
            tooltip: 'SageSure Insurance',
            ...CARRIER_STYLES.sagesure,
            hasDoc: true,
        };
    }

    // For generic 360Value / Companion docs with no specific carrier found, default to Bamboo (360Value standard)
    if (lower.includes('360value') || lower.includes('rce_360value')) {
        return {
            label: 'Bamboo',
            carrierKey: 'bamboo',
            tooltip: docType === 'rce' ? 'Bamboo 360Value RCE' : 'Bamboo DIC Policy',
            ...CARRIER_STYLES.bamboo,
            hasDoc: true,
        };
    }

    if (docType === 'rce' || docType === 'dic_dec_page') {
        return {
            label: 'Bamboo',
            carrierKey: 'bamboo',
            tooltip: docType === 'rce' ? 'Bamboo 360Value RCE' : 'Bamboo DIC Quote',
            ...CARRIER_STYLES.bamboo,
            hasDoc: true,
        };
    }

    return null;
}
