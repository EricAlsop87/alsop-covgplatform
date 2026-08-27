import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import { logger } from './logger';

/**
 * Public Supabase client (client-safe).
 * Uses the anonymous key — all queries are gated by Row Level Security.
 * Safe to use in client components, server components, and API routes.
 */
export const supabase: SupabaseClient = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY
);

logger.debug('Supabase', 'Public client initialized', { url: env.SUPABASE_URL });

/**
 * Admin Supabase client (SERVER-SIDE ONLY).
 * Uses the service role key — bypasses RLS entirely.
 *
 * ONLY use this in:
 * - API routes (src/app/api/...)
 * - Server-side functions
 *
 * NEVER import this in client components or expose it to the browser.
 */
let _supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
    if (_supabaseAdmin) return _supabaseAdmin;

    _supabaseAdmin = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    );

    logger.info('Supabase', 'Admin client initialized (server-side)');
    return _supabaseAdmin;
}
