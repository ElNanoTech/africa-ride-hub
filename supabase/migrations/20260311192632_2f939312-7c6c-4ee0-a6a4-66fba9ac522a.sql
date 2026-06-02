-- Delete all test Dakar geofence data
DELETE FROM geofence_alerts;
DELETE FROM geofence_zones;

-- Insert real Abidjan, Côte d'Ivoire geofence zones
INSERT INTO geofence_zones (name, zone_type, center_lat, center_lng, radius_meters, color, is_active) VALUES
  ('Abidjan Métropole', 'circle', 5.3600, -4.0083, 25000, '#3b82f6', true),
  ('Zone Aéroport FHB', 'circle', 5.2561, -3.9262, 5000, '#f59e0b', true),
  ('Zone Port Autonome', 'circle', 5.3020, -4.0150, 3000, '#8b5cf6', true),
  ('Zone Plateau', 'circle', 5.3230, -4.0210, 2000, '#22c55e', true),
  ('Zone Cocody', 'circle', 5.3490, -3.9800, 4000, '#ef4444', true);