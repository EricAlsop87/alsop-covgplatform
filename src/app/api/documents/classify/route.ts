import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import zlib from 'zlib';

/** Vercel function config */
export const maxDuration = 30;

export interface ClassificationResult {
    detectedType: 'dec_page' | 'rce' | 'dic_dec_page' | 'quote';
    carrier: 'California FAIR Plan' | 'bamboo' | 'aegis' | 'psic' | 'american_modern';
    coverageType: 'DEC' | 'RCE' | 'DIC' | 'FULL';
    label: string;
    categoryIndex: number;
}

/**
 * Classify a PDF document by extracting raw text and matching exact 13-category rules.
 * Returns the detected document category without storing anything.
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
        if (isAuthError(auth)) return auth;

        let formData: FormData;
        try {
            formData = await request.formData();
        } catch {
            return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
        }

        const file = formData.get('file') as File | null;
        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Read file bytes and extract raw text
        const buffer = Buffer.from(await file.arrayBuffer());
        
        // PDF text extraction with Flate decompression support
        const rawText = extractPdfText(buffer);
        const upperText = rawText.toUpperCase();

        // Deterministically classify into one of the 13 supported categories
        const result = classifyDocument(upperText, file.name);

        return NextResponse.json({
            detectedType: result.detectedType,
            carrier: result.carrier,
            coverageType: result.coverageType,
            label: result.label,
            categoryIndex: result.categoryIndex,
            textLength: rawText.length,
        });
    } catch (error) {
        console.error('Classification error:', error);
        return NextResponse.json({ error: 'Classification failed' }, { status: 500 });
    }
}

/**
 * Clean and assemble text pieces from PDF stream content, handling kerning TJ arrays and Tj strings.
 */
function cleanPdfStream(decompressed: string): string {
    let out = '';
    // Match TJ arrays: [ (str) num (str) ... ] TJ
    const tjRegex = /\[(.*?)\]\s*TJ/gi;
    let m;
    while ((m = tjRegex.exec(decompressed)) !== null) {
        const arrayContent = m[1];
        const strParts: string[] = [];
        const partRegex = /\((.*?)\)/g;
        let pm;
        while ((pm = partRegex.exec(arrayContent)) !== null) {
            strParts.push(pm[1]);
        }
        out += ' ' + strParts.join('');
    }
    // Match Tj strings: (str) Tj
    const singleTjRegex = /\((.*?)\)\s*Tj/gi;
    while ((m = singleTjRegex.exec(decompressed)) !== null) {
        out += ' ' + m[1];
    }
    return out;
}

/**
 * Extract readable text from a PDF buffer.
 * Decodes text from PDF content streams (handling FlateDecode compression, TJ/Tj operators) and literal strings.
 */
function extractPdfText(buffer: Buffer): string {
    const text = buffer.toString('latin1');
    const chunks: string[] = [];
    
    // Extract text from PDF literal strings (parenthesized text)
    const stringRegex = /\(([^)]{2,})\)/g;
    let match;
    while ((match = stringRegex.exec(text)) !== null) {
        const printable = match[1].replace(/[^\x20-\x7E]/g, '').trim();
        if (printable.length > 1) {
            chunks.push(printable);
        }
    }

    // Extract and decompress text from PDF streams (FlateDecode)
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    while ((match = streamRegex.exec(text)) !== null) {
        const streamStart = match.index + match[0].indexOf('\n') + 1;
        const streamEnd = match.index + match[0].lastIndexOf('endstream');
        const rawStream = buffer.subarray(streamStart, streamEnd);

        try {
            const decompressed = zlib.inflateSync(rawStream).toString('latin1');
            const streamText = cleanPdfStream(decompressed);
            if (streamText.length > 5) {
                chunks.push(streamText);
            }
            const printable = decompressed.replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
            if (printable.length > 10) {
                chunks.push(printable);
            }
        } catch {
            try {
                const decompressed = zlib.inflateRawSync(rawStream).toString('latin1');
                const streamText = cleanPdfStream(decompressed);
                if (streamText.length > 5) chunks.push(streamText);
                const printable = decompressed.replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
                if (printable.length > 10) chunks.push(printable);
            } catch {
                // Uncompressed stream fallback
                const printable = match[1].replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
                if (printable.length > 10) {
                    chunks.push(printable);
                }
            }
        }
    }
    
    return chunks.join(' ').slice(0, 100000); // Cap at 100k chars
}

