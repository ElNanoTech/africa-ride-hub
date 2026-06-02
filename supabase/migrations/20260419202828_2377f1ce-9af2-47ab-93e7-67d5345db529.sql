-- Remove leftover Yango mock driver "Conducteur 0792" seeded during early platform-sync testing.
-- It has no auth_user_id, a placeholder phone (+225 00 00 00 00), and no real activity.
DELETE FROM public.driver_scores WHERE driver_id = 'e7b7c100-cf20-4cc5-b5df-75ae91f6f982';
DELETE FROM public.credit_scores WHERE driver_id = 'e7b7c100-cf20-4cc5-b5df-75ae91f6f982';
DELETE FROM public.driver_score_events WHERE driver_id = 'e7b7c100-cf20-4cc5-b5df-75ae91f6f982';
DELETE FROM public.drivers WHERE id = 'e7b7c100-cf20-4cc5-b5df-75ae91f6f982';