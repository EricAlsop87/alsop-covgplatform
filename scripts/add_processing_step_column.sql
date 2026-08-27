-- Add processing_step column to dec_page_submissions
-- This allows the worker to report granular progress that the UI can poll.
ALTER TABLE dec_page_submissions
ADD COLUMN IF NOT EXISTS processing_step TEXT DEFAULT NULL;

COMMENT ON COLUMN dec_page_submissions.processing_step IS
  'Granular processing step for live UI progress: extracting_text, parsing_fields, creating_records, enriching_property, evaluating_flags, generating_report, complete';
