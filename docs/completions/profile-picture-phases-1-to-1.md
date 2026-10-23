# A person's own profile picture: as built

Plan: `profile-picture-plan.md`. Branch `feat/profile-picture`, from `main` at `9df144e`.
brandbase 1.9.0, migration `0017_avatar.sql` (not applied to production).

## Phase 1: the photo on the core, `/profile` and the header

### What changed

- **Pack 1.9.0.** Migration 0017 adds `users.avatar` (nullable text), the table
  `avatar_uploads` (the keys the core made for each person's picture; forced row rules, the
  caller's own rows only; `pack_runtime` may SELECT and INSERT), an UPDATE policy on `users`
  (`id = caller()` both ways) and `GRANT UPDATE (avatar)` only. No admin path: an owner of the
  person's company cannot change the person's row.
- **Moves.** `account.avatar_upload {mime, bytes}` is an upload move: JPEG, PNG or WebP, 1 byte to
  5 MB; it records the core's key for the caller and answers the signed write URL and the stable
  address. `account.avatar_set {src | null}` sets the caller's picture to an address whose key is
  in `avatar_uploads` for the caller (`account.avatar_issued`, 400 `BAD_AVATAR`), or removes it.
  It keeps only the address's path on the core (`/files/<signature>/<key>`), never a host;
  web-next puts its own core address in front.
  Both are for a person only (`account.avatar_by_a_person`, 403 `PERSON_ONLY`) and an active
  account. `account.me` answers `user.avatar` unchanged (the users row less `role`).
- **Pack tests** (`tests/avatar.json`, 9 cases): the upload and its key; set own as its path,
  another host dropped, and `account.me` answers it; remove; another person's upload refused, and no person from the
  input; an address the core did not issue (a media key, no `/files/` part, a query, another
  scheme, empty); another type or over 5 MB; an agent, for both moves; no account and a
  deactivated one; the wall itself under `pack_runtime` (an owner cannot change a member's row,
  no other column, no row for another person in `avatar_uploads`, no delete).
- **web-next.** Routes `POST /me/avatar` and `PUT /me/avatar`. `remote.ts`: the account's
  user carries `avatar`; `uploadAvatar(picture)` makes the record, PUTs the bytes to storage and
  sets the picture (a failed PUT sets nothing); `removeAvatar()`. Both tell the user listeners,
  so the header follows at once.
- **`/profile`.** The photo or the initials (64 px) beside "Upload photo", and "Remove photo"
  when there is one. A chosen file opens `features/account/avatar-crop.tsx`: the square under a
  round mask, drag to move and a zoom slider, on the publish crop's own model (`Crop`, `nudge`,
  `Framed`); "Save photo" draws a 512×512 JPEG on a canvas (`squareOf`, the inverse of `Framed`)
  and uploads it, with "Uploading…" on the button; an error shows in the page's red line and the
  crop stays open. A file the browser cannot decode (a HEIC on most desktops) says so.
- **The header.** The account menu's avatar shows the photo (`ProfilePicture`), else the
  initials as before.
- **Static demo.** Unchanged: `/profile` answers 404 and the header keeps the demo initials.

### Checked

- Playwright against a stub core (desktop and phone): the page with no photo, the crop after a
  zoom and a drag, the page with the photo, the header with the photo and its menu. The stub
  saw `account.avatar_upload {"mime":"image/jpeg","bytes":70157}`, the PUT of those bytes, then
  `account.avatar_set` with the answered address; the saved picture is the square the mask
  showed, and it is back after a reload.
- Found in that run: under React's development double effect, the cleanup revoked the first
  blob URL and that image's `onerror` closed the crop. The cleanup now detaches the handlers
  before it revokes.
- `core test brandbase 1.9.0` on a throwaway Postgres 18: 185/185.

### Left

- The pack cannot check an address's signature (it holds no secret). A forged signature on the
  person's own key is kept, and the core's `/files` answers 404 for it: the person's own
  picture breaks and falls back to the initials. No other host can be kept.
- Storage keeps a replaced or removed picture's file, and `avatar_uploads` keeps its row, as for
  `media`. On Supabase the 5 MB cap is the move's check on the declared size; the bucket's own
  limit is the hard cap.
- The drag has no keyboard control (as the post's crop); the zoom slider has.

### Review (Opus and Sonnet panel on the staged diff)

Both found nothing serious and confirmed one low finding: `account.avatar_issued` checked the
key but not the host, so a person could keep their own key under another host (a tracking
picture, once others see avatars). Fixed: `account.avatar_set` keeps only the path on the core,
and web-next builds the address from its own core URL; a pack case sets an address with another
host and reads back the path. Also fixed (Sonnet): focus moves to Cancel when the crop opens and
back to Upload photo when it closes. Not changed: no keyboard drag in the crop (as the post's
crop; the lint rules refuse key handlers on the `img` role), and the slider moved mid-drag on a
touch screen takes the zoom from the drag's start.

## Production steps

The core server needs no redeploy: this branch changes no core code, only pack data and
web-next. In this order, with `DATABASE_URL` for `brandbase-db` and a `core login`, as for
1.8.0:

1. `core publish packs/brandbase`
2. `core test brandbase 1.9.0` (185/185 expected)
3. `core migrate brandbase 1.9.0` (applies 0017)
4. `core promote brandbase 1.9.0`
5. Loadouts, since a loadout lists moves and the two new moves are in none:
   `core loadout <uid> brandbase all` for 5be3e065-6642-4cb7-8b41-7eff08dc7f41,
   8d6e2941-b838-4c7b-9559-1ae9c9bdeb3d, 57219232-3972-4007-9a7e-f6de1f060a3d and
   4eeb4afa-e202-48d2-bbba-b4e6f29a3be6.
6. Merge to `main`; Vercel builds the web app. Before the merge, the web app on `main` ignores
   `avatar`, so steps 1 to 5 change nothing visible.
7. Check: upload a photo on `/profile`, reload, see it in the header; remove it.
