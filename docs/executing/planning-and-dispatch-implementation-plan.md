# Planning and dispatch — implementation plan

**Companion to [`../plans/planning-and-dispatch-on-the-social-calendar.md`](../plans/planning-and-dispatch-on-the-social-calendar.md),
which is the argument.** This file is the work: seven phases, each independently
shippable, each landing its own note in `docs/completions/`.

Base: `main` at **1.25.0** — 1688 passed | 75 skipped.

## Locked before the first line

Settled with the user, and decided in proposal §8. Nothing below re-opens them.

| | |
| --- | --- |
| Transport | A **stateless** brand-scoped route. No project, no canvas, no message history |
| Rejected ideas | Land nowhere. Accepted ideas with no date land in the unscheduled tray |
| Media | The model describes a direction **in words**. It never names or picks an asset |
| Key dates | Stay static client data. The **request quotes** the relevant ones; the dataset gains no table, no route and no wire type |
| Cadence (Q1) | Inferred from the last 4 weeks, shown as an editable number with its source; **3/week** when there is no history |
| Pillars (Q2) | A new `Content pillars` entry in `SUGGESTED_SECTIONS`. Read when written; proposed per run and offered for saving when not |
| Full (Q3) | Per day **and** per platform |
| Width (Q4) | 380–420px side panel; the page drops `max-w-6xl` while it is open; full-height sheet below `lg` |
| Provenance (Q5) | `social_posts.created_by` — `pgEnum('social_post_created_by', ['user','agent'])`, default `'user'`. **One migration** |
| Batch size (Q6) | `slots = ceil(weeks × cadence)`, `N = clamp(round(slots × 1.5), 6, 18)` |
| Dispatch (Q7) | Row actions + a `Today` group. No dedicated handoff view |
| Platforms (Q8) | One idea → one row **per platform**. Copy written per platform |
| Spend | The workspace's own LLM tokens. **No new cap** — `env.ts:90-92`'s standing precedent |

## Order, and why it is this order

```
A  Honest dialog ────┐
B  Dispatch ─────────┤
C  Month arithmetic ─┼──► F  Post Planner ──► G  Brainstorm in New post
D  Provenance ───────┤
E  The engine ───────┘
```

A, B, C, D and E are independent of each other and can land in any order or in
parallel. A, B and C are the halves of Door 2 plus the arithmetic Door 1 needs;
each is pure web and each is visible on its own. D and E are **dark** — D adds a
column and a marker, E adds a route nothing calls yet.

F is the first phase that spends money, and it needs all five: C's numbers for the
brief, D's column so its rows are attributable from the first one, E's route for
the ideas, and A's context strip vocabulary for the brief's header. G is thin
reuse of E through a second door.

**D is early on purpose.** Provenance cannot be backfilled. Every row F writes
before the column exists is a row nobody can ever attribute — see proposal §8 Q5.

**Every new prop on an existing component is optional with an empty default.** The
key-dates plan's rule, for the same reason: `brand` absent renders exactly what
the component renders today, so each phase's diff reads as *what changed* rather
than *what was re-threaded*. It is also the house rule already stated in
`CalendarMonthGrid` and `SocialPostList` — *every affordance renders only when its
callback prop does*.

## The gate, run at the end of every phase

```
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm -F @brandfactory/web build
```

Phase D additionally needs a database:

```
docker compose -f docker/compose.yaml up -d
pnpm -F @brandfactory/db db:migrate
DATABASE_URL=… pnpm vitest run --project @brandfactory/db
```

Every other phase leaves the `*.live.test.ts` suites untouched. Each phase records
its passing test count in its completion note; the delta is what the changelog
entry quotes.

---

# Phase A — The honest dialog

**Done, 2026-08-10 — 1713 passed | 75 skipped (+25).** Note:
[`docs/completions/planning-and-dispatch-phase-a.md`](../completions/planning-and-dispatch-phase-a.md).
One trap is still open: the 800px dialog-height check was not run in a browser.

**Goal:** the `New post` dialog states which brand it writes for, how much brand
context is actually loaded, and which key dates fall on the date in the form.

No server change, no model, no migration. Both facts are already on the page
(proposal, *What is there today*) — this phase is one prop each plus the component
that renders them.

**Files:**

