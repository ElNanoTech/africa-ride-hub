-- =============================================
-- Accident / Incident Management Module
-- =============================================

-- 1. Create accident_reports table
CREATE TABLE public.accident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id),
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  vehicle_id uuid REFERENCES public.vehicles(id),
  rental_id uuid REFERENCES public.rentals(id),
  incident_number text UNIQUE,
  description text,
  latitude double precision,
  longitude double precision,
  location_accuracy double precision,
  location_missing boolean NOT NULL DEFAULT false,
  min_photos_required integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'submitted',
  severity text,
  responsibility text DEFAULT 'undetermined',
  score_penalty_points integer,
  score_penalty_applied boolean NOT NULL DEFAULT false,
  closed_at timestamp with time zone,
  closed_by uuid REFERENCES public.admin_users(id),
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Create accident_report_media table
CREATE TABLE public.accident_report_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_report_id uuid NOT NULL REFERENCES public.accident_reports(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_type text NOT NULL DEFAULT 'photo',
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3. Create accident_report_notes table
CREATE TABLE public.accident_report_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_report_id uuid NOT NULL REFERENCES public.accident_reports(id) ON DELETE CASCADE,
  author_admin_id uuid NOT NULL REFERENCES public.admin_users(id),
  note_text text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 4. Generate incident number function
CREATE OR REPLACE FUNCTION public.generate_incident_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  year_part TEXT;
  seq_num INTEGER;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(incident_number FROM 10) AS INTEGER)), 0) + 1
  INTO seq_num
  FROM public.accident_reports
  WHERE incident_number LIKE 'INC-' || year_part || '-%';
  NEW.incident_number := 'INC-' || year_part || '-' || LPAD(seq_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_generate_incident_number
  BEFORE INSERT ON public.accident_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_incident_number();

-- 5. Updated_at trigger
CREATE TRIGGER trigger_accident_reports_updated_at
  BEFORE UPDATE ON public.accident_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Enable RLS
ALTER TABLE public.accident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accident_report_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accident_report_notes ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for accident_reports
CREATE POLICY "driver creates own accident report"
  ON public.accident_reports FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = current_driver_id());

CREATE POLICY "driver views own accident reports"
  ON public.accident_reports FOR SELECT
  TO public
  USING (driver_id = current_driver_id() OR is_admin());

CREATE POLICY "admin manages accident reports"
  ON public.accident_reports FOR UPDATE
  TO public
  USING (has_admin_role_in(ARRAY['super_admin', 'manager', 'agent_support']))
  WITH CHECK (has_admin_role_in(ARRAY['super_admin', 'manager', 'agent_support']));

CREATE POLICY "admin deletes accident reports"
  ON public.accident_reports FOR DELETE
  TO public
  USING (has_admin_role_in(ARRAY['super_admin', 'manager']));

-- 8. RLS Policies for accident_report_media
CREATE POLICY "driver inserts own accident media"
  ON public.accident_report_media FOR INSERT
  TO authenticated
  WITH CHECK (accident_report_id IN (
    SELECT id FROM public.accident_reports WHERE driver_id = current_driver_id()
  ) OR is_admin());

CREATE POLICY "driver views own accident media"
  ON public.accident_report_media FOR SELECT
  TO public
  USING (accident_report_id IN (
    SELECT id FROM public.accident_reports WHERE driver_id = current_driver_id()
  ) OR is_admin());

CREATE POLICY "admin manages accident media"
  ON public.accident_report_media FOR ALL
  TO public
  USING (is_admin())
  WITH CHECK (is_admin());

-- 9. RLS Policies for accident_report_notes
CREATE POLICY "admin manages accident notes"
  ON public.accident_report_notes FOR ALL
  TO public
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "driver views non-internal notes"
  ON public.accident_report_notes FOR SELECT
  TO public
  USING (
    is_internal = false AND accident_report_id IN (
      SELECT id FROM public.accident_reports WHERE driver_id = current_driver_id()
    )
  );

