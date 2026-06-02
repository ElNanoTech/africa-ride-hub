
-- =========================================================
-- PART A: BACKFILL NULL customer_id
-- =========================================================

UPDATE public.notifications n
SET customer_id = d.customer_id
FROM public.drivers d
WHERE n.customer_id IS NULL AND n.driver_id = d.id AND d.customer_id IS NOT NULL;

UPDATE public.kyc_submissions k
SET customer_id = d.customer_id
FROM public.drivers d
WHERE k.customer_id IS NULL AND k.driver_id = d.id AND d.customer_id IS NOT NULL;

UPDATE public.income_records i
SET customer_id = d.customer_id
FROM public.drivers d
WHERE i.customer_id IS NULL AND i.driver_id = d.id AND d.customer_id IS NOT NULL;

UPDATE public.payments p
SET customer_id = d.customer_id
FROM public.drivers d
WHERE p.customer_id IS NULL AND p.driver_id = d.id AND d.customer_id IS NOT NULL;

UPDATE public.payments p
SET customer_id = r.customer_id
FROM public.rentals r
WHERE p.customer_id IS NULL AND p.rental_id = r.id AND r.customer_id IS NOT NULL;

UPDATE public.payments p
SET customer_id = l.customer_id
FROM public.loans l
WHERE p.customer_id IS NULL AND p.loan_id = l.id AND l.customer_id IS NOT NULL;

UPDATE public.rentals r
SET customer_id = d.customer_id
FROM public.drivers d
WHERE r.customer_id IS NULL AND r.driver_id = d.id AND d.customer_id IS NOT NULL;

UPDATE public.rentals r
SET customer_id = v.customer_id
FROM public.vehicles v
WHERE r.customer_id IS NULL AND r.vehicle_id = v.id AND v.customer_id IS NOT NULL;

UPDATE public.loans l
SET customer_id = d.customer_id
FROM public.drivers d
WHERE l.customer_id IS NULL AND l.driver_id = d.id AND d.customer_id IS NOT NULL;

UPDATE public.accidents a
SET customer_id = d.customer_id
FROM public.drivers d
WHERE a.customer_id IS NULL AND a.driver_id = d.id AND d.customer_id IS NOT NULL;

UPDATE public.accidents a
SET customer_id = v.customer_id
FROM public.vehicles v
WHERE a.customer_id IS NULL AND a.vehicle_id = v.id AND v.customer_id IS NOT NULL;

UPDATE public.driving_events e
SET customer_id = d.customer_id
FROM public.drivers d
WHERE e.customer_id IS NULL AND e.driver_id = d.id AND d.customer_id IS NOT NULL;

UPDATE public.driving_events e
SET customer_id = v.customer_id
FROM public.vehicles v
WHERE e.customer_id IS NULL AND e.vehicle_id = v.id AND v.customer_id IS NOT NULL;

-- vehicle_positions / vehicle_location_history: linked via Uffizio device id (vehicle_no <-> vehicles.uffizio_device_id)
UPDATE public.vehicle_positions vp
SET customer_id = v.customer_id
FROM public.vehicles v
WHERE vp.customer_id IS NULL
  AND vp.vehicle_no IS NOT NULL
  AND v.uffizio_device_id = vp.vehicle_no
  AND v.customer_id IS NOT NULL;

UPDATE public.vehicle_location_history h
SET customer_id = v.customer_id
FROM public.vehicles v
WHERE h.customer_id IS NULL
  AND h.vehicle_no IS NOT NULL
  AND v.uffizio_device_id = h.vehicle_no
  AND v.customer_id IS NOT NULL;

UPDATE public.support_tickets s
SET customer_id = d.customer_id
FROM public.drivers d
WHERE s.customer_id IS NULL AND s.driver_id = d.id AND d.customer_id IS NOT NULL;

UPDATE public.credit_scores c
SET customer_id = d.customer_id
FROM public.drivers d
WHERE c.customer_id IS NULL AND c.driver_id = d.id AND d.customer_id IS NOT NULL;

UPDATE public.driver_score_events e
SET customer_id = d.customer_id
FROM public.drivers d
WHERE e.customer_id IS NULL AND e.driver_id = d.id AND d.customer_id IS NOT NULL;


-- =========================================================
-- PART B: AUTO-STAMP customer_id ON INSERT/UPDATE
-- =========================================================