```
packages/shared/src/brand/context-state.ts                  (new)
packages/shared/src/brand/context-state.test.ts             (new)
packages/web/src/components/brand/BrandContextStrip.tsx     (new)
packages/web/src/components/brand/BrandContextStrip.test.tsx(new)
packages/shared/src/index.ts                                (export)
packages/web/src/lib/key-dates/select.ts                    (+ keyDatesOnDay)
packages/web/src/lib/key-dates/select.test.ts
packages/web/src/components/brand/SocialCalendarPage.tsx
packages/web/src/components/brand/SocialCalendarView.tsx
packages/web/src/components/brand/PostEditorDialog.tsx
```

### Tasks

- [x] **A1** `context-state.ts` — `brandContextState(sections)` returning
      `{ written: number, total: number, unwritten: string[] }`.

      **A section counts as written when its body holds words**, tested with
      `sectionBodyToLine(body) !== null` — the exact test `brandTldrLine` already
      applies. A labelled-but-empty row is what the rail's suggestion chips
      create, and counting those as loaded would light the indicator on precisely
      the brand that needs the warning (proposal §2.1).

      It lives beside `description-line.ts` because it is the same class of rule
      about the same shape, and because Phase E's prompt wants the same number.

- [x] **A2** `keyDatesOnDay(dates, dayKey)` in `select.ts` → `{ days, seasons }`.

      Days are `start === dayKey`. Seasons are `start <= dayKey && (end ?? start)
      >= dayKey`. Reuses `splitByShape`; **does not** reuse `seasonsInMonth`,
      which answers a month-shaped question. Day keys compare as strings, the
      invariant the whole file already rests on.

- [x] **A3** `BrandContextStrip.tsx` — pure, two rows, no queries.

      Row 1: the brand mark, the name, and the computed state:

      | State | Line |
      | --- | --- |
      | `written === total`, `total > 0` | `Brand context loaded — 7 sections` |
      | `0 < written < total` | `Brand context is thin — 1 of 8 sections written` |
      | `written === 0` | `No brand context yet` |

      The last two carry a link to `/brands/$brandId/context` as `LinkProps`, not
      a string, so the compiler checks the path against the route tree.

      Row 2: one chip per key date on the day, coloured with
      `KEY_DATE_APPEARANCE[set].label` and dated with `formatKeyDateRange`.
      **The set name goes in the accessible name**, per `appearance.ts`: the
      colour is the fast path and never the only path.

      Reuse `brandInitials` from `BrandMark.tsx` — imported, not reimplemented.

- [x] **A4** Thread `brand` and `keyDates` from `SocialCalendarPage` →
      `SocialCalendarView` → `PostEditorDialog`. Both optional; absent renders
      today's dialog exactly.

- [x] **A5** Render the strip **inside `PostEditorForm`**, under the title and
      above `Platform`, and feed row 2 from the form's own `date` state — never
      from `seedDayKey`. That is the difference between a fact and a stale label:
      change the date and the chips must follow.

### Traps

- `DialogContent` is `sm:max-w-xl` and the form is already tall. Two more rows
  need the dialog to scroll rather than clip. Check at 800px viewport height.
- A brand with no sections at all is `written === 0, total === 0`. That is
  `No brand context yet`, not `0 of 0 sections written`.

### Tests

- [x] `context-state.test.ts` — an empty-bodied section counts as unwritten; a
      whitespace-only body counts as unwritten; `total` counts rows, not labels.
- [x] `select.test.ts` — `keyDatesOnDay` returns a season on its first, middle
      and last day, and not on the day after; a single day matches only its own key.
- [x] `BrandContextStrip.test.tsx` — each of the three states renders its line;
      the chips carry the set name in text; no chips renders no row 2.
- [x] `PostEditorDialog.test.tsx` — the strip shows the brand name; changing the
      date field changes the chips; with no `brand` prop the dialog is unchanged.

**Done when** a user opening `New post` can name the brand, the number of written
sections, and the key dates on the day, without leaving the dialog.

---

# Phase B — Dispatch

**Done, 2026-08-10 — 1745 passed | 75 skipped (+32).** Note:
[`docs/completions/planning-and-dispatch-phase-b.md`](../completions/planning-and-dispatch-phase-b.md).
Still open, with Phase A: nothing has been run in a real browser.

**Goal:** a planned post can be handed off without typing — copy the copy,
download the assets, mark it posted — and today's posts are the first thing the
list shows.

**Files:**

```
packages/web/src/lib/download.ts                              (new)
packages/web/src/lib/download.test.ts                         (new)
packages/web/src/components/brand/PostDispatchActions.tsx     (new)
packages/web/src/components/brand/PostDispatchActions.test.tsx(new)
packages/web/src/components/brand/SocialPostList.tsx
packages/web/src/components/brand/SocialCalendarView.tsx
packages/web/src/components/brand/SocialCalendarPage.tsx
```

