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

        // 1. Save mail sent status in manual_overrides
        const { error: overrideError } = await supabase
            .from('manual_overrides')
            .upsert({
                policy_id: policyId,
                field_name: 'cfp_mail_sent',
                new_value: JSON.stringify({
                    sent_at: now,
                    sent_to: deduplicatedTo,
                    sent_to_names: recipientNames || [],
                    sent_by: senderName,
                    sent_by_email: senderEmail,
                    subject,
                }),
                actor_id: user.id,
                updated_at: now,
            }, { onConflict: 'policy_id,field_name' });

        if (overrideError) {
            logger.warn('CFPSendMail', 'Failed to write manual_overrides for cfp_mail_sent', { error: overrideError.message });
        }

        // 2. Append to servicing_email_thread so it appears in Email Hub thread drawer
        try {
            const { data: existingThreadOv } = await supabase
                .from('manual_overrides')
                .select('new_value')
                .eq('policy_id', policyId)
                .eq('field_name', 'servicing_email_thread')
                .maybeSingle();

            let threadMessages: any[] = [];
            if (existingThreadOv?.new_value) {
                try {
                    threadMessages = JSON.parse(existingThreadOv.new_value);
                } catch {}
            }

            threadMessages.push({
                id: `msg_${Date.now()}`,
                policyId,
                direction: 'outbound',
                senderEmail,
                senderName,
                recipientEmail: deduplicatedTo.join(', '),
                recipientName: namesList,
                subject,
                bodyText: textBody || htmlBody.replace(/<[^>]*>?/gm, ''),
                sentAt: now,
                isRead: true,
            });

            await supabase.from('manual_overrides').upsert({
                policy_id: policyId,
                field_name: 'servicing_email_thread',
                new_value: JSON.stringify(threadMessages),
                actor_id: user.id,
                updated_at: now,
            }, { onConflict: 'policy_id,field_name' });
        } catch (e) {
            logger.warn('CFPSendMail', 'Failed to update servicing_email_thread', { error: String(e) });
        }

        // 3. Update servicing_email_item status to emailed_to_agent
        try {
            const { data: existingItemOv } = await supabase
                .from('manual_overrides')
                .select('new_value')
                .eq('policy_id', policyId)
                .eq('field_name', 'servicing_email_item')
                .maybeSingle();

            let itemData: any = {};
            if (existingItemOv?.new_value) {
                try { itemData = JSON.parse(existingItemOv.new_value); } catch {}
            }

            itemData.status = 'emailed_to_agent';
            itemData.emailed_at = now;
            itemData.assigned_agent = namesList;
            itemData.va_user_name = senderName;

            await supabase.from('manual_overrides').upsert({
                policy_id: policyId,
                field_name: 'servicing_email_item',
                new_value: JSON.stringify(itemData),
                actor_id: user.id,
                updated_at: now,
            }, { onConflict: 'policy_id,field_name' });
        } catch (e) {
            logger.warn('CFPSendMail', 'Failed to update servicing_email_item', { error: String(e) });
        }

        // 4. Record in activity_events
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
