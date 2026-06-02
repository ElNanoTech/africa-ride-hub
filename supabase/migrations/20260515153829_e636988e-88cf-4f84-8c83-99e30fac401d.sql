-- Prevent any single driver from stacking multiple open rental requests.
-- Covers the duplicate-rental issue observed in UAT (BUG-UAT-001).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_driver_one_open_rental
  ON public.rentals (driver_id)
  WHERE status IN ('pending', 'approved', 'active');

-- BUG-UAT-002 production data fix: restore ZABALOU ADJEHI FIDEL rental
-- final_rate that was corrupted by the unguarded window.prompt edit
-- handler (203000 → back to 20300).
UPDATE public.rentals
SET final_rate = 20300
WHERE id = '8ba4477a-fa14-4523-89eb-00071bd61654'
  AND final_rate = 203000;