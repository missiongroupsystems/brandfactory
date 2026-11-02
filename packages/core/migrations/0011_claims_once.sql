-- Claims written once per transaction, and never removed while it runs. The row used to go at
-- commit through a deferred trigger, but any role may run SET CONSTRAINTS ALL IMMEDIATE, which
-- fires it at once: the row went mid-transaction, and SQL that reached the login role could
-- write another (docs/executing/core-no-superuser-plan.md, D2). Now rows stay until the scheduler
-- purges finished transactions; readers already ask for the current transaction's row only.
DROP TRIGGER forget ON claims.calls;
DROP FUNCTION claims.forget();

-- The pack the call runs, so what acts for a caller can refuse another pack's work; and whether
-- the principal exists, so "no account" is a flag, not a missing row.
ALTER TABLE claims.calls
  ADD COLUMN pack text NOT NULL DEFAULT '',
  ADD COLUMN known boolean NOT NULL DEFAULT true;

-- The purge may delete rows of transactions that have ended; this_call still limits every other
-- read and write to the current transaction's row.
CREATE POLICY finished ON claims.calls FOR DELETE
  USING (xact < pg_snapshot_xmin(pg_current_snapshot()));

-- The only way to write claims. A second open in the same transaction with the same values does
-- nothing (an approval opens again for its caller); with other values it is refused.
CREATE FUNCTION claims.open(user_id text, agent_id text, capability text, actor text, pack text)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
DECLARE
  c claims.calls;
BEGIN
  INSERT INTO claims.calls (user_id, agent_id, capability, actor, pack)
    VALUES (open.user_id, open.agent_id, open.capability, open.actor, open.pack)
    ON CONFLICT (xact) DO NOTHING;
  SELECT * INTO c FROM claims.calls WHERE xact = pg_current_xact_id();
  IF c.user_id IS DISTINCT FROM open.user_id OR c.agent_id IS DISTINCT FROM open.agent_id
     OR c.capability IS DISTINCT FROM open.capability OR c.actor IS DISTINCT FROM open.actor
     OR c.pack IS DISTINCT FROM open.pack OR NOT c.known THEN
    RAISE EXCEPTION 'this transaction''s claims are already written' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION claims.open(text, text, text, text, text) FROM PUBLIC;

-- A principal's claims, read from packs.principals: a person is user_id; an agent is agent_id,
-- with its person as user_id. An unknown principal gets a row marked unknown, so the transaction
-- has its row and no later open can name anyone.
CREATE FUNCTION claims.open_principal(principal text, pack text)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
DECLARE
  p packs.principals;
  c claims.calls;
BEGIN
  SELECT * INTO p FROM packs.principals WHERE id = open_principal.principal;
  IF NOT FOUND THEN
    INSERT INTO claims.calls (user_id, agent_id, capability, actor, pack, known)
      VALUES ('', '', '', '', open_principal.pack, false)
      ON CONFLICT (xact) DO NOTHING;
    SELECT * INTO c FROM claims.calls WHERE xact = pg_current_xact_id();
    IF c.known OR c.pack IS DISTINCT FROM open_principal.pack OR c.user_id <> '' THEN
      RAISE EXCEPTION 'this transaction''s claims are already written' USING ERRCODE = '42501';
    END IF;
    RETURN false;
  END IF;
  RETURN claims.open(coalesce(p.agent_of, p.id),
    CASE WHEN p.agent_of IS NULL THEN '' ELSE p.id END, '', '', open_principal.pack);
END $$;
REVOKE EXECUTE ON FUNCTION claims.open_principal(text, text) FROM PUBLIC;

-- Rows of finished transactions; the scheduler's tick calls it.
CREATE FUNCTION claims.purge() RETURNS bigint
  LANGUAGE sql
  SET search_path = pg_catalog
AS $$
  WITH gone AS (
    DELETE FROM claims.calls WHERE xact < pg_snapshot_xmin(pg_current_snapshot()) RETURNING 1
  )
  SELECT count(*) FROM gone
$$;
REVOKE EXECUTE ON FUNCTION claims.purge() FROM PUBLIC;

-- The judge reads "no account" from the flag.
CREATE OR REPLACE FUNCTION packs.judge(environment text, pack text, op text, hash text, agent_of text)
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
  IF NOT FOUND OR NOT c.known THEN
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