### Tasks

- [x] **B1** `download.ts` — `downloadUrl(url, filename)`: `fetch` → `blob` →
      `URL.createObjectURL` → a temporary anchor → `revokeObjectURL`.

      **Not a bare `<a download>`.** The `download` attribute is ignored on a
      cross-origin URL, and a signed blob URL is cross-origin under any storage
      provider but `local-disk`. The naive version opens the image in a new tab
      in production and saves the file in development, which is the worst
      possible split.

- [x] **B2** `PostDispatchActions.tsx` — `Copy` and `Download`, rendered only
      when their callbacks are present *and* there is something to act on: no
      `Copy` on an empty body, no `Download` on a post with no resolvable
      attachment. A control that does nothing is the dead affordance 1.7.0 went
      to remove.

      `Copy` shows a transient `Copied` for 1200ms — `AssetLibraryView`'s
      `ColorRow.copy` idiom verbatim, **including its judgment that a refused
      clipboard is not an error state**. The copy is on screen either way.

- [x] **B3** `SocialPostList` — a `Today` region at the head, above
      `Unscheduled`. `upcoming` narrows from `key >= todayKey` to `key >
      todayKey`.

      The regions run in the order a planner reads them, and on the daily clock
      the first question is *what goes out today*. The region is absent when
      nothing is scheduled today, so a quiet day reads exactly as it does now.

- [x] **B4** Inside `Today`, the two actions are **visible buttons**; everywhere
      else they are `PostRowMenu` items beside `Mark posted`. Same component,
      more prominence the closer a post is to now. Dispatch fails by being hard
      to find at 8am, not by being hard to use.

- [x] **B5** New optional props on the list and the view: `onCopyBody?(post)`,
      `onDownloadAssets?(post)`. The list stays pure — it holds no clipboard call
      and no fetch.

- [x] **B6** `SocialCalendarPage` implements both. `onDownloadAssets` resolves
      `post.assetIds` against the asset list, maps through `assetUrl` +
      `resolveBlob`, and downloads **sequentially**: a browser silently drops a
      burst of parallel programmatic downloads, and a partial failure has to be
      able to name the file that failed. Toast on failure; the page owns the
      toast, as it owns every other one on this surface.

### Tests

- [x] `download.test.ts` — revokes the object URL after the click; a rejected
      `fetch` throws rather than resolving silently.
- [x] `PostDispatchActions.test.tsx` — no `Copy` on an empty body; no `Download`
      with no attachment; a rejected clipboard renders no error.
- [x] `SocialPostList.test.tsx` — a post scheduled today lands in `Today`, not in
      `Upcoming`; `Today` is absent when nothing is scheduled today; the two
      actions render as buttons inside `Today` and as menu items outside it.
      `now` injected, never read from the clock.

**Done when** the four dispatch steps in proposal §2.4 all exist, and a marketer
can go from opening the app to *Mark posted* without typing.

---

# Phase C — The month's arithmetic

**Done, 2026-08-10 — 1777 passed | 75 skipped (+32).** Note:
[`docs/completions/planning-and-dispatch-phase-c.md`](../completions/planning-and-dispatch-phase-c.md).
One deviation: the sentence renders inside `CalendarMonthGrid` through a
`summary` slot rather than in `SocialCalendarView` directly — see the note §6.
Still open, with Phases A and B: nothing has been run in a real browser.

**Goal:** the calendar answers *what is this month shaped like* before any model
exists. This is the phase that produces the single most useful sentence on the
surface, and it needs no LLM at all.

**Files:**

```
packages/web/src/lib/social-plan.ts                        (new)
packages/web/src/lib/social-plan.test.ts                   (new)
packages/web/src/components/brand/MonthPlanSummary.tsx     (new)
packages/web/src/components/brand/MonthPlanSummary.test.tsx(new)
packages/web/src/components/brand/SocialCalendarView.tsx
```

### Tasks

- [x] **C1** `social-plan.ts` — five pure functions:

```ts
postsByDayPlatform(posts): Map<string, Set<SocialPlatform>>
unclaimedKeyDates(keyDates, posts, year, month): KeyDate[]
monthPlanSummary(posts, keyDates, year, month): MonthPlanSummary
inferCadence(posts, now): { perWeek: number; source: 'history' | 'suggested' }
plannerBatchSize(weeks, perWeek): { slots: number; count: number }
```

