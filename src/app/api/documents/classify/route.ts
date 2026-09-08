import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

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
        
        // Simple PDF text extraction: find text between stream/endstream markers
        // and decode printable ASCII. This is a lightweight approach that avoids
        // needing a full PDF parser on the serverless function.
        const rawText = extractPdfText(buffer);
        const upperText = rawText.toUpperCase();

        // Classify based on keyword matching (mirrors Python worker's classify_document_text)
        const detectedType = classifyDocument(upperText);

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
 * Extract readable text from a PDF buffer without a full parser.
 * Decodes text from PDF content streams and literal strings.
 */
function extractPdfText(buffer: Buffer): string {
    const text = buffer.toString('latin1');
    const chunks: string[] = [];
    
    // Extract text from PDF streams
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRegex.exec(text)) !== null) {
        // Filter to printable ASCII
        const printable = match[1].replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
        if (printable.length > 10) {
            chunks.push(printable);
        }
    }
    
    // Also extract text from PDF literal strings (parenthesized text)
    const stringRegex = /\(([^)]{3,})\)/g;
    while ((match = stringRegex.exec(text)) !== null) {
        const printable = match[1].replace(/[^\x20-\x7E]/g, '').trim();
        if (printable.length > 2) {
            chunks.push(printable);
        }
    }
    
    return chunks.join(' ').slice(0, 8000); // Cap at 8k chars
}

/**
 * Classify document type based on keyword matching.
 * Priority order matches Python worker's classify_document_text().
 */
function classifyDocument(upperText: string): string {
    // 1. Check for FAIR Plan Dec Page (highest priority)
    const decPageMarkers = [
        'CALIFORNIA FAIR PLAN',
        'FAIR PLAN',
        'DWELLING INSURANCE POLICY DECLARATIONS',
        'DWELLING FIRE',
        'POLICY PERIOD',
    ];
    const decPageHits = decPageMarkers.filter(m => upperText.includes(m)).length;
    if (decPageHits >= 2) return 'dec_page';

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