CREATE OR REPLACE FUNCTION public.autostamp_customer_id_from_driver()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NULL AND NEW.driver_id IS NOT NULL THEN
    SELECT customer_id INTO NEW.customer_id FROM public.drivers WHERE id = NEW.driver_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.autostamp_customer_id_from_driver_or_vehicle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NULL AND NEW.driver_id IS NOT NULL THEN
    SELECT customer_id INTO NEW.customer_id FROM public.drivers WHERE id = NEW.driver_id;
  END IF;
  IF NEW.customer_id IS NULL AND NEW.vehicle_id IS NOT NULL THEN
    SELECT customer_id INTO NEW.customer_id FROM public.vehicles WHERE id = NEW.vehicle_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.autostamp_customer_id_from_vehicle_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NULL AND NEW.vehicle_no IS NOT NULL THEN
    SELECT customer_id INTO NEW.customer_id
    FROM public.vehicles
    WHERE uffizio_device_id = NEW.vehicle_no
    LIMIT 1;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.autostamp_customer_id_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NULL AND NEW.driver_id IS NOT NULL THEN
    SELECT customer_id INTO NEW.customer_id FROM public.drivers WHERE id = NEW.driver_id;
  END IF;
  IF NEW.customer_id IS NULL AND NEW.rental_id IS NOT NULL THEN
    SELECT customer_id INTO NEW.customer_id FROM public.rentals WHERE id = NEW.rental_id;
  END IF;
  IF NEW.customer_id IS NULL AND NEW.loan_id IS NOT NULL THEN
    SELECT customer_id INTO NEW.customer_id FROM public.loans WHERE id = NEW.loan_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_autostamp_customer_notifications ON public.notifications;
CREATE TRIGGER trg_autostamp_customer_notifications
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.autostamp_customer_id_from_driver();

DROP TRIGGER IF EXISTS trg_autostamp_customer_kyc ON public.kyc_submissions;
CREATE TRIGGER trg_autostamp_customer_kyc
  BEFORE INSERT OR UPDATE ON public.kyc_submissions
  FOR EACH ROW EXECUTE FUNCTION public.autostamp_customer_id_from_driver();

DROP TRIGGER IF EXISTS trg_autostamp_customer_income ON public.income_records;
CREATE TRIGGER trg_autostamp_customer_income
  BEFORE INSERT OR UPDATE ON public.income_records
  FOR EACH ROW EXECUTE FUNCTION public.autostamp_customer_id_from_driver();

DROP TRIGGER IF EXISTS trg_autostamp_customer_payments ON public.payments;
CREATE TRIGGER trg_autostamp_customer_payments
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.autostamp_customer_id_payment();

DROP TRIGGER IF EXISTS trg_autostamp_customer_rentals ON public.rentals;
CREATE TRIGGER trg_autostamp_customer_rentals
  BEFORE INSERT OR UPDATE ON public.rentals
  FOR EACH ROW EXECUTE FUNCTION public.autostamp_customer_id_from_driver_or_vehicle();

DROP TRIGGER IF EXISTS trg_autostamp_customer_loans ON public.loans;
CREATE TRIGGER trg_autostamp_customer_loans
  BEFORE INSERT OR UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.autostamp_customer_id_from_driver();

DROP TRIGGER IF EXISTS trg_autostamp_customer_accidents ON public.accidents;
CREATE TRIGGER trg_autostamp_customer_accidents
  BEFORE INSERT OR UPDATE ON public.accidents
  FOR EACH ROW EXECUTE FUNCTION public.autostamp_customer_id_from_driver_or_vehicle();

DROP TRIGGER IF EXISTS trg_autostamp_customer_driving_events ON public.driving_events;
CREATE TRIGGER trg_autostamp_customer_driving_events
  BEFORE INSERT OR UPDATE ON public.driving_events
  FOR EACH ROW EXECUTE FUNCTION public.autostamp_customer_id_from_driver_or_vehicle();

DROP TRIGGER IF EXISTS trg_autostamp_customer_vehicle_positions ON public.vehicle_positions;
CREATE TRIGGER trg_autostamp_customer_vehicle_positions
  BEFORE INSERT OR UPDATE ON public.vehicle_positions
  FOR EACH ROW EXECUTE FUNCTION public.autostamp_customer_id_from_vehicle_no();

DROP TRIGGER IF EXISTS trg_autostamp_customer_vehicle_history ON public.vehicle_location_history;
CREATE TRIGGER trg_autostamp_customer_vehicle_history
  BEFORE INSERT OR UPDATE ON public.vehicle_location_history
  FOR EACH ROW EXECUTE FUNCTION public.autostamp_customer_id_from_vehicle_no();

DROP TRIGGER IF EXISTS trg_autostamp_customer_support_tickets ON public.support_tickets;
CREATE TRIGGER trg_autostamp_customer_support_tickets
  BEFORE INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.autostamp_customer_id_from_driver();

DROP TRIGGER IF EXISTS trg_autostamp_customer_credit_scores ON public.credit_scores;
CREATE TRIGGER trg_autostamp_customer_credit_scores
  BEFORE INSERT OR UPDATE ON public.credit_scores
  FOR EACH ROW EXECUTE FUNCTION public.autostamp_customer_id_from_driver();

DROP TRIGGER IF EXISTS trg_autostamp_customer_score_events ON public.driver_score_events;
CREATE TRIGGER trg_autostamp_customer_score_events
  BEFORE INSERT OR UPDATE ON public.driver_score_events
  FOR EACH ROW EXECUTE FUNCTION public.autostamp_customer_id_from_driver();
