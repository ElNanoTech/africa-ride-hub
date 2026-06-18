do $$
declare
  v_version text := '20260617090000';
  v_name text := 'layer3f_default_recovery_protection';
  v_has_name boolean;
  v_has_statements boolean;
begin
  if exists (
    select 1 from supabase_migrations.schema_migrations
    where version = v_version
  ) then
    raise notice 'Migration % already marked applied', v_version;
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
      and column_name = 'name'
  ) into v_has_name;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
      and column_name = 'statements'
  ) into v_has_statements;

  if v_has_name and v_has_statements then
    execute 'insert into supabase_migrations.schema_migrations(version, name, statements) values ($1, $2, array[]::text[])'
    using v_version, v_name;
  elsif v_has_name then
    execute 'insert into supabase_migrations.schema_migrations(version, name) values ($1, $2)'
    using v_version, v_name;
  elsif v_has_statements then
    execute 'insert into supabase_migrations.schema_migrations(version, statements) values ($1, array[]::text[])'
    using v_version;
  else
    execute 'insert into supabase_migrations.schema_migrations(version) values ($1)'
    using v_version;
  end if;
end $$;