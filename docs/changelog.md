# Changelog

Latest releases at the top. Each version has a one-line entry in the index below, with full detail further down.

## Index

One line each — full write-ups are under the matching `##` heading further down.

- **2.26.2** — 2026-10-19 — `feat/packs-core`: one Node version, 24, for CI (`.nvmrc`), the core's image and local work. CI on Node 20 failed the text migration check, which compares the migration with what this Node's Unicode tables give. No migration. 803 tests.
- **2.26.1** — 2026-10-19 — `feat/packs-core`: Bubbles after the live card check. The answer is only what Bubbles wrote after its last move; its earlier lines ("I'll look at the brand first.") move into "How Bubbles did this". The persona tells it not to announce steps or name moves. A long reply no longer shows a fourth line under its bubble. No migration. 803 tests.
- **2.26.0** — 2026-10-19 — `feat/packs-core`: Bubbles shows what it changed as cards. Each idea, post, shoot, reply, comment, kit change, link, connection, moodboard link and setting a move touched is drawn as the app draws it, live from the stores, with a verb, a quiet rise, a day that slides on a move and a stage that fades on a mark; a removed thing stays drawn from a snapshot, faded; the brand reloads after each change. No migration. 800 tests.
- **2.25.1** — 2026-10-19 — `feat/packs-core`: Bubbles after its first live run through OpenRouter. A stopped question is no longer answered with the next one, and a move waiting for a yes stays in the history; answers stay short (under 90 words, 1200 tokens a request) and name things by title, not id; the header stays in view on a long chat. No migration. 782 tests.
- **2.25.0** — 2026-10-18 — `feat/packs-core`: Bubbles, the agent people talk to. A fifth tab chats with Bubbles, which runs DeepSeek's harness runtime with the model through OpenRouter and acts only through the core's moves as the person's agent (`POST /agents/session`); a send still waits for the person's yes on the page. Not deployed; no live model call yet. No migration. 780 tests.
- **2.24.0** — 2026-10-18 — `feat/packs-core`, phase 7: `packages/server` retired on this branch. The demo seed moves into the pack (`packs/brandbase/demo/seed.ts`, the same rows), the Dockerfile and `fly.toml` target the core (not deployed), and web-next talks only to the core. No migration. 728 tests.
- **2.23.0** — 2026-10-18 — `feat/packs-core`, phase 6, fifth part: uploads on the core. A move marked `upload` gets a key the core makes (never the client), a signed write URL and a stable address that redirects to storage; storage never overwrites a file; files on disk locally, Supabase Storage in a deployment. With it every route web-next calls runs on the core. No migration. 834 tests.
- **2.22.0** — 2026-10-17 — `feat/packs-core`, phase 6, fourth part: share links and comments on the core. Guest moves open at `POST /guest/{pack}/{op}` with no sign-in, the link's token as the right and the pack's row rules deciding what it reaches, rate-limited per address with the token masked in the log; the share page, guest comments and edits, team replies and done on the core. Pack migration `0007_share` (not applied to production). 813 tests (135 more skipped without a Postgres server).
- **2.21.0** — 2026-10-17 — `feat/packs-core`, phase 6, second part: ideas, shoots, the inbox, the brand kit, connections and pasted links on the core (31 moves), with the server's cases for each; the Lark invite is an approved effect, refused while the same send is on its way; crew rows carry their brand. Pack migrations `0004_ideas`, `0005_shoots`, `0006_kit` (not applied to production). 664 tests (122 more skipped without a Postgres server).
- **2.20.0** — 2026-10-17 — `feat/packs-core`, phase 6, first part: with `NEXT_PUBLIC_CORE_URL` set the app signs in, loads each brand and writes its posts through the core's moves (Schedule carries the person's yes to each account's send), with the screens unchanged; a script starts the core with the demo's data on a local Postgres. Other routes still go to the BrandBase API. No migration. 603 tests (66 more skipped without a Postgres server).
- **2.19.0** — 2026-10-17 — `feat/packs-core`, phase 5: timed moves. A move asks for later calls; the core claims one due call at a time, runs it as whoever asked, beats a heartbeat, and ends a cut-off call `unknown_outcome` with an alert, never running it again. BrandBase sends each account's job through an approved effect move on a simulated connector, and screens hear of every change within a second. Core migration `0006_scheduler` (not applied to production). 598 tests (63 more skipped without a Postgres server).
- **2.18.0** — 2026-10-17 — `feat/packs-core`, phase 4: agents call a pack's moves as MCP tools through the same checks as a screen; effect moves (the only way out of the app) wait for a person's yes to exactly what they send, used once, and an agent can neither give one nor promote a version. Core migration `0005_approvals` (not applied to production). 586 tests (52 more skipped without a Postgres server).
- **2.17.0** — 2026-10-17 — `feat/packs-core`, phase 3: `core publish`, `core test` and `core promote` from the command line, a core server, and platform tests every version runs; the demo moves "no post before 07:00" to 08:00 and back on one running server, and a version with a failing case cannot go live; pack migrations run as a role that cannot reach the registry. Core migration `0004_migrator` (not applied to production). 573 tests (52 more skipped without a Postgres server).
- **2.16.0** — 2026-10-17 — `feat/packs-core`, phase 2: the BrandBase pack (`packs/brandbase`): the server's schema with row rules keyed by brand membership, eight moves (the brand's state; list, create, edit, move, mark, unplan and send a post) and 19 rules as SQL data, and the server's post and send cases run through the core's new test runner, on PGlite and on a real Postgres. Idempotency keys in the core. Pack migrations `0002`, `0003` and core migration `0003_idempotency` (not applied to production). 537 tests (52 more skipped without a Postgres server).
- **2.15.0** — 2026-10-17 — `feat/packs-core`, phase 1: `packages/core`, a generic backend with one door (`POST /ops/{pack}/{op}`) that runs a pack's moves through eight checks under a limited database role; a registry of frozen pack versions whose live pointer the database moves only after a passing test run and a person's yes. Core migrations `0001_registry` and `0002_text` (not applied to production). 488 tests (6 more skipped without a Postgres server).
- **2.14.0** — 2026-10-14 — On the API the moodboard keeps its Instagram and TikTok sources and the links pasted onto it on the server, so they survive a reload and another device. Migration `0001_gray_tony_stark` (`pasted_links`, not applied to production). 424 tests.
- **2.13.1** — 2026-10-14 — On the API the composer waits for the server: "Sending…" while it answers, the done screen only once the post is stored, and a refusal keeps the composer open with everything in it. A draft on a day that has passed asks for a day ahead before it can be scheduled. No migration. 419 tests.
- **2.13.0** — 2026-10-14 — The calendar runs on real dates: every day is its `YYYY-MM-DD` date, today comes from the server on the API, the API calendar reaches two months back and six ahead (and every dated post), and the day pickers turn a month at a time. The static demo draws what it drew before. No migration. 415 tests.
- **2.12.0** — 2026-10-13 — The backend: `packages/server`, an API on the archive's Supabase Postgres (tables in a `brandbase` schema) with posts and per-account jobs, ideas, shoots, share links, inbox, brand kit, connections, uploads and sending; the app runs on it when `NEXT_PUBLIC_API_URL` is set and stays the static demo otherwise; a seed, a Dockerfile and `fly.toml` for the existing Fly app. Migration `0000` (not applied to production). 410 tests.
- **2.11.3** — 2026-10-13 — Posted is final: marking a post Posted on the idea page asks first, and nothing takes a posted post back to another stage. A backend handoff (`docs/executing/brandbase-backend-handoff.md`) with the owner's eight decisions; finished plans move to the archive. No migration. 301 tests.
- **2.11.2** — 2026-10-12 — The inbox thread panel takes the height of the list beside it, capped so the reply stays in view on a laptop and never under 440 px; a long thread scrolls inside it. No migration. 300 tests.
- **2.11.1** — 2026-10-12 — Insights drops the sentences under the bookings and best-time figures (the lead post's marker now names it for screen readers) and opens the best time by hour by default; on the idea page a posted post can go back to an idea. No migration. 300 tests.
- **2.11.0** — 2026-10-12 — David's "fewer elements" round: every page loses controls and helper text it did not need, and each screen keeps one main action; the inbox replies by picking one of three directions; share links choose who opens them and whether they view, comment or edit. The shoot page is one reading order with a draggable timeline of every shot (on dnd-kit), comments that can be answered and resolved, ideas added in place and custom crew roles. The composer's preview plays a reel, swipes a carousel, takes a dropped file and shows a brand-coloured empty state; the Drive picker is one surface with search. Recent handles are offered as you type, and avatars show profile pictures where a platform gives one. No migration. 299 tests.
- **2.10.0** — 2026-10-11 — Changing the voice is a four-step flow that ends on what AI will write before and after, then a new version with a history to bring old ones back; the kit's colours get a picker with suggested shades; files show as quiet kind icons. The inbox thread holds whole conversations in a calmer panel, and a complaint can go to several people. Ideate's title settles in like the other pages; the brand kit fits a phone. No migration. 238 tests.
- **2.9.0** — 2026-10-11 — The Brand kit is editable: voice, Say/Not pairs, sample lines, colours and the logo, one section at a time with Edit and Done; the composer, idea page and inbox read the edited voice, and a new logo shows everywhere. A connection that succeeds now shows a short animation before its sheet closes. Rachel's inbox complaint is about the food and goes to the head chef. No migration. 218 tests.
- **2.8.0** — 2026-10-11 — A Connections page per brand, from the brand switcher: every source grouped by job with one action each, a pretend sign-in, and first-time connect steps for Google Drive in the composer and Lark on the call sheet; Insights' sources follow it. A feasibility study for the real Drive and Lark integrations. No migration. 208 tests.
- **2.7.0** — 2026-10-11 — What marketing asked for in the 9 October call: tags and collaborators apart, a wrong-shape crop flag, Google Drive, only the brand's own platforms and any time of day in the composer; shoots with a time, a call sheet, Lark invites and replies, on the calendar and added by hand or from ideas; public share links with guest comments; a Brand kit the AI writes from; Insights with website, Google Business Profile and bookings on one time axis, and a Sentiment view; an Inbox with complaints first and replies in the brand's voice. No migration. 200 tests.
- **2.6.3** — 2026-10-09 — "Draft" means a post again: a plan is an "Idea" on the idea page, in Current ideas and in the calendar's filter (Idea · Draft · Scheduled · Posted). The Day view lists ideas as compact pills that wrap, folding past six behind "+N more". No migration. 126 tests.
- **2.6.2** — 2026-10-09 — An idea on the calendar no longer looks like a post: it is a short card with a dashed outline, "Idea", the hook as text and the reason it sits on that day (a dashed "Idea" box in the phone grid; a dashed-square count in Month; a flat row in Day), and a click opens its idea page, not the composer. No migration. 116 tests.
- **2.6.1** — 2026-10-09 — Each idea is a page of its own (`/ideate/<id>`), built as the production document for one post in four stages under a sticky rail: References, Shots (a storyboard, with references dragged onto shots and a shoot day), Shoot (tick and drop each clip) and Post; it replaces the side panel, and "Plan idea from this" opens the new idea there with no step between. The moodboard's selection bar moves from the bottom of the screen to a sticky row at the top, and the three connect buttons can be tapped together. No migration. 110 tests.
- **2.6.0** — 2026-10-09 — David's round-2 feedback: Ideate starts from the moodboard (pick posts from any platform, then "Plan idea from this"), Current ideas is an overview of ideas with their inspiration posts, and each idea opens its own shoot brief (the brief board page is gone); New post gets a crop editor, "Save draft" and "Schedule on" under the preview, comments on by default, and loses Approval and Notes; the approval stage and the seeded failed posts leave the demo; the month grid starts on the 1st; calendar idea tiles show a photo; a favicon. No migration. 95 tests.
- **2.5.1** — 2026-10-08 — A calmer desktop calendar toolbar, from review feedback: the outlined "2 not posted" pill becomes a short red "2 failed" line beside the title, and the Layers and Stages buttons become one Filter button; the black "Schedule new post" is the only strong control left. The phone filter uses the same word. No migration. 83 tests.
- **2.5.0** — 2026-10-08 — The phone calendar as a photo grid: Week is seven narrow columns of small square photos (three a day, then "+N") with the picked day's posts listed under it; Month is the same grid, one photo a day; Day is an hour list. The title switches views, one filter button holds the rest, and a dragged post lifts as a small photo just above the finger. Desktop unchanged. No migration. 83 tests.
- **2.4.0** — 2026-10-08 — A layout made for phones, not a shrunk desktop: a tab bar at the bottom; Schedule keeps Month, Week and Day in a phone's shape (Week lists the seven days, Day keeps the hours, Month lists the day picked in the grid) under a week strip; the shoot brief shows one column at a time; New post becomes one white compose screen whose settings open as sheets from the bottom. TikTok's "who can watch" starts on Everyone, on every screen. A long press drags a post onto a day or a card onto a column by touch. Desktop unchanged. No migration. 83 tests.
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

## 2.26.2 — 2026-10-19

- **One Node version.** `.nvmrc` (which CI reads) goes from 20 to 24, and the core's Dockerfile from 22.12.0 to
  24.13.0. `migrations/0002_text.sql` is generated from Node's Unicode tables (Unicode 16.0 in Node 24), and
  `text.test.ts` compares it with what the running Node gives; on CI's Node 20 the tables differ, so PR #3 failed.
- **Gate:** typecheck, lint, format, build; tests 803 in 69 files on Node 24 (no code changed since 2.26.1).

## 2.26.1 — 2026-10-19

- **The answer, not the narration (web-next).** In the live check with the real model, Bubbles wrote a line before
  each move ("I'll look at the brand first.", "Let me check the inbox order…") and the page showed every line as the
  answer, under cards that already said the same. Now a turn's answer is only what Bubbles wrote after its last move;
  the lines before a move are kept as the turn's notes and show in "How Bubbles did this", above the moves. A turn
  stored before this has no notes and shows as before. A finished turn that wrote nothing after its last move shows
  its last note as the answer, and the history sent back to Bubbles keeps the notes, so it remembers what such a turn
  did.
- **The persona (bubbles).** One more line: do not announce what you are about to do, and never name a tool or a
  move. In the same check, one answer named a message's id and the move `inbox.reply`.
- **The reply card (web-next).** The brand's reply bubble clamped its text on the padded bubble, so half of a fourth
  line showed under the "…". The clamp now sits on the text inside the padding.
- **Checked live** in Chrome with OpenRouter: an idea, a move, a post draft, a shoot, a colour and an inbox reply each
  drew their card; after this change the answer is three lines and a list, with no id or move name.
- **Gate:** typecheck, lint, format, 803 tests in 69 files (each package run alone; the full run timed out core and connect database tests under a load average of 43), build.

## 2.26.0 — 2026-10-19

- **Cards for what Bubbles did (web-next).** Between "what Bubbles is doing now" and the answer, one card per thing a
  successful move changed, in move order: an idea (cover, hook, format, day), a post (thumbnail, hook, day and time,
  stage pill, account logos), a shoot (date block, title, hours, place, idea thumbnails, crew initials), an inbox reply
  under its message, a message sent on with the people, the noise cleared with its count, a guest comment answered or
  done, the voice with its version, the colours as swatches, the logo, a file with its kind icon, a share link with
  Copy, a connection with its live dot, a moodboard link, the TikTok defaults; any other changing move is one line
  with a tick. Reads make no card. Three edits to one thing make one card, with the last verb. A card opens the
  thing's page. On a phone the cards sit in one row that scrolls sideways. Plan and as built:
  `docs/executing/bubbles-cards-plan.md`.
- **Live, not a copy.** A card reads the thing from the app's stores by the id in the move's input, and the chat store
  loads the brand again after each change (one load at a time per brand), so the cards and every other page show what
  is stored. A removed thing is drawn from a snapshot the page takes when the `tool_call` arrives, kept with the call
  in the chat, faded, "Removed".
- **Quiet motion.** Cards rise in, 70 ms apart; thumbnails fade in as they load; a moved day shows the old day for a
  beat, then the new one slides in; a mark fades the stage pill; colours land one swatch after another. None of it
  with `prefers-reduced-motion`.
- **The persona** tells Bubbles the person sees a card for each change, so its words need not repeat the details.
- Checked with a scripted Bubbles in Playwright at 1440, 1024, 768 and 390 px, and with reduced motion. Not yet run
  against the live model.

No migration. Gate: typecheck, lint, format, 800 tests in 69 files with `CORE_TEST_PG_URL`,
`next build`.

## 2.25.1 — 2026-10-19

- **Live run.** One real turn after another through OpenRouter (`deepseek/deepseek-v4.1-flash`):
  questions about the week, a new idea that showed up in Ideate, Stop, a brand switch, New chat.
  Answers took 3 to 8 s.
- **A stopped question stays stopped.** The page sent a question with no answer in the history;
  a fresh runtime replayed it and answered it with the next question. Questions with no answer
  are now left out; a move that waits for a yes counts as an answer.
- **Short answers.** The persona holds every answer under 90 words and names things by title or
  day, never by id; the gateway caps a request at 1200 tokens (was 2048), room for a long caption in a tool call.
- **The header stays in view** on the Bubbles tab, so the brand switcher does too.

## 2.25.0 — 2026-10-18

- **Agent sessions (core).** `POST /agents/session` gives a person's agent, `<person>/<name>`, a
  one-hour token signed with `AGENT_SECRET`. Each session copies the person's loadouts; the core
  checks the agent's and the person's on every call; an agent cannot approve or start an agent.
- **Bubbles (`packages/bubbles`).** DeepSeek's harness runtime per conversation, driven over
  stdio as openworld does; the model through a local gateway to OpenRouter (the key kept from the
  runtime, capped and streamed requests, the core's tools only, no data collection, reasoning
  off, 12 requests a turn); the tools are the core's `POST /mcp/brandbase`. Run end to end here
  with the real runtime and core and a fake model. Plan: `docs/executing/bubbles-plan.md`.
- **The Bubbles tab (web-next).** One input, answers in light Markdown, what Bubbles is doing now,
  Stop, Try again, and an approval card for sends; the brand on screen goes with each question.
  Checked in a browser against the real Bubbles and core.
- **Board.** `docs/refs/packs-core/architecture.excalidraw` and `.png`.

No migration. Gate: typecheck, lint, format, 780 tests in 66 files with `CORE_TEST_PG_URL`,
`next build`.

## 2.24.0 — 2026-10-18

- **Seed.** `packs/brandbase/demo/seed.ts` in plain SQL; on two fresh databases it loads the same
  rows as the old seed, and fills `crew.brand_id`. `packs/brandbase` is a workspace package for
  its demo scripts only.
- **Deploy files.** `packages/core/Dockerfile`; `fly.toml` builds it and runs the core's
  migrations on release. Built and run here against an empty Postgres: migrations applied,
  `/health` answers. Not deployed.
- **web-next.** `NEXT_PUBLIC_API_URL` is gone; `NEXT_PUBLIC_CORE_URL` turns the backend on.
- **Removed.** `packages/server` and its 106 tests (it stays on `feat/brandbase-backend`). The plan
  and the proposal move to `docs/completions/`.

No migration. Gate: typecheck, lint, format, 728 tests in 58 files with `CORE_TEST_PG_URL`,
`next build`.

## 2.23.0 — 2026-10-18

- **Files (core).** `files.ts`: keys `<pack>/<uuid>.<ext>` made by the core, signed write URLs,
  stable addresses at `GET /files/<signature>/<key>`, a disk store for development (refused in
  production, a write needs its length, never over a stored file) and Supabase Storage
  (`upsert: false`, not run here). Settings `FILES_SECRET`, `FILES_PROVIDER`, `FILES_DIR`,
  `FILES_BUCKET`, `PUBLIC_URL`; the fixed local secret only with the dev sign-in.
- **Pack.** `media.create`, with the server's media cases.
- **web-next.** Uploads go to the core; the image optimiser is off when only the core is set.
  Checked with Playwright: a picture added to an idea uploads, keeps its address and shows after
  a reload.

No migration. Gate: typecheck, lint, format, 834 tests in 71 files with `CORE_TEST_PG_URL`,
`next build`.

## 2.22.0 — 2026-10-17

- **Guest moves (core).** A move marked `"guest": {"capability": "<field>"}` runs at
  `POST /guest/{pack}/{op}` with no person; the field (32 characters or more) is set as
  `app.capability`, and only row rules that read it let the move reach rows. 30 calls and 10
  writes a minute per address; the log keeps the token's first 4 characters; a guest write
  tells open screens. A platform test asks every guest move for a wrong-token case.
- **Share links (pack).** `share.link`, `share.set`, `comment.reply`, `comment.done` for the
  team; `guest.view`, `guest.comment`, `guest.edit` for guests. A guest's new hook is never
  carried to a post that is out.
- **web-next.** The share page's routes go to the guest moves, the team's to their moves.
  Checked with Playwright: guest view and comment, team reply and done, a made-up token, phone.

Pack migration `0007_share`, not applied to production. Gate: typecheck, lint, format, 813 tests
in 70 files with `CORE_TEST_PG_URL` (678 pass and 135 skip without it), `next build`.

## 2.21.0 — 2026-10-17

- **Ideas.** Create, edit (a null clears a field, a field left out stays), drop, plan as a post,
  place on a day, and land on the calendar after this week.
- **Shoots.** Plan from ideas or add by hand, join on a day, edit with the call sheet's hours,
  order, crew by id, replies, and the Lark invite to those not invited yet, approved when
  pressed.
- **Inbox, kit, connections.** Replies kept with who sent them, complaints sent to people, noise
  cleared; voice versions, colours, the logo and brand files; connections, TikTok defaults and
  pasted links.
- **Core.** Two reserved parameters: `:fields` (the whole input) and `:payload` (what an effect
  sent); a yes is refused while a send of exactly the same thing is on its way.

Pack migrations `0004_ideas`, `0005_shoots` and `0006_kit`, not applied to production. Gate: typecheck, lint,
format, 664 tests in 69 files (122 skipped without `CORE_TEST_PG_URL`; the core's 356 pass with it),
`next build`.

## 2.20.0 — 2026-10-17

- **Routes on the core.** `lib/core-routes.ts` maps sign-in, the brand load and the post routes
  to the brandbase pack's moves; `lib/remote.ts` sends them to `NEXT_PUBLIC_CORE_URL` and every
  other route to `NEXT_PUBLIC_API_URL`. Schedule carries the person's yes to each account's
  send, stored with the jobs in one transaction.
- **Pack.** `account.me`, `brand.list`; a post's jobs carry their ids.
- **Local stack.** `packs/brandbase/demo/web.sh`. Checked with Playwright: load, drag, a refusal
  from the core, and Schedule from the composer.

No migration. Gate: typecheck, lint, format, 603 tests in 69 files (66 skipped without
`CORE_TEST_PG_URL`), `next build`.

## 2.19.0 — 2026-10-17

- **Scheduler.** `packs.scheduled_calls` and `packs.alerts`; a move's `schedule` column asks for
  later calls; one claim per call with `SKIP LOCKED`, a heartbeat, `unknown_outcome` after 15
  minutes without one; a pack's `onRefused` and `onUnknown` moves record the bad ends.
- **Sending.** `post.publish_job`, an effect per account, sends what a person approved; failed,
  refused and cut-off sends show on the job. The server's three job cases pass, with the plan's
  two cut-off cases.
- **Events.** `GET /events/:pack` tells open screens that something changed.

Core migration `0006_scheduler`, not applied to production. Gate: typecheck, lint, format,
598 tests in 68 files (63 skipped without `CORE_TEST_PG_URL`; the core's 237 pass with it), `next
build`.

## 2.18.0 — 2026-10-17

- **MCP.** `POST /mcp/:pack`: the live version's moves as tools, listed per the caller's loadout
  (an agent's and its person's), each call through the eight checks.
- **Effect moves and approvals.** A move that names a connector is an effect. It sends only
  what a person approved, by the hash of what goes out: an edit voids the yes, a yes is used
  once, and a failed send needs a new one. `POST /approve/:pack/:op`; agents are refused there
  and by the database.
- **Platform test.** Every effect move has a case that sees it wait for a person's yes.

Core migration `0005_approvals`, not applied to production. Gate: typecheck, lint, format,
586 tests in 67 files (52 skipped without `CORE_TEST_PG_URL`; the core's 214 pass with it), `next
build`.

## 2.17.0 — 2026-10-17

- **Command line.** `pnpm -F @brandfactory/core core migrate | login | publish | test | promote |
  principal | loadout`. Promotion acts for the person whose token the command verifies; a
  Supabase service key is refused.
- **Server.** `pnpm -F @brandfactory/core start`: the core on Postgres or PGlite; the dev sign-in
  and a pinned clock are refused in production or on a database off this machine.
- **Platform tests.** Every version's run also checks that the runtime role cannot bypass row
  rules, that every table it reaches has forced row rules, that every rule has a refusal case and
  that every move has a not-found case.
- **The demo.** `packs/brandbase/demo/hour-rule.sh`: 1.1.0 refuses 07:30, 1.2.0 fails its own
  case and cannot go live, and moving back to 1.0.0 takes 07:30 again, on one running server.
- **Walls the review asked for.** Platform tests also fail a function that runs with its owner's
  rights, a guard of the registry switched off, and a policy that lets every row through;
  `core migrate` applies only a tested version's migrations, and runs them as `pack_migrator`,
  which cannot reach the registry, one statement at a time; publish refuses migration text that
  could leave that role; and a version fails when any function carries its own settings or any
  trigger, rule or default runs pack code on a write.
- **The test stall.** A PGlite closed under a running query spun forever; `close()` now waits.

Core migration `0004_migrator`, not applied to production. Gate: typecheck, lint, format,
573 tests in 66 files (52 skipped without `CORE_TEST_PG_URL`; the core's 201 pass with it), `next
build`.

## 2.16.0 — 2026-10-17

- **The BrandBase pack.** `packs/brandbase`: `packages/server`'s two migrations as they are, then
  forced row rules on every table keyed by brand membership (an admin reaches every brand, a
  deactivated account none), the read helpers, the send blockers in the composer's order, and a
  partial unique index that holds one planned story a day.
- **Moves and rules as data.** `brand.state`, `post.list`, `post.create_draft`, `post.edit`,
  `post.move`, `post.mark`, `post.unplan`, `post.schedule`; 19 rules, each one SQL statement.
- **The test runner.** A version's cases run on fresh databases through the same call path as a
  screen. 46 cases: the server's 19 post cases and 9 send cases, isolation across brands, the
  story row held by the database, and the cases the review asked for. The 3 job-runner cases wait for phase 5.
- **Idempotency keys.** `Idempotency-Key` on any move: the same call sent again runs once.

Pack migrations `0002_packs_access` and `0003_send_rules`, core migration `0003_idempotency`, not
applied to production. Gate: typecheck, lint, format, 537 tests in 62 files (52 skipped: the pack's
cases and `postgres.test.ts` on a real Postgres, which pass with `CORE_TEST_PG_URL` set; run with
`--maxWorkers=3 --testTimeout=90000` under load), `next build`.

## 2.15.0 — 2026-10-17

- **The core.** `packages/core`: `POST /ops/:pack/:op` authenticates, resolves the live version,
  checks the loadout (an agent's and its person's), validates the input, runs the before-rules,
  the move's one statement and the after-rules in one transaction as `pack_runtime`, and logs every
  call, refused or not. No business words in it; a test enforces that.
- **The registry.** Schema `packs`: principals, frozen pack versions named by a content hash, test
  runs, the live pointer, loadouts, the call log. A trigger moves the pointer only to a version
  with a passing run for its exact hash, and only for a person.
- **The walls.** The SQL check refuses a version whose moves are more than one plain statement or
  name a listed function; the runtime role cannot call `set_config`, sleep, take advisory locks or
  read the registry.
- **Rule language.** SQL `EXISTS` checks, not CEL: the spike is in the completion document.
- **Text functions.** Core migration `0002_text` (schema `textfn`): strip emoji and hashtags, list
  hashtags, the first sentence, has a letter or digit. Postgres regex has no `\p{…}` classes, so
  `scripts/text-functions.ts` writes them out from Node's Unicode tables, and a test checks the
  functions agree with JavaScript.

Core migrations `0001_registry` (schema `packs`) and `0002_text`, not applied to production. Gate: typecheck,
lint, format, 488 tests in 61 files (6 skipped: `postgres.test.ts`, which passes with
`CORE_TEST_PG_URL` set), `next build`. Under a machine load of 100+, the tests ran with
`--maxWorkers=3 --testTimeout=90000`; at the default settings `connect` and `web-next` tests
timed out.

## 2.14.0 — 2026-10-14

- **Moodboard sources.** Instagram DMs and TikTok saves are connection keys of their own
  (`moodboard-dm`, `moodboard-tt`) beside Pinterest; the moodboard sends them and loads them.
- **Pasted links.** A table `pasted_links` and `POST /brands/:id/pasted`, idempotent by the
  client's id and scoped to the brand; the state lists them newest first, so an idea planned from
  a pasted link keeps it after a reload.
- **Docs.** The go-live gaps plan moves to `docs/completions/` beside its completion notes.

Migration `0001_gray_tony_stark` (schema `brandbase`), not applied to production. Gate:
typecheck, lint, format, 424 tests in 56 files, `next build`.

## 2.13.1 — 2026-10-14

- **The composer waits.** `lib/remote.ts` gains `sent`, `push` for a caller that waits: it answers
  with the refusal in words or null once stored, in the same ordered queue. On the API, Schedule,
  Post now and Save say "Sending…" or "Saving…" until the server answers, and only a stored post
  shows the done screen. A refusal keeps the composer open; the message line says why and the
  brand reloads. A retry after a refused first save makes the same post, under the same id.
- **A day ahead.** With real dates a draft can sit on a day that has passed; the composer now
  says "Pick a day ahead." instead of letting the server refuse it.

No migration. Gate: typecheck, lint, format, 419 tests in 54 files, `next build`.

## 2.13.0 — 2026-10-14

- **A day is its date.** `Day.n` (the day of the demo's one month) becomes `Day.date`, a
  `YYYY-MM-DD` string, and so does every day key: store calls, idea cards, moments, shoots, the
  composer's `?day=`. `lib/dates.ts` holds the date helpers and today (6 Oct 2026 in the demo, the
  server's `today` on the API); `remote-days.ts` no longer converts days. Labels read the month
  from the date instead of guessing it from the number.
- **The API calendar.** `calendarOf` builds a run of weeks from two months before today's month
  to six months after it, stretched to every dated post, idea and shoot; the demo's October weeks
  keep their city events, other weeks get the holidays. Today and the past come from the server,
  so the calendar opens on this week. Months are cut from the brand's weeks; a month they do not
  reach is open days.
- **Pickers.** The day picker and the composer's day grid show one month at a time, with arrows
  when the brand has more than one month; every week with a day of the month is on its page, and
  a day that belongs to another month's page is dimmed. The month view's Today opens today's own
  month, also in the days before its first Monday. Holidays that move each year (Deepavali,
  Mid-Autumn, Black Friday) show only in 2026, the year their dates are known for.
- **Seed.** Reads the dates straight from the data files.

No migration. Gate: typecheck, lint, format, 415 tests in 53 files, `next build`.

## 2.12.0 — 2026-10-13

- **API.** `packages/server`: Hono with `createApp(deps)`, Drizzle on PGlite locally and in tests
  and on Postgres in a deployment. Every rule in the backend handoff is enforced on the server:
  client-made ids, posted is final, hand-set stages apart from publishing, the stage from
  per-account jobs, brand-local days. Share links by token, guest comments, inbox, brand kit and
  voice versions, connections, uploads by signed URL, sending with the composer's blockers and an
  idempotency key, and a job runner (off in a deployment until a real publisher exists).
- **The app on the API.** With `NEXT_PUBLIC_API_URL` set: a sign-in page, every store loads from
  the API and writes through one ordered queue, a refused change says why and reloads, files upload
  to storage, the composer keeps its whole draft, the guest share page opens by token. Without it,
  nothing changes.
- **Seed and deploy.** A seed that loads the demo's data; a Dockerfile (Node 22) and `fly.toml` for
  the existing app `brandfactory` in `sin`, with the migration as the release command. Not
  deployed.
- **Docs.** The plan and its completion notes in `docs/completions/`, with what is not built and
  the owner's steps to go live.

Migration `0000_futuristic_spencer_smythe` (schema `brandbase`), not applied to production.
Gate: typecheck, lint, format, 410 tests in 53 files, `next build`.

## 2.11.3 — 2026-10-13

- **Posted is final.** On the idea page, picking Posted asks "Mark as posted? It can't be changed
  after." with Cancel and Mark as posted; once a post is posted the other status chips rest. The
  store refuses it too: `setStage` leaves a posted post's stage alone and `unplanPost` refuses a
  posted post. This replaces 2.11.1's change that let a posted post go back to an idea.
- **Docs.** `docs/executing/brandbase-backend-handoff.md`: what the UI relies on, feature by
  feature, for the backend build, with the owner's eight decisions and the riskiest items. The
  shipped plans and completion notes, and the schedule v2 plan, move to `docs/archive/`; the
  remaining research docs carry a status note; `packages/connect/README.md` setup is current.

Gate: typecheck, lint, format, 301 tests in 39 files, `next build`.

## 2.11.2 — 2026-10-12

- **Inbox.** The thread panel was a fixed `max(440px, 100svh − 280px)`, which left an empty well on a
  large screen. It now stretches to the list column (the column takes its height from the list
  only, through `contain: size`), capped at the same value so the reply is in view on a laptop, and
  at least 440 px. A first try that sized the panel to the thread alone was too small and was
  replaced.

Gate: typecheck, lint, format, 300 tests in 39 files, `next build`.

## 2.11.1 — 2026-10-12

- **Insights.** The sentence under "+N% bookings after one post" and the one under the best time are
  gone; the green marker of the lead post carries "bookings rose most after it" in its label, so
  the fact is not colour alone. The unused Maps lift leaves the model. "By time of day" opens by
  default.
- **Idea page.** Idea is no longer locked once a post is Posted: it takes the post back to a plan on
  its day from any stage (the chip, the page and the store each refused it before).

Gate: typecheck, lint, format, 300 tests in 39 files, `next build`.

## 2.11.0 — 2026-10-12

**Fewer elements, one main action per screen.** From David's review of the 2.10.0 demo ("get rid of
as many UI elements as you possibly can without affecting functionality"), applied to every page.

- **Inbox.** Each message offers three reply directions; a pick writes the reply in the brand's
  voice into the box, and Send is the only dark button. Regenerate is gone; All / Comments / DMs
  are small text toggles; "Send to Giulia" moved into a "…" menu; the no-reply fold is a stack of
  faded faces and the word "Muted". The post a comment is on sits in the thread header as a
  thumbnail that lifts on hover and opens to the post.
- **Declutter.** Calendar, composer, shoot, Ideate, idea page, Insights, Brand kit, Connections and
  share pages lose eyebrows, counters, duplicate buttons and helper sentences; rare actions moved
  into "…" or "+" menus. The Insights summary sentence is gone. The calendar's filter and New shoot
  share one "…" menu.
- **Share.** A link opens for anyone with it or only the team, and a guest can view, comment or
  edit; the guest page follows. The card is an access row, one Copy link button and an eye for the
  guest preview.
- **Shoot page** (`docs/archive/brandbase-shoot-page-and-comments-plan.md`). One reading order:
  head, Who comes (with guest comments beside it), then the shot list as one horizontal timeline of
  every shot, grouped by idea under a lavender bar. Groups drag by their label to reorder the ideas,
  shots drag within their group, on `@dnd-kit/core` 6.3.1 and `@dnd-kit/sortable` 10.0.0 (mouse,
  long-press touch, keyboard, autoscroll; two hand-written drag engines were tried and removed).
  Comments can be replied to, jumped from to the shots, and marked done; ideas are added from the
  page itself (asking first if one is on another shoot) and take the shoot's date; crew roles take
  "Other…". The phone layout keeps each control on one line and hides remove behind Edit or "…".
- **Composer preview.** A demo reel (a stand-in clip, see `public/demo/CREDITS.md`) plays muted and
  looping in the preview only, with a tap to pause on a disc in the brand kit's colours; every
  other thumbnail shows its poster. Carousels swipe with arrows, dots and a counter; Grid tiles mark
  reels and carousels. With no media the frame shows the kit's colours and "Add a photo or video";
  files can be dropped onto the phone. The Drive picker is one surface: folders at the left, a
  search over all of them, numbered picks and "Add N".
- **Earlier on main since 2.10.0.** A connected card settles away before its sheet closes; recent
  handles, places, labels and tags are offered as you type; avatars show a profile picture where a
  platform returns one (Instagram business and creator accounts, Facebook Pages, the brand's own
  account) and initials otherwise.

Gate: typecheck, lint, format, 299 tests in 39 files, `next build`.

## 2.10.0 — 2026-10-11

**Voice as a version, and a calmer inbox.** Phase 5 of `docs/archive/brandbase-marketing-call-phases-1-to-5.md`.

- **Voice.** Edit opens a full-screen flow in four steps (how it sounds, say this not that,
  sample lines, what changes) whose last screen shows a caption, hook and reply before and after.
  Making it the voice publishes a new version through `voiceEdited`; a history under the section
  brings back an older voice as a new version. Two other concepts and the old Edit/Done editor
  were tried and removed; `/brand` is prerendered again.
- **Colours.** A tap on a swatch opens a picker (shade square, hue, hex, copy, five steps of the
  colour, nine restaurant colours); a tap outside (Done on a phone) saves, Escape drops the change.
- **Files** show their kind as a quiet monochrome tile.
- **Inbox.** The thread panel has its own height, with the header and composer fixed and the
  conversation scrolling between them; DMs carry earlier messages and team notes. "Send to" picks
  one person in a tap or several from a checklist ("Sent to Marco and Giulia").
- **Ideate**'s title settles in with the page; the brand kit's editor and swatches fit a phone.

Gate: typecheck, lint, format, 238 tests in 31 files, `next build`.

## 2.9.0 — 2026-10-11

**An editable Brand kit.** Phase 4 of `docs/archive/brandbase-marketing-call-phases-1-to-5.md`.

- `/brand`: Voice (summary, Say/Not pairs, "Sounds like" lines), Colours (hex checked as typed,
  the system picker, add, remove, name) and Logo (Replace) each have one quiet Edit; Done saves,
  Escape drops the edit. Nothing half-filled is saved, since AI reads every part of the kit.
- One store (`features/brand/brand-store.ts`) holds the whole kit, seeded from `BRAND_KIT`. The
  voice note's tooltip in the composer, idea page and inbox shows the kit's voice (the inbox's
  shorter tone phrases are gone), and the brand switcher, share page and Ideate show the new logo.
  In the inbox the note is plain text, not a link, so a tap does not lose a typed reply.
- Connect sheet: on success the dots join into a line, a tick pops in and the two logos lean
  together; closing it early still opens the Drive picker or sends the Lark invites.
- Inbox: Rachel's complaint is a soggy, burnt diavola and goes to Giulia, the head chef; the lost
  booking still goes to Marco.

Gate: typecheck, lint, format, 218 tests in 29 files, `next build`.

## 2.8.0 — 2026-10-11

**Connections.** Phase 3 of `docs/archive/brandbase-marketing-call-phases-1-to-5.md`.

- `/brand/connections` lists Instagram, TikTok, Facebook, Pinterest, Google Drive, Lark calendar,
  website, Google Business Profile and bookings, grouped by job, with Connect, Reconnect and
  Disconnect (simulated). One store backs the composer's accounts, the Drive button, the call
  sheet's Lark state and the Insights sources list.
- Carlitos starts with Drive and Lark off, so the first-time steps show; Temper's website needs
  attention. Casa Vostra's demo is unchanged.
- `docs/executing/brandbase-lark-drive-feasibility.md`: routes, effort and the approvals a human
  must give.

Gate: typecheck, lint, format, 208 tests in 29 files, `next build`.

## 2.7.0 — 2026-10-11

**What marketing asked for.** David demoed the tool to Nat (marketing) on 9 October; the plan and
completion are `docs/archive/brandbase-marketing-call-plan.md` and
`brandbase-marketing-call-phases-1-to-5.md`. Everything stays simulated on static data.

- **Composer.** Tag people (on the photo) and Collaborators (an invite the other account accepts)
  are two rows. A photo in a shape the format does not take shows "Crop 4:5" or "Crop 9:16"; a feed
  post takes 4:5 to 1.91:1. Only Instagram, TikTok and Facebook show (`LINKED`); the calendar's
  reels follow. Google Drive beside Upload. Per-brand AI drafts, and "Improve" for typed text. Any
  time of day. The outcome says when a collab invite goes. TikTok gains Sound and a saved default.
- **Shoots.** A shoot has a day, hours, place, crew and ideas, a call sheet at `/shoot/<id>`,
  simulated Lark invites and replies. It starts from selected ideas, an idea's shoot day, or "New
  shoot" on Schedule. Calendar chips read "Shoot · Raffles City · 12:00"; the Day view draws it
  over its hours. Shoots are on by default.
- **Sharing.** `/share/idea/<id>` and `/share/shoot/<id>`: no app navigation, guests comment with a
  name, and the comments show on the team's page.
- **Brand kit** at `/brand` (from the brand switcher): voice, colours, logo, titled files. The
  moodboard connects the brand's Pinterest board from one shared account, Instagram by DM to the
  moodboard account, and TikTok saves.
- **Insights.** Five sources; "Beyond social" lines up reach, website visits, Maps views and
  bookings on one axis with post markers; a Sentiment view; each post shows its sentiment split.
- **Inbox** at `/inbox`, the fourth nav item: complaints first, AI replies in the brand's voice,
  "Send to" for complaints.

Gate: typecheck, lint, format, 200 tests in 28 files, build.

---

## 2.6.3 — 2026-10-09

**Idea and draft apart, and a day of many ideas.** The word "Draft" covered both a plan with no
post and a post not yet scheduled, so the two read the same.

- **Words.** An idea's status is "Idea" until it has a post; then it is the post's stage, so a
  plan with a draft post reads "Draft". The idea page's status steps are Idea · Draft · Scheduled ·
  Posted; Idea takes a post back to a plan (`unplanPost`: the post leaves, the idea tile returns to its day), except a post that went out. The
  calendar filter splits its first row into Idea (the plans) and Draft (draft posts). Idea's mark is
  the calendar's dashed square, in the filters and on the idea page, so it never reads as a shade
  of Draft's grey dot. A date picked
  on an idea moves its tile there (`placeIdea`, beside any posts and ideas on that day) and leaves
  it an idea; before, it quietly made a draft post.
- **The Day view's ideas** are compact dashed pills (photo, "Idea" or "Suggested", the hook; the
  reason in the tooltip) that wrap side by side; past six, the rest fold behind "+N more".
- **A post with no media yet.** A post planned from an idea before anything was shot carried
  nothing (a reference photo is someone else's picture), so its tile was blank. Its idea's cover
  now stands in, faded and labelled "No media yet"; the post itself still has no media.
- **Ideas stay put.** A post moved, planned or dragged onto a day used to drop that day's idea
  tiles, and "Plan it" dropped the ideas on its day too: from when a day held one thing. Every other
  idea now stays, after the day's posts. A post remembers the tile it came from (`fromIdea`), so
  taking it back restores that tile's own words ("F1 weekend") and a suggestion stays one. A
  suggestion moved by date stays one too, and "Plan it" never leaves an idea on two days.
- **The strong button moves a little.** "Schedule new post" lifts a pixel with a soft shadow on
  hover and its plus turns a quarter; the phone's plus turns when tapped.
- **Real brand logos.** The brand switcher shows each restaurant's own mark, round, in place of a
  coloured letter: the 192 px icons from casavostra.sg, temper.sg and carlitos.sg, saved under
  `public/demo/<brand>/logo.png` (sources in `CREDITS.md`). `Brand.initial` gives way to `logo`.
- **Where media goes, at a glance.** On the idea page every place that takes media shows it without
  hover and on touch: an empty shot card offers "Reference" and "Upload" (the picker also lists
  moodboard posts), each Shoot row ends in a clip slot, References and the final cut use the same
  pills and slot, and a one-line drop hint shows where a mouse can drop. The giant shot numerals
  are gone.

## 2.6.2 — 2026-10-09

**Idea tiles read as plans**, from David's and the user's review of the live demo: the F1 idea on
Fri 9 Oct ("Pizza before the lights go out.") looked like a real post. Completion:
`docs/archive/brandbase-feedback-round-2-phases-1-to-4.md`, phase 4.

- **The tile.** Week and Day draw an idea as a plan card about half a post's height: a dashed
  hairline in the brand's colour, "Idea" where a post shows its time, the hook in display type,
  the reason, the format and at most a 16 px thumbnail. A suggestion is the same card in the
  insight green ("Suggested"). Month counts plans like posts, in the same filled chip, with a
  small dashed square for the mark (brand colour for ideas, green for suggestions, counted apart).
  Day puts its untimed things in a band on the hours' gutter: "All day" for events and stories,
  "Ideas" with each plan as one flat dashed row. The phone grid draws a
  dashed half-height box marked "Idea"; the phone day list a dashed row headed "Idea · reason".
- **The click.** Every idea tile opens `/ideate/<id>`. `ideaOfTile` finds the brand's idea by hook,
  else makes one from the Ideate moment with that hook (the Moments ahead path), else a bare idea
  from the tile's words, once. A suggestion's page shows Keep it / Skip before Suggest is pressed.

## 2.6.1 — 2026-10-09

**Follow-ups to round 2**, from the user's review of the preview. Completion:
`docs/archive/brandbase-feedback-round-2-phases-1-to-4.md`, phase 4.

- **The idea page.** `/ideate/<id>` replaces the brief's side panel and phone sheet. Under the
  editable hook, a sticky rail shows four stages, each done, current or ahead, none locked:
  **References** (reorder, the first is the main look, remove, add a file or a moodboard post;
  sharper hooks here), **Shots** (a storyboard: reorder, drag a reference onto a shot or pick one,
  who is in frame, a shoot day from the calendar's shoots), **Shoot** (tick each shot, drop its
  clip) and **Post** (status, date and time synced with the calendar, the media in shot order,
  "Open in scheduler"). Dates and times are picked on a small calendar with time chips (the brand's best time
  marked), shoot days on the same calendar with the brand's shoots. Reordering is by drag, with the
  others sliding aside as you move; Option+Arrow on a focused item does it by keyboard. No dashed
  placeholders: drop targets light up only while a file is dragged. A reel's post carries one
  final cut, with the shoot's clips as its footage; a carousel's slides are the clips in shot order.
  Every drag has a click path; phones drag by long press. Shots become
  `{ title, ref?, media?, captured? }`; added media joins `inspiration` as URLs. "Current ideas" goes back to `/ideate?view=ideas`. Card, Brief, Review
  and Insights' "Plan it" link to the page; `/ideate#<id>` is gone. "Plan idea from this" makes the
  idea at once, worded from the first post picked, and opens its page: the plan card (format and
  hook) is gone, as is the overview's ring for a new idea. An unknown id (a reload drops
  session ideas) says so with the link back.
- **The selection bar.** "N selected" and "Plan idea from this" replace the folder chips in a
  sticky row at the top of the moodboard. Phone folder chips scroll in one row, so the board does
  not jump on the first pick. While posts are picked, the folders are hidden: pick across folders
  on All.
- **Connect.** With nothing connected, tapping a second or third account while the first is
  connecting adds it (it did nothing); they connect together and the board opens once.

## 2.6.0 — 2026-10-09

**David's round-2 feedback**, for his Marketing demo on 9 Oct. Plan and completion:
`docs/archive/brandbase-feedback-round-2-plan.md` and
`brandbase-feedback-round-2-phases-1-to-4.md`.

- **Ideate.** On the moodboard, posts from Instagram, TikTok and Pinterest are checkboxes; "Plan
  idea from this" makes an idea that keeps them as its inspiration. Every seeded idea has two to
  four. Current ideas is a grid of every idea with its photos, status and date; nothing opens
  full-page. Each idea opens its own brief (side panel, or a sheet on phones, at `/ideate#<id>`);
  the `/ideate/brief` board page and the header link are gone, and with the board its drag columns,
  Share and Print. "New idea" starts on the moodboard. The two "synced" and "own accounts" notes
  are gone.
- **New post.** A crop editor on each photo (Original, 1:1, 4:5, 9:16, 16:9, zoom, drag; no rotate)
  that the previews follow. "Save draft" and "Schedule on" sit under the preview; the When switch is
  Publish now or Schedule. Removing the media brings the idea picker back (it hid once the caption
  was filled). TikTok comments start on (revisit before TikTok's audit). Approval, Notes, the
  preview note and the accounts caption are gone.
- **Schedule.** No approval stage, and no failed posts in the demo (the code stays; Failed leaves
  the stage filter). The month grid lends the week before as a dimmed first row, so September starts
  on the 1st. An idea tile shows its cover photo with a small spark.
- **Site.** A favicon and an Apple touch icon.

Gate: typecheck, lint, format, 95 tests (15 files), web-next build.

---

## 2.5.1 — 2026-10-08

**A calmer desktop calendar toolbar.** Review feedback said the toolbar was cluttered, with every
control at the same weight, and that the red "2 not posted" pill was too loud.

- **"2 failed":** the failed posts' pill is now one line of red text with a small dot and no
  border, beside the title and "Today" instead of among the controls. "Failed" is the stage's name
  in the filter. It still filters the calendar to the failed posts and shows "×"
  while it does.
- **One Filter button:** Layers and Stages merge into one borderless button whose menu lists the
  stages, then the layers. A dot on it says a filter is on, as the Stages dot did.
- **Order of weight:** the black "Schedule new post", then the view switch, then the Filter button.
- The phone's filter button and sheet say "failed" too.

Gate: typecheck, lint, format, 83 tests (14 files), web-next build.

---

## 2.5.0 — 2026-10-08

**The phone calendar as a photo grid.** The 2.4.0 phone calendar listed every post as a full row, so
a busy week ran long and read as clutter; a first redesign that kept the list and only moved the
controls was dropped (branch `feat/mobile-calendar`). Below 768 px the calendar is now a grid of
photos, chosen from three sketches; wider screens do not change.

- **Week:** the day letters and numbers (the picked day filled, today ringed), thin lines for the
  events, then seven narrow columns of square photos: three a day, then "+N". An idea is a tinted
  square with a spark, a day's stories one ringed circle, a failed post a red dot. Under a hairline,
  the picked day lists its best time, events, stories and posts (photo, hook, time and stage,
  accounts; a failed post with its error).
- **Month:** every week of the month in the same grid, one photo a day and "+N". **Day:** an hour
  list from 07:00 to 23:00, the best two hours shaded; an empty hour starts a post at that time.
- **Top:** the title switches Month, Week and Day; arrows or a swipe step them; "Today" appears away
  from today. One filter button carries the not-posted count and opens a sheet for that filter, the
  stages and the layers; a red line says when only the failed posts show. The black plus starts a
  post on the picked day.
- **Drag:** a long press on a photo or a row lifts a small square of the photo just above the
  finger, never from where the photo was, and it drops on a day column or number. `touch-drag.ts`
  takes this as an option; the tablet grid and the shoot brief drag as before.
- **Code:** the phone calendar is `features/schedule/phone-calendar.tsx`; the bottom sheet moves to
  `components/sheet.tsx`, shared with the post page.

Checked at 320 and 390 px with a busy week built for the test (the demo data is unchanged): the
lifted photo sits centred just above the finger at the lift and mid-drag; desktop and tablet
screenshots match the earlier ones.

**No migration.** 83 tests (14 files), all passing.

## 2.4.0 — 2026-10-08

**A layout for phones.** 2.3.1 made every page fit a phone; it still read as a desktop page made
small. Below 768 px the pages now take the shape of a phone app. Wider screens do not change. A
first version (a6eb2cf) put one day in place of the three views and a plus in the tab bar; it was
reverted, and this one keeps the views.

- **Tab bar:** Schedule, Ideate and Insights move from the header to a bar at the bottom. The header
  keeps the logo, the brand (now with its name) and the user. A post's own page hides the bar.
- **Schedule:** the title, the not-posted count, Layers, Stages and a black plus for a new post on
  one line; Month, Week and Day under it, with Today beside them. A strip of the week's days (the
  month's in Month) stays on screen, with a dot per post in its stage's colour; a swipe or the
  arrows step a week or a month. Week lists the seven days, each with its events (an event of
  several days once, with its length), stories, posts as rows and ideas; an empty day is one line
  that adds a post. Day keeps the hours, with the card wider and the stories in the deck above.
  Month lists the day picked in the grid, with "Best at" from Insights.
- **Shoot brief:** one column at a time, under four tabs with their counts; the facts in two
  columns; no Print.
- **New post:** one white compose screen, no header and no cards: the media strip, the caption as
  plain text, one row of chips that are both the per-account caption tabs and their character
  counts, then a short list (Post to, When, Details, one row per ticked account, Approval, Preview).
  Each row shows its answer and opens a sheet from the bottom with the controls a wider screen shows
  in place. The bottom bar holds Notes and the send button, which shows the first thing still
  missing while it cannot send.
- **Ideate and Insights:** smaller titles; Shoot brief beside the Ideas title; an idea's photo
  leaves its hook and "Plan it" on the first screen. Insights picks a number from pills that wrap,
  and Posts and Creators put their second figures under the name. The stories panel rises from the
  bottom, as tall as its stories.

**TikTok starts on Everyone.** "Who can watch" was unanswered until someone chose, so every post
with TikTok waited on it. The brands post in public, so a new post now starts on Everyone, on every
screen. TikTok's Direct Post guidelines ask for no default here, and an app that presets it fails
their audit: real posting through TikTok's API must drop this default first (noted in `model.ts`).

**Drag by touch.** A phone's browser does not start the HTML drag from a finger, so dragging needed
a mouse. A press of a third of a second now lifts a post or a card (`components/touch-drag.ts`): a
small copy rides above the finger and the page holds still. A post drops on a day of the strip, of
the month or of the week's list; a card drops on a column tab. A tablet's week grid and board take
the same drag. A tap still opens, a swipe before the press still scrolls, and the mouse drag is
unchanged. Tested with touch events in Chromium at 320, 390 and 820 px, and every page and its menus
and sheets checked in screenshots at 320 and 390 px; not yet on a real phone.

**No migration.** 83 tests (14 files), all passing.

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

**Schedule v2, from the 7 Oct design review.** Plan: `docs/archive/brandbase-schedule-v2-plan.md`.
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
Completion notes: `docs/archive/brandbase-demo-plan.md`, last section. **No migration.**
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
7 October. Plan and completion: `docs/archive/brandbase-demo-plan.md`. Design: the Claude
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
