-- Merge "shadow" simulation drivers into the auth-linked drivers
-- Source (no auth):  97c1dcbb-... (Aïcha shadow), 6e7338c7-... (Moussa shadow)
-- Target (auth):     fe8813e1-... (Aïcha), 30192fb0-... (Moussa)

-- AÏCHA: clear the auto-seeded data on target then move the rich shadow data over
DELETE FROM public.payments        WHERE driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d';
DELETE FROM public.driver_score_events WHERE driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d';
DELETE FROM public.credit_score_breakdowns WHERE credit_score_id IN (SELECT id FROM public.credit_scores WHERE driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d');
DELETE FROM public.credit_scores   WHERE driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d';
DELETE FROM public.driver_scores   WHERE driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d';
DELETE FROM public.rentals         WHERE driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d';

UPDATE public.payments        SET driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d' WHERE driver_id='97c1dcbb-0186-4f4e-ac74-47480da898f1';
UPDATE public.driving_events  SET driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d' WHERE driver_id='97c1dcbb-0186-4f4e-ac74-47480da898f1';
UPDATE public.driver_score_events SET driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d' WHERE driver_id='97c1dcbb-0186-4f4e-ac74-47480da898f1';
UPDATE public.rentals         SET driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d' WHERE driver_id='97c1dcbb-0186-4f4e-ac74-47480da898f1';
UPDATE public.loans           SET driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d' WHERE driver_id='97c1dcbb-0186-4f4e-ac74-47480da898f1';
UPDATE public.credit_scores   SET driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d' WHERE driver_id='97c1dcbb-0186-4f4e-ac74-47480da898f1';
UPDATE public.driver_scores   SET driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d' WHERE driver_id='97c1dcbb-0186-4f4e-ac74-47480da898f1';

-- MOUSSA
DELETE FROM public.payments        WHERE driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c';
DELETE FROM public.driver_score_events WHERE driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c';
DELETE FROM public.credit_score_breakdowns WHERE credit_score_id IN (SELECT id FROM public.credit_scores WHERE driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c');
DELETE FROM public.credit_scores   WHERE driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c';
DELETE FROM public.driver_scores   WHERE driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c';
DELETE FROM public.rentals         WHERE driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c';

UPDATE public.payments        SET driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c' WHERE driver_id='6e7338c7-1fee-4fa0-9c13-30e568333cf4';
UPDATE public.driving_events  SET driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c' WHERE driver_id='6e7338c7-1fee-4fa0-9c13-30e568333cf4';
UPDATE public.driver_score_events SET driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c' WHERE driver_id='6e7338c7-1fee-4fa0-9c13-30e568333cf4';
UPDATE public.rentals         SET driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c' WHERE driver_id='6e7338c7-1fee-4fa0-9c13-30e568333cf4';
UPDATE public.loans           SET driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c' WHERE driver_id='6e7338c7-1fee-4fa0-9c13-30e568333cf4';
UPDATE public.credit_scores   SET driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c' WHERE driver_id='6e7338c7-1fee-4fa0-9c13-30e568333cf4';
UPDATE public.driver_scores   SET driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c' WHERE driver_id='6e7338c7-1fee-4fa0-9c13-30e568333cf4';

-- Drop the shadow drivers
DELETE FROM public.notifications WHERE driver_id IN ('97c1dcbb-0186-4f4e-ac74-47480da898f1','6e7338c7-1fee-4fa0-9c13-30e568333cf4');
DELETE FROM public.drivers WHERE id IN ('97c1dcbb-0186-4f4e-ac74-47480da898f1','6e7338c7-1fee-4fa0-9c13-30e568333cf4');

-- Set live snapshot scores
UPDATE public.driver_scores SET current_score=740 WHERE driver_id='fe8813e1-d36a-49d7-8fc7-9e136837361d';
UPDATE public.driver_scores SET current_score=270 WHERE driver_id='30192fb0-91b0-4e7b-8a30-d91a088dd94c';

-- Set active vehicle pointers
UPDATE public.drivers SET active_vehicle_id = (SELECT id FROM public.vehicles WHERE model_name='SUZUKI ALTO 30 HS' LIMIT 1),
  is_test = true, full_name='Aïcha Koné (SIM bon payeur)'
  WHERE id='fe8813e1-d36a-49d7-8fc7-9e136837361d';
UPDATE public.drivers SET active_vehicle_id = (SELECT id FROM public.vehicles WHERE model_name='SUZUKI ALTO 31' LIMIT 1),
  is_test = true, full_name='Moussa Diop (SIM mauvais payeur)'
  WHERE id='30192fb0-91b0-4e7b-8a30-d91a088dd94c';