- [x] **C2** `postsByDayPlatform` is **the** definition of taken (Q3), and it is
      the one Phase E's request body is built from. One function, two readers —
      the brief's arithmetic and the prompt — or the planner proposes into days
      the summary already called full. This is the top correctness risk in the
      whole plan; a comment in the file says so.

      Live, scheduled posts only. Day keys come from `groupByDay`, never from a
      second `new Date(post.scheduledAt)` — one conversion from UTC instant to
      local day, in the place that already owns it.

- [x] **C3** `inferCadence` — scheduled, non-deleted posts in the 28 days before
      `now`, `perWeek = max(1, round(count / 4))`. Under **three** posts in that
      window there is nothing to infer from: return `{ perWeek: 3, source:
      'suggested' }`. `now` injectable, the `upcomingKeyDates` precedent.

- [x] **C4** `plannerBatchSize` — `slots = ceil(weeks × perWeek)`,
      `count = clamp(round(slots * 1.5), 6, 18)`. Q6, as one expression.

- [x] **C5** `MonthPlanSummary.tsx` — the sentence, under the header, in calendar
      view:

      > **National Day (9 Aug) has no post.** 31 days · 4 posts planned · 3 key
      > dates unclaimed.

      The bold clause names the **first** unclaimed key date in the month and is
      absent when there is none. The tail is always there. Nothing here is a
      link and nothing here spends anything.

### Tests

- [x] A key date on a day that already has a post is not unclaimed.
- [x] A season is never unclaimed — it has no one day to hang a post off, the
      same reason `SocialPostList`'s heading suffixes exclude seasons.
- [x] `postsByDayPlatform` ignores soft-deleted and unscheduled posts.
- [x] `inferCadence` returns `suggested` at 0, 1 and 2 posts, and `history` at 3.
- [x] `plannerBatchSize` — a one-week window at 1/week returns the floor of 6; a
      five-week window at 5/week returns the ceiling of 18.
- [x] No assertion reads the current date except through an injected `now`.

**Done when** opening a month tells the user what it is shaped like in one line.

---

# Phase D — Provenance

**Done, 2026-08-10 — 1787 passed | 78 skipped (+13, three of them live-DB).**
Note:
[`docs/completions/planning-and-dispatch-phase-d.md`](../completions/planning-and-dispatch-phase-d.md).
**Migration 0012** generated, read, applied and inspected in `psql`. Still open,
with Phases A, B and C: nothing has been run in a real browser.

**Goal:** a post records whether a person or the agent wrote it. Dark apart from
one marker; it exists now so that no row F writes is ever unattributable.

**Files:**

```
packages/db/src/schema/social_posts.ts
packages/db/drizzle/0012_*.sql                     (generated — never hand-numbered)
packages/shared/src/social/post.ts
packages/shared/src/social/create.ts
packages/shared/src/social/post.test.ts
packages/db/src/mappers.ts
packages/db/src/queries/social-posts.ts
packages/db/src/social-posts.live.test.ts
packages/web/src/components/brand/SocialPostList.tsx
```

### Tasks

- [x] **D1** `socialPostCreatedBy = pgEnum('social_post_created_by', ['user',
      'agent'])` and the column, `.notNull().default('user')`.

      **The word is `agent`, not `planner`.** `guideline_sections.created_by` and
      `canvas_blocks.created_by` both spell it that way, and CLAUDE.md's
      one-word-one-meaning rule outranks the fact that this particular writer is
      called the planner.

- [x] **D2** `pnpm -F @brandfactory/db db:generate`, then read the SQL. It must
      create the type and add the column **with the default**, so existing rows
      backfill to `'user'` — which is true, not merely convenient: every row in
      the table today was typed by a person.

- [x] **D3** `SocialPostCreatedBySchema` on `SocialPostSchema`, and
      `createdBy: SocialPostCreatedBySchema.default('user')` on
      `CreateSocialPostInputSchema` — the `UpdateBrandGuidelinesInput` precedent
      (`update-guidelines.ts:28`), which puts the same field on the same kind of
      input with the same default.

      **Stated plainly in the doc comment: this is a provenance label, not a
      security boundary.** The client sets it. The product is single-owner, and a
      user who forges the field is lying only to themselves. It is not on the
      patch schema — provenance is a fact about creation, and an edit does not
      make a person the author of what the agent wrote.

- [x] **D4** `rowToSocialPost` and `createSocialPost` carry it through.

- [x] **D5** `SocialPostList` marks agent rows — a small icon beside the status
      pill with an accessible label *Written by the agent*.

      No third status. **The review question is answered by two fields
      together**: `createdBy === 'agent'` and `status === 'draft'` is the
      unreviewed pile, which is the pile that matters before anything goes out
      under the brand's name. A doc comment says so, because the composition is
      the whole reason the column exists.

