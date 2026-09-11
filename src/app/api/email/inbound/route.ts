import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { ServicingThreadMessage } from '@/lib/servicingEmailThreads';
import { getAgentByEmail } from '@/lib/agentsDirectory';

export const dynamic = 'force-dynamic';

/**
 * Inbound Webhook & Local Simulation Endpoint
 *
 * Receives incoming email replies from Postmark or simulation requests from local UI.
 */
export async function POST(req: NextRequest) {
    const admin = getSupabaseAdmin();

    try {
        const body = await req.json();

        // 1. Check if this is a local simulation payload
        if (body.isSimulation && body.policy_id) {
            const { policy_id, sender_name, sender_email, reply_text, attachments = [] } = body;

            const now = new Date().toISOString();
            const { data: existingThreadOv } = await admin
                .from('manual_overrides')
                .select('new_value')
                .eq('policy_id', policy_id)
                .eq('field_name', 'servicing_email_thread')
                .maybeSingle();

            let threadMessages: ServicingThreadMessage[] = [];
            if (existingThreadOv?.new_value) {
                try {
                    threadMessages = JSON.parse(existingThreadOv.new_value);
                } catch {}
            }

            const agentInfo = getAgentByEmail(sender_email);

            const simulatedInboundMessage: ServicingThreadMessage = {
                id: `inbound_${Date.now()}`,
                policyId: policy_id,
                direction: 'inbound',
                senderEmail: sender_email || 'alexclancy@allstate.com',
                senderName: sender_name || agentInfo?.fullName || 'Alex Clancy',
                recipientEmail: 'phoebe@coveragechecknow.com',
                recipientName: 'Servicing Team',
                subject: `Re: [Policy Renewal Package] Policy Update`,
                bodyText: reply_text || 'Proceed with renewal. Insured approved.',
                attachments: attachments,
                sentAt: now,
                isRead: false,
            };

            threadMessages.push(simulatedInboundMessage);

            // Save thread
            await admin.from('manual_overrides').upsert(
                {
                    policy_id,
                    field_name: 'servicing_email_thread',
                    new_value: JSON.stringify(threadMessages),
                    updated_at: now,
                },
                { onConflict: 'policy_id, field_name' }
            );

            // Update servicing_email_item with has_agent_reply = true
            const { data: itemOv } = await admin
                .from('manual_overrides')
                .select('new_value')
                .eq('policy_id', policy_id)
                .eq('field_name', 'servicing_email_item')
                .maybeSingle();

            let item: any = {};
            if (itemOv?.new_value) {
                try {
                    item = JSON.parse(itemOv.new_value);
                } catch {}
            }

            item.has_agent_reply = true;
            item.last_reply_at = now;
            item.last_reply_text = reply_text || 'Proceed with renewal.';
            item.last_reply_from = simulatedInboundMessage.senderName;

            await admin.from('manual_overrides').upsert(
                {
                    policy_id,
                    field_name: 'servicing_email_item',
                    new_value: JSON.stringify(item),
                    updated_at: now,
                },
                { onConflict: 'policy_id, field_name' }
            );

            // Log activity event
            await admin.from('activity_events').insert({
                event_type: 'email.reply_received',
                title: `Agent Reply: ${simulatedInboundMessage.senderName}`,
                detail: simulatedInboundMessage.bodyText.slice(0, 100),
                policy_id,
                meta: {
                    senderEmail: simulatedInboundMessage.senderEmail,
                    senderName: simulatedInboundMessage.senderName,
                    simulated: true,
                },
            });

            return NextResponse.json({
                success: true,
                simulated: true,
                message: simulatedInboundMessage,
            });
        }

        // 2. Real Postmark Inbound Webhook Payload
        // Extract policy ID from Subject, TextBody, or Headers
        const subject = body.Subject || '';
        const textBody = body.StrippedTextReply || body.TextBody || '';
        const htmlBody = body.HtmlBody || '';
        const fromEmail = body.From || body.FromName || '';
        const fromName = body.FromName || fromEmail;

        let matchedPolicyId: string | null = null;

        // Try extracting from Subject: [REF-POL-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx]
        const refMatch = subject.match(/\[REF-POL-([a-f0-9\-]+)\]/i) || textBody.match(/\[REF-POL-([a-f0-9\-]+)\]/i);
        if (refMatch) {
            matchedPolicyId = refMatch[1];
        }

        // Fallback: search by policy number in subject
        if (!matchedPolicyId) {
            const pnMatch = subject.match(/[A-Z0-9]{6,15}/i);
            if (pnMatch) {
                const { data: p } = await admin
                    .from('policies')
                    .select('id')
                    .eq('policy_number', pnMatch[0])
                    .maybeSingle();
                if (p) matchedPolicyId = p.id;
            }
        }

        if (!matchedPolicyId) {
            console.warn('[Inbound Webhook] Could not match incoming email to a policy:', subject);
            return NextResponse.json({ success: true, warning: 'No matching policy found' });
        }

        const now = new Date().toISOString();

        // Process attachments
        const attachments: { name: string; size?: number; contentType?: string }[] = [];
        if (Array.isArray(body.Attachments)) {
            for (const att of body.Attachments) {
                attachments.push({
                    name: att.Name,
                    size: att.ContentLength,
                    contentType: att.ContentType,
                });
            }
        }

        // Append to thread
        const { data: existingThreadOv } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('policy_id', matchedPolicyId)
            .eq('field_name', 'servicing_email_thread')
            .maybeSingle();

        let threadMessages: ServicingThreadMessage[] = [];
        if (existingThreadOv?.new_value) {
            try {
                threadMessages = JSON.parse(existingThreadOv.new_value);
            } catch {}
        }

        const inboundMsg: ServicingThreadMessage = {
            id: `inbound_${Date.now()}`,
            policyId: matchedPolicyId,
            direction: 'inbound',
            senderEmail: fromEmail,
            senderName: fromName,
            recipientEmail: 'phoebe@coveragechecknow.com',
            recipientName: 'Servicing Team',
            subject,
            bodyText: textBody,
            bodyHtml: htmlBody,
            attachments,
            sentAt: now,
            isRead: false,
        };

        threadMessages.push(inboundMsg);

        await admin.from('manual_overrides').upsert(
            {
                policy_id: matchedPolicyId,
                field_name: 'servicing_email_thread',
                new_value: JSON.stringify(threadMessages),
                updated_at: now,
            },
            { onConflict: 'policy_id, field_name' }
        );

        // Flag servicing email item
        const { data: itemOv } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('policy_id', matchedPolicyId)
            .eq('field_name', 'servicing_email_item')
            .maybeSingle();

        let item: any = {};
        if (itemOv?.new_value) {
            try {
                item = JSON.parse(itemOv.new_value);
            } catch {}
        }

        item.has_agent_reply = true;
        item.last_reply_at = now;
        item.last_reply_text = textBody.slice(0, 200);
        item.last_reply_from = fromName;

        await admin.from('manual_overrides').upsert(
            {
                policy_id: matchedPolicyId,
                field_name: 'servicing_email_item',
                new_value: JSON.stringify(item),
                updated_at: now,
            },
            { onConflict: 'policy_id, field_name' }
        );

        return NextResponse.json({ success: true, messageId: inboundMsg.id });
    } catch (err: any) {
        console.error('Error processing inbound email:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
