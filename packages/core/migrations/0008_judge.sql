-- A read in one trip (run.ts, `inOneRead`): the database judges the call before the move runs,
-- and stops the text at the first refusal. A refusal is P0001 'core_refused' with a JSON detail
-- the core turns back into its answer.

-- The check, as the login role before the call drops to a pack role: the live version is still
-- the one the core holds, the caller has a claims row, its person is the one the core holds, and
-- the loadouts hold the move (its own, and its person's for an agent). The order and the answers
-- of `inOneTrip` and `authorise` (run.ts). No pack role may call it.
CREATE FUNCTION packs.judge(environment text, pack text, op text, hash text, agent_of text)
  RETURNS boolean
  LANGUAGE plpgsql
AS $$
DECLARE
  live text;
  c claims.calls;
  held int;
BEGIN
  SELECT v.content_hash INTO live FROM packs.channels ch
    JOIN packs.pack_versions v ON v.pack = ch.pack AND v.version = ch.version
    WHERE ch.environment = judge.environment AND ch.pack = judge.pack;
  IF live IS DISTINCT FROM judge.hash THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'core_refused', DETAIL = '{"code": "STALE"}';
  END IF;
  SELECT * INTO c FROM claims.calls WHERE xact = pg_current_xact_id_if_assigned();
  IF NOT FOUND THEN
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
REVOKE EXECUTE ON FUNCTION packs.judge(text, text, text, text, text) FROM PUBLIC;

-- Around each rule, as pack_runtime: the rule's first row, as JSON (null for none), passes only
-- with `ok` true; otherwise its refusal, with the `message` and `details` the rule gave. A pack
-- that calls it can only refuse its own call, which its rules can already do.
CREATE FUNCTION claims.rule_ok(r jsonb, rule text) RETURNS boolean
  LANGUAGE plpgsql
AS $$
BEGIN
  IF (r -> 'ok') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'core_refused',
      DETAIL = jsonb_build_object('code', 'RULE', 'rule', rule, 'message', r -> 'message',
        'details', r -> 'details')::text;
  END IF;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION claims.rule_ok(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claims.rule_ok(jsonb, text) TO pack_runtime;
