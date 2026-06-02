
-- Function to automatically generate loan repayment payments when a loan is disbursed
CREATE OR REPLACE FUNCTION public.generate_loan_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_with_interest NUMERIC;
  v_num_weeks INTEGER;
  v_weekly_amount INTEGER;
  v_remainder INTEGER;
  v_due_date DATE;
  i INTEGER;
BEGIN
  IF NEW.status <> 'disbursed' OR (OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;

  IF NEW.amount_approved IS NULL OR NEW.amount_approved <= 0 THEN
    RAISE WARNING 'Loan % has no approved amount, skipping payment generation', NEW.id;
    RETURN NEW;
  END IF;

  v_total_with_interest := NEW.amount_approved * (1 + COALESCE(NEW.interest_rate, 10.0) / 100.0);

  v_num_weeks := CASE NEW.loan_type
    WHEN 'car_loan' THEN 52
    WHEN 'bike_loan' THEN 24
    WHEN 'tv_loan' THEN 12
    ELSE 24
  END;

  v_weekly_amount := CEIL(v_total_with_interest / v_num_weeks);
  v_remainder := (v_weekly_amount * v_num_weeks) - v_total_with_interest::INTEGER;

  FOR i IN 1..v_num_weeks LOOP
    v_due_date := CURRENT_DATE + (i * 7);
    INSERT INTO public.payments (
      driver_id, loan_id, amount, due_date, payment_type, status, customer_id
    ) VALUES (
      NEW.driver_id, NEW.id,
      CASE WHEN i = v_num_weeks THEN v_weekly_amount - v_remainder ELSE v_weekly_amount END,
      v_due_date, 'loan', 'pending', NEW.customer_id
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Drop and recreate triggers to avoid conflicts
DROP TRIGGER IF EXISTS trigger_generate_loan_payments ON public.loans;
DROP TRIGGER IF EXISTS trigger_notify_loan_application ON public.loans;
DROP TRIGGER IF EXISTS trigger_notify_loan_status_change ON public.loans;
DROP TRIGGER IF EXISTS trigger_notify_rental_request ON public.rentals;
DROP TRIGGER IF EXISTS trigger_notify_rental_status_change ON public.rentals;
DROP TRIGGER IF EXISTS trigger_generate_rental_payments ON public.rentals;
DROP TRIGGER IF EXISTS trigger_notify_kyc_status_change ON public.kyc_submissions;
DROP TRIGGER IF EXISTS trigger_notify_income_status_change ON public.income_records;
DROP TRIGGER IF EXISTS trigger_generate_ticket_number ON public.support_tickets;
DROP TRIGGER IF EXISTS trigger_log_feature_flag_change ON public.feature_flags;

CREATE TRIGGER trigger_generate_loan_payments
  AFTER UPDATE ON public.loans FOR EACH ROW
  EXECUTE FUNCTION public.generate_loan_payments();

CREATE TRIGGER trigger_notify_loan_application
  AFTER INSERT ON public.loans FOR EACH ROW
  EXECUTE FUNCTION public.notify_loan_application();

CREATE TRIGGER trigger_notify_loan_status_change
  AFTER UPDATE ON public.loans FOR EACH ROW
  EXECUTE FUNCTION public.notify_loan_status_change();

CREATE TRIGGER trigger_notify_rental_request
  AFTER INSERT ON public.rentals FOR EACH ROW
  EXECUTE FUNCTION public.notify_rental_request();

CREATE TRIGGER trigger_notify_rental_status_change
  AFTER UPDATE ON public.rentals FOR EACH ROW
  EXECUTE FUNCTION public.notify_rental_status_change();

CREATE TRIGGER trigger_generate_rental_payments
  AFTER UPDATE ON public.rentals FOR EACH ROW
  EXECUTE FUNCTION public.generate_rental_payments();

CREATE TRIGGER trigger_notify_kyc_status_change
  AFTER UPDATE ON public.kyc_submissions FOR EACH ROW
  EXECUTE FUNCTION public.notify_kyc_status_change();

CREATE TRIGGER trigger_notify_income_status_change
  AFTER UPDATE ON public.income_records FOR EACH ROW
  EXECUTE FUNCTION public.notify_income_status_change();

CREATE TRIGGER trigger_generate_ticket_number
  BEFORE INSERT ON public.support_tickets FOR EACH ROW
  EXECUTE FUNCTION public.generate_ticket_number();

CREATE TRIGGER trigger_log_feature_flag_change
  AFTER UPDATE ON public.feature_flags FOR EACH ROW
  WHEN (OLD.flag_value IS DISTINCT FROM NEW.flag_value)
  EXECUTE FUNCTION public.log_feature_flag_change();
