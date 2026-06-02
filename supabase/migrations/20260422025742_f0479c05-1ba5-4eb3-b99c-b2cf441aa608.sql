-- Scoring QA report function: returns driver score changes, score events, and cron health for a date range.
-- SECURITY DEFINER so admins can read cron schema (which they don't have direct access to).

CREATE OR REPLACE FUNCTION public.get_scoring_qa_report(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_drivers jsonb;
  v_events jsonb;
  v_cron jsonb;
  v_summary jsonb;
BEGIN
  -- Authorization: admins only
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Drivers whose score changed in the window (aggregate from driver_score_events)
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (row_to_json(t)->>'net_delta')::int), '[]'::jsonb)
    INTO v_drivers
  FROM (
    SELECT
      d.id            AS driver_id,
      d.full_name     AS driver_name,
      d.phone_number  AS phone_number,
      ds.current_score AS current_score,
      SUM(e.delta)::int AS net_delta,
      COUNT(e.id)::int  AS event_count,
      MIN(e.created_at) AS first_event_at,
      MAX(e.created_at) AS last_event_at
    FROM public.driver_score_events e
    JOIN public.drivers d ON d.id = e.driver_id
    LEFT JOIN public.driver_scores ds ON ds.driver_id = d.id
    WHERE e.created_at >= p_start AND e.created_at < p_end
    GROUP BY d.id, d.full_name, d.phone_number, ds.current_score
  ) t;

  -- All score events within the window with associated accident metadata
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (row_to_json(t)->>'created_at') DESC), '[]'::jsonb)
    INTO v_events
  FROM (
    SELECT
      e.id,
      e.driver_id,
      d.full_name AS driver_name,
      e.delta,
      e.reason,
      e.created_at,
      a.case_number,
      a.severity AS accident_severity,
      a.status   AS accident_status
    FROM public.driver_score_events e
    JOIN public.drivers d ON d.id = e.driver_id
    LEFT JOIN public.accidents a ON a.id = e.accident_id
    WHERE e.created_at >= p_start AND e.created_at < p_end
  ) t;

  -- Cron health for scoring-related jobs in the window
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (row_to_json(t)->>'expected_at') DESC), '[]'::jsonb)
      INTO v_cron
    FROM (
      SELECT
        j.jobname,
        j.schedule,
        j.active,
        r.start_time   AS expected_at,
        r.end_time,
        r.status,
        r.return_message,
        EXTRACT(EPOCH FROM (r.end_time - r.start_time))::int AS duration_seconds
      FROM cron.job j
      LEFT JOIN cron.job_run_details r ON r.jobid = j.jobid
       AND r.start_time >= p_start AND r.start_time < p_end
      WHERE j.jobname ILIKE '%scor%' OR j.jobname ILIKE '%weekly%' OR j.jobname ILIKE '%payment%'
    ) t;
  EXCEPTION WHEN OTHERS THEN
    -- pg_cron not installed/accessible -> return empty
    v_cron := '[]'::jsonb;
  END;

  -- Summary stats
  SELECT jsonb_build_object(
    'window_start',          p_start,
    'window_end',            p_end,
    'drivers_affected',      jsonb_array_length(v_drivers),
    'events_total',          jsonb_array_length(v_events),
    'total_negative_delta',  COALESCE((SELECT SUM((e->>'delta')::int) FROM jsonb_array_elements(v_events) e WHERE (e->>'delta')::int < 0), 0),
    'total_positive_delta',  COALESCE((SELECT SUM((e->>'delta')::int) FROM jsonb_array_elements(v_events) e WHERE (e->>'delta')::int > 0), 0),
    'cron_runs',             jsonb_array_length(v_cron),
    'cron_failures',         COALESCE((SELECT COUNT(*) FROM jsonb_array_elements(v_cron) c WHERE (c->>'status') <> 'succeeded'), 0)
  ) INTO v_summary;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'drivers', v_drivers,
    'events',  v_events,
    'cron',    v_cron
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_scoring_qa_report(timestamptz, timestamptz) TO authenticated;