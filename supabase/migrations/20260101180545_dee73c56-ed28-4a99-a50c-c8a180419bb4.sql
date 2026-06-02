-- Create admin_preferences table
CREATE TABLE public.admin_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL UNIQUE REFERENCES public.admin_users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  new_request_alerts BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_preferences ENABLE ROW LEVEL SECURITY;

-- Admins can view their own preferences
CREATE POLICY "Admins can view own preferences"
ON public.admin_preferences
FOR SELECT
USING (
  admin_user_id IN (
    SELECT id FROM public.admin_users WHERE user_id = auth.uid()
  )
);

-- Admins can insert their own preferences
CREATE POLICY "Admins can insert own preferences"
ON public.admin_preferences
FOR INSERT
WITH CHECK (
  admin_user_id IN (
    SELECT id FROM public.admin_users WHERE user_id = auth.uid()
  )
);

-- Admins can update their own preferences
CREATE POLICY "Admins can update own preferences"
ON public.admin_preferences
FOR UPDATE
USING (
  admin_user_id IN (
    SELECT id FROM public.admin_users WHERE user_id = auth.uid()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_admin_preferences_updated_at
BEFORE UPDATE ON public.admin_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();