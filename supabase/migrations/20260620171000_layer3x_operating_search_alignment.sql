-- Layer 3X search alignment after hosted generated-column immutability retry.
-- Keeps tags searchable without putting array_to_string(tags, ...) in a generated expression.

DO $$
BEGIN
  IF to_regclass('public.v_operating_search_index') IS NULL THEN
    RAISE EXCEPTION 'Layer 3X search alignment requires public.v_operating_search_index';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_operating_knowledge(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  object_id text,
  object_type text,
  object_key text,
  title text,
  category text,
  description text,
  routes text[],
  tags text[],
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    osi.object_id,
    osi.object_type,
    osi.object_key,
    osi.title,
    osi.category,
    osi.description,
    osi.routes,
    osi.tags,
    CASE
      WHEN NULLIF(trim(p_query), '') IS NULL THEN 0::real
      ELSE ts_rank(osi.search_vector, plainto_tsquery('simple'::regconfig, p_query))
    END AS rank
  FROM public.v_operating_search_index osi
  WHERE osi.status IN ('PUBLISHED', 'ACTIVE')
    AND (
      NULLIF(trim(p_query), '') IS NULL
      OR osi.search_vector @@ plainto_tsquery('simple'::regconfig, p_query)
      OR osi.title ILIKE '%' || p_query || '%'
      OR osi.description ILIKE '%' || p_query || '%'
      OR EXISTS (
        SELECT 1
        FROM unnest(osi.tags) tag
        WHERE tag ILIKE '%' || p_query || '%'
      )
    )
  ORDER BY rank DESC, osi.updated_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
$$;

GRANT EXECUTE ON FUNCTION public.search_operating_knowledge(text, integer) TO authenticated;
