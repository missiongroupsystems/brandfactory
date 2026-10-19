-- The core's registry and its roles. Applied by the migrator (the login role), recorded in
-- packs.migrations under the scope 'core'.

CREATE SCHEMA packs;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pack_runtime') THEN
    CREATE ROLE pack_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pack_admin') THEN
    CREATE ROLE pack_admin NOLOGIN;
  END IF;
END $$;

-- The login role reaches both roles only by SET LOCAL ROLE inside a transaction.
GRANT pack_runtime TO CURRENT_USER;
GRANT pack_admin TO CURRENT_USER;

-- Who calls: a person (agent_of null) or an agent acting for one person.
CREATE TABLE packs.principals (
  id text PRIMARY KEY,
  agent_of text REFERENCES packs.principals (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (agent_of IS NULL OR agent_of <> id)
);

-- An agent's person is a person, never another agent.
CREATE FUNCTION packs.check_principal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.agent_of IS NOT NULL AND EXISTS (
    SELECT 1 FROM packs.principals WHERE id = NEW.agent_of AND agent_of IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'an agent acts for a person, not for another agent'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'principal_agent_of_person';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER principals_agent_of_person BEFORE INSERT OR UPDATE ON packs.principals
  FOR EACH ROW EXECUTE FUNCTION packs.check_principal();

-- A published version: frozen, named by pack and version, identified by its content hash.
CREATE TABLE packs.pack_versions (
  pack text NOT NULL,
  version text NOT NULL,
  content jsonb NOT NULL,
  content_hash text NOT NULL UNIQUE,
  published_by text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pack, version)
);

CREATE FUNCTION packs.refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows never change', TG_TABLE_NAME
    USING ERRCODE = 'check_violation', CONSTRAINT = 'frozen_row';
END $$;
CREATE TRIGGER pack_versions_frozen BEFORE UPDATE OR DELETE ON packs.pack_versions
  FOR EACH ROW EXECUTE FUNCTION packs.refuse_change();

-- A test run of one version, bound to the hash of what was tested.
CREATE TABLE packs.test_runs (
  id bigserial PRIMARY KEY,
  pack text NOT NULL,
  version text NOT NULL,
  version_hash text NOT NULL,
  passed boolean NOT NULL,
  results jsonb NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (pack, version) REFERENCES packs.pack_versions (pack, version)
);
CREATE TRIGGER test_runs_frozen BEFORE UPDATE OR DELETE ON packs.test_runs
  FOR EACH ROW EXECUTE FUNCTION packs.refuse_change();

-- A run names the hash of what it tested; that hash is its version's, or the row is refused.
CREATE FUNCTION packs.check_test_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM packs.pack_versions
    WHERE pack = NEW.pack AND version = NEW.version AND content_hash = NEW.version_hash
  ) THEN
    RAISE EXCEPTION 'the run''s hash is not the hash of % %', NEW.pack, NEW.version
      USING ERRCODE = 'check_violation', CONSTRAINT = 'test_run_hash';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_runs_hash BEFORE INSERT ON packs.test_runs
  FOR EACH ROW EXECUTE FUNCTION packs.check_test_run();

-- The live pointer: which version of a pack runs in an environment.
CREATE TABLE packs.channels (
  environment text NOT NULL,
  pack text NOT NULL,
  version text NOT NULL,
  promoted_by text NOT NULL,
  promoted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment, pack),
  FOREIGN KEY (pack, version) REFERENCES packs.pack_versions (pack, version)
);

-- The pointer moves only to a version with a passing test run for its exact content, and only
-- when a person (a principal with no agent_of) says so. The person is the transaction's
-- app.actor, which the core sets from a verified token.
CREATE FUNCTION packs.check_promotion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor text := nullif(current_setting('app.actor', true), '');
  hash text;
BEGIN
  SELECT content_hash INTO hash FROM packs.pack_versions
    WHERE pack = NEW.pack AND version = NEW.version;
  IF hash IS NULL THEN
    RAISE EXCEPTION 'no version % of %', NEW.version, NEW.pack
      USING ERRCODE = 'check_violation', CONSTRAINT = 'promotion_needs_version';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM packs.test_runs WHERE version_hash = hash AND passed) THEN
    RAISE EXCEPTION 'version % of % has no passing test run', NEW.version, NEW.pack
      USING ERRCODE = 'check_violation', CONSTRAINT = 'promotion_needs_passing_run';
  END IF;
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM packs.principals WHERE id = actor AND agent_of IS NULL
  ) THEN
    RAISE EXCEPTION 'only a person can promote a version'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'promotion_needs_person';
  END IF;
  NEW.promoted_by := actor;
  NEW.promoted_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER channels_promotion BEFORE INSERT OR UPDATE ON packs.channels
  FOR EACH ROW EXECUTE FUNCTION packs.check_promotion();

-- The moves a principal may call in a pack. An agent's calls also need its person's loadout.
CREATE TABLE packs.loadouts (
  principal text NOT NULL REFERENCES packs.principals (id) ON DELETE CASCADE,
  pack text NOT NULL,
  ops text[] NOT NULL,
  PRIMARY KEY (principal, pack)
);

-- One row per call, refused or not, by people and agents.
CREATE TABLE packs.op_calls (
  id bigserial PRIMARY KEY,
  principal text,
  agent_of text,
  pack text NOT NULL,
  version text,
  op text NOT NULL,
  input jsonb,
  status integer NOT NULL,
  code text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX op_calls_at ON packs.op_calls (pack, at);

CREATE TABLE packs.migrations (
  scope text NOT NULL,
  name text NOT NULL,
  hash text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, name)
);

-- Grants. The runtime role has nothing in this schema. The admin role is the only one that
-- writes versions, test runs and the pointer.
REVOKE ALL ON SCHEMA packs FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA packs FROM PUBLIC;
GRANT USAGE ON SCHEMA packs TO pack_admin;
GRANT SELECT, INSERT ON packs.pack_versions TO pack_admin;
GRANT SELECT, INSERT ON packs.test_runs TO pack_admin;
GRANT USAGE ON SEQUENCE packs.test_runs_id_seq TO pack_admin;
GRANT SELECT, INSERT, UPDATE ON packs.channels TO pack_admin;
GRANT SELECT ON packs.principals TO pack_admin;

DO $$
DECLARE r text;
BEGIN
  -- Supabase's API roles get nothing here either.
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA packs FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA packs FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- Functions the runtime role may not call: the same list as `forbiddenFunction` in src/sql.ts,
-- which `registry.test.ts` checks against this database. Postgres grants EXECUTE to PUBLIC, so
-- the grant is taken from PUBLIC and given back to every other role that exists now: only the
-- pack roles lose it. A role made later does not get these functions, and the migrator must be a
-- superuser (see the completion document).
DO $$
DECLARE
  f regprocedure;
  r text;
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
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    FOR r IN SELECT rolname FROM pg_roles
      WHERE rolname NOT IN ('pack_runtime', 'pack_admin') AND rolname NOT LIKE 'pg\_%'
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, r);
    END LOOP;
  END LOOP;
END $$;
