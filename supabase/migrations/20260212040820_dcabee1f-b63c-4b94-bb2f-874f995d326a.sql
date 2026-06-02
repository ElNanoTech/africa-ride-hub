ALTER TABLE public.notifications DROP CONSTRAINT notifications_notification_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_notification_type_check 
CHECK (notification_type = ANY (ARRAY[
  'score_update'::text, 
  'payment_reminder'::text, 
  'loan_status'::text, 
  'rental_status'::text, 
  'safety_tip'::text, 
  'announcement'::text,
  'kyc_approved'::text,
  'kyc_rejected'::text,
  'income_status'::text
]));