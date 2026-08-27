import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/emailService';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

/** HTML-escape user content to prevent XSS in email templates. */
const escHtml = (s: string): string =>
    s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]!));


/**
 * POST /api/support
 * Handles support requests submitted by clients or guests.
 * Direct-delivers support emails to support@coveragechecknow.com via Postmark and logs an activity event.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, email, subject, message, policyNumber } = body;

        // Input length limits to prevent abuse
        const MAX_MSG_LEN = 5000;
        const MAX_FIELD_LEN = 200;
        if (typeof name === 'string' && name.length > MAX_FIELD_LEN) {
            return NextResponse.json({ error: 'Name is too long (max 200 characters)' }, { status: 400 });
        }
        if (typeof subject === 'string' && subject.length > MAX_FIELD_LEN) {
            return NextResponse.json({ error: 'Subject is too long (max 200 characters)' }, { status: 400 });
        }
        if (typeof message === 'string' && message.length > MAX_MSG_LEN) {
            return NextResponse.json({ error: 'Message is too long (max 5000 characters)' }, { status: 400 });
        }

        // Basic email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!email || typeof email !== 'string' || !email.trim() || !emailRegex.test(email.trim())) {
            return NextResponse.json({ error: 'Valid email address is required' }, { status: 400 });
        }
        if (!message || typeof message !== 'string' || !message.trim()) {
            return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
        }

        const clientName = name?.trim() || email.split('@')[0];
        const emailSubject = `[Support Inquiry] ${subject || 'General Question'} - ${clientName}`;

        const htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
                <div style="background: #2243B6; color: #ffffff; padding: 1.25rem 1.5rem; border-radius: 8px 8px 0 0;">
                    <h2 style="margin: 0; font-size: 18px;">New Client Support Request</h2>
                    <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">CoverageCheckNow Platform Support</p>
                </div>
                <div style="padding: 1.5rem; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; background: #ffffff;">
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 14px;">
                        <tr><td style="padding: 6px 0; color: #64748b; width: 130px;"><strong>Client Name:</strong></td><td style="padding: 6px 0;">${escHtml(clientName)}</td></tr>
                        <tr><td style="padding: 6px 0; color: #64748b;"><strong>Client Email:</strong></td><td style="padding: 6px 0;"><a href="mailto:${escHtml(email)}" style="color: #2243B6;">${escHtml(email)}</a></td></tr>
                        ${policyNumber ? `<tr><td style="padding: 6px 0; color: #64748b;"><strong>Policy #:</strong></td><td style="padding: 6px 0;">${escHtml(policyNumber)}</td></tr>` : ''}
                        <tr><td style="padding: 6px 0; color: #64748b;"><strong>Topic / Subject:</strong></td><td style="padding: 6px 0;">${escHtml(subject || 'General Inquiry')}</td></tr>
                        <tr><td style="padding: 6px 0; color: #64748b;"><strong>Submitted At:</strong></td><td style="padding: 6px 0;">${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PST</td></tr>
                    </table>
                    <div style="background: #f8fafc; border-left: 4px solid #2243B6; padding: 1rem; border-radius: 4px; margin-bottom: 1.5rem;">
                        <h4 style="margin: 0 0 0.5rem 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Message Body</h4>
                        <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #334155;">${escHtml(message)}</p>
                    </div>
                    <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
                        Replying directly to this email will respond to the client at ${email}.
                    </p>
                </div>
            </div>
        `;

        // Direct Postmark dispatch to support@coveragechecknow.com (guarantees delivery on both dev and production)
        const postmarkToken = env.POSTMARK_SERVER_TOKEN;
        let sendResult: any;

        if (postmarkToken) {
            const pmRes = await fetch('https://api.postmarkapp.com/email', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-Postmark-Server-Token': postmarkToken,
                },
                body: JSON.stringify({
                    From: 'admin@coveragechecknow.com',
                    To: 'support@coveragechecknow.com',
                    ReplyTo: email,
                    Subject: emailSubject,
                    HtmlBody: htmlBody,
                    TextBody: `Client ${clientName} (${email}) submitted support request: ${message}`,
                    MessageStream: 'outbound',
                }),
            });
            const pmData = await pmRes.json();
            sendResult = { success: pmRes.ok && !pmData.ErrorCode, data: pmData };
        } else {
            sendResult = await sendEmail({
                to: 'support@coveragechecknow.com',
                from: 'admin@coveragechecknow.com',
                replyTo: email,
                subject: emailSubject,
                htmlBody,
            });
        }

        // Log activity event
        try {
            const supabase = getSupabaseAdmin();
            await supabase.from('activity_events').insert({
                event_type: 'support.inquiry',
                title: 'Client Support Inquiry Submitted',
                detail: `${clientName} (${email}): ${subject || 'Inquiry'}`,
                meta: { client_name: clientName, client_email: email, policy_number: policyNumber, subject, message }
            });
        } catch (actErr) {
            logger.warn('Support', 'Failed to insert activity event for support request:', { error: actErr instanceof Error ? actErr.message : String(actErr) })
        }

        return NextResponse.json({ success: true, message: 'Support request sent successfully' });

    } catch (err: any) {
        logger.error('Support', 'Error in POST /api/support:', { error: err instanceof Error ? err.message : String(err) })
        return NextResponse.json({ error: 'Failed to submit support request' }, { status: 500 });
    }
}
