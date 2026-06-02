-- Add email verification columns to admin_users
ALTER TABLE public.admin_users 
ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_token uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS verification_sent_at timestamp with time zone DEFAULT NULL;

-- Create index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_admin_users_verification_token ON public.admin_users(verification_token) WHERE verification_token IS NOT NULL;