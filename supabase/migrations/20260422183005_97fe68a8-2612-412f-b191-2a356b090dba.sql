-- Tighten write access on public.notifications:
--   * Only admins (via existing "admin manages notifications" policy) and
--     the service role (which bypasses RLS) can INSERT.
--   * Drivers remain read-only on the table EXCEPT for marking their own
--     rows as read (existing UPDATE policy is preserved per product decision).
--   * Drivers cannot DELETE.
--
-- Strategy:
--   1. Make sure RLS is on (idempotent).
--   2. Drop any prior driver-facing INSERT/DELETE policies so this migration
--      becomes the single source of truth.
--   3. Add a RESTRICTIVE policy on INSERT that requires the caller to be an
--      admin. Restrictive policies AND-combine with permissive ones, so this
--      blocks any future permissive policy that might accidentally grant
--      drivers insert rights. The service role bypasses RLS entirely and is
--      unaffected.
--   4. Add a RESTRICTIVE policy on DELETE that requires admin, for the same
--      defense-in-depth reason.

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Cleanup: remove any prior driver-side write policies if they ever existed
DROP POLICY IF EXISTS "Drivers can insert their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "drivers_insert_own_notifications" ON public.notifications;
DROP POLICY IF EXISTS "Drivers can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "drivers_delete_own_notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_only_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_only_delete" ON public.notifications;

-- Restrictive INSERT guard: every INSERT must be performed by an admin.
-- The service role bypasses RLS and so is not subject to this check, which
-- is exactly what we want for trusted backend processes (edge functions,
-- triggers running as security definer, cron jobs, etc.).
CREATE POLICY "notifications_admin_only_insert"
ON public.notifications
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- Restrictive DELETE guard: only admins may delete notifications.
CREATE POLICY "notifications_admin_only_delete"
ON public.notifications
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (public.is_admin());

COMMENT ON POLICY "notifications_admin_only_insert" ON public.notifications IS
  'Restrictive: only admins (or service role, which bypasses RLS) may create notifications. Drivers are read-only for inserts.';
COMMENT ON POLICY "notifications_admin_only_delete" ON public.notifications IS
  'Restrictive: only admins (or service role, which bypasses RLS) may delete notifications. Drivers are read-only for deletes.';