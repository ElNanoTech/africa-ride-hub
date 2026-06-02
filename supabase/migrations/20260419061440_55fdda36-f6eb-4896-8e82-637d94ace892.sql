-- 1. Approve a pending rental
CREATE OR REPLACE FUNCTION public.approve_rental(
  p_rental_id uuid,
  p_new_rate integer DEFAULT NULL,
  p_new_duration_hours integer DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS public.rentals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_classification text;
  v_rental public.rentals;
  v_rate_changed boolean;
  v_duration_changed boolean;
  v_effective_rate integer;
  v_effective_duration integer;
  v_total integer;
  v_payment_due_at timestamptz;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin', 'manager']) THEN
    RAISE EXCEPTION 'forbidden: super_admin or manager required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rental FROM public.rentals
    WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rental not found';
  END IF;
  IF v_rental.status <> 'pending' THEN
    RAISE EXCEPTION 'rental is not pending (current status: %)', v_rental.status;
  END IF;

  v_rate_changed     := p_new_rate IS NOT NULL
                        AND p_new_rate <> COALESCE(v_rental.requested_rate, 0);
  v_duration_changed := p_new_duration_hours IS NOT NULL
                        AND p_new_duration_hours <> COALESCE(v_rental.approved_duration_hours, 24);

  IF (v_rate_changed OR v_duration_changed)
     AND (p_reason IS NULL OR length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'reason required when adjusting rate or duration';
  END IF;

  v_classification := public.classify_adjustment(v_user);

  IF v_rate_changed THEN
    IF v_classification = 'denied' THEN
      RAISE EXCEPTION 'role not allowed to adjust rate';
    END IF;
    INSERT INTO public.rental_adjustments (
      rental_id, requested_by, adjustment_moment, field_changed,
      old_value, new_value, reason, approval_status
    ) VALUES (
      p_rental_id, v_user, 'approval', 'rate',
      v_rental.requested_rate, p_new_rate, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END
    );
  END IF;

  IF v_duration_changed THEN
    IF v_classification = 'denied' THEN
      RAISE EXCEPTION 'role not allowed to adjust duration';
    END IF;
    INSERT INTO public.rental_adjustments (
      rental_id, requested_by, adjustment_moment, field_changed,
      old_value, new_value, reason, approval_status
    ) VALUES (
      p_rental_id, v_user, 'approval', 'duration_hours',
      COALESCE(v_rental.approved_duration_hours, 24), p_new_duration_hours, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END
    );
  END IF;

  IF v_classification = 'applied' THEN
    v_effective_rate     := COALESCE(p_new_rate, v_rental.requested_rate);
    v_effective_duration := COALESCE(p_new_duration_hours, v_rental.approved_duration_hours, 24);
  ELSE
    v_effective_rate     := v_rental.requested_rate;
    v_effective_duration := COALESCE(v_rental.approved_duration_hours, 24);
  END IF;

  v_total := v_effective_rate * v_effective_duration / 24;
  v_payment_due_at := now() + interval '48 hours';

  UPDATE public.rentals SET
    approved_rate           = v_effective_rate,
    approved_duration_hours = v_effective_duration,
    total_amount            = v_total,
    status                  = 'approved',
    approval_date           = now(),
    payment_due_at          = v_payment_due_at
  WHERE id = p_rental_id
  RETURNING * INTO v_rental;

  INSERT INTO public.payments (
    driver_id, rental_id, amount, payment_type, due_date, status
  ) VALUES (
    v_rental.driver_id, p_rental_id, v_total, 'rental',
    v_payment_due_at::date, 'pending'
  );

  RETURN v_rental;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_rental(uuid, integer, integer, text) TO authenticated;

-- 2. Reject a pending rental
CREATE OR REPLACE FUNCTION public.reject_rental(
  p_rental_id uuid,
  p_reason text
)
RETURNS public.rentals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rental public.rentals;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin', 'manager']) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'rejection reason required';
  END IF;

  UPDATE public.rentals SET
    status = 'rejected',
    rejection_reason = p_reason
  WHERE id = p_rental_id AND status = 'pending'
  RETURNING * INTO v_rental;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rental not found or not pending';
  END IF;

  RETURN v_rental;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_rental(uuid, text) TO authenticated;

-- 3. Confirm pickup
CREATE OR REPLACE FUNCTION public.confirm_rental_pickup(
  p_rental_id uuid,
  p_pickup_at timestamptz,
  p_new_rate integer DEFAULT NULL,
  p_new_duration_hours integer DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS public.rentals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_classification text;
  v_rental public.rentals;
  v_rate_changed boolean;
  v_duration_changed boolean;
  v_effective_rate integer;
  v_effective_duration integer;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin', 'manager']) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rental FROM public.rentals
    WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rental not found';
  END IF;
  IF v_rental.status <> 'paid' THEN
    RAISE EXCEPTION 'rental must be paid before pickup (current status: %)', v_rental.status;
  END IF;

  v_rate_changed     := p_new_rate IS NOT NULL
                        AND p_new_rate <> COALESCE(v_rental.approved_rate, 0);
  v_duration_changed := p_new_duration_hours IS NOT NULL
                        AND p_new_duration_hours <> COALESCE(v_rental.approved_duration_hours, 24);

  IF (v_rate_changed OR v_duration_changed)
     AND (p_reason IS NULL OR length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'reason required when adjusting rate or duration at pickup';
  END IF;

  v_classification := public.classify_adjustment(v_user);

  IF v_rate_changed THEN
    IF v_classification = 'denied' THEN
      RAISE EXCEPTION 'role not allowed to adjust rate';
    END IF;
    INSERT INTO public.rental_adjustments (
      rental_id, requested_by, adjustment_moment, field_changed,
      old_value, new_value, reason, approval_status
    ) VALUES (
      p_rental_id, v_user, 'pickup', 'rate',
      COALESCE(v_rental.approved_rate, 0), p_new_rate, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END
    );
  END IF;

  IF v_duration_changed THEN
    IF v_classification = 'denied' THEN
      RAISE EXCEPTION 'role not allowed to adjust duration';
    END IF;
    INSERT INTO public.rental_adjustments (
      rental_id, requested_by, adjustment_moment, field_changed,
      old_value, new_value, reason, approval_status
    ) VALUES (
      p_rental_id, v_user, 'pickup', 'duration_hours',
      COALESCE(v_rental.approved_duration_hours, 24), p_new_duration_hours, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END
    );
  END IF;

  IF v_classification = 'applied' THEN
    v_effective_rate     := COALESCE(p_new_rate, v_rental.approved_rate);
    v_effective_duration := COALESCE(p_new_duration_hours, v_rental.approved_duration_hours, 24);
  ELSE
    v_effective_rate     := v_rental.approved_rate;
    v_effective_duration := COALESCE(v_rental.approved_duration_hours, 24);
  END IF;

  UPDATE public.rentals SET
    pickup_confirmed_at  = p_pickup_at,
    pickup_confirmed_by  = v_user,
    final_rate           = v_effective_rate,
    final_duration_hours = v_effective_duration,
    return_due_at        = p_pickup_at + (v_effective_duration || ' hours')::interval,
    status               = 'active'
  WHERE id = p_rental_id
  RETURNING * INTO v_rental;

  RETURN v_rental;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_rental_pickup(uuid, timestamptz, integer, integer, text) TO authenticated;

-- 4. Driver returns the vehicle
CREATE OR REPLACE FUNCTION public.return_rental(
  p_rental_id uuid
)
RETURNS public.rentals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_rental public.rentals;
BEGIN
  SELECT * INTO v_rental FROM public.rentals
    WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rental not found';
  END IF;
  IF v_rental.status NOT IN ('active', 'overdue_return') THEN
    RAISE EXCEPTION 'rental is not active (current status: %)', v_rental.status;
  END IF;

  IF NOT (
    public.has_admin_role_in(ARRAY['super_admin', 'manager']) OR
    v_rental.driver_id = public.get_driver_id(v_user)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.rentals SET
    status = 'completed',
    returned_at = now(),
    end_date = now()::date
  WHERE id = p_rental_id
  RETURNING * INTO v_rental;

  RETURN v_rental;
END;
$$;

GRANT EXECUTE ON FUNCTION public.return_rental(uuid) TO authenticated;

-- 5. Mark rental as paid
CREATE OR REPLACE FUNCTION public.mark_rental_paid(
  p_rental_id uuid
)
RETURNS public.rentals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rental public.rentals;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_admin_role_in(ARRAY['super_admin', 'manager']) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.rentals SET status = 'paid'
  WHERE id = p_rental_id AND status = 'approved'
  RETURNING * INTO v_rental;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rental not found or not in approved state';
  END IF;

  RETURN v_rental;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_rental_paid(uuid) TO authenticated, service_role;