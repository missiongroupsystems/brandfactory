-- A planned video post sent to the brand's TikTok inbox (Content Posting API, upload only): TikTok
-- keeps the video as a draft, and the team finishes the post in the TikTok app. Nothing is posted
-- from Brand Base. One row per post: its latest send. Only internal moves write it
-- (packages/connect, as the person who pressed Send).
CREATE TABLE brandbase.tiktok_sends (
  post_id text PRIMARY KEY REFERENCES brandbase.posts (id) ON DELETE CASCADE,
  brand_id text NOT NULL REFERENCES brandbase.brands (id) ON DELETE CASCADE,
  -- A new id for each send: a late answer to an earlier send of the post changes nothing.
  send_id uuid NOT NULL,
  -- uploading: the server is sending the file; processing: TikTok has it; sent: the draft is in
  -- the creator's inbox (or already posted from it); failed: see reason.
  status text NOT NULL CHECK (status IN ('uploading', 'processing', 'sent', 'failed')),
  publish_id text,
  reason text,
  sent_by text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- The wall, as 0015's.
ALTER TABLE brandbase.tiktok_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.tiktok_sends FORCE ROW LEVEL SECURITY;
CREATE POLICY reach ON brandbase.tiktok_sends
  USING (brand_id = ANY ((SELECT brandbase.reached())::text[]))
  WITH CHECK (brand_id = ANY ((SELECT brandbase.reached())::text[]));

GRANT SELECT, INSERT, UPDATE ON brandbase.tiktok_sends TO pack_runtime;

-- The one video TikTok would get for a post: a reel with exactly one item, a video the brand
-- uploaded (its media row, found by the key in the item's address), in a type TikTok takes.
-- Nothing when the post has none. The caller's row rules apply (invoker).
CREATE FUNCTION brandbase.tiktok_video(post text)
  RETURNS TABLE (storage_key text, mime text, bytes integer)
  LANGUAGE sql STABLE
  AS 'SELECT m.storage_key, m.mime, m.bytes
    FROM brandbase.posts p
    JOIN brandbase.media m ON m.brand_id = p.brand_id
      AND m.storage_key = substring(p.media -> 0 ->> ''src''
        FROM ''/files/[A-Za-z0-9_-]{43}/(brandbase/[0-9a-f-]{36}\.(?:mp4|mov|webm))(?:#video)?$'')
    WHERE p.id = tiktok_video.post AND p.format = ''reel''
      AND jsonb_array_length(p.media) = 1 AND p.media -> 0 ->> ''kind'' = ''video''
      AND m.kind = ''video'' AND m.mime IN (''video/mp4'', ''video/quicktime'', ''video/webm'')';

GRANT EXECUTE ON FUNCTION brandbase.tiktok_video(text) TO pack_runtime;
