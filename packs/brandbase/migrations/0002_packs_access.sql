-- BrandBase on the core: row rules, the runtime role's grants, and the functions the moves read.
-- 0000 and 0001 are packages/server's migrations, copied as they are.

-- One planned story a day, in the database, so two moves at once cannot both take a day. A story
-- marked Posted by hand is left out: the demo's posted stories are several a day.
CREATE UNIQUE INDEX posts_story_day ON brandbase.posts (brand_id, day)
  WHERE format = 'story' AND marked IS DISTINCT FROM 'posted';

-- The caller, from the core's verified token. Nothing else comes from the caller.
CREATE FUNCTION brandbase.caller() RETURNS text
  LANGUAGE sql STABLE
  RETURN nullif(current_setting('app.user_id', true), '');

-- The access rule (packages/server/src/authz.ts): an admin reaches every brand, a member the
-- brands they hold a row for, and a deactivated account none. It reads the caller's own users
-- and members rows, which their row rules let them see.
CREATE FUNCTION brandbase.can_reach(brand text) RETURNS boolean
  LANGUAGE sql STABLE
  RETURN EXISTS (
    SELECT 1 FROM brandbase.users u
    WHERE u.id = brandbase.caller() AND u.deactivated_at IS NULL
      AND (u.role = 'admin' OR EXISTS (
        SELECT 1 FROM brandbase.members m WHERE m.user_id = u.id AND m.brand_id = brand
      ))
  );

-- Row rules on every table, forced so the tables' owner is held to them too.
ALTER TABLE brandbase.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.users FORCE ROW LEVEL SECURITY;
CREATE POLICY self ON brandbase.users FOR SELECT USING (id = brandbase.caller());

ALTER TABLE brandbase.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.members FORCE ROW LEVEL SECURITY;
CREATE POLICY self ON brandbase.members FOR SELECT USING (user_id = brandbase.caller());

ALTER TABLE brandbase.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.brands FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.brands
  USING (brandbase.can_reach(id)) WITH CHECK (brandbase.can_reach(id));

ALTER TABLE brandbase.brand_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.brand_files FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.brand_files
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.brand_kits FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.brand_kits
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.comments FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.comments
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.connections FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.connections
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.ideas FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.ideas
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.inbox_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.inbox_messages
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.inbox_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.inbox_people FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.inbox_people
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.media FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.media
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.post_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.post_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.post_jobs
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.posts FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.posts
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.share_links FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.share_links
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.shoots ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.shoots FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.shoots
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.voice_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.voice_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.voice_versions
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.pasted_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.pasted_links FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.pasted_links
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

-- Crew and send records have no brand of their own: they follow their shoot or post.
ALTER TABLE brandbase.crew ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.crew FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.crew
  USING (EXISTS (SELECT 1 FROM brandbase.shoots s WHERE s.id = shoot_id))
  WITH CHECK (EXISTS (SELECT 1 FROM brandbase.shoots s WHERE s.id = shoot_id));

ALTER TABLE brandbase.post_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.post_sends FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.post_sends
  USING (EXISTS (SELECT 1 FROM brandbase.posts p WHERE p.id = post_id))
  WITH CHECK (EXISTS (SELECT 1 FROM brandbase.posts p WHERE p.id = post_id));

GRANT USAGE ON SCHEMA brandbase TO pack_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA brandbase TO pack_runtime;
-- Accounts and memberships are managed outside the moves.
REVOKE INSERT, UPDATE, DELETE ON brandbase.users, brandbase.members FROM pack_runtime;

