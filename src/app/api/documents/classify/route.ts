import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import zlib from 'zlib';

/** Vercel function config */
export const maxDuration = 30;

/**
 * Classify a PDF document by extracting raw text and matching keywords.
 * Returns the detected document type without storing anything.
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

        // Classify based on keyword matching (mirrors Python worker's classify_document_text)
        const detectedType = classifyDocument(upperText, file.name);

        // Find the label for the detected type
        const typeLabels: Record<string, string> = {
            'dec_page': 'Declaration Page',
            'rce': 'RCE',
            'dic_dec_page': 'DIC Dec Page',
            'other': 'Other',
        };

        return NextResponse.json({
            detectedType,
            label: typeLabels[detectedType] || detectedType.toUpperCase(),
            textLength: rawText.length,
        });
    } catch (error) {
        console.error('Classification error:', error);
        return NextResponse.json({ error: 'Classification failed' }, { status: 500 });
    }
}

/**
 * Extract readable text from a PDF buffer.
 * Decodes text from PDF content streams (handling FlateDecode compression) and literal strings.
 */
function extractPdfText(buffer: Buffer): string {
    const text = buffer.toString('latin1');
    const chunks: string[] = [];
    
    // Extract text from PDF literal strings (parenthesized text)
    const stringRegex = /\(([^)]{3,})\)/g;
    let match;
    while ((match = stringRegex.exec(text)) !== null) {
        const printable = match[1].replace(/[^\x20-\x7E]/g, '').trim();
        if (printable.length > 2) {
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
            let m;
            while ((m = stringRegex.exec(decompressed)) !== null) {
                const p = m[1].replace(/[^\x20-\x7E]/g, '').trim();
                if (p.length > 2) chunks.push(p);
            }
            const printable = decompressed.replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
            if (printable.length > 10) {
                chunks.push(printable);
            }
        } catch {
            // Uncompressed stream fallback
            const printable = match[1].replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
            if (printable.length > 10) {
                chunks.push(printable);
            }
        }
    }
    
    return chunks.join(' ').slice(0, 15000); // Cap at 15k chars
}

/**
 * Classify document type based on keyword matching and filename.
 * Priority order matches Python worker's classify_document_text().
 */
