# TikTok upload only: phases 1 to 3

Plan: `tiktok-upload-plan.md`. Branch `feat/tiktok-upload`, 2.41.0, brandbase 1.10.0.

## Phase 1: the pack (1.10.0)

- Migration `0018_tiktok_inbox.sql`: `brandbase.tiktok_sends` (one row per post, its latest send:
  a send id, the status, TikTok's publish id, the reason, who sent it), behind the brand wall
  (`reach`, as 0015); `brandbase.tiktok_video(post)`, the one video TikTok would get: a reel with
  exactly one item, a video the brand uploaded (its `media` row, found by the key in the item's
  address), MP4, MOV or WebM.
- `account.link`, `account.read`, `account.retoken`, `account.forget` take `tiktok`. Linking a
  TikTok account writes no `connections` row: `tt` stays not set up everywhere else.
- `post.tiktok_start` (internal): `brand.reachable`, `post.found`, `post.not_posted`,
  `post.tiktok_on` (TikTok among the post's accounts, on a day), `post.tiktok_linked`,
  `post.tiktok_video`, `post.tiktok_free` (no upload in the last 30 minutes, nothing TikTok is
  processing from the last 3). Marks the send `uploading` under a new send id; answers the id and
  the video's key, type and size.
- `post.tiktok_done` (internal): the named send only, while `uploading` or `processing`, so a late
  answer to an earlier send changes nothing. `post.tiktok_read` (internal).
- `brand.state` answers `tiktok` (`name`, `avatar`; never tokens) and `tiktokSends`.
- Tests: `tests/tiktok.json`, 8 cases (link and forget, a taken account, a send's whole life, the
  two windows, a late answer, a failure in words, every refusal, isolation and agents).

## Phase 2: the server (`packages/connect`)

- `tiktok.ts`: Login Kit for web (`https://www.tiktok.com/v2/auth/authorize/`, scopes
  `user.info.basic,video.upload`), `/v2/oauth/token/` for the code and the refresh (the new
  refresh token replaces the old), `/v2/oauth/revoke/`, `/v2/user/info/` (display name and
  picture). A sign-in without both scopes is refused and its grant revoked. The upload:
  `/v2/post/publish/inbox/video/init/` with `FILE_UPLOAD`, the file streamed from storage in
  10 MB chunks (a file under 10 MB whole), one 20-minute deadline; then
  `/v2/post/publish/status/fetch/`: `SEND_TO_USER_INBOX` or `PUBLISH_COMPLETE` is sent, `FAILED`
  is failed with TikTok's reason in words.
- `tiktok-routes.ts`: connect (state sealed to the person and the brand, ten minutes), callback,
  disconnect (revoke, then forget; a failed revoke still forgets), send, status. A send whose
  account is cut off or disconnected while TikTok processes it ends as failed with words. One
  refresh at a time per account, and the refreshed tokens kept in memory before they are stored.
- `GET /platforms` answers `tiktok: true` only with all three `TIKTOK_*` settings.
- Tests: `tiktok.test.ts`, 15 cases against a stand-in TikTok.

## Phase 3: the web app

- Connections: TikTok shows **Connect** once the server says it is set up ("Videos to the TikTok
  inbox"), then the account's picture and name, with Reconnect and Disconnect. Instagram and
  Facebook stay "Unavailable". A failed disconnect reloads the brand.
- `/connect/tiktok`: posts the code, reloads the brand, opens Connections. TikTok's `error`
  shows in words (`access_denied`, or TikTok's own description).
- A planned TikTok video post: the "TikTok inbox" card above the composer. "Sends the video to
  <name>'s TikTok inbox as a draft. Your team finishes the post in the TikTok app." Then
  "Sending to TikTok…", and "Sent to your TikTok inbox. Open TikTok to post it." A failure keeps
  TikTok's words with Try again; three minutes without TikTok's answer, or an upload that never
  finished, read as failed too. No account: Connect TikTok. Not one video: "Needs a video".
- An MP4 uploaded to the core no longer gets a guessed `.jpg` poster that shows broken; the
  browser shows its first frame (`posterOf`, demo files only).
- Tests: `tiktok-remote.test.tsx`, `tiktok-return.test.tsx`, `tiktok-inbox.test.tsx`,
  `core-routes.test.ts`.

### Checked in a browser

A local core with this branch's routes, the pack on a throwaway Postgres 18 and a stand-in TikTok
(its consent page, its API in memory; the video read from the core's disk), the web app on it,
Playwright at 1280 × 860 and 390 × 844: Connections with Connect, the consent page, the linked
account, the planned post with its card, Sending, and Sent.

## Review

Opus and Sonnet panel on the staged diff. No hole in the walls found. Fixed: a late answer to an
earlier send could overwrite a newer one (send ids); the card could hang on "Sending…" (a failed
or endless status check, an upload that stopped); the storage read's 5-minute timeout cut large
uploads (one 20-minute deadline, under the 30-minute window); a disconnect while TikTok
processed left the send waiting; the partial grant was not revoked; refreshed tokens are kept in
memory before the store; the return page dropped TikTok's `error` and failed on a reload error;
a failed disconnect showed the row off; an expired TikTok picture shows the logo; Send again after
a send.

Not changed: the send request stays open for the whole upload (seconds for a demo file; a very
large file could meet a proxy's idle limit); the refresh lock is in the process, which is right
for one machine (`fly.toml`); the picture is the one TikTok gave at sign-in.

## Deviations

- `FILE_UPLOAD`, not `PULL_FROM_URL`: see the plan, decision 2.
- No Direct Post; the composer still plans only.

## Production steps

The core needs a deploy: `packages/connect` (the image's host) has the TikTok routes. In order:

1. Publish, test, migrate (0018) and promote brandbase 1.10.0; then `core loadout <uid>
   brandbase all` for every person in Mission Group (three new moves).
2. `fly secrets set --stage` `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`,
   `TIKTOK_REDIRECT_URL=https://branding.missionsystems.ai/connect/tiktok` (all three: the server
   stops at start with only some).
3. Deploy the core. `GET /platforms` then answers `"tiktok":true`.
4. The web app from this branch (Vercel).
5. Check with the Sandbox target user: Connect, consent, linked account, Send to TikTok inbox,
   the draft in the TikTok app's inbox.
