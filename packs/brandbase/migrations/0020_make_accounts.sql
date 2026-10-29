-- Instagram and Facebook through Make (docs/executing/make-publishing-plan.md), until our own Meta
-- app passes review. A brand's Instagram business account and Facebook Page are rows here, under
-- the platforms 'instagram' and 'facebook', with the ids an owner or admin typed and the name to
-- show. Make holds the tokens: the row's tokens hold the word 'make'.
ALTER TABLE brandbase.accounts DROP CONSTRAINT accounts_platform_check;
ALTER TABLE brandbase.accounts ADD CONSTRAINT accounts_platform_check
  CHECK (platform IN ('pinterest', 'meta', 'tiktok', 'instagram', 'facebook'));

-- The companies whose brands may post through Make. Make's Facebook login reaches every Page its
-- one user admins (Mission Group's), and the ids are typed, not proved by a sign-in: another
-- company's admin must not point a brand at those Pages. Only the operator adds a row (the runtime
-- role reads it), as event_orgs (0016); Mission Group has one from here, if it exists.
CREATE TABLE brandbase.make_orgs (
  org_id text PRIMARY KEY REFERENCES brandbase.organizations (id) ON DELETE CASCADE
);

ALTER TABLE brandbase.organizations NO FORCE ROW LEVEL SECURITY;
INSERT INTO brandbase.make_orgs (org_id)
  SELECT id FROM brandbase.organizations WHERE id = 'mission-group';
ALTER TABLE brandbase.organizations FORCE ROW LEVEL SECURITY;

ALTER TABLE brandbase.make_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.make_orgs FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.make_orgs FOR SELECT
  USING (org_id = ANY ((SELECT brandbase.reached_orgs())::text[]));

GRANT SELECT ON brandbase.make_orgs TO pack_runtime;

-- The connections an account turns on: account_keys' own, and ig or fb for an account Make posts
-- to. A wrapper, so a later account_keys keeps its rows.
CREATE FUNCTION brandbase.account_connections(platform text, details jsonb)
  RETURNS TABLE (key text, linked boolean)
  LANGUAGE sql STABLE
  AS 'SELECT k.key, k.linked FROM brandbase.account_keys(platform, details) k
    UNION ALL
    SELECT m.key, true FROM (VALUES (''instagram'', ''ig''), (''facebook'', ''fb'')) AS m (platform, key)
    WHERE m.platform = account_connections.platform';

GRANT EXECUTE ON FUNCTION brandbase.account_connections(text, jsonb) TO pack_runtime;

-- A post's photos and videos as a platform gets them, in order: each the brand's own upload (its
-- media row, found by the key in the item's address), or {missing: true} for a sample or a file
-- that is gone. The caller's row rules apply (invoker).
CREATE FUNCTION brandbase.post_files(post text)
  RETURNS jsonb
  LANGUAGE sql STABLE
  AS 'SELECT coalesce(jsonb_agg(CASE WHEN m.id IS NULL THEN jsonb_build_object(''missing'', true)
      ELSE jsonb_build_object(''kind'', m.kind, ''mime'', m.mime, ''bytes'', m.bytes, ''key'', m.storage_key) END
      ORDER BY e.n), ''[]'')
    FROM brandbase.posts p
    CROSS JOIN LATERAL jsonb_array_elements(p.media) WITH ORDINALITY AS e (item, n)
    LEFT JOIN brandbase.media m ON m.brand_id = p.brand_id
      AND m.storage_key = substring(e.item ->> ''src''
        FROM ''/files/[A-Za-z0-9_-]{43}/(brandbase/[0-9a-f-]{36}\.[a-z0-9]{1,5})(?:#video)?$'')
    WHERE p.id = post_files.post';

GRANT EXECUTE ON FUNCTION brandbase.post_files(text) TO pack_runtime;

-- An ig or fb connection stored before this version came from the pretend sign-in, with no
-- account behind it: it is off now. As in 0015, the forced row rules are lifted for this statement
-- and forced again, in the same transaction.
ALTER TABLE brandbase.connections NO FORCE ROW LEVEL SECURITY;
UPDATE brandbase.connections SET status = 'off', updated_at = now()
  WHERE key IN ('ig', 'fb') AND status <> 'off';
ALTER TABLE brandbase.connections FORCE ROW LEVEL SECURITY;