/**
 * Classify document into exactly one of the 13 supported categories:
 * 1. California FAIR Plan Dec Page (All transactions: New, Renewal, Endorsement, Summary)
 * 2. Bamboo RCE
 * 3. Aegis RCE
 * 4. PSIC RCE
 * 5. American Modern RCE
 * 6. Bamboo DIC Quote
 * 7. Bamboo Full Quote
 * 8. Aegis DIC Quote
 * 9. Aegis Full Quote
 * 10. PSIC DIC Quote
 * 11. PSIC Full Quote
 * 12. American Modern DIC Quote
 * 13. American Modern Full Quote
 */
export function classifyDocument(upperText: string, fileName: string = ''): ClassificationResult {
    const fnUpper = fileName.toUpperCase();

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1: California FAIR Plan Dec Page (Category 1)
    // Dec Pages come ONLY from California FAIR Plan with Policy Numbers (010..., 020..., 011..., CFP...)
    // ──────────────────────────────────────────────────────────────────────────
    const hasCfpPolicyNumber = (
        /(?:^|[^0-9])010\d{7}(?:[^0-9]|$)/.test(upperText) ||
        /(?:^|[^0-9])020\d{7}(?:[^0-9]|$)/.test(upperText) ||
        /(?:^|[^0-9])011\d{7}(?:[^0-9]|$)/.test(upperText) ||
        /(?:^|[^0-9])012\d{7}(?:[^0-9]|$)/.test(upperText) ||
        /(?:^|[^0-9])010\d{7}(?:[^0-9]|$)/.test(fnUpper) ||
        /(?:^|[^0-9])020\d{7}(?:[^0-9]|$)/.test(fnUpper) ||
        /(?:^|[^0-9])011\d{7}(?:[^0-9]|$)/.test(fnUpper)
    );

    const cfpContentMarkers = [
        'CALIFORNIA FAIR PLAN ASSOCIATION',
        'CALIFORNIA FAIR PLAN',
        'DWELLING INSURANCE POLICY DECLARATIONS',
        'DWELLING PROPERTY POLICY DECLARATIONS',
        'DWELLING ENDORSEMENT SUMMARY',
        'COVERAGES, LIMITS, PERILS AND PREMIUMS',
        'CFPNET.COM',
        'CALIFORNIA FAIR PLAN PROPERTY INSURANCE',
        'POLICY PERIOD',
    ];
    const cfpMarkerHits = cfpContentMarkers.filter(m => upperText.includes(m)).length;

    const isCompanionCarrierMarker = (
        upperText.includes('GUIDEWIRE@BAMBOO') ||
        upperText.includes('BAMBOO WEB SERVICES') ||
        upperText.includes('WEBSERVICES@AEGIS') ||
        upperText.includes('AEGIS WEB SERVICES') ||
        upperText.includes('AMERICAN MODERN PROPERTY') ||
        upperText.includes('PACIFIC SPECIALTY INSURANCE')
    );

    const isCfpDoc = (
        (hasCfpPolicyNumber && (cfpMarkerHits >= 1 || upperText.includes('FAIR PLAN') || fnUpper.includes('CFP') || fnUpper.includes('RENEWAL_EMAIL_ATTACHMENT') || fnUpper.includes('RENEWAL_OFFER'))) ||
        (cfpMarkerHits >= 2 && !isCompanionCarrierMarker) ||
        (upperText.includes('CALIFORNIA FAIR PLAN') && !upperText.includes('360VALUE') && !upperText.includes('COTALITY'))
    );

    if (isCfpDoc && !isCompanionCarrierMarker) {
        return {
            detectedType: 'dec_page',
            carrier: 'California FAIR Plan',
            coverageType: 'DEC',
            label: 'Declaration Page (California FAIR Plan)',
            categoryIndex: 1,
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2: RCE Valuation Documents (Categories 2 to 5)
    // ──────────────────────────────────────────────────────────────────────────
    const isRceStructure = (
        upperText.includes('360VALUE') ||
        upperText.includes('REPLACEMENT COST ESTIMAT') ||
        upperText.includes('REPLACEMENT COST VALUATION') ||
        upperText.includes('DETAILED REPORT ESTIMATE') ||
        upperText.includes('VALUATION TOTALS DETAIL') ||
        upperText.includes('VALUATION TOTALS SUMMARY') ||
        upperText.includes('RECONSTRUCTION COST WITHOUT/WITH DEBRIS REMOVAL') ||
        upperText.includes('RECONSTRUCTION COST WITH DEBRIS REMOVAL') ||
        upperText.includes('COTALITY') ||
        upperText.includes('RCT EXPRESS') ||
        fnUpper.includes('RCE') ||
        fnUpper.includes('360VALUE') ||
        fnUpper.includes('VALUATION')
    );

    if (isRceStructure && !upperText.includes('QUOTE SUMMARY') && !upperText.includes('HOMEOWNERS FLEX QUOTE')) {
        // 2. Bamboo RCE
        if (
            upperText.includes('GUIDEWIRE@BAMBOO') ||
            upperText.includes('BAMBOO WEB SERVICES') ||
            upperText.includes('BAMBOO') ||
            fnUpper.includes('BAMBOO')
        ) {
            return {
                detectedType: 'rce',
                carrier: 'bamboo',
                coverageType: 'RCE',
                label: 'Bamboo RCE (360Value)',
                categoryIndex: 2,
            };
        }

        // 3. Aegis RCE
        if (
            upperText.includes('WEBSERVICES@AEGIS') ||
            upperText.includes('AEGIS WEB SERVICES') ||
            upperText.includes('AEGIS SECURITY') ||
            upperText.includes('AEGIS GENERAL') ||
            upperText.includes('AEGIS') ||
            fnUpper.includes('AEGIS')
        ) {
            return {
                detectedType: 'rce',
                carrier: 'aegis',
                coverageType: 'RCE',
                label: 'Aegis RCE (360Value)',
                categoryIndex: 3,
            };
        }

        // 4. PSIC RCE
        if (
            upperText.includes('PACIFIC SPECIALTY') ||
            upperText.includes('PSIC') ||
            fnUpper.includes('PSIC') ||
            fnUpper.includes('PACIFIC')
        ) {
            return {
                detectedType: 'rce',
                carrier: 'psic',
                coverageType: 'RCE',
                label: 'PSIC RCE (360Value)',
                categoryIndex: 4,
            };
        }

        // 5. American Modern RCE
        if (
            upperText.includes('AMERICAN MODERN') ||
            upperText.includes('AMERICANMODERN') ||
            upperText.includes('COTALITY') ||
            upperText.includes('VALUATION TOTALS') ||
            upperText.includes('DETAILED REPORT ESTIMATE') ||
            fnUpper.includes('AMERICAN MODERN') ||
            fnUpper.includes('AM RCE') ||
            fnUpper.includes('RCE AM')
        ) {
            return {
                detectedType: 'rce',
                carrier: 'american_modern',
                coverageType: 'RCE',
                label: 'American Modern RCE',
                categoryIndex: 5,
            };
        }

        // Default RCE to Bamboo (360Value standard)
        return {
            detectedType: 'rce',
            carrier: 'bamboo',
            coverageType: 'RCE',
            label: 'Bamboo RCE (360Value)',
            categoryIndex: 2,
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 3: Carrier Quotes (DIC vs Full Quotes - Categories 6 to 13)
    // ──────────────────────────────────────────────────────────────────────────

    // ── American Modern Quotes (Categories 12 & 13) ──
    const isAmQuote = (
        upperText.includes('AMERICAN MODERN') ||
        upperText.includes('AMERICANMODERN') ||
        upperText.includes('HOMEOWNERS FLEX') ||
        upperText.includes('MANUFACTURED HOME') ||
        fnUpper.includes('AMERICAN MODERN') ||
        fnUpper.includes('AMERICANMODERN') ||
        fnUpper.includes('QUOTE AM') ||
        fnUpper.includes('DIC AM') ||
        fnUpper.includes('DIC_AM') ||
        /[\s_\-]AM[\s_\.\(\)\-]/i.test(fileName) ||
        /(?:^|[^0-9])005[0-9]{6,}/.test(fileName)
    );
    if (isAmQuote) {
        const isAmDic = (
            upperText.includes('DIC - FIRE, EXTENDED COVERAGE') ||
            upperText.includes('DIC -') ||
            upperText.includes('DIFFERENCE IN CONDITIONS') ||
            fnUpper.includes('DIC')
        );
        if (isAmDic) {
            return {
                detectedType: 'dic_dec_page',
                carrier: 'american_modern',
                coverageType: 'DIC',
                label: 'American Modern DIC Quote',
                categoryIndex: 12,
            };
        }
        return {
            detectedType: 'quote',
            carrier: 'american_modern',
            coverageType: 'FULL',
            label: 'American Modern Full Quote',
            categoryIndex: 13,
        };
    }

    // ── Aegis Quotes (Categories 8 & 9) ──
    const isAegisQuote = (
        upperText.includes('AEGIS') ||
        upperText.includes('OBSIDIAN') ||
        fnUpper.includes('AEGIS') ||
        fnUpper.includes('OBSIDIAN') ||
        /(?:^|[^0-9])Q5[0-9]{5,}/i.test(fileName) ||
        /(?:^|[^0-9])Q5[0-9]{5,}/i.test(upperText)
    );
    if (isAegisQuote) {
        const isAegisDic = (
            upperText.includes('CALIFORNIA DIC QUOTE') ||
            upperText.includes('DIFFERENCE IN CONDITIONS SELECTED') ||
            upperText.includes('DIFFERENCE IN CONDITIONS') ||
            fnUpper.includes('DIC')
        );
        if (isAegisDic) {
            return {
                detectedType: 'dic_dec_page',
                carrier: 'aegis',
                coverageType: 'DIC',
                label: 'Aegis DIC Quote',
                categoryIndex: 8,
            };
        }
        return {
            detectedType: 'quote',
            carrier: 'aegis',
            coverageType: 'FULL',
            label: 'Aegis Full Quote (HO-3)',
            categoryIndex: 9,
        };
    }

    // ── PSIC Quotes (Categories 10 & 11) ──
    const isPsicQuote = (
        upperText.includes('PACIFIC SPECIALTY') ||
        upperText.includes('PSIC') ||
        fnUpper.includes('PSIC') ||
        fnUpper.includes('PACIFIC') ||
        /(?:^|[^0-9])HO62[0-9]{6,}/i.test(fileName) ||
        /(?:^|[^0-9])HO6[0-9]{6,}/i.test(fileName)
    );
    if (isPsicQuote) {
        const isPsicDic = (
            upperText.includes('DIFFERENCE IN CONDITIONS INCLUDED') ||
            upperText.includes('DIFFERENCE IN CONDITIONS') ||
            fnUpper.includes('DIC')
        );
        if (isPsicDic) {
            return {
                detectedType: 'dic_dec_page',
                carrier: 'psic',
                coverageType: 'DIC',
                label: 'PSIC DIC Quote',
                categoryIndex: 10,
            };
        }
        return {
            detectedType: 'quote',
            carrier: 'psic',
            coverageType: 'FULL',
            label: 'PSIC Full Quote',
            categoryIndex: 11,
        };
    }

    // ── Bamboo Quotes (Categories 6 & 7 - Default Companion Carrier) ──
    const isBambooDic = (
        upperText.includes('THIS POLICY DOES NOT COVER THE PERIL OF FIRE') ||
        upperText.includes('DIFFERENCE IN CONDITIONS') ||
        fnUpper.includes('DIC')
    );

    if (isBambooDic) {
        return {
            detectedType: 'dic_dec_page',
            carrier: 'bamboo',
            coverageType: 'DIC',
            label: 'Bamboo DIC Quote',
            categoryIndex: 6,
        };
    }

    // Default Companion Full Quote (Category 7: Bamboo Full Quote)
    return {
        detectedType: 'quote',
        carrier: 'bamboo',
        coverageType: 'FULL',
        label: 'Bamboo Full Quote',
        categoryIndex: 7,
    };
}

