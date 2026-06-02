-- Create trigger function for income declaration status changes
CREATE OR REPLACE FUNCTION public.notify_income_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger if status actually changed and it's a driver declaration
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.source = 'driver_declared' THEN
    IF NEW.status = 'approved' THEN
      INSERT INTO public.notifications (driver_id, title, message, notification_type)
      VALUES (
        NEW.driver_id,
        'Revenu approuvé! ✅',
        'Votre déclaration de revenu du ' || TO_CHAR(NEW.record_date::date, 'DD/MM/YYYY') || ' (' || COALESCE(NEW.net_income, 0) || ' FCFA) a été approuvée et compte maintenant dans votre DAM Score.',
        'income_status'
      );
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (driver_id, title, message, notification_type)
      VALUES (
        NEW.driver_id,
        'Déclaration refusée',
        'Votre déclaration de revenu du ' || TO_CHAR(NEW.record_date::date, 'DD/MM/YYYY') || ' a été refusée. ' || COALESCE('Raison: ' || NEW.rejection_reason, 'Veuillez contacter le support pour plus d''informations.'),
        'income_status'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_income_status_change ON public.income_records;

-- Create trigger for income status changes
CREATE TRIGGER on_income_status_change
AFTER UPDATE ON public.income_records
FOR EACH ROW
EXECUTE FUNCTION public.notify_income_status_change();