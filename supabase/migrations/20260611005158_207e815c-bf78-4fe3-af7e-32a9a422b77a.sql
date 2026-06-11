ALTER TABLE public.admin_users DISABLE TRIGGER trg_prevent_platform_owner_escalation;
UPDATE public.admin_users SET is_platform_owner = true, is_active = true, email_verified = true WHERE id = 'd97473a4-2439-42ca-964d-2a0595d17327';
ALTER TABLE public.admin_users ENABLE TRIGGER trg_prevent_platform_owner_escalation;

DROP FUNCTION IF EXISTS public.force_promote_platform_owner(uuid);