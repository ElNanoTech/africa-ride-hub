-- =========================================================
-- 1. DROP LEGACY ACCIDENT TABLES + TRIGGERS + FUNCTIONS
-- =========================================================
DROP TRIGGER IF EXISTS trg_handle_accident_closure ON public.accident_reports;
DROP TRIGGER IF EXISTS handle_accident_closure_trigger ON public.accident_reports;
DROP TRIGGER IF EXISTS trg_notify_accident_submitted ON public.accident_reports;
DROP TRIGGER IF EXISTS notify_accident_submitted_trigger ON public.accident_reports;
DROP TRIGGER IF EXISTS trg_generate_incident_number ON public.accident_reports;
DROP TRIGGER IF EXISTS generate_incident_number_trigger ON public.accident_reports;

DROP FUNCTION IF EXISTS public.handle_accident_closure() CASCADE;
DROP FUNCTION IF EXISTS public.notify_accident_submitted() CASCADE;
DROP FUNCTION IF EXISTS public.generate_incident_number() CASCADE;

DROP TABLE IF EXISTS public.accident_report_media CASCADE;
DROP TABLE IF EXISTS public.accident_report_notes CASCADE;
DROP TABLE IF EXISTS public.accident_reports CASCADE;

-- =========================================================
-- 2. ENUMS / DOMAIN TABLES (use text + CHECK for flexibility)
-- =========================================================

-- =========================================================
-- 3. accidents
-- =========================================================
CREATE TABLE public.accidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text UNIQUE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  rental_id uuid REFERENCES public.rentals(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT','SUBMITTED','UNDER_REVIEW','WAITING_DOCS','INVESTIGATING',
    'PENDING_DETERMINATION','RESOLVED_NOT_AT_FAULT','RESOLVED_AT_FAULT','CLOSED','CANCELLED'
  )),
  severity text NOT NULL DEFAULT 'MINOR' CHECK (severity IN ('MINOR','MODERATE','SEVERE')),
  accident_datetime timestamptz NOT NULL DEFAULT now(),
  description text,
  police_involved boolean NOT NULL DEFAULT false,
  injury_involved boolean NOT NULL DEFAULT false,
  other_party_involved boolean NOT NULL DEFAULT false,
  location_lat numeric(10,7),
  location_lng numeric(10,7),
  location_address text,
  location_geohash text,
  city text,
  region text,
  assigned_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  closed_at timestamptz
);

CREATE INDEX idx_accidents_customer ON public.accidents(customer_id);
CREATE INDEX idx_accidents_driver ON public.accidents(driver_id);
CREATE INDEX idx_accidents_vehicle ON public.accidents(vehicle_id);
CREATE INDEX idx_accidents_status ON public.accidents(status);
CREATE INDEX idx_accidents_geohash ON public.accidents(location_geohash);
CREATE INDEX idx_accidents_created_at ON public.accidents(created_at DESC);

CREATE TRIGGER trg_accidents_updated_at
  BEFORE UPDATE ON public.accidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 4. accident_files
