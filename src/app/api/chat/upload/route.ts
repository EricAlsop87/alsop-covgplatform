import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { ChatAttachment } from '@/lib/teamChat';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;

    const admin = getSupabaseAdmin();
    const userId = auth.user.id;

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const isClipboardPaste = formData.get('is_clipboard') === 'true';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const originalName = file.name || (isClipboardPaste ? `screenshot_${Date.now()}.png` : 'attachment');
        const fileType = file.type || 'application/octet-stream';
        const isImage = fileType.startsWith('image/');

        const cleanName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `chat/${userId}/${Date.now()}_${cleanName}`;

        // Upload to Supabase storage bucket 'cfp-platform-documents'
        const { data: uploadData, error: uploadErr } = await admin.storage
            .from('cfp-platform-documents')
            .upload(storagePath, buffer, {
                contentType: fileType,
                upsert: true,
            });

        let fileUrl = '';
        if (!uploadErr && uploadData?.path) {
            const { data: signedData } = await admin.storage
                .from('cfp-platform-documents')
                .createSignedUrl(uploadData.path, 60 * 60 * 24 * 30); // 30 days
            fileUrl = signedData?.signedUrl || '';
        }

        // If storage upload fails, fallback to inline base64 data url for images < 4MB
        if (!fileUrl && isImage && buffer.length < 4 * 1024 * 1024) {
            fileUrl = `data:${fileType};base64,${buffer.toString('base64')}`;
        }

        const attachment: ChatAttachment = {
            id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            fileName: originalName,
            fileType,
            fileSize: file.size,
            url: fileUrl,
            isImage,
        };

        return NextResponse.json({
            success: true,
            attachment,
        });
    } catch (err: any) {
        console.error('Error uploading chat attachment:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
