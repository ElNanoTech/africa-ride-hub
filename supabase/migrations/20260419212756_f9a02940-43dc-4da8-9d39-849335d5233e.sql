-- Helper to check current driver status from auth context.
CREATE OR REPLACE FUNCTION public.current_driver_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE (d.user_id = auth.uid() OR d.auth_user_id = auth.uid())
      AND d.driver_status = 'active'
  );
$$;

-- Replace the driver INSERT policy on rentals so suspended/inactive drivers
-- can no longer create rental requests directly via the API.
DROP POLICY IF EXISTS "driver creates rental" ON public.rentals;

CREATE POLICY "driver creates rental"
ON public.rentals
FOR INSERT
TO public
WITH CHECK (
  driver_id = current_driver_id()
  AND public.current_driver_is_active()
);