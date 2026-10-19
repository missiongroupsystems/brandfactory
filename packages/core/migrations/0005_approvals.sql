-- A person's yes to one effect: one move sending one exact thing out. The hash is of what goes
-- out (the move's payload), so an edit to it voids the yes. Used once, by the call that fires.
-- Only the login role reads or writes these rows.
CREATE TABLE packs.approvals (
  id bigserial PRIMARY KEY,
  pack text NOT NULL,
  op text NOT NULL,
  payload_hash text NOT NULL,
  approved_by text NOT NULL REFERENCES packs.principals (id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  used_by text,
  -- What the connector answered, kept the moment it answered, before anything else can fail.
  outcome jsonb
);
CREATE INDEX approvals_open ON packs.approvals (pack, op, payload_hash) WHERE used_at IS NULL;
REVOKE ALL ON packs.approvals FROM PUBLIC;

-- An agent never says yes: the approver is a person.
CREATE FUNCTION packs.check_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM packs.principals WHERE id = NEW.approved_by AND agent_of IS NULL
  ) THEN
    RAISE EXCEPTION 'only a person can approve'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'approval_needs_person';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approvals_person BEFORE INSERT OR UPDATE OF approved_by ON packs.approvals
  FOR EACH ROW EXECUTE FUNCTION packs.check_approval();
