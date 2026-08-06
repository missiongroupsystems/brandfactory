# Phase C — server: where the default is resolved

**Status:** complete, 2026-08-04. Written against `main` at **1.21.3** +
Phases A–B.

Executes §5 of
[`docs/executing/visual-identity-and-the-library.md`](../executing/visual-identity-and-the-library.md).
Small phase, and the one that makes the column reachable: `defaultLibraryFor`
gets its second caller, and **Move to… starts working end to end** without a
line of code being written for it.

**`pnpm typecheck` is green across all 10 packages** for the first time since
A2 — the gate this phase exists to reach. 3 source files modified, 7 test files,
+12 tests.

---

## 1. What landed

### C1 — the route resolves the default

```ts
const library = body.library ?? defaultLibraryFor({ kind: body.kind, role: body.role ?? null })
```

One line, and it is the whole of the wire asymmetry Phase A built: `library` is
optional on `CreateBrandAssetInputSchema` and required on `BrandAssetSchema`, so
something has to close the gap, and this is it. Every client written before the
column keeps posting unchanged.

This is the second of `defaultLibraryFor`'s two callers. The other is migration
0010's `CASE`, which has now run and will not run again — so from here the
function has exactly one live caller, and this is it.

### C2 — the append scope becomes `(library, kind)`

```ts
const sameShelf = existing.filter((a) => a.library === library && a.kind === body.kind)
```

Cosmetic rather than a correctness fix, exactly as the plan says: positions are
only ever compared within a rendered section, so nothing is *wrong* today. What
it prevents is the first photograph a brand files taking its number from the
collateral shelf and landing at 600 — an ordering nobody chose, in a list of one.

### C3 — the patch already carried it

Nothing to write. `UpdateBrandAssetInputSchema` (A3) is what the route
validates, `deps.db.updateAsset` (B4) accepts the key, and the route passes the
body straight through. **A `{ library }`-only patch is Move to…, and it works as
of this phase** — the feature is three layers of plumbing and no feature code.

The route comment now says so. The point is not documentation for its own sake:
a one-key patch that no code in this repo branches on reads like a column that
leaked onto the wire, and the next reader needs to know it is the product.

### C4 — the fake takes `library` and defaults nothing

`test-helpers.ts` mirrors the real `createAsset`: `library: input.library`, with
no `??`. The file's own rule is *"every one of these mirrors the real query
rather than doing something simpler"*, and here that rule is load-bearing — a
fake that resolved `defaultLibraryFor` itself would let every route test in §2
pass with C1 deleted.

## 2. The tests are mutation-verified

Twelve new cases, and the useful question is whether any of them would notice if
the code went away. Both new behaviours were deliberately broken and the suite
re-run:

| Mutation | Result |
| --- | --- |
| C1 → `body.library ?? 'identity'` (a constant instead of the rule) | **2 failures** — the roleless image and the roleless file cases |
| C2 → filter on `kind` only (the pre-C2 scope) | **1 failure** — the append-within-the-shelf case |
| Both at once | 4 failures, 365 passed |

The fourth failure under the combined mutation is the Move to… case, which fails
for a downstream reason (the asset starts on the wrong shelf), and that is worth
naming rather than counting as coverage.

**What each case pins:**

- **Seven `it.each` branches** — colour, roleless image, image-as-logo,
  image-as-mark, roleless file, logo-lockup-as-file, typeface — asserted on the
  row that comes back from `POST`. These are what tie the route to the *shared*
  rule rather than to a copy of it that happens to agree today.
- **An explicit `library` that disagrees with the default wins.** Filing is a
  human judgement; that is the reason it is a column at all.
- **An invalid shelf name is a 400**, at the wire, with a field path.
- **Append within the shelf.** Both fixtures are `kind: 'image'`, so the `kind`
  half of the filter cannot separate them — the test fails unless the `library`
  clause is doing the work.
- **Move to…, end to end:** a `{ library }`-only `PATCH` returns 200, the row
  moves, `label`/`position`/`role` do not, and a re-read confirms it.
