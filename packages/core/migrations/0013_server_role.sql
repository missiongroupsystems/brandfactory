-- The server's login gets no right on the core's tables (docs/executing/core-no-superuser-plan.md,
-- phase 3). Run by a role that may create roles (pack_server); on Fly, where the installer's old
-- login may not, the superuser creates pack_server first (the owner's steps in the plan). It reaches them only through the functions of 0011 and 0012, which now run with the
-- rights of their owner (whoever installs the core), and which the group role pack_server may
-- call. `core setup-login` makes the server's login a member of pack_runtime and pack_server only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pack_server') THEN
    CREATE ROLE pack_server NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA packs, claims TO pack_server;

-- Where the core was installed before on this server, pack_server may already have existed when
-- 0001 gave the risky functions back to every role it found. The server's login holds it, so it
-- loses them, as the pack roles did (0009). Only a superuser can revoke them.
DO $$
DECLARE
  f regprocedure;
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RETURN;
  END IF;
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
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM pack_server', f);
  END LOOP;
END $$;

-- The purge (0011) could delete nothing as an owner that is not a superuser: under forced row
-- rules a DELETE whose WHERE reads a column also needs a SELECT rule, and this_call shows only the
-- current transaction's row. The owner of claims.purge() may also read finished rows; no other
-- role may (the pack roles and the server's login keep this_call alone).
DO $$
BEGIN
  EXECUTE format('CREATE POLICY finished_read ON claims.calls FOR SELECT TO %I
      USING (xact < pg_snapshot_xmin(pg_current_snapshot()))',
    (SELECT r.rolname FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
      WHERE p.oid = 'claims.purge()'::regprocedure));
END $$;

-- The judge reads the pack from the claims too, and refuses another: SQL that escapes inside a
-- call learns nothing about its caller's rights in other packs.
CREATE OR REPLACE FUNCTION packs.judge(environment text, pack text, op text, hash text, agent_of text)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  live text;
  c claims.calls;
  held int;
BEGIN
  SELECT * INTO c FROM claims.calls WHERE xact = pg_current_xact_id_if_assigned();
  -- A row with no pack is the code before 0011's (it wrote none), still serving between this
  -- migration and the deploy; this code always names the pack, and nothing rewrites a row.
  IF FOUND AND c.pack <> '' AND c.pack IS DISTINCT FROM judge.pack THEN
    RAISE EXCEPTION 'not this call''s pack' USING ERRCODE = '42501';
  END IF;
  SELECT v.content_hash INTO live FROM packs.channels ch
    JOIN packs.pack_versions v ON v.pack = ch.pack AND v.version = ch.version
    WHERE ch.environment = judge.environment AND ch.pack = judge.pack;
  IF live IS DISTINCT FROM judge.hash THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'core_refused', DETAIL = '{"code": "STALE"}';
  END IF;
  IF c IS NULL OR NOT c.known THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'core_refused',
      DETAIL = '{"code": "NO_ACCOUNT"}';
  END IF;
  IF (CASE WHEN c.agent_id <> '' THEN c.user_id END) IS DISTINCT FROM judge.agent_of THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'core_refused', DETAIL = '{"code": "STALE"}';
  END IF;
  SELECT count(*) INTO held FROM packs.loadouts l
    WHERE l.pack = judge.pack AND l.principal IN (c.user_id, nullif(c.agent_id, ''))
      AND judge.op = ANY (l.ops);
  IF held <> (CASE WHEN c.agent_id <> '' THEN 2 ELSE 1 END) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'core_refused',
      DETAIL = '{"code": "FORBIDDEN"}';
  END IF;
  RETURN true;
END $$;

-- Each function runs as its owner; the internal ones (server_only, this_call, holds) are called
-- only from these and stay with the owner alone.
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN SELECT unnest(array[
    'claims.open(text, text, text, text, text)', 'claims.open_principal(text, text)',
    'claims.purge()', 'packs.judge(text, text, text, text, text)',
    'packs.server_only()', 'packs.this_call()', 'packs.holds(text)',
    'packs.live_version(text, text)', 'packs.version_content(text)',
    'packs.who(text, text, text)', 'packs.call_check(text, text, text)',
    'packs.key_start(text, text, text)', 'packs.key_done(text, text, jsonb)',
    'packs.log_call(text, text, text, text, text, jsonb, integer, text)',
    'packs.approval_store(text, text, double precision)', 'packs.approval_use(text, text)',
    'packs.approval_outcome(bigint, jsonb)', 'packs.schedule(text[], jsonb)',
    'packs.claim_due(timestamp with time zone)', 'packs.call_beat(bigint, timestamp with time zone)',
    'packs.call_end(bigint, text, jsonb, text, timestamp with time zone)',
    'packs.calls_stuck(timestamp with time zone, timestamp with time zone)',
    'packs.alert(text, text, bigint, text)', 'packs.follow_op(text, text, text)',
    'packs.start_agent(text, text)', 'packs.is_principal(text)'
  ]::regprocedure[]) LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER', f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
  END LOOP;
  FOR f IN SELECT unnest(array[
    'claims.open(text, text, text, text, text)', 'claims.open_principal(text, text)',
    'claims.purge()', 'packs.judge(text, text, text, text, text)',
    'packs.live_version(text, text)', 'packs.version_content(text)',
    'packs.who(text, text, text)', 'packs.call_check(text, text, text)',
    'packs.key_start(text, text, text)', 'packs.key_done(text, text, jsonb)',
    'packs.log_call(text, text, text, text, text, jsonb, integer, text)',
    'packs.approval_store(text, text, double precision)', 'packs.approval_use(text, text)',
    'packs.approval_outcome(bigint, jsonb)', 'packs.schedule(text[], jsonb)',
    'packs.claim_due(timestamp with time zone)', 'packs.call_beat(bigint, timestamp with time zone)',
    'packs.call_end(bigint, text, jsonb, text, timestamp with time zone)',
    'packs.calls_stuck(timestamp with time zone, timestamp with time zone)',
    'packs.alert(text, text, bigint, text)', 'packs.follow_op(text, text, text)',
    'packs.start_agent(text, text)', 'packs.is_principal(text)'
  ]::regprocedure[]) LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO pack_server', f);
  END LOOP;
END $$;

-- What a call may not leave behind, checked at its commit (with its log) so that anything it
-- did roll back with it. Without a superuser the large-object functions stay PUBLIC's, and a
-- large object outlives the call: one owned by the pack roles or the server's login would carry
-- one caller's data to the next. A role setting (ALTER ROLE … SET, also IN DATABASE) outlives
-- every session reset and applies to each new connection.
CREATE FUNCTION packs.end_of_call() RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  login oid := (SELECT r.oid FROM pg_roles r WHERE r.rolname = session_user);
BEGIN
  IF EXISTS (SELECT 1 FROM pg_largeobject_metadata m WHERE m.lomowner IN (login,
      'pack_runtime'::regrole, 'pack_server'::regrole, 'pack_admin'::regrole,
      'pack_migrator'::regrole)) THEN
    RAISE EXCEPTION 'a call may leave no large object' USING ERRCODE = '42501';
  END IF;
  IF (SELECT r.rolconfig FROM pg_roles r WHERE r.oid = login) IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_db_role_setting s WHERE s.setrole IN (login,
       'pack_runtime'::regrole, 'pack_server'::regrole)) THEN
    RAISE EXCEPTION 'a call may leave no role setting' USING ERRCODE = '42501';
  END IF;
  -- Default privileges for these roles (ALTER DEFAULT PRIVILEGES FOR ROLE …) outlive a call too.
  IF EXISTS (SELECT 1 FROM pg_default_acl a WHERE a.defaclrole IN (login,
      'pack_runtime'::regrole, 'pack_server'::regrole)) THEN
    RAISE EXCEPTION 'a call may leave no default privileges' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION packs.end_of_call() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION packs.end_of_call() TO pack_server;

-- The log runs at every call's commit: it checks what the call left (above) when it is one.
CREATE OR REPLACE FUNCTION packs.log_call(principal text, agent_of text, pack text, version text,
    op text, input jsonb, status int, code text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  c claims.calls;
  who text := log_call.principal;
  person text := log_call.agent_of;
BEGIN
  SELECT * INTO c FROM claims.calls WHERE xact = pg_current_xact_id_if_assigned();
  IF FOUND THEN
    IF log_call.pack IS DISTINCT FROM c.pack THEN
      RAISE EXCEPTION 'not this call''s log' USING ERRCODE = '42501';
    END IF;
    PERFORM packs.end_of_call();
    who := nullif(left(CASE WHEN c.agent_id <> '' THEN c.agent_id ELSE c.user_id END, 200), '');
    person := CASE WHEN c.agent_id <> '' THEN c.user_id END;
  END IF;
  INSERT INTO packs.op_calls (principal, agent_of, pack, version, op, input, status, code)
    VALUES (who, person, log_call.pack, log_call.version, log_call.op, log_call.input,
      log_call.status, log_call.code);
END $$;