function classifyDocument(upperText: string, fileName: string = ''): string {
    const fnUpper = fileName.toUpperCase();

    // 0. Check filename signals FIRST for California FAIR Plan Dec Pages & Renewal Attachments
    // CFP Renewal email attachments always use names like:
    // "Renewal_Email_Attachment_CFP 0102482286_10602788_2026-09-05_234440.pdf"
    const isCfpFilename = (
        fnUpper.includes('RENEWAL_EMAIL_ATTACHMENT') ||
        fnUpper.includes('RENEWAL_OFFER') ||
        fnUpper.includes('FAIR PLAN') ||
        fnUpper.includes('FAIR_PLAN') ||
        fnUpper.includes('CFP DEC') ||
        fnUpper.includes('CFP_DEC') ||
        /(?:^|[^0-9])010\d{7}(?:[^0-9]|$)/.test(fnUpper) ||
        /(?:^|[^0-9])020\d{7}(?:[^0-9]|$)/.test(fnUpper) ||
        /(?:^|[^0-9])011\d{7}(?:[^0-9]|$)/.test(fnUpper) ||
        (fnUpper.includes('CFP') && !fnUpper.includes('BAMBOO') && !fnUpper.includes('AEGIS') && !fnUpper.includes('AMERICAN MODERN') && !fnUpper.includes('SAGESURE') && !fnUpper.includes('PSIC') && !fnUpper.includes('QUOTE') && !fnUpper.includes('RCE'))
    );

    const isCompanionCarrier = (
        fnUpper.includes('BAMBOO') ||
        fnUpper.includes('AEGIS') ||
        fnUpper.includes('AMERICAN MODERN') ||
        fnUpper.includes('AMERICANMODERN') ||
        fnUpper.includes('SAGESURE') ||
        fnUpper.includes('PSIC') ||
        fnUpper.includes('PACIFIC SPECIALTY')
    );

    if (isCfpFilename && !isCompanionCarrier && !fnUpper.includes('RCE') && !fnUpper.includes('360VALUE') && !fnUpper.includes('VALUATION')) {
        return 'dec_page';
    }

    if (fnUpper.includes('RCE') || fnUpper.includes('360VALUE') || fnUpper.includes('VALUATION')) {
        return 'rce';
    }
    if (fnUpper.includes('DIC') && !fnUpper.includes('CFP')) {
        return 'dic_dec_page';
    }

    // 1. Check for FAIR Plan Dec Page (highest priority)
    // Note: CFP Dec Pages contain legal disclosures with "Difference in Conditions (DIC)",
    // so CFP must ALWAYS be checked before DIC to prevent false DIC classification.
    const decPageMarkers = [
        'CALIFORNIA FAIR PLAN',
        'FAIR PLAN ASSOCIATION',
        'FAIR PLAN',
        'DWELLING INSURANCE POLICY DECLARATIONS',
        'DWELLING PROPERTY POLICY DECLARATIONS',
        'CFPNET.COM',
        'DWELLING FIRE',
        'CALIFORNIA FAIR PLAN PROPERTY INSURANCE',
        'POLICY PERIOD',
    ];
    const isCfp = upperText.includes('CALIFORNIA FAIR PLAN') || upperText.includes('FAIR PLAN ASSOCIATION') || upperText.includes('CFPNET.COM') || upperText.includes('CALIFORNIA FAIR PLAN PROPERTY INSURANCE');
    const decPageHits = decPageMarkers.filter(m => upperText.includes(m)).length;
    if (isCfp || decPageHits >= 2) return 'dec_page';

    // 2. Check for DIC documents (BEFORE general RCE/E&S so American Modern DIC quotes are classified as DIC)
    const dicMarkers = [
        'DIFFERENCE IN CONDITIONS',
        'DIC',
        'BAMBOO',
        'PACIFIC SPECIALTY',
        'PSIC',
        'HOMEOWNERS FLEX',
        'HOMEOWNERS FLEX QUOTE',
        'DIC - FIRE',
    ];
    if (dicMarkers.some(m => upperText.includes(m))) return 'dic_dec_page';
    if (upperText.includes('AMERICAN MODERN') && (upperText.includes('FLEX') || upperText.includes('QUOTE') || upperText.includes('DIC'))) {
        return 'dic_dec_page';
    }

    // 3. Check for E&S documents
    const esMarkers = [
        'SURPLUS LINES',
        'STAMPING FEE',
        'E&S',
        'EXCESS AND SURPLUS',
        'EXCESS & SURPLUS',
        "LLOYD'S",
        'AEGIS',
        'INSPECTION FEE',
        'CA SURPLUS LINES TAX',
        'CA STAMPING FEE',
    ];
    if (esMarkers.some(m => upperText.includes(m))) return 'other'; // 'other' triggers auto-classify in worker

    // 4. Check for RCE documents
    const rceMarkers = [
        '360VALUE',
        'REPLACEMENT COST ESTIMATION',
        'REPLACEMENT COST ESTIMATOR',
        'VALUATION DATE',
        'RCT EXPRESS',
        'COTALITY',
        'DETAILED REPORT ESTIMATE',
        'RECONSTRUCTION COST WITH DEBRIS REMOVAL',
        'VALUATION TOTALS DETAIL',
    ];
    if (rceMarkers.some(m => upperText.includes(m))) return 'rce';
    if (upperText.includes('AMERICAN MODERN') && (upperText.includes('RECONSTRUCTION') || upperText.includes('VALUATION') || upperText.includes('REPLACEMENT'))) {
        return 'rce';
    }

    // 5. Fallback
    return 'other';
}
