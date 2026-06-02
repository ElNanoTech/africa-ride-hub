-- Add auth category label
UPDATE public.feature_flags SET category = 'auth' WHERE flag_key IN ('enable_native_login', 'enable_yango_login', 'enable_otp_login');

-- Add branding platform settings
INSERT INTO public.platform_settings (setting_key, setting_value, description)
VALUES (
  'branding',
  '{
    "app_name": "DAM Flotte",
    "tagline": "Votre partenaire mobilité en Côte d''Ivoire",
    "support_email": "support@dam-flotte.ci",
    "support_phone": "+225 07 00 00 00",
    "footer_text": "© 2026 DAM Flotte. Tous droits réservés.",
    "favicon_url": null
  }'::jsonb,
  'Configuration de la marque blanche (logo, couleurs, textes)'
)
ON CONFLICT (setting_key) DO NOTHING;