CREATE TABLE IF NOT EXISTS public.billing_cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error')),
  processed_count integer DEFAULT 0,
  error_message text,
  details jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_billing_cron_runs_job_started
  ON public.billing_cron_runs (job_name, started_at DESC);

ALTER TABLE public.billing_cron_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active admins can view billing cron runs" ON public.billing_cron_runs;
CREATE POLICY "Active admins can view billing cron runs"
  ON public.billing_cron_runs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_active = true));

DROP POLICY IF EXISTS "Service role manages billing cron runs" ON public.billing_cron_runs;
CREATE POLICY "Service role manages billing cron runs"
  ON public.billing_cron_runs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);