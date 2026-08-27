import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';

/**
 * POST /api/documents/signed-url
 *
 * Generate a signed download URL for a file in Supabase Storage.
 * Uses the admin client so RLS on private buckets is bypassed.
 *
 * Body: { storagePath: string, bucket?: string }
 * Returns: { signedUrl: string }
 */
export async function POST(request: NextRequest) {
    try {
        // 1. Authenticate user
        const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
        if (isAuthError(auth)) return auth;

        // 2. Parse body
        const body = await request.json();
        const { storagePath, bucket = 'cfp-raw-decpage' } = body;

        if (!storagePath || typeof storagePath !== 'string') {
            return NextResponse.json(
                { error: 'storagePath is required' },
                { status: 400 }
            );
        }

        // Validate bucket against whitelist
        const ALLOWED_BUCKETS = ['cfp-raw-decpage', 'cfp-platform-documents', 'dec-pages'];
        if (!ALLOWED_BUCKETS.includes(bucket)) {
            return NextResponse.json(
                { error: `Invalid bucket: ${bucket}` },
                { status: 400 }
            );
        }

        // 3. Generate signed URL with admin client (bypasses RLS)
        const admin = getSupabaseAdmin();
        const { data, error } = await admin.storage
            .from(bucket)
            .createSignedUrl(storagePath, 3600); // 1 hour

        if (error || !data?.signedUrl) {
            logger.error('SignedURL', 'Failed to create signed URL', {
                message: error?.message,
                storagePath,
                bucket,
            });
            return NextResponse.json(
                { error: error?.message || 'Failed to generate URL' },
                { status: 500 }
            );
        }

        return NextResponse.json({ signedUrl: data.signedUrl });
    } catch (err) {
        logger.error('SignedURL', 'Unexpected error', {
            error: err instanceof Error ? err.message : String(err),
        });
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
