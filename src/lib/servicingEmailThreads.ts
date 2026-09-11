/**
 * Servicing Email Threads Model & Helper Functions
 *
 * Stores full back-and-forth conversation history for policy renewals
 * in `manual_overrides` table with `field_name = 'servicing_email_thread'`.
 */

export interface ThreadAttachmentMeta {
    name: string;
    size?: number;
    contentType?: string;
    url?: string;
}

export interface ServicingThreadMessage {
    id: string;
    policyId: string;
    direction: 'outbound' | 'inbound';
    senderEmail: string;
    senderName: string;
    recipientEmail: string;
    recipientName: string;
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    attachments: ThreadAttachmentMeta[];
    sentAt: string;
    isRead: boolean;
}

export interface ServicingPolicyThread {
    policyId: string;
    messages: ServicingThreadMessage[];
    hasUnreadReply: boolean;
    lastMessageAt: string;
    totalReplies: number;
}
