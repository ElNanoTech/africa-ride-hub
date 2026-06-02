-- Enable realtime for tables the driver and admin apps subscribe to.
-- Without this, postgres_changes subscriptions never fire and the UI stays
-- stale until the user refreshes manually.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'rentals',
    'vehicles',
    'loans',
    'payments',
    'notifications',
    'kyc_submissions',
    'support_tickets',
    'support_ticket_messages',
    'credit_scores',
    'drivers'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Ensure REPLICA IDENTITY FULL on the tables whose old-row we use in triggers
-- and realtime payloads. (rentals/vehicles already set; this is idempotent.)
ALTER TABLE public.rentals  REPLICA IDENTITY FULL;
ALTER TABLE public.vehicles REPLICA IDENTITY FULL;
ALTER TABLE public.loans    REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;