# Phase D — registry, routes, nav: the shelves become reachable

**Status:** complete, 2026-08-04. Written against `main` at **1.21.3** +
Phases A–C.

Executes §6 of
[`docs/executing/visual-identity-and-the-library.md`](../executing/visual-identity-and-the-library.md).
**The first user-visible phase**, and per §6 an indivisible one: the registry
rows, the routes they point at, the redirect off the old one and the nav group
that shows them are four halves of one change, and any split ships a row that
points nowhere.

`Visual identity` stops being a tile. The hub grid is four cards. Three shelves
exist at their own paths, under one `Library` nav group. 8 source files, 6 test
files, +18 tests.

---

## 1. What a user sees now

```
Overview
Apps       Copywriting · Studio · Social calendar · Open canvas     ← was five
Library    Visual identity · Photography · Collateral              ← new group
Brand      Brand context
```

- The hub's Workspace grid is **four tiles**, which is the 2×2 its own comment
  has described since it was written.
- `/brands/:id/identity`, `/photography`, `/collateral` each render the asset
  library filtered to that shelf, and light their own nav row.
- Each shelf row counts **its own** assets.
- `/brands/:id/apps/visual` — live since 1.10.0, linked from the rail, plausibly
  bookmarked — redirects to `/identity`.

## 2. The type carries the constraint the plan wanted a test for

§D3 says: *"the type makes `to` required on non-tile rows if it can be expressed
cheaply, and a test covers it if it cannot."* It can, so it does.

`MiniApp` is now a three-arm discriminated union on `surface` rather than one
object with optional keys:

```ts
type TileApp    = MiniAppShared & { surface: 'tile';    to?: never; library?: never }
type LibraryApp = MiniAppShared & { surface: 'library'; to: MiniAppTo; library: AssetLibrary }
type BrandApp   = MiniAppShared & { surface: 'brand';   to: MiniAppTo; library?: never }
```

Two things follow, and both replace a runtime guard with a compile error:

- **`beforeLoad` needs no `&& app.to`.** Narrowing `app.surface !== 'tile'`
  leaves the two arms that have one. The plan's proposed guard existed to stop a
  row with no `to` silently rendering the second unintended surface; the type
  makes that row unconstructable.
- **A tile row cannot acquire a `to`**, and a library row cannot exist without
  naming its shelf.

`LIBRARY_APPS` uses a type predicate (`(app): app is LibraryApp`) rather than a
bare `filter`, because the nav group is built from `app.to` and `app.library` —
both absent on the union.

### The type caught the missing routes before the tests did

Adding `to: (brandId) => ({ to: '/brands/$brandId/identity', … })` to the
registry **failed to compile** until the routes existed, with TypeScript listing
the ten paths the router did know. That is §2.2's argument demonstrated rather
than asserted: a `path: (brandId) => string` would have compiled, shipped, and
404'd.

## 3. Three routes, written out

`routes/brands.$brandId.library.tsx` — one file, a deliberate exception to the
one-route-per-file convention, since the three differ in a path literal and a
constant and would otherwise be three copies of one auth guard.

Two things that look factorable and are not, both recorded in the file:

- **Literal paths, not `/library/$library`.** A param route would accept
  `/library/moodboard` at the type level and need a runtime guard to 404 it.
  Three static paths are checked by the router — which is what makes
  `MiniApp.to`'s return assignable to both `NavItemProps.link` and `redirect()`
  with no cast.
- **Three route objects, not a factory.** I wrote the factory first and deleted
  it: its return type erases the path literal, and the router's `to` union is
  built from exactly those literals. It would have bought nine lines and spent
  the type-safety the whole design is for.

`VisualIdentityPage` → **`AssetLibraryPage`**, renamed (with its test) and given
`library` and `title` props; its `app: MiniApp` prop is gone, since a shelf route
has no registry row in scope. Titles come from `LIBRARY_APPS` so a heading cannot
disagree with the nav row that was clicked.

Three creators stamp the shelf. **`handleAddColor` passes `'identity'` always,
not the prop** — a colour is identity wherever you are standing, and passing the
prop would make a photography-shelf swatch representable the moment the
Add-colour row renders somewhere else. That guard is one word, so it has a test.

`blobKeys` is computed from the **filtered** list: three shelves each re-signing
every blob in the brand is three times the work, and each signature is a request.

## 4. Two things the plan did not have

### 4.1 The rail's Palette link would have silently vanished

§D6 says `visualHref`/`paletteHref` stay until Phase E, and that between D and E
the heading links to `/apps/visual` and redirects — *"correct, just one hop long.
No half-state."*

