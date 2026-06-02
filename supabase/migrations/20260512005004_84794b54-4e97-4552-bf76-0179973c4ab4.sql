
-- Fix update_rental_fee: propagate to partial payments, recompute status, balance wallet.
CREATE OR REPLACE FUNCTION public.update_rental_fee(p_rental_id uuid, p_new_rate integer, p_reason text)
RETURNS public.rentals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_admin_id uuid;
  v_rental public.rentals;
  v_invoice public.invoice;
  v_payment public.payments;
  v_vat numeric(5,2) := 0;
  v_vat_amount integer := 0;
  v_old_rate integer;
  v_delta integer;
  v_new_total integer;
  v_amount_paid integer;
  v_old_amount integer;
  v_prior_overage integer;
  v_new_overage integer;
  v_wallet_delta integer;
  v_balance_after integer;
  v_new_status text;
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

  SELECT id INTO v_admin_id FROM public.admin_users WHERE user_id = v_user LIMIT 1;

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
    IF COALESCE(v_invoice.vat_enabled_snapshot, false) THEN
      v_vat := v_invoice.vat_rate_snapshot;
      v_vat_amount := round(p_new_rate * v_vat / 100.0)::integer;
    END IF;
    v_new_total := p_new_rate + v_vat_amount;

    SELECT * INTO v_payment FROM public.payments
      WHERE id = (SELECT payment_id FROM public.invoice_payment_link WHERE invoice_id = v_invoice.id LIMIT 1)
      FOR UPDATE;

    IF v_invoice.status = 'paid' THEN
      -- Frozen invoice: keep original snapshot, settle delta via new payment or wallet refund.
      v_delta := v_new_total - v_invoice.total_ttc;
      IF v_delta > 0 THEN
        INSERT INTO public.payments (driver_id, rental_id, amount, payment_type, due_date, status, customer_id)
        VALUES (v_rental.driver_id, p_rental_id, v_delta, 'rental', CURRENT_DATE + 1, 'pending', v_rental.customer_id);
      ELSIF v_delta < 0 THEN
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
      -- Open invoice: recompute totals + payment + status against existing receipts.
      UPDATE public.invoice SET
        subtotal_ht = p_new_rate, vat_amount = v_vat_amount, total_ttc = v_new_total,
        updated_at = now()
      WHERE id = v_invoice.id;

      UPDATE public.invoice_line SET
        unit_price = p_new_rate, line_total_ht = p_new_rate,
        line_vat = v_vat_amount, line_total_ttc = v_new_total
      WHERE invoice_id = v_invoice.id;

      IF v_payment.id IS NOT NULL AND v_payment.status IN ('pending','partial','overpaid','overdue','late') THEN
        v_amount_paid := COALESCE(v_payment.amount_paid, 0);
        v_old_amount := v_payment.amount;

        IF v_amount_paid <= 0 THEN
          v_new_status := 'pending';
        ELSIF v_amount_paid < v_new_total THEN
          v_new_status := 'partial';
        ELSIF v_amount_paid = v_new_total THEN
          v_new_status := 'paid';
        ELSE
          v_new_status := 'overpaid';
        END IF;

        UPDATE public.payments
        SET amount = v_new_total,
            status = v_new_status,
            paid_at  = CASE WHEN v_new_status IN ('paid','overpaid') AND paid_at  IS NULL THEN now()         ELSE paid_at  END,
            paid_date= CASE WHEN v_new_status IN ('paid','overpaid') AND paid_date IS NULL THEN CURRENT_DATE ELSE paid_date END
        WHERE id = v_payment.id;

        -- Wallet rebalancing for overage swing introduced by tariff change.
        v_prior_overage := GREATEST(0, v_amount_paid - v_old_amount);
        v_new_overage   := GREATEST(0, v_amount_paid - v_new_total);
        v_wallet_delta  := v_new_overage - v_prior_overage;

        IF v_wallet_delta <> 0 THEN
          INSERT INTO public.driver_wallets (driver_id, customer_id, balance)
          VALUES (v_payment.driver_id, v_payment.customer_id, 0)
          ON CONFLICT (driver_id) DO NOTHING;

          UPDATE public.driver_wallets
          SET balance = balance + v_wallet_delta, updated_at = now()
          WHERE driver_id = v_payment.driver_id
          RETURNING balance INTO v_balance_after;

          INSERT INTO public.driver_wallet_transactions
            (driver_id, customer_id, rental_id, invoice_id, payment_id, type, amount, balance_after, note, created_by)
          VALUES (
            v_payment.driver_id, v_payment.customer_id, p_rental_id, v_invoice.id, v_payment.id,
            CASE WHEN v_wallet_delta > 0 THEN 'credit' ELSE 'debit' END,
            v_wallet_delta,
            COALESCE(v_balance_after, v_wallet_delta),
            'Ajustement wallet suite à changement de tarif: ' || trim(p_reason),
            v_user
          );
        END IF;
      END IF;
    END IF;

    INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
    VALUES (v_invoice.id, v_invoice.customer_id, 'fee_changed', v_user, 'admin',
            jsonb_build_object('old_rate', v_old_rate, 'new_rate', p_new_rate, 'reason', trim(p_reason),
                               'payment_recomputed', v_payment.id IS NOT NULL,
                               'new_payment_status', v_new_status));
  END IF;

  -- Best-effort admin audit log (skip if admin row missing to avoid FK error).
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, metadata)
    VALUES (v_admin_id, 'rental_fee_propagated', 'rental', p_rental_id,
            jsonb_build_object('old_rate', v_old_rate, 'new_rate', p_new_rate,
                               'invoice_id', v_invoice.id, 'payment_id', v_payment.id,
                               'new_payment_status', v_new_status));
  END IF;

  RETURN v_rental;
END;
$$;
