-- BUGFIX-NOTAX-V1 + BUGFIX-EMITLINK-V1

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
  v_designation text;
  v_is_paid boolean;
  v_was_paid boolean;
  v_is_partial boolean;
  v_amount_paid integer;
  v_new_status text;
  v_new_paid_at timestamptz;
BEGIN
  v_is_paid    := NEW.status IN ('paid','overpaid');
  v_was_paid   := (TG_OP = 'UPDATE' AND OLD.status IN ('paid','overpaid'));
  v_is_partial := NEW.status = 'partial';

  IF NOT v_is_paid AND NOT v_is_partial THEN RETURN NEW; END IF;
  IF v_is_paid AND v_was_paid THEN RETURN NEW; END IF;
  IF NEW.customer_id IS NULL OR NEW.driver_id IS NULL OR NEW.amount IS NULL OR NEW.amount <= 0 THEN RETURN NEW; END IF;

  SELECT invoice_id INTO v_linked_invoice_id
  FROM public.invoice_payment_link WHERE payment_id = NEW.id LIMIT 1;

  IF v_is_partial THEN
    IF v_linked_invoice_id IS NULL THEN RETURN NEW; END IF;
    UPDATE public.invoice
       SET status = 'partial',
           amount_paid = LEAST(COALESCE(NEW.amount_paid, 0), total_ttc),
           paid_at = NULL
     WHERE id = v_linked_invoice_id AND status IN ('issued','partial');
    IF FOUND THEN
      INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
      VALUES (v_linked_invoice_id, NEW.customer_id, 'paid', NULL, 'system',
        jsonb_build_object('payment_id', NEW.id, 'amount_paid', NEW.amount_paid, 'status', NEW.status, 'derived','partial'));
    END IF;
    RETURN NEW;
  END IF;

  IF v_linked_invoice_id IS NOT NULL THEN
    SELECT status INTO v_linked_invoice_status FROM public.invoice WHERE id = v_linked_invoice_id;
    IF v_linked_invoice_status = 'cancelled' THEN RETURN NEW; END IF;

    UPDATE public.invoice
       SET amount_paid = LEAST(COALESCE(NEW.amount_paid, NEW.amount), total_ttc),
           status = CASE
             WHEN LEAST(COALESCE(NEW.amount_paid, NEW.amount), total_ttc) >= total_ttc THEN 'paid'
             WHEN LEAST(COALESCE(NEW.amount_paid, NEW.amount), total_ttc) > 0 THEN 'partial'
             ELSE status
           END,
           paid_at = CASE
             WHEN LEAST(COALESCE(NEW.amount_paid, NEW.amount), total_ttc) >= total_ttc
               THEN COALESCE(NEW.paid_at, now())
             ELSE NULL
           END
     WHERE id = v_linked_invoice_id AND status NOT IN ('paid','cancelled');

    IF FOUND THEN
      INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
      VALUES (v_linked_invoice_id, NEW.customer_id, 'paid', NULL, 'system',
        jsonb_build_object('payment_id', NEW.id, 'amount_paid', NEW.amount_paid, 'status', NEW.status));
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_settings FROM public.customer_billing_settings WHERE customer_id = NEW.customer_id;
  IF v_settings IS NULL OR NOT v_settings.module_enabled OR NOT v_settings.auto_invoicing THEN RETURN NEW; END IF;

  SELECT * INTO v_drv FROM public.drivers WHERE id = NEW.driver_id;

  v_designation := CASE NEW.payment_type
    WHEN 'rental' THEN 'Location véhicule'
    WHEN 'loan' THEN 'Échéance de prêt'
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
    NEW.amount, 0, NEW.amount, 0,
    0, false,
    v_settings.legal_name, v_settings.legal_nif, v_settings.legal_rccm,
    v_settings.legal_address, v_settings.legal_footer,
    NEW.rental_id
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_line (
    invoice_id, customer_id, position, designation, quantity,
    unit_price, line_total_ht, vat_rate, line_vat, line_total_ttc, source_payment_id
  ) VALUES (
    v_invoice_id, NEW.customer_id, 1, v_designation, 1,
    NEW.amount, NEW.amount, 0, 0, NEW.amount, NEW.id
  );

  INSERT INTO public.invoice_payment_link (invoice_id, payment_id, customer_id)
  VALUES (v_invoice_id, NEW.id, NEW.customer_id);

  v_amount_paid := LEAST(COALESCE(NEW.amount_paid, NEW.amount), NEW.amount);
  IF v_amount_paid >= NEW.amount THEN
    v_new_status := 'paid';
    v_new_paid_at := COALESCE(NEW.paid_at, now());
  ELSIF v_amount_paid > 0 THEN
    v_new_status := 'partial';
    v_new_paid_at := NULL;
  ELSE
    v_new_status := 'issued';
    v_new_paid_at := NULL;
  END IF;

  UPDATE public.invoice
    SET status = v_new_status, amount_paid = v_amount_paid, paid_at = v_new_paid_at
    WHERE id = v_invoice_id;

  INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
  VALUES (v_invoice_id, NEW.customer_id, 'auto_generated', NULL, 'system',
          jsonb_build_object('payment_id', NEW.id, 'payment_type', NEW.payment_type, 'status', NEW.status, 'derived_invoice_status', v_new_status));

  RETURN NEW;
