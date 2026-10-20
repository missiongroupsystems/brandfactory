-- A brand's moodboard is read by brand, as ideas_brand and inbox_brand serve theirs.
CREATE INDEX moodboard_boards_brand ON brandbase.moodboard_boards (brand_id);
CREATE INDEX moodboard_posts_brand ON brandbase.moodboard_posts (brand_id);
