-- 1. Extend rentals with the single-day model columns
ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS rental_days integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS requested_rate integer,
  ADD COLUMN IF NOT EXISTS approved_rate integer,
  ADD COLUMN IF NOT EXISTS final_rate integer,
  ADD COLUMN IF NOT EXISTS approved_duration_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS final_duration_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS pickup_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_confirmed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS return_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_amount integer,
  ADD COLUMN IF NOT EXISTS payment_due_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'single_day_rentals'
  ) THEN
    UPDATE public.rentals SET rental_days = 1 WHERE rental_days <> 1;
    ALTER TABLE public.rentals
      ADD CONSTRAINT single_day_rentals CHECK (rental_days = 1);
  END IF;
END $$;

ALTER TABLE public.rentals DROP CONSTRAINT IF EXISTS rentals_status_check;
ALTER TABLE public.rentals
  ADD CONSTRAINT rentals_status_check CHECK (
    status IN ('pending', 'approved', 'paid', 'rejected',
               'active', 'completed', 'terminated', 'overdue_return')
  );

-- 2. Adjustment ledger
CREATE TABLE IF NOT EXISTS public.rental_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid NOT NULL REFERENCES public.rentals(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  adjustment_moment text NOT NULL
    CHECK (adjustment_moment IN ('approval', 'pickup')),
  field_changed text NOT NULL
    CHECK (field_changed IN ('rate', 'duration_hours')),
  old_value integer NOT NULL,
  new_value integer NOT NULL,
  reason text NOT NULL,
  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('applied', 'pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  reviewer_note text
);

CREATE INDEX IF NOT EXISTS idx_rental_adjustments_pending
  ON public.rental_adjustments(approval_status)
  WHERE approval_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_rental_adjustments_rental
  ON public.rental_adjustments(rental_id);

ALTER TABLE public.rental_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin manages adjustments" ON public.rental_adjustments;
CREATE POLICY "Super admin manages adjustments"
  ON public.rental_adjustments
  FOR ALL
  USING (public.has_admin_role('super_admin'))
  WITH CHECK (public.has_admin_role('super_admin'));

DROP POLICY IF EXISTS "Managers create adjustments" ON public.rental_adjustments;
CREATE POLICY "Managers create adjustments"
  ON public.rental_adjustments
  FOR INSERT
  WITH CHECK (public.has_admin_role_in(ARRAY['super_admin', 'manager']));

DROP POLICY IF EXISTS "Managers view adjustments" ON public.rental_adjustments;
CREATE POLICY "Managers view adjustments"
  ON public.rental_adjustments
  FOR SELECT
  USING (public.has_admin_role_in(ARRAY['super_admin', 'manager']));

-- 3. Classification function
CREATE OR REPLACE FUNCTION public.classify_adjustment(actor_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role text;
BEGIN
  SELECT role_key INTO actor_role
  FROM public.admin_users
  WHERE user_id = actor_id AND is_active = true;

  IF actor_role = 'super_admin' THEN RETURN 'applied'; END IF;
  IF actor_role = 'manager' THEN RETURN 'pending'; END IF;
  RETURN 'denied';
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_adjustment(uuid) TO authenticated;

-- 4. Extend score_events
ALTER TABLE public.score_events
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS rental_id uuid REFERENCES public.rentals(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'score_events_rental_event_unique'
  ) THEN
    ALTER TABLE public.score_events
      ADD CONSTRAINT score_events_rental_event_unique
      UNIQUE (rental_id, event_type);
  END IF;
END $$;

-- 5. Pending adjustments count helper
CREATE OR REPLACE FUNCTION public.pending_adjustments_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_admin_role('super_admin')
    THEN (SELECT COUNT(*)::integer FROM public.rental_adjustments WHERE approval_status = 'pending')
    ELSE 0
  END;
$$;

GRANT EXECUTE ON FUNCTION public.pending_adjustments_count() TO authenticated;

-- 6. Atomic apply-pending RPC
CREATE OR REPLACE FUNCTION public.apply_rental_adjustment(
  p_adjustment_id uuid,
  p_action text,
  p_reviewer_note text DEFAULT NULL
)
RETURNS public.rental_adjustments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_adj public.rental_adjustments;
  v_rental public.rentals;
BEGIN
  IF NOT public.has_admin_role('super_admin') THEN
    RAISE EXCEPTION 'forbidden: super_admin only' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid action: %', p_action;
  END IF;

  SELECT * INTO v_adj FROM public.rental_adjustments
    WHERE id = p_adjustment_id AND approval_status = 'pending'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'adjustment not found or not pending';
  END IF;

  IF p_action = 'reject' THEN
    UPDATE public.rental_adjustments
       SET approval_status = 'rejected',
           reviewed_by = v_user,
           reviewed_at = now(),
           reviewer_note = p_reviewer_note
     WHERE id = p_adjustment_id
     RETURNING * INTO v_adj;
    RETURN v_adj;
  END IF;

  SELECT * INTO v_rental FROM public.rentals
    WHERE id = v_adj.rental_id FOR UPDATE;

  IF v_adj.field_changed = 'rate' AND v_adj.adjustment_moment = 'approval' THEN
    UPDATE public.rentals
       SET approved_rate = v_adj.new_value,
           total_amount = v_adj.new_value * COALESCE(approved_duration_hours, 24) / 24
     WHERE id = v_adj.rental_id;
    UPDATE public.payments
       SET amount = (SELECT total_amount FROM public.rentals WHERE id = v_adj.rental_id)
     WHERE rental_id = v_adj.rental_id AND status = 'pending';

  ELSIF v_adj.field_changed = 'rate' AND v_adj.adjustment_moment = 'pickup' THEN
    UPDATE public.rentals SET final_rate = v_adj.new_value
      WHERE id = v_adj.rental_id;

  ELSIF v_adj.field_changed = 'duration_hours' AND v_adj.adjustment_moment = 'approval' THEN
    UPDATE public.rentals
       SET approved_duration_hours = v_adj.new_value,
           total_amount = COALESCE(approved_rate, requested_rate) * v_adj.new_value / 24
     WHERE id = v_adj.rental_id;
    UPDATE public.payments
       SET amount = (SELECT total_amount FROM public.rentals WHERE id = v_adj.rental_id)
     WHERE rental_id = v_adj.rental_id AND status = 'pending';

  ELSIF v_adj.field_changed = 'duration_hours' AND v_adj.adjustment_moment = 'pickup' THEN
    UPDATE public.rentals
       SET final_duration_hours = v_adj.new_value,
           return_due_at = pickup_confirmed_at + (v_adj.new_value || ' hours')::interval
     WHERE id = v_adj.rental_id;
  END IF;

  UPDATE public.rental_adjustments
     SET approval_status = 'approved',
         reviewed_by = v_user,
         reviewed_at = now(),
         reviewer_note = p_reviewer_note
   WHERE id = p_adjustment_id
   RETURNING * INTO v_adj;

  RETURN v_adj;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_rental_adjustment(uuid, text, text) TO authenticated;

-- 7. Backfill existing rentals
UPDATE public.rentals r
SET
  requested_rate = COALESCE(r.requested_rate, v.rent_per_day),
  approved_rate  = COALESCE(r.approved_rate,  v.rent_per_day),
  total_amount   = COALESCE(r.total_amount,   v.rent_per_day),
  approved_duration_hours = COALESCE(r.approved_duration_hours, 24),
  final_duration_hours    = COALESCE(r.final_duration_hours, 24)
FROM public.vehicles v
WHERE r.vehicle_id = v.id
  AND (r.requested_rate IS NULL OR r.approved_rate IS NULL OR r.total_amount IS NULL);