-- =========================================================
CREATE TABLE public.accident_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_id uuid NOT NULL REFERENCES public.accidents(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  file_type text NOT NULL CHECK (file_type IN ('PHOTO','VIDEO','DOCUMENT','POLICE_REPORT','WITNESS')),
  file_url text NOT NULL,
  thumbnail_url text,
  mime_type text,
  original_filename text,
  storage_path text,
  size_bytes integer,
  checklist_tag text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_accident_files_accident ON public.accident_files(accident_id);
CREATE INDEX idx_accident_files_customer ON public.accident_files(customer_id);

-- =========================================================
-- 5. accident_parties
-- =========================================================
CREATE TABLE public.accident_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_id uuid NOT NULL REFERENCES public.accidents(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  party_type text NOT NULL CHECK (party_type IN ('OTHER_DRIVER','WITNESS','POLICE')),
  name text,
  phone text,
  plate text,
  vehicle_info text,
  insurer text,
  insurance_policy text,
  report_number text,
  officer_department text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_accident_parties_accident ON public.accident_parties(accident_id);

-- =========================================================
-- 6. accident_notes
-- =========================================================
CREATE TABLE public.accident_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_id uuid NOT NULL REFERENCES public.accidents(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  visibility text NOT NULL CHECK (visibility IN ('INTERNAL','DRIVER')),
  body text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_accident_notes_accident ON public.accident_notes(accident_id);

-- =========================================================
-- 7. accident_status_history
-- =========================================================
CREATE TABLE public.accident_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_id uuid NOT NULL REFERENCES public.accidents(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_accident_status_history_accident ON public.accident_status_history(accident_id, created_at DESC);

-- =========================================================
-- 8. accident_determinations
-- =========================================================
CREATE TABLE public.accident_determinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_id uuid NOT NULL UNIQUE REFERENCES public.accidents(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  determination_status text NOT NULL DEFAULT 'PENDING' CHECK (determination_status IN ('PENDING','AT_FAULT','NOT_AT_FAULT','SHARED','UNDETERMINED')),
  at_fault boolean,
  fault_basis text,
  police_report_result text,
  score_impact boolean NOT NULL DEFAULT false,
  score_delta integer NOT NULL DEFAULT 0,
  financial_impact_estimate numeric(12,2),
  insurance_action_required boolean NOT NULL DEFAULT false,
  final_summary text,
  determined_by uuid,
  determined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- 9. accident_activity
-- =========================================================
CREATE TABLE public.accident_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_id uuid NOT NULL REFERENCES public.accidents(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  actor_type text,
  actor_id uuid,
  action_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_accident_activity_accident ON public.accident_activity(accident_id, created_at DESC);

-- =========================================================
-- 10. accident_notifications
-- =========================================================
CREATE TABLE public.accident_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_id uuid NOT NULL REFERENCES public.accidents(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP','SMS','IN_APP')),
  recipient text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING','SENT','DELIVERED','FAILED')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_accident_notifications_accident ON public.accident_notifications(accident_id);

-- =========================================================
-- 11. driver_scores + driver_score_events
-- =========================================================
CREATE TABLE public.driver_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  current_score integer NOT NULL DEFAULT 1000,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, driver_id)
);

CREATE TABLE public.driver_score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  accident_id uuid REFERENCES public.accidents(id) ON DELETE SET NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_driver_score_events_driver ON public.driver_score_events(driver_id, created_at DESC);

-- =========================================================
-- 12. CASE NUMBER GENERATOR (assigned at submission)
-- =========================================================
CREATE OR REPLACE FUNCTION public.generate_accident_case_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  year_part text;
  seq_num integer;
BEGIN
  year_part := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(case_number FROM 10) AS integer)), 0) + 1
    INTO seq_num
    FROM public.accidents
   WHERE case_number LIKE 'SIN-' || year_part || '-%';
  RETURN 'SIN-' || year_part || '-' || LPAD(seq_num::text, 6, '0');
END;
$$;

-- =========================================================
-- 13. STATUS TRANSITION GUARD + ACTIVITY LOG
-- =========================================================
CREATE OR REPLACE FUNCTION public.enforce_accident_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_allowed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- new rows must start as DRAFT or SUBMITTED
    IF NEW.status NOT IN ('DRAFT','SUBMITTED') THEN
      RAISE EXCEPTION 'New accident must be created in DRAFT or SUBMITTED status (got %)', NEW.status;
    END IF;
    -- assign case_number when submitted directly
    IF NEW.status = 'SUBMITTED' AND NEW.case_number IS NULL THEN
      NEW.case_number := public.generate_accident_case_number();
      NEW.submitted_at := COALESCE(NEW.submitted_at, now());
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- transition matrix
  v_allowed := (
    (OLD.status = 'DRAFT' AND NEW.status IN ('SUBMITTED','CANCELLED')) OR
    (OLD.status = 'SUBMITTED' AND NEW.status IN ('UNDER_REVIEW','CANCELLED')) OR
    (OLD.status = 'UNDER_REVIEW' AND NEW.status IN ('WAITING_DOCS','INVESTIGATING','CANCELLED')) OR
    (OLD.status = 'WAITING_DOCS' AND NEW.status IN ('UNDER_REVIEW','CANCELLED')) OR
    (OLD.status = 'INVESTIGATING' AND NEW.status IN ('PENDING_DETERMINATION','CANCELLED')) OR
    (OLD.status = 'PENDING_DETERMINATION' AND NEW.status IN ('RESOLVED_NOT_AT_FAULT','RESOLVED_AT_FAULT','CANCELLED')) OR
    (OLD.status = 'RESOLVED_NOT_AT_FAULT' AND NEW.status IN ('CLOSED','CANCELLED')) OR
    (OLD.status = 'RESOLVED_AT_FAULT' AND NEW.status IN ('CLOSED','CANCELLED'))
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid accident status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- assign case number on first submission
  IF NEW.status = 'SUBMITTED' AND NEW.case_number IS NULL THEN
    NEW.case_number := public.generate_accident_case_number();
    NEW.submitted_at := COALESCE(NEW.submitted_at, now());
  END IF;

  IF NEW.status = 'CLOSED' AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_accident_status_transition
  BEFORE INSERT OR UPDATE ON public.accidents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_accident_status_transition();

-- log status change after the fact
CREATE OR REPLACE FUNCTION public.log_accident_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)
     OR (TG_OP = 'INSERT' AND NEW.status <> 'DRAFT') THEN
    INSERT INTO public.accident_status_history(accident_id, customer_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NEW.customer_id, CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END, NEW.status, auth.uid());

    INSERT INTO public.accident_activity(accident_id, customer_id, actor_id, action_type, metadata)
    VALUES (NEW.id, NEW.customer_id, auth.uid(), 'status_changed',
            jsonb_build_object('from', CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_accident_status_change
  AFTER INSERT OR UPDATE ON public.accidents
  FOR EACH ROW EXECUTE FUNCTION public.log_accident_status_change();

-- =========================================================
-- 14. SEED driver_scores ON DRIVER CREATION
-- =========================================================
CREATE OR REPLACE FUNCTION public.seed_driver_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.driver_scores(customer_id, driver_id, current_score)
  VALUES (NEW.customer_id, NEW.id, 1000)
  ON CONFLICT (customer_id, driver_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_driver_score
  AFTER INSERT ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.seed_driver_score();

-- backfill existing drivers
INSERT INTO public.driver_scores(customer_id, driver_id, current_score)
SELECT customer_id, id, 1000 FROM public.drivers
ON CONFLICT (customer_id, driver_id) DO NOTHING;

-- =========================================================
-- 15. RLS POLICIES
-- =========================================================
ALTER TABLE public.accidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accident_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accident_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accident_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accident_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accident_determinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accident_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accident_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_score_events ENABLE ROW LEVEL SECURITY;

-- ---------- accidents ----------
CREATE POLICY "drivers view own accidents"
  ON public.accidents FOR SELECT
  USING (driver_id = public.current_driver_id());

CREATE POLICY "drivers insert own accidents"
  ON public.accidents FOR INSERT
  WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY "drivers update own draft accidents"
  ON public.accidents FOR UPDATE
  USING (driver_id = public.current_driver_id() AND status IN ('DRAFT','SUBMITTED','WAITING_DOCS'))
  WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY "admins view tenant accidents"
  ON public.accidents FOR SELECT
  USING (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager','support'])
        AND (customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL))
  );

CREATE POLICY "admins manage tenant accidents"
  ON public.accidents FOR UPDATE
  USING (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager'])
        AND (customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL))
  );

CREATE POLICY "platform owners delete accidents"
  ON public.accidents FOR DELETE USING (public.is_platform_owner());

-- ---------- accident_files ----------
CREATE POLICY "drivers view own files"
  ON public.accident_files FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id AND a.driver_id = public.current_driver_id()));

CREATE POLICY "drivers insert own files"
  ON public.accident_files FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id AND a.driver_id = public.current_driver_id()));

