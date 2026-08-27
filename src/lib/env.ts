/**
 * Centralized environment variable access and validation.
 *
 * IMPORTANT: Next.js only inlines NEXT_PUBLIC_ env vars when accessed
 * as literal `process.env.NEXT_PUBLIC_X` expressions. Dynamic access
 * like `process.env[name]` will NOT work on the client side.
 * That's why we reference each var directly below.
 *
 * Usage:
 *   import { env } from '@/lib/env';
 */

function getOptional(value: string | undefined, fallback: string = ''): string {
    return value && value.trim() !== '' ? value.trim() : fallback;
}

/**
 * Validated environment variables.
 * Public vars use direct `process.env.NEXT_PUBLIC_*` references
 * so Next.js can inline them into the client bundle.
 */
export const env = {
    /** Supabase project URL (client-safe). */
    get SUPABASE_URL(): string {
        return getOptional(process.env.NEXT_PUBLIC_SUPABASE_URL, 'https://qbihizqbtimwvhxkneeb.supabase.co');
    },

    /** Supabase anonymous/public key (client-safe, RLS-gated). */
    get SUPABASE_ANON_KEY(): string {
        return getOptional(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, '');
    },

    /**
     * Supabase service role key (SERVER-SIDE ONLY).
     * Never expose this to the browser. Only import this in:
     * - API routes (src/app/api/...)
     * - Server components
     * - Server actions
     */
    get SUPABASE_SERVICE_ROLE_KEY(): string {
        return getOptional(process.env.SUPABASE_SERVICE_ROLE_KEY, '');
    },

    /** Whether we're running in production. */
    get IS_PRODUCTION(): boolean {
        return process.env.NODE_ENV === 'production';
    },

    // ── Email ──

    /** Email send mode: 'disabled' | 'redirect' | 'live'. Default: disabled. */
    get EMAIL_SEND_MODE(): string {
        return getOptional(process.env.EMAIL_SEND_MODE, 'disabled');
    },

    /** Postmark server token for transactional email. */
    get POSTMARK_SERVER_TOKEN(): string | undefined {
        return process.env.POSTMARK_SERVER_TOKEN;
    },

    /** Default From address for app-generated email. */
    get EMAIL_FROM_DEFAULT(): string {
        return getOptional(process.env.EMAIL_FROM_DEFAULT, 'reports@coveragechecknow.com');
    },

    /** Default Reply-To address. */
    get EMAIL_REPLY_TO_DEFAULT(): string {
        return getOptional(process.env.EMAIL_REPLY_TO_DEFAULT, 'support@coveragechecknow.com');
    },

    /** Dev redirect target (used when EMAIL_SEND_MODE=redirect). */
    get EMAIL_DEV_REDIRECT(): string {
        return getOptional(process.env.EMAIL_DEV_REDIRECT, 'carlospaz@allstate.com');
    },

    // ── Property Enrichment ──

    /**
     * ATTOM Data Solutions API key.
     * Used for baseline property enrichment: sqft, year built, construction type, etc.
     * Set this in .env.local to enable real property data. If absent, assessor
     * enrichment is skipped gracefully (no mock data is written).
     */
    get ATTOM_API_KEY(): string | undefined {
        return process.env.ATTOM_API_KEY;
    },

    // ── OpenAI ──
    get OPENAI_API_KEY(): string {
        return getOptional(process.env.OPENAI_API_KEY, '');
    },

    // ── Google Maps ──
    get GOOGLE_MAPS_API_KEY(): string {
        return getOptional(process.env.GOOGLE_MAPS_API_KEY, '');
    },

    // ── EagleView ──
    get EAGLEVIEW_CLIENT_ID(): string {
        return getOptional(process.env.EAGLEVIEW_CLIENT_ID, '');
    },
    get EAGLEVIEW_CLIENT_SECRET(): string {
        return getOptional(process.env.EAGLEVIEW_CLIENT_SECRET, '');
    },

    // ── Internal API ──

    /**
     * Shared secret for worker → API service-to-service calls.
     * The Python worker sends this via `X-Internal-Key` header.
     * Set in .env.local (server-side only, never expose to browser).
     * Returns empty string if not set (internal-key auth path is skipped).
     */
    get INTERNAL_API_KEY(): string {
        return getOptional(process.env.INTERNAL_API_KEY, '');
    },

    // ── App Base URL ──

    /**
     * Base URL of the Next.js application for internal API calls.
     * Used to construct URLs for server-to-server fetch requests.
     * Falls back to http://localhost:3000 in development.
     */
    get APP_BASE_URL(): string {
        return getOptional(process.env.APP_BASE_URL, 'http://localhost:3000');
    },
} as const;
