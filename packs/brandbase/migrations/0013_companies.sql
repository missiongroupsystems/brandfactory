-- Access by company (docs/completions/company-access-plan.md). A brand belongs to one company, and
-- a person reaches a brand when they are active and a member of its company, whatever their role.
-- users.role and the per-brand members table no longer reach anything; members goes.

-- A company. Its id is Passport's organisation id once Passport's sync fills it.
CREATE TABLE brandbase.organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- A person's membership of a company. Every member reaches every brand of the company; an owner
-- or admin may also add brands to it (brand.create).
CREATE TABLE brandbase.org_members (
  user_id text NOT NULL REFERENCES brandbase.users (id) ON DELETE CASCADE,
  org_id text NOT NULL REFERENCES brandbase.organizations (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

-- Each brand's company.
ALTER TABLE brandbase.brands ADD COLUMN org_id text REFERENCES brandbase.organizations (id);
CREATE INDEX brands_org_id ON brandbase.brands (org_id);

-- Brands made on 1.4.0 keep their people. When the database holds any brand, one company,
-- Mission Group, takes every brand; each admin by users.role becomes its owner and each person
-- with a members row its member, so they reach every brand of it. An empty database gets no
-- company. The migration runs as the tables' owner, whom the forced row rules hold to them too,
-- so they are lifted for these statements and forced again below, in the same transaction.
ALTER TABLE brandbase.brands NO FORCE ROW LEVEL SECURITY;
ALTER TABLE brandbase.users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE brandbase.members NO FORCE ROW LEVEL SECURITY;
ALTER TABLE brandbase.brand_kits NO FORCE ROW LEVEL SECURITY;

INSERT INTO brandbase.organizations (id, name)
  SELECT 'mission-group', 'Mission Group' WHERE EXISTS (SELECT 1 FROM brandbase.brands);

UPDATE brandbase.brands SET org_id = 'mission-group' WHERE org_id IS NULL;

INSERT INTO brandbase.org_members (user_id, org_id, role)
  SELECT u.id, o.id, 'owner' FROM brandbase.users u, brandbase.organizations o
  WHERE o.id = 'mission-group' AND u.role = 'admin';

INSERT INTO brandbase.org_members (user_id, org_id, role)
  SELECT DISTINCT m.user_id, o.id, 'member' FROM brandbase.members m, brandbase.organizations o
  WHERE o.id = 'mission-group'
  ON CONFLICT (user_id, org_id) DO NOTHING;

-- Every brand has a company from here on.
ALTER TABLE brandbase.brands ALTER COLUMN org_id SET NOT NULL;

-- A kit names its brand's company. brand.create makes a brand and its kit in one statement, which
-- cannot see the brand it is adding, so the kits wall cannot tell the brand is the caller's; the
-- kit's company, held to the brand's own by the foreign key (checked at the statement's end, past
-- the row rules), lets the manage rule below allow an owner or admin a kit only in their company.
ALTER TABLE brandbase.brands ADD CONSTRAINT brands_id_org_id UNIQUE (id, org_id);
ALTER TABLE brandbase.brand_kits ADD COLUMN org_id text;
UPDATE brandbase.brand_kits k SET org_id = b.org_id FROM brandbase.brands b WHERE b.id = k.brand_id;
ALTER TABLE brandbase.brand_kits ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE brandbase.brand_kits ADD CONSTRAINT brand_kits_brand_org
  FOREIGN KEY (brand_id, org_id) REFERENCES brandbase.brands (id, org_id)
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE brandbase.brands FORCE ROW LEVEL SECURITY;
ALTER TABLE brandbase.users FORCE ROW LEVEL SECURITY;
ALTER TABLE brandbase.brand_kits FORCE ROW LEVEL SECURITY;

-- The companies the caller, if active, is a member of. It reads the caller's own users and
-- org_members rows, which their row rules let them see.
CREATE FUNCTION brandbase.reached_orgs() RETURNS text[]
  LANGUAGE sql STABLE
  RETURN ARRAY(
    SELECT m.org_id FROM brandbase.org_members m JOIN brandbase.users u ON u.id = m.user_id
    WHERE u.id = brandbase.caller() AND u.deactivated_at IS NULL
  );

-- The companies the caller, if active, is an owner or admin of: where they may add brands.
CREATE FUNCTION brandbase.managed_orgs() RETURNS text[]
  LANGUAGE sql STABLE
  RETURN ARRAY(
    SELECT m.org_id FROM brandbase.org_members m JOIN brandbase.users u ON u.id = m.user_id
    WHERE u.id = brandbase.caller() AND u.deactivated_at IS NULL AND m.role IN ('owner', 'admin')
  );

-- The brands the caller reaches: the brands they see under the brands wall, which asks
-- reached_orgs. No wall reads its own table, so nothing loops.
CREATE OR REPLACE FUNCTION brandbase.reached() RETURNS text[]
  LANGUAGE sql STABLE
  RETURN ARRAY(SELECT b.id FROM brandbase.brands b);

-- The same rule for one brand, for anything that calls it. It judges one row each call; the walls
-- below ask once per statement instead.
CREATE OR REPLACE FUNCTION brandbase.can_reach(brand text) RETURNS boolean
  LANGUAGE sql STABLE
  RETURN EXISTS (
    SELECT 1 FROM brandbase.brands b
    WHERE b.id = brand AND b.org_id = ANY ((SELECT brandbase.reached_orgs())::text[])
  );

GRANT EXECUTE ON FUNCTION brandbase.reached_orgs(), brandbase.managed_orgs() TO pack_runtime;

-- The walls. Each sub-select names no row, so each runs once per statement (as in 0012).
-- On brands, every member of the company reads and changes its settings; only its owners and
-- admins add one, whatever move or statement adds it, and no one removes one or moves it to
-- another company: no move does, and a brand's id and company are not the runtime role's to change.
DROP POLICY reach ON brandbase.brands;
CREATE POLICY reach ON brandbase.brands FOR SELECT
  USING (org_id = ANY ((SELECT brandbase.reached_orgs())::text[]));
CREATE POLICY reach_update ON brandbase.brands FOR UPDATE
  USING (org_id = ANY ((SELECT brandbase.reached_orgs())::text[]))
  WITH CHECK (org_id = ANY ((SELECT brandbase.reached_orgs())::text[]));
CREATE POLICY manage ON brandbase.brands FOR INSERT
  WITH CHECK (org_id = ANY ((SELECT brandbase.managed_orgs())::text[]));
CREATE POLICY manage ON brandbase.brand_kits FOR INSERT
  WITH CHECK (org_id = ANY ((SELECT brandbase.managed_orgs())::text[]));

ALTER POLICY reach ON brandbase.brand_files
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.brand_kits
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.comments
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.connections
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.ideas
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.inbox_messages
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.inbox_people
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.media
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.post_jobs
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.posts
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.share_links
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.shoots
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.voice_versions
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.pasted_links
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.moodboard_boards
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.moodboard_posts
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

-- A crew row with no brand of its own (from before 0005) takes its shoot's, as 0005 has it.
ALTER POLICY reach ON brandbase.crew
  USING (coalesce(brand_id, (SELECT s.brand_id FROM brandbase.shoots s WHERE s.id = shoot_id))
    = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (coalesce(brand_id, (SELECT s.brand_id FROM brandbase.shoots s WHERE s.id = shoot_id))
    = ANY ((SELECT brandbase.reached())::text[]));

-- No wall asks reaches_all now, and there is no global admin.
DROP FUNCTION brandbase.reaches_all();

-- Per-brand membership goes; share links stay the way to open one shoot or idea to an outsider.
DROP TABLE brandbase.members;

-- A person sees their own memberships and the companies they are an active member of.
ALTER TABLE brandbase.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY self ON brandbase.organizations FOR SELECT
  USING (id = ANY ((SELECT brandbase.reached_orgs())::text[]));

ALTER TABLE brandbase.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.org_members FORCE ROW LEVEL SECURITY;
CREATE POLICY self ON brandbase.org_members FOR SELECT USING (user_id = brandbase.caller());

-- Companies and memberships are managed outside the moves, as accounts are: by hand now, by
-- Passport's sync later.
GRANT SELECT ON brandbase.organizations, brandbase.org_members TO pack_runtime;

-- What a move may write on a brand: its TikTok defaults (brand.tiktok_defaults). Its id and company
-- stay, and no move deletes a brand.
REVOKE UPDATE, DELETE ON brandbase.brands FROM pack_runtime;
GRANT UPDATE (tiktok_defaults) ON brandbase.brands TO pack_runtime;
