# Brand toggle in the nav

**Status:** complete, 2026-08-17. Written against `main` at **1.31.0**
(1982 passed | 78 skipped before this change).

The first BrandFactory feature built *into* `packages/web-next` rather than
inherited from the Operations Hub. A brand toggle sits at the top of the side
nav, under the product identity, and switches which brand the shell is inside.

**No server change, no migration, no model.** 4 files added, 3 modified.
**1982 passed | 78 skipped** — no test added; the package still has none.

---

## 1. The feature already existed, minus its data

`features/brands/` arrived with the shell in 1.31.0 and was complete: a service
layer, `useBrand`, `useBrandPages`, mutations, and `useBrandIndex` — which walks
the cursor to exhaustion and returns `{brands, byId, isLoading}`. It answered
nothing only because no mock route was registered for `/brands`, so rule 2 of
`lib/api/mock.ts` returned `EMPTY`.

So the data half of this change is **one fixture file and two lines in the route
table**. Nothing in `features/brands/` was touched. That is the point of the
shape the package already had, and it is worth stating plainly: the second real
screen should check what upstream already built before writing a hook.

| | |
| --- | --- |
| `fixtures/brands.ts` | 6 brands, fixed ids, mixed status |
| `lib/api/mock.ts` | `GET /brands` (with `q` + `status`), `GET /brands/:id` |
| `features/brands/*` | **untouched** |

`page()` already returns `next_cursor: null`, which is what stops
`useBrandIndex`'s exhaustion walk. A fixture that paged would loop.

## 2. The active brand is a preference, not a route

Nothing in this shell is brand-scoped. There is no `/brands/:id` to navigate to
— the Vite app's switcher navigates, and this one cannot — and no filter to put
in the URL. `useQueryFilters` would be the wrong home even later: that hook
exists to make one *screen's* view pasteable, and this selection outlives every
navigation.

`localStorage`, then. The same call the root `CLAUDE.md` records for
`sidebar-prefs.ts` and `key-dates-prefs.ts`: a user preference is not a column.

**`useSyncExternalStore`, not `useState` + an effect.** Reading storage during
render is wrong on the server, and seeding it from an effect is
`react-hooks/set-state-in-effect`, which fails this build — the rule
`hooks/use-mobile.ts` was rewritten for. This is the second use of that shape in
the package and the file points at the first.

Three details that are not obvious:

- The server snapshot is `null`. There is no storage during SSR, and guessing a
  brand would put the wrong name in the static HTML.
- The `storage` event fires in *other* tabs only, so a write notifies a
  module-level listener set as well, or the toggle would not re-render on its
  own click.
- A stored id naming a deleted brand falls through to `brands[0]` and is
  **never written back**. Correcting it would be a write during render — the
  exact thing the store exists to avoid. It corrects itself on the next pick.

There is no context provider. Both halves are already global and deduplicated —
SWR shares the index by key, the store is a module singleton — so a provider
would be a tree to thread with nothing to keep in it. `useActiveBrand()` is the
seam every future brand-scoped screen reads.

## 3. Two rows, because they are two different things

The user chose this over replacing the identity row. The product identity is
fixed text; the brand is a control. Stacking a clickable name under two static
ones makes neither read as what it is, so a hairline separates them and the
header's padding moved onto each row so that hairline runs full width.

**The mark is on the trigger and on nothing in the menu.** The brand hue is the
one colour on screen allowed to be the customer's rather than the product's, and
the accent rule (§4) is one element per surface. Six coloured squares stacked in
a dropdown spends that budget six times and turns recognition into noise. The
menu is names.

`BrandMark` is ported from the Vite app minus its `src` prop — the declared-logo
branch, which needs brand assets this shell has no fixture for. `brandInitials`
and `brandHue` are copied exactly so the two apps agree while both exist. The
two `oklch` lines go in `globals.css` beside the base layer and are deliberately
**not** a token: tiers 1–3 are the product's palette, and a token holds one
value where this needs one per brand.

Status badges render on non-active brands only. A badge on all six is a column
of noise; a badge on the two you are not expecting is the whole signal —
without it a retired brand is indistinguishable from a live one.

No `New brand…` and no `All brands`. The first is a `POST` the fixture backend
refuses with a 503, the second has no route here. An item that opens a toast
saying it does not work is worse than its absence.

## 4. The Radix-shaped bug that passed every gate

`DropdownMenuRadioItem` was written with `onSelect={() => select(b.id)}`, which
is the Radix shadcn API. **Base UI's `Menu.RadioItem` takes `value` and
`closeOnClick` and nothing else**; selection is reported by the group's
`onValueChange`.

It failed *silently*. React has a real DOM `onSelect` — the text-selection event
— so the prop type-checked, and `pnpm typecheck`, `pnpm lint` and `next build`
all passed. The menu opened, ticked, closed on click, and never switched brand.

This is `AGENTS.md`'s standing warning ("shadcn here sits on Base UI, not
Radix") in a new position: the documented trap is `render=` vs `asChild`, which
fails loudly at the type check. This one does not fail at all. **Found by
clicking it**, which is the only thing that could have found it.

## Verification

```
pnpm typecheck                         clean (11 packages)
pnpm lint / format:check               clean (whole repo)
pnpm test                              1982 passed | 78 skipped (159 files)
pnpm -F @brandfactory/web build        clean
pnpm -F @brandfactory/web-next build   clean — 27 routes
```

In the browser against `next start`: the toggle renders under the identity row,
the menu lists all six brands with the tick on the active one and `Dormant` /
`Retired` on the two that are not active, selection switches the trigger and its
hue, and the choice survives a navigation. The accessibility tree reports the
button as `"Marina Green"` — the monogram is `aria-hidden`, so the brand name is
the accessible name and `Switch brand` is its description. Console clean on
load: no hydration warning, which was the risk `useSyncExternalStore` carried.

## Caveats

- **Nothing responds to the selection yet.** Every screen in this shell is
  fixture-backed Operations Hub, and none is brand-scoped. The toggle is the
  shell affordance landing ahead of the screens that will read it. Switching
  brand changes the header and nothing below it.
- **The brands are fixtures**, not the real `GET /workspaces/:id/brands` on the
  Hono server. Wiring that needs auth, which this package does not have.
- **`entities.brand_id` is still `null` on every row.** The fixture names match
  the entities they read as the brand of, but linking them is a change to the
  Entities screen, which has no door in the nav.
- **No test.** The package still has none, per 1.31.0's note; tests arrive with
  the harness rather than with this screen.
- **`next dev` still does not hydrate** (1.31.0's open defect). This was built
  and verified against `next build` + `next start`.
