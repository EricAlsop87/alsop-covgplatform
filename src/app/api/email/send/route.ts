import { NextRequest, NextResponse } from 'next/server';
import {
    sendEmail,
    getDefaultFrom,
    getDefaultReplyTo,
    EmailMessage,
} from '@/lib/emailService';
import {
    getTemplate,
    getTemplateFrom,
    getTemplateReplyTo,
    renderTemplate,
} from '@/lib/emailTemplates';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';


/**
 * POST /api/email/send
 *
 * Send an email via the platform's email system.
 *
 * When a templateId is provided and the template has a Postmark alias,
 * the send goes through Postmark's /email/withTemplate endpoint, which
 * renders the template server-side in Postmark using the provided variables.
 *
 * If no templateId (freeform), or the template has no postmarkAlias,
 * the send uses the inline HTML path.
 *
 * In both cases the Safety Gate in emailService.ts applies first.
 *
 * Body: {
 *   templateId?: string,                  — Internal template ID (matched to Postmark alias)
 *   to: string,                           — Intended recipient
 *   variables?: Record<string, string>,   — Merge vars for the template
 *   subject?: string,                     — Required if no templateId
 *   htmlBody?: string,                    — Required if no templateId
 *   from?: string,
 *   replyTo?: string,
 *   policyId?: string,
 *   clientId?: string,
 *   reportId?: string,
 * }
 */
