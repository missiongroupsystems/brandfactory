# Brand switcher in the app shell header

Status: **done**. Standalone pass — no plan document; requested directly
(2026-07-28) as *"when selecting a brand, the main nav header should let me
switch between those as well, not just between workspaces."*

**416 → 426 tests (+10).** No migration, no schema change, no new API route,
no server or `shared` change. `packages/web` only.

## Goal

The header could switch **workspaces** and could only *name* the brand. A brand
is as much a **place** as a workspace is — you spend whole sessions inside one,
and moving between two of them meant going up to workspace home and back down
through the grid. So the brand gets the same control the workspace already had.

```
before   BrandFactory   [ Mission Group ⌄ ]   Casa Vostra / Copywriting
after    BrandFactory   [ Mission Group ⌄ ] / [ Casa Vostra ⌄ ] / Copywriting
```

## The load-bearing decision

**The brand moved out of the breadcrumb and into a switcher — it is not in both
places.** `Breadcrumbs.tsx` already carried the sentence *"Brand / project tail
only — workspace lives in the switcher"*, which is the precedent: a segment that
gets a switcher **leaves** the crumb trail. Keeping both would print the same
brand name twice within twelve pixels of chrome.

The pill is also strictly more capable than the crumb it replaces. The crumb was
a link to the brand hub; the pill reaches the brand hub *and* every sibling
brand. Nothing was lost in the trade.

Everything else below is downstream of that one choice — the trail type shrinks,
four routes stop reporting a brand, and the header grows a separator rule.

## What shipped

### 1 — `useActiveBrandId` (`lib/active-brand.ts`, new)

```ts
return params.brandId ?? project?.brand.id ?? null
```

Resolves the brand the shell is currently inside: the route param on a brand hub,
mini-app page or brand-context thread, and `project.brand.id` on a project page,
where there is no `brandId` in the URL at all.

**No storage fallback, unlike `useActiveWorkspaceId`** — and the asymmetry is the
point, so it is commented at the site. The shell always needs *a* workspace (the
wordmark and switcher point at one on every page), so a remembered id beats
none. A brand is contextual: on workspace home you are not in a brand, and a
switcher that claimed one would sit there offering to navigate you away from the
page you are on, to a brand you never picked.

The param is checked **before** the query, so a brand page renders its switcher
on the first frame rather than after a round-trip. `useProjectDetail` is already
mounted by `useActiveWorkspaceId` in the same header, so React Query dedupes it
and this hook costs no extra request.

**Named `active-brand`, not `brand-context`.** "Brand context" already means
something specific in this repo — the guidelines and the recorded conversation
(`BrandContextBar`, `brand-context` threads, `/brands/$brandId/context`). A file
by that name holding "which brand is the shell in" would be a collision on the
one term the 1.5.0 vocabulary is built around.

### 2 — `BrandSwitcher` (`components/BrandSwitcher.tsx`, new)

A deliberate near-clone of `WorkspaceSwitcher`: same `variant="outline" size="sm"`
pill, same `ChevronsUpDown`, same `max-w-56` truncation, same
`DropdownMenuRadioGroup`.

- **Radio semantics, not plain items**, for the reason `WorkspaceSwitcher`
  already records: the check mark is opacity-only, so without `aria-checked` the
  active brand is signalled visually and nowhere else.
- **`aria-description`, never `aria-label`.** An `aria-label` of "Switch brand"
  would *override* the button text and hide which brand is active from assistive
  tech. Copied deliberately, with the comment, because it is the kind of thing a
  well-meaning a11y pass "fixes" in the wrong direction.
- **Selecting a brand always lands on `/brands/$brandId`** — the hub, never the
  equivalent page under the new brand. A project id belongs to the brand you just
  left, and a mini-app category may have no thread in the brand you are entering.
- **`All brands`** navigates to workspace home. It is the escape hatch back out
  of the brand, occupying the slot `Workspace settings` occupies in the sibling
  component.
- `max-h-80 overflow-y-auto` on the menu — a workspace with thirty brands should
  scroll a menu, not a page.

