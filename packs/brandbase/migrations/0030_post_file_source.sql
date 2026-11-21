-- brandbase 1.20.0: a post's photo can name the file it was cut from (`source` in the media item),
-- when the web app cut it by itself to the part Instagram shows (`feedFrames`). Facebook shows any
-- shape whole, so its sender takes the source; Instagram takes the cut its tags are fractions of.
-- Additive: an item with no `source`, or one whose source is not a file of the brand, reads as
-- before, with no `source` key, so a payload a person already approved stays the same.
CREATE OR REPLACE FUNCTION brandbase.post_files(post text)
  RETURNS jsonb
  LANGUAGE sql STABLE
  AS 'SELECT coalesce(jsonb_agg(CASE WHEN m.id IS NULL THEN jsonb_build_object(''missing'', true)
      ELSE jsonb_build_object(''kind'', m.kind, ''mime'', m.mime, ''bytes'', m.bytes, ''key'', m.storage_key)
        || CASE WHEN s.id IS NULL THEN ''{}''::jsonb
          ELSE jsonb_build_object(''source'', jsonb_build_object(''kind'', s.kind, ''mime'', s.mime,
            ''bytes'', s.bytes, ''key'', s.storage_key)) END END
      ORDER BY e.n), ''[]'')
    FROM brandbase.posts p
    CROSS JOIN LATERAL jsonb_array_elements(p.media) WITH ORDINALITY AS e (item, n)
    LEFT JOIN brandbase.media m ON m.brand_id = p.brand_id
      AND m.storage_key = substring(e.item ->> ''src''
        FROM ''/files/[A-Za-z0-9_-]{43}/(brandbase/[0-9a-f-]{36}\.[a-z0-9]{1,5})(?:#video|#photo)?$'')
    LEFT JOIN brandbase.media s ON s.brand_id = p.brand_id AND s.kind = ''photo''
      AND s.storage_key = substring(e.item ->> ''source''
        FROM ''/files/[A-Za-z0-9_-]{43}/(brandbase/[0-9a-f-]{36}\.[a-z0-9]{1,5})(?:#photo)?$'')
    WHERE p.id = post_files.post';
