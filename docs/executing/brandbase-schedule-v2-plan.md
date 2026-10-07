# BrandBase Schedule v2: plan

Status: planned 2026-10-07, not started. Prototype due 3:00 PM the same day for the marketing
meeting. Branch `feat/brandbase-mvp`, package `packages/web-next` (UI-only demo, static data).

## Why

The 7 Oct design review with David made scheduling the core of the product. The aim is
Brandwatch's scheduling functionality (Danny's screen export, `~/Downloads/screens`, and his
observational report), in our design language, with a calendar that is more intuitive than
Brandwatch's per-platform split. Insights and Ideate stay in the nav but are not worked on.

## Decisions

From the meeting:

- The month view shows a platform icon and a post count per day, never thumbnails (one day held 28
  Instagram images).
- The week view, filtered per brand, carries thumbnails. Judge clutter on screen.
- Month, week and day views. A stage filter sits as a second icon beside Layers, not in a sidebar.
- "Create post" and "Create campaign" are two actions.
- The right-side Publish sheet is replaced by a full-page post scheduler.
- At most five nav items, no sub-navigation: everything here lives on the one Schedule page.
- "By format" on Ideate is renamed "Current ideas".

From Pranav's answers (7 Oct):

- Brand filter: the header brand switcher gains "All brands" and multi-select. No second brand
  control on the calendar.
- Stages (revised 7 Oct): Brandwatch's four, Draft, Awaiting approval, Scheduled, Posted, plus
  Failed. Filming and Editing were dropped as redundant.
- Per-platform fields: one page, shared fields once, then one collapsed row per selected channel.
  Marketing decides the final shape at the meeting.
- Ideate and Insights tabs stay as they are.

## Brandwatch, filtered

What the screens show, and what we take.

| Brandwatch | Take? | Our version |
| --- | --- | --- |
| Calendar Month: per-day icon chips with counts (IG 16, FB 1), red error count | Yes | Same idea, our chips; failed count in red |
| Calendar Week: day columns, cards with thumbnail, network badge, status, time; "Add post", "Add campaign" per day | Yes | Day columns, thumbnail cards, brand dot when several brands are shown |
| Home "Your posts": channels × days strip with thumbnails | Partly | Not a view; informs the week view's density |
| Day view | No (absent) | Ours: hour rail with the brand's best-time band |
| Filter wall: Channel, Team, Author, Network, Channel group, Placement, Approver, Promotion, State; Match all/any; labels search; sort | Partly | Stage filter + brand switcher + channel toggles inside the stage popover; no Match all/any, no Team/Author |
| Content lists: All, Draft, Awaiting approval, Scheduled, Processing, Publishing errors, Published, Shared externally | Partly | The stage filter covers it; no separate list pages (David: no sub-nav) |
| Share calendar link, export CSV/XLS, density (standard/compact) | Later | Not in the prototype |
| Composer: type tabs (Post/Story/Reel; Status/Reel/Album on FB), caption with AI, media (up to 10), first comment, location, tag users/partner/products, AI label, Hub App, channels, labels, schedule with ranked best times + mini calendar, promote, targeting, approvers, internal/external notes, preview mobile/desktop/grid | Yes | Full page, see Phase 5 |
| Content pool, link in bio, approval templates, notifications, Advertise | No | Unused by the team (competitor brief) |

## Data shape

Today: each brand's October is a `Week[]` on Casa Vostra's skeleton (same days for all three),
posts carry one `format` and no channels, and a day's stories are one `StoryMark`.

Changes:

- `Post.channels: ChannelKey[]` (`ig`, `tt`, `yt`, `li`, `fb`) and `Post.time` read from `slot`.
- Story volume per day per channel, so month counts look like a real account:
  `Day.storyCount?: Partial<Record<ChannelKey, number>>` (IG mostly, FB mirrors some). Generated
  once, deterministically, per brand.
- A `failed` stage for publishing errors (two seeded posts, one per brand that has them).
- All brands: the store keeps `brandIds: BrandId[]` (the selection) beside `brandId` (the primary
  brand, still used by Ideate, Insights and the brief). Schedule merges the selected brands' weeks
  day by day; every post keeps its brand id for the badge.
- Campaigns: `Campaign { id, name, brandIds, start, end, colour }`, drawn as a band like the
  events layer.

October keeps its planning logic (drag, shoot brief, `planPost`). Other months stay view-only, as
`month.ts` does today.

## Phases

Ordered for the 3:00 PM prototype: 1–4, 6 and 6b must land; 5 lands as far as time allows; 7 is
a follow-up deliverable. Build order: 0, 1, 2, 3, 4, 6, 6b, 5.

### Phase 0. Baseline

