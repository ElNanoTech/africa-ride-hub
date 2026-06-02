-- Function to notify on loan status change
CREATE OR REPLACE FUNCTION public.notify_loan_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only trigger if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      INSERT INTO public.notifications (driver_id, title, message, notification_type)
      VALUES (
        NEW.driver_id,
        'Prêt approuvé! 🎉',
        'Félicitations! Votre demande de prêt de ' || COALESCE(NEW.amount_approved, NEW.amount_requested) || ' FCFA a été approuvée.',
        'loan_status'
      );
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (driver_id, title, message, notification_type)
      VALUES (
        NEW.driver_id,
        'Demande de prêt refusée',
        'Votre demande de prêt a été refusée. ' || COALESCE('Raison: ' || NEW.rejection_reason, 'Contactez le support pour plus d''informations.'),
        'loan_status'
      );
    ELSIF NEW.status = 'disbursed' THEN
      INSERT INTO public.notifications (driver_id, title, message, notification_type)
      VALUES (
        NEW.driver_id,
        'Prêt déboursé',
        'Votre prêt de ' || COALESCE(NEW.amount_approved, NEW.amount_requested) || ' FCFA a été déboursé sur votre compte.',
        'loan_status'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Function to notify on rental status change
CREATE OR REPLACE FUNCTION public.notify_rental_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  vehicle_name TEXT;
BEGIN
  -- Only trigger if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Get vehicle name
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
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger for loan status changes
CREATE TRIGGER on_loan_status_change
  AFTER UPDATE ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_loan_status_change();

-- Trigger for rental status changes
CREATE TRIGGER on_rental_status_change
  AFTER UPDATE ON public.rentals
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_rental_status_change();