But `visualHref` was derived from `tiles.find((a) => a.id === 'visual')?.enabled`,
and `visual` is no longer in `TILE_APPS`. The `find` returns `undefined`, the
gate fails, and **the heading quietly becomes plain text** — a half-state, in the
one phase the plan says must not have one. §2.7 listed the tile-href assertion as
breaking and not this one.

Fixed by deleting the gate rather than repairing it, and pointing straight at
`/identity`:

```ts
const visualHref = `/brands/${brand.id}/identity`
```

The gate existed for exactly one state — the `Coming soon` stub before 2E, where
a link to a page saying "later" is the dead affordance 1.7.0 spent a pass
removing. **A shelf has no such state.** It exists on every brand, so no registry
can now produce the unlinked case, and the test that asserted it was deleted with
it rather than left asserting something unreachable.

### 4.2 `brandNavKey` — the arm §2.4 predicted, with the wildcard it warned about

Added as specified, matched off a **literal alternation** of the three segments.
The alternative is one character shorter and wrong: `([^/]+)` would turn every
unrecognised `/brands/:id/anything` into `library:anything` and light a row that
does not exist. `null` — *"a brand-scoped page with no row of its own"* — is the
honest answer, and three assertions pin it.

## 5. What was left alone, deliberately

- **The `Brand` group's `context` link stays a literal.** §D5 offers reading it
  off the row *"if it stays a simplification"*. It does not: `miniAppById`
  returns the whole union, where `to` is absent on tile rows, so it needs `?.`
  and a fallback literal — two spellings of one path where there was one.
- **The fourth "connected source" nav row is not built**, per the plan.
- **`AssetLibraryView` is untouched.** Its derived sections still misfile a PNG
  menu; F2 deletes those derivations rather than adjusting them.
- **The hub's right column still has one card.** Phase E.

## 6. Mutation-verified

`countOf`'s ordering is the one piece of this phase whose failure is silent —
all three shelves are `unit: 'asset'`, so the wrong order produces three
identical numbers rather than an error. Moving the library arm below the
`unit === 'asset'` arm turns the new fixture red (`Visual identity3` for a brand
with 2 identity and 1 collateral asset) and every other test in the file green.
Restored.

## 7. The files

| File | Change |
| --- | --- |
| `components/brand/miniApps.ts` | the three-arm union; `MiniAppTo`; `id` grows two members; `visual` → `surface: 'library'`; two new rows; `context` → `'brand'`; `LIBRARY_APPS` |
| `routes/brands.$brandId.library.tsx` | **new** — three routes, one component |
| `components/brand/AssetLibraryPage.tsx` | **renamed** from `VisualIdentityPage`; `library`/`title` props; filters; stamps; `Shell` takes a string |
| `routes/brands.$brandId.apps.$appId.tsx` | redirect reads `app.to`; the `unit: 'asset'` dispatch and its import go; header four shapes → three |
| `router.tsx` | three routes registered |
| `lib/nav-active.ts` | the `library:` arm |
| `components/nav/BrandNavPanel.tsx` | the `Library` group; `countOf`'s library case, first |
| `components/brand/BrandHubView.tsx` | `visualHref` (§4.1) |
| 6 test files | see below |

**Tests 1421 → 1439 (+18).** `miniApps.test.ts` +5 (LIBRARY_APPS, the shelf
names, the typed destinations, the two rows that claim nothing);
`BrandNavPanel.test.tsx` +5; `nav-active.test.ts` +4; `AssetLibraryPage.test.tsx`
+3; `brands.$brandId.apps.$appId.test.tsx` +3 (the redirect case became an
`it.each` over four rows); `BrandHubView.test.tsx` −1 (§4.1). Skips unchanged.

## 8. Verification

```
pnpm typecheck                    clean — all 10 packages
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1439 passed | 68 skipped (135 files)
pnpm -F @brandfactory/web build   clean — 7864 modules
```

## 9. Caveats

- **Not seen in a browser** — and this is the phase where that starts to matter.
  Three new routes, a tile removed and a nav group added; jsdom has confirmed
  every href, every count and every active row, and confirmed nothing about how
  the 2×2 grid sits against the rail now that it is not a 3+2. Phase G, which is
  non-skippable.
- **The `Library` group is the only way to a shelf.** The stated cost of
  libraries-not-tiles: a tile is on screen when you open a brand, a shelf is one
  click. Phase E's card adds the hub's own entrance. If the live pass finds it
  too quiet, promoting one shelf back to a tile is a one-word registry change —
  which is the property that made this safe to decide.
- **`AssetLibraryView` renders the same four derived sections on all three
  shelves.** So Photography and Collateral currently show a page shaped like the
  identity one, filtered. It is coherent, and F1–F2 is what makes each shelf read
  as itself.
