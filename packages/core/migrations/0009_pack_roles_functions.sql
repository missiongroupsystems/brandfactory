-- 0001 takes risky functions from PUBLIC, then gives them back to every role that existed at the
-- time but pack_runtime and pack_admin. Roles belong to the server, not the database: where the
-- core was installed before on the same server, pack_migrator (0004) already existed and got them
-- back too, set_config among them, and a pack's migrations run as pack_migrator. None of the pack
-- roles may call them; `migrateCore` checks that on every run.
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pg_catalog' AND (
      p.proname IN ('set_config', 'pg_sleep', 'pg_sleep_for', 'pg_sleep_until', 'pg_read_file',
        'pg_read_binary_file', 'pg_ls_dir', 'pg_stat_file', 'pg_terminate_backend',
        'pg_cancel_backend', 'pg_reload_conf', 'pg_notify', 'pg_logical_emit_message',
        'loread', 'lowrite')
      OR p.proname LIKE 'lo\_%' OR p.proname LIKE 'dblink%' OR p.proname LIKE 'xpath%'
      OR p.proname LIKE 'pg\_advisory%' OR p.proname LIKE 'pg\_try\_advisory%'
      OR p.proname LIKE '%\_to\_xml' OR p.proname LIKE '%\_to\_xmlschema'
      OR p.proname LIKE '%\_to\_xml\_and\_xmlschema'
    )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM pack_migrator, pack_admin, pack_runtime', f);
  END LOOP;
END $$;
