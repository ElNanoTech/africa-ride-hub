DO $$
DECLARE
  v_original text;
  v_sql text;
BEGIN
  SELECT pg_get_functiondef('public.sync_credit_collections(uuid,text)'::regprocedure)
  INTO v_original;
  IF v_original IS NULL THEN
    RAISE EXCEPTION 'sync_credit_collections(uuid,text) is required before this hotfix';
  END IF;
  v_sql := regexp_replace(
    v_original,
    'WHERE\s+case_id\s*=\s*v_case\.case_id\s+AND\s+promise_status\s*=\s*''ACTIVE'';',
    'WHERE credit_promises_to_pay.case_id = v_case.case_id
          AND credit_promises_to_pay.promise_status = ''ACTIVE'';',
    'g'
  );
  IF v_sql = v_original
    AND v_sql NOT LIKE '%credit_promises_to_pay.case_id = v_case.case_id%'
  THEN
    RAISE EXCEPTION 'sync_credit_collections hotfix pattern was not found';
  END IF;
  EXECUTE v_sql;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_credit_collections(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';