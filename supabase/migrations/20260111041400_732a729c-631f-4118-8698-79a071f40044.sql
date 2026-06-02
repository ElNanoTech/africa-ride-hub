-- Create a function to send push notification when KYC status changes
CREATE OR REPLACE FUNCTION public.notify_kyc_status_change()
RETURNS TRIGGER AS $$
DECLARE
  driver_record RECORD;
  notification_title TEXT;
  notification_body TEXT;
BEGIN
  -- Only trigger on status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Get driver info
  SELECT full_name INTO driver_record
  FROM public.drivers
  WHERE id = NEW.driver_id;
  
  -- Determine notification content based on new status
  IF NEW.status = 'approved' OR NEW.status = 'verified' THEN
    notification_title := '🎉 KYC Approuvé!';
    notification_body := 'Félicitations! Votre identité a été vérifiée. Vous pouvez maintenant louer des véhicules et demander des prêts.';
    
    -- Insert a notification for the driver
    INSERT INTO public.notifications (
      driver_id,
      customer_id,
      title,
      message,
      notification_type,
      is_read
    ) VALUES (
      NEW.driver_id,
      NEW.customer_id,
      notification_title,
      notification_body,
      'kyc_approved',
      false
    );
    
  ELSIF NEW.status = 'rejected' THEN
    notification_title := '❌ Vérification refusée';
    notification_body := COALESCE(
      'Raison: ' || NEW.rejection_reason,
      'Vos documents n''ont pas pu être vérifiés. Veuillez soumettre à nouveau avec des documents valides.'
    );
    
    -- Insert a notification for the driver
    INSERT INTO public.notifications (
      driver_id,
      customer_id,
      title,
      message,
      notification_type,
      is_read
    ) VALUES (
      NEW.driver_id,
      NEW.customer_id,
      notification_title,
      notification_body,
      'kyc_rejected',
      false
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for KYC status changes
DROP TRIGGER IF EXISTS on_kyc_status_change ON public.kyc_submissions;

CREATE TRIGGER on_kyc_status_change
  AFTER UPDATE OF status ON public.kyc_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_kyc_status_change();