Commit the uncommitted work (Geist font, months, references) so this phase starts clean. Needs
Pranav's go-ahead.

### Phase 1. Data

1. Add `channels` to every post; write the story counts and two failed posts.
2. Add `brandIds` and "All brands" to the store and the header switcher (multi-select checkboxes,
   "All brands" on top). Other pages use the primary brand.
3. Tests: merged weeks hold every selected brand's posts once; counts per channel add up.

### Phase 2. Calendar shell

1. Header: ‹ › Today, the range, and a Month · Week · Day segmented control (Week first, per the
   meeting).
2. Beside Layers: a Stage icon. Its popover lists the seven stages with their colours and counts,
   then channel toggles. A badge shows how many are filtered out.
3. "Create post" and "Create campaign" as a split button where "Schedule new post" is today.

### Phase 3. Month view

1. Each day: one chip per platform with its icon and count (posts + stories), Failed in red.
2. Campaign and event bands stay. Clicking a day opens it in the Day view.

### Phase 4. Week and Day views

1. Week: seven day columns; cards sorted by time, each with thumbnail, platform icons, stage dot
   and time; a brand dot when several brands are shown; "+" at the foot of each day. Story counts
   as one compact row per day, not one card per story.
2. Day: an hour rail from 07:00 to 24:00, cards at their time, the brand's best-time band from
   Insights, stories as a strip at the top.
3. Drag between days and times in October, as today.

### Phase 5. Composer: one post, every platform (UI only)

