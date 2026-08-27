import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

function normalizeAddress(raw: string | null): string | null {
    if (!raw) return null;
    return raw.toUpperCase().replace(/,/g, '').replace(/\s+/g, ' ').trim() || null;
}

interface CreateAndAssignBody {
    documentId: string;
    ownerName: string;
    propertyAddress?: string;
    carrierName?: string;
    createPolicy?: boolean;
}

export async function POST(request: NextRequest) {
    try {
        const supabaseAdmin = getSupabaseAdmin();

        // ── 1. Authenticate user ────────────────────────────────────────
        const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
        if (isAuthError(auth)) return auth;
        const user = auth.user;

        // ── 2. Parse & validate body ────────────────────────────────────
        let body: CreateAndAssignBody;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { success: false, message: 'Invalid JSON body' },
                { status: 400 }
            );
        }

        const { documentId, ownerName, propertyAddress, carrierName, createPolicy = true } = body;

        if (!documentId || !ownerName || (createPolicy && !propertyAddress)) {
            return NextResponse.json(
                { success: false, message: 'Missing required fields: documentId, ownerName' + (createPolicy ? ', propertyAddress' : '') },
                { status: 400 }
            );
        }

        // ── 3. Create or Find client ────────────────────────────────────
        // Check for existing client with exact same name to prevent duplicates
        const { data: existingClients } = await supabaseAdmin
            .from('clients')
            .select('id')
            .ilike('named_insured', ownerName.trim())
            .limit(1);

        let clientId: string;

        if (existingClients && existingClients.length > 0) {
            clientId = existingClients[0].id;
            logger.info('CreateAndAssign', 'Reusing existing client to prevent duplication', { clientId, ownerName });
        } else {
            const { data: clientRow, error: clientError } = await supabaseAdmin
                .from('clients')
                .insert({
                    named_insured: ownerName.trim(),
                    created_by_account_id: user.id,
                    mailing_address_raw: !createPolicy ? propertyAddress : null,
                    mailing_address_norm: !createPolicy && propertyAddress ? normalizeAddress(propertyAddress) : null,
                })
                .select('id')
                .single();

            if (clientError || !clientRow) {
                logger.error('CreateAndAssign', 'Failed to create client', { error: clientError?.message });
                return NextResponse.json(
                    { success: false, message: 'Failed to create client record' },
                    { status: 500 }
                );
            }
            clientId = clientRow.id;
        }

        // ── 4. Create policy (Optional) ─────────────────────────────────
        let policyId: string | null = null;
        if (createPolicy) {
            const { data: policyRow, error: policyError } = await supabaseAdmin
                .from('policies')
                .insert({
                    client_id: clientId,
                    created_by_account_id: user.id,
                    policy_number: 'PENDING',
                    property_address_raw: propertyAddress,
                    property_address_norm: normalizeAddress(propertyAddress || null),
                    carrier_name: carrierName || 'Unknown',
                })
                .select('id')
                .single();

            if (policyError || !policyRow) {
                logger.error('CreateAndAssign', 'Failed to create policy', { error: policyError?.message, clientId });
                return NextResponse.json(
                    { success: false, message: 'Failed to create policy record' },
                    { status: 500 }
                );
            }

            policyId = policyRow.id;
        }

        // ── 5. Update platform_documents ────────────────────────────────
        const { error: docUpdateError } = await supabaseAdmin
            .from('platform_documents')
            .update({
                policy_id: policyId,
                client_id: clientId,
                match_status: 'manual',
                match_confidence: 1.0,
                updated_at: new Date().toISOString(),
            })
            .eq('id', documentId);

        if (docUpdateError) {
            logger.error('CreateAndAssign', 'Failed to update document', { error: docUpdateError.message, documentId });
            return NextResponse.json(
                { success: false, message: 'Failed to update document record' },
                { status: 500 }
            );
        }

        // ── 6. Queue ingestion job for writeback (only if policy exists) ─
        if (createPolicy) {
            const now = new Date().toISOString();
            const { error: jobError } = await supabaseAdmin
                .from('ingestion_jobs')
                .insert({
                    document_id: documentId,
                    status: 'pending',
                    max_attempts: 5,
                    created_at: now,
                    updated_at: now,
                });

            if (jobError) {
                logger.warn('CreateAndAssign', 'Failed to queue ingestion job', { error: jobError.message, documentId });
            }
        }

        logger.info('CreateAndAssign', 'Created client and assigned document', {
            clientId,
            policyId,
            documentId,
        });

        return NextResponse.json({
            success: true,
            clientId,
            policyId,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('CreateAndAssign', 'Unexpected error', { error: errorMessage });
        return NextResponse.json(
            { success: false, message: 'An unexpected error occurred. Please try again.' },
            { status: 500 }
        );
    }
}
