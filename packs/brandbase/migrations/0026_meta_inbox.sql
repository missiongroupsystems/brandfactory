-- Comments and DMs from Meta's webhooks (docs/executing/meta-direct-plan.md, phase 4). A message
-- from the brand's Page or Instagram account linked through our own Meta app keeps what a reply
-- needs: the platform's own ids (the comment, or the person a DM came from) and the account it
-- came to. Messages made before have none. `reply_at` is when a reply through Meta was claimed:
-- a claim that never finished (the server stopped mid-send) frees the message after five
-- minutes. The row rules are the table's own (0013).
ALTER TABLE brandbase.inbox_messages ADD COLUMN external jsonb;
ALTER TABLE brandbase.inbox_messages ADD COLUMN reply_at timestamp with time zone;
