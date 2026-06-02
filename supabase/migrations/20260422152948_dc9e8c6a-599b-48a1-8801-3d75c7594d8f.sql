-- Tighten driver-side SELECT access on notifications so each driver
-- only sees rows targeted at them via either driver_id or recipient_user_id.
-- Admin/service-role access is preserved through existing policies.

-- Make sure RLS is on (idempotent)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop any prior driver-facing SELECT policies we may have created so this
-- migration is the single source of truth for driver read access.
DROP POLICY IF EXISTS "Drivers can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Drivers view their notifications" ON public.notifications;
DROP POLICY IF EXISTS "drivers_select_own_notifications" ON public.notifications;

-- A driver can read a notification row iff:
--   (a) it targets their driver row id (notifications.driver_id = current_driver_id()), OR
--   (b) it targets their auth user id (notifications.recipient_user_id = auth.uid()).
-- Both columns are nullable, so we explicitly require a non-null match on
-- whichever side is being used — preventing "NULL = NULL" leaks.
CREATE POLICY "drivers_select_own_notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (
  (
    driver_id IS NOT NULL
    AND driver_id = public.current_driver_id()
  )
  OR
  (
    recipient_user_id IS NOT NULL
    AND recipient_user_id = auth.uid()
  )
);