-- Create driver_favorites table
CREATE TABLE public.driver_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL,
  vehicle_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(driver_id, vehicle_id)
);

-- Enable RLS
ALTER TABLE public.driver_favorites ENABLE ROW LEVEL SECURITY;

-- Drivers can view their own favorites
CREATE POLICY "Drivers can view own favorites"
  ON public.driver_favorites
  FOR SELECT
  USING (driver_id = get_driver_id(auth.uid()));

-- Drivers can add favorites
CREATE POLICY "Drivers can add favorites"
  ON public.driver_favorites
  FOR INSERT
  WITH CHECK (driver_id = get_driver_id(auth.uid()));

-- Drivers can remove favorites
CREATE POLICY "Drivers can delete own favorites"
  ON public.driver_favorites
  FOR DELETE
  USING (driver_id = get_driver_id(auth.uid()));

-- Admins can manage all favorites
CREATE POLICY "Admins can manage favorites"
  ON public.driver_favorites
  FOR ALL
  USING (is_admin(auth.uid()));