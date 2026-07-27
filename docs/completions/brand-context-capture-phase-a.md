# Brand context capture — Phase A: registry row + conversation surface

Status: **done**. First phase of
[`docs/executing/brand-context-capture.md`](../executing/brand-context-capture.md).

## Goal

Make the brand conversation **exist** as a thread type — classified by the
registry, but absent from the brand hub's Workspace grid — and give it two entry
points on the brand context bar.

Nothing is draggable yet and no thread surface changed. At this boundary you can
create and list conversations; Phase B turns one into a split screen.

**332 → 347 tests (+15).**

## The idea this phase encodes

`MINI_APPS` was doing one job with two consumers that happened to agree:
*classify* a thread by `templateId` (which `isOrphanThread` reads) and *display* a
category tile (which the hub grid reads). The brand conversation is the first row
where those diverge — it must be classified (or a conversation lands in the hub's
"Other threads" catch-all, filed under "we don't know what this is") and must
**not** be displayed (or the Workspace grid frames it as a fifth peer of
Copywriting, telling a first-time user to start anywhere but the brand — the
"re-explain the brand every time" failure the vision opens with).

The fix is a `surface` field on the row plus a derived `TILE_APPS`, rather than a
second list. One registry, two views of it. A second list is precisely how the
two halves drift apart.

## What shipped

### A1 — registry row (`components/brand/miniApps.ts`)

- `MiniApp['id']` widened with `'context'`.
- New required field `surface: 'tile' | 'hidden'`, set **explicitly** on all five
  rows. No default: a default is how a new row silently acquires a display
  behaviour nobody chose.
- New `context` row — `MessagesSquare`, `create/match` on `templateId:
  'brand-context'`, `enabled: true`, `surface: 'hidden'`. `match` narrows on
  `p.kind` before touching `templateId`, which the union requires.
- `TILE_APPS = MINI_APPS.filter((a) => a.surface === 'tile')` — a derived view,
  exported for the hub grid and the `/apps/` route.
- Header comment rewritten: a mini-app is now defined as a *category of threads*,
  with classification (every row, always) and display (`surface`) stated as
  separate concerns of one list. `isOrphanThread` gained a comment saying why it
  reads `MINI_APPS` and not `TILE_APPS` — that choice is the entire reason a
  hidden thread isn't orphaned, and it reads like a bug without the note.

### A2 — hub grid (`routes/brands.$brandId.tsx`)

Grid maps `TILE_APPS`. The orphan catch-all still calls `isOrphanThread`
untouched, so a conversation appears in neither place.

### A3 — closing the `/apps/context` hole

`miniAppById` resolves by id with no surface check, so the moment the row
existed, `/brands/$brandId/apps/context` rendered a **second, unintended surface**
for the conversation list. The mini-app route's `beforeLoad` now redirects any
resolved non-`tile` app to `/brands/$brandId/context`. An id no row claims still
falls through to the existing unknown-app branch — being unregistered is not the
same as being hidden, and the two want different answers.

### A4 — conversation list (`routes/brands.$brandId.context.tsx`, new)

The mini-app page's shape at a path deliberately not under `/apps/`. Both queries
collapse into one `listPending` / `listError` pair (the 1.4.0 **I2** lesson: the
list needs the brand for `workspaceId`, so a failed brand fetch must say so
rather than render blank while the threads sit loaded). Filters with the
registry's own predicate; creates with the registry's own template id; breadcrumb
uses the `leaf` slot, since a conversation list has no entity id.

The route creates nothing on arrival. Implicit creation on a nav click strews
empty threads; "resume the most recent" is wrong the first time you want a fresh
line of thinking.

### A5 — route registration (`router.tsx`)

Registered in the same change as A4, not later: TanStack Router types `Link`
against the registered tree, so A6's `<Link to="/brands/$brandId/context">` could
not compile otherwise. (1.4.0 hit this exact ordering between its phases E and F;
the plan called it, and it was correct.)

### A6 — two entry points (`components/brand/BrandContextBar.tsx`)

- **Icon button** beside "Edit" once sections exist — `MessagesSquare`, `ghost`
  variant, `aria-label="Talk it through"`.
- **Second CTA** on the empty state — "…or talk it through" next to "Add brand
  context".

Two, because the bar has two shapes and a brand that starts as a rough idea only
ever sees the empty one — which is exactly the brand this feature is for. Both
stay neutral (`ghost`); the accent budget is not spent on ambient context.

### A7 — tests

+15, all in `packages/web`. Both load-bearing registry behaviours were
mutation-checked (break it, watch the right tests fail, restore):

| File | Δ | What |
| --- | --- | --- |
| `miniApps.test.ts` | +5 | `context.match`; a `surface split` block: `TILE_APPS` excludes `context` while `MINI_APPS` keeps it, a conversation is not an orphan *and* matches no tile app, every row declares a surface, `TILE_APPS` rows are `MINI_APPS` rows (identity, not copies) |
| `brands.$brandId.context.test.tsx` (new) | +5 | lists only conversations; creates under the template it lists by; empty-state invitation; failed brand query explains itself; pending state |
| `brands.$brandId.apps.$appId.test.tsx` | +3 | `beforeLoad` redirects a hidden app, lets a tile app through, leaves an unregistered id to the unknown-app branch |
| `BrandContextBar.test.tsx` | +2 | both entry points resolve to `/brands/b-1/context` |

Mutation checks run:

- `context.surface: 'hidden' → 'tile'` → 2 failures (`TILE_APPS` membership, the
  no-tile half of the orphan test). Restored.
