# Plan: a person's own profile picture (brandbase 1.9.0)

A signed-in person adds, changes or removes their own photo on `/profile`. It persists on the
core and shows in the header's account menu. Only the person sets it: no admin, no agent.

## What exists

- `/profile` (on the core only; the static demo answers 404) edits the name and the password.
- The header's avatar (`account-menu.tsx`) draws the initials from `onUser`.
- Upload moves (`"upload": {"type": ...}`, `files.ts`): the core passes a new key
  `brandbase/<uuid>.<ext>` as `:file`; the move answers `upload: {key, type}`; the core adds a
  signed write URL and the file's stable address `src`
  (`<core>/files/<signature>/<key>`). `media.create` is the model.
- `brandbase.users`: row rule `self` for SELECT only; `pack_runtime` has no INSERT, UPDATE or
  DELETE on it (0002).

## Pack 1.9.0, migration 0017

1. `ALTER TABLE brandbase.users ADD COLUMN avatar text` (nullable).
2. `brandbase.avatar_uploads (key text primary key, user_id, created_at)`: the keys the core made
   for each person's avatar uploads. Forced row rules, `user_id = caller()` both ways;
   `pack_runtime` gets SELECT and INSERT. The pack holds no signing secret, so it cannot check a
   `src` signature; this table is how `avatar_set` knows the core issued the file for this person.
3. The wall on users: a policy `FOR UPDATE USING (id = caller()) WITH CHECK (id = caller())`, and
   `GRANT UPDATE (avatar)` only: the runtime role can change no other column and no other row.

## Moves

- `account.avatar_upload {mime, bytes}`: an upload move. `mime` is `image/jpeg`, `image/png` or
  `image/webp`; `bytes` is 1 to 5 242 880. It records the core's key for the caller and answers
  `upload` (signed URL, headers) and `src`.
- `account.avatar_set {src | null}`: sets or removes the caller's photo. A `src` must have the
  stable-address shape, and its key must be in `avatar_uploads` for the caller. Answers
  `{avatar}`.
- Both: `account.exists`, `account.active`, and a person-only rule `account.avatar_by_a_person`
  (`:agent is null`, 403 `PERSON_ONLY`), as `post.import_by_a_person`.
- `account.me` answers `user.avatar` with no change (it answers the whole users row less `role`).

Pack tests (`tests/avatar.json`): upload records the key for the caller; set own; the src of
another person's upload refused; an agent refused (both moves); wrong type and too large
refused; a src the core did not issue for the person refused (unknown key, wrong shape); remove;
the wall itself (a direct UPDATE of another row or another column refused under the runtime
role); a person with no account answers 404.

## web-next

1. Routes: `POST /me/avatar` to `account.avatar_upload`, `PUT /me/avatar` to
   `account.avatar_set`.
2. `remote.ts`: the account's `user` gets `avatar`; `uploadAvatar(blob)` (upload move, then PUT
   the bytes, then `avatar_set`) and `removeAvatar()` both update the listeners.
3. `/profile`: a 64 px round photo or initials at the top, "Upload photo" (a hidden file input)
   and "Remove photo". A chosen file opens a square crop: drag to move, a slider to zoom, on a
   canvas, no new dependency. "Save" draws a 512×512 JPEG (canvas `toBlob`) and uploads it.
   Progress as "Uploading…" on the button; an error in the page's red line.
4. The header avatar shows the photo when set, else the initials (`ProfilePicture`).
5. Static demo: unchanged (no `/profile`, the demo initials).

Tests: the profile upload flow sends the move calls in order with the right input; remove sends
`src: null`; the header shows the photo; routes map.

## Release (not done in this branch)

The core server needs no redeploy: no core code changes. Order: publish, test, migrate, promote
1.9.0, then `core loadout <uid> brandbase all` for each person, then merge for the web app.

## Risks

- Storage enforces no size on a Supabase signed upload; the 5 MB cap is the move's input check
  on the declared size. The browser sends a 512×512 JPEG, far smaller.
- A replaced or removed photo's file stays in storage (no delete step), as for `media`.
- The pack cannot check a `src` signature. `avatar_set` keeps only the path on the core
  (`/files/<signature>/<key>`), so no other host is kept; a forged signature only breaks the
  person's own picture (the core answers 404). Added after the review.
