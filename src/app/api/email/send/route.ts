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
        logger.error('Send', '[Email Send] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
