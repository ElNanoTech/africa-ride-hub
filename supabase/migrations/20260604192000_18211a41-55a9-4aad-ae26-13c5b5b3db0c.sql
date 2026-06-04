
-- Restrict billing_cron_runs to platform owners only (was: any active admin cross-tenant)
DROP POLICY IF EXISTS "Active admins can view billing cron runs" ON public.billing_cron_runs;
CREATE POLICY "Platform owners view billing cron runs"
  ON public.billing_cron_runs FOR SELECT TO authenticated
  USING (is_platform_owner());

-- Tighten kyc_submissions policies to authenticated role only (reduce attack surface)
DROP POLICY IF EXISTS "Admins can update KYC" ON public.kyc_submissions;
DROP POLICY IF EXISTS "Admins can view all KYC" ON public.kyc_submissions;
DROP POLICY IF EXISTS "Drivers can view own KYC" ON public.kyc_submissions;

CREATE POLICY "Admins can update KYC"
  ON public.kyc_submissions FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view all KYC"
  ON public.kyc_submissions FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Drivers can view own KYC"
  ON public.kyc_submissions FOR SELECT TO authenticated
  USING (driver_id = get_driver_id(auth.uid()));
