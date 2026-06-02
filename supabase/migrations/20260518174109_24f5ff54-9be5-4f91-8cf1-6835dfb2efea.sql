CREATE OR REPLACE FUNCTION public.auto_generate_invoice_on_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.customer_billing_settings;
  v_drv public.drivers;
  v_invoice_id uuid;
  v_linked_invoice_id uuid;
  v_linked_invoice_status text;
  v_vat numeric(5,2) := 0;
  v_vat_amount integer := 0;
  v_designation text;
  v_is_paid boolean;
  v_was_paid boolean;
  v_is_partial boolean;
  v_was_partial boolean;
BEGIN
  v_is_paid    := NEW.status IN ('paid','overpaid');
  v_was_paid   := (TG_OP = 'UPDATE' AND OLD.status IN ('paid','overpaid'));
  v_is_partial := NEW.status = 'partial';
  v_was_partial:= (TG_OP = 'UPDATE' AND OLD.status = 'partial');

  IF NOT v_is_paid AND NOT v_is_partial THEN
    RETURN NEW;
  END IF;
  IF v_is_paid AND v_was_paid THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL OR NEW.driver_id IS NULL OR NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT invoice_id INTO v_linked_invoice_id
  FROM public.invoice_payment_link
  WHERE payment_id = NEW.id
  LIMIT 1;

  -- ---------- Partial branch ----------
  IF v_is_partial THEN
    IF v_linked_invoice_id IS NULL THEN
      RETURN NEW;
    END IF;

    UPDATE public.invoice
       SET status = 'partial',
           amount_paid = LEAST(COALESCE(NEW.amount_paid, 0), total_ttc),
           paid_at = NULL
     WHERE id = v_linked_invoice_id
       AND status IN ('issued','partial');

    IF FOUND THEN
      INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
      VALUES (v_linked_invoice_id, NEW.customer_id, 'partial', NULL, 'system',
        jsonb_build_object('payment_id', NEW.id, 'amount_paid', NEW.amount_paid, 'status', NEW.status));
    END IF;

    RETURN NEW;
  END IF;

  -- ---------- Paid / overpaid branches ----------
  -- Path A: pre-linked invoice
  IF v_linked_invoice_id IS NOT NULL THEN
    SELECT status INTO v_linked_invoice_status
    FROM public.invoice
    WHERE id = v_linked_invoice_id;

    -- If the linked invoice is cancelled, leave it alone.
    -- The payment can still be marked paid; the cancelled invoice stays cancelled.
    IF v_linked_invoice_status = 'cancelled' THEN
      RETURN NEW;
    END IF;

    UPDATE public.invoice
       SET status = 'paid',
           amount_paid = LEAST(COALESCE(NEW.amount_paid, NEW.amount), total_ttc),
           paid_at = COALESCE(NEW.paid_at, now())
     WHERE id = v_linked_invoice_id
       AND status NOT IN ('paid','cancelled');

    IF FOUND THEN
      INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
      VALUES (v_linked_invoice_id, NEW.customer_id, 'paid', NULL, 'system',
              jsonb_build_object('payment_id', NEW.id, 'source', 'payment_status_change', 'status', NEW.status));
    END IF;

    RETURN NEW;
  END IF;

  -- Path B: legacy auto-invoice
  SELECT * INTO v_settings FROM public.customer_billing_settings WHERE customer_id = NEW.customer_id;
  IF v_settings IS NULL OR NOT v_settings.module_enabled OR NOT v_settings.auto_invoicing THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_drv FROM public.drivers WHERE id = NEW.driver_id;

  IF v_settings.vat_enabled THEN
    v_vat := v_settings.vat_rate;
    v_vat_amount := round(NEW.amount * v_vat / 100.0)::integer;
  END IF;

  v_designation := CASE NEW.payment_type
    WHEN 'rental' THEN 'Location véhicule'
    WHEN 'loan'   THEN 'Échéance de prêt'
    ELSE 'Paiement'
  END;

  INSERT INTO public.invoice (
    customer_id, driver_id, status, invoice_kind,
    driver_snapshot_name, driver_snapshot_phone,
    subtotal_ht, vat_amount, total_ttc, amount_paid,
    vat_rate_snapshot, vat_enabled_snapshot,
    legal_name_snapshot, legal_nif_snapshot, legal_rccm_snapshot,
    legal_address_snapshot, legal_footer_snapshot,
    rental_id
  ) VALUES (
    NEW.customer_id, NEW.driver_id, 'issued', 'invoice',
    v_drv.full_name, v_drv.phone_number,
    NEW.amount, v_vat_amount, NEW.amount + v_vat_amount, 0,
    v_vat, v_settings.vat_enabled,
    v_settings.legal_name, v_settings.legal_nif, v_settings.legal_rccm,
    v_settings.legal_address, v_settings.legal_footer,
    NEW.rental_id
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_line (
    invoice_id, customer_id, position, designation, quantity,
    unit_price, line_total_ht, vat_rate, line_vat, line_total_ttc, source_payment_id
  ) VALUES (
    v_invoice_id, NEW.customer_id, 1, v_designation, 1,
    NEW.amount, NEW.amount, v_vat, v_vat_amount, NEW.amount + v_vat_amount, NEW.id
  );

  INSERT INTO public.invoice_payment_link (invoice_id, payment_id, customer_id)
  VALUES (v_invoice_id, NEW.id, NEW.customer_id);

  UPDATE public.invoice
    SET status = 'paid',
        amount_paid = LEAST(COALESCE(NEW.amount_paid, NEW.amount), total_ttc),
        paid_at = COALESCE(NEW.paid_at, now())
    WHERE id = v_invoice_id;

  INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
  VALUES (v_invoice_id, NEW.customer_id, 'auto_generated', NULL, 'system',
          jsonb_build_object('payment_id', NEW.id, 'payment_type', NEW.payment_type, 'status', NEW.status));

  RETURN NEW;
END;
$function$;