CREATE POLICY "drivers delete own draft files"
  ON public.accident_files FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id AND a.driver_id = public.current_driver_id() AND a.status IN ('DRAFT','WAITING_DOCS')));

CREATE POLICY "admins view tenant files"
  ON public.accident_files FOR SELECT
  USING (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager','support'])
        AND EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id
                    AND (a.customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL)))
  );

CREATE POLICY "admins manage tenant files"
  ON public.accident_files FOR ALL
  USING (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager'])
        AND EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id
                    AND (a.customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL)))
  )
  WITH CHECK (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager'])
        AND EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id
                    AND (a.customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL)))
  );

-- ---------- accident_parties ----------
CREATE POLICY "drivers view own parties"
  ON public.accident_parties FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id AND a.driver_id = public.current_driver_id()));

CREATE POLICY "drivers manage own parties"
  ON public.accident_parties FOR ALL
  USING (EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id AND a.driver_id = public.current_driver_id() AND a.status IN ('DRAFT','SUBMITTED','WAITING_DOCS')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id AND a.driver_id = public.current_driver_id()));

CREATE POLICY "admins manage tenant parties"
  ON public.accident_parties FOR ALL
  USING (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager','support'])
        AND EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id
                    AND (a.customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL)))
  )
  WITH CHECK (
    public.is_platform_owner()
    OR public.has_admin_role_in(ARRAY['super_admin','manager'])
  );

-- ---------- accident_notes ----------
-- Drivers ONLY see DRIVER-visibility notes
CREATE POLICY "drivers view driver notes"
  ON public.accident_notes FOR SELECT
  USING (visibility = 'DRIVER'
         AND EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id AND a.driver_id = public.current_driver_id()));

CREATE POLICY "drivers add driver notes"
  ON public.accident_notes FOR INSERT
  WITH CHECK (visibility = 'DRIVER'
              AND EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id AND a.driver_id = public.current_driver_id()));

CREATE POLICY "admins view all notes"
  ON public.accident_notes FOR SELECT
  USING (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager','support'])
        AND EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id
                    AND (a.customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL)))
  );

CREATE POLICY "admins manage notes"
  ON public.accident_notes FOR ALL
  USING (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager'])
        AND EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id
                    AND (a.customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL)))
  )
  WITH CHECK (
    public.is_platform_owner()
    OR public.has_admin_role_in(ARRAY['super_admin','manager'])
  );

