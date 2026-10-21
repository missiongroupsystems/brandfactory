# BrandBase publishing: phases 1 to 3

Built on `feat/brandbase-backend` from `docs/executing/brandbase-publishing-plan.md`. Nothing is
deployed and no production database was touched.

## Phase 1: link Meta and TikTok per brand

Landed 22 Oct 2026 (2.16.0).

**Server.** `brand_accounts` takes the platforms `meta` and `tiktok` and gains `details` (the
Page's Instagram account; migration `0003_minor_miss_america`). `meta.ts` and `tiktok.ts` are the
platform clients; `routes/accounts.ts` the routes: `POST /brands/:id/{meta,tiktok}/connect`,
`POST /meta/callback` (the person's Pages, with a sealed choice), `POST /meta/select`,
`POST /tiktok/callback`, `DELETE /brands/:id/{meta,tiktok}`. The state names the user who started;
the callback checks the brand again; an account another brand holds answers 409, also when two
finish at once. `ig`, `fb` and `tt` are read from the linked accounts (`publishingOf`): `fb` with
a Page, `ig` when the Page has an Instagram account, `tt` with a TikTok account. The state and the
send route both read them so, so an older row saying "connected" can never stand for tokens that
are not there; the generic route and the seed no longer set them. TikTok's disconnect refreshes
the token when it is near expiry, revokes at TikTok, and forgets the account even when the revoke fails or the tokens no
longer open. The state names the accounts (`meta`, `tiktok`), never their tokens.

**Web.** `features/connections/accounts.ts` holds the calls. On the API the Connections page and
the composer's two Reconnect buttons start the real sign-in; `/connect/meta` lists the Pages to
pick from and `/connect/tiktok` finishes TikTok; both then go back, on the brand the sign-in
started from, to the page it left (Connections, or the post being retried). A new post that was
never saved loses its unsaved text when the sign-in leaves the page. The rows show `@instagram`, the Page's name and the TikTok name;
disconnecting Instagram or Facebook says it takes both.

**Verified.** Gate (see the changelog). Server tests against a fake Graph API and a fake TikTok:
the dialogs' parameters, Pages offered with no token in the reply, the pick kept and sealed to its
row, a Page with no Instagram account, no Pages, a link or a pick finished by another user, a Page
or a TikTok account another brand holds (also two picking one Page at once; the test fails
without the unique-index mapping), disconnect, a revoke that fails, tokens that no longer open, an
older "connected" row with no account behind it (the send asks to reconnect, the state says off),
the generic keys refused, 503 without the apps. In a browser on a local API with placeholder keys: Connect
Instagram leaves for Meta's dialog with the configuration id and redirect; the Page picker (with
the API's answers stood in for Meta's), then Connections naming `@temper.sg` and the Page; a
declined TikTok sign-in.

**Review.** Opus and Sonnet before the commit. Fixed from it: older "connected" rows could stand
for missing tokens (now derived from the accounts); a TikTok disconnect failed when the tokens did
not open; the sign-in always came back to Connections (now to the page it left). Left: re-linking
TikTok with another account does not revoke the old grant; two token refreshes at once may race
(phase 2 runs jobs side by side); Meta's `override_default_response_type` to check at the first
live sign-in.

**Not verified.** Nothing has run against Meta or TikTok: their apps do not exist yet.

## Phase 2: the publishers

Landed 22 Oct 2026 (2.17.0).

**Server.** `publish/` posts each job with the brand's own account: `index.ts` (`platformPublisher`)
picks the platform, `media.ts` turns the post's media into signed storage URLs (two hours) and
holds the waiting, `meta.ts` posts to Instagram and Facebook, `tiktok.ts` to TikTok.

- Instagram: a container per item (`REELS` for a single video, `STORIES` per story frame,
  `is_carousel_item` children under a `CAROUSEL`), a wait until each says `FINISHED`, then
  `media_publish`; collaborators (up to 3, the composer's "@" taken off) and the first comment.
  Photos must be JPEG.
- Facebook: one photo with its caption, several photos uploaded unpublished then one feed post with
  `attached_media`, or a video by `file_url`; then the first comment. Page stories and a carousel
  with a video are refused in words.
- TikTok: one video (MP4, MOV or WebM). `creator_info` first: a privacy the account does not offer
  is refused, naming what it offers (before the audit, "Only me"). Direct Post with the composer's
  answers (the creator's own disabled features stay off), or the inbox when the sound is picked in
  TikTok. The file streams from storage to TikTok as `FILE_UPLOAD` in 10 MB chunks (whole under
  10 MB), holding about two chunks at most, two uploads at once (a finishing upload hands its place
  to the next); then a wait for
  `PUBLISH_COMPLETE` (or `SEND_TO_USER_INBOX` for the inbox).
- **Honest failures.** A refusal the platform states becomes the job's error in its words, with any
  link taken out ("Instagram: …"); a dead or unreadable token says "Reconnect <platform> first.".
  Past the point where the post may exist (the publish call, the last TikTok chunk, TikTok's status
  checks), a lost answer, an answer with no id, or Meta's "unknown" or "unavailable" error says "<platform> may have
  posted it. Check the account before you retry."; a story names how many frames went out.
- **Time.** One budget per job, twenty minutes, covering every wait, the wait for an upload place
  and the upload itself (a TikTok job out of time before its upload starts says nothing was
  posted); every Meta and TikTok call stops after a minute; a status check every ten seconds
  (TikTok allows thirty a minute).
- **Runner.** `claimDueJobs` and `sendJob`: each tick tops up to ten jobs on their way, so a slow
  job never holds up the ones due after it. The stuck limit is thirty minutes, above a job's
  budget. A job an hour past its time is not posted ("missed its time. Nothing was posted; pick a
  new time"), so turning the runner on never sends old posts late; scheduling a time that passed
  over an hour ago is refused at once (`PAST_TIME`). Once a platform has the post,
  the job is never marked failed: a write that fails then is
  logged ("POSTED but not recorded") and the sweep later says to check the account; both writes
  touch only a job still `uploading`, and a post recorded after the sweep is logged ("POSTED after
  the sweep"). A stop waits for a claim under way, then up to four minutes for jobs on their way
  (`kill_timeout = 300` in `fly.toml`, Fly's maximum). The runner runs on a real database once Meta or TikTok is
  set up; with neither, the simulated publisher stays, locally only.
- A TikTok token is refreshed once per brand at a time, and the row is read inside the lock.

**Verified.** Gate (see the changelog). Twenty tests against stand-ins that record each request:
the exact Instagram, Facebook and TikTok calls for a photo, a reel, a carousel and a story;
collaborators sent without "@"; the wait before publishing; TikTok's answers, a 25 MB video
streamed in odd pieces and sent as two chunks with their ranges and exactly the stored bytes, at
most two uploads at once (fails with the limit raised), the inbox; each refusal; each "may have posted" path and a story that
stops part way; links kept out of the words; a swept job not overwritten; and a due job through the
runner, live on Instagram with its id and failed on TikTok with the reason. The tests for the
wait, the "may have posted" wrapper, the "@" and the guarded write each fail without their fix.

**Review.** Two Opus and Sonnet panels before the commit found no blocker. Fixed from them: the whole video in
memory on a 512 MB machine; failures after a post may exist worded as if nothing went out; "@" in
collaborators; one slow job holding up the rest; per-wait limits instead of one per job; a stop
cutting jobs off; the TikTok token row read outside the lock; inbox posts published at once; video
types; status checks above TikTok's rate; then, from the second panel, a job budget that left out
the upload, a claim under way at a stop, a third upload slipping past the limit, and two wordings;
then, from the check of those fixes, overdue jobs posting late when the runner first turns on, an
answer with no id taken for success, container calls past the budget, and a missing full stop.
Left: the first comment failing is only logged (failing the job would invite a second post); a
TikTok token read that outlasts a whole refresh could still use a rotated token (a reconnect
message, no post lost).

**Not verified.** Nothing has run against Meta or TikTok. TikTok's privacy default stays
"Everyone" (decision 7), so TikTok jobs fail with the reason until the audit passes or the post is
set to "Only me".
