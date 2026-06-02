-- Function to create notification on loan application
CREATE OR REPLACE FUNCTION public.notify_loan_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (
    driver_id,
    title,
    message,
    notification_type
  ) VALUES (
    NEW.driver_id,
    'Demande de prêt soumise',
    'Votre demande de prêt de ' || NEW.amount_requested || ' FCFA a été soumise avec succès. Nous l''examinerons sous peu.',
    'loan_status'
  );
  RETURN NEW;
END;
$$;

-- Function to create notification on rental request
CREATE OR REPLACE FUNCTION public.notify_rental_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (
    driver_id,
    title,
    message,
    notification_type
  ) VALUES (
    NEW.driver_id,
    'Demande de location soumise',
    'Votre demande de location (' || NEW.rental_plan || ') a été soumise. Un administrateur examinera votre demande bientôt.',
    'rental_status'
  );
  RETURN NEW;
END;
$$;

-- Trigger for loan applications
CREATE TRIGGER on_loan_application
  AFTER INSERT ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_loan_application();

-- Trigger for rental requests
CREATE TRIGGER on_rental_request
  AFTER INSERT ON public.rentals
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_rental_request();