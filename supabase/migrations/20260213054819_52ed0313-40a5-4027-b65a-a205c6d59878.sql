
-- Create device_tokens table for native push notification tokens (FCM/APNs)
CREATE TABLE public.device_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(driver_id, token)
);

-- Enable RLS
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Drivers can manage their own tokens
CREATE POLICY "Drivers can insert their own device tokens"
ON public.device_tokens FOR INSERT
WITH CHECK (driver_id = current_driver_id());

CREATE POLICY "Drivers can view their own device tokens"
ON public.device_tokens FOR SELECT
USING (driver_id = current_driver_id());

CREATE POLICY "Drivers can delete their own device tokens"
ON public.device_tokens FOR DELETE
USING (driver_id = current_driver_id());

CREATE POLICY "Drivers can update their own device tokens"
ON public.device_tokens FOR UPDATE
USING (driver_id = current_driver_id());

-- Admins can read all tokens (for sending notifications)
CREATE POLICY "Admins can view all device tokens"
ON public.device_tokens FOR SELECT
USING (is_admin());

-- Auto-update timestamp
CREATE TRIGGER update_device_tokens_updated_at
BEFORE UPDATE ON public.device_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_device_tokens_driver_id ON public.device_tokens(driver_id);
