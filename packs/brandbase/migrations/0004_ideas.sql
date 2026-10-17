-- Ideas on the calendar (packages/server/src/routes/ideas.ts, `landingDay` in calendar-slot.ts).

-- The Sunday that ends the week holding a day: weeks run Monday to Sunday.
CREATE FUNCTION brandbase.week_end(d date) RETURNS date
  LANGUAGE sql IMMUTABLE
  RETURN d + (7 - extract(isodow FROM d)::int);

-- The day an idea lands on: the day asked for, if it is after today and holds no post; else the
-- first day after this week with nothing on it, since a shoot needs lead time. Stories sit in
-- their own row and fill no day. Null when the next 120 days are full.
CREATE FUNCTION brandbase.landing_day(brand text, today date, prefer date) RETURNS date
  LANGUAGE sql STABLE
  RETURN (
    SELECT CASE
      WHEN prefer IS NOT NULL AND prefer > today AND NOT EXISTS (
        SELECT 1 FROM brandbase.posts p
        WHERE p.brand_id = brand AND p.format <> 'story' AND p.day = prefer
      ) THEN prefer
      ELSE (
        SELECT d::date FROM generate_series(
          brandbase.week_end(today) + 1, brandbase.week_end(today) + 120, interval '1 day') AS d
        WHERE NOT EXISTS (
          SELECT 1 FROM brandbase.posts p
          WHERE p.brand_id = brand AND p.format <> 'story' AND p.day = d::date)
        AND NOT EXISTS (
          SELECT 1 FROM brandbase.ideas i
          WHERE i.brand_id = brand AND i.format <> 'story' AND i.day = d::date)
        ORDER BY d LIMIT 1)
    END
  );

GRANT EXECUTE ON FUNCTION brandbase.week_end(date), brandbase.landing_day(text, date, date)
  TO pack_runtime;
