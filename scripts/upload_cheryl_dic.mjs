import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID, createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = resolve(__dirname, '..', '.env.local');
const env = {};
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
}

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

const STORAGE_BUCKET = 'cfp-platform-documents';

async function uploadFile() {
    const filePath = resolve(__dirname, '..', 'new files', 'CHERYL MORRIS - DIC.pdf');
    if (!existsSync(filePath)) {
        console.error('File not found:', filePath);
        process.exit(1);
    }

    const fileBuffer = readFileSync(filePath);
    const fileName = 'CHERYL MORRIS - DIC.pdf';
    const docType = 'dic_dec_page';
    const documentId = randomUUID();
    const fileHash = createHash('sha256').update(fileBuffer).digest('hex');
    const now = new Date().toISOString();

    // Use an existing agent account ID (Danicah's upload that failed)
    const accountId = 'b8e901c3-64a4-4a1d-9d68-0a8d42069133';
    const storagePath = `${docType}/${accountId}/${documentId}.pdf`;

    console.log('=== Uploading CHERYL MORRIS - DIC.pdf ===');
    console.log('Document ID:', documentId);
    console.log('Storage path:', storagePath);
    console.log('File size:', fileBuffer.length, 'bytes');
    console.log('File hash:', fileHash);

    // 1. Create platform_documents record first
    const { data: docRow, error: docError } = await supabase
        .from('platform_documents')
        .insert({
            id: documentId,
            account_id: accountId,
            doc_type: docType,
            file_name: fileName,
            file_size: fileBuffer.length,
            file_hash: fileHash,
            bucket: STORAGE_BUCKET,
            parse_status: 'pending',
            processing_step: 'uploaded',
            match_status: 'pending',
            created_at: now,
            updated_at: now,
        })
        .select('id')
        .single();

    if (docError) {
        console.error('Document record error:', docError);
        process.exit(1);
    }
    console.log('✅ Document record created');

    // 2. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
            contentType: 'application/pdf',
            upsert: false,
        });

    if (uploadError) {
        console.error('Upload error:', uploadError);
        // Mark as failed
        await supabase.from('platform_documents').update({ parse_status: 'failed', error_message: uploadError.message }).eq('id', documentId);
        process.exit(1);
    }
    console.log('✅ File uploaded to storage');

    // 3. Update with storage path
    await supabase.from('platform_documents').update({
        storage_path: storagePath,
        processing_step: 'queued',
        updated_at: new Date().toISOString(),
    }).eq('id', documentId);

    // 4. Queue ingestion job
    const { error: jobError } = await supabase
        .from('ingestion_jobs')
        .insert({
            document_id: documentId,
            account_id: accountId,
            status: 'queued',
            attempts: 0,
            max_attempts: 5,
            created_at: now,
            updated_at: now,
        });

    if (jobError) {
        console.error('Job creation error:', jobError);
        process.exit(1);
    }
    console.log('✅ Ingestion job queued');
    console.log('\nThe worker will pick this up and process it automatically.');
    console.log('Document ID:', documentId);
}

uploadFile().catch(console.error);
