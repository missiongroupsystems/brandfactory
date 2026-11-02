-- A pack's migrations run from their own login (`core setup-migrator`), never from the role that
-- installed the core. Where PUBLIC keeps set_config and query_to_xml (Supabase), SQL in a migration
-- can leave pack_migrator for the session's login; on the installer's session that is the core's
-- owner. The migrator's login holds pack_migrator and pack_recorder only: an escape reaches what
-- pack_migrator owns (every pack's objects, plan R2) and these two functions, which read and
-- record any pack's migrations, never the core's.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pack_recorder') THEN
    CREATE ROLE pack_recorder NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA packs TO pack_recorder;

CREATE FUNCTION packs.pack_migrations(scope text) RETURNS TABLE (name text, hash text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT m.name, m.hash FROM packs.migrations m
  WHERE m.scope = pack_migrations.scope AND pack_migrations.scope <> 'core'
$$;

CREATE FUNCTION packs.pack_migration_done(scope text, name text, hash text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pack_migration_done.scope = 'core' THEN
    RAISE EXCEPTION 'the core''s migrations are recorded by its owner' USING ERRCODE = '42501';
  END IF;
  INSERT INTO packs.migrations (scope, name, hash)
    VALUES (pack_migration_done.scope, pack_migration_done.name, pack_migration_done.hash);
END $$;

REVOKE EXECUTE ON FUNCTION packs.pack_migrations(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION packs.pack_migration_done(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION packs.pack_migrations(text) TO pack_recorder;
GRANT EXECUTE ON FUNCTION packs.pack_migration_done(text, text, text) TO pack_recorder;
