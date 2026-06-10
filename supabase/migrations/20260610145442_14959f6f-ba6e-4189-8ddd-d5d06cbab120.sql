
-- Allow AUDIO file type
ALTER TABLE public.accident_files
  DROP CONSTRAINT IF EXISTS accident_files_file_type_check;

ALTER TABLE public.accident_files
  ADD CONSTRAINT accident_files_file_type_check
  CHECK (file_type = ANY (ARRAY['PHOTO','VIDEO','DOCUMENT','POLICE_REPORT','WITNESS','AUDIO']));

-- Transcript columns
ALTER TABLE public.accident_files
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS transcript_lang text,
  ADD COLUMN IF NOT EXISTS transcript_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS duration_seconds integer;
