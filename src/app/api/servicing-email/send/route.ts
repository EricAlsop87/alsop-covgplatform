import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { sendEmail, EmailAttachment } from '@/lib/emailService';
import { generateServicingRenewalEmail } from '@/lib/servicingEmailTemplates';
import { ServicingThreadMessage } from '@/lib/servicingEmailThreads';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const {
            policy_id,
            agent_name,
            agent_email,
            sender_name,
            custom_remarks,
            include_quote = true,
            include_rce = true,
            include_dic = true,
        } = body;

        if (!policy_id || !agent_email) {
            return NextResponse.json(
                { error: 'policy_id and agent_email are required' },
                { status: 400 }
            );
        }

        // 1. Fetch policy, client, term, and documents
        const [
            { data: pol, error: polErr },
            { data: term },
            { data: docs },
            { data: noDicOv },
        ] = await Promise.all([
            admin
                .from('policies')
                .select('id, policy_number, carrier_name, property_address_norm, property_address_raw, client_id, has_bamboo_coverage, clients(named_insured)')
                .eq('id', policy_id)
                .single(),
            admin
                .from('policy_terms')
                .select('effective_date, expiration_date')
                .eq('policy_id', policy_id)
                .eq('is_current', true)
                .maybeSingle(),
            admin
                .from('platform_documents')
                .select('doc_type, file_name, storage_path')
                .eq('policy_id', policy_id)
                .in('doc_type', ['rce', 'dic_dec_page', 'es_doc']),
            admin
                .from('manual_overrides')
                .select('new_value')
                .eq('policy_id', policy_id)
                .eq('field_name', 'no_dic_available')
                .maybeSingle(),
        ]);

        if (polErr || !pol) {
            return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
        }

        const client = pol.clients ? (Array.isArray(pol.clients) ? pol.clients[0] : pol.clients) : null;
        const namedInsured = client?.named_insured || 'Valued Policyholder';
        const propertyAddress = pol.property_address_norm || pol.property_address_raw || '—';
        const noDicAvailable = noDicOv?.new_value === 'true' || noDicOv?.new_value === '1';

        // Find documents
        const quoteDoc = docs?.find(d => d.doc_type === 'es_doc' && d.storage_path);
        const rceDoc = docs?.find(d => d.doc_type === 'rce' && d.storage_path);
        const dicDoc = docs?.find(d => d.doc_type === 'dic_dec_page' && d.storage_path);

        // 2. Download files from Supabase Storage and convert to Base64 attachments
        const attachments: EmailAttachment[] = [];
        const threadAttachmentsMeta: { name: string; size?: number; contentType?: string }[] = [];

        // Helper to download from storage
        async function fetchStorageBase64(bucket: string, path: string): Promise<string | null> {
            try {
                const { data: fileData, error: fileErr } = await admin.storage.from(bucket).download(path);
                if (fileErr || !fileData) return null;
                const buffer = Buffer.from(await fileData.arrayBuffer());
                return buffer.toString('base64');
            } catch (err) {
                console.error(`Error downloading ${path} from ${bucket}:`, err);
                return null;
            }
        }

        // Attach Quote
        if (include_quote && quoteDoc?.storage_path) {
            const b64 = await fetchStorageBase64('cfp-platform-documents', quoteDoc.storage_path);
            if (b64) {
                const fileName = quoteDoc.file_name || `${pol.policy_number}_Quote.pdf`;
                attachments.push({
                    name: fileName,
                    content: b64,
                    contentType: 'application/pdf',
                });
                threadAttachmentsMeta.push({ name: fileName, contentType: 'application/pdf' });
            }
        }

        // Attach RCE
        if (include_rce && rceDoc?.storage_path) {
            const b64 = await fetchStorageBase64('cfp-platform-documents', rceDoc.storage_path);
            if (b64) {
                const fileName = rceDoc.file_name || `${pol.policy_number}_RCE.pdf`;
                attachments.push({
                    name: fileName,
                    content: b64,
                    contentType: 'application/pdf',
                });
                threadAttachmentsMeta.push({ name: fileName, contentType: 'application/pdf' });
            }
        }

        // Attach DIC
        if (include_dic && dicDoc?.storage_path && !noDicAvailable) {
            const b64 = await fetchStorageBase64('cfp-platform-documents', dicDoc.storage_path);
            if (b64) {
                const fileName = dicDoc.file_name || `${pol.policy_number}_DIC.pdf`;
                attachments.push({
                    name: fileName,
                    content: b64,
                    contentType: 'application/pdf',
                });
                threadAttachmentsMeta.push({ name: fileName, contentType: 'application/pdf' });
            }
        }

        // 3. Generate Email Template
        const { subject, htmlBody, textBody } = generateServicingRenewalEmail({
            agentName: agent_name || 'Agent',
            agentEmail: agent_email,
            senderName: sender_name || 'Servicing Team',
            policyNumber: pol.policy_number,
            namedInsured,
            propertyAddress,
            carrierName: pol.carrier_name || 'California FAIR Plan',
            expirationDate: term?.expiration_date || null,
            hasFullCoverage: !!pol.has_bamboo_coverage,
            hasQuoteAttached: attachments.some(a => a.name.toLowerCase().includes('quote')),
            hasRceAttached: attachments.some(a => a.name.toLowerCase().includes('rce')),
            hasDicAttached: attachments.some(a => a.name.toLowerCase().includes('dic')),
            noDicAvailable,
            customRemarks: custom_remarks,
            policyId: policy_id,
        });

        // 4. Send Email via Postmark with Reply-To
        const sendResult = await sendEmail({
            to: agent_email,
            from: 'reports@coveragechecknow.com',
            replyTo: 'phoebe@coveragechecknow.com',
            subject,
            htmlBody,
            textBody,
            attachments,
            policyId: policy_id,
            clientId: pol.client_id || undefined,
        });

        if (!sendResult.success && sendResult.mode !== 'disabled') {
            return NextResponse.json(
                { error: sendResult.error || 'Failed to dispatch email to agent' },
                { status: 500 }
            );
        }

        const now = new Date().toISOString();

        // 5. Append message to policy thread history in manual_overrides
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

        const newOutboundMessage: ServicingThreadMessage = {
            id: `msg_${Date.now()}`,
            policyId: policy_id,
            direction: 'outbound',
            senderEmail: 'phoebe@coveragechecknow.com',
            senderName: sender_name || 'Servicing Team',
            recipientEmail: agent_email,
            recipientName: agent_name || 'Agent',
            subject,
            bodyText: textBody,
            bodyHtml: htmlBody,
            attachments: threadAttachmentsMeta,
            sentAt: now,
            isRead: true,
        };

        threadMessages.push(newOutboundMessage);

        await admin.from('manual_overrides').upsert(
            {
                policy_id,
                field_name: 'servicing_email_thread',
                new_value: JSON.stringify(threadMessages),
                actor_id: auth.user?.id || null,
                updated_at: now,
            },
            { onConflict: 'policy_id, field_name' }
        );

        // 6. Update Servicing Email Queue item status to 'emailed_to_agent'
        const { data: existingItemOv } = await admin
            .from('manual_overrides')
            .select('new_value')
            .eq('policy_id', policy_id)
            .eq('field_name', 'servicing_email_item')
            .maybeSingle();

        let currentItem: any = {};
        if (existingItemOv?.new_value) {
            try {
                currentItem = JSON.parse(existingItemOv.new_value);
            } catch {}
        }

        const updatedItem = {
            ...currentItem,
            status: 'emailed_to_agent',
            assigned_agent: agent_name,
            assigned_agent_email: agent_email,
            emailed_at: now,
            notes: custom_remarks || currentItem.notes || '',
            has_agent_reply: false,
        };

        await admin.from('manual_overrides').upsert(
            {
                policy_id,
                field_name: 'servicing_email_item',
                new_value: JSON.stringify(updatedItem),
                actor_id: auth.user?.id || null,
                updated_at: now,
            },
            { onConflict: 'policy_id, field_name' }
        );

        return NextResponse.json({
            success: true,
            sendResult,
            message: newOutboundMessage,
            totalAttachments: attachments.length,
        });
    } catch (err: any) {
        console.error('Error sending servicing renewal email:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
