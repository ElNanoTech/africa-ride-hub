-- Structured investigation findings (admin-only)
CREATE TABLE IF NOT EXISTS public.accident_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_id uuid NOT NULL UNIQUE REFERENCES public.accidents(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  incident_category text,
  collision_type text,
  weather_conditions text,
  road_conditions text,
  root_cause text,
  corrective_action text,
  internal_findings text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accident_investigations_customer ON public.accident_investigations(customer_id);

ALTER TABLE public.accident_investigations ENABLE ROW LEVEL SECURITY;

-- Admin-only access (tenant-scoped or platform owner)
CREATE POLICY "Admins can view investigations"
  ON public.accident_investigations FOR SELECT
  USING (
    public.is_platform_owner()
    OR (public.is_admin() AND (customer_id IS NULL OR customer_id = public.current_customer_id()))
  );

CREATE POLICY "Admins can insert investigations"
  ON public.accident_investigations FOR INSERT
  WITH CHECK (
    public.is_platform_owner()
    OR (public.is_admin() AND (customer_id IS NULL OR customer_id = public.current_customer_id()))
  );

CREATE POLICY "Admins can update investigations"
  ON public.accident_investigations FOR UPDATE
  USING (
    public.is_platform_owner()
    OR (public.is_admin() AND (customer_id IS NULL OR customer_id = public.current_customer_id()))
  );

CREATE POLICY "Admins can delete investigations"
  ON public.accident_investigations FOR DELETE
  USING (
    public.is_platform_owner()
    OR (public.is_admin() AND (customer_id IS NULL OR customer_id = public.current_customer_id()))
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_accident_investigations_updated_at ON public.accident_investigations;
CREATE TRIGGER trg_accident_investigations_updated_at
  BEFORE UPDATE ON public.accident_investigations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();