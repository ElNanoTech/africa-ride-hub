
-- =========================================================================
-- 1) Realtime authorization: restrict channel topics by user/driver/admin
-- =========================================================================
-- Enable RLS on realtime.messages and add a permissive policy that allows
-- authenticated users to subscribe only to topics they own.
-- Topic naming conventions used by the app:
--   - driver-realtime-<driver_id>
--   - admin-realtime-updates  (admins only)

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read own realtime topics" ON realtime.messages;
CREATE POLICY "authenticated can read own realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Admin updates channel: only admins
  (realtime.topic() = 'admin-realtime-updates' AND public.is_admin())
  OR
  -- Per-driver channels: only the matching driver
  (
    realtime.topic() LIKE 'driver-realtime-%'
    AND public.current_driver_id() IS NOT NULL
    AND realtime.topic() = 'driver-realtime-' || public.current_driver_id()::text
  )
  OR
  -- Admins may also listen on driver channels (for support views)
  (realtime.topic() LIKE 'driver-realtime-%' AND public.is_admin())
);

-- Allow the realtime extension to broadcast (INSERT) — required for the
-- broadcast layer to function. Reads are still gated by the SELECT policy.
DROP POLICY IF EXISTS "authenticated can broadcast to own realtime topics" ON realtime.messages;
CREATE POLICY "authenticated can broadcast to own realtime topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (realtime.topic() = 'admin-realtime-updates' AND public.is_admin())
  OR
  (
    realtime.topic() LIKE 'driver-realtime-%'
    AND public.current_driver_id() IS NOT NULL
    AND realtime.topic() = 'driver-realtime-' || public.current_driver_id()::text
  )
  OR
  (realtime.topic() LIKE 'driver-realtime-%' AND public.is_admin())
);

-- =========================================================================
-- 2) accident-photos bucket: align with accident-evidence pattern
-- =========================================================================
-- Path convention enforced: <anything>/<accident_id>/<file>
-- Driver may upload/view only if accident belongs to them.

DROP POLICY IF EXISTS "Drivers upload accident photos" ON storage.objects;
DROP POLICY IF EXISTS "Drivers view own accident photos" ON storage.objects;

CREATE POLICY "drivers upload own accident photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'accident-photos'
  AND EXISTS (
    SELECT 1 FROM public.accidents a
    WHERE a.driver_id = public.current_driver_id()
      AND a.id::text = (storage.foldername(name))[2]
  )
);

CREATE POLICY "drivers read own accident photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'accident-photos'
  AND (
    EXISTS (
      SELECT 1 FROM public.accidents a
      WHERE a.driver_id = public.current_driver_id()
        AND a.id::text = (storage.foldername(name))[2]
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
);

CREATE POLICY "drivers delete own draft accident photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'accident-photos'
  AND EXISTS (
    SELECT 1 FROM public.accidents a
    WHERE a.driver_id = public.current_driver_id()
      AND a.status IN ('DRAFT','WAITING_DOCS')
      AND a.id::text = (storage.foldername(name))[2]
  )
);

-- =========================================================================
-- 3) voice-notes bucket: drop overly broad upload policy
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated users can upload voice notes" ON storage.objects;
-- voice_notes_owner_upload remains and properly scopes uploads by auth.uid()
