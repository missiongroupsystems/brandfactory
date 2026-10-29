# Plan: the Posted page

## Why

A post's numbers belong beside the post, under its platform. Insights' Posts view listed them away
from the post, mixed across platforms. Posted is one page per platform: what went out, newest
first, with its counts as last read and the day they were read. Insights keeps what has no
platform: the overview across five sources, what worked, sentiment and creators (the hybrid in the
design's Insights note).

The design is the Claude Design canvas "Brand Base Posted page" (the recommended ledger, not the
alternative grid). The facts on what Make can read come from its feasibility board, a read-only
check of Make scenario 8248176 (team 3399177, eu1) on 29 Oct 2026.

## Phase 1: the page on the data the web app has (web only, 2.44.0)

No core change, no migration.

- `/posted`: the accounts rail (Instagram, Facebook, TikTok; the ones with posts or a linked
  account), the platform as the title, the last 30 days in one line (posts, stories, reach and
  likes, or views where no post has reach, over the posts that have numbers, with how many of
  how many when only some do, "as of" the latest reading), and a ledger of posts and stories in
  one time order. A story is a row of 9:16 frames: live with the hours left, or gone after 24
  hours. A post opens the existing poster, whose back link returns to Posted on that platform.
- What went out, from `brand.state`: a post with jobs, on the accounts whose job is live (an
  account planned beside them, such as TikTok, never lists it); a post with no job that reads
  posted, on all its accounts. That is an imported post, or one a person marked posted by hand,
  which lists as gone out though nothing sent it. Counts, `permalink` and `measuredAt` are the imported posts' (migration 0014).
  A post Brand Base sent has no counts and shows none. Facebook stories are not listed. A
  platform with nothing shows the empty state, with Connect or New post.
- "Newest" or "Top": Top ranks by likes, comments, shares and saves added up (a tie to the
  bigger reach or views), offered only when two posts have numbers; posts with none wait apart
  under "No numbers yet". It replaces the Posts view's ranking but is not the same one.
- Insights drops its Posts view: its "Most reach" and engagement-% ranking, the average divider,
  each post's pillar and its comment mood bar. Overview, Sentiment and Creators stay.
- The static demo shows invented counts on its archive posts, in the demo only.

### Layout change (2.45.1)

The ledger became the profile view, option A of the Posted layout options canvas: the rail stays
on desktop (tabs on a phone), then the brand's avatar, handle and 30-day totals with one "as of",
story rings, and a 3-column grid of 4:5 covers with one count each and every count on hover.
Month headings, the window sentence and per-row "as of" are gone; Newest and Top are icons.
The rules above are unchanged.

## Phase 2: core sync and readings (brandbase 1.13.0, 2.45.0), as built

Migration `0022_post_sync.sql`, two internal moves, four rules (and one for `post.import`) and one
server route. No new Fly
app, database or storage: the core's own storage keeps the covers.

- **Data.** `posts.expires_at` (a synced story's end), `posts.synced_at` (the read time of the
  newest reading a post of its own took its caption from), `brandbase.ig_shortcode(permalink)`,
  `post_readings` (brand, channel, external
  id, read at, post id, metrics as jsonb; key brand + channel + external id + read at, so the same
  reading twice is one row; the reach rule on brand like every brand table; deleted with its
  post), an index on `post_jobs (brand_id, channel, external_id)`, and `post_json` answering
  `expiresAt` and `syncedAt`. Nothing else new: a post made outside Brand Base is a posted post whose id is
  `<brand>-<channel>-<platform id>` (as `post.import` makes them), with `permalink`, `metrics`
  and `measured_at` from 0014 and its cover in `media`.
- **`post.sync`** (internal: no screen, MCP tool or guest reaches it). One brand, one channel
  (`ig` or `fb`), the account id, up to 50 items. Each item is matched in this order:
  1. a post Brand Base sent: its job on that channel is `live` with that `external_id`. It gets
     the counts and `measured_at`, and its `permalink` if it had none. Its caption, hook and media
     are never touched. Only its first account's counts are kept on the post (the account the web
     app shows counts for), so Facebook's never overwrite Instagram's; every account's reading is
     still kept in `post_readings`. A Facebook reel's job keeps the video id (Make's module 51
     answers `video_id`), so phase 3 sends the video id for a Facebook video or reel.
  2. on Instagram, a post of the brand's own (no job) with the same address's shortcode (`/p/`,
     `/reel/` or `/tv/`): one `post.import` brought in, or one the sync made from another id.
     The other way round, `post.import` refuses (`post.import_not_synced`, 409 `ALREADY_SYNCED`)
     an Instagram post the brand already has under another id with the same shortcode, and the
     importer skips it before it uploads a cover. So the Apify import and the sync never make two
     posts of one, in either order.
  3. otherwise its own post, made posted on the day and time it went out in the brand's zone:
     `post` and `carousel` are `carousel`, `reel` is `reel`, `story` is `story`; the hook is the
     caption's first line with letters (120 characters), else "Instagram reel" and the like.
  Two guards, each on its own time. The caption, address and story end of a post of its own are
  refreshed by a reading newer than `synced_at`, with counts or without; its hook and media never.
  The counts are replaced only by a reading with counts newer than `measured_at`; a reading with
  no counts changes no counts. Counts the platform did not give
  (missing or null) are left out, never 0. So the same batch twice changes nothing; an older
  reading arriving late is kept as a reading only. Two readings in one batch that land on one post
