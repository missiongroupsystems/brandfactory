-- The moodboard (Reference and Board in packages/web-next/src/data/ideas.ts): a brand's
-- Pinterest boards, and the saved posts on its shelf or pinned to a board. Pasted links stay in
-- pasted_links. Nothing writes these yet but the demo's seed; the moves only read them.
CREATE TABLE brandbase.moodboard_boards (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES brandbase.brands (id) ON DELETE CASCADE,
  name text NOT NULL,
  pin_count integer NOT NULL DEFAULT 0,
  covers jsonb NOT NULL DEFAULT '[]',
  position integer NOT NULL,
  UNIQUE (id, brand_id)
);

-- A post with no board is on the shelf. A pin's board is its own brand's.
CREATE TABLE brandbase.moodboard_posts (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES brandbase.brands (id) ON DELETE CASCADE,
  board_id text,
  platform text NOT NULL CHECK (platform IN ('ig', 'tt', 'pinterest')),
  account text NOT NULL,
  image text NOT NULL,
  borrow text NOT NULL,
  ratio real,
  seed jsonb NOT NULL,
  position integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  FOREIGN KEY (board_id, brand_id)
    REFERENCES brandbase.moodboard_boards (id, brand_id) ON DELETE CASCADE
);

ALTER TABLE brandbase.moodboard_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.moodboard_boards FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.moodboard_boards
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

ALTER TABLE brandbase.moodboard_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.moodboard_posts FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.moodboard_posts
  USING (brandbase.can_reach(brand_id)) WITH CHECK (brandbase.can_reach(brand_id));

-- 0002's grant reached only the tables that existed then. The moves only read these.
GRANT SELECT ON brandbase.moodboard_boards, brandbase.moodboard_posts TO pack_runtime;
