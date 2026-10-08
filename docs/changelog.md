# Changelog

Latest releases at the top. Each version has a one-line entry in the index below, with full detail further down.

## Index

One line each — full write-ups are under the matching `##` heading further down.

- **2.3.1** — 2026-10-08 — A phone pass: no page scrolls sideways at 320–430 px; the calendar toolbar wraps, Month fits seven days, the Day card and the menus stay on screen; the shoot brief opens an idea as a bottom sheet; a tap shows a chart value; touch screens see the controls that appear on hover, and phones get 16 px fields so iOS does not zoom. No migration. 82 tests.
- **2.3.0** — 2026-10-07 — Insights becomes one calm column with a pill switch like Ideate's: Overview (a summary line, one number at a time over twelve weekly bars, what worked as rows that open to their chart and idea, the best time to post), Posts and Creators. No migration. 82 tests.
- **2.2.1** — 2026-10-07 — Every demo photo is replaced with a sharp version (short side at least 1000 px, was 272–750), from the same Unsplash photo where the source was recorded and a matching free Unsplash photo where it was not; a check of every image on every page at 2x finds none under-resolved. No migration. 82 tests.
- **2.2.0** — 2026-10-07 — The composer's best times become an hourly bar chart for the picked day (best hour in green, a bar sets the time); the send button reads "Schedule on" or "Post on" with each account's logo; every Current ideas card is 4:5; images ask next/image for enough pixels to stay sharp on 2x screens. No migration. 82 tests.
- **2.1.0** — 2026-10-07 — Current ideas shows one idea at a time (photo, hook, why, "Plan it", "Sharpen") with a strip of thumbnails to move between ideas and the moments ahead, so it no longer reads as a second calendar; a failed post's retry starts on the account it failed on only and names its accounts by logo. No migration. 82 tests.
- **2.0.0** — 2026-10-07 — `main` is brand base only: the old BrandFactory packages, Fly deploy and docs move to the branch `archive/main-2026-10-07`, and the demo moves from `packages/brandbase` to `packages/web-next` so the existing Vercel project deploys it unchanged. No migration. 78 tests.
- **1.64.0** — 2026-10-07 — Schedule gets Month, Week and Day views and a stage filter beside Layers; a new post opens a full-page composer that writes one post for every platform (Brandwatch makes one per network); Ideate's views become Current ideas and Moodboard (Pinterest, Instagram, TikTok in one board). No migration. 3456 tests.
- **1.63.0** — 2026-10-07 — BrandBase's Ideate and Insights pages are redesigned from scratch. Ideate has two views: ideas shelved by format (reels at 9:16, carousels at 4:5) and the imported Pinterest boards as a masonry board; a Shoot brief project board plans each idea (status columns, drag to move, date and time) and the calendar follows it. Stories join reels and carousels. Insights leads with four headline numbers, then Overview, Posts and Creators tabs, every chart titled and every mark hoverable. No migration. 3424 tests.
- **1.62.0** — 2026-10-06 — BrandBase becomes a UI-only demo for the 7 October client meeting: `packages/brandbase` draws the schedule, New post and a publish flow that sends one reel to Instagram, TikTok, YouTube and LinkedIn from one button, on static data with no server. Channels are picked by tapping their previews, and the publish rules (TikTok's unanswered privacy, its consent text, YouTube's title) are a tested model the view only reads. No migration. 3393 tests.

---

## 2.3.1 — 2026-10-08

**A phone pass.** Every page was checked on a 320, 360 and 390 px touch screen in Playwright, after
a review of the code for phone defects.

- **Schedule:** the toolbar wraps, with Month, Week and Day on a line of their own; the button reads
  "New post" (a plus alone at 360 px and narrower) and the "not posted" pill stays on one line (its
  chips in Month drop their dot). Month fits seven days on a phone (Week still scrolls sideways).
  The Day view's post card is 340 px or what is left before the stories column; two posts in one
  hour stack 24 px apart where they cannot sit side by side. The Layers and stage menus hang from
  the toolbar at full width instead of off the left edge.
- **Shoot brief:** on a phone the page scrolls as a whole and an open idea is a sheet from the
  bottom, with its Close button on screen. It was a 440 px pane beside the board, cut off.
- **Insights:** a tap shows a bar's, a cell's or a line's value (iOS sends no hover); the first and
  last weeks' and days' tooltips stay inside the card.
