import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';
import { HEADER_ALIASES, ImportRow, ImportStats, RowStatus } from '@/lib/csvImport';

// Allow up to 2 minutes for large CSV parsing
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple CSV parser — handles quoted fields with commas / newlines */
function parseCSVText(text: string): string[][] {
    const rows: string[][] = [];
    let current = '';
    let inQuotes = false;
    let row: string[] = [];

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (inQuotes) {
            if (ch === '"' && next === '"') {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(current.trim());
                current = '';
            } else if (ch === '\n') {
                row.push(current.trim());
                current = '';
                if (row.some(c => c !== '')) rows.push(row);
                row = [];
            } else if (ch === '\r') {
                // skip, will be followed by \n
            } else {
                current += ch;
            }
        }
    }
    // last row
    row.push(current.trim());
    if (row.some(c => c !== '')) rows.push(row);

    return rows;
}

/** Normalise header → field name using alias map */
function resolveHeader(raw: string): string | null {
    // Strip BOM, zero-width chars, and other invisible unicode
    const cleaned = raw.replace(/[\uFEFF\u200B\u200C\u200D\u00A0]/g, '');
    const key = cleaned.toLowerCase().trim();
    if (HEADER_ALIASES[key]) return HEADER_ALIASES[key];
    // Also try with all spaces removed (handles "PolicyNo" vs "Policy No")
    const noSpaces = key.replace(/\s+/g, '');
    if (HEADER_ALIASES[noSpaces]) return HEADER_ALIASES[noSpaces];
    return null;
}

/** Try to parse date in various formats → YYYY-MM-DD or null */
function parseDate(raw: string | undefined): string | null {
    if (!raw) return null;
    const s = raw.trim();
    if (!s) return null;

    // Try MM/DD/YYYY or MM-DD-YYYY
    const mdyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (mdyMatch) {
        const m = mdyMatch[1].padStart(2, '0');
        const d = mdyMatch[2].padStart(2, '0');
        let y = mdyMatch[3];
        if (y.length === 2) y = (parseInt(y) > 50 ? '19' : '20') + y;
        return `${y}-${m}-${d}`;
    }

    // Try YYYY-MM-DD already
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return s;

    return null;
}