### Tests

- [x] `post.test.ts` — the create input defaults to `'user'`; the patch schema
      rejects `createdBy` (it is stripped, so a patch of only that field fails
      the existing refine).
- [x] `social-posts.live.test.ts` — a create with no `createdBy` reads back
      `'user'`; a create with `'agent'` reads back `'agent'`.
- [x] `SocialPostList.test.tsx` — the marker renders on an agent row and not on a
      user row, and carries its accessible label.

**Done when** the migration is applied and the field round-trips. Changelog entry
states **Migration 0012**.

---

# Phase E — The engine

**Done, 2026-08-10 — 1853 passed | 78 skipped (+66).** Note:
[`docs/completions/planning-and-dispatch-phase-e.md`](../completions/planning-and-dispatch-phase-e.md).
One deviation: `buildSystemPrompt` gains a `surfaceContract` option, and the
planner withholds part 4 rather than inheriting the canvas contract — see the
note §2. **Not done: the route has not been run against a real model.** Phase F
is the first phase with a reason to press the button, and where E3b's 90-second
timeout gets its first measurement.

**Goal:** one stateless brand-scoped route turns a window into ideas, and ideas
into copy. Nothing on screen calls it yet.

**Files:**

```
packages/shared/src/social/ideate.ts             (new)
packages/shared/src/social/ideate.test.ts        (new)
packages/shared/src/brand/suggested-categories.ts(+ Content pillars)
packages/shared/src/index.ts
packages/agent/src/social/ideate.ts              (new)
packages/agent/src/social/ideate.test.ts         (new)
packages/agent/src/index.ts
packages/server/src/social/ideate.ts             (new)
packages/server/src/social/ideate.test.ts        (new)
packages/server/src/routes/social-ideate.ts      (new)
packages/server/src/routes/social-ideate.test.ts (new)
packages/server/src/app.ts
```

### E1 — The wire

- [x] **E1a** Add `Content pillars` to `SUGGESTED_SECTIONS`, `kind: 'aspect'`,
      after `Target audience`. Description and `exampleBody` in the register the
      other seven use. This is the whole of Q2's storage cost: the rail offers
      the chip, the editor offers the quick-add, and guideline auto-fill can
      write it from a report the brand already paid for.

- [x] **E1b** `packages/shared/src/social/ideate.ts`:

```ts
IdeateKeyDateSchema   // { name, start, end?, note?, set }
IdeateWindowSchema    // { start: dayKey, end: dayKey }
IdeateTakenSlotSchema // { day: dayKey, platform }
PostIdeaSchema        // { title, angle, pillar|null, date|null, platforms[], keyDateName|null, reason }
IdeateThemesInputSchema
IdeateThemesResultSchema  // { ideas: PostIdea[], pillars: { name, proposed }[], outcome }
IdeateCopyInputSchema     // { items: { idea, platform }[] }  max 24
IdeateCopyResultSchema    // { copies: { index, body, mediaDirection }[], outcome }
```

      **`IdeateKeyDateSchema` is the quotation, not the dataset.** The key-dates
      decision (`key-dates/types.ts:8-14`) is about storage and stands: no table,
      no route, no wire type *for the dataset*. What crosses the wire is the
      handful of entries this one request is about, shaped for a prompt — the
      same way the visible month and the chosen platform do.

      Reuse `SocialPostBodySchema` for the copy's max, and `SocialPlatformSchema`
      for every platform. Never a second literal.

      `outcome` mirrors `SectionShapeOutcome`: `'ok' | 'no-ideas' |
      'invalid-shape'` — the model answering in-schema that it has nothing is not
      an error, and the client has one honest line for it.

### E2 — The composer

- [x] **E2a** `packages/agent/src/social/ideate.ts` — `ideatePostThemes` and
      `writePostCopy`, plus `buildThemesPrompt` and `buildCopyPrompt` exported
      for their tests. `shapeSection.ts`'s shape exactly: `generateObject` with
      `jsonSchema<…>(z.toJSONSchema(…))`, then a **local `safeParse`** of what
      comes back — the documented `ai` 4.0.20 / zod 4 mismatch and the same
      distrust of unvalidated model output.

- [x] **E2b** The system prompt is **`buildSystemPrompt(brand)`'s output
      verbatim**, plus a `## Planning brief` block. Proposal §4: a planner that
      assembled its own brand header would be the second answer to *what the
      model knows about this brand*, and the first one to drift.

      The brief block adds only what `buildSystemPrompt` has no business knowing:
      the window in plain dates, the key dates inside it with their `note` and
      set, the taken day+platform slots, the platforms, the cadence, and the
      pillars.