- `isOrphanThread` reading `TILE_APPS` instead of `MINI_APPS` → 3 failures,
  including both pre-existing orphan tests. Restored.
- Deleting the A3 redirect guard → 1 failure. Restored.

## Deviations from the plan

Each is a place execution knew something the plan couldn't.

1. **`BRAND_CONTEXT_TEMPLATE_ID` pulled forward from B1 to A.** The plan put the
   constant in Phase B, but Phase A already has two callers (the registry row and
   the route's create dialog), so the literal would have been duplicated for the
   length of a phase. Still **not** the repo-wide `TEMPLATE_ID` map + DB `CHECK` —
   those remain the 1.4.0 follow-up.
2. **`isBrandContextThread` exported as a named predicate.** The plan had the
   route "filter with the `context` row's `match`", which at the call site means
   `miniAppById('context')` returning `MiniApp | undefined` — a dead branch to
   handle on every render. Instead the predicate is a named export that the
   registry row uses **as** its `match`, so route and registry are the same
   function, not two expressions that must agree.
3. **A6 needed no new `brandId` prop.** The plan anticipated one; `brand.id` was
   already in scope. Prop list unchanged.
4. **A3 lives in `beforeLoad`, not the render body.** The plan said "after
   `miniAppById`". Doing it in `beforeLoad` avoids a frame of the wrong surface,
   matches how the route already handles its auth redirect, and is directly
   testable by invoking the route options — the redirect never has to be inferred
   from what rendered.
5. **The `MIXED` fixture gained a brand-context thread**, so the count expectation
   is `context: 1`, not the planned `context: 0`. Putting the hidden row in the
   shared fixture means the pre-existing partition and orphan invariants now cover
   it for free — a `context: 0` key would have asserted only that the row exists.
6. **Test scope ran ahead of the plan.** A7 asked for `miniApps.test.ts` only,
   deferring the route and redirect tests to Phase G (G4, G5). Both were written
   now instead, because A3 and A4 are *new surfaces* and leaving them uncovered
   across a phase boundary makes "green at boundary" a weaker claim than it looks.
   Phase G's target shrinks accordingly.

## One thing that broke, and why it is worth recording

Adding a `<Link>` to `BrandContextBar` broke **all five** of its existing tests
with `Cannot read properties of null (reading 'isServer')` — a component test
rendering a router-aware component with no router. Fixed by the same
`vi.mock('@tanstack/react-router')` stub the mini-app route test already uses (a
`<Link>` that interpolates params into an `href`), not by weakening any
assertion. Any component that gains its first `<Link>` will hit this; the stub is
the house pattern.

## Verification

```
pnpm typecheck      9/9 workspaces
pnpm lint           clean
pnpm format:check   clean (one file needed --write; re-checked)
pnpm test           337 passed | 10 skipped (347)
pnpm build          all packages ok
```

Baseline confirmed by stashing the change and re-running: **322 passed | 10
skipped (332)** — so **+15**, with the same 10 skips before and after.

**Two caveats, stated plainly:**

- **The 10 skips are the live-Postgres suites** (`queries.live`,
  `guidelines.live`, `seed`). No Docker daemon and no root `.env` in this
  checkout, so `DATABASE_URL` is unset. Phase A touches no `db` or `server` code,
  so nothing new went unverified — but this pass does **not** repeat 1.4.0's
  "no skips" claim. Phase H owns that gate.
- **No live browser pass.** Phase A is structural; the surfaces it adds are
  exercised by unit tests, and the manual walk belongs to Phase H, which needs an
  `OPENROUTER_API_KEY` anyway. The one thing worth an eye before then: the empty
  state now holds two buttons and could crowd at narrow widths.

`node_modules` were absent from this checkout — `pnpm install --frozen-lockfile`
ran first. Lockfile unchanged.

## Files touched

| Action | Path | What |
| --- | --- | --- |
| Edit | `packages/web/src/components/brand/miniApps.ts` | `context` row, `surface`, `TILE_APPS`, `BRAND_CONTEXT_TEMPLATE_ID`, `isBrandContextThread`, header comment |
| Edit | `packages/web/src/components/brand/miniApps.test.ts` | +5, fixture gains a conversation |
| Edit | `packages/web/src/routes/brands.$brandId.tsx` | grid maps `TILE_APPS` |
| Edit | `packages/web/src/routes/brands.$brandId.apps.$appId.tsx` | `beforeLoad` redirects hidden apps |
| Edit | `packages/web/src/routes/brands.$brandId.apps.$appId.test.tsx` | +3, `@/auth/store` stubbed |
| New | `packages/web/src/routes/brands.$brandId.context.tsx` | conversation list |
| New | `packages/web/src/routes/brands.$brandId.context.test.tsx` | +5 |
| Edit | `packages/web/src/router.tsx` | register `brandContextRoute` |
| Edit | `packages/web/src/components/brand/BrandContextBar.tsx` | two entry points |
| Edit | `packages/web/src/components/brand/BrandContextBar.test.tsx` | +2, router stub |

**Untouched:** `packages/shared`, `packages/db`, `packages/server`,
`packages/agent`. No migration, no new tables, no new API routes.

## Next

**Phase B** — branch `projects.$projectId`'s right pane on the brand-context
template so a conversation renders the live guidelines editor instead of the
canvas, and patch the project-detail cache on a guidelines save (Correction 4).
`BRAND_CONTEXT_TEMPLATE_ID` is already in place for B1's branch.
