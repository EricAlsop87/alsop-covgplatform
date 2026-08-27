/**
 * Structured logger for the CFP Platform.
 *
 * Provides consistent, structured logging with:
 * - Log levels: debug, info, warn, error
 * - Timestamps and context tags
 * - Structured metadata for machine-readability
 * - Production-safe (debug suppressed in prod)
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('Auth', 'User logged in', { userId: '123' });
 *   logger.error('Upload', 'File upload failed', { error: err.message, fileSize: 1024 });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    level: LogLevel;
    context: string;
    message: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}

function formatLog(entry: LogEntry): string {
    const meta = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
    return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.context}] ${entry.message}${meta}`;
}

function createLogEntry(
    level: LogLevel,
    context: string,
    message: string,
    metadata?: Record<string, unknown>
): LogEntry {
    return {
        level,
        context,
        message,
        timestamp: new Date().toISOString(),
        metadata,
    };
}

const isProduction = process.env.NODE_ENV === 'production';

export const logger = {
    /**
     * Debug-level log. Suppressed in production.
     * Use for development diagnostics, data flow tracing, etc.
     */
    debug(context: string, message: string, metadata?: Record<string, unknown>): void {
        if (isProduction) return;
        const entry = createLogEntry('debug', context, message, metadata);
        console.debug(formatLog(entry));
    },

    /**
     * Info-level log. Always emitted.
     * Use for significant events: auth, data fetches, uploads, etc.
     */
    info(context: string, message: string, metadata?: Record<string, unknown>): void {
        const entry = createLogEntry('info', context, message, metadata);
        console.info(formatLog(entry));
    },

    /**
     * Warn-level log. Always emitted.
     * Use for recoverable issues: missing optional data, fallback behavior, etc.
     */
    warn(context: string, message: string, metadata?: Record<string, unknown>): void {
        const entry = createLogEntry('warn', context, message, metadata);
        console.warn(formatLog(entry));
    },

    /**
     * Error-level log. Always emitted.
     * Use for failures: API errors, upload failures, unexpected exceptions.
     */
    error(context: string, message: string, metadata?: Record<string, unknown>): void {
        const entry = createLogEntry('error', context, message, metadata);
        console.error(formatLog(entry));
    },
} as const;
