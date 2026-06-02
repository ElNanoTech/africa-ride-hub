-- Simplified rental approval: admin approves WITH rate -> rental becomes active immediately,
-- payment row is created in one step. Replaces the 2-step "approve then confirm pickup" flow.

CREATE OR REPLACE FUNCTION public.approve_and_activate_rental(
  p_rental_id uuid,
  p_rate      integer
)
RETURNS public.rentals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user           uuid := auth.uid();
  v_rental         public.rentals;
  v_pickup_at      timestamptz := now();
  v_duration       integer := 24;
  v_init_deadline  timestamptz;
  v_final_deadline timestamptz;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin', 'manager']) THEN
    RAISE EXCEPTION 'forbidden: super_admin or manager required' USING ERRCODE = '42501';
  END IF;

  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'rate must be greater than 0';
  END IF;

  SELECT * INTO v_rental FROM public.rentals WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'rental not found'; END IF;
  IF v_rental.status <> 'pending' THEN
    RAISE EXCEPTION 'rental is not pending (current status: %)', v_rental.status;
  END IF;

  v_init_deadline  := public.abidjan_noon_after(v_pickup_at, 1);
  v_final_deadline := public.abidjan_noon_after(v_pickup_at, 2);

  UPDATE public.rentals SET
    approved_rate           = p_rate,
    approved_duration_hours = v_duration,
    final_rate              = p_rate,
    final_duration_hours    = v_duration,
    total_amount            = p_rate,
    approval_date           = v_pickup_at,
    approved_by             = (SELECT id FROM public.admin_users WHERE user_id = v_user LIMIT 1),
    pickup_confirmed_at     = v_pickup_at,
    pickup_confirmed_by     = v_user,
    return_due_at           = v_pickup_at + (v_duration || ' hours')::interval,
    payment_due_at_initial  = v_init_deadline,
    payment_due_at_final    = v_final_deadline,
    payment_phase           = 'not_due',
    status                  = 'active'
  WHERE id = p_rental_id
  RETURNING * INTO v_rental;

  -- Create payment row
  INSERT INTO public.payments (driver_id, rental_id, amount, payment_type, due_date, status)
  VALUES (v_rental.driver_id, p_rental_id, p_rate, 'rental', v_init_deadline::date, 'pending');

  -- Notify driver
  INSERT INTO public.notifications (driver_id, notification_type, title, message, template_id, variables, channel)
  VALUES (
    v_rental.driver_id,
    'rental_status',
    'Location approuvée',
    'Votre location a été approuvée. Tarif : ' || p_rate || ' FCFA. Paiement avant ' ||
      to_char(v_init_deadline AT TIME ZONE 'Africa/Abidjan', 'DD/MM HH24:MI') || '.',
    'rental_approved',
    jsonb_build_object('rental_id', v_rental.id, 'amount', p_rate, 'payment_due_at_initial', v_init_deadline),
    'in_app'
  );

  RETURN v_rental;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_and_activate_rental(uuid, integer) TO authenticated;