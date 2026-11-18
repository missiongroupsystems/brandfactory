-- Instagram capture (docs/executing/meta-capture-plan.md): a person DMs a reel or a post to the
-- capture account (the Instagram account of the brand META_CAPTURE_BRAND names), and it lands in
-- one of their brands' Ideas, under Shared. Rows are keyed by that account's Instagram id, since a
-- sender's id (IGSID) is scoped to it. Only internal moves read or write them (packages/connect).

-- The capture accounts the caller reaches: the Instagram accounts linked through Meta of the
-- brands within their reach (the accounts wall applies; the caller's rights are their own).
CREATE FUNCTION brandbase.capture_reached() RETURNS text[]
  LANGUAGE sql STABLE
  RETURN ARRAY(
    SELECT a.account_id FROM brandbase.accounts a
    WHERE a.platform = 'instagram' AND a.details ->> 'via' = 'meta'
  );

GRANT EXECUTE ON FUNCTION brandbase.capture_reached() TO pack_runtime;

-- A link code a person made on the Ideas page: single use, for ten minutes. Only its HMAC-SHA256
-- under a server secret is kept, so a reader of the table cannot link their own Instagram to
-- someone else. The person's
-- name is kept here too: the account answers "Linked to <name>", and only the person reads their
-- own users row.
CREATE TABLE brandbase.capture_codes (
  account text NOT NULL,
  code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  user_id text NOT NULL REFERENCES brandbase.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  PRIMARY KEY (account, code_hash)
);
CREATE INDEX capture_codes_user ON brandbase.capture_codes (user_id);

-- A sender of the capture account: the person they linked to (none yet: only their wrong tries
-- and the last how-to reply are kept), the brand they saved to last, and their tries at a code
-- in the current hour.
CREATE TABLE brandbase.capture_senders (
  account text NOT NULL,
  sender text NOT NULL,
  user_id text REFERENCES brandbase.users (id) ON DELETE CASCADE,
  name text,
  last_brand text REFERENCES brandbase.brands (id) ON DELETE SET NULL,
  linked_at timestamp with time zone,
  tries integer NOT NULL DEFAULT 0,
  tries_since timestamp with time zone,
  hinted_at timestamp with time zone,
  PRIMARY KEY (account, sender)
);
CREATE INDEX capture_senders_user ON brandbase.capture_senders (user_id);

-- One shared reel or post, by Meta's message id (its id is made from it, so a resend claims
-- nothing). The brand is the person's choice; `src` is the stable address of our own file of the
-- media, once it is stored. Both set, it is a pasted link of the brand with the same id.
CREATE TABLE brandbase.captures (
  id text PRIMARY KEY,
  account text NOT NULL,
  sender text NOT NULL,
  user_id text NOT NULL REFERENCES brandbase.users (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  brand_id text REFERENCES brandbase.brands (id) ON DELETE CASCADE,
  kind text CHECK (kind IN ('video', 'image')),
  file_key text,
  src text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX captures_user ON brandbase.captures (user_id);

-- Meta's message ids of the LINK messages already answered: the webhook and the fallback read
-- may both bring one, and Meta sends again after a failure.
CREATE TABLE brandbase.capture_seen (
  id text PRIMARY KEY,
  account text NOT NULL,
  at timestamp with time zone NOT NULL DEFAULT now()
);

-- The walls, each asked once per statement: a person's own rows, and every row of a capture account the caller reaches (the
-- webhook's principal reaches the capture brand).
ALTER TABLE brandbase.capture_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.capture_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY capture ON brandbase.capture_codes
  USING (user_id = (SELECT brandbase.caller()) OR account = ANY ((SELECT brandbase.capture_reached())::text[]))
  WITH CHECK (user_id = (SELECT brandbase.caller()) OR account = ANY ((SELECT brandbase.capture_reached())::text[]));

ALTER TABLE brandbase.capture_senders ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.capture_senders FORCE ROW LEVEL SECURITY;
CREATE POLICY capture ON brandbase.capture_senders
  USING (user_id = (SELECT brandbase.caller()) OR account = ANY ((SELECT brandbase.capture_reached())::text[]))
  WITH CHECK (user_id = (SELECT brandbase.caller()) OR account = ANY ((SELECT brandbase.capture_reached())::text[]));

ALTER TABLE brandbase.captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.captures FORCE ROW LEVEL SECURITY;
CREATE POLICY capture ON brandbase.captures
  USING (user_id = (SELECT brandbase.caller()) OR account = ANY ((SELECT brandbase.capture_reached())::text[]))
  WITH CHECK (user_id = (SELECT brandbase.caller()) OR account = ANY ((SELECT brandbase.capture_reached())::text[]));

ALTER TABLE brandbase.capture_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.capture_seen FORCE ROW LEVEL SECURITY;
CREATE POLICY capture ON brandbase.capture_seen
  USING (account = ANY ((SELECT brandbase.capture_reached())::text[]))
  WITH CHECK (account = ANY ((SELECT brandbase.capture_reached())::text[]));

GRANT SELECT, INSERT, UPDATE, DELETE ON brandbase.capture_codes TO pack_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON brandbase.capture_senders TO pack_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON brandbase.captures TO pack_runtime;
GRANT SELECT, INSERT ON brandbase.capture_seen TO pack_runtime;