- [x] **E2c** The rules the themes prompt carries, in order:

      1. **Media is described in words.** Never name, invent or select an asset.
         Brand assets carry a `label` and `alt` text and nothing a model could
         read; naming one would be reasoning from a filename somebody typed while
         uploading and presenting it as if it had looked.
      2. **Never propose onto a taken day+platform.** The list is given.
      3. **Every date falls inside the window**, or is `null` for the tray.
      4. **Group under the pillars given.** With none given, propose three to
         five and mark them proposed.
      5. **One idea may name more than one platform**, and its copy is written
         separately for each.
      6. **Return fewer ideas rather than invent filler** — `shapeSection`'s
         *empty rather than padded* rule, in this vocabulary.

- [x] **E2d** **Pass 2 is one call, not one per row.** The items ride in
      together and come back index-keyed. This is cheaper, but the reason is that
      captions written together stop three posts in one week from opening the
      same way — a set the model can see is a set it can vary. A missing index
      commits as `body: ''`, which this schema already defines as *slot claimed,
      copy pending*.

- [x] **E2e** **The boundaries are enforced here, not trusted to the prompt** —
      the `resolveCitedSources` precedent. After parsing: drop ideas dated
      outside the window, drop ideas whose (date, platform) pair is taken, drop
      platforms not in the request, and clamp to `count`. A model that ignores
      rule 2 must not be able to write a duplicate post.

### E3 — The seam and the route

- [x] **E3a** `packages/server/src/social/ideate.ts` — `IdeateThemesFn` and
      `IdeateCopyFn`, plus `createThemeIdeator` / `createCopyWriter` composing
      `db` + `llm` + `env`. `ShapeResearchFn` / `ShapeSectionFn`'s shape verbatim:
      two optional deps on `AppDeps`, each defaulting to its composition, so a
      route test drives the whole thing without a model.

      Both load the brand, throw a named error if it is gone, and resolve
      `resolveLLMSettings(brand.workspaceId, env, db)` **at call time** — the
      model that should write is the one configured when the writing happens.

- [x] **E3b** Timeouts: `IDEATE_THEMES_TIMEOUT_MS = 90_000`,
      `IDEATE_COPY_TIMEOUT_MS = 60_000`. `SHAPE_SECTION_TIMEOUT_MS`'s argument —
      past the ceiling the spinner has become a lie — with more room for pass 1,
      whose output is up to eighteen structured objects rather than one paragraph.

- [x] **E3c** `routes/social-ideate.ts` — `POST /:id/ideate/themes` and
      `POST /:id/ideate/copy`. Each handler: `c.var.userId` guard →
      `requireBrandAccess` → `zValidator('param')` + `zValidator('json')` → the
      injected fn. **It writes nothing and persists nothing.**

- [x] **E3d** Router-degradation check, the trap `social-posts.ts` documents:
      under `/brands` the literal `ideate` sits at the position where
      `social-posts`, `assets`, `guidelines` and `research` already sit, and no
      sibling parameterises it. Assert the app still builds its routes in
      `app.test.ts`.

- [x] **E3e** Mount on `/brands` in `app.ts`, inside the existing auth gate
      (`app.ts:102`), beside `createSocialPostsRouter` (`app.ts:135`).

- [x] **E3f** **No spend cap, deliberately.** This runs on the workspace's own
      configured LLM tokens, which `env.ts:90-92` records as ungated for chat and
      shaping. `RESEARCH_*`'s caps exist because deep research is metered per
      click at $0.38 a run. This is not that, and a cap invented here would be the
      second policy for one question.

### Tests

- [x] `ideate.test.ts` (shared) — the schemas accept the documented shapes and
      reject a date that is not a day key, a platform outside the enum, and more
      than 24 copy items.
- [x] `ideate.test.ts` (agent) — with a stub provider: an idea dated outside the
      window is dropped; an idea on a taken day+platform is dropped; a platform
      not requested is dropped; the list is clamped to `count`; an off-schema
      response returns `invalid-shape`; an empty list returns `no-ideas`; the
      prompt contains the brand name, every key-date name and every pillar.
- [x] `social-ideate.test.ts` (server) — 401 without a user, 404/403 through
      `requireBrandAccess`, 400 on a malformed body, 200 with a fake fn, and
      **no row written** for any of them.
- [x] `app.test.ts` — the new routes resolve, and the existing
      `/blob-urls/:key{.+}/read-url` still does.

