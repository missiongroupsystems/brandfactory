-- Each brand's own accounts on the platforms. Only Pinterest signs in so far: the moodboard reads
-- one board on the brand's Pinterest account. Facebook (with its Instagram account) and TikTok
-- take a row here once their sign-ins ship. An account belongs to one brand only. Only internal
-- moves write these rows (packages/connect, after the platform's sign-in); the tokens are sealed
-- there and never leave the server.
CREATE TABLE brandbase.accounts (
  brand_id text NOT NULL REFERENCES brandbase.brands (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('pinterest', 'meta', 'tiktok')),
  account_id text NOT NULL,
  username text NOT NULL,
  tokens text NOT NULL,
  -- Pinterest: the board the moodboard reads.
  details jsonb NOT NULL DEFAULT '{}',
  connected_by text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, platform),
  CONSTRAINT accounts_platform_account UNIQUE (platform, account_id)
);

-- The wall, as 0013's: asked once per statement.
ALTER TABLE brandbase.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.accounts
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

GRANT SELECT, INSERT, UPDATE, DELETE ON brandbase.accounts TO pack_runtime;

-- The connection the moodboard and the Connections page read follows the account: Pinterest is
-- connected once a board is picked. The account moves write both; connection.set no longer takes
-- the pinterest key.
CREATE FUNCTION brandbase.account_keys(platform text, details jsonb)
  RETURNS TABLE (key text, linked boolean)
  LANGUAGE sql STABLE
  AS 'SELECT x.key, x.linked FROM (VALUES
    (''pinterest'', ''pinterest'', details ->> ''board'' IS NOT NULL)
  ) AS x (platform, key, linked) WHERE x.platform = account_keys.platform';

GRANT EXECUTE ON FUNCTION brandbase.account_keys(text, jsonb) TO pack_runtime;

-- A pinterest connection stored before this version came from the pretend sign-in, with no
-- account behind it: it is off now, as a brand with no board is. The migration runs as the
-- table's owner, whom the forced row rules hold too, so they are lifted for this statement and
-- forced again, in the same transaction (as in 0013).
ALTER TABLE brandbase.connections NO FORCE ROW LEVEL SECURITY;
UPDATE brandbase.connections SET status = 'off', updated_at = now()
  WHERE key = 'pinterest' AND status <> 'off';
ALTER TABLE brandbase.connections FORCE ROW LEVEL SECURITY;
