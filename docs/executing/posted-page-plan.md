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

## Phase 2: core sync and readings (brandbase, about 2 days)

- A `post.sync` move: upsert by brand, channel and external id (`post_jobs.external_id` for posts
  Brand Base sent). It writes `permalink`, the cover (copied into Brand Base storage: Meta's CDN
  URLs expire), `metrics` and `measured_at`, and story rows with their frames and an expiry.
- A readings table: one reading per post per day, so an opened post can draw "Reach, by day".
  Meta gives totals per post, not a day series, so the chart grows from the day the sync starts.
- The core keeps a story's last reading for good: Meta returns nothing after 24 hours. A gone story
  shows "Gone after 24 h" with its counts kept.
- Account summary rows: Instagram followers, reach and follows over 30 days; Facebook followers.
- The web app needs no new shape: `metrics` already takes `reach`, and the ledger, the summary and
  the ranking read whatever counts a post has.

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
