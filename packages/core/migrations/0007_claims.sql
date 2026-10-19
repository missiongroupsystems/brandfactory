-- Who is calling, where only the core can write it. Row rules used to read the caller from
-- settings (`app.user_id`, `app.capability`, `app.actor`), which hold only while the runtime role
-- cannot call set_config. On Supabase the login role is not a superuser and cannot take
-- set_config from PUBLIC, so a statement could name another caller. Now the core writes one row
-- per transaction, as the login role, before it drops to a pack role; the pack roles may read
-- only their own transaction's row and write none; and the row goes when the transaction commits.
CREATE SCHEMA claims;
REVOKE ALL ON SCHEMA claims FROM PUBLIC;

CREATE TABLE claims.calls (
  xact xid8 PRIMARY KEY DEFAULT pg_current_xact_id(),
  user_id text,
  agent_id text,
  -- A guest's capability: a share link's token.
  capability text,
  -- The person who publishes, tests or promotes a version (the registry's calls).
  actor text
);
REVOKE ALL ON claims.calls FROM PUBLIC;
ALTER TABLE claims.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims.calls FORCE ROW LEVEL SECURITY;
-- Every role, the login role included, sees and writes only this transaction's row.
CREATE POLICY this_call ON claims.calls
  USING (xact = pg_current_xact_id_if_assigned())
  WITH CHECK (xact = pg_current_xact_id());

GRANT USAGE ON SCHEMA claims TO pack_runtime, pack_admin, pack_migrator;
GRANT SELECT ON claims.calls TO pack_runtime, pack_admin;

-- The row goes at commit, so the table holds only calls in flight. The trigger runs as the role
-- in force at commit (a pack role), so it deletes with its owner's rights; no role may call it.
CREATE FUNCTION claims.forget() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  DELETE FROM claims.calls WHERE xact = NEW.xact;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION claims.forget() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER forget AFTER INSERT ON claims.calls
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION claims.forget();

-- What rules and moves read. Empty means none, as the settings did. The WHERE repeats the row
-- rule, so a role that bypasses row rules still reads only its own transaction's claims.
CREATE FUNCTION claims.user_id() RETURNS text
  LANGUAGE sql STABLE
  RETURN (SELECT nullif(user_id, '') FROM claims.calls
    WHERE xact = pg_current_xact_id_if_assigned());
CREATE FUNCTION claims.agent_id() RETURNS text
  LANGUAGE sql STABLE
  RETURN (SELECT nullif(agent_id, '') FROM claims.calls
    WHERE xact = pg_current_xact_id_if_assigned());
CREATE FUNCTION claims.capability() RETURNS text
  LANGUAGE sql STABLE
  RETURN (SELECT nullif(capability, '') FROM claims.calls
    WHERE xact = pg_current_xact_id_if_assigned());
CREATE FUNCTION claims.actor() RETURNS text
  LANGUAGE sql STABLE
  RETURN (SELECT nullif(actor, '') FROM claims.calls
    WHERE xact = pg_current_xact_id_if_assigned());

-- Promotion reads its person from the claims too.
CREATE OR REPLACE FUNCTION packs.check_promotion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor text := claims.actor();
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
