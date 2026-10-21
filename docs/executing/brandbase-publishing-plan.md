# BrandBase: posting for real to Instagram, Facebook and TikTok

Plan of 22 Oct 2026. Today a post's jobs go to `simulatedPublisher`, which marks every job live,
and the runner is off on a real database (`main.ts`). This plan makes the jobs post for real. The
platform facts come from `brandbase-accounts-integration.md` (7 Oct 2026); re-check them against
the live docs while building.

## What posts where

| Format              | Instagram                                           | Facebook Page                                                         | TikTok                                                                    |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Reel (one video)    | Reel                                                | Page video                                                            | Video: Direct Post, or an inbox draft when the sound is picked in the app |
| Carousel (up to 10) | Carousel; one item posts as a single photo or video | Photos as one post; with a video, refused (post the video on its own) | Refused: photo posts need a verified URL prefix (later)                   |
| Story               | Story, per frame                                    | Refused: Page stories later                                           | Not offered (the composer already never sends a story there)              |

With the post: the caption for that account (`textFor`), Instagram collaborators (up to 3, feed
and reels) and the first comment on Instagram and Facebook. Not yet: photo tags with positions,
location, the AI label. Instagram takes JPEG photos only; a PNG or WebP is refused with that
reason, not converted.

## Phases

### Phase 1: link Meta and TikTok per brand

Same shape as Pinterest (`routes/pinterest.ts`): `brand_accounts` gains the platforms `meta` and
`tiktok`; the tokens are sealed and bound to the brand and the account; an account belongs to one
brand (`UNIQUE(platform, account_id)`); the OAuth state names the user who started.

- **Meta.** Facebook Login for Business with a configuration id (`config_id`, no `scope`). The
  code gives a long-lived user token, then `/me/accounts` lists the Pages with their Page tokens
  (which do not expire) and Instagram business accounts. The person picks one Page; the server
  keeps that Page's token, its id and name, and the Instagram account's id and username. The
  callback answers with the Pages' names and a sealed choice (ten minutes, the person's user id),
  and `POST /meta/select` keeps the one picked: a Page token reaches the browser only sealed.
- **TikTok.** Login Kit for web: access token 24 hours, refresh token 365 days that rotates on
  each refresh (the new one replaces the old). The account is the `open_id`, named by its display
  name.
- The `ig`, `fb` and `tt` connection rows follow the accounts: linking Meta turns on `fb`, and
  `ig` when the Page has an Instagram account; linking TikTok turns on `tt`. They leave the generic
  connection keys, as `pinterest` did, so none is "connected" without tokens.
- Web: the Connections page and the composer's Reconnect start the real sign-in on the API;
  `/connect/meta` shows the Page picker, `/connect/tiktok` finishes TikTok.

### Phase 2: the publishers

`platformPublisher` replaces `simulatedPublisher` wherever the platform apps are set up. Per job:

- **Media.** Each item's `mediaId` names a `media` row; its storage key gives a signed URL for two
  hours. Media with no stored file (the demo's seed pictures) is refused: "Upload this media
  again".
- **Instagram.** One container per item (`image_url` or `video_url`, `REELS` or `STORIES`), a
  carousel container over them, then poll `status_code` until `FINISHED` and `media_publish`. The
  first comment follows with `/{media-id}/comments`.
- **Facebook.** Photos: `/{page}/photos` (unpublished for several, then one `/{page}/feed` post
  with `attached_media`); video: `/{page}/videos` with `file_url`. The first comment follows on
  the post.
- **TikTok.** `creator_info` first: the privacy picked must be one the account allows (an
  unaudited app allows only "Only me"), or the job fails with that reason. Then `FILE_UPLOAD` in
  chunks from storage, and poll the status until `PUBLISH_COMPLETE`, or `SEND_TO_USER_INBOX` for an
  inbox draft.
- **Runner.** Up to ten jobs on their way, topped up each tick, so a slow job never holds up the
  rest. One twenty-minute budget per job inside a thirty-minute stuck limit; a job an hour past
  its time is not posted. A platform's refusal becomes the job's error in plain words; a dead token
  says "Reconnect <platform>"; past the point where the post may exist, an error says to check the
  account before a retry. The job keeps the platform's post id.
- **On.** The runner runs on a real database once the publisher is real.

### Phase 3: the TikTok rules for Direct Post (needed for the audit)

TikTok's audit needs the composer to show the account's nickname from `creator_info`, offer only
the privacy options it returns, with none picked by default, and leave comments, duet and stitch
off by default. Decision 7 keeps the demo's defaults (Everyone, comments on); real posting will
refuse "Everyone" until the audit passes in any case. The owner decides this phase before the audit.

## Environment

`META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_REDIRECT_URL`, `TIKTOK_CLIENT_KEY`,
`TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URL`, with `TOKEN_ENCRYPTION_KEY`. Each platform's set is
all or none; without it, its routes answer 503 and its jobs fail with "<Platform> is not set up".

## Not in this plan

Scheduling on Facebook's side (our runner posts at the time instead), daily caps checked before
posting (the platform's refusal is shown instead), Meta's deauthorize and data-deletion callbacks
and TikTok's webhook (needed for App Review; `packages/connect` has them to copy), YouTube and
LinkedIn.
