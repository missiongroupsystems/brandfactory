-- Pack migrations run as pack_migrator, not as the login role. It owns what a pack makes, so it can
-- create schemas, tables, policies and functions and grant on them to pack_runtime; it has no
-- right in schema packs, is not a superuser, and (made after 0001) cannot call set_config.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pack_migrator') THEN
    CREATE ROLE pack_migrator NOLOGIN;
  END IF;
  EXECUTE format('GRANT CREATE ON DATABASE %I TO pack_migrator', current_database());
END $$;
GRANT pack_migrator TO CURRENT_USER;
GRANT USAGE ON SCHEMA textfn TO pack_migrator;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA textfn TO pack_migrator;