(the same id twice, or two ids with one shortcode): the newest wins, and the other is dropped
before the write. A
  story ends at `expiresAt`, or 24 hours after `postedAt`; it stays a posted post with its last
  counts after Meta stops answering. Answers `{made, updated, readings, covers}`, `covers` being
  the posts of its own that still have no media.
- **Rules.** `brand.reachable` (the caller's company), `post.sync_dates_valid` (every time a real
  date and time, `pg_input_is_valid`: `2026-02-30` passes the pattern and would otherwise fail
  the cast; 400 `VALIDATION`), `post.sync_linked` (the brand has that
  account linked through Make on that platform, and its company is on `make_orgs`),
  `post.sync_ids_fit` (each post id at most 71 characters, so its cover's id fits),
  `post.sync_read_past` (no reading dated more than 10 minutes after now, or before its post went
  out).
- **`post.sync_cover`** (internal): gives a post of its own, posted and with no media, its stored
  cover. A post Brand Base made, or one that has a cover, is left alone. `post.media_in_brand`
  checks the file is the brand's.
- **Route.** `POST /brands/:brand/make/readings` in `packages/connect/src/brandbase/readings.ts`
  calls `post.sync`, then copies the covers the answer lists, at most 8 per request
  (`MAX_COVERS`), four at a time: well inside Make's 300 s wait. Only a cover with an image
  address, and not of a story already gone, takes a place, newest first, so a text post never
  holds one; the rest are `left` for the next run. It skips a post whose id with the record's 9 characters
  does not fit the moves' 80. It reads the item's `thumbnailUrl` (else `mediaUrl`) from Meta's
  image hosts only (`*.fbcdn.net`, `*.cdninstagram.com`; https, no port, no redirect, 15 s),
  streamed and cut off past 8 MB, and keeps it only when its first bytes are the JPEG, PNG or WebP
  its type says. Only then does it make the file's record (`media.create`), upload to the signed
  write URL and call `post.sync_cover`. A cover that fails is logged and counted, the post keeps
  what it had, and the next run tries again; the batch never fails for a cover. Body at most 2 MB.
  The one orphan left: an upload or `post.sync_cover` that fails after `media.create` leaves an
  unused file record (and maybe its file); the next try makes a new one. A response it gives up on
  is cancelled, not left unread.
- **Migration locks.** 0022 does not set `lock_timeout`: `migrationProblem` refuses a `SET` and
  `set_config` in a migration (a pack must not change its session), and the runner sets none.
  Its locks are short: `ADD COLUMN` without a default on `posts` and an index on `post_jobs`
  (tens of rows). Run `core migrate` when no send is due.

### Auth: a key of its own, and an agent of an owner

Make has no person's session, and the core's walls are a person's (`brand.reachable` and every
table's reach rule read the caller's company). Decided:

- Make sends `x-make-apikey: <MAKE_READINGS_SECRET>` (32 characters or more), compared in
  constant time. It is not `MAKE_WEBHOOK_SECRET`: that key goes the other way (Brand Base to
  Make), and a key that only lets Make write readings can be changed on its own.
- The route runs the moves as the principal `MAKE_READINGS_AS` names, through the core's `as`
  (as the scheduler runs a send as the person who approved it), with `internal: true`. The
  principal is an agent of an owner of Mission Group, `<owner uid>/make`: the log names it apart
  from the person, it cannot approve or promote, and its loadout holds only `post.sync`,
  `post.sync_cover` and `media.create`. The owner's company bounds it: another company's brand is
  not found, and a brand of the owner's company takes only readings for the account it linked.
- Not chosen: running as the person who linked the account (`accounts.connected_by`): the route
  would read that row past the walls first, and Make needs one identity anyway. A principal that
  is no person reaches nothing under the reach rules. A token signed per request
  (`/agents/session`) needs the person's own sign-in.
- If the owner leaves the company, every reading is refused (404) until the setting names another
  owner's agent. Make's run shows the error.

### The contract phase 3 sends

`POST https://<core>/brands/<brand id>/make/readings`, one request per brand and account per run,
`content-type: application/json`, header `x-make-apikey: <MAKE_READINGS_SECRET>`.

```json
{
  "channel": "ig",
  "account": "17841400000000001",
  "items": [
    {
      "externalId": "17890000000000001",
      "kind": "reel",
      "postedAt": "2026-10-28T10:00:00+0000",
      "caption": "Fresh pasta tonight.",
      "permalink": "https://www.instagram.com/reel/DAbc123xyz/",
      "mediaUrl": "https://scontent-sin6-1.cdninstagram.com/…mp4",
      "thumbnailUrl": "https://scontent-sin6-1.cdninstagram.com/…jpg",
      "metrics": { "views": 5400, "reach": 3100, "likes": 210, "comments": 12, "shares": 9, "saves": 30 },
      "readAt": "2026-10-29T05:00:00Z",
      "expiresAt": null
    }
  ]
}
```

