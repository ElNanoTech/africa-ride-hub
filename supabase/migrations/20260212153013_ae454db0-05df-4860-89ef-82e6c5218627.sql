
-- Create a function to get the leaderboard (top drivers by latest credit score)
-- Only returns data if the gamification_leaderboard feature flag is enabled
CREATE OR REPLACE FUNCTION public.get_driver_leaderboard(p_limit integer DEFAULT 20)
RETURNS TABLE (
  driver_id uuid,
  driver_name text,
  profile_image_url text,
  score integer,
  tier text,
  score_change integer,
  rank bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if feature is enabled
  IF NOT is_feature_enabled('gamification_leaderboard') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH latest_scores AS (
    SELECT DISTINCT ON (cs.driver_id)
      cs.driver_id,
      cs.score,
      cs.tier,
      cs.calculation_week
    FROM credit_scores cs
    WHERE cs.status IN ('active', 'provisional')
    ORDER BY cs.driver_id, cs.calculation_week DESC
  ),
  previous_scores AS (
    SELECT DISTINCT ON (cs.driver_id)
      cs.driver_id,
      cs.score as prev_score
    FROM credit_scores cs
    WHERE cs.status IN ('active', 'provisional')
      AND cs.calculation_week < (
        SELECT MAX(ls.calculation_week) FROM latest_scores ls WHERE ls.driver_id = cs.driver_id
      )
    ORDER BY cs.driver_id, cs.calculation_week DESC
  ),
  ranked AS (
    SELECT
      ls.driver_id,
      d.full_name as driver_name,
      d.profile_image_url,
      ls.score,
      ls.tier,
      COALESCE(ls.score - ps.prev_score, 0)::integer as score_change,
      ROW_NUMBER() OVER (ORDER BY ls.score DESC) as rank
    FROM latest_scores ls
    JOIN drivers d ON d.id = ls.driver_id
    LEFT JOIN previous_scores ps ON ps.driver_id = ls.driver_id
    WHERE d.driver_status = 'active'
  )
  SELECT r.driver_id, r.driver_name, r.profile_image_url, r.score, r.tier, r.score_change, r.rank
  FROM ranked r
  ORDER BY r.rank
  LIMIT p_limit;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_driver_leaderboard(integer) TO authenticated;
