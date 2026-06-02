-- Create notification trigger for KYC status changes
CREATE OR REPLACE FUNCTION public.notify_kyc_status_change()
RETURNS trigger
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
        'KYC Approuvé! ✅',
        'Félicitations! Votre vérification d''identité a été approuvée. Vous pouvez maintenant louer des véhicules et demander des prêts.',
        'kyc_status'
      );
      
      -- Also update driver's kyc_status
      UPDATE public.drivers 
      SET kyc_status = 'verified' 
      WHERE id = NEW.driver_id;
      
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (driver_id, title, message, notification_type)
      VALUES (
        NEW.driver_id,
        'Vérification KYC refusée',
        'Votre vérification d''identité a été refusée. ' || COALESCE('Raison: ' || NEW.rejection_reason, 'Veuillez soumettre à nouveau vos documents.'),
        'kyc_status'
      );
      
      -- Also update driver's kyc_status
      UPDATE public.drivers 
      SET kyc_status = 'rejected' 
      WHERE id = NEW.driver_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on kyc_submissions table
DROP TRIGGER IF EXISTS on_kyc_status_change ON public.kyc_submissions;
CREATE TRIGGER on_kyc_status_change
  AFTER UPDATE ON public.kyc_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_kyc_status_change();