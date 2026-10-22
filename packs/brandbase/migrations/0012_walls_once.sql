-- The brand walls ask who the caller is once per statement, not once per row. can_reach(brand)
-- reads users and members again for each row it judges; these two read them once, and a policy
-- that calls them inside a sub-select that names no row runs each once per statement. The answer
-- is can_reach's: an active admin reaches every brand, an active member the brands they hold a
-- row for, anyone else none. can_reach stays, with the same answer, for anything that calls it.

-- The caller is an active admin.
CREATE FUNCTION brandbase.reaches_all() RETURNS boolean
  LANGUAGE sql STABLE
  RETURN EXISTS (
    SELECT 1 FROM brandbase.users u
    WHERE u.id = brandbase.caller() AND u.deactivated_at IS NULL AND u.role = 'admin'
  );

-- The brands the caller, if active, holds a row for.
CREATE FUNCTION brandbase.reached() RETURNS text[]
  LANGUAGE sql STABLE
  RETURN ARRAY(
    SELECT m.brand_id FROM brandbase.members m JOIN brandbase.users u ON u.id = m.user_id
    WHERE u.id = brandbase.caller() AND u.deactivated_at IS NULL
  );

GRANT EXECUTE ON FUNCTION brandbase.reaches_all(), brandbase.reached() TO pack_runtime;

ALTER POLICY reach ON brandbase.brands
  USING ((SELECT brandbase.reaches_all()) OR id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.brand_files
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.brand_kits
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.comments
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.connections
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.ideas
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.inbox_messages
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.inbox_people
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.media
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.post_jobs
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.posts
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.share_links
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.shoots
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.voice_versions
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.pasted_links
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.moodboard_boards
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

ALTER POLICY reach ON brandbase.moodboard_posts
  USING ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR brand_id = ANY ((SELECT brandbase.reached())::text[]));

-- A crew row with no brand of its own (from before 0005) takes its shoot's, as 0005 has it.
ALTER POLICY reach ON brandbase.crew
  USING ((SELECT brandbase.reaches_all()) OR coalesce(brand_id,
    (SELECT s.brand_id FROM brandbase.shoots s WHERE s.id = shoot_id))
    = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK ((SELECT brandbase.reaches_all()) OR coalesce(brand_id,
    (SELECT s.brand_id FROM brandbase.shoots s WHERE s.id = shoot_id))
    = ANY ((SELECT brandbase.reached())::text[]));
