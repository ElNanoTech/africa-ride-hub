-- =========================================================
-- Sinistres notifications: status change, driver-visible notes, new submission
-- =========================================================

-- 1) Notify driver when case status changes (admin-driven changes)
CREATE OR REPLACE FUNCTION public.notify_driver_on_accident_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_message text;
  v_type text := 'accident_report_submitted';
BEGIN
  -- Only fire on UPDATE when status actually changes; skip DRAFT
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status = 'DRAFT' THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'UNDER_REVIEW' THEN
      v_title := '📋 Dossier en revue';
      v_message := 'Votre dossier ' || COALESCE(NEW.case_number, '') || ' est en cours d''examen.';
    WHEN 'WAITING_DOCS' THEN
      v_title := '📎 Documents requis';
      v_message := 'Des documents complémentaires sont attendus pour votre dossier ' || COALESCE(NEW.case_number, '') || '.';
    WHEN 'INVESTIGATING' THEN
      v_title := '🔍 Enquête en cours';
      v_message := 'Une enquête a été ouverte sur votre dossier ' || COALESCE(NEW.case_number, '') || '.';
    WHEN 'PENDING_DETERMINATION' THEN
      v_title := '⚖️ Détermination en cours';
      v_message := 'La responsabilité est en cours de détermination pour le dossier ' || COALESCE(NEW.case_number, '') || '.';
    WHEN 'RESOLVED_NOT_AT_FAULT' THEN
      v_title := '✅ Non responsable';
      v_message := 'Bonne nouvelle: vous n''êtes pas responsable pour le dossier ' || COALESCE(NEW.case_number, '') || '.';
    WHEN 'RESOLVED_AT_FAULT' THEN
      v_title := '⚠️ Responsabilité retenue';
      v_message := 'Une responsabilité a été retenue pour le dossier ' || COALESCE(NEW.case_number, '') || '. Voir les détails dans l''app.';
    WHEN 'CLOSED' THEN
      v_title := '🔒 Dossier clôturé';
      v_message := 'Votre dossier ' || COALESCE(NEW.case_number, '') || ' est clôturé.';
      v_type := 'accident_report_closed';
    WHEN 'CANCELLED' THEN
      v_title := 'Dossier annulé';
      v_message := 'Votre dossier ' || COALESCE(NEW.case_number, '') || ' a été annulé.';
    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO public.notifications (driver_id, customer_id, title, message, notification_type, is_read)
  VALUES (NEW.driver_id, NEW.customer_id, v_title, v_message, v_type, false);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_driver_accident_status ON public.accidents;
CREATE TRIGGER trg_notify_driver_accident_status
AFTER UPDATE ON public.accidents
FOR EACH ROW
EXECUTE FUNCTION public.notify_driver_on_accident_status_change();

-- 2) Notify driver when an admin posts a DRIVER-visible note
CREATE OR REPLACE FUNCTION public.notify_driver_on_accident_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver uuid;
  v_customer uuid;
  v_case text;
BEGIN
  IF NEW.visibility <> 'DRIVER' THEN RETURN NEW; END IF;

  SELECT driver_id, customer_id, case_number
    INTO v_driver, v_customer, v_case
  FROM public.accidents
  WHERE id = NEW.accident_id;

  IF v_driver IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (driver_id, customer_id, title, message, notification_type, is_read)
  VALUES (
    v_driver, v_customer,
    '💬 Nouveau message',
    'Un message a été ajouté à votre dossier ' || COALESCE(v_case, '') || '.',
    'accident_report_submitted',
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_driver_accident_note ON public.accident_notes;
CREATE TRIGGER trg_notify_driver_accident_note
AFTER INSERT ON public.accident_notes
FOR EACH ROW
EXECUTE FUNCTION public.notify_driver_on_accident_note();

-- 3) Notify all active admins when a driver submits a new case
CREATE OR REPLACE FUNCTION public.notify_admins_on_accident_submit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_name text;
BEGIN
  -- fire on transition into SUBMITTED
  IF TG_OP = 'INSERT' AND NEW.status = 'SUBMITTED' THEN
    -- ok
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'SUBMITTED' AND OLD.status IS DISTINCT FROM 'SUBMITTED' THEN
    -- ok
  ELSE
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_driver_name FROM public.drivers WHERE id = NEW.driver_id;

  INSERT INTO public.notifications (recipient_user_id, customer_id, title, message, notification_type, is_read, channel)
  SELECT au.user_id, NEW.customer_id,
         '🚨 Nouveau sinistre',
         'Nouveau cas ' || COALESCE(NEW.case_number, '') || ' soumis par ' || COALESCE(v_driver_name, 'un conducteur') || '.',
         'accident_report_submitted', false, 'in_app'
  FROM public.admin_users au
  WHERE au.is_active = true
    AND au.user_id IS NOT NULL
    AND (NEW.customer_id IS NULL OR au.customer_id = NEW.customer_id OR au.is_platform_owner = true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_accident_submit ON public.accidents;
CREATE TRIGGER trg_notify_admins_accident_submit
AFTER INSERT OR UPDATE ON public.accidents
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_accident_submit();