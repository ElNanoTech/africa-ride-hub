-- Create push subscriptions table
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(driver_id, endpoint)
);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Drivers can manage their own subscriptions
CREATE POLICY "Drivers can view own subscriptions"
ON public.push_subscriptions
FOR SELECT
USING (driver_id = current_driver_id());

CREATE POLICY "Drivers can insert own subscriptions"
ON public.push_subscriptions
FOR INSERT
WITH CHECK (driver_id = current_driver_id());

CREATE POLICY "Drivers can delete own subscriptions"
ON public.push_subscriptions
FOR DELETE
USING (driver_id = current_driver_id());

-- Admins can manage all subscriptions
CREATE POLICY "Admins can manage subscriptions"
ON public.push_subscriptions
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_push_subscriptions_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();