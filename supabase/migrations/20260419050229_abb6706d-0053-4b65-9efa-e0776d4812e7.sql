CREATE OR REPLACE FUNCTION public.normalize_license_plate(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(regexp_replace(upper(trim(p)), '\s+', '', 'g'), '');
$$;