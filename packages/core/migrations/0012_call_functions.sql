-- The call path reaches the core's tables only through these functions
-- (docs/executing/core-no-superuser-plan.md, D3, phase 2a). Two kinds:
--
-- * Server only: refused inside a call, that is, in a transaction that has a claims row. SQL that
--   escapes a pack role always runs inside a call, so it cannot use them.
-- * For this call: they act only for the caller and the pack in this transaction's claims row,
--   so SQL that escapes inside a call can do with them only what its own call could.
--
-- The login role still owns everything until phase 3; then these functions are what the
-- server's login may call.

-- Raises inside a call.
CREATE FUNCTION packs.server_only() RETURNS void
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM claims.calls WHERE xact = pg_current_xact_id_if_assigned()) THEN
    RAISE EXCEPTION 'not inside a call' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION packs.server_only() FROM PUBLIC;

-- This call's principal (an agent's own id, or the person's) and pack; raises outside a call or
-- for an unknown principal.
CREATE FUNCTION packs.this_call(OUT principal text, OUT pack text)
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  c claims.calls;
BEGIN
  SELECT * INTO c FROM claims.calls WHERE xact = pg_current_xact_id_if_assigned();
  IF NOT FOUND OR NOT c.known THEN
    RAISE EXCEPTION 'not inside a call' USING ERRCODE = '42501';
  END IF;
  principal := CASE WHEN c.agent_id <> '' THEN c.agent_id ELSE c.user_id END;
  pack := c.pack;
END $$;
REVOKE EXECUTE ON FUNCTION packs.this_call() FROM PUBLIC;

-- Whether this call's principal (and an agent's person) holds a move of this call's pack. A
-- guest (principal none) holds nothing.
CREATE FUNCTION packs.holds(op text) RETURNS boolean
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  me record := packs.this_call();
BEGIN
  IF me.principal = '' THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM packs.loadouts l
      WHERE l.pack = me.pack AND l.principal = me.principal AND holds.op = ANY (l.ops))
    AND NOT EXISTS (SELECT 1 FROM packs.principals p WHERE p.id = me.principal
      AND p.agent_of IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM packs.loadouts l WHERE l.pack = me.pack
        AND l.principal = p.agent_of AND holds.op = ANY (l.ops)));
END $$;
REVOKE EXECUTE ON FUNCTION packs.holds(text) FROM PUBLIC;

-- Step 2, which version is live: its name and hash, and its content when asked.
CREATE FUNCTION packs.live_version(environment text, pack text)
  RETURNS TABLE (version text, hash text)
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM packs.server_only();
  RETURN QUERY SELECT v.version, v.content_hash
    FROM packs.channels c
    JOIN packs.pack_versions v ON v.pack = c.pack AND v.version = c.version
    WHERE c.environment = live_version.environment AND c.pack = live_version.pack;
END $$;
REVOKE EXECUTE ON FUNCTION packs.live_version(text, text) FROM PUBLIC;

CREATE FUNCTION packs.version_content(hash text) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM packs.server_only();
  RETURN (SELECT v.content FROM packs.pack_versions v WHERE v.content_hash = version_content.hash);
END $$;
REVOKE EXECUTE ON FUNCTION packs.version_content(text) FROM PUBLIC;

-- Step 3, may this principal call the move: its person (for an agent) and how many of the
-- loadouts it needs hold the move. No row for an unknown principal.
CREATE FUNCTION packs.who(principal text, pack text, op text)
  RETURNS TABLE (agent_of text, held int)
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM packs.server_only();
  RETURN QUERY SELECT p.agent_of, (SELECT count(*)::int FROM packs.loadouts l
      WHERE l.pack = who.pack AND l.principal IN (p.id, p.agent_of) AND who.op = ANY (l.ops))
    FROM packs.principals p WHERE p.id = who.principal;
END $$;
REVOKE EXECUTE ON FUNCTION packs.who(text, text, text) FROM PUBLIC;

