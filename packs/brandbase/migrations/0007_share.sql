-- Share links and guests (packages/server/src/routes/share.ts). A guest has no account: the core
-- runs a guest move with no person and the link's token as app.capability, and these rules
-- decide what that token opens. A link the team keeps to itself (who = 'team') opens nothing.

CREATE FUNCTION brandbase.capability() RETURNS text
  LANGUAGE sql STABLE
  RETURN nullif(current_setting('app.capability', true), '');

-- A new link's token: 32 random bytes as base64url, as the server made them.
CREATE FUNCTION brandbase.new_token() RETURNS text
  LANGUAGE sql VOLATILE
  RETURN rtrim(translate(encode(decode(replace(gen_random_uuid()::text || gen_random_uuid()::text,
    '-', ''), 'hex'), 'base64'), '+/', '-_'), '=');

-- The guest's own link, whatever it allows: a rule tells "nothing here" from "team only".
CREATE POLICY guest ON brandbase.share_links FOR SELECT USING (token = brandbase.capability());

-- What a link opens to guests: its idea or shoot, the shoot an idea is on, the ideas a shoot holds.
CREATE POLICY guest ON brandbase.shoots FOR SELECT USING (EXISTS (
  SELECT 1 FROM brandbase.share_links l
  WHERE l.token = brandbase.capability() AND l.who = 'link' AND l.brand_id = shoots.brand_id
    AND ((l.kind = 'shoot' AND l.target_id = shoots.id)
      OR (l.kind = 'idea' AND l.target_id = ANY (shoots.idea_ids)))));

CREATE POLICY guest ON brandbase.ideas FOR SELECT USING (EXISTS (
  SELECT 1 FROM brandbase.share_links l
  WHERE l.token = brandbase.capability() AND l.who = 'link' AND l.brand_id = ideas.brand_id
    AND ((l.kind = 'idea' AND l.target_id = ideas.id)
      OR (l.kind = 'shoot' AND EXISTS (
        SELECT 1 FROM brandbase.shoots s WHERE s.id = l.target_id AND ideas.id = ANY (s.idea_ids))))));

CREATE POLICY guest ON brandbase.crew FOR SELECT USING (EXISTS (
  SELECT 1 FROM brandbase.share_links l
  WHERE l.token = brandbase.capability() AND l.who = 'link' AND l.kind = 'shoot'
    AND l.target_id = crew.shoot_id));

CREATE POLICY guest ON brandbase.comments FOR SELECT USING (EXISTS (
  SELECT 1 FROM brandbase.share_links l
  WHERE l.token = brandbase.capability() AND l.who = 'link' AND l.brand_id = comments.brand_id
    AND l.kind = comments.kind AND l.target_id = comments.target_id));

-- A guest's comment: on the link's own page, top level, not the team's, where the link takes one.
CREATE POLICY guest_comment ON brandbase.comments FOR INSERT WITH CHECK (
  parent_id IS NULL AND NOT from_team AND EXISTS (
    SELECT 1 FROM brandbase.share_links l
    WHERE l.token = brandbase.capability() AND l.who = 'link' AND l.can IN ('comment', 'edit')
      AND l.brand_id = comments.brand_id AND l.kind = comments.kind
      AND l.target_id = comments.target_id));

-- "Can edit" (decision 6): the brief's words, on the link's own idea, and the hook carried to its
-- post. Which columns change is the move's; these rules decide which rows.
CREATE POLICY guest_edit ON brandbase.ideas FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM brandbase.share_links l
    WHERE l.token = brandbase.capability() AND l.who = 'link' AND l.can = 'edit'
      AND l.kind = 'idea' AND l.target_id = ideas.id))
  WITH CHECK (EXISTS (
    SELECT 1 FROM brandbase.share_links l
    WHERE l.token = brandbase.capability() AND l.who = 'link' AND l.can = 'edit'
      AND l.kind = 'idea' AND l.target_id = ideas.id AND l.brand_id = ideas.brand_id));

CREATE POLICY guest_edit ON brandbase.posts FOR SELECT USING (EXISTS (
  SELECT 1 FROM brandbase.share_links l JOIN brandbase.ideas i ON i.id = l.target_id
  WHERE l.token = brandbase.capability() AND l.who = 'link' AND l.can = 'edit'
    AND l.kind = 'idea' AND i.post_id = posts.id));

CREATE POLICY guest_carry ON brandbase.posts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM brandbase.share_links l JOIN brandbase.ideas i ON i.id = l.target_id
    WHERE l.token = brandbase.capability() AND l.who = 'link' AND l.can = 'edit'
      AND l.kind = 'idea' AND i.post_id = posts.id))
  WITH CHECK (EXISTS (
    SELECT 1 FROM brandbase.share_links l JOIN brandbase.ideas i ON i.id = l.target_id
    WHERE l.token = brandbase.capability() AND l.who = 'link' AND l.can = 'edit'
      AND l.kind = 'idea' AND i.post_id = posts.id AND l.brand_id = posts.brand_id));

-- The jobs of that post, so brandbase.post_stage sees a posted post as posted to a guest too and
-- the hook is not carried to it.
CREATE POLICY guest_edit ON brandbase.post_jobs FOR SELECT USING (EXISTS (
  SELECT 1 FROM brandbase.share_links l JOIN brandbase.ideas i ON i.id = l.target_id
  WHERE l.token = brandbase.capability() AND l.who = 'link' AND l.can = 'edit'
    AND l.kind = 'idea' AND i.post_id = post_jobs.post_id));

-- A thread as the pages read it: top-level comments in order, each with its replies.
CREATE FUNCTION brandbase.thread(k text, target text) RETURNS jsonb
  LANGUAGE sql STABLE
  RETURN coalesce((
    SELECT jsonb_agg(brandbase.camel(to_jsonb(c)) || jsonb_build_object(
      'createdAt', brandbase.iso(c.created_at),
      'replies', coalesce((
        SELECT jsonb_agg(brandbase.camel(to_jsonb(r)) || jsonb_build_object('createdAt',
          brandbase.iso(r.created_at)) ORDER BY r.created_at, r.id)
        FROM brandbase.comments r WHERE r.parent_id = c.id), '[]'))
      ORDER BY c.created_at, c.id)
    FROM brandbase.comments c
    WHERE c.kind = k AND c.target_id = target AND c.parent_id IS NULL), '[]');

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA brandbase TO pack_runtime;
