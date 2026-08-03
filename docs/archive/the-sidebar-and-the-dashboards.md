# The sidebar, and the dashboards that stop being navigation

**BrandFactory navigated through a 48-pixel strip.** Since 0.9.0 the shell has
been a header band holding a wordmark, a workspace pill, a brand pill and a
one-segment breadcrumb tail, and every pass since has added one more thing to
it — create in 1.12.0, the research chip in 1.13.0 — because a strip is the only
furniture a shell with no other furniture has. Underneath it, both dashboards
were doing double duty: workspace home opened on a grid of brand cards because
the grid was also the *only way to reach a brand*, and the brand hub opened on a
2×2 of app tiles for the same reason.

This pass gives the app the shape the Mission Systems styleguide has described
all along (§7.1: *a persistent left side-nav plus a scrollable content area, no
separate top bar*), and then takes the navigation **out** of the two pages that
were carrying it.

The result is two stacked columns:

```
┌────┬──────────────┬────────────────────────────────────┐
│ ▣  │ Casa Vostra ⌄│  Casa Vostra                       │
│ ── │              │  Neighbourhood trattoria.          │
│ CV │ ▸ Overview   │                                    │
│ AC │              │  Start something                   │
│ MG │ APPS         │  ┌──────────┐ ┌──────────┐         │
│ +  │  Copywriting3│  │Copywriting│ │Visual id.│  ┌─────┐│
│    │   Winter ads │  └──────────┘ └──────────┘  │Brand││
│    │   Names v2   │  ┌──────────┐ ┌──────────┐  │ctx. ││
│    │  Visual id 12│  │Social  ⌐ │ │Open canv.│  │rail ││
│    │  Social  Soon│  └──────────┘ └──────────┘  └─────┘│
│    │  Open canvas2│                                    │
│    │              │  Recent threads                    │
│    │ BRAND        │  ┌────┐┌────┐┌────┐┌────┐          │
│ ◧  │  Brand ctx  1│  └────┘└────┘└────┘└────┘          │
│ ☀  │ ────────────  │                                    │
│    │ ◌ Researching │                                    │
└────┴──────────────┴────────────────────────────────────┘
  56px      240px                 content
```

---

## 1. Why the rail is the brands

The first column could have been anything. It is the brands because
`docs/vision.md` opens on the brand being the centre of gravity — every creative
surface exists *in the orbit of one* — which makes switching between them the
motion this product makes most often. 1.6.0 added a header pill for exactly that
reason and 1.12.0 hung create off it; both are menus, so every switch costs an
open, a read and a click. A rail costs one click, and it costs the same one from
inside a project thread as from the hub.

It also finally gives `BrandMark` the job it was designed for. The monogram's hue
is derived from the brand **id**, not its name (`brandHue`), specifically so a
rename does not recolour a mark somebody has learned — which is what makes a
column of two-letter squares navigable by muscle memory rather than by reading.

**Two brand switchers, on purpose, because they are different gestures.** The
rail is *recognition*: a mark you know, one click, no menu, from any page. The
panel header (`BrandSwitcher`, moved out of the strip) is *recall*: the full list
by name, capped and scrolling, with `New brand…` and `All brands` attached. A
56px rail cannot hold thirty legible names; a dropdown cannot be hit without
being opened first. A workspace of sibling brands wants both.

`WorkspaceSwitcher` becomes the tile at the head of the rail — §7.2's first item,
*square accent tile, workspace name*. The name it can no longer show comes back
as the menu's own label. Both triggers keep the property their 1.6.0 comments
were written to protect: **the accessible name is the workspace / the brand**,
never "Switch workspace". The tile carries the name in an `sr-only` span rather
than an `aria-label`, which would have replaced it.

One correction those two needed on the way: both had `aria-description`, which
was fine on a shadcn `<Button>` and is a lint error on a raw `<button>` — it is
an ARIA 1.3 draft attribute that the role does not support. They use
`aria-describedby` pointed at a **sibling** `sr-only` span; a descendant would
have been folded into the accessible name as well, which is the thing being
protected.

## 2. The panel is scoped, not routed

`AppSidebar` asks `useActiveBrandId` — the same resolver the old pill used — and
shows the brand panel whenever it answers, the workspace panel when it does not.

That distinction is load-bearing on exactly one route. A project path is
`/projects/:id`: it names no brand and no category, so a panel keyed on the route
would empty itself the moment you opened a thread — the page a persistent
navigation is *most* worth having. `useActiveBrandId` resolves the brand from the
loaded project detail, so the panel stays put.

