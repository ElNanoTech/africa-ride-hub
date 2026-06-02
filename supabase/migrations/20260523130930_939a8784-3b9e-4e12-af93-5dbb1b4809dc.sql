
-- 1. Make recently-added anomalies view security_invoker so it respects caller RLS
ALTER VIEW public.v_wallet_settlement_anomalies SET (security_invoker = true);

-- 2. Fix admin_audit_logs insert policy: admin_user_id is admin_users.id, not auth.uid()
DROP POLICY IF EXISTS "admins insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "admins insert audit logs"
ON public.admin_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin()
  AND admin_user_id IN (
    SELECT id FROM public.admin_users WHERE user_id = auth.uid()
  )
);

-- 3. Voice notes: drop the duplicate public-role delete policy. Keep authenticated-only one.
DROP POLICY IF EXISTS "Users can delete own voice notes" ON storage.objects;
