-- A write sent twice under one key runs once: the second call gets the first call's answer. The
-- key belongs to the caller and the move; only the login role reads or writes these rows.
CREATE TABLE packs.idempotency (
  principal text NOT NULL,
  pack text NOT NULL,
  op text NOT NULL,
  key text NOT NULL,
  input_hash text NOT NULL,
  result jsonb,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (principal, pack, op, key)
);
REVOKE ALL ON packs.idempotency FROM PUBLIC;
