
-- AI Usage Tracking Table for billing and analytics
CREATE TABLE public.ai_usage_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid REFERENCES public.customers(id),
  driver_id uuid REFERENCES public.drivers(id),
  admin_user_id uuid REFERENCES public.admin_users(id),
  feature_key text NOT NULL,
  model_used text,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  latency_ms integer,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for billing queries by customer and month
CREATE INDEX idx_ai_usage_customer_date ON public.ai_usage_logs (customer_id, created_at DESC);
CREATE INDEX idx_ai_usage_feature ON public.ai_usage_logs (feature_key, created_at DESC);

-- Enable RLS
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Platform owners see everything
CREATE POLICY "Platform owners view all usage"
ON public.ai_usage_logs FOR SELECT
USING (is_platform_owner());

-- Admins see their customer's usage
CREATE POLICY "Admins view customer usage"
ON public.ai_usage_logs FOR SELECT
USING (is_admin() AND customer_id = current_customer_id());

-- Edge functions can insert (service role)
CREATE POLICY "System inserts usage logs"
ON public.ai_usage_logs FOR INSERT
WITH CHECK (true);

-- Enable realtime for live dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_usage_logs;
