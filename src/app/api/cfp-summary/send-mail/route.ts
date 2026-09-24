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
            recipients, // fallback for toRecipients
            recipientNames, // fallback for toNames
            toRecipients,
            toNames,
            customTo,
            ccRecipients,
            ccNames,
            customCc,
            subject,
            htmlBody,
            textBody,
            selectedAttachments,
        } = body;

        // Resolve primary TO recipients
        const rawTo: string[] = Array.isArray(toRecipients) && toRecipients.length > 0
            ? toRecipients
            : (Array.isArray(recipients) ? recipients : []);
        const rawToNames: string[] = Array.isArray(toNames) && toNames.length > 0
            ? toNames
            : (Array.isArray(recipientNames) ? recipientNames : []);

        const extraTos = (customTo && typeof customTo === 'string')
            ? customTo.split(/[,;\s]+/).map((e: string) => e.trim()).filter((e: string) => e.includes('@'))
            : [];

        // Resolve explicit CC recipients from modal selection
        const rawCc: string[] = Array.isArray(ccRecipients) ? ccRecipients : [];
        const rawCcNames: string[] = Array.isArray(ccNames) ? ccNames : [];

        // Validate that we have at least one recipient (either TO, custom TO, CC, or custom CC)
        if (!policyId || (rawTo.length === 0 && extraTos.length === 0 && rawCc.length === 0 && !customCc)) {
            return NextResponse.json({ success: false, error: 'Missing policyId or recipients' }, { status: 400 });
        }

        if (!subject || !htmlBody) {
            return NextResponse.json({ success: false, error: 'Missing subject or email body' }, { status: 400 });
        }

        // VA Team Name Mapping
        const VA_NAMES: Record<string, string> = {
            'admin@coveragechecknow.com': 'Coverage Check Admin',
            'phoebe@coveragechecknow.com': 'Phoebe Hernandez',
            'paula@coveragechecknow.com': 'Paula Veloza',
            'danicah@coveragechecknow.com': 'Danicah Jesoro',
            'alsopva01@gmail.com': 'Paula Andrea Veloza',
            'alsopva02@gmail.com': 'Phoebe Hernandez',
            'alsopva03@gmail.com': 'Danicah Jesoro',
        };

        // Determine operator name from logged in session
        const userEmail = (user.email || 'admin@coveragechecknow.com').toLowerCase();
        const operatorName = VA_NAMES[userEmail] || (
            user.user_metadata?.first_name && user.user_metadata?.last_name
                ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
                : user.user_metadata?.name || 'Coverage Check Team'
        );

        // Official main sender is admin@coveragechecknow.com authenticated via Google Workspace SMTP
        const senderEmail = 'admin@coveragechecknow.com';
        const senderName = `${operatorName} via Coverage Check`;

        // Deduplicate Primary Recipients (Modal selections + custom TO entries)
        const deduplicatedTo = Array.from(new Set([...rawTo, ...extraTos])).filter(Boolean);

        // If no explicit TO is provided but CC/custom CC exists, promote first CC or fallback
        if (deduplicatedTo.length === 0 && rawCc.length > 0) {
            deduplicatedTo.push(rawCc[0]);
        }

        // Build Full CC List (Explicit CCs + peer CCN team emails + any custom CCs, excluding primary TOs)
        const defaultVaCcs = [
            'phoebe@coveragechecknow.com',
            'danicah@coveragechecknow.com',
            'paula@coveragechecknow.com',
        ];
        const extraCcs = (customCc && typeof customCc === 'string')
            ? customCc.split(/[,;\s]+/).map((e: string) => e.trim()).filter((e: string) => e.includes('@'))
            : [];
        const allCc = Array.from(new Set([...rawCc, ...defaultVaCcs, ...extraCcs])).filter(
            e => !deduplicatedTo.map(t => t.toLowerCase()).includes(e.toLowerCase())
        );

        const adminClient = getSupabaseAdmin();

        // ── Fetch & Attach Policy Documents (Dec Page, RCE, Quotes) ──
        const attachments: Array<{ name: string; content: string; contentType: string }> = [];
        const attachedNames: string[] = [];
        const failedAttachments: string[] = [];

        try {
            // If the VA explicitly pre-selected specific attachments via the guardrail checklist:
            if (Array.isArray(selectedAttachments)) {
                // Fetch all active platform_documents for this policy to support fallback resolution
                const { data: policyPlatformDocs } = await adminClient
                    .from('platform_documents')
                    .select('id, file_name, storage_path, doc_type')
                    .eq('policy_id', policyId);

                for (const item of selectedAttachments) {
                    const safeName = item.fileName || 'Document.pdf';
                    if (attachedNames.includes(safeName)) continue;

                    const candidatePaths: string[] = [];
                    if (item.storagePath) {
                        candidatePaths.push(item.storagePath.replace(/^\/+/, ''));
                    }

                    // Fallback 1: Match by exact file_name in policy's platform_documents
                    const matchByName = policyPlatformDocs?.find(d => d.file_name && d.file_name === item.fileName && d.storage_path);
                    if (matchByName?.storage_path) {
                        candidatePaths.push(matchByName.storage_path.replace(/^\/+/, ''));
                    }

                    // Fallback 2: Match by quote number regex (e.g., Q1003529677, Q5614576, CASNH...)
                    const qNumMatch = (item.fileName || '').match(/(Q\d+|CASNH\d+|HO\d+|005\d+|SS\d+)/i) || (item.storagePath || '').match(/(Q\d+|CASNH\d+|HO\d+|005\d+|SS\d+)/i);
                    if (qNumMatch) {
                        const qNum = qNumMatch[1].toLowerCase();
                        const matchByQNum = policyPlatformDocs?.find(d => d.storage_path && (d.file_name || '').toLowerCase().includes(qNum));
                        if (matchByQNum?.storage_path) {
                            candidatePaths.push(matchByQNum.storage_path.replace(/^\/+/, ''));
                        }
                    }

                    // Fallback 3: Match by carrier keyword / document type
                    const itemText = `${item.id || ''} ${item.label || ''} ${item.fileName || ''} ${item.badge || ''}`.toLowerCase();
                    let carrierKeyword = '';
                    if (itemText.includes('bamboo')) carrierKeyword = 'bamboo';
                    else if (itemText.includes('aegis')) carrierKeyword = 'aegis';
                    else if (itemText.includes('psic') || itemText.includes('pacific')) carrierKeyword = 'pacific';
                    else if (itemText.includes('american modern') || itemText.includes('am quote')) carrierKeyword = 'modern';
                    else if (itemText.includes('sagesure')) carrierKeyword = 'sagesure';
                    else if (itemText.includes('rce') || itemText.includes('valuation')) carrierKeyword = 'rce';

                    if (carrierKeyword) {
                        const matchByCarrier = policyPlatformDocs?.find(d => {
                            if (!d.storage_path) return false;
                            const dText = `${d.file_name || ''} ${d.doc_type || ''}`.toLowerCase();
                            return dText.includes(carrierKeyword);
                        });
                        if (matchByCarrier?.storage_path) {
                            candidatePaths.push(matchByCarrier.storage_path.replace(/^\/+/, ''));
                        }
                    }

                    // Fallback 4: Match by partial filename
                    if (item.fileName) {
                        const baseSearch = item.fileName.toLowerCase().replace(/[-_.\s]/g, '');
                        const matchFuzzy = policyPlatformDocs?.find(d => {
                            if (!d.storage_path || !d.file_name) return false;
                            const dName = d.file_name.toLowerCase().replace(/[-_.\s]/g, '');
                            return dName.includes(baseSearch) || baseSearch.includes(dName);
                        });
                        if (matchFuzzy?.storage_path) {
                            candidatePaths.push(matchFuzzy.storage_path.replace(/^\/+/, ''));
                        }
                    }

                    // Fallback 5: Check dec_pages / dec_page_submissions if Dec page
                    if (itemText.includes('dec') || item.docCategory === 'dec') {
                        const { data: decRecord } = await adminClient
                            .from('dec_pages')
                            .select('storage_path, dec_page_submissions(storage_path)')
                            .eq('policy_id', policyId)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();
                        if (decRecord?.storage_path) {
                            candidatePaths.push(decRecord.storage_path.replace(/^\/+/, ''));
                        }
                        const sub = Array.isArray(decRecord?.dec_page_submissions) ? decRecord?.dec_page_submissions[0] : decRecord?.dec_page_submissions;
                        if (sub?.storage_path) {
                            candidatePaths.push(sub.storage_path.replace(/^\/+/, ''));
                        }
                    }

                    const buckets = item.bucket
                        ? [item.bucket, 'cfp-platform-documents', 'cfp-raw-decpage']
                        : ['cfp-platform-documents', 'cfp-raw-decpage'];

                    let attached = false;
                    for (const path of Array.from(new Set(candidatePaths))) {
                        if (attached) break;
                        for (const b of buckets) {
                            const { data: fileBlob } = await adminClient.storage.from(b).download(path);
                            if (fileBlob) {
                                const buffer = Buffer.from(await fileBlob.arrayBuffer());
                                attachments.push({
                                    name: safeName,
                                    content: buffer.toString('base64'),
                                    contentType: 'application/pdf',
                                });
                                attachedNames.push(safeName);
                                attached = true;
                                break;
                            }
                        }
                    }

                    if (!attached) {
                        logger.warn('SendMail', `Failed to attach document: ${safeName} (policy ${policyId}). Tried paths: ${candidatePaths.join(', ')}`);
                        failedAttachments.push(safeName);
                    }
                }

                // Strict Guardrail: If any selected attachment failed to download, halt sending
                if (failedAttachments.length > 0) {
                    return NextResponse.json({
                        success: false,
                        error: `Attachment guardrail: ${failedAttachments.length} selected document(s) could not be retrieved from storage: ${failedAttachments.join(', ')}. Email was NOT sent to prevent sending an incomplete package. Please check or re-upload the document(s).`,
                        failedAttachments,
                    }, { status: 422 });
                }
            } else {
                // Fallback: auto-detect all available documents for this policy
                // A. Fetch Dec Page PDF from dec_page_submissions / dec_pages
                let decStoragePath: string | null = null;
                let decFileName: string | null = null;

                const { data: decPageRecord } = await adminClient
                    .from('dec_pages')
                    .select('id, submission_id, dec_page_submissions(storage_path, file_name)')
                    .eq('policy_id', policyId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (decPageRecord) {
                    const sub = Array.isArray(decPageRecord.dec_page_submissions)
                        ? decPageRecord.dec_page_submissions[0]
                        : decPageRecord.dec_page_submissions;
                    if (sub?.storage_path) {
                        decStoragePath = sub.storage_path;
                        decFileName = sub.file_name;
                    } else if (decPageRecord.submission_id) {
                        const { data: subDirect } = await adminClient
                            .from('dec_page_submissions')
                            .select('storage_path, file_name')
                            .eq('id', decPageRecord.submission_id)
                            .maybeSingle();
                        if (subDirect?.storage_path) {
                            decStoragePath = subDirect.storage_path;
                            decFileName = subDirect.file_name;
                        }
                    }
                }

                if (decStoragePath) {
                    const cleanPath = decStoragePath.replace(/^\/+/, '');
                    const buckets = ['cfp-raw-decpage', 'cfp-platform-documents'];
                    for (const b of buckets) {
                        const { data: fileBlob } = await adminClient.storage.from(b).download(cleanPath);
                        if (fileBlob) {
                            const buffer = Buffer.from(await fileBlob.arrayBuffer());
                            const safeName = decFileName || `FAIR_Plan_DecPage_${policyNumber || 'Policy'}.pdf`;
                            attachments.push({
                                name: safeName,
                                content: buffer.toString('base64'),
                                contentType: 'application/pdf',
                            });
                            attachedNames.push(safeName);
                            break;
                        }
                    }
                }

                // B. Fetch other policy documents (RCE, Quotes, Decs) from platform_documents
                const { data: platformDocs } = await adminClient
                    .from('platform_documents')
                    .select('id, file_name, storage_path, doc_type')
                    .eq('policy_id', policyId)
                    .order('created_at', { ascending: false });

                if (platformDocs && platformDocs.length > 0) {
                    const buckets = ['cfp-platform-documents', 'cfp-raw-decpage'];
                    for (const doc of platformDocs) {
                        if (!doc.storage_path) continue;
                        const cleanPath = doc.storage_path.replace(/^\/+/, '');
                        const safeName = doc.file_name || `${doc.doc_type || 'Document'}.pdf`;

                        if (attachedNames.includes(safeName)) continue;

                        for (const b of buckets) {
                            const { data: fileBlob } = await adminClient.storage.from(b).download(cleanPath);
                            if (fileBlob) {
                                const buffer = Buffer.from(await fileBlob.arrayBuffer());
                                attachments.push({
                                    name: safeName,
                                    content: buffer.toString('base64'),
                                    contentType: 'application/pdf',
                                });
                                attachedNames.push(safeName);
                                break;
                            }
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
            from: `${senderName} <${senderEmail}>`,
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
        const toNamesList = rawToNames.length > 0 ? rawToNames.join(', ') : deduplicatedTo.join(', ');
        const ccNamesList = rawCcNames.length > 0 ? rawCcNames.join(', ') : rawCc.join(', ');
        const fullRecipientSummary = ccNamesList ? `${toNamesList} (CC: ${ccNamesList})` : toNamesList;

        // 1. Save mail sent status in manual_overrides
        const { error: overrideError } = await adminClient
            .from('manual_overrides')
            .upsert({
                policy_id: policyId,
                field_name: 'cfp_mail_sent',
                new_value: JSON.stringify({
                    sent_at: now,
                    sent_to: deduplicatedTo,
                    sent_to_names: rawToNames,
                    sent_cc: rawCc,
                    sent_cc_names: rawCcNames,
                    all_cc: allCc,
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
                recipientName: toNamesList,
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
            itemData.assigned_agent = toNamesList;
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
                detail: `Sent document availability email to ${fullRecipientSummary} for ${policyNumber || 'policy'}`,
                meta: {
                    policy_id: policyId,
                    policy_number: policyNumber,
                    recipients: deduplicatedTo,
                    recipient_names: rawToNames,
                    cc_recipients: rawCc,
                    cc_names: rawCcNames,
                    sent_at: now,
                    sent_by: senderName,
                    subject,
                    attachments: attachedNames,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            success: true,
            sent_at: now,
            sent_to: deduplicatedTo,
            sent_to_names: rawToNames,
            sent_cc: rawCc,
            sent_cc_names: rawCcNames,
            sent_by: senderName,
            sent_by_email: senderEmail,
            subject,
            attachments: attachedNames,
        });

    } catch (err: any) {
        logger.error('CFPSendMail', 'Unexpected error in send-mail route', { error: err.message });
        return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
    }
}
