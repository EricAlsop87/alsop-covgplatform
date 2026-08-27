import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getEmailSystemStatus } from '@/lib/emailService';
import { getAllTemplates } from '@/lib/emailTemplates';

/**
 * GET /api/email/status
 *
 * Returns the current email system status including:
 * - send mode (disabled / redirect / live)
 * - force redirect status
 * - whether Postmark is configured
 * - template list (fetched live from Postmark when available, falls back to local registry)
 *
 * The Postmark fetch ensures the composer only shows templates that actually exist
 * in the Postmark account, not templates that are only locally registered.
 */
export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service'] });
    if (isAuthError(auth)) return auth;

    const status = getEmailSystemStatus();

    // Attempt to fetch live templates from Postmark so we always reflect
    // exactly what's available on the account.
    let templates = await fetchPostmarkTemplates();

    // If the live fetch fails (sandbox, network issue, etc.), fall back to local registry
    if (!templates) {
        templates = getAllTemplates().map(t => ({
            id: t.id,
            postmarkAlias: t.postmarkAlias,
            postmarkTemplateId: t.postmarkTemplateId,
            name: t.name,
            description: t.description,
            subject: t.subject,
            variables: t.variables,
            isClientFacing: t.isClientFacing,
            source: 'local' as const,
        }));
    }

    return NextResponse.json({
        ...status,
        templates,
    });
}

// ---------------------------------------------------------------------------
// Postmark live template fetch
// ---------------------------------------------------------------------------

interface TemplateEntry {
    id: string;
    postmarkAlias: string | null;
    postmarkTemplateId: number | null;
    name: string;
    description: string;
    variables: string[];
    isClientFacing: boolean;
    source: 'postmark' | 'local';
}

async function fetchPostmarkTemplates(): Promise<TemplateEntry[] | null> {
    const token = process.env.POSTMARK_SERVER_TOKEN;
    if (!token) return null;

    try {
        const listRes = await fetch('https://api.postmarkapp.com/templates?Count=50&Offset=0', {
            headers: {
                'Accept': 'application/json',
                'X-Postmark-Server-Token': token,
            },
            // Don't cache — always reflect current Postmark state
            cache: 'no-store',
        });

        if (!listRes.ok) return null;

        const listData = await listRes.json();

        if (!listData.Templates || !Array.isArray(listData.Templates)) return null;

        // Import local registry to enrich Postmark data with our metadata
        const { getAllTemplates, getTemplateByAlias } = await import('@/lib/emailTemplates');
        const localTemplates = getAllTemplates();

        return listData.Templates
            .filter((t: any) => t.Active !== false)
            .map((t: any) => {
                // Match against our local registry by alias
                const local = getTemplateByAlias(t.Alias);

                return {
                    id: local?.id ?? t.Alias,
                    postmarkAlias: t.Alias ?? null,
                    postmarkTemplateId: t.TemplateId ?? null,
                    name: t.Name,
                    description: local?.description ?? `Postmark template: ${t.Name}`,
                    // Use local variable list if available (Postmark list endpoint doesn't return variables)
                    variables: local?.variables ?? [],
                    isClientFacing: local?.isClientFacing ?? true,
                    subject: local?.subject ?? '',
                    source: 'postmark' as const,
                };
            });
    } catch {
        return null;
    }
}
