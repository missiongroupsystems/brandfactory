-- What stops a post going out, in the composer's order (packages/server/src/domain/publish.ts).
-- The text shaping reads the core's textfn functions for the Unicode classes SQL lacks.

-- The opening phrase of the caption, hashtags out, up to the first '.', '!', '?' or emoji; the
-- hook when that is empty; at most 100 characters.
CREATE FUNCTION brandbase.youtube_title(caption text, hook text) RETURNS text
  LANGUAGE sql IMMUTABLE
  RETURN (
    SELECT CASE WHEN char_length(t) > 100 THEN left(t, 99) || '…' ELSE t END
    FROM (SELECT btrim(coalesce(nullif(btrim(textfn.first_sentence(textfn.strip_hashtags(caption))), ''), hook)) AS t) x
  );

-- LinkedIn: emoji and hashtags out, spaces folded, the first hashtag kept at the end.
CREATE FUNCTION brandbase.linkedin_text(caption text) RETURNS text
  LANGUAGE sql IMMUTABLE
  RETURN (
    SELECT CASE WHEN tags[1] IS NULL THEN body ELSE body || ' ' || tags[1] END
    FROM (SELECT textfn.hashtags(caption) AS tags,
      btrim(regexp_replace(textfn.strip_emoji(textfn.strip_hashtags(caption)), '\s+', ' ', 'g')) AS body) x
  );

-- The text one account receives (`textFor`).
CREATE FUNCTION brandbase.text_for(caption text, hook text, draft jsonb, channel text) RETURNS text
  LANGUAGE sql IMMUTABLE
  RETURN CASE
    WHEN channel = 'yt' THEN coalesce(draft ->> 'youtubeTitle', brandbase.youtube_title(caption, hook))
    WHEN coalesce(draft -> 'overrides', '{}') ? channel THEN draft -> 'overrides' ->> channel
    WHEN channel = 'li' THEN brandbase.linkedin_text(caption)
    ELSE caption
  END;

-- The accounts a send goes to: the ones named (or the post's), less the ones already live, in
-- order and once each.
CREATE FUNCTION brandbase.send_channels(post text, named jsonb) RETURNS text[]
  LANGUAGE sql STABLE
  RETURN (
    SELECT array(
      SELECT c FROM jsonb_array_elements_text(coalesce(named, to_jsonb(p.channels)))
        WITH ORDINALITY AS t(c, n)
      WHERE NOT EXISTS (
        SELECT 1 FROM brandbase.post_jobs j WHERE j.post_id = p.id AND j.channel = c AND j.status = 'live'
      )
      GROUP BY c ORDER BY min(n)
    )
    FROM brandbase.posts p WHERE p.id = post
  );

-- A JSON value as JavaScript reads it in an `if`: false, 0, '', null and a missing value are
-- false; anything else is true.
CREATE FUNCTION brandbase.truthy(v jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  RETURN v IS NOT NULL AND v NOT IN ('false'::jsonb, '0'::jsonb, '""'::jsonb, 'null'::jsonb);

CREATE FUNCTION brandbase.send_blockers(
  brand text, post text, send_when text, named jsonb, now timestamptz
) RETURNS text[]
  LANGUAGE plpgsql STABLE
AS $$
DECLARE
  p brandbase.posts;
  draft jsonb;
  chans text[];
  send_day date;
  send_at text;
  c text;
  used integer;
  out text[] := '{}';
  names constant jsonb := '{"ig": "Instagram", "tt": "TikTok", "yt": "YouTube", "li": "LinkedIn", "fb": "Facebook"}';
  limits constant jsonb := '{"ig": 2200, "tt": 2200, "yt": 100, "li": 3000, "fb": 63206}';
  most integer;
BEGIN
  SELECT * INTO p FROM brandbase.posts WHERE id = post AND brand_id = brand;
  IF NOT FOUND THEN
    RETURN '{}';
  END IF;
  draft := p.draft;
  chans := brandbase.send_channels(post, named);
  IF send_when = 'now' THEN
    send_day := brandbase.today(brand, now);
    send_at := (SELECT to_char(now AT TIME ZONE b.timezone, 'HH24:MI') FROM brandbase.brands b WHERE b.id = brand);
  ELSE
    send_day := p.day;
    send_at := p.time;
  END IF;

  -- The accounts that publish through a connection of the same key.
  FOREACH c IN ARRAY chans LOOP
    IF c IN ('ig', 'tt', 'fb') AND NOT EXISTS (
      SELECT 1 FROM brandbase.connections k WHERE k.brand_id = brand AND k.key = c AND k.status = 'connected'
    ) THEN
      out := out || ('Reconnect ' || (names ->> c) || ' first.');
    END IF;
  END LOOP;
  IF jsonb_array_length(p.media) = 0 AND p.format <> 'story' THEN
    out := out || 'Add a photo or video.'::text;
  END IF;
  most := CASE p.format WHEN 'reel' THEN 1 ELSE 10 END;
  IF jsonb_array_length(p.media) > most THEN
    out := out || ('A ' || p.format || ' takes up to ' || most || '.');
  END IF;
  IF p.format = 'story' AND send_day IS NOT NULL AND EXISTS (
    SELECT 1 FROM brandbase.posts o
    WHERE o.brand_id = brand AND o.format = 'story' AND o.day = send_day AND o.id <> p.id
  ) THEN
    out := out || 'A story is already planned that day.'::text;
  END IF;
  IF cardinality(chans) = 0 THEN
    out := out || 'Pick a channel.'::text;
  ELSE
    IF 'tt' = ANY (chans) THEN
      IF coalesce(draft ->> 'privacy', '') = '' THEN
        out := out || 'Choose who can watch on TikTok.'::text;
      END IF;
      IF brandbase.truthy(draft -> 'promo' -> 'on')
        AND NOT brandbase.truthy(draft -> 'promo' -> 'own')
        AND NOT brandbase.truthy(draft -> 'promo' -> 'paid') THEN
        out := out || 'Say what it promotes on TikTok.'::text;
      END IF;
    END IF;
    IF p.caption !~ '\S' AND p.format <> 'story' THEN
      out := out || 'Write a caption.'::text;
    END IF;
    FOREACH c IN ARRAY chans LOOP
      used := char_length(coalesce(brandbase.text_for(p.caption, p.hook, draft, c), ''));
      IF used > (limits ->> c)::integer THEN
        out := out || ('Shorten the ' || CASE WHEN c = 'yt' THEN 'title' ELSE 'text' END
          || ' for ' || (names ->> c) || ' (' || used || '/' || (limits ->> c) || ').');
      END IF;
    END LOOP;
  END IF;
  IF send_day IS NULL OR send_at IS NULL THEN
    out := out || 'Pick a day.'::text;
  END IF;
  RETURN out;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA brandbase TO pack_runtime;