**The registry is the nav.** `TILE_APPS` already knows the app list, which ids
are live, what each counts (`MiniApp.unit`) and which threads belong to each
(`match`). Every row is derived from it. A second hand-written list is how a
mini-app ends up on a tile and invisible in the navigation, or the reverse — the
exact split `miniApps.ts` was written to prevent one level down.

**Threads nest under the category you are in.** This is the payoff of a sidebar
over a header and the one place the panel is more than a list of pages: before
it, moving between two copywriting threads meant going up to the category page
and back down. The open thread is marked with `aria-current`; the categories you
are not in stay one line each.

Active state is resolved by `lib/nav-active.ts` from `location.pathname`, not
from params — three brand routes carry the same `brandId` and are told apart only
by path shape. Pure functions, so the mapping is tested without a router (8
tests), including the case that matters most: **a project route lights no
category row**. A thread is reached *through* Copywriting but is not Copywriting,
and lighting the row would claim a list page is on screen when it is not.

## 3. What the header strip became

| was | is |
| --- | --- |
| wordmark | the rail's workspace tile (and a `lg:hidden` bar on narrow screens) |
| workspace pill | that tile's menu |
| brand pill | the brand panel's header |
| breadcrumb tail | **deleted** |
| research chip | the brand panel's footer |
| theme toggle | the rail's foot |

**`Breadcrumbs.tsx` is deleted rather than moved**, along with its five tests and
the `useBreadcrumbTrail` call in three routes. The trail was one segment deep by
construction — `BreadcrumbTrail` is a project *or* a leaf, never both — and every
route that set one now has its own row in the panel two columns left, lit, with
its siblings under it. That is the argument the trail's own doc comment used when
it dropped the brand crumb after the brand pill arrived, applied one level on to
the trail itself.

The research chip's move is a small upgrade, not a relocation. It renders only
while a run is `IN_PROGRESS` (its own note explains why terminal states belong on
the hub), so the footer is empty on almost every page — but when it is not, it
sits beside the brand the run belongs to instead of in a strip shared with every
brand's chrome. `empty:hidden` on the container is what keeps a bordered empty
strip from appearing the other 99% of the time.

**A cost this pass introduced and had to pay back:** the old header held four
controls, and the sidebar holds a row per brand, a row per app and every thread
of the current category — all before the content in DOM order. Reaching the page
by keyboard would mean tabbing the whole navigation on every load. `__root` now
opens with a `sr-only focus:not-sr-only` **skip link**, and `<main>` takes
`tabIndex={-1}` so focus can actually land there rather than the page merely
scrolling.

## 4. The brand hub stops being a menu

The tile grid *was* this page's navigation. It no longer has to be, so the hub
keeps the half a nav row cannot do and gives up the half it duplicates:

- **Kept** — a sentence saying what each category is *for*, and a way in to start
  one. `Apps` becomes `Start something`.
- **Given up: the per-tile thread count.** It is the same number, 200px away,
  now permanently on screen in the nav. A number wants to be where the choice is
  made — the nav is on every page of the brand, the tiles are on one of them.
  `MiniAppTile` needed no change at all: the hub passes the `null` that already
  meant *not known, say nothing*.
- **Given up: the `Other threads` catch-all.** It was a list of threads filed by
  what they are *not*; the panel carries it as a group, beside the categories it
  is defined against.
- **Gained: `Recent threads`** — the brand's last four, newest first, across
  every category including unregistered ones. The counts said how much there
  was; this says what you were last doing, which is what somebody opening a
  brand at 9am is actually asking.

`Recent threads` keeps the distinction the rest of this component runs on:
`undefined` is *not known* and says nothing at all, `[]` is *none* and gets an
invitation. A brand with forty threads must not be told it has none for the
100ms before the query lands. The sort is on a copy — `projects` is React
Query's cached array, and an in-place sort mutates it.

The right rail (`BrandContextRail`, 41 tests) is **untouched**. It answers *what
do we know about this brand*, which is not navigation and never was.

## 5. Workspace home stops being a menu too

Same move, one level up. The brand grid was the only way to reach a brand from
here; the rail and the panel both list every brand on every page now, so the grid
is no longer the way *in* — it is the way to *survey*, which is why it keeps its
full detail (description, host, section meter, project count) where a nav row is
a name and a number.

