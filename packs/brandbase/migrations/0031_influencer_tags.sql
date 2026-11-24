-- brandbase 1.21.0: a creator's tags (docs/completions/creator-tags-phases-1-to-1.md). Short
-- lower-case topics ("italian food", "wine") that people add and remove in the Creators sidebar,
-- and that a server job asks a model for, from the team's notes, the category and the Instagram
-- bio. A person's choice wins: the model's tags never take the place of one a person added, and a
-- tag a person removed is never given back by the model. Additive: every new column has a default
-- or is null, and influencer_json gains one key.

ALTER TABLE brandbase.influencers
  -- Tags people added, in the order added.
  ADD COLUMN tags_team text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags_team) <= 20),
  -- The model's last tags, less every tag a person added or removed.
  ADD COLUMN tags_ai text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags_ai) <= 6),
  -- Tags a person removed: the model's answer never brings them back.
  ADD COLUMN tags_hidden text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags_hidden) <= 100),
  -- What the model last tagged: influencer_tag_source of the category, the notes and the bio.
  ADD COLUMN tags_source text,
  -- The model's last try, answered or not: a failed one waits before it is tried again.
  ADD COLUMN tagged_at timestamp with time zone,
  -- The account's Instagram bio as Business Discovery last read it, and when it was read.
  ADD COLUMN bio text CHECK (length(bio) <= 1000),
  ADD COLUMN bio_read_at timestamp with time zone;

GRANT UPDATE (tags_team, tags_ai, tags_hidden, tags_source, tagged_at, bio, bio_read_at)
  ON brandbase.influencers TO pack_runtime;

-- One spelling for a tag: no leading "#", single spaces, no space at either end, lower case. A
-- tag is then valid if it matches tag_ok's pattern.
CREATE FUNCTION brandbase.tag_of(raw text) RETURNS text
  LANGUAGE sql IMMUTABLE
  RETURN lower(btrim(regexp_replace(regexp_replace(raw, '^[[:space:]#]+', ''), '[[:space:]]+', ' ', 'g')));

-- 1 to 30 characters: letters and digits, with spaces, "&", "'" and "-" between them.
CREATE FUNCTION brandbase.tag_ok(tag text) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  RETURN coalesce(tag ~ '^[a-z0-9]([a-z0-9 &''-]{0,28}[a-z0-9])?$', false);

-- What the model tags from, as one value: it changes when the category, the notes or the bio do.
CREATE FUNCTION brandbase.influencer_tag_source(category text, notes text, bio text) RETURNS text
  LANGUAGE sql IMMUTABLE
  RETURN md5(coalesce(category, '') || chr(10) || coalesce(notes, '') || chr(10) || coalesce(bio, ''));

-- The tags a creator shows: the team's first, then the model's that the team has not.
CREATE FUNCTION brandbase.influencer_tags(team text[], ai text[]) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
  RETURN to_jsonb(team || ARRAY(
    SELECT t FROM unnest(ai) WITH ORDINALITY AS a (t, n) WHERE t <> ALL (team) ORDER BY n));

GRANT EXECUTE ON FUNCTION brandbase.tag_of(text), brandbase.tag_ok(text),
  brandbase.influencer_tag_source(text, text, text), brandbase.influencer_tags(text[], text[])
  TO pack_runtime;

-- One person as the moves answer them (0029), with their tags.
CREATE OR REPLACE FUNCTION brandbase.influencer_json(person uuid) RETURNS jsonb
  LANGUAGE sql STABLE
  RETURN (
    SELECT jsonb_build_object(
      'id', i.id, 'orgId', i.org_id, 'slug', i.slug, 'name', i.name, 'category', i.category,
      'status', i.status, 'notes', i.notes, 'updatedAt', brandbase.iso(i.updated_at),
      'tags', brandbase.influencer_tags(i.tags_team, i.tags_ai),
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
