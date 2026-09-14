import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseAdmin } from '@/lib/supabaseClient';
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
        const senderEmail = user.email || 'alsopva02@gmail.com';
        const senderName = user.user_metadata?.first_name && user.user_metadata?.last_name
            ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
            : user.email?.split('@')[0] || 'Coverage Check Team';

        // Deduplicate Primary Recipients
        const deduplicatedTo = Array.from(new Set(recipients)).filter(Boolean);

        // Build CC List (Always include all 3 VA emails + any custom CCs)
        const defaultVaCcs = ['alsopva01@gmail.com', 'alsopva02@gmail.com', 'alsopva03@gmail.com'];
        const extraCcs = (customCc && typeof customCc === 'string')
            ? customCc.split(/[,;\s]+/).map((e: string) => e.trim()).filter((e: string) => e.includes('@'))
            : [];
        const allCc = Array.from(new Set([...defaultVaCcs, ...extraCcs])).filter(e => !deduplicatedTo.includes(e));

        const adminClient = getSupabaseAdmin();

        // ── Fetch & Attach Available Policy Documents (Dec Page, RCE, Quotes) ──
        const attachments: Array<{ name: string; content: string; contentType: string }> = [];
        const attachedNames: string[] = [];

        try {
            // A. Fetch Dec Page PDF
            const { data: decPageRecord } = await adminClient
                .from('dec_pages')
                .select('file_path')
                .or(`policy_id.eq.${policyId},policy_number.eq.${policyNumber}`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (decPageRecord?.file_path) {
                const cleanPath = decPageRecord.file_path.replace(/^\/+/, '');
                const buckets = ['cfp-raw-decpage', 'dec-pages', 'cfp-platform-documents'];
                for (const b of buckets) {
                    const { data: fileBlob } = await adminClient.storage.from(b).download(cleanPath);
                    if (fileBlob) {
                        const buffer = Buffer.from(await fileBlob.arrayBuffer());
                        const fileName = `FAIR_Plan_DecPage_${policyNumber || 'Policy'}.pdf`;
                        attachments.push({
                            name: fileName,
                            content: buffer.toString('base64'),
                            contentType: 'application/pdf',
                        });
                        attachedNames.push(fileName);
                        break;
                    }
                }
            }

            // B. Fetch other policy documents (RCE, Quotes)
            const { data: otherDocs } = await adminClient
                .from('policy_documents')
                .select('id, file_name, file_path, document_type')
                .eq('policy_id', policyId)
                .order('created_at', { ascending: false });

            if (otherDocs && otherDocs.length > 0) {
                const buckets = ['cfp-platform-documents', 'cfp-raw-decpage', 'dec-pages'];
                for (const doc of otherDocs) {
                    if (!doc.file_path) continue;
                    const cleanPath = doc.file_path.replace(/^\/+/, '');
                    for (const b of buckets) {
                        const { data: fileBlob } = await adminClient.storage.from(b).download(cleanPath);
                        if (fileBlob) {
                            const buffer = Buffer.from(await fileBlob.arrayBuffer());
                            const safeName = doc.file_name || `${doc.document_type || 'Document'}.pdf`;
                            if (!attachedNames.includes(safeName)) {
                                attachments.push({
                                    name: safeName,
                                    content: buffer.toString('base64'),
                                    contentType: 'application/pdf',
                                });
                                attachedNames.push(safeName);
                            }
                            break;
                        }
                    }
                }
            }
        } catch (attErr) {
            logger.warn('CFPSendMail', 'Error attaching documents to email', { error: String(attErr) });
        }

        // Send a single email with To, CC, and Attachments
        const sendResult = await sendEmail({
            to: deduplicatedTo,
            cc: allCc,
            from: `${senderName} <alsopva02@gmail.com>`,
            replyTo: senderEmail,
            subject,
            htmlBody,
            textBody: textBody || htmlBody.replace(/<[^>]*>?/gm, ''),
            attachments,
            policyId,
        });

        if (!sendResult.success) {
            logger.error('CFPSendMail', 'Failed to send email via emailService', { sendResult });
            return NextResponse.json({ success: false, error: sendResult.error || 'Failed to send email through provider' }, { status: 500 });
        }

        const now = new Date().toISOString();
        const namesList = recipientNames && recipientNames.length > 0 ? recipientNames.join(', ') : deduplicatedTo.join(', ');

        // 1. Save mail sent status in manual_overrides
        const { error: overrideError } = await adminClient
            .from('manual_overrides')
            .upsert({
                policy_id: policyId,
                field_name: 'cfp_mail_sent',
                new_value: JSON.stringify({
                    sent_at: now,
                    sent_to: deduplicatedTo,
                    sent_to_names: recipientNames || [],
                    sent_cc: allCc,
                    sent_by: senderName,
                    sent_by_email: senderEmail,
                    attachments: attachedNames,
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
            const { data: existingThreadOv } = await adminClient
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
                ccEmail: allCc.join(', '),
                subject,
                bodyText: textBody || htmlBody.replace(/<[^>]*>?/gm, ''),
                attachments: attachedNames.map(name => ({ name })),
                sentAt: now,
                isRead: true,
            });

            await adminClient.from('manual_overrides').upsert({
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
            const { data: existingItemOv } = await adminClient
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

            await adminClient.from('manual_overrides').upsert({
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
            await adminClient.from('activity_events').insert({
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