- `channel`: `ig` with the brand's Instagram account id, or `fb` with its Page id (as linked on
  Connections; digits only). The brand comes from the path; a `brand` in the body is ignored.
- `items`: 1 to 50. Split a bigger run.
- `externalId`: the id Make's create modules answer when Brand Base posts, so a sent post is found
  by it. Instagram: the media id. Facebook photo or post: the post id (`<page id>_<post id>`).
  Facebook video or reel: the video id (digits only; scenario 8248176's module 51 answers
  `video_id`), never the `<page id>_<post id>` that `ListPosts` gives for it, or a reel Brand Base
  sent shows twice.
- `kind`: `post` (one image), `carousel`, `reel` or `story`. Map Instagram `IMAGE` to `post`,
  `CAROUSEL_ALBUM` to `carousel`, `VIDEO` (feed or reel) to `reel`; stories from
  `ListUserStories` are `story`. Facebook posts are `post`.
- `postedAt`, `readAt`, `expiresAt`: ISO times with a zone (`Z`, `+00:00` or Meta's own
  `+0000`). `readAt` is when the
  scenario read the counts, at most 10 minutes ahead of the core's clock and not before
  `postedAt`. `expiresAt` only for a story, and optional.
- `caption`, `permalink`, `mediaUrl`, `thumbnailUrl`: optional, null allowed. `permalink` is an
  `https://(www.)instagram.com/` or `https://(www.)facebook.com/` address. For Facebook send
  `full_picture` as `mediaUrl`.
- `metrics`: any of `views`, `reach`, `likes`, `comments`, `shares`, `saves`, whole numbers 0 or
  more; leave out (or null) what the platform did not give. Facebook: `likes` is the reactions'
  `totalCount`, `shares` is `shares.count`, `comments` the comment count. No other key.
- Answers `200 {made, updated, readings, covers: {copied, failed, left}}`; `left` covers wait for
  the next run. Refusals: `401` wrong key,
  `400 VALIDATION` with the field, `404 NOT_FOUND` a brand the owner's company does not hold,
  `409 NOT_LINKED` an account that is not the brand's linked one, `422 READ_IN_FUTURE`, `413`
  over 2 MB, `503 PLATFORM_OFF` when the server has no key set.

### Not in phase 2

- The account summary rows (followers, 30-day reach): no table yet; phase 3 can read them, and
  they need their own move.
- A list of linked accounts for Make to read: phase 3 keeps the brand ids and account ids in a
  Make data store, typed once (the same ids as on Connections), until an endpoint is worth it.
- TikTok (needs `video.list` and a new sign-in) and Facebook stories (no Make module).
- Known cases where one post shows twice:
  - a post marked posted by hand: it has no job id, so the sync does not find it;
  - a post Brand Base sent whose job went live with a null `external_id` (Make answered an id past
    2^53 as a number, `make.ts`), so nothing matches it;
  - a Facebook reel or video read back by its `<page id>_<post id>` instead of its video id.
  Each is rare; the person can delete the extra one.

## Phase 3: a Make read-back scenario (about 1 day)

One new scheduled scenario, "Read back", read-only on Meta. It does not edit scenario 8248176.

- Per connected brand: Instagram `GetUserMedia` (caption, media type, media URL, thumbnail,
  permalink, timestamp, likes, comments), then `GetMediaInsights` per post (reach, saves, shares,
  views, profile visits; the metric list depends on the media type), last 25 posts only.
- Instagram stories: `ListUserStories` and `GetMediaInsights` (reach, replies, taps forward,
  exits), every hour, so each story is read inside its 24 hours.
- Facebook posts: `ListPosts`, then `GetPostReactions.totalCount`, `GetPost.shares.count` and
  `ListComments` (2 to 3 calls per post). No reach or impressions: Make's `facebook-insights` app
  covers ads only; reach needs our own Meta app with `read_insights`.
- Account summary: `GetUserInsights2` and `GetUserData` (Instagram), `GetPageInfo.fan_count`
  (Facebook), daily.
- Each run posts to a core webhook, which calls `post.sync`.

Limits:

- Make holds one Facebook login (Mission Group's). Read-back reaches only the Pages and Instagram
  accounts that user admins, the same limit as posting (migration 0020).
- About 1 + N Make operations per platform per run. Hourly for stories and daily for posts keeps a
  brand under about 1,000 operations a month.
- On demand alone would miss stories. A schedule, plus a refresh on open when the reading is older
  than an hour, covers both.
- Facebook stories have no Make module; they need a Meta app with `pages_read_engagement`. Until
  then Posted lists none.
- TikTok needs the `video.list` scope (today's sign-in asks `user.info.basic` and `video.upload`
  only, `packages/connect/src/brandbase/tiktok.ts`) and each brand to sign in again. TikTok has no
  stories API. Until then TikTok lists the imported posts with their import counts, and posts
  marked posted with none.

## Later

- The poster's Analytics preview becomes "Reach, by day" from the readings.
- A story row opens its frames and counts (the design's phone sheet), once stories carry counts.