-- Steps 2 and 3 read in a call's first trip, from its claims (run.ts, `checkOf`): the live
-- hash, whether the principal exists, its person, and how many loadouts hold the move. Only for
-- this call's own pack.
CREATE FUNCTION packs.call_check(environment text, pack text, op text)
  RETURNS TABLE (core_check text, known boolean, agent_of text, held int)
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  c claims.calls;
BEGIN
  SELECT * INTO c FROM claims.calls WHERE xact = pg_current_xact_id_if_assigned();
  IF NOT FOUND OR c.pack IS DISTINCT FROM call_check.pack THEN
    RAISE EXCEPTION 'not this call''s pack' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT
    (SELECT v.content_hash FROM packs.channels ch
      JOIN packs.pack_versions v ON v.pack = ch.pack AND v.version = ch.version
      WHERE ch.environment = call_check.environment AND ch.pack = call_check.pack),
    c.known,
    CASE WHEN c.agent_id <> '' THEN c.user_id END,
    (SELECT count(*)::int FROM packs.loadouts l
      WHERE l.pack = call_check.pack AND l.principal IN (c.user_id, nullif(c.agent_id, ''))
        AND call_check.op = ANY (l.ops));
END $$;
REVOKE EXECUTE ON FUNCTION packs.call_check(text, text, text) FROM PUBLIC;

-- An idempotency key for this call's principal and pack: claimed now (fresh), or the earlier
-- call's input hash and answer.
CREATE FUNCTION packs.key_start(op text, key text, input_hash text)
  RETURNS TABLE (fresh boolean, seen_hash text, result jsonb)
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  me record := packs.this_call();
BEGIN
  INSERT INTO packs.idempotency (principal, pack, op, key, input_hash)
    VALUES (me.principal, me.pack, key_start.op, key_start.key, key_start.input_hash)
    ON CONFLICT DO NOTHING;
  IF FOUND THEN
    RETURN QUERY SELECT true, key_start.input_hash, NULL::jsonb;
    RETURN;
  END IF;
  RETURN QUERY SELECT false, i.input_hash, i.result FROM packs.idempotency i
    WHERE i.principal = me.principal AND i.pack = me.pack AND i.op = key_start.op
      AND i.key = key_start.key;
END $$;
REVOKE EXECUTE ON FUNCTION packs.key_start(text, text, text) FROM PUBLIC;

CREATE FUNCTION packs.key_done(op text, key text, result jsonb) RETURNS void
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  me record := packs.this_call();
BEGIN
  UPDATE packs.idempotency i SET result = key_done.result
    WHERE i.principal = me.principal AND i.pack = me.pack AND i.op = key_done.op
      AND i.key = key_done.key;
END $$;
REVOKE EXECUTE ON FUNCTION packs.key_done(text, text, jsonb) FROM PUBLIC;

