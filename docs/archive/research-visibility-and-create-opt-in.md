# Research visibility and create-dialog opt-in

Status: **done**. 2026-07-30. Closes the gap between "I put a website on a new
brand" and "I can tell whether research is running, and what to expect."

Not a new Stage 3 phase — Stage 3 already shipped the job, the ticker, the rail
row and the vendor. This pass wires the **missing create entry point**, makes
the **in-flight surface honest**, and documents **how to turn the feature on**
without flipping production spend by accident.

## The report

Creating a brand with a URL looked like it should kick off research. The UI
then went silent: no in-progress state, no sense of how long a run takes, no
signal if you left the brand hub. There was no way to tell *running and slow*
apart from *never started*.

## What was actually true (investigation, re-verified)

Three findings, in the order they bite:

1. **Creating a brand with a URL did not start research.**
   `NewBrandDialog` only `POST`ed the brand and navigated. Research was planned
   (decision 1 of `brand-research-onboarding.md`) and never built. The server
   was ready — `POST /brands/:id/research` takes no body — but only the rail's
   re-run path ever called it. `useStartResearch`'s own comment still said
   "and (later) the create dialog."

2. **Research is off in the shipped deployment.**
   `RESEARCH_PROVIDER` defaults to `none`. `fly.toml` does not set it. That
   means `enabled: false`, no `onStartResearch`, no rail research row, no
   ticker. The silence in production was accurate: nothing was running and
   there was no button to press. Deliberate ("ships dark"), but easy to
   misread as a display bug.

3. **When research *is* on, the in-flight surface was thin.**
   One line in the rail footer: `Researching… started N minutes ago`. No
   expected duration, no "what lands when ready," and **no signal outside the
   hub**. Navigate to Visual identity or a project and a paid job had zero
   chrome anywhere in the app.
   Partial findings are **structurally unavailable** — the vendor poll is
   `{ status: 'running' }` until completion — so inventing a progress meter
   would be a lie.

## What this pass does

Three separable pieces, all landed:

| # | Piece | Outcome |
| --- | --- | --- |
| 1 | **Enable path, documented** | `.env.example`, `fly.toml` comment, README table — how to turn research on locally and in Fly *without* defaulting production to paid runs |
| 2 | **In-flight surface** | Rail expectation copy + header chip that survives navigation within the active brand |
| 3 | **Create-dialog entry point** | Explicit opt-in checkbox with cost and duration, gated on deployment + website |

### 1. Turning it on (without shipping spend by default)

Still **off by default**. Production stays dark until an operator sets both
`RESEARCH_PROVIDER=perplexity` and `PERPLEXITY_API_KEY`. What changed is that
the recipe is written down where operators and local devs look:

- **`.env.example`** — step list: set provider + key, restart server, create
  with opt-in *or* use the rail, watch rail + header chip.
- **`fly.toml`** — comment that `RESEARCH_PROVIDER` is deliberately unset, with
  the `fly secrets set` one-liner and the ~$0.40 warning.
- **`README.md`** — `RESEARCH_PROVIDER` / `PERPLEXITY_API_KEY` rows in the env
  table.

No production secret was set by this pass. Enabling spend remains a human
decision.

### 2. In-flight surface

#### Rail (`BrandContextRail` → `ResearchRow`)

`IN_PROGRESS` is still one slot in the footer (decision 2: the run reports
itself where it was started). It now has a second, muted line:

```
Researching… started 2 minutes ago
Usually 3–15 minutes. Draft guideline sections and a full report land on this brand when ready.
```

That is **expectation, not progress**. The vendor has no partial payload; the
second line says what will land and when to stop worrying, without inventing a
percent complete.

Numbers are single-sourced in `@brandfactory/shared`:

- `RESEARCH_COST_ESTIMATE` = `≈$0.40` (measured 3A $0.377, 3G $0.4157)
- `RESEARCH_DURATION_RANGE` = `3–15 minutes` (vendor ceiling; typical ~5 min)

Presentation strings live in `packages/web/src/lib/research-copy.ts`.

#### Header chip (`ResearchInFlightIndicator`)

Mounted in the root shell next to the theme toggle. Renders only when:

- there is an **active brand** (`useActiveBrandId` — same rule as
  `BrandSwitcher`), and
- that brand's latest job is **`IN_PROGRESS`**.

Links to `/brands/$brandId` with a title that restates the duration range.
Terminal states stay on the hub (review / retry); putting them in the chrome
would re-print a fact the rail owns.

### 3. Create-dialog entry point (decision 1)

```
[x] Research this brand  — reads the public web, ~3–15 minutes, ≈$0.40
    Needs a website. Runs in the background; the brand is created either way.
```

Rules:

