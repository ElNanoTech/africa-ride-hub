-- 1. Late-return penalty trigger
CREATE OR REPLACE FUNCTION public.apply_late_return_penalty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'overdue_return'
     AND (OLD.status IS NULL OR OLD.status <> 'overdue_return') THEN
    INSERT INTO public.score_events (
      driver_id, rental_id, event_type, score_delta, reason, source
    )
    VALUES (
      NEW.driver_id, NEW.id, 'late_return',
      -10, 'Retour en retard (au-delà de return_due_at)', 'system_cron'
    )
    ON CONFLICT (rental_id, event_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_late_return_penalty ON public.rentals;
CREATE TRIGGER trg_apply_late_return_penalty
  AFTER UPDATE OF status ON public.rentals
  FOR EACH ROW EXECUTE FUNCTION public.apply_late_return_penalty();

-- 2. Cron callable (will be replaced by post-paid version in migration 6)
CREATE OR REPLACE FUNCTION public.mark_overdue_rentals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH updated AS (
    UPDATE public.rentals
       SET status = 'overdue_return'
     WHERE status = 'active'
       AND return_due_at IS NOT NULL
       AND return_due_at < now()
       AND returned_at IS NULL
     RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_overdue_rentals() TO service_role;

-- 3. Schedule the cron job
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job WHERE jobname = 'mark_overdue_rentals_5min';

    PERFORM cron.schedule(
      'mark_overdue_rentals_5min',
      '*/5 * * * *',
      $cron$ SELECT public.mark_overdue_rentals(); $cron$
    );
  END IF;
END $$;

-- 4. Test data cleanup
DO $$
DECLARE
  v_driver_ids uuid[];
  v_user_ids uuid[];
BEGIN
  SELECT array_agg(id), array_agg(user_id)
    INTO v_driver_ids, v_user_ids
  FROM public.drivers
  WHERE full_name IN ('Jean Kouassou Test', 'Konan Test UAT');

  IF v_driver_ids IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.rental_adjustments
   WHERE rental_id IN (SELECT id FROM public.rentals WHERE driver_id = ANY(v_driver_ids));
  DELETE FROM public.payments       WHERE driver_id = ANY(v_driver_ids);
  DELETE FROM public.rentals        WHERE driver_id = ANY(v_driver_ids);
  DELETE FROM public.score_events   WHERE driver_id = ANY(v_driver_ids);
  DELETE FROM public.credit_score_breakdowns
   WHERE credit_score_id IN (SELECT id FROM public.credit_scores WHERE driver_id = ANY(v_driver_ids));
  DELETE FROM public.credit_scores  WHERE driver_id = ANY(v_driver_ids);
  DELETE FROM public.notifications  WHERE driver_id = ANY(v_driver_ids);
  DELETE FROM public.drivers        WHERE id = ANY(v_driver_ids);

  DELETE FROM auth.users
   WHERE id = ANY(v_user_ids)
     AND email LIKE 'driver_%@dam-flotte.local';
END $$;