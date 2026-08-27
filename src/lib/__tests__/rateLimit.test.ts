import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit } from '@/lib/rateLimit';

describe('checkRateLimit', () => {
    beforeEach(() => {
        // Reset the internal store between tests by using unique keys
    });

    it('allows requests within the limit', () => {
        const key = `test-allow-${Date.now()}`;
        const result = checkRateLimit(key, 5, 60_000);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
    });

    it('blocks requests exceeding the limit', () => {
        const key = `test-block-${Date.now()}`;
        // Exhaust the limit
        for (let i = 0; i < 5; i++) {
            checkRateLimit(key, 5, 60_000);
        }
        // Next request should be blocked
        const result = checkRateLimit(key, 5, 60_000);
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
    });

    it('returns correct remaining count', () => {
        const key = `test-remaining-${Date.now()}`;
        checkRateLimit(key, 3, 60_000); // 1st: remaining = 2
        const result = checkRateLimit(key, 3, 60_000); // 2nd: remaining = 1
        expect(result.remaining).toBe(1);
    });

    it('isolates rate limits by key', () => {
        const keyA = `test-iso-a-${Date.now()}`;
        const keyB = `test-iso-b-${Date.now()}`;

        // Exhaust key A
        for (let i = 0; i < 3; i++) {
            checkRateLimit(keyA, 3, 60_000);
        }

        // Key B should still be allowed
        const result = checkRateLimit(keyB, 3, 60_000);
        expect(result.allowed).toBe(true);
    });

    it('provides resetMs on rate limit exceeded', () => {
        const key = `test-reset-${Date.now()}`;
        for (let i = 0; i < 5; i++) {
            checkRateLimit(key, 5, 60_000);
        }
        const result = checkRateLimit(key, 5, 60_000);
        expect(result.resetMs).toBeGreaterThan(0);
        expect(result.resetMs).toBeLessThanOrEqual(60_000);
    });
});
