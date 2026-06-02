
-- 1. Add return_pending to rentals.status check
ALTER TABLE public.rentals DROP CONSTRAINT IF EXISTS rentals_status_check;
ALTER TABLE public.rentals ADD CONSTRAINT rentals_status_check
  CHECK (status = ANY (ARRAY['pending','approved','paid','rejected','active','completed','terminated','overdue_return','payment_overdue','vehicle_disabled','return_pending']));

-- 2. Vehicle blocking index includes return_pending and active operational states
DROP INDEX IF EXISTS public.idx_rentals_no_double_booking;
CREATE UNIQUE INDEX idx_rentals_no_double_booking
  ON public.rentals (vehicle_id)
  WHERE status = ANY (ARRAY['pending','approved','active','paid','overdue_return','payment_overdue','vehicle_disabled','return_pending']);

-- 3. Return audit fields + last fee change reason
ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS returned_by uuid,
  ADD COLUMN IF NOT EXISTS return_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_justification text,
  ADD COLUMN IF NOT EXISTS fee_change_reason text;

-- 4. Idempotent: at most one rental-kind invoice per rental
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_per_rental
  ON public.invoice (rental_id)
  WHERE invoice_kind = 'invoice' AND rental_id IS NOT NULL;

-- 5. driver_wallets
CREATE TABLE IF NOT EXISTS public.driver_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL UNIQUE REFERENCES public.drivers(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id),
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (balance >= 0)
);
ALTER TABLE public.driver_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage wallets" ON public.driver_wallets
  FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "drivers view own wallet" ON public.driver_wallets
  FOR SELECT TO public
  USING (driver_id = current_driver_id());