-- Step 8, the log. Inside a call, the row is for its own principal, person and pack: the claims
-- name them, whatever is passed (a guest's principal is none, logged as null). Outside a call,
-- for any call, refused ones included.
CREATE FUNCTION packs.log_call(principal text, agent_of text, pack text, version text, op text,
    input jsonb, status int, code text)
  RETURNS void
  LANGUAGE plpgsql
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
    who := nullif(left(CASE WHEN c.agent_id <> '' THEN c.agent_id ELSE c.user_id END, 200), '');
    person := CASE WHEN c.agent_id <> '' THEN c.user_id END;
  END IF;
  INSERT INTO packs.op_calls (principal, agent_of, pack, version, op, input, status, code)
    VALUES (who, person, log_call.pack, log_call.version, log_call.op, log_call.input,
      log_call.status, log_call.code);
END $$;
REVOKE EXECUTE ON FUNCTION packs.log_call(text, text, text, text, text, jsonb, int, text)
  FROM PUBLIC;

-- Phase 2b: approvals, timed calls, agents, events.

-- A person's yes to what an effect move sends now, for this call's principal and pack. `sending`
-- when a send of exactly this used its yes, has no outcome yet, and may still be on its way.
CREATE FUNCTION packs.approval_store(op text, payload_hash text, sending_secs double precision)
  RETURNS TABLE (id text, sending boolean)
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  me record := packs.this_call();
  found_id bigint;
BEGIN
  IF NOT packs.holds(approval_store.op) THEN
    RAISE EXCEPTION 'this call''s principal does not hold %', approval_store.op USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM packs.approvals a
      WHERE a.pack = me.pack AND a.op = approval_store.op
        AND a.payload_hash = approval_store.payload_hash AND a.used_at IS NOT NULL
        AND a.outcome IS NULL AND a.used_at > now() - make_interval(secs => sending_secs)) THEN
    RETURN QUERY SELECT NULL::text, true;
    RETURN;
  END IF;
  SELECT a.id INTO found_id FROM packs.approvals a
    WHERE a.pack = me.pack AND a.op = approval_store.op
      AND a.payload_hash = approval_store.payload_hash AND a.approved_by = me.principal
      AND a.used_at IS NULL
    LIMIT 1;
  IF found_id IS NULL THEN
    INSERT INTO packs.approvals (pack, op, payload_hash, approved_by)
      VALUES (me.pack, approval_store.op, approval_store.payload_hash, me.principal)
      RETURNING packs.approvals.id INTO found_id;
  END IF;
  RETURN QUERY SELECT found_id::text, false;
END $$;
REVOKE EXECUTE ON FUNCTION packs.approval_store(text, text, double precision) FROM PUBLIC;

-- Uses one yes for this call's pack: any person's who still holds the move (a manager's yes lets
-- an assistant send), recorded as used by this call's principal, who must hold the move too.
CREATE FUNCTION packs.approval_use(op text, payload_hash text) RETURNS text
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  me record := packs.this_call();
  used text;
BEGIN
  -- A caller who does not hold the move uses no yes: the call is told one is needed.
  IF NOT packs.holds(approval_use.op) THEN RETURN NULL; END IF;
  UPDATE packs.approvals SET used_at = now(), used_by = me.principal
    WHERE packs.approvals.id = (SELECT a.id FROM packs.approvals a
                 JOIN packs.principals p ON p.id = a.approved_by AND p.agent_of IS NULL
                 JOIN packs.loadouts l ON l.principal = a.approved_by AND l.pack = a.pack
                   AND a.op = ANY (l.ops)
                 WHERE a.pack = me.pack AND a.op = approval_use.op
                   AND a.payload_hash = approval_use.payload_hash AND a.used_at IS NULL
                 ORDER BY a.id LIMIT 1 FOR UPDATE OF a SKIP LOCKED)
    RETURNING packs.approvals.id::text INTO used;
  RETURN used;
END $$;
REVOKE EXECUTE ON FUNCTION packs.approval_use(text, text) FROM PUBLIC;

-- What a send answered, kept on its yes; outside a call (the send runs between transactions).
CREATE FUNCTION packs.approval_outcome(id bigint, outcome jsonb) RETURNS void
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM packs.server_only();
  UPDATE packs.approvals a SET outcome = approval_outcome.outcome WHERE a.id = approval_outcome.id;
END $$;
REVOKE EXECUTE ON FUNCTION packs.approval_outcome(bigint, jsonb) FROM PUBLIC;

