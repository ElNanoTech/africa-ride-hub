
-- Ensure pg_cron + pg_net are present (they normally are on Lovable Cloud).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop the legacy schedule if it exists.
DO $$
DECLARE
  jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname IN (
    'auto-immobilize-overdue', 'fleet-control-recompute', 'fleet-control-parking-check'
  ) LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END$$;

-- Hourly: recompute statuses, cancel closed rentals, escalate auto-immobilization.
SELECT cron.schedule(
  'fleet-control-recompute',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fihrjavcdwpttvnlqqxc.supabase.co/functions/v1/recompute-fleet-controls',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Every 15 minutes: advance the honest immobilization state machine.
SELECT cron.schedule(
  'fleet-control-parking-check',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fihrjavcdwpttvnlqqxc.supabase.co/functions/v1/check-parking-immobilization',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
