CREATE OR REPLACE FUNCTION public.driver_generate_access_code(p_driver uuid)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_customer uuid;
  v_code text;
  v_hash text;
  v_expires timestamptz;
BEGIN
  SELECT customer_id INTO v_customer FROM public.drivers WHERE id = p_driver;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'driver not found'; END IF;
  IF NOT (is_platform_owner() OR (is_admin() AND v_customer = current_customer_id())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');
  v_hash := extensions.crypt(v_code, extensions.gen_salt('bf'));
  v_expires := now() + interval '7 days';
  UPDATE public.driver_access_codes SET status='revoked', revoked_at=now()
    WHERE driver_id = p_driver AND status='active';
  INSERT INTO public.driver_access_codes (customer_id, driver_id, code_hash, expires_at, created_by, status)
    VALUES (v_customer, p_driver, v_hash, v_expires, auth.uid(), 'active');
  PERFORM public.driver_log(p_driver, 'access_code_generated', jsonb_build_object('expires_at', v_expires));
  RETURN QUERY SELECT v_code, v_expires;
END;
$$;
GRANT EXECUTE ON FUNCTION public.driver_generate_access_code(uuid) TO authenticated;