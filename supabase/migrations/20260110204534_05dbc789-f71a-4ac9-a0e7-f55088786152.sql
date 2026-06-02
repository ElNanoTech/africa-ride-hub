-- Create login_activity table to track login attempts
CREATE TABLE public.login_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  login_method TEXT NOT NULL, -- 'pin', 'biometric', 'yango', 'test', 'otp'
  device_info TEXT, -- Browser/device info
  ip_address TEXT,
  location TEXT, -- Approximate location
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.login_activity ENABLE ROW LEVEL SECURITY;

-- Drivers can only see their own login activity
CREATE POLICY "Drivers can view their own login activity"
ON public.login_activity
FOR SELECT
USING (driver_id = current_driver_id());

-- Admins can view all login activity
CREATE POLICY "Admins can view all login activity"
ON public.login_activity
FOR SELECT
USING (is_admin());

-- Allow insert for authenticated users (will be done via service role or RPC)
CREATE POLICY "Allow insert for authenticated users"
ON public.login_activity
FOR INSERT
WITH CHECK (true);

-- Create index for performance
CREATE INDEX idx_login_activity_driver_id ON public.login_activity(driver_id);
CREATE INDEX idx_login_activity_created_at ON public.login_activity(created_at DESC);