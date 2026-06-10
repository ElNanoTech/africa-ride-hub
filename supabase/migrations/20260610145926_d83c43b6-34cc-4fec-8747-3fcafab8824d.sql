ALTER TABLE public.support_ticket_messages
  ADD COLUMN IF NOT EXISTS voice_storage_path text,
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS transcript_lang text,
  ADD COLUMN IF NOT EXISTS transcript_status text DEFAULT NULL;

DO $$ BEGIN
  ALTER TABLE public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_transcript_status_check
    CHECK (transcript_status IS NULL OR transcript_status IN ('pending','processing','ready','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;