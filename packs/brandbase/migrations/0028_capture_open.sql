-- Capture with no LINK code (docs/executing/meta-capture-plan.md, the owner's change of 18 Nov):
-- anyone who DMs a reel or a post to the capture account adds it, and the webhook's principal
-- saves it to a brand of its own company. A capture keeps who sent it (their Instagram name and
-- @handle) and, when one is found, the post's own address on Instagram. Linked people are no
-- longer needed: a capture's person may be empty. The link tables stay, unused.
ALTER TABLE brandbase.captures ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE brandbase.captures ADD COLUMN sender_name text NOT NULL DEFAULT '';
ALTER TABLE brandbase.captures ADD COLUMN sender_handle text NOT NULL DEFAULT '';
ALTER TABLE brandbase.captures ADD COLUMN permalink text;
