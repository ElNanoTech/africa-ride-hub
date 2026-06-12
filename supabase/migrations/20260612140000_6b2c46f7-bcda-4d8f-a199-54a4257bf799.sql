-- =====================================================================
-- REVIEW P3 — notifications: allow 'admin_message'
--
-- SendDriverMessageDialog (CH-P5 "Envoyer message") inserts rows with
-- notification_type = 'admin_message', but the deployed CHECK constraint
-- (last redefined in 20260611223138) does not include it, so every send
-- failed. Recreate the constraint with the full currently-allowed list
-- (verbatim from 20260611223138) plus 'admin_message'.
-- =====================================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_notification_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type IN (
    'score_update','payment_reminder','loan_status','rental_status','safety_tip',
    'announcement','income_status','system','payment_grace_started','payment_final_overdue',
    'rental_pickup_confirmed','vehicle_disabled','kyc_approved','kyc_rejected',
    'accident_report_submitted','accident_report_closed','invoice_issued','invoice_cancelled',
    'monthly_statement_ready','training_completed','training_reminder',
    -- Fleet control:
    'fleet_control_required','fleet_control_overdue','fleet_control_reminder',
    'fleet_control_approved','fleet_control_rejected',
    'fleet_control_blocked','fleet_control_unblocked',
    -- Direct admin → driver message (SendDriverMessageDialog):
    'admin_message'
  ));
