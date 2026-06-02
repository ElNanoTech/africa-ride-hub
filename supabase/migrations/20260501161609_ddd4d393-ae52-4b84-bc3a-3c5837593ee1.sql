DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'vehicle_positions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_positions';
  END IF;
END $$;

ALTER TABLE public.vehicle_positions REPLICA IDENTITY FULL;