**Done when** the route answers with ideas against a fake composer and against a
real model in development, and nothing in `packages/web` calls it yet.

---

# Phase F — The Post Planner

**Done, 2026-08-10 — 1914 passed | 78 skipped (+61).** Note:
[`docs/completions/planning-and-dispatch-phase-f.md`](../completions/planning-and-dispatch-phase-f.md).
Five deviations, each argued in the note §7: a new `content-pillars.ts` in
`shared`, a `usePostPlanner` hook holding the page's own state, the request
builders in `social-plan.ts`, two newly named bounds in E's schema file, and a
`This month` window that never starts in the past. Two traps the plan did not
name: **pass 2 must be chunked** (18 ideas × 2 platforms is 36 rows against a
24-item cap — note §4), and **`mediaDirection` has nowhere to go** (note §5).
**Still open: no real model run, and nothing has been run in a real browser** —
so E3b's 90-second timeout is still unmeasured and F9's width check is not done.

**Goal:** Door 1. The panel that turns a month into a plan, beside the grid it is
planning into.

**Files:**

```
packages/web/src/api/queries/social-ideas.ts            (new)
packages/web/src/api/queries/social-ideas.test.ts       (new)
packages/web/src/components/brand/PostPlannerPanel.tsx  (new)
packages/web/src/components/brand/PostPlannerPanel.test.tsx (new)
packages/web/src/components/brand/SocialCalendarView.tsx
packages/web/src/components/brand/SocialCalendarPage.tsx
```

### Tasks

- [x] **F1** `social-ideas.ts` — `useIdeateThemes(brandId)` and
      `useIdeateCopy(brandId)`, both `useMutation`. **No query key and no cache
      applier**: the route persists nothing, so there is nothing to keep
      coherent. A `useQuery` here would re-run a paid call on a window focus.

- [x] **F2** `PostPlannerPanel.tsx` — pure, three stages, all state owned by the
      page. Built from plain elements and the existing `Button` / `Select`
      primitives: there is no `sheet` primitive in `components/ui`, and a panel
      that is a plain `<aside>` in the page flow needs no new dependency.

