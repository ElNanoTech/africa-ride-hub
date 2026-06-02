INSERT INTO public.platform_settings (setting_key, setting_value)
VALUES (
  'payment_score_rules',
  jsonb_build_object('on_time_bonus', 5, 'late_penalty', -10, 'overdue_penalty', -20, 'enabled', true)
)
ON CONFLICT (setting_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_payment_score_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_settings jsonb;
  v_on_time int := 5;
  v_late int := -10;
  v_overdue int := -20;
  v_enabled boolean := true;
  v_delta int := 0;
  v_reason text := '';
  v_label text;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status, '') = COALESCE(NEW.status, '') THEN
    RETURN NEW;
  END IF;

  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT setting_value INTO v_settings
  FROM public.platform_settings
  WHERE setting_key = 'payment_score_rules';

  IF v_settings IS NOT NULL THEN
    v_on_time := COALESCE((v_settings->>'on_time_bonus')::int, v_on_time);
    v_late := COALESCE((v_settings->>'late_penalty')::int, v_late);
    v_overdue := COALESCE((v_settings->>'overdue_penalty')::int, v_overdue);
    v_enabled := COALESCE((v_settings->>'enabled')::boolean, v_enabled);
  END IF;

  IF NOT v_enabled THEN
    RETURN NEW;
  END IF;

  v_label := CASE NEW.payment_type
    WHEN 'rental' THEN 'location'
    WHEN 'loan' THEN 'prêt'
    ELSE 'paiement'
  END;

  IF NEW.status = 'paid' THEN
    IF NEW.paid_date IS NOT NULL AND NEW.due_date IS NOT NULL AND NEW.paid_date > NEW.due_date THEN
      v_delta := v_late;
      v_reason := format('Paiement %s en retard (%s jours)', v_label, (NEW.paid_date - NEW.due_date));
    ELSE
      v_delta := v_on_time;
      v_reason := format('Paiement %s à temps', v_label);
    END IF;
  ELSIF NEW.status = 'overdue' THEN
    v_delta := v_overdue;
    v_reason := format('Paiement %s en souffrance', v_label);
  ELSE
    RETURN NEW;
  END IF;

  IF v_delta = 0 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.driver_score_events
    WHERE driver_id = NEW.driver_id
      AND reason = v_reason
      AND created_at > now() - interval '1 minute'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.driver_score_events (driver_id, customer_id, delta, reason)
  VALUES (NEW.driver_id, NEW.customer_id, v_delta, v_reason);

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_payment_score_event ON public.payments;
CREATE TRIGGER trg_payment_score_event
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.handle_payment_score_event();