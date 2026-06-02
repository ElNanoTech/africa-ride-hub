-- Migration 1/2: vehicle assignment sync
CREATE OR REPLACE FUNCTION public.sync_vehicle_on_rental_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_out boolean := COALESCE(OLD.status, '') IN ('active', 'paid', 'payment_overdue', 'overdue_return', 'vehicle_disabled');
  v_new_out boolean := NEW.status IN ('active', 'paid', 'payment_overdue', 'overdue_return', 'vehicle_disabled');
BEGIN
  IF v_new_out AND NOT v_old_out THEN
    UPDATE public.vehicles SET status = 'rented'
     WHERE id = NEW.vehicle_id AND status IN ('available', 'maintenance');
    UPDATE public.drivers SET active_vehicle_id = NEW.vehicle_id
     WHERE id = NEW.driver_id;
  ELSIF v_old_out AND NOT v_new_out THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.rentals r
       WHERE r.vehicle_id = NEW.vehicle_id AND r.id <> NEW.id
         AND r.status IN ('active', 'paid', 'payment_overdue', 'overdue_return', 'vehicle_disabled')
    ) THEN
      UPDATE public.vehicles SET status = 'available'
       WHERE id = NEW.vehicle_id AND status = 'rented';
    END IF;
    UPDATE public.drivers SET active_vehicle_id = NULL
     WHERE id = NEW.driver_id AND active_vehicle_id = NEW.vehicle_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_vehicle_on_rental_status_change ON public.rentals;
CREATE TRIGGER trg_sync_vehicle_on_rental_status_change
  AFTER INSERT OR UPDATE OF status ON public.rentals
  FOR EACH ROW EXECUTE FUNCTION public.sync_vehicle_on_rental_status_change();

DO $$
BEGIN
  UPDATE public.vehicles v SET status = 'rented'
   WHERE v.status = 'available'
     AND EXISTS (SELECT 1 FROM public.rentals r WHERE r.vehicle_id = v.id
                  AND r.status IN ('active', 'paid', 'payment_overdue', 'overdue_return', 'vehicle_disabled'));

  UPDATE public.vehicles v SET status = 'available'
   WHERE v.status = 'rented'
     AND NOT EXISTS (SELECT 1 FROM public.rentals r WHERE r.vehicle_id = v.id
                      AND r.status IN ('active', 'paid', 'payment_overdue', 'overdue_return', 'vehicle_disabled'));

  UPDATE public.drivers d SET active_vehicle_id = (
    SELECT r.vehicle_id FROM public.rentals r WHERE r.driver_id = d.id
      AND r.status IN ('active', 'paid', 'payment_overdue', 'overdue_return', 'vehicle_disabled')
    ORDER BY r.created_at DESC LIMIT 1
  )
   WHERE EXISTS (SELECT 1 FROM public.rentals r WHERE r.driver_id = d.id
                  AND r.status IN ('active', 'paid', 'payment_overdue', 'overdue_return', 'vehicle_disabled'));

  UPDATE public.drivers d SET active_vehicle_id = NULL
   WHERE d.active_vehicle_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.rentals r WHERE r.driver_id = d.id
                      AND r.status IN ('active', 'paid', 'payment_overdue', 'overdue_return', 'vehicle_disabled'));
END $$;

-- Migration 2/2: lock vehicle on approval + REPLICA IDENTITY FULL
ALTER TABLE public.rentals  REPLICA IDENTITY FULL;
ALTER TABLE public.vehicles REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.sync_vehicle_on_rental_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out_states constant text[] := ARRAY['approved', 'paid', 'active', 'payment_overdue', 'overdue_return', 'vehicle_disabled'];
  v_old_out boolean := COALESCE(OLD.status, '') = ANY(v_out_states);
  v_new_out boolean := NEW.status = ANY(v_out_states);
BEGIN
  IF v_new_out AND NOT v_old_out THEN
    UPDATE public.vehicles SET status = 'rented'
     WHERE id = NEW.vehicle_id AND status IN ('available', 'maintenance');
    UPDATE public.drivers SET active_vehicle_id = NEW.vehicle_id
     WHERE id = NEW.driver_id;
  ELSIF v_old_out AND NOT v_new_out THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.rentals r
       WHERE r.vehicle_id = NEW.vehicle_id AND r.id <> NEW.id
         AND r.status = ANY(v_out_states)
    ) THEN
      UPDATE public.vehicles SET status = 'available'
       WHERE id = NEW.vehicle_id AND status = 'rented';
    END IF;
    UPDATE public.drivers SET active_vehicle_id = NULL
     WHERE id = NEW.driver_id AND active_vehicle_id = NEW.vehicle_id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_out_states constant text[] := ARRAY['approved', 'paid', 'active', 'payment_overdue', 'overdue_return', 'vehicle_disabled'];
BEGIN
  UPDATE public.vehicles v SET status = 'rented'
   WHERE v.status = 'available'
     AND EXISTS (SELECT 1 FROM public.rentals r WHERE r.vehicle_id = v.id AND r.status = ANY(v_out_states));

  UPDATE public.drivers d SET active_vehicle_id = (
    SELECT r.vehicle_id FROM public.rentals r WHERE r.driver_id = d.id
      AND r.status = ANY(v_out_states) ORDER BY r.created_at DESC LIMIT 1
  )
   WHERE d.active_vehicle_id IS NULL
     AND EXISTS (SELECT 1 FROM public.rentals r WHERE r.driver_id = d.id AND r.status = ANY(v_out_states));
END $$;