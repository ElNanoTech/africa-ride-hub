-- 1. Extend invoice_kind CHECK to include 'daily_rental' (additive)
ALTER TABLE public.invoice DROP CONSTRAINT IF EXISTS invoice_kind_check;
ALTER TABLE public.invoice ADD CONSTRAINT invoice_kind_check
  CHECK (invoice_kind = ANY (ARRAY['invoice'::text, 'monthly_statement'::text, 'daily_rental'::text]));

-- 2. Idempotency guard: at most one daily_rental invoice per (rental_id, period_start)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_daily_rental_per_period
  ON public.invoice (rental_id, period_start)
  WHERE invoice_kind = 'daily_rental' AND rental_id IS NOT NULL;

-- 3. issue_daily_rental_invoices()
CREATE OR REPLACE FUNCTION public.issue_daily_rental_invoices()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_rental         public.rentals;
  v_upfront        public.invoice;
  v_latest_end_ts  timestamptz;
  v_window_start   timestamptz;
  v_window_end     timestamptz;
  v_rate           integer;
  v_vat            numeric(5,2);
  v_vat_amount     integer;
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
    -- Find the latest invoice (upfront OR daily_rental) for this rental
    -- and use its period_end as the window starting point.
    SELECT * INTO v_upfront
    FROM public.invoice
    WHERE rental_id = v_rental.id
      AND invoice_kind IN ('invoice','daily_rental')
    ORDER BY created_at DESC
    LIMIT 1;

    -- For the upfront invoice, period_end is typically NULL; fall back to its created_at + 24h
    -- (the upfront covers T -> T+24h).
    IF v_upfront.period_end IS NOT NULL THEN
      v_latest_end_ts := (v_upfront.period_end::timestamptz) AT TIME ZONE 'Africa/Abidjan';
    ELSE
      v_latest_end_ts := COALESCE(v_upfront.issued_at, v_upfront.created_at) + interval '24 hours';
    END IF;

    -- Skip if the next window has not elapsed yet
    IF now() < v_latest_end_ts THEN
      CONTINUE;
    END IF;

    v_rate := COALESCE(v_rental.final_rate, v_rental.approved_rate, 0);
    IF v_rate <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_drv FROM public.drivers WHERE id = v_rental.driver_id;
    SELECT * INTO v_settings FROM public.customer_billing_settings WHERE customer_id = v_rental.customer_id;

    v_vat := 0;
    v_vat_amount := 0;
    IF COALESCE(v_settings.vat_enabled, false) THEN
      v_vat := v_settings.vat_rate;
      v_vat_amount := round(v_rate * v_vat / 100.0)::integer;
    END IF;
    v_total := v_rate + v_vat_amount;

    -- Catch up across all missed 24h windows up to now()
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
        v_rate, v_vat_amount, v_total,
        v_vat, COALESCE(v_settings.vat_enabled, false),
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
          1, v_rate, v_rate, v_vat, v_vat_amount, v_total
        );

        INSERT INTO public.payments (driver_id, rental_id, amount, payment_type, due_date, status, customer_id)
        VALUES (v_rental.driver_id, v_rental.id, v_total, 'rental', v_period_end, 'pending', v_rental.customer_id)
        RETURNING id INTO v_payment_id;

        INSERT INTO public.invoice_payment_link (invoice_id, payment_id, customer_id)
        VALUES (v_invoice_id, v_payment_id, v_rental.customer_id);

        -- Apply any wallet balance to this daily invoice
        PERFORM public.apply_wallet_to_invoice(v_rental.driver_id, v_rental.id, v_invoice_id, v_payment_id, v_total);

        v_inserted := v_inserted + 1;
      END IF;

      v_window_start := v_window_end;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_daily_rental_invoices() TO service_role;

-- 4. Hourly cron schedule (additive — does not touch existing jobs)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'issue_daily_rental_invoices_hourly') THEN
    PERFORM cron.schedule(
      'issue_daily_rental_invoices_hourly',
      '0 * * * *',
      $cron$SELECT public.issue_daily_rental_invoices();$cron$
    );
  END IF;
END $$;