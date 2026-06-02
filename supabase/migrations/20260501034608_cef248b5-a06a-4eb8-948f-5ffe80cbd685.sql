
-- ============================================================
-- MODULE FACTURATION — P1 : Schema, RLS, triggers, sequences
-- ============================================================

-- ---------- 1. Update notifications constraint ----------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type = ANY (ARRAY[
    'score_update','payment_reminder','loan_status','rental_status','safety_tip','announcement',
    'income_status','system','payment_grace_started','payment_final_overdue','rental_pickup_confirmed',
    'vehicle_disabled','kyc_approved','kyc_rejected','accident_report_submitted','accident_report_closed',
    'invoice_issued','invoice_cancelled','monthly_statement_ready'
  ]));

-- ---------- 2. customer_billing_settings ----------
CREATE TABLE public.customer_billing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE,
  invoice_slug text NOT NULL,
  vat_enabled boolean NOT NULL DEFAULT false,
  vat_rate numeric(5,2) NOT NULL DEFAULT 18.00,
  legal_name text,
  legal_nif text,
  legal_rccm text,
  legal_address text,
  legal_footer text,
  auto_invoicing boolean NOT NULL DEFAULT true,
  module_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cbs_slug_format CHECK (invoice_slug ~ '^[A-Z0-9]{2,8}$')
);
CREATE INDEX idx_cbs_customer ON public.customer_billing_settings(customer_id);

ALTER TABLE public.customer_billing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_all_billing_settings" ON public.customer_billing_settings
  FOR ALL USING (is_platform_owner()) WITH CHECK (is_platform_owner());

CREATE POLICY "admin_view_own_billing_settings" ON public.customer_billing_settings
  FOR SELECT USING (is_admin() AND customer_id = current_customer_id());

CREATE POLICY "admin_update_own_billing_settings" ON public.customer_billing_settings
  FOR UPDATE USING (has_admin_role_in(ARRAY['super_admin','manager']) AND customer_id = current_customer_id())
  WITH CHECK (has_admin_role_in(ARRAY['super_admin','manager']) AND customer_id = current_customer_id());

CREATE TRIGGER trg_cbs_updated BEFORE UPDATE ON public.customer_billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 3. invoice_sequence ----------
CREATE TABLE public.invoice_sequence (
  customer_id uuid NOT NULL,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, year)
);

ALTER TABLE public.invoice_sequence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_owner_view_sequences" ON public.invoice_sequence
  FOR SELECT USING (is_platform_owner());
CREATE POLICY "admin_view_own_sequences" ON public.invoice_sequence
  FOR SELECT USING (is_admin() AND customer_id = current_customer_id());

-- ---------- 4. invoice ----------
CREATE TABLE public.invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  invoice_number text,
  invoice_kind text NOT NULL DEFAULT 'invoice', -- invoice | monthly_statement
  status text NOT NULL DEFAULT 'draft',         -- draft | issued | paid | cancelled
  -- driver snapshot (frozen at issue)
  driver_snapshot_name text,
  driver_snapshot_phone text,
  driver_snapshot_nif text,
  -- amounts (FCFA, integer)
  subtotal_ht integer NOT NULL DEFAULT 0,
  vat_amount integer NOT NULL DEFAULT 0,
  total_ttc integer NOT NULL DEFAULT 0,
  vat_rate_snapshot numeric(5,2),
  vat_enabled_snapshot boolean,
  -- legal snapshot
  legal_name_snapshot text,
  legal_nif_snapshot text,
  legal_rccm_snapshot text,
  legal_address_snapshot text,
  legal_footer_snapshot text,
  -- public sharing
  public_token uuid NOT NULL DEFAULT gen_random_uuid(),
  token_expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  -- period (mainly for statements)
  period_start date,
  period_end date,
  -- lifecycle timestamps
  issued_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  cancelled_by uuid,
  -- misc
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_status_check CHECK (status IN ('draft','issued','paid','cancelled')),
  CONSTRAINT invoice_kind_check CHECK (invoice_kind IN ('invoice','monthly_statement')),
  CONSTRAINT invoice_amounts_check CHECK (subtotal_ht >= 0 AND vat_amount >= 0 AND total_ttc >= 0),
  CONSTRAINT invoice_number_unique_per_customer UNIQUE (customer_id, invoice_number)
);
CREATE INDEX idx_invoice_customer ON public.invoice(customer_id);
CREATE INDEX idx_invoice_driver ON public.invoice(driver_id);
CREATE INDEX idx_invoice_status ON public.invoice(status);
CREATE INDEX idx_invoice_token ON public.invoice(public_token);
CREATE INDEX idx_invoice_kind_period ON public.invoice(invoice_kind, period_start, period_end);

