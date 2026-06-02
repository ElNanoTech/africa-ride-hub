-- 1. approve_rental — post-paid (no payment row, no deadlines yet)
CREATE OR REPLACE FUNCTION public.approve_rental(
  p_rental_id          uuid,
  p_new_rate           integer DEFAULT NULL,
  p_new_duration_hours integer DEFAULT NULL,
  p_reason             text    DEFAULT NULL
)
RETURNS public.rentals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user             uuid := auth.uid();
  v_classification   text;
  v_rental           public.rentals;
  v_rate_changed     boolean;
  v_duration_changed boolean;
  v_effective_rate   integer;
  v_effective_dur    integer;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin', 'manager']) THEN
    RAISE EXCEPTION 'forbidden: super_admin or manager required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rental FROM public.rentals WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'rental not found'; END IF;
  IF v_rental.status <> 'pending' THEN
    RAISE EXCEPTION 'rental is not pending (current status: %)', v_rental.status;
  END IF;

  v_rate_changed     := p_new_rate IS NOT NULL AND p_new_rate <> COALESCE(v_rental.requested_rate, 0);
  v_duration_changed := p_new_duration_hours IS NOT NULL AND p_new_duration_hours <> COALESCE(v_rental.approved_duration_hours, 24);

  IF (v_rate_changed OR v_duration_changed) AND (p_reason IS NULL OR length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'reason required when adjusting rate or duration';
  END IF;

  v_classification := public.classify_adjustment(v_user);

  IF v_rate_changed THEN
    IF v_classification = 'denied' THEN RAISE EXCEPTION 'role not allowed to adjust rate'; END IF;
    INSERT INTO public.rental_adjustments (rental_id, requested_by, adjustment_moment, field_changed, old_value, new_value, reason, approval_status)
    VALUES (p_rental_id, v_user, 'approval', 'rate', v_rental.requested_rate, p_new_rate, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END);
  END IF;

  IF v_duration_changed THEN
    IF v_classification = 'denied' THEN RAISE EXCEPTION 'role not allowed to adjust duration'; END IF;
    INSERT INTO public.rental_adjustments (rental_id, requested_by, adjustment_moment, field_changed, old_value, new_value, reason, approval_status)
    VALUES (p_rental_id, v_user, 'approval', 'duration_hours', COALESCE(v_rental.approved_duration_hours, 24), p_new_duration_hours, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END);
  END IF;

  IF v_classification = 'applied' THEN
    v_effective_rate := COALESCE(p_new_rate, v_rental.requested_rate);
    v_effective_dur  := COALESCE(p_new_duration_hours, v_rental.approved_duration_hours, 24);
  ELSE
    v_effective_rate := v_rental.requested_rate;
    v_effective_dur  := COALESCE(v_rental.approved_duration_hours, 24);
  END IF;

  UPDATE public.rentals SET
    approved_rate = v_effective_rate,
    approved_duration_hours = v_effective_dur,
    total_amount = v_effective_rate * v_effective_dur / 24,
    status = 'approved',
    approval_date = now()
  WHERE id = p_rental_id RETURNING * INTO v_rental;

  RETURN v_rental;
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_rental(uuid, integer, integer, text) TO authenticated;

-- 2. confirm_rental_pickup — creates payment row
CREATE OR REPLACE FUNCTION public.confirm_rental_pickup(
  p_rental_id                  uuid,
  p_pickup_at                  timestamptz,
  p_new_rate                   integer     DEFAULT NULL,
  p_new_duration_hours         integer     DEFAULT NULL,
  p_reason                     text        DEFAULT NULL,
  p_override_initial_deadline  timestamptz DEFAULT NULL,
  p_override_final_deadline    timestamptz DEFAULT NULL
)
RETURNS public.rentals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid(); v_classification text; v_rental public.rentals;
  v_rate_changed boolean; v_duration_changed boolean;
  v_init_changed boolean; v_final_changed boolean;
  v_effective_rate integer; v_effective_dur integer;
  v_init_deadline timestamptz; v_final_deadline timestamptz;
  v_default_init timestamptz; v_default_final timestamptz;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin', 'manager']) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rental FROM public.rentals WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'rental not found'; END IF;
  IF v_rental.status <> 'approved' THEN
    RAISE EXCEPTION 'rental must be approved before pickup (current status: %)', v_rental.status;
  END IF;

  v_default_init  := public.abidjan_noon_after(p_pickup_at, 1);
  v_default_final := public.abidjan_noon_after(p_pickup_at, 2);

  v_rate_changed     := p_new_rate IS NOT NULL AND p_new_rate <> COALESCE(v_rental.approved_rate, 0);
  v_duration_changed := p_new_duration_hours IS NOT NULL AND p_new_duration_hours <> COALESCE(v_rental.approved_duration_hours, 24);
  v_init_changed     := p_override_initial_deadline IS NOT NULL AND p_override_initial_deadline <> v_default_init;
  v_final_changed    := p_override_final_deadline IS NOT NULL AND p_override_final_deadline <> v_default_final;

  IF (v_rate_changed OR v_duration_changed OR v_init_changed OR v_final_changed)
     AND (p_reason IS NULL OR length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'reason required when adjusting at pickup';
  END IF;

  v_classification := public.classify_adjustment(v_user);

  IF v_rate_changed THEN
    IF v_classification = 'denied' THEN RAISE EXCEPTION 'role not allowed to adjust rate'; END IF;
    INSERT INTO public.rental_adjustments (rental_id, requested_by, adjustment_moment, field_changed, old_value, new_value, reason, approval_status)
    VALUES (p_rental_id, v_user, 'pickup', 'rate', COALESCE(v_rental.approved_rate, 0), p_new_rate, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END);
  END IF;

  IF v_duration_changed THEN
    IF v_classification = 'denied' THEN RAISE EXCEPTION 'role not allowed to adjust duration'; END IF;
    INSERT INTO public.rental_adjustments (rental_id, requested_by, adjustment_moment, field_changed, old_value, new_value, reason, approval_status)
    VALUES (p_rental_id, v_user, 'pickup', 'duration_hours', COALESCE(v_rental.approved_duration_hours, 24), p_new_duration_hours, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END);
  END IF;

  IF v_init_changed THEN
    IF v_classification = 'denied' THEN RAISE EXCEPTION 'role not allowed to adjust deadlines'; END IF;
    INSERT INTO public.rental_adjustments (rental_id, requested_by, adjustment_moment, field_changed, old_value, new_value, reason, approval_status)
    VALUES (p_rental_id, v_user, 'pickup', 'payment_due_at_initial',
      EXTRACT(EPOCH FROM v_default_init)::integer, EXTRACT(EPOCH FROM p_override_initial_deadline)::integer, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END);
  END IF;

  IF v_final_changed THEN
    IF v_classification = 'denied' THEN RAISE EXCEPTION 'role not allowed to adjust deadlines'; END IF;
    INSERT INTO public.rental_adjustments (rental_id, requested_by, adjustment_moment, field_changed, old_value, new_value, reason, approval_status)
    VALUES (p_rental_id, v_user, 'pickup', 'payment_due_at_final',
      EXTRACT(EPOCH FROM v_default_final)::integer, EXTRACT(EPOCH FROM p_override_final_deadline)::integer, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END);
  END IF;

  IF v_classification = 'applied' THEN
    v_effective_rate := COALESCE(p_new_rate, v_rental.approved_rate);
    v_effective_dur  := COALESCE(p_new_duration_hours, v_rental.approved_duration_hours, 24);
    v_init_deadline  := COALESCE(p_override_initial_deadline, v_default_init);
    v_final_deadline := COALESCE(p_override_final_deadline, v_default_final);
  ELSE
    v_effective_rate := v_rental.approved_rate;
    v_effective_dur  := COALESCE(v_rental.approved_duration_hours, 24);
    v_init_deadline  := v_default_init;
    v_final_deadline := v_default_final;
  END IF;

  UPDATE public.rentals SET
    pickup_confirmed_at = p_pickup_at, pickup_confirmed_by = v_user,
    final_rate = v_effective_rate, final_duration_hours = v_effective_dur,
    return_due_at = p_pickup_at + (v_effective_dur || ' hours')::interval,
    payment_due_at_initial = v_init_deadline, payment_due_at_final = v_final_deadline,
    payment_phase = 'not_due', status = 'active'
  WHERE id = p_rental_id RETURNING * INTO v_rental;

  INSERT INTO public.payments (driver_id, rental_id, amount, payment_type, due_date, status)
  VALUES (v_rental.driver_id, p_rental_id, v_effective_rate, 'rental', v_init_deadline::date, 'pending');

  INSERT INTO public.notifications (driver_id, notification_type, title, message, template_id, variables, channel)
  VALUES (v_rental.driver_id, 'rental_pickup_confirmed', 'Récupération confirmée',
    'Retour avant ' || to_char(v_rental.return_due_at AT TIME ZONE 'Africa/Abidjan', 'DD/MM/YYYY HH24:MI') ||
    '. Paiement de ' || v_effective_rate || ' FCFA avant ' ||
    to_char(v_init_deadline AT TIME ZONE 'Africa/Abidjan', 'DD/MM HH24:MI') || '.',
    'rental_pickup_confirmed',
    jsonb_build_object('rental_id', v_rental.id, 'return_due_at', v_rental.return_due_at, 'amount', v_effective_rate, 'payment_due_at_initial', v_init_deadline),
    'in_app');

  RETURN v_rental;
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_rental_pickup(uuid, timestamptz, integer, integer, text, timestamptz, timestamptz) TO authenticated;

-- 3. settle_rental_payment
CREATE OR REPLACE FUNCTION public.settle_rental_payment(
  p_rental_id uuid, p_payment_method text, p_amount integer
)
RETURNS public.rentals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rental public.rentals; v_owed integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_admin_role_in(ARRAY['super_admin', 'manager']) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rental FROM public.rentals WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'rental not found'; END IF;

  v_owed := public.rental_amount_owed(p_rental_id);
  IF p_amount < v_owed THEN
    RAISE EXCEPTION 'insufficient amount. Expected %, received %', v_owed, p_amount;
  END IF;

  UPDATE public.rentals SET
    payment_phase = 'paid', payment_settled_at = now(),
    status = CASE WHEN status = 'payment_overdue' THEN 'active' ELSE status END
  WHERE id = p_rental_id RETURNING * INTO v_rental;

  UPDATE public.payments
  SET status = 'paid', amount = p_amount, paid_at = now(), paid_date = CURRENT_DATE,
      wave_transaction_id = COALESCE(wave_transaction_id, p_payment_method)
  WHERE rental_id = p_rental_id AND status IN ('pending', 'overdue');

  RETURN v_rental;
END;
$$;
GRANT EXECUTE ON FUNCTION public.settle_rental_payment(uuid, text, integer) TO authenticated, service_role;

-- 4. adjust_rental_deadlines
CREATE OR REPLACE FUNCTION public.adjust_rental_deadlines(
  p_rental_id uuid,
  p_new_return_due_at timestamptz DEFAULT NULL,
  p_new_init_deadline timestamptz DEFAULT NULL,
  p_new_final_deadline timestamptz DEFAULT NULL,
  p_new_rate integer DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS public.rentals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid(); v_classification text;
  v_rental public.rentals; v_changed_any boolean := FALSE;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin', 'manager']) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  SELECT * INTO v_rental FROM public.rentals WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'rental not found'; END IF;
  IF v_rental.status NOT IN ('active', 'payment_overdue') THEN
    RAISE EXCEPTION 'rental must be active to adjust deadlines (current status: %)', v_rental.status;
  END IF;

  v_classification := public.classify_adjustment(v_user);
  IF v_classification = 'denied' THEN RAISE EXCEPTION 'role not allowed'; END IF;

  IF p_new_return_due_at IS NOT NULL AND p_new_return_due_at <> v_rental.return_due_at THEN
    INSERT INTO public.rental_adjustments (rental_id, requested_by, adjustment_moment, field_changed, old_value, new_value, reason, approval_status)
    VALUES (p_rental_id, v_user, 'post_pickup_deadlines', 'return_due_at',
      EXTRACT(EPOCH FROM v_rental.return_due_at)::integer, EXTRACT(EPOCH FROM p_new_return_due_at)::integer, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END);
    v_changed_any := TRUE;
  END IF;

  IF p_new_init_deadline IS NOT NULL AND p_new_init_deadline <> v_rental.payment_due_at_initial THEN
    INSERT INTO public.rental_adjustments (rental_id, requested_by, adjustment_moment, field_changed, old_value, new_value, reason, approval_status)
    VALUES (p_rental_id, v_user, 'post_pickup_deadlines', 'payment_due_at_initial',
      EXTRACT(EPOCH FROM v_rental.payment_due_at_initial)::integer, EXTRACT(EPOCH FROM p_new_init_deadline)::integer, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END);
    v_changed_any := TRUE;
  END IF;

  IF p_new_final_deadline IS NOT NULL AND p_new_final_deadline <> v_rental.payment_due_at_final THEN
    INSERT INTO public.rental_adjustments (rental_id, requested_by, adjustment_moment, field_changed, old_value, new_value, reason, approval_status)
    VALUES (p_rental_id, v_user, 'post_pickup_deadlines', 'payment_due_at_final',
      EXTRACT(EPOCH FROM v_rental.payment_due_at_final)::integer, EXTRACT(EPOCH FROM p_new_final_deadline)::integer, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END);
    v_changed_any := TRUE;
  END IF;

  IF p_new_rate IS NOT NULL AND p_new_rate <> COALESCE(v_rental.final_rate, 0) THEN
    INSERT INTO public.rental_adjustments (rental_id, requested_by, adjustment_moment, field_changed, old_value, new_value, reason, approval_status)
    VALUES (p_rental_id, v_user, 'post_pickup_deadlines', 'rate',
      COALESCE(v_rental.final_rate, 0), p_new_rate, p_reason,
      CASE WHEN v_classification = 'applied' THEN 'applied' ELSE 'pending' END);
    v_changed_any := TRUE;
  END IF;

  IF NOT v_changed_any THEN RAISE EXCEPTION 'no changes provided'; END IF;

  IF v_classification = 'applied' THEN
    UPDATE public.rentals SET
      return_due_at = COALESCE(p_new_return_due_at, return_due_at),
      payment_due_at_initial = COALESCE(p_new_init_deadline, payment_due_at_initial),
      payment_due_at_final = COALESCE(p_new_final_deadline, payment_due_at_final),
      final_rate = COALESCE(p_new_rate, final_rate)
    WHERE id = p_rental_id RETURNING * INTO v_rental;

    IF p_new_rate IS NOT NULL THEN
      UPDATE public.payments
      SET amount = public.rental_amount_owed(p_rental_id),
          due_date = COALESCE(v_rental.payment_due_at_initial, due_date)::date
      WHERE rental_id = p_rental_id AND status IN ('pending', 'overdue');
    ELSIF p_new_init_deadline IS NOT NULL THEN
      UPDATE public.payments SET due_date = p_new_init_deadline::date
      WHERE rental_id = p_rental_id AND status IN ('pending', 'overdue');
    END IF;
  END IF;

  RETURN v_rental;
END;
$$;
GRANT EXECUTE ON FUNCTION public.adjust_rental_deadlines(uuid, timestamptz, timestamptz, timestamptz, integer, text) TO authenticated;

-- 5. disable_rental_vehicle
CREATE OR REPLACE FUNCTION public.disable_rental_vehicle(
  p_rental_id uuid, p_reason text
)
RETURNS public.rentals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_rental public.rentals;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin', 'manager']) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  UPDATE public.rentals SET status = 'vehicle_disabled'
  WHERE id = p_rental_id AND status IN ('payment_overdue', 'overdue_return')
  RETURNING * INTO v_rental;

  IF NOT FOUND THEN RAISE EXCEPTION 'rental not in a disable-eligible state'; END IF;

  INSERT INTO public.notifications (driver_id, notification_type, title, message, template_id, variables, channel)
  VALUES (v_rental.driver_id, 'vehicle_disabled', 'Véhicule désactivé',
    'Votre véhicule a été désactivé suite à des paiements non réglés. Contactez le support.',
    'vehicle_disabled', jsonb_build_object('rental_id', v_rental.id, 'reason', p_reason), 'in_app');

  RETURN v_rental;
END;
$$;
GRANT EXECUTE ON FUNCTION public.disable_rental_vehicle(uuid, text) TO authenticated;