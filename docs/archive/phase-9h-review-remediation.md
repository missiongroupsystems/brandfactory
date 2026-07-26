# Phase 9H — Review remediation

**Status:** done
**Plan:** not a planned phase — this is the fix pass from the Phase 9 code review
**Depends on:** [phase-9a](./phase-9a-shared-contracts.md) … [phase-9g](./phase-9g-mission-systems-ci.md)
**Packages:** `@brandfactory/db`, `@brandfactory/server`, `@brandfactory/web`

## Goal

Phases A–G shipped the navigation redesign. A full review of the staged
changeset before pushing to prod found one CI blocker, four correctness or
safety defects, four accessibility/contrast defects, and one structural
verification gap. This phase closes all of them.

Nothing here changes the Phase 9 information architecture — it is a quality
pass over what A–G built.

## The verification gap (the reason this phase exists)

`listBrandSummariesByWorkspace` and `listRecentProjectsByWorkspace` are the two
most complex queries in the repo — raw `sql` fragments using `greatest()`,
correlated `max()` subqueries, and `count(distinct …)::int`. Every test that
touched them ran against `createFakeDb`, which *reimplements* their semantics in
TypeScript. Grepping for their names found six files: the two definitions, the
`Db` facade, the fake, and two routes. **No test file.**

So the entire workspace home and brand hub rested on SQL that had never
executed anywhere — not locally (no Docker daemon on the dev machine), not in
CI. The route tests proved the wiring and the fake's behaviour, which is
exactly the failure shape as the 0.8.1 incident: code that is correct on
inspection and unexercised in practice.

`packages/db/src/queries.live.test.ts` closes this. It is gated the same way as
`seed.test.ts` (`describe.skipIf(!process.env.DATABASE_URL)`), so contributors
without Postgres are unaffected and CI's Postgres 16 service container runs it.

**What it proves that the fakes cannot:**

| Assertion | Catches |
| --- | --- |
| `BrandSummarySchema.parse(row)` on every row | the missing `::int` cast — node-pg returns bare `count()` as a **string**, which the fake can never reproduce |
| `ProjectSummarySchema.parse(row)` on every row | `greatest(...)` coming back as a `Date` rather than a drizzle `mode: 'string'` value, and `toIsoTimestamp` failing to normalise it |
| project with a future-dated agent message sorts first | the `greatest` / correlated-subquery ordering, against real SQL semantics |
| idle project's `lastActivityAt === updatedAt` | the `coalesce(…, updated_at)` fallback |
| `limit` truncates; foreign workspace returns `[]` | scoping and `LIMIT` placement after `ORDER BY` |
| both brands appear with distinct `brandId`s | the workspace-spanning join |
| blob-key lookups return `[]` cleanly | the new joins run before a cascade delete — a failure here would abort the delete |

Two hazards handled while writing it:

- **The activity marker hangs off project *1*, not project 2.** `seed.test.ts:65`
  asserts project 2 has exactly two agent messages; a marker there would make
  that assertion flaky depending on interleaving.
- **`fileParallelism: false` in `packages/db/vitest.config.ts`.** Both live files
  call `seed()` against the same database and assert row counts. Run in
  parallel those transactions race. The package's pure-unit files are fast
  enough that serialising costs nothing.

## Fixes

### 1 — CI was red (blocker)

`.claude/commands/review_completions.md` was missing a trailing newline, so
`pnpm format:check` failed. `.github/workflows/ci.yml:68` runs it as a gating
step, so the changeset could not have gone green as staged. Every A–G
completion doc claims `format:check ✔ clean`; the file landed after those runs.

### 2 — The brand hub displayed creation time as "last activity"

`brands.$brandId.tsx` passed `lastActivityAt={p.updatedAt}` into the same
`ProjectCard` the workspace home feeds with the real value. Decision D1 rejected
`updatedAt` explicitly — it "would surface creation order wearing an 'updated'
label — a lie in the UI" — and the brand hub reintroduced exactly that. One
component, one prop name, two meanings depending on the screen.

Fixed at the source rather than the call site:

