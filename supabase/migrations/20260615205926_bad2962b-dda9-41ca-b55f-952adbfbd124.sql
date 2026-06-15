INSERT INTO public.customers (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'DAM Africa Default Tenant', 'dam-africa-default')
ON CONFLICT (id) DO NOTHING;