- **Touch screens:** the media actions in the composer and the remove buttons in the brief, which
  appear on hover, always show; on a phone, text fields are 16 px, so iOS Safari does not zoom in on
  focus.
- **Small fixes:** "Draft with AI" stays on one line; the header and the moodboard's photo fan fit
  320 px.

Dragging a post or an idea still needs a mouse; the date pickers in the composer and the brief do
the same on a phone. Two small changes reach wider screens: between 768 and 935 px two posts in one
hour overlap instead of running over the stories column, and the tooltips of the first two and last
two weeks sit inside the card.

**No migration.** 82 tests (14 files), all passing.

## 2.3.0 — 2026-10-07

**Insights, one thing at a glance.** The page showed four numbers with sparklines, three story
cards of five parts each and a 35-cell heatmap at once. It is now one 760 px column with a pill
switch, the way Ideate switches Moodboard and Current ideas:

- **Overview:** the month in one or two sentences (each brand's `line`, now a summary); one
  number card, a picker over the brand's four numbers with the value, what it counts, the change
  on the 30 days before and twelve weekly bars (this week in green, every bar on hover); "What
  worked" as three rows, each opening to its chart and "Turn into idea" → "Plan it"; and the best
  time to post as one figure over seven weekday bars, with the day-by-hour grid behind "By time of
  day".
- **Posts:** every post ranked by reach or by engagement, with the average as a divider.
- **Creators:** one sentence on who drew the most views and whose audience engaged the most, then
  each creator, opening to their best post.

The sparklines under each number and the creators' scatter plot are gone: the number card's bars
and the creator rows say the same with less. On a phone the number picker scrolls.

**No migration.** 82 tests (14 files), all passing.

## 2.2.1 — 2026-10-07

**Sharp photos.** The 56 photos in `public/demo/` were 272 to 750 px on their short side, so the
4:5 and 9:16 frames enlarged them. Each is now at least 1000 px on its short side (most 1280×1600
or 1600×1067), with the same file name and, for pins, the same shape. The 34 photos with a
recorded Unsplash source are the same photo at full size; the other 22 (pins 1–6 of each brand,
`crust`, `pasta`, `dish`, `wine-night`) are free Unsplash photos of the same subject, and
`CREDITS.md` now names the photographer and source of all 56. `dish.jpg` no longer carries
Temper's watermark. The story-row thumbnails ask for 32 px, not 18. The folder grows from 4.4 MB
to 11.9 MB. A check of every image on every page at 2x finds none under-resolved.

**No migration.** 82 tests (14 files), all passing.

## 2.2.0 — 2026-10-07

**Best times as a chart.** The composer's list of five best slots becomes a bar chart of the
picked day, one bar an hour from 8:00 to 22:00, the way a map shows how busy a place is. The bars
come from Insights' five parts of the day, read off the line between them, times the weekday's
weight, on one scale for the week, so a quiet day looks quiet. The best hour is green; hover shows
an hour, a click sets it, and "Best: Fri 9 Oct, 18:00" jumps to the best slot. The time chips go:
the bars are the picker, so the half-hour times (19:30) are no longer offered.

**The send button names its accounts.** "Schedule on 3" and "Publish to 3" become "Schedule on"
and "Post on" with the logo of each account the post goes to, like "Retry on" in 2.1.0; screen
readers hear the account names.

**One card size in Current ideas.** The photo, a moment's card and every thumbnail in the strip
are 4:5 whatever the format, so nothing changes size from one idea to the next.

**Sharper images.** A check of every image on every page at 2x found tiles asking next/image for
too few pixels: the calendar asked for 124 px and drew 175 px tiles, and a wide photo covering a
tall tile needs more again. The calendar (`TILE_SIZES`), day view, composer, phone preview, shoot
brief and moodboard now ask for enough. Low-resolution source photos are replaced separately.

**No migration.** 82 tests (14 files), all passing.

## 2.1.0 — 2026-10-07

**Current ideas decides what to make.** The shelves of tiles by format, the "5 of 8" ring and
the boxed "Moments ahead" made the view a second calendar. Each page now has one job: Schedule
is when, the Shoot brief is production, the Moodboard is inspiration, and Current ideas is what
to make and why.

- **One idea at a time:** the photo at the post's shape (one width, so nothing moves between
  ideas), the hook, the angle, one line on where it came from (the insight, the account it
  borrows from, or the moment), "Plan it" (opens the idea on the Shoot brief) and "Sharpen" (the
  three stronger hooks; a pick renames the idea and its calendar tile). Status and date are one
  grey line.