- `queries/projects.ts` — the `lastActivityAt` SQL fragment and the
  `projectSummaryColumns` selection are now module-level constants shared by
  `listRecentProjectsByWorkspace` and a new `listProjectSummariesByBrand`.
  There is one definition of "activity" and it is impossible to render a
  different one.
- `GET /brands/:brandId/projects` widened to `ProjectSummary[]` (additive
  fields only — same precedent as the C1 widening), ordered by activity desc.
- `useBrandProjects` retyped to `ProjectSummary[]` in the same change, per the
  plan's own risk note about windows where the types lie.

### 3 — The delete-brand dialog understated its blast radius

`projectCount={projects?.length ?? 0}` rendered "This deletes 0 projects" while
the query was pending or had failed — understating an irreversible cascade in
the one dialog the phase deliberately hard-gated with typed-name confirmation.

`projectCount` is now `number | null`; the route passes `null` while pending or
errored, and the dialog renders "This deletes every project under this brand and
everything on their canvases." The typed-name gate is unchanged.

### 4 — Deleting a brand or project orphaned its blobs

Canvas blocks reference storage objects by `blob_key`, but object storage sits
outside the FK graph. The cascade destroyed the rows — the only pointers to
those bytes — leaving every uploaded image and file in Supabase Storage or on
local disk forever. For a privacy-first, self-hosted product where "delete this
brand" implies the images go too, that is the wrong default.

- `listBlobKeysByBrand(brandId)` / `listBlobKeysByProject(projectId)` — join
  `canvas_blocks → canvases (→ projects)` filtering `blob_key is not null`.
- `blob-sweep.ts` — `sweepBlobs()` runs `Promise.allSettled` over the keys.
  **Best-effort by design:** the rows are already gone and the user's delete has
  succeeded, so a storage outage must not surface as a 500 implying nothing
  happened. Failures are logged with a count for operators to reconcile.
- Both delete routes read the keys *before* deleting and sweep after. `storage`
  is now threaded into the brands and projects routers.

Two server tests cover it: keys are swept on delete, and the delete still
returns 200 when storage throws.

### 5 — Stale brand names on project cards

`useUpdateBrand` invalidated `workspaceKeys.brands` but not the project lists.
`ProjectSummary` carries `brandName`, and `staleTime` is 30s, so for half a
minute after a rename the recent-work strip showed the old name. Both project
lists are now invalidated. (`useDeleteBrand` already did this.)

### 6 — Menu items left a second focus scope alive under every dialog

`EntityMenu` and `WorkspaceSwitcher` called `e.preventDefault()` in `onSelect`,
which in Radix suppresses the menu close. Every rename and delete dialog in the
phase opened with its ⋯ menu still mounted and focused behind the overlay:
Escape had to be pressed twice, and cancelling the dialog dropped focus back
into a menu the user believed was gone.

Removing `preventDefault` alone swaps the bug for its mirror — the menu's
close-time focus restore lands *after* the dialog mounts and yanks focus back to
the trigger. `deferUntilMenuClosed()` defers by one macrotask so Radix finishes
closing and restoring focus before the dialog installs its own trap.

### 7 — Destructive buttons were unreadable in dark mode

`.dark` sets `--destructive` to `#d48478`; `button.tsx` hardcoded
`text-white` → **2.85:1**, below AA for any text size. `--destructive-foreground`
already existed with the right value in both themes but was never bridged
through `@theme inline`, so no utility resolved it and nothing consumed it.

Bridged it, and switched the destructive variant to
`text-destructive-foreground`: unchanged white in light mode (6.9:1), near-black
in dark (**6.3:1**). The most visible instance is the confirm button on
"Delete brand".

### 8 — Dark mode had no focus indicator on menu items and no card hover

`--surface-hover` was `rgba(246,245,241,0.06)`, and `--accent` maps to it.
Translucency composites against whatever sits *behind* the element, so on a
raised card over the sunken page canvas the hover resolved to ~1.05:1 against
the card — no perceptible change. Menu items, whose only focus styling is
`focus:bg-accent` next to `outline-hidden`, landed at ~1.20:1.

- `--surface-hover` / `--surface-selected` are now opaque (`#35342f` / `#3f3e38`).
- Menu, checkbox and radio items gained `focus:ring-2 focus:ring-ring/60`. A
  background-only highlight is not a sufficient focus indicator at any alpha;
  the ring is theme-independent and satisfies WCAG 2.4.7.

