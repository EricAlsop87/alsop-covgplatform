/**
 * Email Service — Core email sending infrastructure for CFP Platform.
 *
 * Architecture:
 * - Google Workspace = human inboxes (support@coveragechecknow.com, admin@, reports@)
 * - Postmark = app-generated transactional email (server-side HTTPS API only)
 *
 * TWO-LAYER SAFETY SYSTEM:
 *
 * Layer 1 — EMAIL_FORCE_REDIRECT_ENABLED (explicit kill-switch):
 *   If true, ALL outbound email is force-redirected to EMAIL_FORCE_REDIRECT_TO
 *   regardless of any other setting. Set to false only when ready for real delivery.
 *
 * Layer 2 — EMAIL_SEND_MODE (mode-based behavior):
 *   - 'disabled'  (DEFAULT) — logs silently, never delivers
 *   - 'redirect'  — sends via Postmark, but To is overridden to EMAIL_DEV_REDIRECT
 *   - 'live'      — real delivery (requires NODE_ENV=production AND Layer 1 disabled)
 *
 * Both layers enforce their rules SERVER-SIDE before any Postmark API call is made.
 * No UI component can bypass this.
 */

import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmailSendMode = 'disabled' | 'redirect' | 'live';

export interface EmailAddress {
    email: string;
    name?: string;
}

export interface EmailAttachment {
    name: string;
    content: string;      // Base64 encoded
    contentType: string;  // e.g. 'application/pdf'
}

export interface EmailMessage {
    to: string | EmailAddress;
    from?: string | EmailAddress;
    replyTo?: string;
    subject: string;
    htmlBody: string;
    textBody?: string;
    attachments?: EmailAttachment[];
    // Metadata for logging
    templateId?: string;
    policyId?: string;
    clientId?: string;
    reportId?: string;
}

export interface EmailSendResult {
    success: boolean;
    messageId?: string;
    mode: EmailSendMode;
    redirectedFrom?: string;   // Original recipient if redirected
    forceRedirected?: boolean; // Whether layer-1 force redirect was applied
    error?: string;
    timestamp: string;
}

export interface EmailSystemStatus {
    mode: EmailSendMode;
    forceRedirectEnabled: boolean;
    forceRedirectTarget: string | null;
    redirectTarget: string | null;
    postmarkConfigured: boolean;
    fromDefault: string;
    replyToDefault: string;
}

// ---------------------------------------------------------------------------
// Provider Interface
// ---------------------------------------------------------------------------

export interface EmailProvider {
    name: string;
    send(message: EmailMessage): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

// ---------------------------------------------------------------------------
// Postmark Provider
// ---------------------------------------------------------------------------

class PostmarkProvider implements EmailProvider {
    name = 'Postmark';

    async send(message: EmailMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
        const token = process.env.POSTMARK_SERVER_TOKEN;
        if (!token) {
            return { success: false, error: 'POSTMARK_SERVER_TOKEN not configured' };
        }

        const fromStr = typeof message.from === 'string'
            ? message.from
            : message.from
                ? `${message.from.name || ''} <${message.from.email}>`.trim()
                : getDefaultFrom();

        const toStr = typeof message.to === 'string'
            ? message.to
            : `${message.to.name || ''} <${message.to.email}>`.trim();

        const body: Record<string, unknown> = {
            From: fromStr,
            To: toStr,
            Subject: message.subject,
            HtmlBody: message.htmlBody,
            TextBody: message.textBody || stripHtml(message.htmlBody),
            MessageStream: 'outbound',
        };

        if (message.replyTo) {
            body.ReplyTo = message.replyTo;
        }

        if (message.attachments && message.attachments.length > 0) {
            body.Attachments = message.attachments.map(a => ({
                Name: a.name,
                Content: a.content,
                ContentType: a.contentType,
            }));
        }

        try {
            const res = await fetch('https://api.postmarkapp.com/email', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-Postmark-Server-Token': token,
                },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok || data.ErrorCode) {
                // Translate common Postmark error codes into actionable messages
                let friendlyError = data.Message || `Postmark error ${data.ErrorCode}`;
                if (data.ErrorCode === 400 && data.Message?.includes('Sender Signature')) {
                    friendlyError = `Sender not verified in Postmark: "${fromStr}". Go to Postmark dashboard → Sender Signatures and verify this address or its domain.`;
                } else if (data.ErrorCode === 412) {
                    friendlyError = `Postmark account is pending approval (sandbox mode). Can only deliver to @coveragechecknow.com addresses. Request approval at account.postmarkapp.com.`;
                } else if (data.ErrorCode === 300) {
                    friendlyError = `Invalid email address format. Check the recipient address.`;
                } else if (data.ErrorCode === 406) {
                    friendlyError = `Recipient address is inactive/bounced in Postmark. This address has been suppressed.`;
                }
                return { success: false, error: friendlyError };
            }

            return { success: true, messageId: data.MessageID };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }
}

// ---------------------------------------------------------------------------
// Console Provider (dev fallback when no Postmark token)
// ---------------------------------------------------------------------------

class ConsoleProvider implements EmailProvider {
    name = 'Console';

