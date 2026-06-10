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
      v_due_date, 'loan_repayment', 'pending', NEW.customer_id
    );
  END LOOP;

  RETURN NEW;
END;
$function$;