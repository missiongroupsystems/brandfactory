-- Timed moves. A move asks for later calls in its result; the core keeps them here, claims one
-- at a time when it is due, and runs it as the person who asked, through the same checks as any
-- call. Only the login role reads or writes these rows: the claim is the one place the core
-- works across companies, and it runs no pack SQL.
CREATE TABLE packs.scheduled_calls (
  id bigserial PRIMARY KEY,
  pack text NOT NULL,
  op text NOT NULL,
  -- A pack's own name for the call (a job's id): asking again under it moves the call.
  key text NOT NULL,
  input jsonb NOT NULL,
  principal text NOT NULL REFERENCES packs.principals (id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'running', 'done', 'refused', 'failed', 'unknown_outcome')),
  attempts integer NOT NULL DEFAULT 0,
  heartbeat_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pack, op, key)
);
CREATE INDEX scheduled_calls_due ON packs.scheduled_calls (run_at) WHERE status = 'scheduled';
REVOKE ALL ON packs.scheduled_calls FROM PUBLIC;

-- What a person must look at: a call whose outcome is unknown. Never retried by the loop.
CREATE TABLE packs.alerts (
  id bigserial PRIMARY KEY,
  principal text NOT NULL REFERENCES packs.principals (id) ON DELETE CASCADE,
  pack text NOT NULL,
  call_id bigint REFERENCES packs.scheduled_calls (id),
  message text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz
);
REVOKE ALL ON packs.alerts FROM PUBLIC;
