
DROP POLICY IF EXISTS "Default reviews viewable by authorized admins" ON public.credit_default_reviews;
DROP POLICY IF EXISTS "Default reviews manageable by authorized admins" ON public.credit_default_reviews;
DROP POLICY IF EXISTS "Default evidence viewable by authorized admins" ON public.credit_default_evidence;
DROP POLICY IF EXISTS "Default evidence manageable by authorized admins" ON public.credit_default_evidence;

CREATE POLICY "default reviews tenant write"
ON public.credit_default_reviews FOR ALL TO authenticated
USING (has_default_permission('default.review') AND customer_id = current_customer_id())
WITH CHECK (has_default_permission('default.review') AND customer_id = current_customer_id());

CREATE POLICY "default evidence tenant read"
ON public.credit_default_evidence FOR SELECT TO authenticated
USING (has_default_permission('default.view') AND customer_id = current_customer_id());

CREATE POLICY "default evidence tenant write"
ON public.credit_default_evidence FOR ALL TO authenticated
USING (has_default_permission('default.review') AND customer_id = current_customer_id())
WITH CHECK (has_default_permission('default.review') AND customer_id = current_customer_id());

DROP POLICY IF EXISTS "super admin manages scoring config" ON public.scoring_config;
CREATE POLICY "platform owner manages scoring config"
ON public.scoring_config FOR ALL TO authenticated
USING (is_platform_owner()) WITH CHECK (is_platform_owner());

DROP POLICY IF EXISTS "scoring admins manage driving weights" ON public.driving_event_weights;
CREATE POLICY "platform owner manages driving weights"
ON public.driving_event_weights FOR ALL TO authenticated
USING (is_platform_owner()) WITH CHECK (is_platform_owner());

DROP POLICY IF EXISTS "Drivers can view their own KYC documents" ON storage.objects;
CREATE POLICY "Drivers can view their own KYC documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'kyc-documents'
  AND (
    (storage.foldername(name))[1] = (
      SELECT d.id::text FROM public.drivers d
      WHERE d.auth_user_id = auth.uid() OR d.user_id = auth.uid()
      LIMIT 1
    )
    OR is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id::text = (storage.foldername(objects.name))[1]
        AND d.customer_id = current_customer_id()
    )
  )
);

ALTER VIEW public.v_credit_collections_queue SET (security_invoker = true);
ALTER VIEW public.v_credit_collections_reconciliation_anomalies SET (security_invoker = true);
ALTER VIEW public.v_credit_default_reconciliation_anomalies SET (security_invoker = true);
ALTER VIEW public.v_credit_default_review_queue SET (security_invoker = true);
ALTER VIEW public.v_credit_schedule_reconciliation_anomalies SET (security_invoker = true);
ALTER VIEW public.v_driver_ownership_completion_status SET (security_invoker = true);
ALTER VIEW public.v_ownership_completion_exceptions SET (security_invoker = true);
ALTER VIEW public.v_ownership_completion_queue SET (security_invoker = true);
