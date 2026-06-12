CREATE OR REPLACE FUNCTION public.fleet_control_remind(p_control uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.vehicle_inspections;
  v_target public.vehicle_inspections;
  v_cooldown_hours int;
  v_now timestamptz := now();
  v_cycle int;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id = p_control FOR UPDATE;
  IF v_row IS NULL THEN RAISE EXCEPTION 'control_not_found'; END IF;
  PERFORM public.fc_require_admin(v_row.customer_id);

  IF v_row.status = 'approved' THEN
    SELECT * INTO v_target
      FROM public.vehicle_inspections
     WHERE id <> v_row.id
       AND customer_id IS NOT DISTINCT FROM v_row.customer_id
       AND vehicle_id = v_row.vehicle_id
       AND driver_id IS NOT DISTINCT FROM v_row.driver_id
       AND status IN ('pending','overdue','rejected','blocked')
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF v_target.id IS NULL THEN
      v_cycle := COALESCE(NULLIF(v_row.cycle_days,0),
                  COALESCE((SELECT (setting_value)::text::int FROM public.platform_settings
                             WHERE setting_key='fleet_control.cycle_days'),14));
      INSERT INTO public.vehicle_inspections
        (customer_id, vehicle_id, driver_id, rental_id, status, cycle_days, due_at, reminder_count, last_reminder_at)
      VALUES
        (v_row.customer_id, v_row.vehicle_id, v_row.driver_id, v_row.rental_id, 'pending', v_cycle,
         v_now + (v_cycle || ' days')::interval, 1, v_now)
      RETURNING * INTO v_target;
    ELSE
      UPDATE public.vehicle_inspections
         SET status = CASE WHEN status IN ('rejected','blocked') THEN status ELSE 'pending' END,
             reminder_count = reminder_count + 1,
             last_reminder_at = v_now,
             updated_at = v_now
       WHERE id = v_target.id
       RETURNING * INTO v_target;
    END IF;

    IF v_target.driver_id IS NOT NULL THEN
      INSERT INTO public.notifications (driver_id, customer_id, notification_type, title, message)
      VALUES (v_target.driver_id, v_target.customer_id, 'fleet_control_reminder',
              'Nouveau contrôle véhicule',
              'Votre gestionnaire demande de nouvelles photos du véhicule.');
    END IF;

    PERFORM public.fleet_control_log(v_target.id, 'reminder_sent',
      jsonb_build_object('source_control', v_row.id, 'reminder_count', v_target.reminder_count), 'admin');

    RETURN jsonb_build_object('sent', true, 'control_id', v_target.id, 'created_or_reused_cycle', true);
  END IF;

  v_cooldown_hours := COALESCE((SELECT (setting_value)::text::int FROM public.platform_settings
                                  WHERE setting_key='fleet_control.relance_cooldown_hours'), 24);
  IF v_row.last_reminder_at IS NOT NULL
     AND v_row.last_reminder_at + (v_cooldown_hours || ' hours')::interval > v_now THEN
    RETURN jsonb_build_object('sent', false,
      'cooldown_until', v_row.last_reminder_at + (v_cooldown_hours || ' hours')::interval,
      'control_id', v_row.id);
  END IF;

  UPDATE public.vehicle_inspections
     SET reminder_count = reminder_count + 1, last_reminder_at = v_now, updated_at = v_now
   WHERE id = p_control
   RETURNING * INTO v_target;

  IF v_target.driver_id IS NOT NULL THEN
    INSERT INTO public.notifications (driver_id, customer_id, notification_type, title, message)
    VALUES (v_target.driver_id, v_target.customer_id, 'fleet_control_reminder',
            'Contrôle véhicule en attente',
            'Soumettez vos photos avant immobilisation.');
  END IF;
  PERFORM public.fleet_control_log(p_control, 'reminder_sent',
    jsonb_build_object('reminder_count', v_target.reminder_count), 'admin');
  RETURN jsonb_build_object('sent', true, 'control_id', v_target.id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fleet_control_remind(uuid) TO authenticated;

DROP POLICY IF EXISTS "Admins can manage favorites" ON public.driver_favorites;
CREATE POLICY "Admins can manage tenant favorites"
ON public.driver_favorites
FOR ALL
TO authenticated
USING (
  public.is_platform_owner()
  OR EXISTS (
    SELECT 1
      FROM public.drivers d
     WHERE d.id = driver_favorites.driver_id
       AND d.customer_id = public.current_customer_id()
  )
)
WITH CHECK (
  public.is_platform_owner()
  OR EXISTS (
    SELECT 1
      FROM public.drivers d
     WHERE d.id = driver_favorites.driver_id
       AND d.customer_id = public.current_customer_id()
  )
);

CREATE OR REPLACE FUNCTION public.storage_first_path_customer_id(p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $function$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN ((storage.foldername(p_name))[1])::uuid
    ELSE NULL
  END
$function$;

GRANT EXECUTE ON FUNCTION public.storage_first_path_customer_id(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_can_write_customer_storage_path(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $function$
  SELECT public.is_platform_owner()
    OR public.storage_first_path_customer_id(p_name) = public.current_customer_id()
$function$;

GRANT EXECUTE ON FUNCTION public.admin_can_write_customer_storage_path(text) TO authenticated;

DROP POLICY IF EXISTS "Admins can upload billing logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update billing logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete billing logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload vehicle photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins update vehicle photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete vehicle photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage profile photos - insert" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage profile photos - update" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage profile photos - delete" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload police reports" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update police reports" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete police reports" ON storage.objects;

CREATE POLICY "Admins upload tenant billing logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'billing-logos'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
);

CREATE POLICY "Admins update tenant billing logos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'billing-logos'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
)
WITH CHECK (
  bucket_id = 'billing-logos'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
);

CREATE POLICY "Admins delete tenant billing logos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'billing-logos'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
);

CREATE POLICY "Admins upload tenant vehicle photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vehicle-photos'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
);

CREATE POLICY "Admins update tenant vehicle photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'vehicle-photos'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
)
WITH CHECK (
  bucket_id = 'vehicle-photos'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
);

CREATE POLICY "Admins delete tenant vehicle photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'vehicle-photos'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
);

CREATE POLICY "Admins upload tenant profile photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
);

CREATE POLICY "Admins update tenant profile photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
)
WITH CHECK (
  bucket_id = 'profile-photos'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
);

CREATE POLICY "Admins delete tenant profile photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
);

CREATE POLICY "Admins upload tenant police reports"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'police-reports'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
);

CREATE POLICY "Admins update tenant police reports"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'police-reports'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
)
WITH CHECK (
  bucket_id = 'police-reports'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
);

CREATE POLICY "Admins delete tenant police reports"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'police-reports'
  AND public.is_admin()
  AND public.admin_can_write_customer_storage_path(name)
);