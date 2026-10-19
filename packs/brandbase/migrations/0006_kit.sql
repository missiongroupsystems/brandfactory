-- The brand kit (packages/server/src/routes/kit.ts).

-- A blank summary keeps the old one, a pair needs both words, a blank line goes (`voiceEdited`).
CREATE FUNCTION brandbase.voice_edited(old jsonb, draft jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
  RETURN jsonb_build_object(
    'summary', coalesce(nullif(regexp_replace(draft ->> 'summary', '^\s+|\s+$', '', 'g'), ''), old ->> 'summary'),
    'words', coalesce((
      SELECT jsonb_agg(jsonb_build_object('use', btrim(w ->> 'use'), 'avoid', btrim(w ->> 'avoid')) ORDER BY n)
      FROM jsonb_array_elements(draft -> 'words') WITH ORDINALITY AS t(w, n)
      WHERE btrim(w ->> 'use') <> '' AND btrim(w ->> 'avoid') <> ''), '[]'),
    'examples', coalesce((
      SELECT jsonb_agg(btrim(l) ORDER BY n)
      FROM jsonb_array_elements_text(draft -> 'examples') WITH ORDINALITY AS t(l, n)
      WHERE btrim(l) <> ''), '[]'));

-- "#d9572b", "d9572b" or "#d52" as "#D9572B"; anything else is null (`hexOf`).
CREATE FUNCTION brandbase.hex_of(input text) RETURNS text
  LANGUAGE sql IMMUTABLE
  RETURN (
    SELECT CASE
      WHEN h ~* '^[0-9a-f]{3}$' THEN upper('#' || substr(h, 1, 1) || substr(h, 1, 1) || substr(h, 2, 1)
        || substr(h, 2, 1) || substr(h, 3, 1) || substr(h, 3, 1))
      WHEN h ~* '^[0-9a-f]{6}$' THEN upper('#' || h)
    END
    FROM (SELECT regexp_replace(btrim(input), '^#', '') AS h) x
  );

-- "CV_brand-deck_2025.pdf" → "CV brand deck 2025" (`plainTitle`).
CREATE FUNCTION brandbase.plain_title(name text) RETURNS text
  LANGUAGE sql IMMUTABLE
  RETURN (
    SELECT CASE WHEN w = '' THEN name ELSE upper(left(w, 1)) || substr(w, 2) END
    FROM (SELECT btrim(regexp_replace(regexp_replace(regexp_replace(name, '\.[^.]+$', ''),
      '[_\-.]+', ' ', 'g'), '\s+', ' ', 'g')) AS w) x
  );

-- What a file is, from its name's ending.
CREATE FUNCTION brandbase.file_kind(name text) RETURNS text
  LANGUAGE sql IMMUTABLE
  RETURN CASE lower(substring(name FROM '\.([^.]+)$'))
    WHEN 'pdf' THEN 'pdf'
    WHEN 'ppt' THEN 'deck' WHEN 'pptx' THEN 'deck' WHEN 'key' THEN 'deck'
    WHEN 'xls' THEN 'sheet' WHEN 'xlsx' THEN 'sheet' WHEN 'csv' THEN 'sheet'
    WHEN 'png' THEN 'image' WHEN 'jpg' THEN 'image' WHEN 'jpeg' THEN 'image'
    WHEN 'webp' THEN 'image' WHEN 'svg' THEN 'image'
    ELSE 'doc'
  END;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA brandbase TO pack_runtime;
