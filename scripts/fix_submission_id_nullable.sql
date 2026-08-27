-- Fix: Allow ingestion_jobs.submission_id to be NULL for document pipeline jobs.
-- Document pipeline jobs use document_id instead of submission_id.
ALTER TABLE ingestion_jobs ALTER COLUMN submission_id DROP NOT NULL;

-- Also, manually queue the existing RCE document that failed to queue.
-- Get the document_id and account_id from platform_documents, then insert the job.
INSERT INTO ingestion_jobs (document_id, account_id, status, attempts, max_attempts)
SELECT id, account_id, 'queued', 0, 5
FROM platform_documents
WHERE parse_status = 'pending'
  AND id NOT IN (SELECT document_id FROM ingestion_jobs WHERE document_id IS NOT NULL);
