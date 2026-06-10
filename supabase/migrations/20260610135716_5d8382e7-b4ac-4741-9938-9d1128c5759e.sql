
CREATE OR REPLACE FUNCTION public.issue_daily_rental_invoices()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rental         public.rentals;
  v_drv            public.drivers;
  v_settings       public.customer_billing_settings;
  v_rate           integer;
  v_total          integer;
  v_inserted       integer := 0;
  v_base_day       date;
  v_today_abj      date;
  v_d              date;
  v_invoice_id     uuid;
  v_payment_id     uuid;
  v_due_at         timestamptz;
  v_issued_at      timestamptz;
BEGIN
  v_today_abj := (now() AT TIME ZONE 'Africa/Abidjan')::date;

  FOR v_rental IN
    SELECT r.*
      FROM public.rentals r
     WHERE r.returned_at IS NULL
       AND r.status NOT IN ('completed','terminated','rejected','cancelled','paid')
       AND r.approval_date IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.invoice i
          WHERE i.rental_id = r.id
            AND i.invoice_kind IN ('invoice','daily_rental')
       )
  LOOP
    SELECT * INTO v_settings
      FROM public.customer_billing_settings
     WHERE customer_id = v_rental.customer_id;

    IF v_settings.id IS NOT NULL
       AND COALESCE(v_settings.daily_invoicing_enabled, true) = false THEN
      CONTINUE;
    END IF;

    v_rate := COALESCE(v_rental.final_rate, v_rental.approved_rate, 0);
    IF v_rate <= 0 THEN CONTINUE; END IF;
    v_total := v_rate;

    SELECT * INTO v_drv FROM public.drivers WHERE id = v_rental.driver_id;

    v_base_day := (v_rental.approval_date AT TIME ZONE 'Africa/Abidjan')::date;

    v_d := v_base_day + 1;
    WHILE v_d <= v_today_abj LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.invoice
         WHERE rental_id = v_rental.id
           AND invoice_kind = 'daily_rental'
           AND period_start = v_d
      ) THEN
        v_issued_at := ((v_d::text || ' 12:00')::timestamp AT TIME ZONE 'Africa/Abidjan');
        v_due_at    := (((v_d + 1)::text || ' 12:00')::timestamp AT TIME ZONE 'Africa/Abidjan');

        BEGIN
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
            v_total, 0, v_total,
            COALESCE(v_settings.vat_rate, 0), COALESCE(v_settings.vat_enabled, false),
            v_settings.legal_name, v_settings.legal_nif, v_settings.legal_rccm,
            v_settings.legal_address, v_settings.legal_footer,
            v_rental.id, v_d, v_d, v_issued_at
          )
          RETURNING id INTO v_invoice_id;
        EXCEPTION WHEN unique_violation THEN
          v_d := v_d + 1;
          CONTINUE;
        END;

        INSERT INTO public.invoice_line (
          invoice_id, customer_id, position, designation,
          quantity, unit_price, line_total_ht, vat_rate, line_vat, line_total_ttc
        ) VALUES (
          v_invoice_id, v_rental.customer_id, 1,
          'Location journalière — ' || to_char(v_d, 'DD/MM/YYYY'),
          1, v_total, v_total, 0, 0, v_total
        );

        -- Fixed: payments has no invoice_id column; use invoice_payment_link.
        INSERT INTO public.payments (
          driver_id, customer_id, rental_id,
          payment_type, amount, due_date, status
        ) VALUES (
          v_rental.driver_id, v_rental.customer_id, v_rental.id,
          'rental', v_total, (v_due_at AT TIME ZONE 'Africa/Abidjan')::date, 'pending'
        )
        RETURNING id INTO v_payment_id;

        INSERT INTO public.invoice_payment_link (invoice_id, payment_id, customer_id)
        VALUES (v_invoice_id, v_payment_id, v_rental.customer_id);

        PERFORM public.apply_wallet_to_invoice(
          v_rental.driver_id, v_rental.id, v_invoice_id, v_payment_id, v_total
        );

        v_inserted := v_inserted + 1;
      END IF;

      v_d := v_d + 1;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$function$;
