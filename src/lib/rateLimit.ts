/**
 * Simple in-memory sliding window rate limiter.
 * Not suitable for multi-instance deployments (use Redis/Upstash for that).
 * Sufficient for single-process Vercel serverless functions.
 */

interface RateLimitEntry {
    timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter(t => now - t < 60_000);
        if (entry.timestamps.length === 0) store.delete(key);
    }
}, 5 * 60_000);

export function checkRateLimit(
    key: string,
    maxRequests: number = 20,
    windowMs: number = 60_000,
): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    let entry = store.get(key);
    if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

    if (entry.timestamps.length >= maxRequests) {
        const oldestInWindow = entry.timestamps[0];
        return {
            allowed: false,
            remaining: 0,
            resetMs: oldestInWindow + windowMs - now,
        };
    }

    entry.timestamps.push(now);
    return {
        allowed: true,
        remaining: maxRequests - entry.timestamps.length,
        resetMs: windowMs,
    };
}