### 9 — The active workspace was signalled visually only

`aria-label="Switch workspace"` overrode the trigger's text, so assistive tech
never heard which workspace was active. In the menu, selection was conveyed
purely by `opacity-100` vs `opacity-0` on the check icon — no `aria-checked`.

The label is gone (the visible name is now the accessible name, with
`aria-description` carrying the "switch" affordance), and the list is a
`DropdownMenuRadioGroup` of `DropdownMenuRadioItem`s so selection is exposed as
`aria-checked`. The old test asserted the `opacity-100` class — precisely the
visual-only signal — and now asserts `aria-checked` instead.

### 10 — Dialogs kept abandoned drafts; rename discarded live edits

- `NewProjectDialog` / `NewWorkspaceDialog` cleared `name` only on success, so
  cancelling and reopening showed the abandoned draft. They now clear on close.
- `RenameDialog` keyed its form on `initialName`/`initialDescription`, both read
  straight from the query cache. A background refetch mid-edit remounted the
  form and silently replaced what the user had typed. The key is gone — the
  existing conditional mount already re-seeds on open, which was the intent.

### 11 — Cards were buttons, not links

`BrandCard` and `ProjectCard` navigated with `useNavigate()` from a `<button>`,
so Cmd-click and middle-click did nothing, no href appeared on hover, and AT
announced "button". Both are now `<Link>` (matching `TopBar` and `Breadcrumbs`
in the same phase) with a `before:absolute before:inset-0` overlay so the whole
card including its padding gutter is the hit area, while the ⋯ menu stays above
it on `z-10`.

## Tests

274 → **285 (+11)**; 279 passing locally, 6 skipped (5 live-DB + seed, all of
which run in CI against the Postgres service container).

| File | Cases |
| --- | --- |
| `db/queries.live.test.ts` | 5 — brand counts + ordering, activity ordering + coalesce fallback, limit + scoping, per-brand summaries, blob-key joins |
| `server/routes/projects.test.ts` | 2 — blob sweep on delete; delete still succeeds when storage throws |
| `web/components/entity/EntityMenu.test.tsx` | 2 — trigger label + actions; menu closes on select |
| `web/components/WorkspaceSwitcher.test.tsx` | +1 and two rewritten — accessible name is the workspace; `aria-checked` replaces the opacity assertion |
| `web/components/project/ProjectCard.test.tsx` | +1 — renders a real link with the right href |

## Verification

```
pnpm typecheck                          ✔  9/9 workspaces
pnpm lint                               ✔  clean
pnpm format:check                       ✔  clean  (was failing — fix 1)
pnpm test                               ✔  279 passed + 6 skipped (285)
pnpm -F @brandfactory/web build         ✔
```

## Still open

Deliberately not closed here — these need a running database or a browser,
neither of which is available on the current machine (no Docker daemon, same
constraint noted in 0.8.1).

- **The plan's six-step manual smoke** (`phase-9-navigation-redesign.md`) has
  never been run. Step 5 — send an agent message, confirm the project jumps to
  the top of Recent work — is called out in the plan as the one behaviour no
  unit test proves end to end. `queries.live.test.ts` now proves the query
  underneath it, but not the full loop.
- **Phase G3 Playwright verification** still not run. 9G records the skill as
  "not installed"; it *is* available as `frontend:apply-mission-systems-ci`, so
  the follow-up is to run it rather than to install a plugin. The dark-mode
  contrast defects fixed in 8 and 7 above are exactly what that pass would have
  caught.
- **Unused CI token layer.** `--color-feedback-*`, `--elevation-*`, `--space-*`,
  `--border-subtle/strong`, `--color-scrim` and `--color-text-*` are declared but
  not bridged through `@theme inline`, so no utility resolves them and nothing
  consumes them (`alert-dialog.tsx` hardcodes `bg-black/50` where `--color-scrim`
  was authored for). Not a runtime break; flagged because unused tokens drift.
- **Bundle size.** 1.21 MB / 375 kB gzip in a single chunk, warned on every
  build. Pre-existing and growing; route-level code splitting is the fix.
