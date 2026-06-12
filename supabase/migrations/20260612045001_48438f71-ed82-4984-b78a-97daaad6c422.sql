
-- =========================================================================
-- PHASE 1 — Driver Operating Record foundation
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -------------------------------------------------------------------------
-- 1. Extend drivers table with profile fields per spec §3
-- -------------------------------------------------------------------------
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS phone_secondary text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS permit_number text,
  ADD COLUMN IF NOT EXISTS permit_issue_date date,
  ADD COLUMN IF NOT EXISTS permit_expiry_date date,
  ADD COLUMN IF NOT EXISTS permit_category text,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspended_by uuid,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivation_date timestamptz,
  ADD COLUMN IF NOT EXISTS access_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_driver_status_check;
ALTER TABLE public.drivers ADD CONSTRAINT drivers_driver_status_check
  CHECK (driver_status = ANY (ARRAY['active','suspended','inactive','pending_kyc','blocked']));

-- -------------------------------------------------------------------------
-- 2. driver_notes
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text NOT NULL,
  visibility text NOT NULL DEFAULT 'admin' CHECK (visibility IN ('admin','driver','both')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_notes_driver ON public.driver_notes(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_notes_customer ON public.driver_notes(customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_notes TO authenticated;
GRANT ALL ON public.driver_notes TO service_role;
ALTER TABLE public.driver_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read tenant driver notes" ON public.driver_notes FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR (public.is_admin() AND customer_id = public.current_customer_id()));
CREATE POLICY "Admins insert tenant driver notes" ON public.driver_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_owner() OR (public.is_admin() AND customer_id = public.current_customer_id()));
CREATE POLICY "Admins update tenant driver notes" ON public.driver_notes FOR UPDATE TO authenticated
  USING (public.is_platform_owner() OR (public.is_admin() AND customer_id = public.current_customer_id()));
CREATE POLICY "Admins delete tenant driver notes" ON public.driver_notes FOR DELETE TO authenticated
  USING (public.is_platform_owner() OR (public.is_admin() AND customer_id = public.current_customer_id()));

-- -------------------------------------------------------------------------
-- 3. driver_audit
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'admin' CHECK (actor_type IN ('admin','driver','system','platform_owner')),
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_audit_driver ON public.driver_audit(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_audit_customer ON public.driver_audit(customer_id, created_at DESC);

GRANT SELECT ON public.driver_audit TO authenticated;
GRANT ALL ON public.driver_audit TO service_role;
ALTER TABLE public.driver_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read tenant driver audit" ON public.driver_audit FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR (public.is_admin() AND customer_id = public.current_customer_id()));

-- -------------------------------------------------------------------------
-- 4. driver_access_codes (hashed PINs)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','used','revoked','expired')),
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_driver_access_codes_driver ON public.driver_access_codes(driver_id, created_at DESC);

GRANT SELECT ON public.driver_access_codes TO authenticated;
GRANT ALL ON public.driver_access_codes TO service_role;
ALTER TABLE public.driver_access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read tenant access codes meta" ON public.driver_access_codes FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR (public.is_admin() AND customer_id = public.current_customer_id()));

-- -------------------------------------------------------------------------
-- 5. driver_documents
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  expiry_date date,
  rejection_reason text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_driver_documents_driver ON public.driver_documents(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_documents_customer ON public.driver_documents(customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_documents TO authenticated;
GRANT ALL ON public.driver_documents TO service_role;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tenant driver documents" ON public.driver_documents FOR ALL TO authenticated
  USING (public.is_platform_owner() OR (public.is_admin() AND customer_id = public.current_customer_id()))
  WITH CHECK (public.is_platform_owner() OR (public.is_admin() AND customer_id = public.current_customer_id()));
CREATE POLICY "Drivers read own documents" ON public.driver_documents FOR SELECT TO authenticated
  USING (driver_id IN (SELECT id FROM public.drivers WHERE auth_user_id = auth.uid()));

-- -------------------------------------------------------------------------
-- 6. Helper RPCs
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.driver_log(
  p_driver uuid, p_action text, p_metadata jsonb DEFAULT '{}'::jsonb, p_actor_type text DEFAULT 'admin'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer uuid; v_id uuid;
BEGIN
  SELECT customer_id INTO v_customer FROM public.drivers WHERE id = p_driver;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'driver not found'; END IF;
  INSERT INTO public.driver_audit (customer_id, driver_id, actor_id, actor_type, action, metadata)
  VALUES (v_customer, p_driver, auth.uid(), p_actor_type, p_action, COALESCE(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.driver_log(uuid,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_log(uuid,text,jsonb,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.driver_generate_access_code(p_driver uuid)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer uuid; v_code text; v_hash text; v_expires timestamptz := now() + interval '7 days';
BEGIN
  SELECT d.customer_id INTO v_customer FROM public.drivers d WHERE d.id = p_driver;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'driver not found'; END IF;
  IF NOT (public.is_platform_owner() OR (public.is_admin() AND v_customer = public.current_customer_id())) THEN
    RAISE EXCEPTION 'not authorized'; END IF;
  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');
  v_hash := crypt(v_code, gen_salt('bf'));
  UPDATE public.driver_access_codes SET status='revoked', revoked_at=now() WHERE driver_id=p_driver AND status='active';
  INSERT INTO public.driver_access_codes (customer_id, driver_id, code_hash, expires_at, created_by)
  VALUES (v_customer, p_driver, v_hash, v_expires, auth.uid());
  PERFORM public.driver_log(p_driver, 'access_code_generated', jsonb_build_object('expires_at', v_expires));
  code := v_code; expires_at := v_expires; RETURN NEXT;
END; $$;
REVOKE ALL ON FUNCTION public.driver_generate_access_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_generate_access_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.driver_revoke_access(p_driver uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer uuid;
BEGIN
  SELECT customer_id INTO v_customer FROM public.drivers WHERE id = p_driver;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'driver not found'; END IF;
  IF NOT (public.is_platform_owner() OR (public.is_admin() AND v_customer = public.current_customer_id())) THEN
    RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.driver_access_codes SET status='revoked', revoked_at=now() WHERE driver_id=p_driver AND status='active';
  UPDATE public.drivers SET access_enabled = false WHERE id = p_driver;
  PERFORM public.driver_log(p_driver, 'access_revoked', '{}'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.driver_revoke_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_revoke_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.driver_suspend(p_driver uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer uuid;
BEGIN
  SELECT customer_id INTO v_customer FROM public.drivers WHERE id = p_driver;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'driver not found'; END IF;
  IF NOT (public.is_platform_owner() OR (public.is_admin() AND v_customer = public.current_customer_id())) THEN
    RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.drivers SET driver_status='suspended', suspension_reason=p_reason,
    suspended_by=auth.uid(), suspended_at=now() WHERE id = p_driver;
  PERFORM public.driver_log(p_driver, 'driver_suspended', jsonb_build_object('reason', p_reason));
END; $$;
REVOKE ALL ON FUNCTION public.driver_suspend(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_suspend(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.driver_reactivate(p_driver uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer uuid;
BEGIN
  SELECT customer_id INTO v_customer FROM public.drivers WHERE id = p_driver;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'driver not found'; END IF;
  IF NOT (public.is_platform_owner() OR (public.is_admin() AND v_customer = public.current_customer_id())) THEN
    RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.drivers SET driver_status='active', suspension_reason=NULL, suspended_by=NULL,
    suspended_at=NULL, reactivation_date=now() WHERE id = p_driver;
  PERFORM public.driver_log(p_driver, 'driver_reactivated', '{}'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.driver_reactivate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_reactivate(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.driver_360(p_driver uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer uuid; v_driver jsonb; v_wallet jsonb; v_score jsonb;
  v_vehicle jsonb; v_rental jsonb; v_invoices jsonb; v_fleet jsonb;
  v_sinistres int; v_contraventions int; v_loans int; v_active_code jsonb;
BEGIN
  SELECT customer_id INTO v_customer FROM public.drivers WHERE id = p_driver;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'driver not found'; END IF;
  IF NOT (public.is_platform_owner() OR (public.is_admin() AND v_customer = public.current_customer_id())) THEN
    RAISE EXCEPTION 'not authorized'; END IF;

  SELECT to_jsonb(d.*) INTO v_driver FROM public.drivers d WHERE d.id = p_driver;
  SELECT jsonb_build_object('balance', COALESCE(balance,0), 'status', status)
    INTO v_wallet FROM public.driver_wallets WHERE driver_id = p_driver LIMIT 1;
  SELECT to_jsonb(ds.*) INTO v_score FROM public.driver_scores ds WHERE ds.driver_id = p_driver LIMIT 1;
  SELECT to_jsonb(v.*) INTO v_vehicle FROM public.vehicles v
    WHERE v.id = (SELECT active_vehicle_id FROM public.drivers WHERE id = p_driver);
  SELECT to_jsonb(r.*) INTO v_rental FROM public.rentals r
    WHERE r.driver_id = p_driver AND r.status = 'active'
    ORDER BY r.created_at DESC LIMIT 1;
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'unpaid', COUNT(*) FILTER (WHERE status IN ('open','partially_paid','overdue')),
    'overdue', COUNT(*) FILTER (WHERE status = 'overdue'),
    'outstanding_xof', COALESCE(SUM(CASE WHEN status IN ('open','partially_paid','overdue') THEN remaining_amount_xof ELSE 0 END),0)
  ) INTO v_invoices FROM public.invoice WHERE driver_id = p_driver;
  SELECT to_jsonb(vi.*) INTO v_fleet FROM public.vehicle_inspections vi
    WHERE vi.driver_id = p_driver ORDER BY vi.created_at DESC LIMIT 1;
  SELECT COUNT(*) INTO v_sinistres FROM public.accidents WHERE driver_id = p_driver;
  SELECT COUNT(*) INTO v_contraventions FROM public.traffic_violations WHERE driver_id = p_driver;
  SELECT COUNT(*) INTO v_loans FROM public.loans WHERE driver_id = p_driver
    AND status IN ('active','approved','pending_disbursement');
  SELECT jsonb_build_object('id', id, 'expires_at', expires_at) INTO v_active_code
    FROM public.driver_access_codes WHERE driver_id = p_driver AND status = 'active' LIMIT 1;

  RETURN jsonb_build_object(
    'driver', v_driver, 'wallet', v_wallet, 'score', v_score, 'vehicle', v_vehicle, 'rental', v_rental,
    'invoices', v_invoices, 'fleet_control', v_fleet, 'sinistres_count', v_sinistres,
    'contraventions_count', v_contraventions, 'active_loans_count', v_loans,
    'has_active_access_code', v_active_code IS NOT NULL, 'active_access_code', v_active_code
  );
END; $$;
REVOKE ALL ON FUNCTION public.driver_360(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_360(uuid) TO authenticated;

-- -------------------------------------------------------------------------
-- 7. Storage policies for driver-documents bucket
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage tenant driver documents storage" ON storage.objects;
CREATE POLICY "Admins manage tenant driver documents storage" ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'driver-documents' AND (
      public.is_platform_owner()
      OR (public.is_admin() AND (storage.foldername(name))[1] = public.current_customer_id()::text)
    )
  )
  WITH CHECK (
    bucket_id = 'driver-documents' AND (
      public.is_platform_owner()
      OR (public.is_admin() AND (storage.foldername(name))[1] = public.current_customer_id()::text)
    )
  );

DROP POLICY IF EXISTS "Drivers read own driver documents storage" ON storage.objects;
CREATE POLICY "Drivers read own driver documents storage" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM public.drivers WHERE auth_user_id = auth.uid()
    )
  );

-- -------------------------------------------------------------------------
-- 8. Tighten existing accident-photos and police-reports storage policies
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "drivers read own accident photos" ON storage.objects;
CREATE POLICY "drivers read own accident photos" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'accident-photos'
    AND EXISTS (
      SELECT 1 FROM public.accidents a
      JOIN public.drivers d ON d.id = a.driver_id
      WHERE d.auth_user_id = auth.uid()
        AND (storage.foldername(name))[1] = a.id::text
    )
  );

DROP POLICY IF EXISTS "Admins view police reports" ON storage.objects;
CREATE POLICY "Admins view police reports" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'police-reports' AND (
      public.is_platform_owner()
      OR EXISTS (
        SELECT 1 FROM public.accidents a
        WHERE a.id::text = (storage.foldername(name))[1]
          AND a.customer_id = public.current_customer_id()
      )
    )
  );
