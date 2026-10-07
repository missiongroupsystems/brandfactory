# BrandBase MVP: implementation plan

> **Archived 2026-10-06.** Superseded by a UI-only, no-backend MVP for a demo.
> Nothing here shipped: the branch was reset to `main`. The code (write gate,
> `packages/brandbase` shell, unfinished migration 0028) is on the local branch
> `archive/brandbase-mvp-v1`. See `README.md` in this folder.

Status: archived. Approved on 2026-10-06 and superseded the same day.

The full reasoning, stakeholder sources and review history live in the plan doc
(https://claude.ai/artifact/AKn5eh9rpYHthZeLRVoYZC). This file is the build
checklist. Where they differ, this file wins: the build reuses the existing
repo, server and database. The plan doc assumed a fresh repo.

## Target dates

One developer, from Mon 12 Oct 2026.

| Phase | Dates | Ships |
| --- | --- | --- |
| 1 Foundation | 12–16 Oct | New frontend shell, write permissions, data model extensions |
| 2 Brand + AI context | 19–23 Oct | Structured guidelines, compiled context, rule check |
| 3 Calendar | 26 Oct–6 Nov | All-brand calendar, post plans, cadence, shoots, share links |
| Gate | 6 Nov | Marketing decides on replacing Brandwatch scheduling |
| 4 Publishing | 9–20 Nov | Instagram + Facebook publishing worker (only if the gate says yes) |
| 5 Creators | 23–27 Nov | Directory, campaigns, agency shortlists |
| 6 Ideas | 30 Nov–9 Dec | References, Pinterest, competitor watch, fill the gaps |

Publishing is proven after 2 weeks of clean posts (by 4 Dec), while phases 5
and 6 continue. If the gate says no, phase 4 is skipped and the MVP ends about
2 weeks sooner.

Each phase has **Built** criteria the agent verifies and **Accepted** criteria
that need the user. When Built passes, log Accepted as waiting and move on.

## What already exists (reuse it)

- **Auth and access:** `users`, `workspaces`, `user_brands`, Supabase JWT,
  `packages/server/src/authz.ts`, `packages/shared/src/member/access.ts`.
- **Brands:** `brands` (with `events_outlet_id`), `guideline_sections`,
  `brand_assets` + `photo_categories` (pins), `brand_resources`.
- **Calendar:** `social_posts` already has `kind` (post/shoot), `status`
  (idea, approved, filming, editing, posted), `format`, `hook`, `dish`,
  `talent`, `filmed_by`, `canva_url`, `shoot_id`, `events_event_id`,
  `approved_at/by`, `scheduled_at`, soft delete. One row per `platform`.
- **Group events:** the Mission Events adapter (`packages/adapters/events`)
  reads live and stores nothing. Keep it that way.
- **Key dates and holidays:** 92 static marketing dates and the gazetted SG
  public holidays for 2026–27 in `packages/shared/src/key-dates/`. No holiday
  API is needed.
- **Influencers:** `influencers`, `influencer_accounts`, `influencer_brands`,
  quick-add lookup (`packages/server/src/influencer`).
- **AI:** `packages/adapters/llm` (Vercel AI SDK, OpenRouter in production),
  `buildSystemPrompt` (`packages/agent/src/prompts/system-prompt.ts`) and
  `packages/agent/src/social/ideate.ts`.
- **Jobs:** `packages/server/src/research/ticker.ts` is the periodic in-process
  job pattern (start/stop, awaited on shutdown in `main.ts`).

Read each before you extend it. Check callers before you change a shape.

## Phase 1: Foundation (12–16 Oct)

- [ ] Scaffold `packages/brandbase` (Next.js 16, App Router, Tailwind, shadcn,
      Geist font as in the mockups). Add it to the workspace, vitest workspace
      and the gate commands. Dev port 3002 so it runs beside `web-next` (3000).
- [ ] Sign-in and session: copy the pieces `web-next` uses (Supabase client,
      `/api` rewrite to :3001, workspace resolution). Typed client from
      `hc<AppType>`.
- [ ] App shell from the mockups: slim icon rail (Home, Calendar, Ideas,
      Creators, Brand), brand switcher ("All brands"), ⌘K command bar stub.
      Design tokens in one CSS file (see `DESIGN.md`).
- [ ] Write permissions: wire `canWriteBrand` into every mutating route and
      allow `viewer` grants in the same change (repo `CLAUDE.md` says the two
      open together). Add a test that lists mutating routes and fails if one
      skips the write check. This changes production behaviour on merge, so
      give it its own changelog line.
- [ ] Before the migration, decide and record in the completion doc:
  - How one post plan maps to several channels. Recommended: one
    `social_posts` row is the plan, `platform` stays the main channel, extra
    channels become `post_channels` rows (later `publish_jobs` rows).
  - Where brand guidelines live (see phase 2). Recommended: new
    `guideline_versions` become the source of truth in phase 2.
- [ ] Schema extensions, one generated migration:
  - `social_posts`: add statuses `scheduled`, `partly_posted`, `failed`; add
    `talking_points`, `shot_list` (jsonb list of {text, done}), `pillar`,
    `objective`, `first_comment`, `hashtags`, `internal_notes`,
    `campaign_creator_id` (nullable, filled in phase 5).
  - `brands`: `weekly_target` (int, default 2), `pinterest_board_url`.
  - `share_links` (token, kind brief|review|shortlist, brand, filters jsonb,
    expires_at, revoked_at, created_by).
  - `share_feedback` (link, item, name, comment, created_at).
- [ ] Meta setup starts (user task, track in Progress): business verification,
      Page publishing authorisation, test Instagram account.

Built: sign in to `packages/brandbase` locally with the dev token, see the
shell and the 7 seeded brands, every mutating route checks write access, gate
passes. Accepted: none.

## Phase 2: Brand + AI context (19–23 Oct)

- [ ] Brand screen per `mockups/Guidelines.png`: tabs Voice, Content, Look,
      Files. Structured fields: positioning, audience, voice, words to use and
      avoid, caption rules (length per channel, emoji, hashtags, exclamation
      marks), closing lines, mandatory lines, pillars, weekly target.
- [ ] Store structured fields as versions (`guideline_versions`: brand, fields
      jsonb, compiled text, created_by, created_at). Each save makes a version.
      From phase 2 on, this is the one source of truth for brand context.
- [ ] Pre-fill: a one-off mapping from each brand's `guideline_sections` to the
      first version. Reuse `findSectionByLabel` (`canonical-sections.ts`),
      `proseMirrorDocToPlainText` and `brandContentPillars`
      (`content-pillars.ts`) in `packages/shared/src/brand/`. Pillars live in
      the guideline fields, not a separate table. Put unmatched sections in a
      "Notes" field. Edits made later in
      the old app's guideline editor do not flow into BrandBase; log that in
      Progress so the user can retire the old editor.
- [ ] Compiler: one pure function, fields → markdown context block. Unit-test it.
- [ ] `buildSystemPrompt` reads the compiled block from the latest
      `guideline_versions` row when one exists. Keep one answer per brand, as
      the comment in `packages/agent/src/prompts/system-prompt.ts` asks; do
      not merge both sources. Every AI call takes a brand id and records the
      version used (`ai_runs`: brand, version, kind, input, output, cost).
- [ ] "What the AI sees" drawer shows the compiled block and its version.
- [ ] Rule check: a function that lists which caption rules a text follows and
      breaks (deterministic checks first: banned words, length, exclamation
      marks, emoji; LLM only for tone). Unit-test it.
- [ ] Caption draft and "strengthen this hook" endpoints (3 options each, built
      on the team's own text).

Built: the compiler and rule check are unit-tested; a test caption for Casa
Vostra's seeded guidelines passes the rule check; gate passes. Accepted: the
user confirms the caption reads on-brand.

## Phase 3: Calendar (26 Oct–6 Nov)

- [ ] Calendar screen per `mockups/Calendar.png`: month grid (default), week,
      list; brand dots; brand buttons with planned/target ("Willow 5/8"); view
      options and layers behind one button; post drawer on click.
- [ ] Placeholders: computed on read from `weekly_target` per brand-week, never
      stored. "14 posts still to plan" counts them.
- [ ] Layers: posts, shoots, group events (live from Mission Events, never
      copied), holidays and key dates (from `packages/shared/src/key-dates/`).
- [ ] Post plan screen per `mockups/Composer.png` (Plan tab): format, hook,
      dish, featured, talking points, shot list, filmed by, pillar, objective,
      Canva link, references; stage menu with all statuses.
- [ ] Shoots: crew from a shared freelancer list (`freelancers`, `shoot_crew`),
      double-booking warning checked on the server across brands.
- [ ] Share links: shoot brief per `mockups/ShootBrief.png` (brand + date range,
      read-only page and PDF) and review links. Visitors see a public
      projection only (no internal notes, fees, contacts) and can leave a named
      comment. Only a signed-in member sets Approved. Rate-limit feedback.
- [ ] Home per `mockups/Main.png`: November card with brand rings and hover
      tooltips, the week strip with status dots and hover tooltips, failed-post
      row, New post.

Built: a Playwright screenshot of every screen above at 1440 px wide shows
no layout, colour or copy difference from its mockup PNG beyond real data;
placeholders, double-booking and share-link projection have tests; gate
passes. Accepted (after the user releases it): December is planned in
BrandBase, not in the old app or sheets; the user decides when the old
calendar stops being used.

## Gate (6 Nov)

The user confirms with marketing whether BrandBase replaces Brandwatch
scheduling. TikTok becomes a manual reminder; reporting, listening and
benchmarks stay in Brandwatch until replaced. Do not start phase 4 without a
recorded yes in Progress.

## Phase 4: Publishing (9–20 Nov)

- [ ] Post tab per `mockups/Composer-post-tab.png`: media, caption with rule
      check, channels (Instagram feed/Reel/Story, Facebook Page, TikTok marked
      manual), date and time, more details (hashtags, first comment).
- [ ] Media: convert images to JPEG on upload (Instagram accepts only JPEG);
      check Reel specs on upload. Signed URLs valid ≥1 h when Meta fetches them.
- [ ] Meta connect per brand: request every scope the MVP needs at once
      (instagram_basic, instagram_content_publish, instagram_manage_comments,
      instagram_manage_insights, pages_show_list, pages_read_engagement,
      pages_manage_posts, pages_manage_engagement, business_management). Create
      `social_accounts` (brand, platform, external account id, encrypted Page
      token, scopes, connected_by) in this phase's migration; it does not
      exist yet.
- [ ] `publish_jobs`: one row per post per channel. Columns: status (queued,
      in_progress, container_ready, publishing, published, failed, cancelled),
      run_at (never changes), prep_at, next_attempt_at, locked_until, version,
      claim_token, container_id, external_post_id, attempts, error_kind,
      first_comment_status.
- [ ] Worker, every minute in the server process:
  1. Claim due jobs in one short transaction: status queued or
     container_ready, next_attempt_at ≤ now, lease empty or expired; set
     in_progress, a 5-minute lease and a new claim_token. Commit.
  2. Every later write checks claim_token and version still match.
  3. Instagram: create the container at prep_at (15 min early), poll status
     on later runs, publish at run_at. Mark `publishing` before calling
     publish. Never call publish again unless the container status is not
     PUBLISHED.
  4. Facebook: post at run_at from the same worker. No native scheduling.
  5. Lost reply: Instagram, read the container's status_code; Facebook, check
     the Page's latest posts for the same caption and time.
  6. Errors: transient (5xx, timeout, rate limit) set next_attempt_at with
     backoff, max 5 tries; permanent (token revoked, bad media, permissions)
     fail at once and send a Slack message to the author.
  7. First comment is its own step after publish, with its own retry.
- [ ] Post status derived from its channel jobs: Posted, Partly posted, Failed.
      TikTok counts as done when the marketer pastes the live link.
- [ ] Edit bumps version and discards the prepared Instagram container. Cancel
      sets cancelled. Routes: `PATCH /posts/:id/schedule`,
      `DELETE /posts/:id/schedule`.
- [ ] Tests for the claim, stale-worker, lost-reply and edit-during-prep cases
      with fake Meta adapters (new port in `packages/adapters`, no vendor name
      in domain code).

Built: the worker tests pass against fake Meta adapters; gate passes.
Accepted: once the user's Meta test accounts exist, a post goes out to them from
a local server; then, after release and the user's go, one brand's real posts
go out from BrandBase for 2 weeks with no manual fixes.

## Phase 5: Creators (23–27 Nov)

- [ ] Creators screen per `mockups/Influencers.png` and
      `mockups/Influencers-all.png`: shortlist tab and directory tab.
- [ ] Creator profile per `mockups/Influencer.png`: big numbers, campaign
      steps, past collaborations, details drawer (contact, audience, rates).
- [ ] `campaigns` (brand, name, dates, budget) and `campaign_creators` (status
      prospect → contacted → negotiating → confirmed → posted → paid, fee,
      deliverables jsonb, shortlist decision, decided_by).
- [ ] Shortlist share link: agency sees names, handles, follower counts and the
      decision; it can comment; only a signed-in member approves or rejects.
- [ ] Confirmed deliverables appear on the calendar (`campaign_creator_id`).
- [ ] Merge the team's influencer sheets when the user provides them (import
      script reads a file outside the repo; the file is never committed).

Built: with invented sample data, a campaign runs from shortlist to paid in the
app and its deliverables show on the calendar; gate passes. Accepted: the
team's sheets are merged and a real campaign is tracked.

## Phase 6: Ideas (30 Nov–9 Dec)

- [ ] Ideas screen per `mockups/Brainstorm.png`: brand switcher, cadence dots,
      Saved and Competitors tabs, tag filters, Add (paste link, upload,
      Pinterest).
- [ ] `references` (brand, url, kind, image, title, tags, note, post id).
      Preview from Open Graph tags.
- [ ] Pinterest: link a board per brand, sync pins as references (needs the
      approved Pinterest app).
- [ ] Competitor watch: `competitors` per brand, weekly job reads public posts
      through Instagram business discovery into `competitor_posts`, then an AI
      summary.
- [ ] Fill the gaps per `mockups/Brainstorm-fill-gaps.png`: for a short month,
      suggest the missing posts from the team's own ideas, pillars and saved
      references. Each suggestion cites its source; "Add as Idea" creates an
      Idea post. Never generate a month from scratch.
- [ ] Search: LLM with web search for references on a topic, results saveable.

Built: references, fill the gaps and search work locally; the competitor job
passes its tests against a fake Instagram adapter; gate passes. Accepted: with
Meta and Pinterest access approved, the weekly digest runs for 2 real brands.

## Out of scope for the MVP

Analytics, voucher generator, marketing request form (moves to Launchpad),
funnel and decks (stay in the old app), customer CRM, Google Drive photo
library, TikTok API posting, deleting the old frontends, palette redesign.
