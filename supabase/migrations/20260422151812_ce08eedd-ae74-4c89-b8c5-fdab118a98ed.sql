DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'driver_score_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_score_events;
  END IF;
END $$;

ALTER TABLE public.driver_score_events REPLICA IDENTITY FULL;