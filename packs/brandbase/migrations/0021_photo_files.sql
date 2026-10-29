-- brandbase 1.12.1: a photo the web app uploads keeps its kind in its address (`#photo`, as
-- `upload` in web-next's remote.ts writes it), as a video keeps `#video`. 0020's post_files took
-- only `#video`, so every uploaded photo read as a sample and no photo post went out. It now takes
-- either.
CREATE OR REPLACE FUNCTION brandbase.post_files(post text)
  RETURNS jsonb
  LANGUAGE sql STABLE
  AS 'SELECT coalesce(jsonb_agg(CASE WHEN m.id IS NULL THEN jsonb_build_object(''missing'', true)
      ELSE jsonb_build_object(''kind'', m.kind, ''mime'', m.mime, ''bytes'', m.bytes, ''key'', m.storage_key) END
      ORDER BY e.n), ''[]'')
    FROM brandbase.posts p
    CROSS JOIN LATERAL jsonb_array_elements(p.media) WITH ORDINALITY AS e (item, n)
    LEFT JOIN brandbase.media m ON m.brand_id = p.brand_id
      AND m.storage_key = substring(e.item ->> ''src''
        FROM ''/files/[A-Za-z0-9_-]{43}/(brandbase/[0-9a-f-]{36}\.[a-z0-9]{1,5})(?:#video|#photo)?$'')
    WHERE p.id = post_files.post';
