CREATE OR REPLACE FUNCTION public.issue_daily_rental_invoices()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rental         public.rentals;
  v_upfront        public.invoice;
  v_latest_end_ts  timestamptz;
  v_window_start   timestamptz;
  v_window_end     timestamptz;
  v_rate           integer;
  v_total          integer;
  v_drv            public.drivers;
  v_settings       public.customer_billing_settings;
  v_invoice_id     uuid;
  v_payment_id     uuid;
  v_inserted       integer := 0;
  v_period_start   date;
  v_period_end     date;
BEGIN
  FOR v_rental IN
    SELECT r.*
    FROM public.rentals r
    WHERE r.status NOT IN ('completed','terminated','rejected','paid')
      AND EXISTS (
        SELECT 1 FROM public.invoice i
        WHERE i.rental_id = r.id AND i.invoice_kind = 'invoice'
      )
  LOOP
    SELECT * INTO v_upfront
    FROM public.invoice
    WHERE rental_id = v_rental.id
      AND invoice_kind IN ('invoice','daily_rental')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_upfront.period_end IS NOT NULL THEN
      v_latest_end_ts := (v_upfront.period_end::timestamptz) AT TIME ZONE 'Africa/Abidjan';
    ELSE
      v_latest_end_ts := COALESCE(v_upfront.issued_at, v_upfront.created_at) + interval '24 hours';
    END IF;

    IF now() < v_latest_end_ts THEN
      CONTINUE;
    END IF;

    v_rate := COALESCE(v_rental.final_rate, v_rental.approved_rate, 0);
    IF v_rate <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_drv FROM public.drivers WHERE id = v_rental.driver_id;
    SELECT * INTO v_settings FROM public.customer_billing_settings WHERE customer_id = v_rental.customer_id;

    -- No-tax product: rental rate is the literal total.
    v_total := v_rate;

    v_window_start := v_latest_end_ts;
    WHILE v_window_start + interval '24 hours' <= now() LOOP
      v_window_end := v_window_start + interval '24 hours';
      v_period_start := v_window_start::date;
      v_period_end   := v_window_end::date;

      v_invoice_id := NULL;

      INSERT INTO public.invoice (
        customer_id, driver_id, status, invoice_kind,
        driver_snapshot_name, driver_snapshot_phone,
        subtotal_ht, vat_amount, total_ttc,
        vat_rate_snapshot, vat_enabled_snapshot,
        legal_name_snapshot, legal_nif_snapshot, legal_rccm_snapshot,
        legal_address_snapshot, legal_footer_snapshot,
        rental_id, period_start, period_end, issued_at
      ) VALUES (
        v_rental.customer_id, v_rental.driver_id, 'issued', 'daily_rental',
        v_drv.full_name, v_drv.phone_number,
        v_rate, 0, v_total,
        0, false,
        v_settings.legal_name, v_settings.legal_nif, v_settings.legal_rccm,
        v_settings.legal_address, v_settings.legal_footer,
        v_rental.id, v_period_start, v_period_end, v_window_start
      )
      ON CONFLICT ON CONSTRAINT uniq_daily_rental_per_period DO NOTHING
      RETURNING id INTO v_invoice_id;

      IF v_invoice_id IS NOT NULL THEN
        INSERT INTO public.invoice_line (
          invoice_id, customer_id, position, designation, quantity,
          unit_price, line_total_ht, vat_rate, line_vat, line_total_ttc
        ) VALUES (
          v_invoice_id, v_rental.customer_id, 1,
          'Location véhicule — journée du ' || to_char(v_period_start, 'DD/MM/YYYY'),
          1, v_rate, v_rate, 0, 0, v_total
        );

        INSERT INTO public.payments (driver_id, rental_id, amount, payment_type, due_date, status, customer_id)
        VALUES (v_rental.driver_id, v_rental.id, v_total, 'rental', v_period_end, 'pending', v_rental.customer_id)
        RETURNING id INTO v_payment_id;

        INSERT INTO public.invoice_payment_link (invoice_id, payment_id, customer_id)
        VALUES (v_invoice_id, v_payment_id, v_rental.customer_id);

        PERFORM public.apply_wallet_to_invoice(v_rental.driver_id, v_rental.id, v_invoice_id, v_payment_id, v_total);

        v_inserted := v_inserted + 1;
      END IF;

      v_window_start := v_window_end;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$function$;