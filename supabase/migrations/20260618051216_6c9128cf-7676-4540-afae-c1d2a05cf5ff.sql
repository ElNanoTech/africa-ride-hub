CREATE OR REPLACE FUNCTION public.credit_default_evidence_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'default evidence is immutable; attach corrected evidence instead of deleting';
  END IF;

  IF OLD.default_review_id IS DISTINCT FROM NEW.default_review_id
    OR OLD.credit_account_id IS DISTINCT FROM NEW.credit_account_id
    OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
    OR OLD.evidence_type IS DISTINCT FROM NEW.evidence_type
    OR OLD.source_reference_type IS DISTINCT FROM NEW.source_reference_type
    OR OLD.source_reference_id IS DISTINCT FROM NEW.source_reference_id THEN
    RAISE EXCEPTION 'default evidence identity is immutable';
  END IF;

  IF OLD.locked_at IS NOT NULL THEN
    IF OLD.evidence_summary IS DISTINCT FROM NEW.evidence_summary
      OR NEW.locked_at IS DISTINCT FROM OLD.locked_at THEN
      RAISE EXCEPTION 'default evidence is locked after decision';
    END IF;
  ELSIF EXISTS (
    SELECT 1
    FROM public.credit_default_decisions d
    WHERE d.default_review_id = OLD.default_review_id
  ) THEN
    IF OLD.evidence_summary IS DISTINCT FROM NEW.evidence_summary
      OR NEW.locked_at IS NULL THEN
      RAISE EXCEPTION 'default evidence is locked after decision';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_version text := '20260618011000';
  v_name text := 'layer3f_evidence_lock_guard_hotfix';
  v_has_name boolean;
  v_has_statements boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = v_version
  ) THEN
    RAISE NOTICE 'Migration % already marked applied', v_version;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations' AND column_name = 'name'
  ) INTO v_has_name;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations' AND column_name = 'statements'
  ) INTO v_has_statements;

  IF v_has_name AND v_has_statements THEN
    EXECUTE 'insert into supabase_migrations.schema_migrations(version, name, statements) values ($1, $2, array[]::text[])'
      USING v_version, v_name;
  ELSIF v_has_name THEN
    EXECUTE 'insert into supabase_migrations.schema_migrations(version, name) values ($1, $2)'
      USING v_version, v_name;
  ELSIF v_has_statements THEN
    EXECUTE 'insert into supabase_migrations.schema_migrations(version, statements) values ($1, array[]::text[])'
      USING v_version;
  ELSE
    EXECUTE 'insert into supabase_migrations.schema_migrations(version) values ($1)'
      USING v_version;
  END IF;
END $$;