- **A library patch aimed at another brand's asset 404s** — the existing brand
  scoping, re-asserted through the new key, because a new column is a new way
  to try to walk around a boundary.

## 3. The plan contradicted itself about the web fixtures, and this phase resolved it

§5's *"Done when"* says `pnpm typecheck` is **clean across all 10 packages** at
the end of C. §2.7 assigns the six `packages/web` test-fixture files to Phases
D, E and F. Both cannot be true: after C the server was clean and `web` still
had ten *Property `library` is missing* errors in fixtures.

**Resolved in favour of the gate.** The fixtures were fixed here, because:

- They are not D/E/F *work*. Those phases change behaviour — a registry, a card,
  a shelf. These are six object literals that need one more required key, and
  filing them commits to nothing any later phase has to undo.
- Leaving `typecheck` red would mean Phase D — the first user-visible phase,
  and the one the plan says **cannot be split across commits** — begins from a
  red baseline, where a genuine new type error is indistinguishable from the
  ten already there.

Each fixture was filed by `defaultLibraryFor` rather than all set to one value,
so no file reads as a shelf nobody chose:

| File | Fixture | Shelf |
| --- | --- | --- |
| `AssetLibraryView.test.tsx` | uploaded image, linked image | `photography` |
| | brand deck (file) | `collateral` |
| | Terracotta (colour) | `identity` |
| `BrandContextRail.test.tsx` | colour | `identity` |
| `BrandHubView.test.tsx` | colour | `identity` |
| `ColorSwatches.test.tsx` | colour, image | `identity`, `photography` |
| `PostEditorDialog.test.tsx` | image | `photography` |
| `SocialPostList.test.tsx` | image | `photography` |

None of these files' assertions changed. They will be edited again by D, E and
F for their own reasons.

## 4. The files

| File | Change |
| --- | --- |
| `packages/server/src/routes/assets.ts` | C1's resolution + `defaultLibraryFor` import; C2's `(library, kind)` filter and its comment; C3's note on the patch route |
| `packages/server/src/test-helpers.ts` | the fake's `createAsset` takes `library`; its `updateAsset` gains the spread-conditional key |
| `packages/server/src/routes/assets.test.ts` | a `FILE` fixture; +12 tests |
| `packages/web/src/components/brand/*.test.tsx` (6 files) | one `library` key per asset fixture (§3) |

## 5. Verification

```
pnpm typecheck                    clean — all 10 packages
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm test                         1421 passed | 68 skipped (135 files)
pnpm -F @brandfactory/web build   clean
DATABASE_URL=… pnpm -F db test    96 passed (9 files) — live suites included
```

Tests **1409 → 1421 (+12)**, all in `routes/assets.test.ts`. Skips unchanged at
68 — this phase added no live cases.

Cumulative across A–C: **1394 → 1421 (+27)**, skipped 64 → 68 (+4).

## 6. Carried forward

- **Nothing in the app writes a non-default `library` yet.** The route accepts
  one, `updateAsset` moves one, and no client sends either — the shelf pages
  (D2) and Move to… (F4) are the callers. Until then every asset in a running
  brand is filed by `defaultLibraryFor`, which is the same rule the old derived
  sections used, so no visible behaviour has changed in three phases. That is
  the intended shape of A–C.
- **`PostEditorDialog`'s image picker** (Q4) is now formally ambiguous —
  `assetsOfKind(assets, 'image')` spans all three shelves. Left unfiltered on
  purpose (a post legitimately wants the logo sometimes); its fixture is filed
  as `photography` and the deferral stands.
- **The `Uploaded`/`Linked` split and every derived section in
  `AssetLibraryView` are still the old `role`-based derivation.** F2 deletes
  them rather than adjusting them. Nothing in A–C touched that file's logic.

## 7. Caveats

- **Still not seen in a browser.** Correct for this phase — there is nothing new
  to look at. Phase G.
- **The dev database, `mig_clean` and `mig_backfill` are as Phase B left them.**
