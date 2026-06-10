
-- 1. Add due_days for mandatory modules
ALTER TABLE public.training_modules
  ADD COLUMN IF NOT EXISTS due_days integer;

-- 2. Allow new notification types
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_notification_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type = ANY (ARRAY[
    'score_update','payment_reminder','loan_status','rental_status','safety_tip',
    'announcement','income_status','system','payment_grace_started','payment_final_overdue',
    'rental_pickup_confirmed','vehicle_disabled','kyc_approved','kyc_rejected',
    'accident_report_submitted','accident_report_closed','invoice_issued','invoice_cancelled',
    'monthly_statement_ready','training_completed','training_reminder'
  ]));

-- 3. Trigger: notify admins of the driver's customer when a module is completed
CREATE OR REPLACE FUNCTION public.notify_admins_on_training_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver record;
  v_module record;
  v_admin record;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    SELECT d.id, d.customer_id, d.full_name INTO v_driver
      FROM public.drivers d WHERE d.id = NEW.driver_id;
    SELECT m.id, m.title, m.customer_id INTO v_module
      FROM public.training_modules m WHERE m.id = NEW.module_id;

    -- Notify each admin user that belongs to the driver's customer
    -- (plus platform owners, who have global visibility)
    FOR v_admin IN
      SELECT user_id FROM public.admin_users
      WHERE user_id IS NOT NULL
        AND is_active = true
        AND (is_platform_owner = true OR customer_id = v_driver.customer_id)
    LOOP
      INSERT INTO public.notifications (
        recipient_user_id, customer_id, notification_type, title, message, channel, send_status
      ) VALUES (
        v_admin.user_id,
        v_driver.customer_id,
        'training_completed',
        'Formation terminée',
        COALESCE(v_driver.full_name, 'Un chauffeur') || ' a terminé « ' || COALESCE(v_module.title, 'une formation') || ' »' ||
          CASE WHEN NEW.score IS NOT NULL THEN ' (score: ' || NEW.score || '%)' ELSE '' END,
        'in_app',
        'sent'
      );
    END LOOP;

    -- Also notify the driver themselves (in-app confirmation)
    INSERT INTO public.notifications (
      driver_id, customer_id, notification_type, title, message, channel, send_status
    ) VALUES (
      NEW.driver_id,
      v_driver.customer_id,
      'training_completed',
      'Bravo !',
      'Vous avez terminé la formation « ' || COALESCE(v_module.title, '') || ' ». Continuez ainsi !',
      'in_app',
      'sent'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_training_completion ON public.training_progress;
CREATE TRIGGER trg_notify_admins_training_completion
AFTER INSERT OR UPDATE ON public.training_progress
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_training_completion();

-- 4. Completion stats helper
CREATE OR REPLACE FUNCTION public.get_module_completion_stats(p_module_id uuid)
RETURNS TABLE (
  total_drivers bigint,
  completed bigint,
  in_progress bigint,
  not_started bigint,
  completion_rate numeric,
  avg_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH m AS (
    SELECT customer_id FROM public.training_modules WHERE id = p_module_id
  ),
  drv AS (
    SELECT d.id FROM public.drivers d, m
    WHERE m.customer_id IS NULL OR d.customer_id = m.customer_id
  ),
  prog AS (
    SELECT tp.* FROM public.training_progress tp
    WHERE tp.module_id = p_module_id
  )
  SELECT
    (SELECT count(*) FROM drv)                                        AS total_drivers,
    (SELECT count(*) FROM prog WHERE status='completed')              AS completed,
    (SELECT count(*) FROM prog WHERE status='in_progress')            AS in_progress,
    GREATEST((SELECT count(*) FROM drv) - (SELECT count(*) FROM prog), 0) AS not_started,
    CASE WHEN (SELECT count(*) FROM drv) = 0 THEN 0
         ELSE round(100.0 * (SELECT count(*) FROM prog WHERE status='completed') / (SELECT count(*) FROM drv), 1)
    END                                                               AS completion_rate,
    (SELECT round(avg(score)::numeric, 1) FROM prog WHERE score IS NOT NULL) AS avg_score;
$$;

GRANT EXECUTE ON FUNCTION public.get_module_completion_stats(uuid) TO authenticated, service_role;