- **The strip:** every idea as a small thumbnail at its post's shape, then the moments not used
  yet (their date on the holiday tint), "+" for a new idea and "Suggest N". Click a thumbnail or
  use the arrow keys. "Use it" on a moment puts it on the calendar and opens the new idea.
- **Removed:** the ring and the header Suggest button ("Suggest N" in the strip does that job),
  "2 a week" above the title, and the subject line (the Shoot brief keeps it). `useRename` moves
  to `idea-parts.tsx` so both pages share it.

**A retry goes where the post failed.** A failed post opened with every account ticked, so
"Retry on 2" also re-posted to TikTok, where the margherita reel was already live. It now opens
on the failed account only (`composeChannels`); after the retry the post keeps the accounts it
reached plus the retried ones (`sentChannels`), so the month view counts both. The button reads
"Retry on" with each account's logo, and names the failed account before Reconnect. The outcome
screen says "1 account", not "1 accounts". The month view also counts a failed post once, on the
account it failed on (in 2.0.0's follow-up commit).

**No migration.** 82 tests (14 files), all passing.

## 2.0.0 — 2026-10-07

**`main` is brand base, and nothing else.** The demo was merged into `main` as 1.64.0 on top of
the whole BrandFactory tree, so the Vercel project (Root Directory `packages/web-next`) kept
building the old Operations Hub screens. This release removes that tree from `main`.

- **Kept:** `packages/web-next` (the demo, renamed from `packages/brandbase`, package
  `@brandfactory/web-next`), `packages/connect`, the root tooling, the brandbase docs and
  `docs/refs/`.
- **Removed from `main`, kept on `archive/main-2026-10-07` (70c5a50):** `web`, the old
  `web-next`, `server`, `shared`, `db`, `agent`, the six adapters, `docker/`, `scripts/`,
  `fly.toml`, the Fly deploy workflow, `.env.example` and the BrandFactory docs. The changelog
  keeps the brandbase releases only; 1.0.0 to 1.61.0 are on the archive branch.
- **Why the folder is `web-next`:** the Vercel project builds that folder, so the demo deploys
  with no settings change. A rename means changing Vercel's Root Directory in the same step.
- **Backend work starts from the archive.** The README and `CLAUDE.md` say to reuse the Fly
  app, the Supabase project, the migrations and the adapters there before creating new ones.
- **CI** drops the Postgres sidecar and the migration step, and builds the demo.
- A push to `main` no longer deploys the Fly backend; the running backend keeps its last deploy.

**No migration.** 78 tests (13 files: 8 web-next, 5 connect), all passing; the 182 skipped
live-database tests went with `packages/db`.

## 1.64.0 — 2026-10-07

**Schedule v2, from the 7 Oct design review.** Plan: `docs/executing/brandbase-schedule-v2-plan.md`.
**No migration.** 3456 tests (3274 passing, 182 skipped — the `*.live.test.ts` files).

- **Calendar views.** Month counts each day's posts by platform (no thumbnails: a day can hold 28
  stories) and opens a day on click; Week shows thumbnails in day columns with time and platforms;
  Day is an hour rail with the brand's best two hours shaded. The arrows step by the view, Today
  returns, and the place survives leaving the page (`calendar-view.ts`).
- **Stage filter** beside Layers: Draft, Awaiting approval, Scheduled, Posted, Failed, with a dot
  when something is hidden.
