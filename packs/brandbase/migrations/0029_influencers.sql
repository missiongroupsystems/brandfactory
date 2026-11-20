-- brandbase 1.19.0: the company's influencer roster (docs/completions/influencers-phases-1-to-1.md),
-- brought back from the old BrandFactory (archive/main-2026-10-07, migrations 0014 and 0016). A
-- person on the roster belongs to one company and every member of it reads and edits them, as a
-- company's brands. A person has one to ten accounts (the first is the one they are known by), and
-- links to the company's brands they work with. Only owners and admins import (influencer.import);
-- only code beside the core writes an account's picture (influencer.picture_*).

CREATE TABLE brandbase.influencers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES brandbase.organizations (id) ON DELETE CASCADE,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  -- The old schema's `vertical`: what the person makes content about.
  category text CHECK (category IN ('beauty', 'fashion', 'food', 'fitness', 'travel', 'home',
    'tech', 'parenting', 'motoring', 'family')),
  status text NOT NULL DEFAULT 'prospect' CHECK (status IN ('active', 'prospect', 'past')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 20000),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT influencers_org_slug UNIQUE (org_id, slug),
  CONSTRAINT influencers_id_org UNIQUE (id, org_id)
);

-- One account of a person. The handle is kept as the platform spells it in a link: no "@", in
-- lower case. One handle on one platform belongs to one person of a company. `picture` is the
-- path of the profile picture as our own file on the core (/files/<signature>/<key>); Meta's
-- address expires, so it is never kept.
CREATE TABLE brandbase.influencer_accounts (
  influencer_id uuid NOT NULL,
  org_id text NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 99),
  platform text NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'xiaohongshu',
    'facebook', 'linkedin')),
  handle text NOT NULL CHECK (length(handle) BETWEEN 1 AND 100 AND handle = lower(handle)
    AND handle !~ '^@'),
  followers bigint CHECK (followers >= 0),
  engagement numeric(5, 2) CHECK (engagement >= 0),
  url text CHECK (url ~ '^https://'),
  picture text,
  picture_key text,
  -- When the picture and the followers were last read from the platform, found or not.
  read_at timestamp with time zone,
  PRIMARY KEY (org_id, platform, handle),
  CONSTRAINT influencer_accounts_position UNIQUE (influencer_id, position),
  CONSTRAINT influencer_accounts_person FOREIGN KEY (influencer_id, org_id)
    REFERENCES brandbase.influencers (id, org_id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- The company's brands a person has worked with, for good: linked by the import (the brand's
-- saved collaborators, the old roster's links) or by a post of the brand that went out with them
-- as a collaborator or a tag (`posted`, with that post). The links a saved post makes are not
-- kept here: they follow the post (`post_handles`). The brand's company is the person's: both
-- foreign keys name it.
CREATE TABLE brandbase.influencer_brands (
  influencer_id uuid NOT NULL,
  brand_id text NOT NULL,
  org_id text NOT NULL,
  source text NOT NULL DEFAULT 'saved' CHECK (source IN ('saved', 'posted')),
  post_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (influencer_id, brand_id),
  CONSTRAINT influencer_brands_person FOREIGN KEY (influencer_id, org_id)
    REFERENCES brandbase.influencers (id, org_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT influencer_brands_brand FOREIGN KEY (brand_id, org_id)
    REFERENCES brandbase.brands (id, org_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX influencer_brands_brand ON brandbase.influencer_brands (brand_id);

-- The walls, each asked once per statement: the rows of the companies the caller is an active
-- member of.
ALTER TABLE brandbase.influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.influencers FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.influencers
  USING (org_id = ANY ((SELECT brandbase.reached_orgs())::text[]))
  WITH CHECK (org_id = ANY ((SELECT brandbase.reached_orgs())::text[]));

ALTER TABLE brandbase.influencer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.influencer_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.influencer_accounts
  USING (org_id = ANY ((SELECT brandbase.reached_orgs())::text[]))
  WITH CHECK (org_id = ANY ((SELECT brandbase.reached_orgs())::text[]));

ALTER TABLE brandbase.influencer_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.influencer_brands FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.influencer_brands
  USING (org_id = ANY ((SELECT brandbase.reached_orgs())::text[]))
  WITH CHECK (org_id = ANY ((SELECT brandbase.reached_orgs())::text[]));

-- What a move may do: add and edit a person (no move removes one yet), add and refresh their
-- accounts, and link and unlink brands. A person's id and company stay.
GRANT SELECT, INSERT ON brandbase.influencers TO pack_runtime;
GRANT UPDATE (name, category, status, notes, updated_at) ON brandbase.influencers TO pack_runtime;
GRANT SELECT, INSERT ON brandbase.influencer_accounts TO pack_runtime;
GRANT UPDATE (followers, engagement, url, picture, picture_key, read_at)
  ON brandbase.influencer_accounts TO pack_runtime;
GRANT SELECT, INSERT, DELETE ON brandbase.influencer_brands TO pack_runtime;
GRANT UPDATE (source, post_id) ON brandbase.influencer_brands TO pack_runtime;

-- The Instagram handles a post's draft names (no "@", in lower case): its collaborators
-- (details.collab) and every photo's tags (shots[].tags[].handle), each once.
CREATE FUNCTION brandbase.post_handles(draft jsonb) RETURNS SETOF text
  LANGUAGE sql STABLE
  AS $$
    SELECT DISTINCT lower(regexp_replace(btrim(x.h), '^@+', ''))
    FROM (
      SELECT e.v AS h
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(draft -> 'details' -> 'collab') = 'array'
        THEN draft -> 'details' -> 'collab' ELSE '[]'::jsonb END) AS e(v)
      UNION ALL
      SELECT t.v ->> 'handle'
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(draft -> 'shots') = 'array'
        THEN draft -> 'shots' ELSE '[]'::jsonb END) AS s(v),
        jsonb_array_elements(CASE WHEN jsonb_typeof(s.v -> 'tags') = 'array'
          THEN s.v -> 'tags' ELSE '[]'::jsonb END) AS t(v)
      WHERE jsonb_typeof(t.v) = 'object'
    ) x
    WHERE x.h IS NOT NULL AND btrim(x.h) <> ''
  $$;

GRANT EXECUTE ON FUNCTION brandbase.post_handles(jsonb) TO pack_runtime;

-- One person as the moves answer them: their accounts in order (the first is the one they are
-- known by) and the ids of the brands they are linked to. It reads under the caller's walls.
CREATE FUNCTION brandbase.influencer_json(person uuid) RETURNS jsonb
  LANGUAGE sql STABLE
  RETURN (
    SELECT jsonb_build_object(
      'id', i.id, 'orgId', i.org_id, 'slug', i.slug, 'name', i.name, 'category', i.category,
      'status', i.status, 'notes', i.notes, 'updatedAt', brandbase.iso(i.updated_at),
      'accounts', coalesce((
        SELECT jsonb_agg(jsonb_build_object('platform', a.platform, 'handle', a.handle,
          'followers', a.followers, 'engagement', a.engagement, 'url', a.url,
          'picture', a.picture) ORDER BY a.position)
        FROM brandbase.influencer_accounts a WHERE a.influencer_id = i.id), '[]'::jsonb),
      'brands', coalesce((
        SELECT jsonb_agg(l.brand_id ORDER BY l.brand_id)
        FROM brandbase.influencer_brands l WHERE l.influencer_id = i.id), '[]'::jsonb))
    FROM brandbase.influencers i WHERE i.id = person
  );

GRANT EXECUTE ON FUNCTION brandbase.influencer_json(uuid) TO pack_runtime;

-- An Instagram account a brand of the company saved as a collaborator but no one on the roster
-- holds: its display name, its profile picture as our own file and its followers, as Business
-- Discovery read them (influencer.profile_*), so the post page names it. One row per company and
-- handle; only code beside the core writes it.
CREATE TABLE brandbase.account_profiles (
  org_id text NOT NULL REFERENCES brandbase.organizations (id) ON DELETE CASCADE,
  handle text NOT NULL CHECK (handle ~ '^[a-z0-9._]{1,30}$'),
  name text CHECK (length(name) <= 200),
  followers bigint CHECK (followers >= 0),
  picture text,
  picture_key text,
  read_at timestamp with time zone,
  PRIMARY KEY (org_id, handle)
);

ALTER TABLE brandbase.account_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.account_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.account_profiles
  USING (org_id = ANY ((SELECT brandbase.reached_orgs())::text[]))
  WITH CHECK (org_id = ANY ((SELECT brandbase.reached_orgs())::text[]));

GRANT SELECT, INSERT ON brandbase.account_profiles TO pack_runtime;
GRANT UPDATE (name, followers, picture, picture_key, read_at)
  ON brandbase.account_profiles TO pack_runtime;