/** Parse currency string → number or null */
function parseCurrency(raw: string | undefined): number | null {
    if (!raw) return null;
    const cleaned = raw.replace(/[$,\s]/g, '').trim();
    if (!cleaned) return null;
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

/** Parse boolean-ish string */
function parseBool(raw: string | undefined): boolean {
    if (!raw) return false;
    const s = raw.toLowerCase().trim();
    return ['yes', 'true', '1', 'y', 'x'].includes(s);
}

// ---------------------------------------------------------------------------
// POST /api/csv-import/parse
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    try {
        const supabaseAdmin = getSupabaseAdmin();

        // 1. Auth
        const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service'] });
        if (isAuthError(auth)) return auth;
        const user = auth.user;

        // 2. Read CSV file
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (!file) {
            return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
        }

        const rawText = await file.text();

        // Strip BOM from start of file (Google Sheets exports add this)
        let csvText = rawText;
        if (csvText.charCodeAt(0) === 0xFEFF) {
            csvText = csvText.slice(1);
        }
        // Also strip any other BOM-like chars throughout
        csvText = csvText.replace(/[\uFEFF\u200B\u200C\u200D]/g, '');

        const csvRows = parseCSVText(csvText);

        if (csvRows.length < 2) {
            return NextResponse.json({ success: false, error: 'CSV is empty or has no data rows' }, { status: 400 });
        }

        // 3. Map headers
        const rawHeaders = csvRows[0];

        // Debug: log raw headers with char codes to catch invisible characters
        logger.info('CSVImport', 'Raw headers', {
            headers: rawHeaders,
            charCodes: rawHeaders.map(h => Array.from(h).map(c => c.charCodeAt(0))),
            aliasMapSize: Object.keys(HEADER_ALIASES).length,
            aliasMapSample: Object.keys(HEADER_ALIASES).slice(0, 5),
            testLookup: HEADER_ALIASES['policy no'],
        });

        const headerMap: (string | null)[] = rawHeaders.map(h => resolveHeader(h));
        const unmappedHeaders = rawHeaders.filter((h, i) => !headerMap[i]);

        logger.info('CSVImport', 'Header mapping result', {
            mapped: rawHeaders.map((h, i) => `"${h}" → ${headerMap[i] || '???'}`),
            unmapped: unmappedHeaders,
            resolvedCount: headerMap.filter(Boolean).length,
        });

        if (unmappedHeaders.length > 0) {
            logger.warn('CSVImport', 'Unmapped headers', { unmappedHeaders });
        }

        // Check required field exists
        const hasPolicy = headerMap.includes('policy_number');
        const hasInsured = headerMap.includes('insured_name');
        if (!hasPolicy) {
            return NextResponse.json({
                success: false,
                error: `CSV is missing a "Policy No" / "Policy Number" column. Found headers: [${rawHeaders.join(', ')}]`,
            }, { status: 400 });
        }
        if (!hasInsured) {
            return NextResponse.json({
                success: false,
                error: `CSV is missing an "Insured Name" column. Found headers: [${rawHeaders.join(', ')}]`,
            }, { status: 400 });
        }

        // 4. Parse each data row
        const dataRows = csvRows.slice(1);
        const importRows: ImportRow[] = [];

        for (let i = 0; i < dataRows.length; i++) {
            const cells = dataRows[i];
            const raw: Record<string, string> = {};

            for (let j = 0; j < headerMap.length; j++) {
                const field = headerMap[j];
                if (field && cells[j]) {
                    raw[field] = cells[j];
                }
            }

            const errors: string[] = [];

            // Required fields
            const policyNumber = (raw.policy_number || '').trim();
            const insuredName = (raw.insured_name || '').trim();

            if (!policyNumber) errors.push('Missing Policy Number');
            if (!insuredName) errors.push('Missing Insured Name');

            // Dates
            const effDate = parseDate(raw.effective_date);
            const expDate = parseDate(raw.expiration_date);
            if (raw.effective_date && !effDate) errors.push(`Bad Effective Date: "${raw.effective_date}"`);
            if (raw.expiration_date && !expDate) errors.push(`Bad Expiration Date: "${raw.expiration_date}"`);

            // Premium
            const premium = parseCurrency(raw.annual_premium);
            if (raw.annual_premium && premium === null) errors.push(`Bad Premium: "${raw.annual_premium}"`);

            const row: ImportRow = {
                row_index: i,
                status: errors.length > 0 ? 'invalid' : 'valid',
                errors,
                raw,
                policy_number: policyNumber,
                insured_name: insuredName,
                effective_date: effDate,
                expiration_date: expDate,
                annual_premium: premium,
                carrier_status: raw.carrier_status || null,
                policy_activity: raw.policy_activity || null,
                payment_status: raw.payment_status || null,
                payment_plan: raw.payment_plan || null,
                cancellation_reason: raw.cancellation_reason || null,
                notes: raw.notes || null,
                dic_exists: parseBool(raw.dic_exists),
                dic_notes: raw.dic_notes || null,
                sold_by: raw.sold_by || null,
                office: raw.office || null,
                reason: raw.reason || null,
                activity: raw.activity || null,
                line: raw.line || null,
            };

            importRows.push(row);
        }

        // 5. Duplicate detection (same policy_number + eff + exp within file)
        const seen = new Map<string, number>();
        for (const row of importRows) {
            if (row.status === 'invalid') continue;
            const key = `${row.policy_number}|${row.effective_date || ''}|${row.expiration_date || ''}`;
            const prev = seen.get(key);
            if (prev !== undefined) {
                row.status = 'duplicate';
                row.errors.push(`Duplicate of row ${prev + 2} in file`);
                // Also mark the first occurrence if not already marked
                const firstRow = importRows[prev];
                if (firstRow.status === 'valid') {
                    // Keep the first one as valid, mark subsequent as duplicate
                }
            } else {
                seen.set(key, row.row_index);
            }
        }

        // 6. Check existing policies for insured-name mismatches
        const validPolicyNumbers = [...new Set(
            importRows.filter(r => r.status === 'valid').map(r => r.policy_number)
        )];

        if (validPolicyNumbers.length > 0) {
            // Chunk the .in() query to avoid PostgREST URL length limits
            const POLICY_CHUNK = 200;
            const existingMap = new Map<string, string>();

            for (let c = 0; c < validPolicyNumbers.length; c += POLICY_CHUNK) {
                const chunk = validPolicyNumbers.slice(c, c + POLICY_CHUNK);
                const { data: existingPolicies } = await supabaseAdmin
                    .from('policies')
                    .select('policy_number, clients(named_insured)')
                    .in('policy_number', chunk);

                if (existingPolicies) {
                    for (const p of existingPolicies) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const clients = (p as any).clients;
                        const name = clients?.named_insured || '';
                        if (name) existingMap.set(p.policy_number, name);
                    }
                }
            }

            for (const row of importRows) {
                if (row.status !== 'valid') continue;
                const existingName = existingMap.get(row.policy_number);
                if (existingName && existingName.toLowerCase() !== row.insured_name.toLowerCase()) {
                    row.status = 'name_mismatch';
                    row.existing_insured_name = existingName;
                    row.errors.push(`Existing insured "${existingName}" ≠ CSV insured "${row.insured_name}"`);
                }
            }
        }

        // 7. Compute stats
        const stats: ImportStats = {
            total: importRows.length,
            valid: importRows.filter(r => r.status === 'valid').length,
            invalid: importRows.filter(r => r.status === 'invalid').length,
            duplicate: importRows.filter(r => r.status === 'duplicate').length,
            name_mismatch: importRows.filter(r => r.status === 'name_mismatch').length,
        };

        // 8. Create batch + rows in DB
        const { data: batch, error: batchErr } = await supabaseAdmin
            .from('policy_import_batches')
            .insert({
                uploaded_by: user.id,
                file_name: file.name,
                status: 'preview',
                total_rows: stats.total,
                valid_rows: stats.valid,
                invalid_rows: stats.invalid,
                duplicate_rows: stats.duplicate,
            })
            .select('id')
            .single();

        if (batchErr || !batch) {
            logger.error('CSVImport', 'Failed to create batch', { error: batchErr?.message, code: batchErr?.code, details: batchErr?.details });
            return NextResponse.json({ success: false, error: `Failed to create import batch: ${batchErr?.message || 'unknown'}` }, { status: 500 });
        }

        const batchId = batch.id;

        // Insert rows (in chunks to avoid payload limits)
        const CHUNK_SIZE = 100;
        for (let i = 0; i < importRows.length; i += CHUNK_SIZE) {
            const chunk = importRows.slice(i, i + CHUNK_SIZE).map(row => ({
                batch_id: batchId,
                row_number: row.row_index + 2,
                status: row.status as string,
                errors: row.errors,
                raw_data: row.raw,
                policy_number: row.policy_number || null,
                insured_name: row.insured_name || null,
                effective_date: row.effective_date,
                expiration_date: row.expiration_date,
                annual_premium: row.annual_premium,
                carrier_status: row.carrier_status,
                policy_activity: row.policy_activity,
                payment_status: row.payment_status,
                payment_plan: row.payment_plan,
                cancellation_reason: row.cancellation_reason,
                notes_text: row.notes,
                dic_exists: row.dic_exists,
                dic_notes: row.dic_notes,
                sold_by: row.sold_by,
                office: row.office,
                reason: row.reason,
                activity: row.activity,
                line: row.line,
                existing_insured_name: row.existing_insured_name || null,
            }));

            const { error: rowErr } = await supabaseAdmin
                .from('policy_import_rows')
                .insert(chunk);

            if (rowErr) {
                logger.error('CSVImport', 'Failed to insert rows', { error: rowErr.message, code: rowErr.code, details: rowErr.details, chunk: i });
                return NextResponse.json({
                    success: false,
                    error: `Failed to save import rows to database: ${rowErr.message}`,
                }, { status: 500 });
            }
        }

        logger.info('CSVImport', 'Parse complete', { batchId, stats });

        // Return truncated rows for preview (first 200 of each status category)
        const PREVIEW_LIMIT = 200;
        const previewRows = [
            ...importRows.filter(r => r.status === 'valid').slice(0, PREVIEW_LIMIT),
            ...importRows.filter(r => r.status === 'name_mismatch').slice(0, PREVIEW_LIMIT),
            ...importRows.filter(r => r.status === 'duplicate').slice(0, PREVIEW_LIMIT),
            ...importRows.filter(r => r.status === 'invalid').slice(0, PREVIEW_LIMIT),
        ].sort((a, b) => a.row_index - b.row_index);

        return NextResponse.json({
            success: true,
            batch_id: batchId,
            stats,
            rows: previewRows,
            rows_preview_count: previewRows.length,
            rows_total_count: importRows.length,
        });

    } catch (err) {
        logger.error('CSVImport', 'Parse error', { error: String(err) });
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
