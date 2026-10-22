-- Posts already out on a brand's own social account, brought in from outside BrandBase (a scrape
-- of its Instagram or TikTok): where the post lives, and its counts when they were last read.
-- A post that BrandBase made has none of the three.
ALTER TABLE brandbase.posts ADD COLUMN permalink text;
ALTER TABLE brandbase.posts ADD COLUMN metrics jsonb;
ALTER TABLE brandbase.posts ADD COLUMN measured_at timestamptz;

-- As 0002's, with the time the counts were read in the same form as createdAt.
CREATE OR REPLACE FUNCTION brandbase.post_json(p jsonb, jobs jsonb) RETURNS jsonb
  LANGUAGE sql STABLE
  RETURN brandbase.camel(p) || jsonb_build_object(
    'createdAt', brandbase.iso((p ->> 'created_at')::timestamptz),
    'updatedAt', brandbase.iso((p ->> 'updated_at')::timestamptz),
    'measuredAt', brandbase.iso((p ->> 'measured_at')::timestamptz),
    'stage', brandbase.stage(p ->> 'marked',
      array(SELECT j ->> 'status' FROM jsonb_array_elements(jobs) j)),
    'jobs', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', j ->> 'id', 'channel', j ->> 'channel', 'status', j ->> 'status', 'error', j -> 'error',
        'runAt', brandbase.iso((j ->> 'run_at')::timestamptz)) ORDER BY j ->> 'channel')
      FROM jsonb_array_elements(jobs) j), '[]'));
