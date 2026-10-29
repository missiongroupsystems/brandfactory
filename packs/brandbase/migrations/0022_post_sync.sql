-- brandbase 1.13.0: the core's side of the Posted page's sync (docs/executing/posted-page-plan.md,
-- phase 2). A Make scenario reads each linked brand's Instagram and Facebook posts and stories with
-- their counts, and `post.sync` keeps them: a post Brand Base sent is found by its live job's
-- external id, a post made outside Brand Base is a posted post of its own (id: brand, channel and
-- the platform's id, as `post.import` makes them).

-- A story's end: Instagram takes it down 24 hours after it went out, and reads nothing for it after.
-- The post keeps its last counts for good. Null for everything that is not a synced story.
ALTER TABLE brandbase.posts ADD COLUMN expires_at timestamptz;

-- The read time of the newest reading a post made outside Brand Base took its caption from: a
-- reading refreshes the caption only when it is newer, with counts or without. Null for every post
-- Brand Base made, and for an imported post until its first reading.
ALTER TABLE brandbase.posts ADD COLUMN synced_at timestamptz;

-- An Instagram address's shortcode (`/p/`, `/reel/` or `/tv/`), or null: the one key the Apify
-- import (which names a post by it) and Make's read-back (by its media id) share.
CREATE FUNCTION brandbase.ig_shortcode(permalink text) RETURNS text
  LANGUAGE sql IMMUTABLE
  RETURN substring(permalink FROM '^https://(?:www\.)?instagram\.com/(?:[A-Za-z0-9_.]+/)?(?:p|reel|tv)/([A-Za-z0-9_-]{1,40})');

GRANT EXECUTE ON FUNCTION brandbase.ig_shortcode(text) TO pack_runtime;

-- Finds a sent post by the id the platform gave its job.
CREATE INDEX post_jobs_external ON brandbase.post_jobs (brand_id, channel, external_id)
  WHERE external_id IS NOT NULL;

-- Every reading of a post's counts, as the platform answered it: one row per post per reading, so
-- a "reach, by day" series can be drawn later (Meta gives totals, not a series). The same reading
-- sent again is the same row. The counts are only those the platform gave: never a 0 for one it
-- did not.
CREATE TABLE brandbase.post_readings (
  brand_id text NOT NULL REFERENCES brandbase.brands (id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('ig', 'fb')),
  external_id text NOT NULL,
  read_at timestamptz NOT NULL,
  post_id text NOT NULL REFERENCES brandbase.posts (id) ON DELETE CASCADE,
  metrics jsonb NOT NULL,
  PRIMARY KEY (brand_id, channel, external_id, read_at)
);

CREATE INDEX post_readings_post ON brandbase.post_readings (post_id, read_at);

ALTER TABLE brandbase.post_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.post_readings FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.post_readings
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

GRANT SELECT, INSERT ON brandbase.post_readings TO pack_runtime;

-- As 0014's, with a story's end in the same form as the other times.
CREATE OR REPLACE FUNCTION brandbase.post_json(p jsonb, jobs jsonb) RETURNS jsonb
  LANGUAGE sql STABLE
  RETURN brandbase.camel(p) || jsonb_build_object(
    'createdAt', brandbase.iso((p ->> 'created_at')::timestamptz),
    'updatedAt', brandbase.iso((p ->> 'updated_at')::timestamptz),
    'measuredAt', brandbase.iso((p ->> 'measured_at')::timestamptz),
    'expiresAt', brandbase.iso((p ->> 'expires_at')::timestamptz),
    'syncedAt', brandbase.iso((p ->> 'synced_at')::timestamptz),
    'stage', brandbase.stage(p ->> 'marked',
      array(SELECT j ->> 'status' FROM jsonb_array_elements(jobs) j)),
    'jobs', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', j ->> 'id', 'channel', j ->> 'channel', 'status', j ->> 'status', 'error', j -> 'error',
        'runAt', brandbase.iso((j ->> 'run_at')::timestamptz)) ORDER BY j ->> 'channel')
      FROM jsonb_array_elements(jobs) j), '[]'));
