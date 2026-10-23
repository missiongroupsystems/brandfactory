-- A person's own profile picture (docs/executing/profile-picture-plan.md).
ALTER TABLE brandbase.users ADD COLUMN avatar text;

-- The files the core made for each person's profile picture. The pack holds no signing secret,
-- so it cannot check an address's signature: account.avatar_set takes only a key listed here for
-- the caller.
CREATE TABLE brandbase.avatar_uploads (
  key text PRIMARY KEY,
  user_id text NOT NULL REFERENCES brandbase.users (id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE brandbase.avatar_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE brandbase.avatar_uploads FORCE ROW LEVEL SECURITY;
CREATE POLICY self ON brandbase.avatar_uploads
  USING (user_id = (SELECT brandbase.caller()))
  WITH CHECK (user_id = (SELECT brandbase.caller()));

GRANT SELECT, INSERT ON brandbase.avatar_uploads TO pack_runtime;

-- The wall: a person changes their own row only, and only its picture. No admin, no other row.
CREATE POLICY self_avatar ON brandbase.users FOR UPDATE
  USING (id = (SELECT brandbase.caller()))
  WITH CHECK (id = (SELECT brandbase.caller()));

GRANT UPDATE (avatar) ON brandbase.users TO pack_runtime;