**The difference from Brandwatch.** In Brandwatch you pick one network first, write the post, and
copy it by hand for every other network ("it is not possible to create and publish a post to
multiple networks at the same time"). Our composer is platform-agnostic: one post, any mix of the
brand's accounts, shared fields written once, and only what a platform truly needs asked per
platform.

What Brandwatch's composer does, and where it lands in ours (`/post/new`, `/post/<id>`):

| Brandwatch | Ours |
| --- | --- |
| Create post → pick a network tab → tick accounts (connected / disconnected, fan count) → "Create Facebook post" | One **Accounts** row of the brand's accounts across every platform, ticked together; a disconnected one offers Reconnect |
| Post type tabs per network (IG Post / Story; FB Status / Reel / Album) | One **Format** choice (Post · Reel · Story); an account that cannot take it greys out and says why |
| Caption with character count, emoji, Iris AI | One caption with **Draft with AI**; tabs per account to override its text; a live limit per platform (IG 2,200, TikTok 2,200, YouTube title 100, LinkedIn 3,000, Facebook 63,206) |
| Add media: up to 10 images or videos (FB: one GIF or one video; Reel: one video; Album: images only) | One media tray: upload or pick from the brand's library, reorder, remove; the format sets what it takes |
| Add first comment, Add location, Tag users / partner / products, AI label | **Details**, shown only for the accounts that use each: first comment (IG, FB), location (IG, FB, defaults to the venue), collaborators (IG), AI label (all) |
| Per-network extras: FB targeting, Promote / boost, Hub App | **Per-account settings**, one collapsed row each: TikTok (who can watch, interactions, promotion, consent), YouTube (title, made for kids, visibility), Facebook (audience), LinkedIn (visibility), Instagram (share reel to feed). Promote is out of scope |
| Labels | Internal labels (chips) and campaign |
| Schedule: Add to queue, best times to post ranked with bars, mini calendar | **When**: Publish now · Schedule · Save as draft; a month picker and a time, with the brand's best times ranked with bars, one click to use |
| Approvers | **Approval**: needs approval, and from whom (Chef Marco, Chun) |
| Collaboration panel: internal / external notes | **Notes** panel beside the preview, internal and external |
| Preview: approximate, per network, grid / desktop / mobile | Sticky preview with a tab per ticked account and Mobile · Grid (IG); the phone mocks we have |
| Header: Back, Go to calendar, status badge; footer Delete, Share, Copy, Publish | Header: back to Schedule, status, Notes, Save draft, the primary button (Schedule on 3 / Publish to 3 / Send for approval) with what still blocks it |

Demo limits (UI only): a composer post keeps its hook, first image, accounts, day, time and stage on
the calendar, but not its full caption, other media or per-account settings; "Send for approval"
saves it as Awaiting approval.

After the button: each account's outcome (scheduled, uploading, live, failed with Reconnect), and the
calendar shows the post at its date, time and stage.

**API note for when this is real** (research, 7 Oct). The UI is one post; the back end is one job per
account, because every platform publishes differently:

- Instagram, Instagram Stories and TikTok have no native scheduling: our worker publishes at the time.
  Facebook (`scheduled_publish_time`, up to ~30 days) and YouTube (`publishAt`, private only) can be
  scheduled natively. LinkedIn accepts only an immediate post.
- Stories cannot carry stickers or links through the Instagram API, so a Story with those needs a
  "publish on phone" reminder (Brandwatch's Hub App).
- TikTok: unaudited apps post private-only to at most 5 users; privacy has no default and must be
  picked; the music consent line is required. TikTok's guidelines reject team-upload utilities,
  so TikTok may stay manual.
- YouTube: a title is required (≤100), made-for-kids must be answered, unverified projects upload
  private, and the insert quota is about 100 a day. There is no "Short" flag; ≤3 min and vertical
  makes one.
- Limits differ (IG 50–100 API posts a day, FB 30 Reels a day), media rules differ (IG JPEG only,
  durations), and a partial failure is normal: one account can fail while the rest go out, so each
  account keeps its own status and retry.

### Phase 6. Ideate rename

"By format" → "Current ideas".

### Phase 6b. Moodboard (built in the demo, 7 Oct)

"Pinterest" on Ideate became **Moodboard**: one board for everything a brand saved, from that
brand's own Pinterest, Instagram and TikTok. One connect screen offers the three side by side (the
same mock sign-in as Pinterest had); once one is connected, the others appear as "Add Instagram" /
"Add TikTok" chips. Folder chips (Pinterest boards, Instagram "Saved", TikTok "Favourites") filter
the board; "All" deals the folders in turn so every source shows near the top. Each tile carries
the source's logo under its caption. "By format" became **Current ideas**.

**Implementation rule: a moodboard reads only the active brand's own accounts.** Casa Vostra's
moodboard is Casa Vostra's Pinterest, Instagram and TikTok, never Temper's. When the app is built:

- Store each connection (OAuth token, account id) on the brand, not on the user. A marketer who
  manages three brands holds three separate connections, never one shared one.
- Every sync job and every API call takes the brand id and loads that brand's token; there is no
  fallback to "the user's" account.
- Saved references are keyed by brand id; a query never joins across brands. A test asserts that
  syncing brand A never writes a row for brand B.
- The connect screen names the brand ("Casa Vostra's own accounts only") so the person connecting
  sees which account they are linking.

**Feasibility (checked 7 Oct 2026):**

| Source | Saved folders readable? | Production route |
| --- | --- | --- |
| Pinterest | Yes: boards and pins of the brand's business account (`GET /v5/boards`, `GET /v5/boards/{id}/pins`, scopes `boards:read`, `pins:read`) | Trial app now, Standard access for production. Store pin ids and notes only, load images live, link each pin back to Pinterest, do not imitate Pinterest's design ([boards](https://developers.pinterest.com/docs/api/v5/boards-list/), [guidelines](https://policy.pinterest.com/en/developer-guidelines)) |
| Instagram | **No.** The IG User API has no saved or collections edge; bookmarks are private activity ([IG User](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user)) | Paste a post link (shown via oEmbed), plus Business Discovery for named accounts the team watches |
| TikTok | **No.** The official API lists only the account's own public videos (`/v2/video/list/`, scope `video.list`); there is no favourites or collections endpoint ([List Videos](https://developers.tiktok.com/doc/tiktok-api-v2-video-list)) | Paste a video link (TikTok oEmbed). Third-party scrapers that read collections break TikTok's terms |

So in production the Instagram "Saved" and TikTok "Favourites" folders fill by pasting links (the
paste box already sits above those folders); only Pinterest syncs by itself. The demo shows the
target experience and the meeting should hear this caveat.

### Phase 7. Per-platform field list (after the prototype)

A table of field × platform (required / optional / not available) and the shared-vs-per-platform
split, for David to hand marketing at 3:00. The research is done (platform docs and Danny's report,
7 Oct): shared fields are caption, media, time, location (IG feed, Reel and FB only, default the
venue), first comment (IG and FB) and AI label; per-platform are the format tab, IG collaborators,
user and product tags, FB targeting, TikTok privacy (no default), interaction toggles, commercial
disclosure and music consent, YouTube title, made for kids and privacy, LinkedIn visibility, and
Pinterest board. Instagram, Instagram Stories and TikTok have no native scheduling, and Stories
cannot carry stickers or links through the API, so a "publish on phone" path stays (Danny's report).

## Verification

- `pnpm` gate as in `CLAUDE.md`, plus Playwright screenshots of Month, Week and Day with one brand
  and with All brands, the stage filter, and the scheduler page.
- Safari (WebKit) pass on the week view, given the masonry bug earlier today.

## Out of scope

Bubbles assistant, campaign targets in Insights, real network APIs, approval links, export,
saved filters, the Pinterest canvas idea.
