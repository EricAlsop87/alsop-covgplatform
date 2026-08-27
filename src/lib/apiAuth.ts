import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import { getSupabaseAdmin } from './supabaseClient';
import { type UserRole } from './auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthResult {
    user: { id: string; email?: string };
    role: UserRole;
    authMethod: 'bearer' | 'internal_key';
}

interface AuthOptions {
    /** If set, only these roles are allowed (403 otherwise). */
    requiredRole?: UserRole[];
}

// ---------------------------------------------------------------------------
// Constant-time comparison (prevents timing attacks on the internal key)
// ---------------------------------------------------------------------------

function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    // Node's timingSafeEqual requires equal length buffers
    const { timingSafeEqual } = require('crypto');
    return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Main auth function
// ---------------------------------------------------------------------------

/**
 * Authenticate an API request. Supports two paths:
 *
 * 1. **Internal key** — The Python worker sends `X-Internal-Key` header for
 *    service-to-service calls (enrichment, flags). Compared with constant-time
 *    equality against `INTERNAL_API_KEY` env var.
 *
 * 2. **Bearer token** — User sessions. The JWT is validated against Supabase
 *    Auth via `getUser()`, and the user's role is fetched from the `accounts`
 *    table.
 *
 * Returns an `AuthResult` on success, or a 401/403 `NextResponse` on failure.
 */
export async function authenticateRequest(
    req: NextRequest,
    options?: AuthOptions,
): Promise<AuthResult | NextResponse> {

    // ── Path 1: Internal key (worker → API) ──────────────────────────
    const internalKey = req.headers.get('X-Internal-Key');
    const expectedKey = env.INTERNAL_API_KEY;
    if (internalKey && expectedKey) {
        if (constantTimeEqual(internalKey, expectedKey)) {
            return {
                user: { id: 'worker:internal' },
                role: 'service' as UserRole,
                authMethod: 'internal_key',
            };
        }
        // If an internal key was provided but doesn't match, fall through to
        // bearer auth rather than immediately rejecting — the caller might
        // also have a valid bearer token.
    }

    // ── Path 2: Bearer token (user session) ──────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json(
            { success: false, message: 'Unauthorized — missing Bearer token' },
            { status: 401 },
        );
    }

    const token = authHeader.slice(7);
    const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
        data: { user },
        error,
    } = await userClient.auth.getUser(token);

    if (error || !user) {
        return NextResponse.json(
            { success: false, message: 'Unauthorized — invalid or expired token' },
            { status: 401 },
        );
    }

    // Look up role from accounts table
    const admin = getSupabaseAdmin();
    const { data: account } = await admin
        .from('accounts')
        .select('role')
        .eq('id', user.id)
        .single();

    const role = (account?.role || 'customer') as UserRole;

    // ── Role enforcement ─────────────────────────────────────────────
    if (options?.requiredRole && !options.requiredRole.includes(role)) {
        return NextResponse.json(
            {
                success: false,
                message: `Forbidden — requires role: ${options.requiredRole.join(' or ')}`,
            },
            { status: 403 },
        );
    }

    return {
        user: { id: user.id, email: user.email },
        role,
        authMethod: 'bearer',
    };
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/** Returns `true` if the auth result is an error response (401/403). */
export function isAuthError(
    result: AuthResult | NextResponse,
): result is NextResponse {
    return result instanceof NextResponse;
}
