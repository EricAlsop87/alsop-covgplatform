-- Migration: Add deduplication columns to dec_page_submissions

ALTER TABLE public.dec_page_submissions 
ADD COLUMN IF NOT EXISTS file_hash TEXT;

ALTER TABLE public.dec_page_submissions 
ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES public.dec_page_submissions(id);

-- Add index for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_dec_page_submissions_file_hash ON public.dec_page_submissions(file_hash);
