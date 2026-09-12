import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { sendEmail } from '@/lib/emailService';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        const token = authHeader?.replace(/^Bearer\s+/i, '');

        if (!token) {
            return NextResponse.json({ success: false, error: 'Unauthorized — missing token' }, { status: 401 });
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const {
            policyId,
            policyNumber,
            recipients,
            recipientNames,
            customCc,
            subject,
            htmlBody,
            textBody,
        } = body;

        if (!policyId || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return NextResponse.json({ success: false, error: 'Missing policyId or recipients' }, { status: 400 });
        }

        if (!subject || !htmlBody) {
            return NextResponse.json({ success: false, error: 'Missing subject or email body' }, { status: 400 });
        }

        // Determine sender email & name
        const senderEmail = user.email || 'support@coveragechecknow.com';
        const senderName = user.user_metadata?.first_name && user.user_metadata?.last_name
            ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
            : user.email?.split('@')[0] || 'Coverage Check Now Team';

        // Combine all recipient emails
        const allTo = [...recipients];
        if (customCc && typeof customCc === 'string') {
            const extraEmails = customCc.split(/[,;\s]+/).map((e: string) => e.trim()).filter((e: string) => e.includes('@'));
            allTo.push(...extraEmails);
        }

        const deduplicatedTo = Array.from(new Set(allTo));

        // Send email to all recipients with replyTo set to sender
        const sendPromises = deduplicatedTo.map(toEmail =>
            sendEmail({
                to: toEmail,
                from: `Coverage Check Now <reports@coveragechecknow.com>`,
                replyTo: senderEmail,
                subject,
                htmlBody,
                textBody: textBody || htmlBody.replace(/<[^>]*>?/gm, ''),
                policyId,
            })
        );

        const results = await Promise.all(sendPromises);
        const allSuccess = results.some(r => r.success);

        if (!allSuccess) {
            logger.error('CFPSendMail', 'Failed to send emails via emailService', { results });
            return NextResponse.json({ success: false, error: 'Failed to send email through provider' }, { status: 500 });
        }

        const now = new Date().toISOString();
        const namesList = recipientNames && recipientNames.length > 0 ? recipientNames.join(', ') : deduplicatedTo.join(', ');

        // Save mail sent status in policy_field_overrides
        const { error: overrideError } = await supabase
            .from('policy_field_overrides')
            .upsert({
                policy_id: policyId,
                field_name: 'cfp_mail_sent',
                field_value: JSON.stringify({
                    sent_at: now,
                    sent_to: deduplicatedTo,
                    sent_to_names: recipientNames || [],
                    sent_by: senderName,
                    sent_by_email: senderEmail,
                    subject,
                }),
                source: 'user',
                updated_at: now,
            }, { onConflict: 'policy_id,field_name' });

        if (overrideError) {
            logger.warn('CFPSendMail', 'Failed to write policy_field_override for cfp_mail_sent', { error: overrideError.message });
        }

        // Also record in activity_events
        try {
            await supabase.from('activity_events').insert({
                policy_id: policyId,
                actor_user_id: user.id,
                event_type: 'email.sent',
                title: 'Document Status Mail Sent',
                detail: `Sent document availability email to ${namesList} for ${policyNumber || 'policy'}`,
                meta: {
                    policy_id: policyId,
                    policy_number: policyNumber,
                    recipients: deduplicatedTo,
                    recipient_names: recipientNames,
                    sent_at: now,
                    sent_by: senderName,
                    subject,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            success: true,
            sent_at: now,
            sent_to: deduplicatedTo,
            sent_to_names: recipientNames || [],
            sent_by: senderName,
        });

    } catch (err: any) {
        logger.error('CFPSendMail', 'Unexpected error in send-mail route', { error: err.message });
        return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
    }
}