What goes above it is `Pick up where you left off` — recent work across every
brand, which is the one thing the sidebar cannot show you. It renders only when
there is something in it: on a fresh workspace a heading over a sentence
explaining its own absence would stand between the user and the single thing the
page is asking them to do.

The header gains a summary line, and it is **counts, never a score**:
`4 brands · 18 threads`, summed from `BrandSummary.projectCount`, which is
already on that wire — no request of its own. A percentage or a completeness bar
here would be the D2 violation `GuidelineMeter` documents, one level up: a
workspace, like a brand, is not deficient for being small. It is `undefined`
while the list is unknown, so no page ever flashes `0 brands`.

`BrandCard` gains the monogram. That is what lets a first-time user learn a name
and a coloured square as one thing on this page, and then use the square as a
one-click destination on every other page.

## 6. `PageHeader`

Four routes were spelling out §7.1's *title and primary action at the top of the
content* — three with the same `mb-6 flex items-start justify-between gap-4` and
the settings page without, which is how it ended up with its heading a different
distance from its first field than every other page in the app. One component
now, with `action` as a **slot** rather than a `label` + `onClick` pair: two of
the four call sites pass a dialog trigger, not a button.

---

## Files

**New**

| file | what |
| --- | --- |
| `lib/nav-active.ts` | `brandNavKey` / `workspaceNavKey` / `projectNavId` — pure path → active row |
| `lib/sidebar-prefs.ts` | panel fold, persisted; same swallowed failure as `last-workspace` |
| `components/nav/NavPrimitives.tsx` | `NavGroup` (the product's one uppercase string, §7.3), `NavItem`, `NavAction` |
| `components/nav/BrandRail.tsx` | the 56px column |
| `components/nav/BrandNavPanel.tsx` | apps, counts, nested threads, research footer |
| `components/nav/WorkspaceNavPanel.tsx` | overview, brands by name, settings |
| `components/nav/AppSidebar.tsx` | composition, scope choice, fold, `lg:hidden` drawer |
| `components/layout/PageHeader.tsx` | title / description / action |

**Changed** — `routes/__root.tsx` (shell), `WorkspaceSwitcher` (rail tile),
`BrandSwitcher` (panel header), `BrandHubView`, `routes/workspaces.$wsId.index`,
`BrandCard` (mark), `MiniAppTile` (one comment, which claimed the app had no side
nav), and the four routes that adopt `PageHeader` or drop `useBreadcrumbTrail`.

**Deleted** — `components/Breadcrumbs.tsx` + its test.

## Verification

```
pnpm typecheck                    10/10 workspaces
pnpm lint / format:check          clean
pnpm test                         1024 passed | 49 skipped (113 files)
pnpm -F @brandfactory/web build   clean
```

986 → **1024 (+38)**. New: `nav-active` 8, `BrandNavPanel` 9, `AppSidebar` 7,
`BrandRail` 6, `WorkspaceNavPanel` 6, `PageHeader` 4. Removed: `Breadcrumbs` 5.
`BrandHubView` went 11 → 16, and the two tests it lost were both encoding the
behaviour this pass replaces — the per-tile count and the `Other threads`
heading.

The 49 skips are live-Postgres and **were not run**: no Docker daemon and no
`.env` here, unchanged from 1.11.2's standing warning. Nothing in this pass
touches SQL.

**No live pass.** No database means the app cannot boot, so none of this has been
on a screen. What is verified is the DOM (every panel, the rail and the shell are
tested from rendered output), the compiled CSS and the production build. What
reasoning cannot settle, in rough order of how likely it is to be wrong:

1. **The rail at the top of the cardinality range.** Thirty-plus brands scroll
   inside a 56px column between a fixed tile and a fixed control block; the
   `min-h-0` that lets it shrink rather than overflow is reasoned from the flex
   rules, not observed.
2. **Two panel headers at `h-16`.** They are set to the same height so the
   divider under them does not jump when the shell changes scope, but the brand
   header's contents are a 32px mark inside a padded button and the workspace
   header's are one line of text.
3. **The `lg` breakpoint.** 296px of chrome plus a `max-w-6xl` hub is comfortable
   at 1440 and untested at 1024, which is exactly where the drawer hands over to
   the static sidebar.
4. **Nested threads under a busy category.** Capped at eight
   (`MAX_NESTED_THREADS`) with no "show all" row — the category page is one click
   away and lists everything, but whether eight is the right number is a judgement
   made without ever seeing nine.
