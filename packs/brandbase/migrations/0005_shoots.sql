-- Shoots and their crew (packages/server/src/routes/shoots.ts, domain/shoots.ts).

CREATE FUNCTION brandbase.minutes(t text) RETURNS integer
  LANGUAGE sql IMMUTABLE
  RETURN split_part(t, ':', 1)::integer * 60 + split_part(t, ':', 2)::integer;

-- A time of day from minutes, kept between 00:00 and 23:30.
CREATE FUNCTION brandbase.clock(m integer) RETURNS text
  LANGUAGE sql IMMUTABLE
  RETURN to_char(make_interval(mins => least(greatest(m, 0), 23 * 60 + 30)), 'HH24:MI');

-- The hours after an edit, as the call sheet's pickers make them: a new start alone keeps the
-- length (`moveStart`), and an end at or before the start moves to an hour after it (`setEnd`).
CREATE FUNCTION brandbase.hours_after(was_start text, was_end text, new_start text, new_end text)
  RETURNS text[]
  LANGUAGE sql IMMUTABLE
  RETURN (
    SELECT ARRAY[st, CASE WHEN brandbase.minutes(en) > brandbase.minutes(st) THEN en
                          ELSE brandbase.clock(brandbase.minutes(st) + 60) END]
    FROM (SELECT coalesce(new_start, was_start) AS st,
                 coalesce(new_end, CASE WHEN new_start IS NULL THEN was_end
                   ELSE brandbase.clock(brandbase.minutes(new_start) + brandbase.minutes(was_end)
                     - brandbase.minutes(was_start)) END) AS en) x
  );

-- The first day ahead with no shoot, else the last day looked at (`freeShootDay`).
CREATE FUNCTION brandbase.free_shoot_day(brand text, today date) RETURNS date
  LANGUAGE sql STABLE
  RETURN coalesce((
    SELECT d::date FROM generate_series(today + 1, today + 59, interval '1 day') AS d
    WHERE NOT EXISTS (SELECT 1 FROM brandbase.shoots s WHERE s.brand_id = brand AND s.day = d::date)
    ORDER BY d LIMIT 1), today + 60);

-- A shoot as the client reads it, with its crew in order.
CREATE FUNCTION brandbase.shoot_json(s jsonb, people jsonb) RETURNS jsonb
  LANGUAGE sql STABLE
  RETURN brandbase.camel(s) || jsonb_build_object(
    'createdAt', brandbase.iso((s ->> 'created_at')::timestamptz),
    'updatedAt', brandbase.iso((s ->> 'updated_at')::timestamptz),
    'crew', coalesce((
      SELECT jsonb_agg(brandbase.camel(c) ORDER BY (c ->> 'position')::integer)
      FROM jsonb_array_elements(people) c), '[]'));

CREATE FUNCTION brandbase.shoot_json(s brandbase.shoots) RETURNS jsonb
  LANGUAGE sql STABLE
  RETURN brandbase.shoot_json(to_jsonb(s), coalesce(
    (SELECT jsonb_agg(to_jsonb(c)) FROM brandbase.crew c WHERE c.shoot_id = s.id), '[]'));

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA brandbase TO pack_runtime;


-- A crew row carries its brand, so a move that makes a shoot and its crew in one statement can
-- pass the crew's row rules (the new shoot is not visible to them yet). The key keeps it the
-- shoot's brand; rows written without it (the server's seed) fall back to the shoot's.
ALTER TABLE brandbase.shoots ADD CONSTRAINT shoots_id_brand UNIQUE (id, brand_id);
ALTER TABLE brandbase.crew ADD COLUMN brand_id text;
ALTER TABLE brandbase.crew ADD CONSTRAINT crew_shoot_brand
  FOREIGN KEY (shoot_id, brand_id) REFERENCES brandbase.shoots (id, brand_id) ON DELETE CASCADE;
DROP POLICY reach ON brandbase.crew;
CREATE POLICY reach ON brandbase.crew
  USING (brandbase.can_reach(coalesce(brand_id,
    (SELECT s.brand_id FROM brandbase.shoots s WHERE s.id = shoot_id))))
  WITH CHECK (brandbase.can_reach(coalesce(brand_id,
    (SELECT s.brand_id FROM brandbase.shoots s WHERE s.id = shoot_id))));
