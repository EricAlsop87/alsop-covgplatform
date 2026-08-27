import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — lightweight edge guard.
 * 
 * Auth enforcement is handled by the (authenticated)/layout.tsx client guard
 * which checks the Supabase session and role. This middleware only adds
 * security headers and handles simple redirects.
 * 
 * We intentionally do NOT redirect unauthenticated users here because:
 * 1. Supabase JS client stores auth tokens in localStorage + cookies with
 *    a chunked format that is unreliable to inspect at the edge
 * 2. The layout guard already handles redirect-to-signin robustly
 * 3. A false-negative cookie check here would block authenticated users
 */
export function middleware(request: NextRequest) {
    const response = NextResponse.next();

    // Security headers
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    return response;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