- **Composer** (`/post/new`, `/post/<id>`) replaces the Publish sheet and the New post drawer. One
  post for any mix of the brand's accounts: format once, media once, a shared caption with a tab per
  account to override it and a live limit per platform (a new blocker in `model.ts`), details shown
  only for the accounts that use them (location, first comment, collaborators, AI label, labels), a
  collapsed row per account for what only it needs (TikTok, YouTube, Facebook, LinkedIn, Instagram),
  when (now, a day and time with the brand's best times ranked, or a draft), approval, notes, and a
  preview per account with Instagram's grid. Posts keep the accounts picked, so the month counts
  them. `sheet.tsx`, `publish-sheet.tsx` and `new-post-drawer.tsx` are gone.
- **Moodboard.** Ideate's "Pinterest" view joins the brand's Instagram saved and TikTok favourites
  into one board, each tile marked with its source; "By format" is "Current ideas". Only Pinterest
  can sync saved posts in production; Instagram and TikTok fill by pasted links (plan doc).
- A used reference is a frosted check on the photo and "In plan · 24 Oct" in its caption row, in
  place of the green ring and pill; the source logo is larger, in the platform's own colour.
- Review fixes (one Sonnet pass, each confirmed in a browser): a second send after "Edit post"
  moves the post instead of placing another; a reopened post keeps its accounts; the post page
  belongs to the brand in the header (another brand's post is not shown, and switching brand
  starts the composer over); a post started from an idea replaces that idea's tile; a day takes
  one story, and a day whose stories are out takes none; posted and earlier-month posts open
  read-only; the Week view's story ring follows the stage filter; a dropped video draws on its
  calendar tile; an empty day or hour opens the composer on that day and time.
- **Stages cut to Brandwatch's four, plus Failed:** Draft, Awaiting approval, Scheduled, Posted.
  Approved, Filming and Editing are gone (seed posts mapped: approved → awaiting, filming and
  editing → draft); "Send for approval" now saves a post as Awaiting approval. The shoot brief's
  columns follow.
- **Failed posts.** A `failed` stage with its reason and the account it failed on. Two are seeded on
  Casa Vostra (Mon 5 Oct, Facebook; Tue 6 Oct, Instagram). The look is quiet but unmissable: a
  blush ring and a white "Not posted" pill with a red dot on the tile (a past day does not fade it),
  a tinted count first in the Month day, a hairline red card in the Day view, a tinted banner with
  Reconnect then Retry in the composer, and "2 not posted" in the Schedule header. Pressing that
  pill filters the calendar to failed posts (the stage filter's Failed alone) with the grid's rise;
  pressing it again shows everything.
- **Stories, redesigned (option B of three mockups).** The ring is gone. Each Week day shows a small
  fanned deck of 9:16 frames and "4 stories" (the row keeps its height on empty days, so posts start
  level); pressing it opens a side panel of that day's stories in time order — frame, time, title,
  status — with "Add a story", which opens the composer on that day with Story chosen. Month gives
  stories their own count beside the platform chips; the Day view puts each story at its time on
  the rail's right edge. The demo keeps a count per day, so `stories.ts` gives each story a stable
  time, title and frame; a planned story is its real post.
- Week numbers are gone from the calendar (the left column and the "WK 41" beside titles): the
  team plans by dates, as Google, Apple and Brandwatch show them.

## 1.63.0 — 2026-10-07

**Ideate and Insights, redesigned.** The first versions read as unclear: three columns of
controls on Ideate, and charts on Insights whose meaning was not obvious at first glance.
Completion notes: `docs/completions/brandbase-demo-plan.md`, last section. **No migration.**
3424 tests (3242 passing, 182 skipped — the `*.live.test.ts` files, run without a database).

- **Ideate** has two views. _By format_ shelves the month's ideas as Reels and Carousels, each tile
  at the post's shape, with Moments ahead below. _Pinterest_ connects once per brand and shows every
  board as a masonry of pins at their own aspect ratio, filtered by board or Saved posts. A card
  or a pin opens the idea sheet (hook, reference, shot list, sharper hooks, Send to calendar).
- **Insights** shows Reach, Engagement rate, New followers and a fourth brand number with a
  12-week sparkline, then three tabs. Overview: three story cards with titled charts (follower
  growth is indexed to week one, so a 2k TikTok and an 18k Instagram compare fairly) and a
  day-by-daypart heatmap. Posts: ranked rows with reach against the average and engagement.
  Creators: new data, views and engagement per creator, a scatter and an expandable list.
- **Shoot brief** (`/ideate/brief`): a project board. Columns are the six stages (plus
  Suggested while suggestions show); dragging a card or picking a status sets the post's stage,
  a date makes the idea a post (`planPost`), a new date or time moves it (`reschedule`), so the
  calendar shows what the board decided. A card opens a detail pane: hook, status, date, shots,
  references, sharper hooks, Keep or Skip. Every Ideate tile, used pin and Insights idea opens
  its card here; the idea sheet is gone. Ideate tiles show their stage as a pill, and a borrowed
  reference photo is marked "Ref". A planned post carries the idea's own photo only.
- **Stories** are an idea format: a Stories shelf, two story ideas per brand, and a planned story
  sits in the calendar's story row as a ring in its stage's colour. They do not count toward the
  8-a-month meter.
- The store stops opening a card on Suggest; suggestions appear in place with Review and Skip.
- 24 Unsplash pins added (credits in `public/demo/CREDITS.md`).
- The Pinterest board lays pins into real columns instead of CSS multi-column: Safari tore a pin
  across columns whenever something in it animated, so pins flickered and vanished on hover.
- A Short's title follows the caption (its opening phrase, no hashtags or emoji) until one is
  typed; it showed the hook, so a new caption never reached the YouTube preview. The caption
  typewriter runs about 30% faster.
- Publish picks the post time: "at 18:00" opens a row of times with the brand's best hour from
  Insights marked, and a scheduled post keeps its day and takes that time on the calendar.
  `reschedule` returns early when nothing changes, since Publish calls it from an effect.
- Headings and hooks set in Geist (medium, slightly tight) instead of Instrument Serif, the same
  family as the mono labels; `font-serif` is now `font-display`, and hooks lose their italic.
- The calendar moves between months (arrows, Today). Other months are built from real dates
  (`month.ts`): the weeks whose Monday falls in the month, the brand's real past posts from the
  insights page, and Singapore holidays ahead. The archive stays out of the month's posts.
- The board's idea pane takes references: drop photos or videos on it, or browse; added ones can
  be removed.

## 1.62.0 — 2026-10-06

**BrandBase, as a demo.** The six-phase plan built on the server is archived
(`docs/archive/brandbase-mvp-v1/`) and replaced by a UI-only demo for a client meeting on
7 October. Plan and completion: `docs/completions/brandbase-demo-plan.md`. Design: the Claude
Design canvas "BrandBase Publish Flow", Option B. **No migration.** 3393 tests (3211 passing,
182 skipped — the `*.live.test.ts` files, run without a database).

### What it shows

`packages/brandbase` on :3002, with no server, database or sign-in, and no import from any other
package. The schedule draws four weeks of Casa Vostra's posts, stories and events, with a layers
menu. New post starts from an idea or from media. Clicking a reel opens Publish: five phone-shaped
previews, each showing the post as that channel's screen does, and tapping one includes it or leaves
it out. One caption is fitted to each channel (YouTube gets the hook as its title, LinkedIn loses
the emoji and keeps one hashtag), TikTok asks who can watch with no default, and one button
schedules or publishes. Scheduling marks the calendar tile Scheduled; publishing now runs a timed
upload in which LinkedIn fails and Reconnect retries it.

### Why the rules are a model

`src/features/publish/model.ts` holds every rule as a pure function and is unit-tested; the view
only reads it through `usePublishDraft`. The canvas has two other designs for the same step (A, a
share-sheet drawer; C, one sentence), and either would be a new view over the same model. The
TikTok rules come from its Direct Post guidelines: no default privacy, interaction and promotion
switches off, the consent sentence before Publish.

### Notes

- Only three photos ship, all of food: two canvas photos show identifiable people and stay out of
  a public repository.
- One bug found in the browser pass: the sheet reported its stage to the posts store from an
  effect, and the store's setter changed identity on every change, so it looped ("Maximum update
  depth exceeded"). The setter is stable and idempotent now, with a test.
- The review before commit (an agent reading the code, then a Playwright run of the edge cases)
  found three more, fixed: a double-click on Publish closed the sheet, because the sheet got
  shorter and the second click landed on the scrim (the sheet now keeps its height); "Live
  everywhere" could show while a reconnected LinkedIn was still uploading, because "done" was a
  timer (it is now derived from the channels); and closing mid-upload left the calendar tile
  behind (the post is marked posted when it starts going out).
- After a first look, the area under the phones was redesigned to show only what the post needs:
  one caption field, which switches to a channel's own text from that phone's Edit; YouTube's
  title and made-for-kids inside YouTube's edit; TikTok as three hairline rows that collapse once
  answered, with the consent line beneath. Going live everywhere ends in confetti, a small physics
  simulation on a canvas (burst, drag, sway, flip), skipped under reduced motion.