ALTER TABLE public.invoice ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_all_invoices" ON public.invoice
  FOR ALL USING (is_platform_owner()) WITH CHECK (is_platform_owner());

CREATE POLICY "admin_view_tenant_invoices" ON public.invoice
  FOR SELECT USING (is_admin() AND customer_id = current_customer_id());

CREATE POLICY "admin_manage_tenant_invoices" ON public.invoice
  FOR ALL USING (has_admin_role_in(ARRAY['super_admin','manager']) AND customer_id = current_customer_id())
  WITH CHECK (has_admin_role_in(ARRAY['super_admin','manager']) AND customer_id = current_customer_id());

CREATE POLICY "driver_view_own_invoices" ON public.invoice
  FOR SELECT USING (driver_id = current_driver_id() AND status <> 'draft');

CREATE TRIGGER trg_invoice_updated BEFORE UPDATE ON public.invoice
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 5. invoice_line ----------
CREATE TABLE public.invoice_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoice(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 1,
  designation text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price integer NOT NULL,
  line_total_ht integer NOT NULL,
  vat_rate numeric(5,2) NOT NULL DEFAULT 0,
  line_vat integer NOT NULL DEFAULT 0,
  line_total_ttc integer NOT NULL,
  source_payment_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT line_amounts_check CHECK (unit_price >= 0 AND line_total_ht >= 0 AND line_vat >= 0 AND line_total_ttc >= 0)
);
CREATE INDEX idx_inv_line_invoice ON public.invoice_line(invoice_id);
CREATE INDEX idx_inv_line_customer ON public.invoice_line(customer_id);

ALTER TABLE public.invoice_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_all_invoice_lines" ON public.invoice_line
  FOR ALL USING (is_platform_owner()) WITH CHECK (is_platform_owner());

CREATE POLICY "admin_manage_tenant_invoice_lines" ON public.invoice_line
  FOR ALL USING (has_admin_role_in(ARRAY['super_admin','manager']) AND customer_id = current_customer_id())
  WITH CHECK (has_admin_role_in(ARRAY['super_admin','manager']) AND customer_id = current_customer_id());

CREATE POLICY "admin_view_tenant_invoice_lines" ON public.invoice_line
  FOR SELECT USING (is_admin() AND customer_id = current_customer_id());

CREATE POLICY "driver_view_own_invoice_lines" ON public.invoice_line
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.invoice i
    WHERE i.id = invoice_line.invoice_id AND i.driver_id = current_driver_id() AND i.status <> 'draft'
  ));

-- ---------- 6. invoice_payment_link ----------
CREATE TABLE public.invoice_payment_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoice(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, payment_id)
);
CREATE INDEX idx_ipl_payment ON public.invoice_payment_link(payment_id);

ALTER TABLE public.invoice_payment_link ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_owner_all_ipl" ON public.invoice_payment_link
  FOR ALL USING (is_platform_owner()) WITH CHECK (is_platform_owner());
CREATE POLICY "admin_manage_ipl" ON public.invoice_payment_link
  FOR ALL USING (has_admin_role_in(ARRAY['super_admin','manager']) AND customer_id = current_customer_id())
  WITH CHECK (has_admin_role_in(ARRAY['super_admin','manager']) AND customer_id = current_customer_id());
CREATE POLICY "admin_view_ipl" ON public.invoice_payment_link
  FOR SELECT USING (is_admin() AND customer_id = current_customer_id());
CREATE POLICY "driver_view_own_ipl" ON public.invoice_payment_link
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.invoice i
    WHERE i.id = invoice_payment_link.invoice_id AND i.driver_id = current_driver_id() AND i.status <> 'draft'
  ));

-- ---------- 7. invoice_audit ----------
CREATE TABLE public.invoice_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoice(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'admin',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_action_check CHECK (action IN (
    'created','issued','paid','cancelled','viewed_public','regenerated_link','statement_generated','auto_generated'
  ))
);
CREATE INDEX idx_inv_audit_invoice ON public.invoice_audit(invoice_id);

ALTER TABLE public.invoice_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_owner_view_audit" ON public.invoice_audit
  FOR SELECT USING (is_platform_owner());
CREATE POLICY "admin_view_audit" ON public.invoice_audit
  FOR SELECT USING (is_admin() AND customer_id = current_customer_id());

-- ---------- 8. billing_outbox ----------
CREATE TABLE public.billing_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoice(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  channel text NOT NULL,                -- push | whatsapp | email | in_app
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending | sent | failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_channel_check CHECK (channel IN ('push','whatsapp','email','in_app')),
  CONSTRAINT outbox_status_check CHECK (status IN ('pending','sent','failed'))
);
CREATE INDEX idx_outbox_pending ON public.billing_outbox(status, scheduled_at) WHERE status = 'pending';