-- Timed calls for this call's principal and pack. The moves in `needed` and every move asked for
-- it (and an agent's person) must hold, else the names it lacks come back and nothing is stored. Asking again under
-- a key moves the call and arms it again, unless it is running; a waiting call keeps who asked
-- for it, an ended one belongs to who asks again.
CREATE FUNCTION packs.schedule(needed text[], calls jsonb) RETURNS text[]
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  me record := packs.this_call();
  missing text[];
  c jsonb;
  wanted text[];
BEGIN
  IF me.principal = '' THEN
    RAISE EXCEPTION 'a guest schedules nothing' USING ERRCODE = '42501';
  END IF;
  -- Every move asked for is needed, whatever the caller listed.
  wanted := array(SELECT DISTINCT x FROM unnest(needed || array(
    SELECT e ->> 'op' FROM jsonb_array_elements(calls) AS e)) AS x);
  SELECT array(
    SELECT n FROM unnest(wanted) AS n
    WHERE NOT EXISTS (SELECT 1 FROM packs.loadouts l
        WHERE l.pack = me.pack AND n = ANY (l.ops) AND l.principal = me.principal)
      OR EXISTS (SELECT 1 FROM packs.principals p WHERE p.id = me.principal
        AND p.agent_of IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM packs.loadouts l WHERE l.pack = me.pack
          AND n = ANY (l.ops) AND l.principal = p.agent_of))
  ) INTO missing;
  IF cardinality(missing) > 0 THEN
    RETURN missing;
  END IF;
  FOR c IN SELECT jsonb_array_elements(calls) LOOP
    INSERT INTO packs.scheduled_calls AS s (pack, op, key, input, principal, run_at)
      VALUES (me.pack, c ->> 'op', c ->> 'key', c -> 'input', me.principal,
        (c ->> 'at')::timestamptz)
      ON CONFLICT (pack, op, key) DO UPDATE SET
        input = excluded.input, run_at = excluded.run_at,
        principal = CASE WHEN s.status = 'scheduled' THEN s.principal ELSE excluded.principal END,
        status = 'scheduled', attempts = 0, error = NULL, result = NULL, updated_at = now()
      WHERE s.status <> 'running';
  END LOOP;
  RETURN missing;
END $$;
REVOKE EXECUTE ON FUNCTION packs.schedule(text[], jsonb) FROM PUBLIC;