export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service'] });
    if (isAuthError(auth)) return auth;

    try {
        const body = await req.json();
        const {
            templateId,
            to,
            variables,
            subject: customSubject,
            htmlBody: customHtmlBody,
            from,
            replyTo,
            policyId,
            clientId,
            reportId,
        } = body;

        if (!to || typeof to !== 'string') {
            return NextResponse.json({ error: '"to" email address is required' }, { status: 400 });
        }

        let subject: string;
        let htmlBody: string;

        if (templateId) {
            const template = getTemplate(templateId);
            if (!template) {
                return NextResponse.json({ error: `Template "${templateId}" not found` }, { status: 400 });
            }

            if (template.postmarkAlias) {
                // ── Postmark withTemplate send ──
                const result = await sendWithPostmarkTemplate({
                    to,
                    from: from || getTemplateFrom(templateId),
                    replyTo: replyTo || getTemplateReplyTo(templateId),
                    postmarkAlias: template.postmarkAlias,
                    variables: variables || {},
                    templateId,
                    policyId,
                    clientId,
                    reportId,
                });

                return NextResponse.json(result, { status: result.success ? 200 : 502 });
            }

            // ── Inline render fallback (template has no Postmark alias) ──
            const rendered = renderTemplate(templateId, variables || {});
            if (!rendered) {
                return NextResponse.json({ error: `Failed to render template "${templateId}"` }, { status: 500 });
            }
            subject = rendered.subject;
            htmlBody = rendered.htmlBody;
        } else {
            // ── Freeform send ──
            if (!customSubject || !customHtmlBody) {
                return NextResponse.json(
                    { error: 'Either templateId or both subject and htmlBody are required' },
                    { status: 400 }
                );
            }
            subject = customSubject;
            htmlBody = customHtmlBody;
        }

        // ── Inline HTML send (freeform or no-alias template) ──
        const message: EmailMessage = {
            to,
            from: from || getDefaultFrom(),
            replyTo: replyTo || getDefaultReplyTo(),
            subject,
            htmlBody,
            templateId,
            policyId,
            clientId,
            reportId,
        };

        const result = await sendEmail(message);

        return NextResponse.json({
            success: result.success,
            mode: result.mode,
            messageId: result.messageId,
            redirectedFrom: result.redirectedFrom,
            forceRedirected: result.forceRedirected ?? false,
            error: result.error,
            timestamp: result.timestamp,
        });

    } catch (err: any) {
        logger.error('Send', '[Email Send] Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// Postmark withTemplate send
// ---------------------------------------------------------------------------

interface TemplateResult {
    success: boolean;
    mode: string;
    messageId?: string;
    redirectedFrom?: string;
    forceRedirected?: boolean;
    error?: string;
    timestamp: string;
}

async function sendWithPostmarkTemplate(opts: {
    to: string;
    from: string;
    replyTo: string;
    postmarkAlias: string;
    variables: Record<string, string>;
    templateId?: string;
    policyId?: string;
    clientId?: string;
    reportId?: string;
}): Promise<TemplateResult> {
    const { sendEmail, isForceRedirectEnabled, getForceRedirectTarget, getEmailSendMode, getDevRedirectTarget } = await import('@/lib/emailService');

    const now = new Date().toISOString();
    const originalTo = opts.to;

    // Determine actual delivery target (respect safety gate)
    let deliverTo = originalTo;
    let forceRedirected = false;

    if (isForceRedirectEnabled()) {
        deliverTo = getForceRedirectTarget();
        forceRedirected = true;
    } else {
        const mode = getEmailSendMode();
        if (mode === 'disabled') {
            // Just log, don't send
            logger.info('Send', `[Email withTemplate] DISABLED — would send "${opts.postmarkAlias}" to ${originalTo}`)
            return { success: true, mode: 'disabled', timestamp: now };
        }
        if (mode === 'redirect') {
            deliverTo = getDevRedirectTarget();
        }
    }

    const token = process.env.POSTMARK_SERVER_TOKEN;
    if (!token) {
        return { success: false, mode: getEmailSendMode(), error: 'POSTMARK_SERVER_TOKEN not configured', timestamp: now };
    }

    // Build the subject prefix for safe mode
    const mode = getEmailSendMode();
    const subjectPrefix = forceRedirected ? '[SAFE MODE] ' : mode === 'redirect' ? '[DEV/TEST] ' : '';

    try {
        const payload: Record<string, unknown> = {
            From: opts.from,
            To: deliverTo,
            ReplyTo: opts.replyTo,
            TemplateAlias: opts.postmarkAlias,
            TemplateModel: {
                ...opts.variables,
                // Inject safe mode meta into template model so Postmark templates can use it
                ...(subjectPrefix ? { _safe_mode_notice: `Originally intended for: ${originalTo}` } : {}),
            },
            MessageStream: 'outbound',
        };

        const res = await fetch('https://api.postmarkapp.com/email/withTemplate', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Postmark-Server-Token': token,
            },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        const success = res.ok && !data.ErrorCode;

        // Log to activity_events
        try {
            const { getSupabaseAdmin } = await import('@/lib/supabaseClient');
            const supabase = getSupabaseAdmin();
            await supabase.from('activity_events').insert({
                event_type: forceRedirected ? 'email.force_redirected' : mode === 'redirect' ? 'email.redirected' : 'email.sent',
                title: `Email: ${opts.postmarkAlias}`,
                detail: `Intended: ${originalTo} | Delivered: ${deliverTo} | Mode: ${mode} | Template: ${opts.postmarkAlias} | ForceRedirect: ${forceRedirected}`,
                policy_id: opts.policyId || null,
                client_id: opts.clientId || null,
                meta: {
                    intendedTo: originalTo,
                    deliveredTo: deliverTo,
                    postmarkAlias: opts.postmarkAlias,
                    templateId: opts.templateId,
                    reportId: opts.reportId,
                    forceRedirectApplied: forceRedirected,
                    mode,
                    messageId: data.MessageID,
                    error: success ? null : (data.Message || data.ErrorCode),
                },
            });
        } catch (logErr) {
            logger.error('Send', '[Email withTemplate] Failed to log activity event:', { error: logErr instanceof Error ? logErr.message : String(logErr) })
        }

        return {
            success,
            mode,
            messageId: data.MessageID,
            redirectedFrom: deliverTo !== originalTo ? originalTo : undefined,
            forceRedirected,
            error: success ? undefined : (data.Message || `Postmark error ${data.ErrorCode}`),
            timestamp: now,
        };

    } catch (err: any) {
        return { success: false, mode, error: err.message, timestamp: now };
    }
}