ALTER TABLE public.billing_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_owner_all_outbox" ON public.billing_outbox
  FOR ALL USING (is_platform_owner()) WITH CHECK (is_platform_owner());
CREATE POLICY "admin_view_outbox" ON public.billing_outbox
  FOR SELECT USING (is_admin() AND customer_id = current_customer_id());

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Atomic next invoice number with advisory lock
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_customer_id uuid, p_year integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text || ':' || p_year::text));

  INSERT INTO public.invoice_sequence (customer_id, year, last_number)
  VALUES (p_customer_id, p_year, 1)
  ON CONFLICT (customer_id, year) DO UPDATE
    SET last_number = public.invoice_sequence.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO v_next;

  RETURN v_next;
END;
$$;

-- Format invoice number for a customer/year/n
CREATE OR REPLACE FUNCTION public.format_invoice_number(p_customer_id uuid, p_year integer, p_n integer)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  SELECT invoice_slug INTO v_slug FROM public.customer_billing_settings WHERE customer_id = p_customer_id;
  IF v_slug IS NULL THEN
    v_slug := 'INV';
  END IF;
  RETURN 'FAC-' || v_slug || '-' || p_year::text || '-' || lpad(p_n::text, 6, '0');
END;
$$;

-- Status transition enforcement
CREATE OR REPLACE FUNCTION public.enforce_invoice_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','issued') THEN
      RAISE EXCEPTION 'Invoice must start as draft or issued (got %)', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    -- prevent mutation of frozen fields once issued
    IF OLD.status IN ('issued','paid','cancelled') THEN
      IF OLD.invoice_number IS DISTINCT FROM NEW.invoice_number
         OR OLD.driver_snapshot_name IS DISTINCT FROM NEW.driver_snapshot_name
         OR OLD.subtotal_ht IS DISTINCT FROM NEW.subtotal_ht
         OR OLD.vat_amount IS DISTINCT FROM NEW.vat_amount
         OR OLD.total_ttc IS DISTINCT FROM NEW.total_ttc THEN
        RAISE EXCEPTION 'Cannot modify frozen fields on issued/paid/cancelled invoice';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- transitions
  IF NOT (
    (OLD.status = 'draft'  AND NEW.status IN ('issued','cancelled')) OR
    (OLD.status = 'issued' AND NEW.status IN ('paid','cancelled')) OR
    (OLD.status = 'paid'   AND NEW.status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Invalid invoice status transition: % -> %', OLD.status, NEW.status;
  END IF;

  -- assign number on first issuance
  IF NEW.status = 'issued' AND NEW.invoice_number IS NULL THEN
    DECLARE
      v_year integer := extract(year from now())::integer;
      v_n integer;
    BEGIN
      v_n := public.next_invoice_number(NEW.customer_id, v_year);
      NEW.invoice_number := public.format_invoice_number(NEW.customer_id, v_year, v_n);
      NEW.issued_at := COALESCE(NEW.issued_at, now());
    END;
  END IF;

  IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF NEW.cancel_reason IS NULL OR length(trim(NEW.cancel_reason)) = 0 THEN
      RAISE EXCEPTION 'cancel_reason is required when cancelling an invoice';
    END IF;
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoice_status BEFORE INSERT OR UPDATE ON public.invoice
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_status_transition();

-- Audit log helper
CREATE OR REPLACE FUNCTION public.log_invoice_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, metadata)
    VALUES (NEW.id, NEW.customer_id,
            CASE WHEN NEW.status = 'issued' THEN 'issued' ELSE 'created' END,
            auth.uid(), jsonb_build_object('status', NEW.status));
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, metadata)
    VALUES (NEW.id, NEW.customer_id, NEW.status, auth.uid(),
            jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;

  IF OLD.public_token IS DISTINCT FROM NEW.public_token THEN
    INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id)
    VALUES (NEW.id, NEW.customer_id, 'regenerated_link', auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoice_audit AFTER INSERT OR UPDATE ON public.invoice
  FOR EACH ROW EXECUTE FUNCTION public.log_invoice_status_change();

-- Notify driver on issued/cancelled + queue outbox
CREATE OR REPLACE FUNCTION public.notify_invoice_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_body text;
  v_type text;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'issued') OR
     (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'issued') THEN
    IF NEW.invoice_kind = 'monthly_statement' THEN
      v_title := '📊 Nouveau relevé mensuel';
      v_body := 'Votre relevé ' || COALESCE(NEW.invoice_number, '') || ' est disponible.';
      v_type := 'monthly_statement_ready';
    ELSE
      v_title := '📄 Nouvelle facture';
      v_body := 'Facture ' || COALESCE(NEW.invoice_number, '') || ' de ' || NEW.total_ttc || ' FCFA disponible.';
      v_type := 'invoice_issued';
    END IF;
    INSERT INTO public.notifications (driver_id, customer_id, title, message, notification_type, is_read)
    VALUES (NEW.driver_id, NEW.customer_id, v_title, v_body, v_type, false);

    INSERT INTO public.billing_outbox (invoice_id, customer_id, channel, payload)
    VALUES (NEW.id, NEW.customer_id, 'push',
            jsonb_build_object('title', v_title, 'body', v_body, 'driver_id', NEW.driver_id));

  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled' THEN
    INSERT INTO public.notifications (driver_id, customer_id, title, message, notification_type, is_read)
    VALUES (NEW.driver_id, NEW.customer_id,
            '❌ Facture annulée',
            'Facture ' || COALESCE(NEW.invoice_number, '') || ' annulée. Motif : ' || COALESCE(NEW.cancel_reason,'-'),
            'invoice_cancelled', false);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoice_notify AFTER INSERT OR UPDATE ON public.invoice
  FOR EACH ROW EXECUTE FUNCTION public.notify_invoice_event();

