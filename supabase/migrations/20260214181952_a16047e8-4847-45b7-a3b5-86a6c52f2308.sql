
-- Tighten the insert policy - only service role (admin) can insert
DROP POLICY "System inserts usage logs" ON public.ai_usage_logs;

CREATE POLICY "Admins can insert usage logs"
ON public.ai_usage_logs FOR INSERT
WITH CHECK (is_admin() OR is_platform_owner());