    async send(message: EmailMessage): Promise<{ success: boolean; messageId?: string }> {
        const toStr = typeof message.to === 'string' ? message.to : message.to.email;
        logger.info('emailService', `\n📧 [Console Email Provider]`)
        logger.info('emailService', `   To: ${toStr}`)
        logger.info('emailService', `   Subject: ${message.subject}`)
        logger.info('emailService', `   Template: ${message.templateId || 'none'}`)
        logger.info('emailService', `   Body length: ${message.htmlBody.length} chars\n`)
        return { success: true, messageId: `console-${Date.now()}` };
    }
}

// ---------------------------------------------------------------------------
// Config Helpers
// ---------------------------------------------------------------------------

export function getEmailSendMode(): EmailSendMode {
    const mode = (process.env.EMAIL_SEND_MODE || 'disabled').toLowerCase() as EmailSendMode;
    if (!['disabled', 'redirect', 'live'].includes(mode)) return 'disabled';

    // Extra safety: 'live' mode requires production environment
    if (mode === 'live' && process.env.NODE_ENV !== 'production') {
        logger.warn('emailService', '[Email] EMAIL_SEND_MODE=live ignored — NODE_ENV is not production. Falling back to redirect.')
        return 'redirect';
    }

    return mode;
}

export function isForceRedirectEnabled(): boolean {
    return process.env.EMAIL_FORCE_REDIRECT_ENABLED?.toLowerCase() === 'true';
}

export function getForceRedirectTarget(): string {
    return process.env.EMAIL_FORCE_REDIRECT_TO || 'carlospaz@allstate.com';
}

export function getDevRedirectTarget(): string {
    return process.env.EMAIL_DEV_REDIRECT || 'carlospaz@allstate.com';
}

export function getDefaultFrom(): string {
    return process.env.EMAIL_FROM_DEFAULT || 'reports@coveragechecknow.com';
}

export function getDefaultReplyTo(): string {
    return process.env.EMAIL_REPLY_TO_DEFAULT || 'support@coveragechecknow.com';
}

export function getEmailSystemStatus(): EmailSystemStatus {
    const mode = getEmailSendMode();
    const forceEnabled = isForceRedirectEnabled();
    return {
        mode,
        forceRedirectEnabled: forceEnabled,
        forceRedirectTarget: forceEnabled ? getForceRedirectTarget() : null,
        redirectTarget: mode === 'redirect' ? getDevRedirectTarget() : null,
        postmarkConfigured: !!process.env.POSTMARK_SERVER_TOKEN,
        fromDefault: getDefaultFrom(),
        replyToDefault: getDefaultReplyTo(),
    };
}

// ---------------------------------------------------------------------------
// Provider Selection
// ---------------------------------------------------------------------------

function getProvider(): EmailProvider {
    if (process.env.POSTMARK_SERVER_TOKEN) {
        return new PostmarkProvider();
    }
    return new ConsoleProvider();
}

// ---------------------------------------------------------------------------
// Core Send Function
// ---------------------------------------------------------------------------

/**
 * Send an email through the platform's email system.
 *
 * Layer 1 — Force Redirect (EMAIL_FORCE_REDIRECT_ENABLED=true):
 *   ALL emails go to EMAIL_FORCE_REDIRECT_TO. Period. Overrides everything.
 *
 * Layer 2 — Mode-based (when force redirect is disabled):
 *   - disabled: logs the attempt, never sends
 *   - redirect: rewrites To to dev redirect, marks subject with [DEV/TEST]
 *   - live: sends to real recipient (production only)
 */
export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    const now = new Date().toISOString();
    const originalTo = typeof message.to === 'string' ? message.to : message.to.email;

    // ── LAYER 1: FORCE REDIRECT (explicit kill-switch) ──
    if (isForceRedirectEnabled()) {
        const forceTarget = getForceRedirectTarget();

        logger.info('emailService', `[Email] ⚠️  FORCE REDIRECT ACTIVE: ${originalTo} → ${forceTarget}`)

        const redirectedMessage: EmailMessage = {
            ...message,
            to: forceTarget,
            subject: `[SAFE MODE] ${message.subject}`,
            htmlBody: buildRedirectBanner(originalTo, message.templateId, true) + message.htmlBody,
        };

        const provider = getProvider();
        const result = await provider.send(redirectedMessage);

        await logEmailEvent('email.force_redirected', message, {
            mode: getEmailSendMode(),
            originalTo,
            redirectedTo: forceTarget,
            forceRedirectApplied: true,
            provider: provider.name,
            messageId: result.messageId,
            success: result.success,
            error: result.error,
        });

        return {
            success: result.success,
            messageId: result.messageId,
            mode: getEmailSendMode(),
            redirectedFrom: originalTo,
            forceRedirected: true,
            error: result.error,
            timestamp: now,
        };
    }