-- ---------- accident_status_history ----------
CREATE POLICY "drivers view own history"
  ON public.accident_status_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id AND a.driver_id = public.current_driver_id()));

CREATE POLICY "admins view tenant history"
  ON public.accident_status_history FOR SELECT
  USING (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager','support'])
        AND EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id
                    AND (a.customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL)))
  );

-- ---------- accident_determinations ----------
CREATE POLICY "drivers view own determination"
  ON public.accident_determinations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id AND a.driver_id = public.current_driver_id())
         AND determination_status <> 'PENDING');

CREATE POLICY "admins manage determinations"
  ON public.accident_determinations FOR ALL
  USING (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager'])
        AND EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id
                    AND (a.customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL)))
  )
  WITH CHECK (
    public.is_platform_owner()
    OR public.has_admin_role_in(ARRAY['super_admin','manager'])
  );

-- ---------- accident_activity ----------
CREATE POLICY "drivers view own activity"
  ON public.accident_activity FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id AND a.driver_id = public.current_driver_id()));

CREATE POLICY "admins view tenant activity"
  ON public.accident_activity FOR SELECT
  USING (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager','support'])
        AND EXISTS (SELECT 1 FROM public.accidents a WHERE a.id = accident_id
                    AND (a.customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL)))
  );

-- ---------- accident_notifications ----------
CREATE POLICY "admins view notifications"
  ON public.accident_notifications FOR SELECT
  USING (
    public.is_platform_owner()
    OR public.has_admin_role_in(ARRAY['super_admin','manager','support'])
  );

-- ---------- driver_scores ----------
CREATE POLICY "drivers view own score"
  ON public.driver_scores FOR SELECT
  USING (driver_id = public.current_driver_id());

CREATE POLICY "admins view tenant scores"
  ON public.driver_scores FOR SELECT
  USING (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager','support'])
        AND (customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL))
  );

CREATE POLICY "admins manage scores"
  ON public.driver_scores FOR ALL
  USING (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager'])
        AND (customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL))
  )
  WITH CHECK (
    public.is_platform_owner()
    OR public.has_admin_role_in(ARRAY['super_admin','manager'])
  );

-- ---------- driver_score_events ----------
CREATE POLICY "drivers view own score events"
  ON public.driver_score_events FOR SELECT
  USING (driver_id = public.current_driver_id());

CREATE POLICY "admins view tenant score events"
  ON public.driver_score_events FOR SELECT
  USING (
    public.is_platform_owner()
    OR (public.has_admin_role_in(ARRAY['super_admin','manager','support'])
        AND (customer_id = public.current_customer_id() OR public.current_customer_id() IS NULL))
  );

CREATE POLICY "admins insert score events"
  ON public.driver_score_events FOR INSERT
  WITH CHECK (
    public.is_platform_owner()
    OR public.has_admin_role_in(ARRAY['super_admin','manager'])
  );

-- =========================================================
-- 16. STORAGE BUCKET FOR EVIDENCE
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('accident-evidence', 'accident-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- driver can read/write objects under their own accident folder
-- path convention: {customer_id}/{accident_id}/{photos|videos|docs}/{file}
CREATE POLICY "drivers read own evidence"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'accident-evidence'
    AND EXISTS (
      SELECT 1 FROM public.accidents a
      WHERE a.driver_id = public.current_driver_id()
        AND a.id::text = (storage.foldername(name))[2]
    )
  );

CREATE POLICY "drivers upload own evidence"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'accident-evidence'
    AND EXISTS (
      SELECT 1 FROM public.accidents a
      WHERE a.driver_id = public.current_driver_id()
        AND a.id::text = (storage.foldername(name))[2]
    )
  );

CREATE POLICY "drivers delete own draft evidence"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'accident-evidence'
    AND EXISTS (
      SELECT 1 FROM public.accidents a
      WHERE a.driver_id = public.current_driver_id()
        AND a.status IN ('DRAFT','WAITING_DOCS')
        AND a.id::text = (storage.foldername(name))[2]
    )
  );

CREATE POLICY "admins read tenant evidence"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'accident-evidence'
    AND (
      public.is_platform_owner()
      OR public.has_admin_role_in(ARRAY['super_admin','manager','support'])
    )
  );

CREATE POLICY "admins manage tenant evidence"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'accident-evidence'
    AND (
      public.is_platform_owner()
      OR public.has_admin_role_in(ARRAY['super_admin','manager'])
    )
  )
  WITH CHECK (
    bucket_id = 'accident-evidence'
    AND (
      public.is_platform_owner()
      OR public.has_admin_role_in(ARRAY['super_admin','manager'])
    )
  );