-- Rows as the screens read them: camelCase keys, as packages/server's answers had.
CREATE FUNCTION brandbase.camel(j jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
  RETURN (
    SELECT coalesce(jsonb_object_agg(
      lower(left(k, 1)) || substr(replace(initcap(replace(k, '_', ' ')), ' ', ''), 2), v), '{}')
    FROM jsonb_each(j) AS e(k, v)
  );

-- An instant as JavaScript's toISOString writes it.
CREATE FUNCTION brandbase.iso(t timestamptz) RETURNS text
  LANGUAGE sql IMMUTABLE
  RETURN to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

-- Today in a brand's zone, from the core's clock.
CREATE FUNCTION brandbase.today(brand text, now timestamptz) RETURNS date
  LANGUAGE sql STABLE
  RETURN (SELECT (now AT TIME ZONE b.timezone)::date FROM brandbase.brands b WHERE b.id = brand);

-- The instant a brand-local day and time fall on.
CREATE FUNCTION brandbase.instant(day date, at text, timezone text) RETURNS timestamptz
  LANGUAGE sql IMMUTABLE
  RETURN (day + at::time) AT TIME ZONE timezone;

-- A post's stage from its jobs (decision 5): a failed account makes it failed, every account
-- live makes it posted, any other job scheduled. With no job, what a person marked, else draft.
CREATE FUNCTION brandbase.stage(marked text, statuses text[]) RETURNS text
  LANGUAGE sql IMMUTABLE
  RETURN CASE
    WHEN cardinality(statuses) = 0 THEN coalesce(marked, 'draft')
    WHEN 'failed' = ANY (statuses) THEN 'failed'
    WHEN 'live' = ALL (statuses) THEN 'posted'
    ELSE 'scheduled'
  END;

CREATE FUNCTION brandbase.post_stage(post text) RETURNS text
  LANGUAGE sql STABLE
  RETURN (
    SELECT brandbase.stage(p.marked,
      array(SELECT j.status FROM brandbase.post_jobs j WHERE j.post_id = p.id))
    FROM brandbase.posts p WHERE p.id = post
  );

-- Where each format can go (`KIND` in publish/model.ts), and where it goes when it names none.
CREATE FUNCTION brandbase.allowed_channels(format text) RETURNS text[]
  LANGUAGE sql IMMUTABLE
  RETURN CASE format
    WHEN 'reel' THEN ARRAY['ig', 'tt', 'yt', 'li', 'fb']
    WHEN 'carousel' THEN ARRAY['ig', 'tt', 'li', 'fb']
    WHEN 'story' THEN ARRAY['ig', 'fb']
  END;

CREATE FUNCTION brandbase.default_channels(format text, linked text[]) RETURNS text[]
  LANGUAGE sql IMMUTABLE
  RETURN array(
    SELECT c FROM unnest(CASE format
      WHEN 'reel' THEN ARRAY['ig', 'tt']
      WHEN 'carousel' THEN ARRAY['ig', 'fb']
      WHEN 'story' THEN ARRAY['ig']
    END) WITH ORDINALITY AS d(c, n)
    WHERE c = ANY (linked) ORDER BY n
  );

-- A post as the client reads it: the row, its stage and its jobs. `jobs` is a JSON array of job
-- rows, passed in by a move whose own statement changed them (a statement cannot read its own
-- changes back).
CREATE FUNCTION brandbase.post_json(p jsonb, jobs jsonb) RETURNS jsonb
  LANGUAGE sql STABLE
  RETURN brandbase.camel(p) || jsonb_build_object(
    'createdAt', brandbase.iso((p ->> 'created_at')::timestamptz),
    'updatedAt', brandbase.iso((p ->> 'updated_at')::timestamptz),
    'stage', brandbase.stage(p ->> 'marked',
      array(SELECT j ->> 'status' FROM jsonb_array_elements(jobs) j)),
    'jobs', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', j ->> 'id', 'channel', j ->> 'channel', 'status', j ->> 'status', 'error', j -> 'error',
        'runAt', brandbase.iso((j ->> 'run_at')::timestamptz)) ORDER BY j ->> 'channel')
      FROM jsonb_array_elements(jobs) j), '[]'));

CREATE FUNCTION brandbase.post_json(p brandbase.posts) RETURNS jsonb
  LANGUAGE sql STABLE
  RETURN brandbase.post_json(to_jsonb(p), coalesce(
    (SELECT jsonb_agg(to_jsonb(j)) FROM brandbase.post_jobs j WHERE j.post_id = p.id), '[]'));

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA brandbase TO pack_runtime;