- [x] **F3** **Stage 1 — Brief.**

      Above the controls, stated before anything is spent: the brand's context
      state (Phase A's `brandContextState`), the key dates in the window, and the
      posts already there (Phase C's summary). This is where the two original
      asks pay off — the user sees what the model will read *before* it reads it.

      Controls: the window (this month / the next four weeks), the platforms, and
      the cadence — **prefilled from `inferCadence` and labelled with its
      source**, `3 posts/week (from your last 4 weeks)` or `3 posts/week
      (suggested)`. Editing it re-derives the batch size in front of the user:
      *12 ideas for 8 slots*.

- [x] **F4** **Stage 2 — Ideas.** Pass 1's batch, grouped under pillars. Cards
      anchored to a key date are marked and sort first. Each card carries its
      platform chips, each chip removable, and accept / reject.

      When the pillars came back `proposed`, the group headings say so and one
      action offers to save them into the brand's `Content pillars` section
      through `useUpdateBrandGuidelines` — **the only guidelines write in this
      whole plan**, and it happens because the user asked, never as a side effect
      of running the planner.

- [x] **F5** **Stage 3 — Commit.** Pass 2 over the accepted (idea × platform)
      pairs, then the writes. The button states the **row** count, which is the
      sum of the chips and not of the cards (Q8) — nobody should be surprised by
      six rows from four cards.

- [x] **F6** The commit loop: `create.mutateAsync` per pair, **sequentially**,
      with `createdBy: 'agent'`, `status: 'draft'`, and `scheduledAt` from the
      idea's date at `DEFAULT_POST_TIME` through `localPartsToIso`. A dateless
      idea creates an unscheduled row — the tray, which `SocialPostList.tsx:43-48`
      already describes as exactly this.

      A failed write toasts and the loop continues; the summary toast names how
      many landed. Sequential is what lets it name them.

- [x] **F7** **Two rules with no exception, asserted in tests.** The planner
      never proposes onto a taken day+platform, and **every commit is an insert**
      — it never patches or replaces a post that is already there.

- [x] **F8** The `Plan` button in `PageHeader`'s action row, left of `New post` —
      the same relation as *decide, then execute*. **Not** a third segment in the
      `Calendar | List` toggle: those are two readings of one list
      (`SocialCalendarView.tsx:177-185`), and planning is not a reading of the
      posts, it is the activity that produces them.

- [x] **F9** Width (Q4): while the panel is open the page container drops
      `max-w-6xl`. Below `lg` the panel is `fixed inset-0` over the grid. Check
      both in a real browser at 1280 and 1440 before the phase is called done.

### Tests

- [x] The brief renders the inferred cadence with its source label, and the
      derived batch size changes when the cadence is edited.
- [x] A rejected idea contributes no row; removing a chip reduces the stated row
      count; the commit count equals the sum of the chips.
- [x] A dateless accepted idea commits unscheduled.
- [x] The panel calls `onCreate` and never `onUpdate` (F7, as a test).
- [x] A failed create does not stop the loop, and the summary reports the
      partial count.
- [x] The panel renders from props alone, with no `QueryClient` — the seam
      `AssetLibraryView` established and `SocialCalendarView` follows.

**Done when** a marketer can open August, run the planner, reject half, and watch
the grid fill — with every written row marked `agent` and `draft`.

---

# Phase G — Brainstorm inside `New post`

**Done, 2026-08-10 — 1967 passed | 78 skipped (+53).** Note:
[`docs/completions/planning-and-dispatch-phase-g.md`](../completions/planning-and-dispatch-phase-g.md).
Five deviations, each argued in the note §7: a new `PostBrainstormPanel.tsx`, a
new `usePostBrainstorm.ts`, the request builder in `social-plan.ts`, its own pair
of mutations, and a below-`sm` stack that puts the form first. **One trap the
plan did not name: the request must send an empty `taken` list** (note §2) — with
the planner's list attached, brainstorming any day that already has a post would
answer *no ideas* every time. **Still open, for the whole feature: no real model
run and nothing in a real browser.**

**Goal:** Door 3. The ask as originally described, third because after F it is the
less common case.

**Files:**

```
packages/web/src/components/brand/PostEditorDialog.tsx
packages/web/src/components/brand/CalendarMonthGrid.tsx
packages/web/src/components/brand/SocialCalendarView.tsx
packages/web/src/components/brand/SocialCalendarPage.tsx
```

### Tasks

- [x] **G1** A toggle in the dialog header widens it to `sm:max-w-3xl` and splits
      it: ideation left, the form right. Off by default; the dialog is unchanged
      when it is off.
- [x] **G2** The same route, window of one day, `count: 3`. Three angles, then
      pass 2 on the one the user picks, and the copy fills the `Copy` field —
      which the user can still edit before saving. A post written this way is
      `createdBy: 'agent'` like any other.
- [x] **G3** `Brainstorm this day` on a calendar cell, opening the dialog with
      the toggle already on. Without it nobody finds the toggle.
- [x] **G4** The context strip from Phase A stays exactly where it is. The two
      halves of the split both sit under it: the brand and the day are facts about
      the whole dialog, not about one column.

### Tests

- [x] The toggle off renders Phase A's dialog byte for byte (a snapshot of the
      existing assertions still passing is enough).
- [x] Picking an angle fills `Copy` and leaves it editable.
- [x] `Brainstorm this day` opens with the toggle on and the date seeded.

**Done when** a user standing on one day can get three angles and a caption
without leaving the dialog.

---

# Risks, named rather than discovered

**The two definitions of *taken* drift.** C2's `postsByDayPlatform` feeds both the
brief's arithmetic and E's request body. If a second definition appears, the
planner proposes into days the summary called full, and the bug looks like a model
failure rather than an arithmetic one. One function, two readers, and a comment in
the file saying so.

**Pass 1's output is large.** Eighteen structured objects with seven fields each
is a bigger `generateObject` than anything this repo runs today. E3b's 90 seconds
is a judgment, not a measurement; measure it in F and adjust with the reason
recorded.

**A brand with no written sections gets a confident planner.** `brandContextState`
answers this honestly in the brief, but nothing *stops* the run. That is
deliberate — a new brand planning its first month is a real user — and the honest
line in stage 1 is what carries it.

**Pillar drift between runs.** Q2's fallback proposes pillars per run, so two runs
on a brand that never saves them will disagree. The save action is the fix, and
the proposed-marker is what tells the user the fix exists.

# Deferred, with the reason

- **A handoff view** (Q7). Row actions first; real use decides.
- **Re-run last month's plan.** D's column is what would make it possible. Nothing
  in this plan reads it that way yet.
- **Pillars as a first-class brand fact** with a table of their own. E1a's
  guideline section is the cheap 90% of it, and the expensive 10% has no evidence
  behind it yet.
- **Publishing.** Out of scope by the proposal's §7 and by `social/post.ts`'s
  opening line: the plan is the product.
