-- Allow authenticated drivers to create their own driver profile
-- (required right after signup so the app can proceed to KYC)

-- Ensure RLS is enabled (should already be, but keep safe)
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- Create INSERT policy (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'drivers'
      AND policyname = 'driver creates own profile'
  ) THEN
    CREATE POLICY "driver creates own profile"
    ON public.drivers
    FOR INSERT
    TO authenticated
    WITH CHECK (
      (user_id = auth.uid()) OR (auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- Optional: allow drivers to set user_id/auth_user_id on insert only (covered by WITH CHECK above)
