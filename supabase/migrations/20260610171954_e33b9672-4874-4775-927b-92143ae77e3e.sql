
-- Reuse the existing set_customer_id_from_current() trigger function (created in prior migration).
-- Attach a BEFORE INSERT trigger to every public table that has a nullable customer_id,
-- skipping tables where it's already attached. The trigger only fills NULLs so it's safe
-- to layer over existing logic.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'customer_id' AND NOT a.attisdropped
    JOIN information_schema.columns col
      ON col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'customer_id'
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND col.is_nullable = 'YES'
  LOOP
    -- Drop & re-create to ensure it runs first/consistently.
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_customer_id ON public.%I', rec.tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_set_customer_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_customer_id_from_current()',
      rec.tbl
    );
  END LOOP;
END;
$$;