-- 10. Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('accident-photos', 'accident-photos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('police-reports', 'police-reports', false);

-- Storage RLS for accident-photos
CREATE POLICY "Drivers upload accident photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'accident-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Drivers view own accident photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'accident-photos' AND ((storage.foldername(name))[1] = auth.uid()::text OR EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)));

CREATE POLICY "Admins manage accident photos"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'accident-photos' AND EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true))
  WITH CHECK (bucket_id = 'accident-photos' AND EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true));

-- Storage RLS for police-reports
CREATE POLICY "Admins upload police reports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'police-reports' AND EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Admins view police reports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'police-reports' AND EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Drivers view own police reports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'police-reports' AND (storage.foldername(name))[1] IN (
    SELECT ar.id::text FROM accident_reports ar
    JOIN drivers d ON d.id = ar.driver_id
    WHERE d.auth_user_id = auth.uid() OR d.user_id = auth.uid()
  ));

-- 11. Feature flag
INSERT INTO public.feature_flags (flag_key, flag_value, description, category, is_platform_only)
VALUES ('enable_accident_reporting', true, 'Active le module de declaration d''accidents / sinistralite', 'fleet', false);

-- 12. Scoring config for accident penalties
INSERT INTO public.scoring_config (config_key, config_value, description)
VALUES 
  ('accident_penalty_faible', '5'::jsonb, 'Points de penalite pour accident de severite faible (responsabilite chauffeur)'),
  ('accident_penalty_moyen_grave', '15'::jsonb, 'Points de penalite pour accident moyen-grave (responsabilite chauffeur)'),
  ('accident_penalty_grave', '25'::jsonb, 'Points de penalite pour accident grave (responsabilite chauffeur)'),
  ('accident_penalty_extremement_grave', '40'::jsonb, 'Points de penalite pour accident extremement grave (responsabilite chauffeur)');

-- 13. Notification triggers
CREATE OR REPLACE FUNCTION public.notify_accident_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (driver_id, title, message, notification_type, customer_id)
  VALUES (
    NEW.driver_id,
    'Declaration d''accident soumise',
    'Votre declaration d''accident ' || NEW.incident_number || ' a ete enregistree. Un administrateur examinera votre dossier.',
    'accident_report_submitted',
    NEW.customer_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_accident_submitted
  AFTER INSERT ON public.accident_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_accident_submitted();

-- 14. Notification + score penalty on closure
CREATE OR REPLACE FUNCTION public.handle_accident_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_penalty INTEGER := 0;
  v_config_key TEXT;
BEGIN
  -- Only trigger when status changes to 'termine'
  IF NEW.status <> 'termine' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Set closed_at
  NEW.closed_at := now();

  -- Notify driver
  INSERT INTO public.notifications (driver_id, title, message, notification_type, customer_id)
  VALUES (
    NEW.driver_id,
    'Incident clos - ' || NEW.incident_number,
    CASE 
      WHEN NEW.responsibility = 'driver_right' THEN 'L''incident ' || NEW.incident_number || ' a ete cloture. Vous n''etes pas responsable. Aucun impact sur votre score.'
      WHEN NEW.responsibility = 'driver_fault' THEN 'L''incident ' || NEW.incident_number || ' a ete cloture. Votre responsabilite a ete etablie. Votre score de credit sera impacte.'
      ELSE 'L''incident ' || NEW.incident_number || ' a ete cloture.'
    END,
    'accident_report_closed',
    NEW.customer_id
  );

  -- Apply score penalty if driver at fault and not already applied
  IF NEW.responsibility = 'driver_fault' AND NEW.score_penalty_applied = false AND NEW.severity IS NOT NULL THEN
    v_config_key := 'accident_penalty_' || NEW.severity;
    
    SELECT COALESCE((config_value)::integer, 0)
    INTO v_penalty
    FROM public.scoring_config
    WHERE config_key = v_config_key;

    IF v_penalty > 0 THEN
      NEW.score_penalty_points := v_penalty;
      NEW.score_penalty_applied := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_handle_accident_closure
  BEFORE UPDATE ON public.accident_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_accident_closure();

-- 15. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.accident_reports;