-- Auto-generate invoice when payment goes to 'paid'
CREATE OR REPLACE FUNCTION public.auto_generate_invoice_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.customer_billing_settings;
  v_drv public.drivers;
  v_invoice_id uuid;
  v_vat numeric(5,2) := 0;
  v_vat_amount integer := 0;
  v_designation text;
BEGIN
  IF NEW.status <> 'paid' OR (TG_OP='UPDATE' AND OLD.status = 'paid') THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL OR NEW.driver_id IS NULL OR NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_settings FROM public.customer_billing_settings WHERE customer_id = NEW.customer_id;
  IF v_settings IS NULL OR NOT v_settings.module_enabled OR NOT v_settings.auto_invoicing THEN
    RETURN NEW;
  END IF;

  -- Skip if an invoice already covers this payment
  IF EXISTS (SELECT 1 FROM public.invoice_payment_link WHERE payment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_drv FROM public.drivers WHERE id = NEW.driver_id;

  IF v_settings.vat_enabled THEN
    v_vat := v_settings.vat_rate;
    v_vat_amount := round(NEW.amount * v_vat / 100.0)::integer;
  END IF;

  v_designation := CASE NEW.payment_type
    WHEN 'rental' THEN 'Location véhicule'
    WHEN 'loan' THEN 'Échéance de prêt'
    ELSE 'Paiement'
  END;

  INSERT INTO public.invoice (
    customer_id, driver_id, status, invoice_kind,
    driver_snapshot_name, driver_snapshot_phone,
    subtotal_ht, vat_amount, total_ttc,
    vat_rate_snapshot, vat_enabled_snapshot,
    legal_name_snapshot, legal_nif_snapshot, legal_rccm_snapshot,
    legal_address_snapshot, legal_footer_snapshot
  ) VALUES (
    NEW.customer_id, NEW.driver_id, 'issued', 'invoice',
    v_drv.full_name, v_drv.phone_number,
    NEW.amount, v_vat_amount, NEW.amount + v_vat_amount,
    v_vat, v_settings.vat_enabled,
    v_settings.legal_name, v_settings.legal_nif, v_settings.legal_rccm,
    v_settings.legal_address, v_settings.legal_footer
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

  -- Mark invoice paid since the underlying payment is paid
  UPDATE public.invoice SET status = 'paid', paid_at = COALESCE(NEW.paid_at, now()) WHERE id = v_invoice_id;

  INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
  VALUES (v_invoice_id, NEW.customer_id, 'auto_generated', NULL, 'system',
          jsonb_build_object('payment_id', NEW.id, 'payment_type', NEW.payment_type));

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payment_auto_invoice
  AFTER INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.auto_generate_invoice_on_payment();

-- ============================================================
-- SEED: DAM Africa tenant + billing settings
-- ============================================================
INSERT INTO public.customers (slug, name, is_active)
SELECT 'dam-africa', 'DAM Africa', true
WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE slug = 'dam-africa');

INSERT INTO public.customer_billing_settings (
  customer_id, invoice_slug, vat_enabled, vat_rate,
  legal_name, legal_address, legal_footer, auto_invoicing, module_enabled
)
SELECT c.id, 'DAM', false, 18.00,
       'DAM Africa', 'Abidjan, Côte d''Ivoire',
       'Merci pour votre confiance. Document généré électroniquement.',
       true, true
FROM public.customers c
WHERE c.slug = 'dam-africa'
  AND NOT EXISTS (SELECT 1 FROM public.customer_billing_settings WHERE customer_id = c.id);
