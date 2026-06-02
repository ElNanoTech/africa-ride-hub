-- Add feature flags for native login providers
INSERT INTO public.feature_flags (flag_key, flag_value, description, category, is_platform_only, customer_id)
VALUES 
  ('enable_native_login', true, 'Enable native phone+PIN login for drivers', 'auth', false, NULL),
  ('enable_yango_login', true, 'Enable Yango OAuth login for drivers', 'auth', false, NULL),
  ('enable_otp_login', false, 'Enable SMS OTP login for drivers', 'auth', false, NULL)
ON CONFLICT (flag_key) DO NOTHING;