END;
$function$;

SET session_replication_role = 'replica';

UPDATE public.invoice_line
   SET line_total_ht = 20300, vat_rate = 0, line_vat = 0, line_total_ttc = 20300, unit_price = 20300
 WHERE invoice_id = (SELECT id FROM public.invoice WHERE invoice_number = 'FAC-DAM-2026-000050');

UPDATE public.invoice
   SET subtotal_ht = 20300, vat_amount = 0, total_ttc = 20300, amount_paid = 20300,
       status = 'paid', vat_enabled_snapshot = false, vat_rate_snapshot = 0
 WHERE invoice_number = 'FAC-DAM-2026-000050';

UPDATE public.invoice
   SET status = 'issued', amount_paid = 0, paid_at = NULL
 WHERE invoice_number = 'FAC-DAM-2026-000055'
   AND status = 'paid' AND amount_paid = 0;

DO $repair$
DECLARE
  r record;
  v_payment_id uuid;
  v_due_date date := (now() + interval '1 day')::date;
BEGIN
  FOR r IN
    SELECT i.id, i.customer_id, i.driver_id, i.rental_id, i.total_ttc, i.invoice_number
    FROM public.invoice i
    WHERE i.invoice_number IN ('FAC-DAM-2026-000064')
      AND i.status = 'issued'
      AND NOT EXISTS (SELECT 1 FROM public.invoice_payment_link l WHERE l.invoice_id = i.id)
  LOOP
    INSERT INTO public.payments (driver_id, rental_id, customer_id, amount, payment_type, due_date, status)
    VALUES (r.driver_id, r.rental_id, r.customer_id, r.total_ttc, 'rental', v_due_date, 'pending')
    RETURNING id INTO v_payment_id;

    INSERT INTO public.invoice_payment_link (invoice_id, payment_id, customer_id)
    VALUES (r.id, v_payment_id, r.customer_id);

    INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
    VALUES (r.id, r.customer_id, 'regenerated_link', NULL, 'system',
            jsonb_build_object('tag','BUGFIX-EMITLINK-V1','invoice_number',r.invoice_number,'payment_id',v_payment_id,'reason','attach payable payments row + link so driver can pay via Wave'));
  END LOOP;
END;
$repair$;

INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
SELECT id, customer_id, 'fee_changed', NULL, 'system',
       jsonb_build_object('tag','BUGFIX-NOTAX-V1','invoice_number',invoice_number,'reason','strip VAT inflation; align totals to payment','old_total_ttc',23954,'new_total_ttc',20300)
FROM public.invoice WHERE invoice_number = 'FAC-DAM-2026-000050';

INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
SELECT id, customer_id, 'issued', NULL, 'system',
       jsonb_build_object('tag','BUGFIX-NOTAX-V1','invoice_number',invoice_number,'reason','revert false paid stamp to issued')
FROM public.invoice WHERE invoice_number = 'FAC-DAM-2026-000055';

SET session_replication_role = 'origin';

UPDATE public.customer_billing_settings
   SET vat_enabled = false, vat_rate = 0
 WHERE vat_enabled = true OR vat_rate <> 0;