-- The scheduler's loop, outside any call: claim one due call, beat, end, mark stuck, alert, and
-- read a pack's follow-up move.
CREATE FUNCTION packs.claim_due(at timestamptz)
  RETURNS TABLE (id text, pack text, op text, input jsonb, principal text)
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM packs.server_only();
  RETURN QUERY UPDATE packs.scheduled_calls s SET status = 'running', attempts = s.attempts + 1,
      heartbeat_at = claim_due.at, updated_at = claim_due.at
    WHERE s.id = (SELECT d.id FROM packs.scheduled_calls d
                  WHERE d.status = 'scheduled' AND d.run_at <= claim_due.at
                  ORDER BY d.run_at, d.id LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING s.id::text, s.pack, s.op, s.input, s.principal;
END $$;
REVOKE EXECUTE ON FUNCTION packs.claim_due(timestamptz) FROM PUBLIC;

CREATE FUNCTION packs.call_beat(id bigint, at timestamptz) RETURNS void
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM packs.server_only();
  UPDATE packs.scheduled_calls s SET heartbeat_at = call_beat.at
    WHERE s.id = call_beat.id AND s.status = 'running';
END $$;
REVOKE EXECUTE ON FUNCTION packs.call_beat(bigint, timestamptz) FROM PUBLIC;

CREATE FUNCTION packs.call_end(id bigint, status text, result jsonb, error text, at timestamptz)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM packs.server_only();
  UPDATE packs.scheduled_calls s SET status = call_end.status, result = call_end.result,
      error = call_end.error, updated_at = call_end.at
    WHERE s.id = call_end.id AND s.status = 'running';
END $$;
REVOKE EXECUTE ON FUNCTION packs.call_end(bigint, text, jsonb, text, timestamptz) FROM PUBLIC;

CREATE FUNCTION packs.calls_stuck(at timestamptz, beat_before timestamptz)
  RETURNS TABLE (id text, pack text, op text, input jsonb, principal text)
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM packs.server_only();
  RETURN QUERY UPDATE packs.scheduled_calls s SET status = 'unknown_outcome',
      updated_at = calls_stuck.at,
      error = 'cut off while it ran: check before anyone tries again'
    WHERE s.status = 'running' AND s.heartbeat_at < calls_stuck.beat_before
    RETURNING s.id::text, s.pack, s.op, s.input, s.principal;
END $$;
REVOKE EXECUTE ON FUNCTION packs.calls_stuck(timestamptz, timestamptz) FROM PUBLIC;

CREATE FUNCTION packs.alert(principal text, pack text, call_id bigint, message text)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM packs.server_only();
  INSERT INTO packs.alerts (principal, pack, call_id, message)
    VALUES (alert.principal, alert.pack, alert.call_id, alert.message);
END $$;
REVOKE EXECUTE ON FUNCTION packs.alert(text, text, bigint, text) FROM PUBLIC;

CREATE FUNCTION packs.follow_op(environment text, pack text, which text) RETURNS text
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM packs.server_only();
  RETURN (SELECT v.content -> 'manifest' -> 'scheduler' ->> follow_op.which
    FROM packs.channels c JOIN packs.pack_versions v ON v.pack = c.pack AND v.version = c.version
    WHERE c.environment = follow_op.environment AND c.pack = follow_op.pack);
END $$;
REVOKE EXECUTE ON FUNCTION packs.follow_op(text, text, text) FROM PUBLIC;

-- A person's agent `person/name`, outside any call: made on first use, with a copy of the
-- person's loadouts (packs the person lost go too). 'ok', or the refusal's code
-- (NO_ACCOUNT, NOT_A_PERSON, PRINCIPAL_EXISTS).
CREATE FUNCTION packs.start_agent(person text, name text) RETURNS text
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  p packs.principals;
  agent text := start_agent.person || '/' || start_agent.name;
  owner text;
BEGIN
  PERFORM packs.server_only();
  SELECT * INTO p FROM packs.principals WHERE id = start_agent.person;
  IF NOT FOUND THEN RETURN 'NO_ACCOUNT'; END IF;
  IF p.agent_of IS NOT NULL THEN RETURN 'NOT_A_PERSON'; END IF;
  INSERT INTO packs.principals (id, agent_of) VALUES (agent, start_agent.person)
    ON CONFLICT (id) DO NOTHING;
  SELECT x.agent_of INTO owner FROM packs.principals x WHERE x.id = agent;
  IF owner IS DISTINCT FROM start_agent.person THEN RETURN 'PRINCIPAL_EXISTS'; END IF;
  INSERT INTO packs.loadouts (principal, pack, ops)
    SELECT agent, l.pack, l.ops FROM packs.loadouts l WHERE l.principal = start_agent.person
    ON CONFLICT (principal, pack) DO UPDATE SET ops = excluded.ops;
  DELETE FROM packs.loadouts a WHERE a.principal = agent
    AND NOT EXISTS (SELECT 1 FROM packs.loadouts l
      WHERE l.principal = start_agent.person AND l.pack = a.pack);
  RETURN 'ok';
END $$;
REVOKE EXECUTE ON FUNCTION packs.start_agent(text, text) FROM PUBLIC;

-- Whether a principal exists, outside any call (the events stream).
CREATE FUNCTION packs.is_principal(id text) RETURNS boolean
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM packs.server_only();
  RETURN EXISTS (SELECT 1 FROM packs.principals p WHERE p.id = is_principal.id);
END $$;
REVOKE EXECUTE ON FUNCTION packs.is_principal(text) FROM PUBLIC;

-- The functions of 0011 too: with pg_catalog alone, pg_temp is still searched first for types
-- and functions, so a temporary table named like a type could change what they do.
ALTER FUNCTION claims.open(text, text, text, text, text) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION claims.open_principal(text, text) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION claims.purge() SET search_path = pg_catalog, pg_temp;
