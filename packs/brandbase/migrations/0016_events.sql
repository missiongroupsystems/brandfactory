-- The company's own events, from Mission Events (docs/executing/mission-events-plan.md). Mission
-- Events owns them; the pack keeps its own rows, which each hourly pull replaces window by window,
-- so an event deleted there goes here at the next pull.

-- A brand's feed: the Mission Events outlet that is this brand (by id: their slugs repeat), when
-- the next pull is due, and when the last one landed.
CREATE TABLE brandbase.event_feeds (
  brand_id text PRIMARY KEY REFERENCES brandbase.brands (id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  next_at timestamp with time zone,
  pulled_at timestamp with time zone
);

-- An event as the calendar draws it: what is on, when, and where. Nothing about money or people.
CREATE TABLE brandbase.events (
  brand_id text NOT NULL REFERENCES brandbase.brands (id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('tentative', 'confirmed', 'completed')),
  event_type text,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone,
  all_day boolean NOT NULL DEFAULT false,
  room_name text,
  guest_count integer,
  pulled_at timestamp with time zone NOT NULL,
  PRIMARY KEY (brand_id, id)
);

-- The companies whose brands may have a feed. Mission Events' key is tied to one organisation
-- there (Ebb & Flow), so another company's owner must not point a brand at its outlets. Only the
-- operator adds a row (the runtime role reads it); Mission Group has one from here, if it exists.
CREATE TABLE brandbase.event_orgs (
  org_id text PRIMARY KEY REFERENCES brandbase.organizations (id) ON DELETE CASCADE
);

ALTER TABLE brandbase.organizations NO FORCE ROW LEVEL SECURITY;
INSERT INTO brandbase.event_orgs (org_id)
  SELECT id FROM brandbase.organizations WHERE id = 'mission-group';
ALTER TABLE brandbase.organizations FORCE ROW LEVEL SECURITY;

ALTER TABLE brandbase.event_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.event_orgs FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.event_orgs FOR SELECT
  USING (org_id = ANY ((SELECT brandbase.reached_orgs())::text[]));

GRANT SELECT ON brandbase.event_orgs TO pack_runtime;

ALTER TABLE brandbase.event_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.event_feeds FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.event_feeds
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER TABLE brandbase.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.events FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.events
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

GRANT SELECT, INSERT, UPDATE, DELETE ON brandbase.event_feeds, brandbase.events TO pack_runtime;

-- Mission Events sends naive timestamps that hold UTC (`2026-10-09T19:00:00` is 19:00 UTC). With
-- no zone it is read as UTC; a value that is not a time is null, and the pull leaves that row out.
CREATE FUNCTION brandbase.source_instant(value text) RETURNS timestamptz
  LANGUAGE sql STABLE
  RETURN CASE
    WHEN value IS NULL OR value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}' THEN NULL
    WHEN value ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN
      CASE WHEN pg_input_is_valid(value, 'timestamptz') THEN value::timestamptz END
    WHEN pg_input_is_valid(value || 'Z', 'timestamptz') THEN (value || 'Z')::timestamptz
  END;

GRANT EXECUTE ON FUNCTION brandbase.source_instant(text) TO pack_runtime;