**No "New brand…" item, on purpose.** `NewBrandDialog` is still defined *inline*
inside `routes/workspaces.$wsId.index.tsx` (rendered twice there — header and
empty state). Extracting it is a real change to a route this pass otherwise
doesn't touch, and `All brands` already lands on the page that owns creation.
Recorded so the omission reads as a decision rather than an oversight — and note
that `docs/executing/brand-research-onboarding.md` Phase A wants to grow that
same dialog, so whoever extracts it should do it there.

### 3 — the label, and why there is no placeholder

```ts
const label = brands?.find((b) => b.id === brandId)?.name ?? brand?.name
if (!token || !brandId || !label) return null
```

Two name sources, in that order. `useWorkspaceBrands` is the list the menu needs
anyway; `useBrand` is the fallback that matters on a **deep link into a project**,
where the brand detail is already cached by the page itself but the
workspace-wide brand list is a second request still in flight.

When neither has resolved, the component renders **nothing** rather than a
placeholder. Unlike the workspace switcher there is no "Select brand" state worth
offering — you are either inside a brand or you are not — and a placeholder here
would flash on every navigation into a brand.

### 4 — the separator rule (`routes/__root.tsx`)

**Each header segment renders its own *leading* separator.** Stated in the header
comment and followed by both `BrandSwitcher` and `Breadcrumbs`.

The alternative — the header emitting `/` between children — cannot work, because
both of those children return `null` on most pages and the header cannot see it.
That is how you get an orphan divider floating next to the workspace pill on
workspace home. Owning the separator means owning its absence.

The switchers and the trail also moved into one `min-w-0 flex-1` row, so
truncation happens inside the group and the row cannot push `ThemeToggle` off the
right edge.

### 5 — the breadcrumb sheds its brand (`components/Breadcrumbs.tsx`)

`BreadcrumbTrail` loses `brand` entirely; the component is now *the tail only*
(project name, or a mini-app / brand-context `leaf`), preceded by its own `/`.
`Link` is no longer imported — with the brand gone, nothing in the trail is a
link, because the tail is always the page you are already on.

Four call sites follow:

| Route | Before | After |
| --- | --- | --- |
| `brands.$brandId` | brand only | **no call** — the hub *is* the brand, and the pill names it |
| `brands.$brandId.context` | brand + leaf | `{ leaf: 'Brand context' }` |
| `brands.$brandId.apps.$appId` | brand + leaf | `{ leaf: app.title }` |
| `projects.$projectId` | brand + project | `{ project }` |

Removing the call from the brand hub outright — rather than leaving
`useBreadcrumbTrail({})`, which reads like a segment someone forgot to fill in —
is safe because **every route is a flat child of `rootRoute`** (verified in
`router.tsx`: nine `addChildren`, all `getParentRoute: () => rootRoute`). No
route is a parent that stays mounted while a child sets a trail, so the
`return () => setTrail({})` cleanup on the departing route is what clears it.
Under a nested tree this would have been a stale-crumb bug.

Two of those routes also stop needing `brand` for the trail specifically, but all
still read it for their own rendering — no query was removed.

## Tests (+10)

| File | Δ | What |
| --- | --- | --- |
| `components/BrandSwitcher.test.tsx` (new) | +8 | trigger named after the active brand; renders nothing outside a brand; resolves the brand from a *project* route with no `brandId` param; falls back to the brand detail while the list loads; renders no pill when no name has resolved; `aria-checked` on the active row; select navigates to the **hub** of the chosen brand; `All brands` navigates to workspace home |
| `components/Breadcrumbs.test.tsx` | 3 → 5 | nothing without a tail; project tail; leaf tail; project wins over leaf; **never renders a brand segment** |

`useActiveBrandId` is deliberately **not mocked** in the switcher suite — route
params and `useProjectDetail` are. Brand resolution is the part worth pinning,
and a mocked resolver would have tested the mock.

Mutation checks (both restored after):

- Drop the `project?.brand.id` fallback in `useActiveBrandId` → **3 failures**,
  including the project-route resolution and the hub-navigation case.
- Drop the `?? brand?.name` label fallback → the loading-fallback test fails.
  Without it, a deep link into a project shows no pill until the workspace brand
  list lands.