    // ── LAYER 2: MODE-BASED ──
    const mode = getEmailSendMode();

    // disabled
    if (mode === 'disabled') {
        await logEmailEvent('email.blocked', message, {
            mode,
            reason: 'Email sending is disabled (EMAIL_SEND_MODE=disabled)',
            originalTo,
        });
        return { success: true, mode: 'disabled', timestamp: now };
    }

    // redirect
    if (mode === 'redirect') {
        const redirectTarget = getDevRedirectTarget();

        const redirectedMessage: EmailMessage = {
            ...message,
            to: redirectTarget,
            subject: `[DEV/TEST] ${message.subject}`,
            htmlBody: buildRedirectBanner(originalTo, message.templateId, false) + message.htmlBody,
        };

        const provider = getProvider();
        const result = await provider.send(redirectedMessage);

        await logEmailEvent('email.redirected', message, {
            mode,
            originalTo,
            redirectedTo: redirectTarget,
            forceRedirectApplied: false,
            provider: provider.name,
            messageId: result.messageId,
            success: result.success,
            error: result.error,
        });

        return {
            success: result.success,
            messageId: result.messageId,
            mode: 'redirect',
            redirectedFrom: originalTo,
            forceRedirected: false,
            error: result.error,
            timestamp: now,
        };
    }

    // live — final production safety check
    if (process.env.NODE_ENV !== 'production') {
        await logEmailEvent('email.blocked', message, {
            mode: 'live',
            reason: 'Live mode blocked — NODE_ENV is not production',
            originalTo,
        });
        return {
            success: false,
            mode: 'live',
            error: 'Live sending blocked — not in production environment',
            timestamp: now,
        };
    }

    const provider = getProvider();
    const result = await provider.send(message);

    await logEmailEvent(result.success ? 'email.sent' : 'email.failed', message, {
        mode: 'live',
        forceRedirectApplied: false,
        provider: provider.name,
        messageId: result.messageId,
        success: result.success,
        error: result.error,
    });

    return {
        success: result.success,
        messageId: result.messageId,
        mode: 'live',
        error: result.error,
        timestamp: now,
    };
}

// ---------------------------------------------------------------------------
// Activity Logging
// ---------------------------------------------------------------------------

async function logEmailEvent(
    eventType: string,
    message: EmailMessage,
    meta: Record<string, unknown>
) {
    try {
        const supabase = getSupabaseAdmin();
        const toStr = typeof message.to === 'string' ? message.to : message.to.email;

        await supabase.from('activity_events').insert({
            event_type: eventType,
            title: `Email: ${message.subject.replace(/^\[(SAFE MODE|DEV\/TEST)\]\s*/, '').slice(0, 80)}`,
            detail: `Intended: ${meta.originalTo || toStr} | Delivered: ${meta.redirectedTo || toStr} | Mode: ${meta.mode} | Template: ${message.templateId || 'custom'} | ForceRedirect: ${meta.forceRedirectApplied ?? false}`,
            policy_id: message.policyId || null,
            client_id: message.clientId || null,
            meta: {
                intendedTo: meta.originalTo || toStr,
                deliveredTo: meta.redirectedTo || toStr,
                from: typeof message.from === 'string' ? message.from : message.from?.email || getDefaultFrom(),
                replyTo: message.replyTo || getDefaultReplyTo(),
                templateId: message.templateId,
                reportId: message.reportId,
                forceRedirectApplied: meta.forceRedirectApplied ?? false,
                ...meta,
            },
        });
    } catch (err) {
        logger.error('emailService', '[Email] Failed to log activity event:', { error: err instanceof Error ? err.message : String(err) })
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRedirectBanner(originalTo: string, templateId?: string, forceMode?: boolean): string {
    const label = forceMode ? '🔒 SAFE MODE — FORCE REDIRECT ACTIVE' : '⚠️ DEV/TEST EMAIL — NOT SENT TO CLIENT';
    const bg = forceMode ? '#fee2e2' : '#fef3c7';
    const border = forceMode ? '#f87171' : '#f59e0b';
    const textColor = forceMode ? '#7f1d1d' : '#78350f';
    const headingColor = forceMode ? '#991b1b' : '#92400e';

    return `
<div style="background:${bg};border:2px solid ${border};border-radius:8px;padding:12px 16px;margin-bottom:20px;font-family:system-ui,sans-serif;">
  <div style="font-weight:700;color:${headingColor};font-size:14px;margin-bottom:4px;">${label}</div>
  <div style="color:${textColor};font-size:13px;">
    <strong>Original recipient:</strong> ${originalTo}<br/>
    <strong>Template:</strong> ${templateId || 'custom'}<br/>
    <strong>Redirected at:</strong> ${new Date().toISOString()}
  </div>
</div>
`;
}

function stripHtml(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
