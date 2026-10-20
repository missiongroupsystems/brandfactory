-- An idea's final edit is a list: one video for a reel, one file for a story, the slides in order for a carousel.
ALTER TABLE brandbase.ideas
  ALTER COLUMN cut TYPE jsonb USING CASE WHEN nullif(cut, '') IS NULL THEN NULL ELSE jsonb_build_array(cut) END;

-- Before the final edit, a carousel's slides and a story's frames were the media captured on its shots: they become
-- its final edit, so the idea page still shows them and the post keeps every one. Row rules hide every row from a migration, which has no caller,
-- so the table's owner skips them for this one statement; they are forced again in the same transaction.
ALTER TABLE brandbase.ideas NO FORCE ROW LEVEL SECURITY;

UPDATE brandbase.ideas i SET cut = (
  SELECT jsonb_agg(m.media ORDER BY m.n) FROM (
    SELECT s ->> 'media' AS media, n
    FROM jsonb_array_elements(i.shots) WITH ORDINALITY AS t(s, n)
    WHERE coalesce(s ->> 'media', '') <> ''
    ORDER BY n
    LIMIT 10
  ) m
)
WHERE i.cut IS NULL
  AND i.format IN ('carousel', 'story')
  AND jsonb_typeof(i.shots) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(i.shots) s WHERE coalesce(s ->> 'media', '') <> '');

ALTER TABLE brandbase.ideas FORCE ROW LEVEL SECURITY;
