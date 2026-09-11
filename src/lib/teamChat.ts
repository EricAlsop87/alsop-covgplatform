export interface ChatAttachment {
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    url: string;
    isImage: boolean;
}

export interface ChatPolicyRef {
    policyId: string;
    policyNumber: string;
    namedInsured: string;
    propertyAddress?: string;
    annualPremium?: number | null;
    effectiveDate?: string | null;
    expirationDate?: string | null;
}

export interface ChatMessage {
    id: string;
    channelId: string;
    senderId: string;
    senderName: string;
    senderEmail: string;
    senderRole?: string;
    text: string;
    attachments?: ChatAttachment[];
    policyRef?: ChatPolicyRef | null;
    reactions?: Record<string, string[]>; // emoji -> array of user names / IDs
    seenBy?: Record<string, { userName: string; seenAt: string }>; // userId -> details
    createdAt: string;
    updatedAt?: string;
}

export interface ChatChannel {
    id: string;
    name: string;
    type: 'channel' | 'group' | 'dm';
    description?: string;
    memberIds?: string[]; // Empty for public channels, specific user IDs for group/dm
    memberNames?: string[];
    createdBy?: string;
    createdAt: string;
    lastMessage?: {
        text: string;
        senderName: string;
        createdAt: string;
    } | null;
    unreadCount?: number;
}

export interface UserPresence {
    userId: string;
    userName: string;
    userEmail: string;
    role: string;
    lastSeenAt: string;
    status: 'online' | 'away' | 'offline';
}

export const DEFAULT_CHANNELS: ChatChannel[] = [
    {
        id: 'general',
        name: 'general',
        type: 'channel',
        description: 'All-hands team announcements and general discussion',
        createdAt: '2026-09-01T00:00:00Z',
    },
    {
        id: 'servicing-renewals',
        name: 'servicing-renewals',
        type: 'channel',
        description: 'Coordination between Servicing and VAs for quotes, DIC, and binds',
        createdAt: '2026-09-01T00:00:00Z',
    },
    {
        id: 'va-operations',
        name: 'va-operations',
        type: 'channel',
        description: 'VA workflow questions, document intake, and daily targets',
        createdAt: '2026-09-01T00:00:00Z',
    },
];

export function computePresenceStatus(lastSeenAtStr?: string | null): 'online' | 'away' | 'offline' {
    if (!lastSeenAtStr) return 'offline';
    try {
        const lastSeen = new Date(lastSeenAtStr).getTime();
        const now = Date.now();
        const diffMinutes = (now - lastSeen) / (1000 * 60);

        if (diffMinutes < 5) return 'online';
        if (diffMinutes < 20) return 'away';
        return 'offline';
    } catch {
        return 'offline';
    }
}

export async function getSystemPolicyId(admin: any): Promise<string> {
    try {
        const { data } = await admin.from('policies').select('id').order('created_at').limit(1).maybeSingle();
        if (data?.id) return data.id;
    } catch {}
    return 'a3914bd8-7b72-4884-8efe-4e43ef772705';
}
