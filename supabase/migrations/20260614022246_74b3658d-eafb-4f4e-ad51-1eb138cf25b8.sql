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
    'fleet_control_required','fleet_control_overdue','fleet_control_reminder',
    'fleet_control_approved','fleet_control_rejected',
    'fleet_control_blocked','fleet_control_unblocked',
    'admin_message'
  ));

NOTIFY pgrst, 'reload schema';