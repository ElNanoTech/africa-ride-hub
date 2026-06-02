-- Ensure vehicles stay locked (status = 'rented') while a rental is awaiting
-- the admin's return confirmation. Without this, moving a rental to
-- 'return_pending' would release the vehicle and let another driver rent it.
CREATE OR REPLACE FUNCTION public.sync_vehicle_on_rental_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out_states constant text[] := ARRAY[
    'approved', 'paid', 'active', 'payment_overdue',
    'overdue_return', 'vehicle_disabled', 'return_pending'
  ];
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

-- Backfill: re-lock any vehicle that has a return_pending rental but is
-- currently marked available.
UPDATE public.vehicles v
   SET status = 'rented'
 WHERE v.status = 'available'
   AND EXISTS (
     SELECT 1 FROM public.rentals r
      WHERE r.vehicle_id = v.id AND r.status = 'return_pending'
   );