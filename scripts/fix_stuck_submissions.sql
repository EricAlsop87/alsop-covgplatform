-- Fix stuck submissions: mark any submission in 'processing' status
-- that's more than 30 minutes old as 'failed' with explanation.
-- This is a one-time cleanup for stale records.

UPDATE dec_page_submissions
SET status = 'failed',
    error_message = 'Timed out: stuck in processing state for over 24 hours (cleaned up during pipeline hardening)',
    updated_at = NOW()
WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '30 minutes';