## Deviations and findings

1. **The scope grew by one file beyond "add a switcher".** Removing the brand
   from the breadcrumb was not asked for literally, but rendering both was never
   a coherent option — the two controls would have named the same brand side by
   side. Flagged because it touches four routes and a shared type, which is more
   blast radius than "a new component" implies.
2. **The `min-w-0 flex-1` wrapper is a layout change to the shell**, not just an
   addition. Previously only `Breadcrumbs` sat in the flexible column; now all
   three segments do. Reasoned from the box model — see the caveat below.
3. **`BrandSummary` was already the right shape.** `useWorkspaceBrands` returns
   the row plus counts, so the menu needed no new endpoint, no new query key, and
   no server change. The switcher is pure composition over what 0.9.0 shipped.
4. **The workspace switcher was left alone.** It persists `setLastWorkspaceId` on
   select; the brand switcher has no equivalent, because there is no stored
   last-brand and (per §1) there should not be one.

## Verification

```
pnpm typecheck      9/9 workspaces
pnpm lint           clean
prettier --check    clean (Breadcrumbs.test.tsx reformatted once, then clean)
pnpm test           426 passed | 10 skipped (436)
```

Caveats, stated the same way the 1.5.0 phases state them:

- **The 10 skips are the live-Postgres suites** (no Docker daemon locally, so
  `DATABASE_URL` is unset). This pass touches no `db` or `server` code at all, so
  nothing in it could be covered by them. CI runs them against a Postgres 16
  sidecar.
- **The 426 includes the uncommitted Supabase session-refresh work** already in
  the tree (`auth/session.ts`, `AuthBoundary`, `realtime/client`). The `+10` is
  this pass; the absolute number is not a clean 1.5.0 baseline.
- **No live browser pass.** Three things here are reasoned, not observed:
  1. **Pill spacing and rhythm** — two outline pills plus two `/` separators in a
     48px header, next to the wordmark. The `gap-3` → nested `gap-2` split is a
     judgement made in code.
  2. **Truncation with a long brand name** — `max-w-56` on the pill and
     `min-w-0` on the row should shrink rather than overflow, the same class of
     flexbox defect 1.5.0 Phase B4 actually found in `SectionRow`.
  3. **Menu placement over a real page** at `align="start"` with 30+ brands
     scrolling inside `max-h-80`.

## Files touched

| Action | Path | What |
| --- | --- | --- |
| New | `packages/web/src/lib/active-brand.ts` | `useActiveBrandId` |
| New | `packages/web/src/components/BrandSwitcher.tsx` | the pill |
| New | `packages/web/src/components/BrandSwitcher.test.tsx` | +8 |
| Edit | `packages/web/src/routes/__root.tsx` | switcher in the header, separator rule, flex row |
| Edit | `packages/web/src/components/Breadcrumbs.tsx` | brand removed from trail + render; `Link` import dropped |
| Edit | `packages/web/src/components/Breadcrumbs.test.tsx` | 3 → 5 |
| Edit | `packages/web/src/routes/brands.$brandId.tsx` | trail call + import removed |
| Edit | `packages/web/src/routes/brands.$brandId.context.tsx` | leaf-only trail |
| Edit | `packages/web/src/routes/brands.$brandId.apps.$appId.tsx` | leaf-only trail |
| Edit | `packages/web/src/routes/projects.$projectId.tsx` | project-only trail |

**Untouched:** `packages/shared`, `packages/db`, `packages/server`,
`packages/agent`, `packages/adapters/*`. No migration, no wire-contract change.

## Follow-ups

- **The live look** — items 1–3 under Verification. Cheapest to fold into the
  browser pass that `docs/executing/brand-research-onboarding.md` Phase G already
  commits to running.
- **`NewBrandDialog` extraction** — would let the switcher offer "New brand…"
  and is wanted anyway by the research-onboarding Phase A, which grows that same
  dialog.
- ~~**No changelog entry yet.**~~ Outlined as **1.6.0** in `docs/changelog.md`
  (with the session-refresh fix as 1.5.1, since it is in this pass's baseline).
