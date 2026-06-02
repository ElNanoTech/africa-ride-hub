-- 1. New rental columns for the two-deadline + phase model
ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS payment_due_at_initial timestamptz,
  ADD COLUMN IF NOT EXISTS payment_due_at_final   timestamptz,
  ADD COLUMN IF NOT EXISTS payment_phase          text
    CHECK (payment_phase IN ('not_due', 'due', 'grace', 'final_overdue', 'paid'))
    DEFAULT 'not_due',
  ADD COLUMN IF NOT EXISTS payment_settled_at     timestamptz;

UPDATE public.rentals
SET payment_due_at_initial = payment_due_at
WHERE payment_due_at_initial IS NULL AND payment_due_at IS NOT NULL;

ALTER TABLE public.rentals DROP CONSTRAINT IF EXISTS rentals_status_check;
ALTER TABLE public.rentals
  ADD CONSTRAINT rentals_status_check CHECK (
    status IN (
      'pending', 'approved', 'paid', 'rejected',
      'active', 'completed', 'terminated',
      'overdue_return',
      'payment_overdue',
      'vehicle_disabled'
    )
  );

CREATE INDEX IF NOT EXISTS idx_rentals_payment_phase_deadlines
  ON public.rentals(payment_phase, payment_due_at_initial, payment_due_at_final)
  WHERE payment_phase IN ('due', 'grace', 'not_due');

-- 2. Payments: paid_at
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- 3. Notifications upgrades
ALTER TABLE public.notifications
  ALTER COLUMN driver_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS channel           text,
  ADD COLUMN IF NOT EXISTS template_id       text,
  ADD COLUMN IF NOT EXISTS variables         jsonb,
  ADD COLUMN IF NOT EXISTS send_status       text DEFAULT 'pending'
    CHECK (send_status IN ('pending', 'sent', 'failed', 'skipped'));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_notification_type_check CHECK (
    notification_type IN (
      'score_update', 'payment_reminder', 'loan_status', 'rental_status',
      'safety_tip', 'announcement',
      'income_status', 'system',
      'payment_grace_started', 'payment_final_overdue',
      'rental_pickup_confirmed', 'vehicle_disabled',
      'kyc_approved', 'kyc_rejected',
      'accident_report_submitted', 'accident_report_closed'
    )
  );

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_recipient_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_recipient_check CHECK (
    driver_id IS NOT NULL OR recipient_user_id IS NOT NULL
  );

DROP POLICY IF EXISTS "Admins view own admin notifications" ON public.notifications;
CREATE POLICY "Admins view own admin notifications"
  ON public.notifications FOR SELECT
  USING (
    recipient_user_id = auth.uid()
    AND public.has_admin_role_in(ARRAY['super_admin', 'manager', 'agent_pret', 'agent_support'])
  );

-- 4. Timezone-aware noon helper
CREATE OR REPLACE FUNCTION public.abidjan_noon_after(
  base_ts       timestamptz,
  days_offset   integer DEFAULT 1
)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  abidjan_date date;
  local_noon   timestamp;
BEGIN
  abidjan_date := (base_ts AT TIME ZONE 'Africa/Abidjan')::date
                  + days_offset;
  local_noon   := abidjan_date + time '12:00:00';
  RETURN local_noon AT TIME ZONE 'Africa/Abidjan';
END;
$$;

GRANT EXECUTE ON FUNCTION public.abidjan_noon_after(timestamptz, integer) TO authenticated, service_role;

-- 5. Extend rental_adjustments check constraints
ALTER TABLE public.rental_adjustments
  DROP CONSTRAINT IF EXISTS rental_adjustments_adjustment_moment_check;
ALTER TABLE public.rental_adjustments
  ADD CONSTRAINT rental_adjustments_adjustment_moment_check CHECK (
    adjustment_moment IN ('approval', 'pickup', 'post_pickup_deadlines')
  );

ALTER TABLE public.rental_adjustments
  DROP CONSTRAINT IF EXISTS rental_adjustments_field_changed_check;
ALTER TABLE public.rental_adjustments
  ADD CONSTRAINT rental_adjustments_field_changed_check CHECK (
    field_changed IN (
      'rate', 'duration_hours',
      'return_due_at', 'payment_due_at_initial', 'payment_due_at_final'
    )
  );

-- 6. rental_amount_owed helper
CREATE OR REPLACE FUNCTION public.rental_amount_owed(p_rental_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN r.payment_phase IN ('grace', 'final_overdue') THEN
      COALESCE(r.final_rate, r.approved_rate, 0) * 2
    ELSE
      COALESCE(r.final_rate, r.approved_rate, 0)
  END
  FROM public.rentals r
  WHERE r.id = p_rental_id;
$$;

GRANT EXECUTE ON FUNCTION public.rental_amount_owed(uuid) TO authenticated, service_role;

-- 7. Default payment_phase
UPDATE public.rentals
SET payment_phase = 'not_due'
WHERE payment_phase IS NULL;