| Condition | Behaviour |
| --- | --- |
| `RESEARCH_PROVIDER=none` | Checkbox **absent** (dead-affordance rule — same as the rail row) |
| Research on, website empty | Checkbox **disabled**, unchecked |
| Research on, website present | Checkbox **enabled**, default checked (opt-out, not silent auto-start) |
| Opt-in unchecked | Brand creates; no research call |
| Opt-in checked + website | Brand creates → navigate → `POST /brands/:id/research` → seed cache |

**Decision 2 holds:** brand creation never waits on the vendor. A failed research
start toasts; the brand still exists and the hub still opens.

#### Deployment-level `enabled` without a brand

Brand-scoped `GET /brands/:id/research` already returns `enabled`, but the
dialog needs the answer **before a brand exists**. New route:

```
GET /research  →  { enabled: boolean }   (auth required)
```

Same meaning as the brand envelope field (`RESEARCH_PROVIDER !== 'none'`).
Shared as `ResearchConfigSchema`. Client: `useResearchConfig()`, long
`staleTime` (only changes on redeploy). Queried only while the dialog is open.

`startResearchJob(brandId)` is extracted from `useStartResearch` so the dialog
and the rail share one POST without the dialog needing a brand-id-keyed hook
at mount time.

## What did not change (on purpose)

- **No partial results while running.** Vendor contract is still
  `{ status: 'running' }` until complete. Faking a progress bar was rejected.
- **No auto-start on create without the checkbox.** A website alone never
  spends money.
- **Production remains `RESEARCH_PROVIDER=none`** until an operator opts the
  deployment in.
- **No cancel route.** Still true: the vendor bills for work already done;
  "cancel" would only stop *reading* a report we paid for.
- **No new migration.** Schema and job lifecycle are Stage 3's.

## Files

| Area | Path | Role |
| --- | --- | --- |
| Shared | `packages/shared/src/research/job.ts` | `ResearchConfigSchema`, cost/duration constants |
| Server | `packages/server/src/routes/research-config.ts` | `GET /research` |
| Server | `packages/server/src/app.ts` | mount + auth for `/research` |
| Web | `packages/web/src/api/queries/research.ts` | `useResearchConfig`, `startResearchJob` |
| Web | `packages/web/src/lib/research-copy.ts` | opt-in + in-flight copy |
| Web | `packages/web/src/components/NewBrandDialog.tsx` | checkbox + post-create start |
| Web | `packages/web/src/components/brand/BrandContextRail.tsx` | in-flight expectation line |
| Web | `packages/web/src/components/ResearchInFlightIndicator.tsx` | header chip |
| Web | `packages/web/src/routes/__root.tsx` | mount chip |
| Ops | `.env.example`, `fly.toml`, `README.md` | enable recipe |

## Verification

```
pnpm typecheck                    10/10 workspaces
pnpm lint                         clean
pnpm format:check                 clean
pnpm test                         897 passed | 47 skipped (104 files)
```

885 → **897 (+12)**:

- 3 for `GET /research` (on / off / auth)
- 5 for create-dialog research (hide when off, disable without website,
  start when opted in, skip when unchecked, brand survives failed start)
- 4 for the header chip (no brand / no job / terminal / in-progress link)
- Rail assertion extended (expectation copy) — no net new rail tests

The 47 skips are live-Postgres files (no `DATABASE_URL` in this environment).
This pass does not touch those paths.

**No live pass.** Research still defaults to off; watching a real run needs
Postgres + `RESEARCH_PROVIDER=perplexity` + a Perplexity key and is documented
in `.env.example` rather than assumed here. What went unobserved: chip rhythm
next to the theme toggle with a long brand name, and the create-dialog
checkbox under the Mission Systems light/dark themes.

## How to watch a real run (operator checklist)

1. `docker compose -f docker/compose.yaml up -d`
2. In root `.env`: `RESEARCH_PROVIDER=perplexity` and `PERPLEXITY_API_KEY=…`
3. `pnpm -F @brandfactory/db db:migrate && pnpm -F @brandfactory/db db:seed`
4. `pnpm dev` — restart after any env change
5. Create a brand with a real public website; leave **Research this brand**
   checked — or open an existing brand with `website_url` and use the rail
6. Expect: header chip + rail spinner, ~3–15 minutes, then drafts ready and a
   brand-context thread with the report

## Relation to locked decisions

| Decision | How this pass respects it |
| --- | --- |
| 1 — two entry points | Create dialog finally wires the first; rail remains the second |
| 2 — brand first, research second | Navigate then POST; create never blocks on vendor |
| 4 — no website, no research | Checkbox disabled without a website; server still hard-gates |
| 6 — polling, not realtime | Header chip reuses `useBrandResearch` + existing 5s poll |
| 12 — budget guards | Unchanged; still fire above the spend line on POST |
