
CREATE OR REPLACE FUNCTION public.notify_rental_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  vehicle_name TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT model_name INTO vehicle_name FROM public.vehicles WHERE id = NEW.vehicle_id;
    
    IF NEW.status = 'active' THEN
      INSERT INTO public.notifications (driver_id, title, message, notification_type)
      VALUES (
        NEW.driver_id,
        'Location approuvée! 🚗',
        'Votre demande de location pour ' || COALESCE(vehicle_name, 'le véhicule') || ' a été approuvée. Vous pouvez récupérer le véhicule.',
        'rental_status'
      );
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (driver_id, title, message, notification_type)
      VALUES (
        NEW.driver_id,
        'Demande de location refusée',
        'Votre demande de location a été refusée. ' || COALESCE('Raison: ' || NEW.rejection_reason, 'Contactez le support pour plus d''informations.'),
        'rental_status'
      );
    ELSIF NEW.status = 'completed' THEN
      INSERT INTO public.notifications (driver_id, title, message, notification_type)
      VALUES (
        NEW.driver_id,
        'Location terminée',
        'Votre location de ' || COALESCE(vehicle_name, 'véhicule') || ' est terminée. Merci de votre confiance!',
        'rental_status'
      );
    ELSIF NEW.status = 'cancelled' THEN
      INSERT INTO public.notifications (driver_id, title, message, notification_type)
      VALUES (
        NEW.driver_id,
        'Location annulée',
        'Votre demande de location pour ' || COALESCE(vehicle_name, 'le véhicule') || ' a été annulée.',
        'rental_status'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
