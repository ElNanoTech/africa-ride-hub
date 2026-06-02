-- Enable realtime + full row payloads for financial tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'driver_wallets',
    'driver_wallet_transactions',
    'invoice',
    'payment_receipts',
    'invoice_audit',
    'invoice_payment_link'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- REPLICA IDENTITY FULL for accurate UPDATE/DELETE payloads
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);

    -- Add to supabase_realtime publication if not already there
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END$$;