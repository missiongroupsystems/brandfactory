-- brandbase 1.13.1: each platform's own link and counts for a post that went to more than one
-- (docs/executing/posted-page-plan.md). A post keeps one address and one set of counts, its first
-- account's; a post Brand Base sent to Instagram and Facebook lost its Facebook address. Each
-- reading now keeps the address the platform gave, each job the address Make answered when it
-- posted, and a post's JSON carries its latest reading on each channel and each job's address.
-- Readings and jobs from before this migration have no address: the post's own covers its first
-- account.
ALTER TABLE brandbase.post_readings ADD COLUMN permalink text;
ALTER TABLE brandbase.post_jobs ADD COLUMN permalink text;

-- A post's JSON now looks up each channel's latest reading: index by channel too. It still serves
-- the lookups by post alone that 0022's did.
DROP INDEX brandbase.post_readings_post;
CREATE INDEX post_readings_post ON brandbase.post_readings (post_id, channel, read_at);

-- As 0022's, plus each job's address and `readings`: per channel, the latest counts with their read time and the
-- latest address. A channel with neither is left out; under the row rules a caller who does not
-- reach the brand sees none.
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
        'runAt', brandbase.iso((j ->> 'run_at')::timestamptz), 'permalink', j ->> 'permalink')
        ORDER BY j ->> 'channel')
      FROM jsonb_array_elements(jobs) j), '[]'),
    'readings', coalesce((
      SELECT jsonb_object_agg(c.channel, jsonb_strip_nulls(jsonb_build_object(
        'metrics', m.metrics, 'readAt', brandbase.iso(m.read_at), 'permalink', l.permalink)))
      FROM (SELECT DISTINCT r.channel FROM brandbase.post_readings r WHERE r.post_id = p ->> 'id') c
      LEFT JOIN LATERAL (SELECT r.metrics, r.read_at FROM brandbase.post_readings r
        WHERE r.post_id = p ->> 'id' AND r.channel = c.channel AND r.metrics <> '{}'::jsonb
        ORDER BY r.read_at DESC, r.external_id LIMIT 1) m ON true
      LEFT JOIN LATERAL (SELECT r.permalink FROM brandbase.post_readings r
        WHERE r.post_id = p ->> 'id' AND r.channel = c.channel AND r.permalink IS NOT NULL
        ORDER BY r.read_at DESC, r.external_id LIMIT 1) l ON true), '{}'));
