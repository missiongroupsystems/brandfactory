-- 0001 gives every function on its list back to every role it finds, and some never were PUBLIC's:
-- Postgres keeps reading and writing server files, and reloading the configuration, to superusers.
-- On a server where a role existed before the core was installed, 0001 gave it lo_export and
-- pg_reload_conf, which together come near a superuser's power. Each is back to Postgres's own
-- rule: no role that is not a superuser may call them. `migrateCore` checks that on every run.
DO $$
DECLARE
  f regprocedure;
  r text;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pg_catalog' AND p.proname IN ('lo_import', 'lo_export', 'pg_read_file',
      'pg_read_binary_file', 'pg_ls_dir', 'pg_stat_file', 'pg_reload_conf')
  LOOP
    FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname NOT LIKE 'pg\_%' LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', f, r);
    END LOOP;
  END LOOP;
END $$;
