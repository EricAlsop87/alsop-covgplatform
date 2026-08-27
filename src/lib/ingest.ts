/**
 * ⚠️  DEPRECATED — DO NOT USE FOR NEW CODE PATHS
 *
 * This TypeScript ingestion module was the original lifecycle implementation.
 * It has been superseded by the Python worker's lifecycle module:
 *
 *   worker/src/db/lifecycle.py   — Client/Policy/PolicyTerm upserts
 *   worker/src/db/dec_pages.py   — dec_pages upsert
 *   worker/src/db/flag_evaluator.py — flag evaluation
 *
 * The Python worker is the AUTHORITATIVE implementation for all dec page
 * ingestion. This file is preserved for backward compatibility in case
 * any existing code paths still reference it, but all new work should
 * go through the Python worker pipeline.
 *
 * If you find an active import of this file, please migrate it to the
 * worker pipeline or raise a flag.
 *
 * Last audited: 2026-04-15
 */

import { getSupabaseAdmin } from './supabaseClient';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize an address string for matching:
 * - lowercase
 * - strip punctuation
 * - collapse whitespace
 */
export function normalizeAddress(raw: string | null | undefined): string {
    if (!raw) return '';
    return raw
        .toLowerCase()
        .replace(/[.,#\-\/\\()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Safely parse a date string (e.g. "01/15/2025", "2025-01-15", "January 15, 2025")
 * Returns ISO date string (YYYY-MM-DD) or null.
 */
export function parseDateSafe(text: string | null | undefined): string | null {
    if (!text || !text.trim()) return null;
    try {
        const d = new Date(text.trim());
        if (isNaN(d.getTime())) return null;
        return d.toISOString().split('T')[0]; // YYYY-MM-DD
    } catch {
        return null;
    }
}

/**
 * Parse a premium string like "$2,500" or "2500.00" to a number.
 * Returns null if unparseable.
 */
export function parsePremium(text: string | null | undefined): number | null {
    if (!text || !text.trim()) return null;
    const cleaned = text.replace(/[$,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

// ---------------------------------------------------------------------------
// Upsert Functions
// ---------------------------------------------------------------------------

/**
 * Find or create a client by named_insured for the given account.
 * Match is case-insensitive on named_insured for the same account.
 * Returns the client id.
 */
export async function upsertClient(
    accountId: string,
    insuredName: string,
    mailingAddress?: string
): Promise<string> {
    const admin = getSupabaseAdmin();
    const normalizedName = insuredName.trim();

    // Try to find existing client by named_insured for this account
    const { data: existing, error: findError } = await admin
        .from('clients')
        .select('id')
        .eq('created_by_account_id', accountId)
        .ilike('named_insured', normalizedName)
        .limit(1)
        .single();

    if (existing && !findError) {
        logger.info('Ingest', 'Found existing client', { clientId: existing.id, insuredName });
        return existing.id;
    }

    // Create new client
    const { data: newClient, error: insertError } = await admin
        .from('clients')
        .insert({
            created_by_account_id: accountId,
            named_insured: normalizedName,
            mailing_address_raw: mailingAddress || null,
            mailing_address_norm: normalizeAddress(mailingAddress),
        })
        .select('id')
        .single();

    if (insertError || !newClient) {
        logger.error('Ingest', 'Failed to create client', {
            error: insertError?.message,
            insuredName,
        });
        throw new Error(`Failed to create client: ${insertError?.message}`);
    }

    logger.info('Ingest', 'Created new client', { clientId: newClient.id, insuredName });
    return newClient.id;
}

/**
 * Find or create a policy by policy_number + normalized property address for the given account.
 * Returns the policy id.
 */
export async function upsertPolicy(
    accountId: string,
    clientId: string,
    policyNumber: string,
    propertyAddress?: string
): Promise<string> {
    const admin = getSupabaseAdmin();
    const normalizedAddr = normalizeAddress(propertyAddress);

    // Try to find existing policy by policy_number + normalized address
    let query = admin
        .from('policies')
        .select('id')
        .eq('created_by_account_id', accountId)
        .eq('policy_number', policyNumber.trim());

    if (normalizedAddr) {
        query = query.eq('property_address_norm', normalizedAddr);
    }

    const { data: existing, error: findError } = await query.limit(1).single();

    if (existing && !findError) {
        logger.info('Ingest', 'Found existing policy', { policyId: existing.id, policyNumber });
        return existing.id;
    }

    // Create new policy
    const { data: newPolicy, error: insertError } = await admin
        .from('policies')
        .insert({
            created_by_account_id: accountId,
            client_id: clientId,
            policy_number: policyNumber.trim(),
            property_address_raw: propertyAddress || null,
            property_address_norm: normalizedAddr || null,
            status: 'unknown',
        })
        .select('id')
        .single();

    if (insertError || !newPolicy) {
        logger.error('Ingest', 'Failed to create policy', {
            error: insertError?.message,
            policyNumber,
        });
        throw new Error(`Failed to create policy: ${insertError?.message}`);
    }

    logger.info('Ingest', 'Created new policy', { policyId: newPolicy.id, policyNumber });
    return newPolicy.id;
}

/**
 * Find or create a policy term for the given policy.
 * Match by effective_date + expiration_date.
 * Manages is_current flag (newest term = current).
 * Returns the policy_term id.
 */
export async function upsertPolicyTerm(
    policyId: string,
    effectiveDate: string | null,
    expirationDate: string | null,
    annualPremium: number | null,
    carrierPolicyNumber?: string
): Promise<string> {
    const admin = getSupabaseAdmin();

    // Try to find existing term with same dates
    let query = admin
        .from('policy_terms')
        .select('id')
        .eq('policy_id', policyId);

    if (effectiveDate) {
        query = query.eq('effective_date', effectiveDate);
    } else {
        query = query.is('effective_date', null);
    }
    if (expirationDate) {
        query = query.eq('expiration_date', expirationDate);
    } else {
        query = query.is('expiration_date', null);
    }

    const { data: existing, error: findError } = await query.limit(1).single();

    if (existing && !findError) {
        logger.info('Ingest', 'Found existing policy term', { termId: existing.id });
        // Update premium/carrier policy number if provided
        const updatePayload: any = { updated_at: new Date().toISOString() };
        if (annualPremium != null) updatePayload.annual_premium = annualPremium;
        if (carrierPolicyNumber) updatePayload.carrier_policy_number = carrierPolicyNumber;

        await admin
            .from('policy_terms')
            .update(updatePayload)
            .eq('id', existing.id);
        return existing.id;
    }

    // Create new term
    const { data: newTerm, error: insertError } = await admin
        .from('policy_terms')
        .insert({
            policy_id: policyId,
            effective_date: effectiveDate,
            expiration_date: expirationDate,
            annual_premium: annualPremium,
            carrier_policy_number: carrierPolicyNumber,
            is_current: false, // Will be set after
        })
        .select('id')
        .single();

    if (insertError || !newTerm) {
        logger.error('Ingest', 'Failed to create policy term', {
            error: insertError?.message,
            policyId,
        });
        throw new Error(`Failed to create policy term: ${insertError?.message}`);
    }

    logger.info('Ingest', 'Created new policy term', { termId: newTerm.id, policyId });

    // Update is_current: mark the newest term as current
    // Fetch all terms for this policy, order by effective_date desc (or expiration_date desc)
    const { data: allTerms } = await admin
        .from('policy_terms')
        .select('id, effective_date, expiration_date')
        .eq('policy_id', policyId)
        .order('effective_date', { ascending: false, nullsFirst: false });

    if (allTerms && allTerms.length > 0) {
        const newestId = allTerms[0].id;
        // Set all to not current
        await admin
            .from('policy_terms')
            .update({ is_current: false })
            .eq('policy_id', policyId);
        // Set newest to current
        await admin
            .from('policy_terms')
            .update({ is_current: true })
            .eq('id', newestId);
    }

    return newTerm.id;
}

// ---------------------------------------------------------------------------
// Main Ingestion Function
// ---------------------------------------------------------------------------

/**
 * Extracted fields from dec page parsing.
 * These are the fields we expect from the extraction pipeline.
 */
export interface ExtractedDecPageFields {
    insured_name?: string;
    secondary_insured_name?: string;
    mailing_address?: string;
    property_location?: string;
    policy_number?: string;
    date_issued?: string;
    policy_period_start?: string;
    policy_period_end?: string;
    year_built?: string;
    occupancy?: string;
    number_of_units?: string;
    construction_type?: string;
    deductible?: string;
    total_annual_premium?: string;
    broker_name?: string;
    broker_address?: string;
    broker_phone_number?: string;
    raw_text?: string;
    // Coverage limits (all the limit_* fields)
    [key: string]: string | undefined;
}

/**
 * Main ingestion pipeline:
 * 1. Insert into dec_pages
 * 2. Upsert client
 * 3. Upsert policy
 * 4. Upsert policy_term
 * 5. Link dec_pages row with client_id, policy_id, policy_term_id
 *
 * @param submissionId - The dec_page_submissions.id
 * @param accountId - The authenticated user's account ID
 * @param fields - Extracted fields from the dec page
 * @returns The dec_pages row id
 */
export async function ingestDecPage(
    submissionId: string,
    accountId: string,
    fields: ExtractedDecPageFields
): Promise<string> {
    const admin = getSupabaseAdmin();

    logger.info('Ingest', 'Starting dec page ingestion', { submissionId, accountId });

    // 1. Insert into dec_pages (without relational links initially)
    const decPageInsert: Record<string, unknown> = {
        submission_id: submissionId,
        created_by_account_id: accountId,
        ...fields,
    };

    const { data: decPage, error: decPageError } = await admin
        .from('dec_pages')
        .insert(decPageInsert)
        .select('id')
        .single();

    if (decPageError || !decPage) {
        logger.error('Ingest', 'Failed to insert dec_pages row', {
            error: decPageError?.message,
            submissionId,
        });
        throw new Error(`Failed to insert dec_pages: ${decPageError?.message}`);
    }

    const decPageId = decPage.id;
    logger.info('Ingest', 'Inserted dec_pages row', { decPageId });

    // 2. Upsert client
    const insuredName = fields.insured_name || 'Unknown';
    const clientId = await upsertClient(accountId, insuredName, fields.mailing_address);

    // 3. Upsert policy
    const policyNumber = fields.policy_number || 'N/A';
    const policyId = await upsertPolicy(accountId, clientId, policyNumber, fields.property_location);

    // 4. Upsert policy term
    const effectiveDate = parseDateSafe(fields.policy_period_start);
    const expirationDate = parseDateSafe(fields.policy_period_end);
    const premium = parsePremium(fields.total_annual_premium);
    const policyTermId = await upsertPolicyTerm(policyId, effectiveDate, expirationDate, premium, policyNumber);

    // 5. Link dec_pages row with relational IDs
    const { error: linkError } = await admin
        .from('dec_pages')
        .update({
            client_id: clientId,
            policy_id: policyId,
            policy_term_id: policyTermId,
        })
        .eq('id', decPageId);

    if (linkError) {
        logger.error('Ingest', 'Failed to link dec_pages with relational IDs (non-fatal)', {
            decPageId,
            error: linkError.message,
        });
    } else {
        logger.info('Ingest', 'Linked dec_pages with client/policy/term', {
            decPageId,
            clientId,
            policyId,
            policyTermId,
        });
    }

    return decPageId;
}