-- 6. driver_wallet_transactions (ledger)
CREATE TABLE IF NOT EXISTS public.driver_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id),
  rental_id uuid REFERENCES public.rentals(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoice(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['upfront_deposit','rental_invoice_applied','manual_adjustment','refund_or_credit'])),
  amount integer NOT NULL,  -- signed: positive credits, negative deducts
  balance_after integer NOT NULL,
  method text,
  reference text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dwt_driver ON public.driver_wallet_transactions(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dwt_rental ON public.driver_wallet_transactions(rental_id);

ALTER TABLE public.driver_wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage wallet txns" ON public.driver_wallet_transactions
  FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "drivers view own wallet txns" ON public.driver_wallet_transactions
  FOR SELECT TO public
  USING (driver_id = current_driver_id());

-- 7. Helper: apply wallet balance to a rental invoice (called inside RPCs only)
CREATE OR REPLACE FUNCTION public.apply_wallet_to_invoice(
  p_driver_id uuid, p_rental_id uuid, p_invoice_id uuid, p_payment_id uuid, p_amount_due integer
) RETURNS integer  -- returns amount applied
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_wallet public.driver_wallets;
  v_apply integer;
  v_new_balance integer;
BEGIN
  IF p_amount_due <= 0 THEN RETURN 0; END IF;

  SELECT * INTO v_wallet FROM public.driver_wallets WHERE driver_id = p_driver_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.balance <= 0 THEN RETURN 0; END IF;

  v_apply := LEAST(v_wallet.balance, p_amount_due);
  v_new_balance := v_wallet.balance - v_apply;

  UPDATE public.driver_wallets
    SET balance = v_new_balance, updated_at = now()
    WHERE driver_id = p_driver_id;

  INSERT INTO public.driver_wallet_transactions
    (driver_id, customer_id, rental_id, invoice_id, payment_id, type, amount, balance_after, note, created_by)
  VALUES (p_driver_id, v_wallet.customer_id, p_rental_id, p_invoice_id, p_payment_id,
          'rental_invoice_applied', -v_apply, v_new_balance,
          'Solde upfront appliqué à la location', auth.uid());

  -- If wallet covers full amount, mark payment paid (trigger flips invoice to paid)
  IF v_apply >= p_amount_due THEN
    UPDATE public.payments SET status = 'paid', paid_date = CURRENT_DATE, paid_at = now()
      WHERE id = p_payment_id AND status = 'pending';
  ELSE
    -- Reduce remaining payment amount
    UPDATE public.payments SET amount = p_amount_due - v_apply
      WHERE id = p_payment_id AND status = 'pending';
  END IF;

  RETURN v_apply;
END;
$$;

-- 8. Replace approve_and_activate_rental: now also issues invoice + applies wallet
CREATE OR REPLACE FUNCTION public.approve_and_activate_rental(p_rental_id uuid, p_rate integer)
RETURNS public.rentals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_rental public.rentals;
  v_pickup_at timestamptz := now();
  v_duration integer := 24;
  v_init_deadline timestamptz;
  v_final_deadline timestamptz;
  v_drv public.drivers;
  v_settings public.customer_billing_settings;
  v_invoice_id uuid;
  v_existing_invoice_id uuid;
  v_payment_id uuid;
  v_vat numeric(5,2) := 0;
  v_vat_amount integer := 0;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin','manager']) THEN
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
    approved_rate = p_rate,
    approved_duration_hours = v_duration,
    final_rate = p_rate,
    final_duration_hours = v_duration,
    total_amount = p_rate,
    approval_date = v_pickup_at,
    approved_by = (SELECT id FROM public.admin_users WHERE user_id = v_user LIMIT 1),
    pickup_confirmed_at = v_pickup_at,
    pickup_confirmed_by = v_user,
    return_due_at = v_pickup_at + (v_duration || ' hours')::interval,
    payment_due_at_initial = v_init_deadline,
    payment_due_at_final = v_final_deadline,
    payment_phase = 'not_due',
    status = 'active'
  WHERE id = p_rental_id
  RETURNING * INTO v_rental;

  -- Idempotent: skip invoice creation if one exists
  SELECT id INTO v_existing_invoice_id FROM public.invoice
    WHERE rental_id = p_rental_id AND invoice_kind = 'invoice' LIMIT 1;

  IF v_existing_invoice_id IS NULL THEN
    SELECT * INTO v_drv FROM public.drivers WHERE id = v_rental.driver_id;
    SELECT * INTO v_settings FROM public.customer_billing_settings WHERE customer_id = v_rental.customer_id;

    IF v_settings.vat_enabled THEN
      v_vat := v_settings.vat_rate;
      v_vat_amount := round(p_rate * v_vat / 100.0)::integer;
    END IF;

    INSERT INTO public.invoice (
      customer_id, driver_id, status, invoice_kind,
      driver_snapshot_name, driver_snapshot_phone,
      subtotal_ht, vat_amount, total_ttc,
      vat_rate_snapshot, vat_enabled_snapshot,
      legal_name_snapshot, legal_nif_snapshot, legal_rccm_snapshot,
      legal_address_snapshot, legal_footer_snapshot,
      rental_id
    ) VALUES (
      v_rental.customer_id, v_rental.driver_id, 'issued', 'invoice',
      v_drv.full_name, v_drv.phone_number,
      p_rate, v_vat_amount, p_rate + v_vat_amount,
      v_vat, COALESCE(v_settings.vat_enabled, false),
      v_settings.legal_name, v_settings.legal_nif, v_settings.legal_rccm,
      v_settings.legal_address, v_settings.legal_footer,
      p_rental_id
    ) RETURNING id INTO v_invoice_id;

    INSERT INTO public.invoice_line (
      invoice_id, customer_id, position, designation, quantity,
      unit_price, line_total_ht, vat_rate, line_vat, line_total_ttc
    ) VALUES (
      v_invoice_id, v_rental.customer_id, 1, 'Location véhicule', 1,
      p_rate, p_rate, v_vat, v_vat_amount, p_rate + v_vat_amount
    );

    INSERT INTO public.payments (driver_id, rental_id, amount, payment_type, due_date, status, customer_id)
    VALUES (v_rental.driver_id, p_rental_id, p_rate + v_vat_amount, 'rental', v_init_deadline::date, 'pending', v_rental.customer_id)
    RETURNING id INTO v_payment_id;

    INSERT INTO public.invoice_payment_link (invoice_id, payment_id, customer_id)
    VALUES (v_invoice_id, v_payment_id, v_rental.customer_id);

    -- Apply upfront wallet balance
    PERFORM public.apply_wallet_to_invoice(v_rental.driver_id, p_rental_id, v_invoice_id, v_payment_id, p_rate + v_vat_amount);
  END IF;

  RETURN v_rental;
END;
$$;

-- 9. Confirm return
CREATE OR REPLACE FUNCTION public.confirm_rental_return(p_rental_id uuid, p_justification text DEFAULT NULL, p_direct boolean DEFAULT false)
RETURNS public.rentals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_rental public.rentals;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin','manager']) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rental FROM public.rentals WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'rental not found'; END IF;
  IF v_rental.status NOT IN ('active','approved','paid','overdue_return','payment_overdue','vehicle_disabled','return_pending') THEN
    RAISE EXCEPTION 'rental cannot be returned from status %', v_rental.status;
  END IF;

  IF p_direct AND (p_justification IS NULL OR length(trim(p_justification)) = 0) THEN
    RAISE EXCEPTION 'justification required for direct admin return';
  END IF;

  UPDATE public.rentals SET
    status = 'completed',
    returned_at = now(),
    return_confirmed_at = now(),
    returned_by = v_user,
    return_justification = NULLIF(trim(COALESCE(p_justification,'')), '')
  WHERE id = p_rental_id
  RETURNING * INTO v_rental;

  RETURN v_rental;
END;
$$;

-- 10. Update rental fee with audit + invoice/payment recompute
CREATE OR REPLACE FUNCTION public.update_rental_fee(p_rental_id uuid, p_new_rate integer, p_reason text)
RETURNS public.rentals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_rental public.rentals;
  v_invoice public.invoice;
  v_payment public.payments;
  v_vat numeric(5,2) := 0;
  v_vat_amount integer := 0;
  v_old_rate integer;
  v_delta integer;
  v_settings public.customer_billing_settings;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin','manager']) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_new_rate IS NULL OR p_new_rate <= 0 THEN
    RAISE EXCEPTION 'rate must be > 0';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  SELECT * INTO v_rental FROM public.rentals WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'rental not found'; END IF;

  v_old_rate := COALESCE(v_rental.final_rate, v_rental.approved_rate, 0);

  UPDATE public.rentals SET
    final_rate = p_new_rate,
    total_amount = p_new_rate,
    fee_change_reason = trim(p_reason)
  WHERE id = p_rental_id
  RETURNING * INTO v_rental;

  SELECT * INTO v_invoice FROM public.invoice
    WHERE rental_id = p_rental_id AND invoice_kind = 'invoice' LIMIT 1;

  IF v_invoice.id IS NOT NULL THEN
    SELECT * INTO v_settings FROM public.customer_billing_settings WHERE customer_id = v_invoice.customer_id;
    IF COALESCE(v_invoice.vat_enabled_snapshot, false) THEN
      v_vat := v_invoice.vat_rate_snapshot;
      v_vat_amount := round(p_new_rate * v_vat / 100.0)::integer;
    END IF;

    SELECT * INTO v_payment FROM public.payments
      WHERE id = (SELECT payment_id FROM public.invoice_payment_link WHERE invoice_id = v_invoice.id LIMIT 1)
      FOR UPDATE;

    IF v_invoice.status = 'paid' THEN
      v_delta := p_new_rate + v_vat_amount - v_invoice.total_ttc;
      IF v_delta > 0 THEN
        -- Create extra payment row for the delta
        INSERT INTO public.payments (driver_id, rental_id, amount, payment_type, due_date, status, customer_id)
        VALUES (v_rental.driver_id, p_rental_id, v_delta, 'rental', CURRENT_DATE + 1, 'pending', v_rental.customer_id);
      ELSIF v_delta < 0 THEN
        -- Refund credit to wallet
        INSERT INTO public.driver_wallets (driver_id, customer_id, balance)
          VALUES (v_rental.driver_id, v_rental.customer_id, -v_delta)
          ON CONFLICT (driver_id) DO UPDATE
            SET balance = public.driver_wallets.balance + (-v_delta), updated_at = now();
        INSERT INTO public.driver_wallet_transactions
          (driver_id, customer_id, rental_id, invoice_id, type, amount, balance_after, note, created_by)
        VALUES (v_rental.driver_id, v_rental.customer_id, p_rental_id, v_invoice.id,
                'refund_or_credit', -v_delta,
                (SELECT balance FROM public.driver_wallets WHERE driver_id = v_rental.driver_id),
                'Crédit suite à baisse de tarif: ' || trim(p_reason), v_user);
      END IF;
    ELSE
      -- Recompute invoice + payment amount
      UPDATE public.invoice SET
        subtotal_ht = p_new_rate, vat_amount = v_vat_amount, total_ttc = p_new_rate + v_vat_amount,
        updated_at = now()
      WHERE id = v_invoice.id;

      UPDATE public.invoice_line SET
        unit_price = p_new_rate, line_total_ht = p_new_rate,
        line_vat = v_vat_amount, line_total_ttc = p_new_rate + v_vat_amount
      WHERE invoice_id = v_invoice.id;

      IF v_payment.id IS NOT NULL AND v_payment.status = 'pending' THEN
        UPDATE public.payments SET amount = p_new_rate + v_vat_amount WHERE id = v_payment.id;
      END IF;
    END IF;

    INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
    VALUES (v_invoice.id, v_invoice.customer_id, 'fee_changed', v_user, 'admin',
            jsonb_build_object('old_rate', v_old_rate, 'new_rate', p_new_rate, 'reason', trim(p_reason)));
  END IF;

  RETURN v_rental;
END;
$$;

-- 11. Record driver upfront deposit
CREATE OR REPLACE FUNCTION public.record_driver_deposit(p_driver_id uuid, p_amount integer, p_method text, p_reference text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS public.driver_wallet_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_drv public.drivers;
  v_new_balance integer;
  v_txn public.driver_wallet_transactions;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin','manager']) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'amount must be > 0'; END IF;
  IF p_method IS NULL OR length(trim(p_method)) = 0 THEN RAISE EXCEPTION 'method required'; END IF;

  SELECT * INTO v_drv FROM public.drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'driver not found'; END IF;

  INSERT INTO public.driver_wallets (driver_id, customer_id, balance)
  VALUES (p_driver_id, v_drv.customer_id, p_amount)
  ON CONFLICT (driver_id) DO UPDATE
    SET balance = public.driver_wallets.balance + p_amount, updated_at = now()
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.driver_wallet_transactions
    (driver_id, customer_id, type, amount, balance_after, method, reference, note, created_by)
  VALUES (p_driver_id, v_drv.customer_id, 'upfront_deposit', p_amount, v_new_balance,
          trim(p_method), NULLIF(trim(COALESCE(p_reference,'')),''), NULLIF(trim(COALESCE(p_note,'')),''), v_user)
  RETURNING * INTO v_txn;

  RETURN v_txn;
END;
$$;
