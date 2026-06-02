-- Add new notification preference columns
ALTER TABLE public.admin_preferences
ADD COLUMN kyc_alerts BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN payment_alerts BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN support_alerts BOOLEAN NOT NULL DEFAULT true;