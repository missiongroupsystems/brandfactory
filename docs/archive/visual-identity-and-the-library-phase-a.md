# Phase A — shared: the fourth axis

**Status:** complete, 2026-08-04. Written against `main` at **1.21.3** (1394
passed | 64 skipped before this phase; the skips are the live-Postgres suites).

Executes §3 of
[`docs/executing/visual-identity-and-the-library.md`](../executing/visual-identity-and-the-library.md),
which executes
[`docs/plans/visual-identity-and-the-library.md`](../plans/visual-identity-and-the-library.md).
The *why* is argued there and is not restated; this file records what was
written, where, and the three places the implementation decided something the
plan left open.

**No migration, no route, no component, no behaviour change anywhere.** Phase A
is vocabulary: the word the other six phases are written in. 2 files added, 5
modified, +13 tests.

---

## 1. What was built

`library` — a fourth orthogonal axis on `BrandAsset`, alongside `kind`,
`source` and `status`:

```
kind     what it is        color | image | file
source   where it lives    inline | blob | link
status   how settled       proposed | active
library  where it is filed identity | photography | collateral   ← new
```

Three pieces, in dependency order:

1. **`AssetLibrarySchema`** — the enum, and `library` as a **required,
   non-nullable** member of `BrandAssetBaseShape`.
2. **`defaultLibraryFor`** — the derivation rule, written once, with two
   callers named in its doc comment: migration 0010's `CASE` (Phase B) and
   `POST /brands/:id/assets` when the body omits the key (Phase C).
3. **`assetsOfLibrary`** — `assetsOfKind`'s sibling, and the reader every
   consuming surface in D–F goes through.

Plus the wire: `library` is **optional on create** and **present on patch**,
which is the asymmetry that let a required column ship without a wire break.

## 2. The one deviation from the plan, and why

**The plan puts `AssetLibrarySchema` in `asset/library.ts`. It is in
`asset/asset.ts` instead.** The rule and the reader are in `library.ts` as
written; only the enum moved.

This is not tidiness. The plan's arrangement is a **runtime import cycle with a
load-order-dependent failure**:

- `BrandAssetBaseShape` needs `AssetLibrarySchema` at **module evaluation
  time** — it is a top-level object literal — so `asset.ts` must import
  `library.ts` as a value.
- `assetsOfLibrary` needs `byPosition`, which is a value exported by
  `asset.ts`, so `library.ts` must import `asset.ts` as a value.

Under ESM that pair resolves *only if `asset.ts` is entered first*. Enter
`library.ts` first — a direct deep import, a test file, a future bundler's
chunk order — and `asset.ts` evaluates while `library.ts` is still in flight,
reads `AssetLibrarySchema` from the temporal dead zone, and throws a
`ReferenceError` at import. `library.ts` survives the reverse order only
because its reference to `byPosition` is inside a function body.

So the edge runs one way: `library.ts → asset.ts`, and nothing goes back. The
enum sits with the three axes it is a peer of — which is also where the
"four orthogonal axes" header comment now lives — and the comment beside it
states the constraint so the next person does not helpfully move it back.

Nothing downstream can tell: both modules are re-exported by
`packages/shared/src/index.ts`, and every consumer in this repo imports from
the package root.

## 3. Decisions the plan left to the implementation

### Required on the row, optional on the wire

`BrandAssetSchema` requires `library`; `CreateBrandAssetInputSchema` does not.
That looks like an inconsistency and is the mechanism: **every asset is filed,
but not every client knows about filing.** A create body that omits the key gets
`defaultLibraryFor` applied by the route (C1), which is why nothing in `web`
had to change to keep uploading. The row schema is what makes the column an
invariant; the create schema is what makes it a migration rather than a break.

`role`, by contrast, is nullable in both places — the shape the plan's
*"why not another `role` value"* section turns on, and the reason these two
could not be folded together.

### The sixth `.refine` clause is the feature

`UpdateBrandAssetInputSchema`'s refine rejects `{}`. Adding `library` to the
object without adding it to the refine would have left a schema that accepts
`{ library }` structurally and rejects it as an empty body — and `{ library }`
alone is *exactly* what Move to… (F4) sends, so the feature would have failed
at the wire with a message naming five other fields. The clause is there, the
message names six, and `library.test.ts` pins both directions.

### `assetsOfLibrary` says nothing about `status`

Deliberately mirroring `assetsOfKind`: filter on `deletedAt`, sort by
`position`, and leave `status` alone. A `proposed` asset is still filed
somewhere; hiding it is `activeAssets`' job, at the read paths that want it
hidden. Any divergence here would have made the shelf views quietly disagree
with the palette rows they already render.

### The schema does not enforce the derivation

`defaultLibraryFor` is a *default*, not an invariant, and nothing validates that
a stored `library` agrees with what the rule would have produced. That is the
whole point of the column: a user moving a PNG menu off Photography is a filing
that contradicts the derivation, and it has to survive a round trip. Test
fixtures accordingly file rows wherever the test needs them.

## 4. The files

| File | Change |
| --- | --- |
| `packages/shared/src/asset/asset.ts` | Header comment three axes → four; `AssetLibrarySchema` / `AssetLibrary` beside `AssetStatusSchema`, with the import-cycle note; `library` on `BrandAssetBaseShape` |
| `packages/shared/src/asset/library.ts` | **new** — `defaultLibraryFor`, `assetsOfLibrary`, and the doc comment naming the two callers and the SQL-mirror hazard |
| `packages/shared/src/asset/create.ts` | `library: AssetLibrarySchema.optional()` on `CreateBrandAssetBaseShape` |
| `packages/shared/src/asset/update.ts` | `library` on the patch object **and** the sixth refine clause; message grown |
| `packages/shared/src/index.ts` | `export * from './asset/library'` |
| `packages/shared/src/asset/library.test.ts` | **new** — 13 tests |
| `packages/shared/src/asset/asset.test.ts` | `base()` fixture gains `library` (the row schema now requires it) |

## 5. What the 13 tests actually hold

Not coverage for its own sake — five of them are pinned to a specific way this
can go wrong later.

**The ordering case, twice.** `{ kind: 'image', role: 'logo' }` is `identity`,
not `photography`, and so is `{ kind: 'image', role: 'mark' }`. This is the one
rule 0010's `CASE` can get wrong, because the two branch orderings differ *only*
in that the wrong one files every brand mark in the table as a photograph — the
most visible row there is, and the one nobody would think to check. Phase B's
live test compares the SQL against this function; these are what make that
comparison worth anything.

**The PDF lockup.** `{ kind: 'file', role: 'logo' }` → `identity`. Row three of
the proposal's misfiling table, as an assertion.

**`role: 'primary'` does not divert an image.** `primary` is a colour's role and
reaches the `role` branch on an image only if someone sets it there. It must
fall through to `photography` — the branch tests an explicit pair of values, not
"has a role".

**The wire asymmetry, both halves.** Create accepts the key's absence and still
rejects a bad value; the row rejects its absence outright; an unknown shelf name
is refused at both ends.

**`{ library }` alone passes the patch refine, and `{}` still fails.** The
Move to… call, and the guard that keeps the refine honest.

## 6. Verification

```
pnpm -F @brandfactory/shared test    113 passed (7 files)   — was 100
pnpm -F @brandfactory/shared lint    clean
pnpm -F @brandfactory/shared typecheck  clean
prettier --check packages/shared     clean
pnpm test                            1407 passed | 64 skipped (135 files)
```

Repo-wide tests **1394 → 1407 (+13)**, all green: a missing property is a type
error, not a runtime one, and nothing outside `shared` parses a hand-built
fixture through `BrandAssetSchema`.

### `pnpm typecheck` fails, on purpose

The plan's A5 says so and says not to paper over it. `packages/shared`
typechecks clean; every other error in the repo is the same one — *Property
`library` is missing* — at a site that **produces** a `BrandAsset` and has not
been taught to yet. Sixteen sites, all of them work already scheduled:

| Site | Count | Fixed by |
| --- | --- | --- |
| `packages/db/src/mappers.ts:173,176,179` | 3 | **B5** — `library: row.library` in `rowToBrandAsset`, once per union arm |
| `packages/server/src/test-helpers.ts:403,406,409` | 3 | **C4** — the fake mirrors the real query |
| `packages/web/…/AssetLibraryView.test.tsx` | 4 | **F** |
| `packages/web/…/ColorSwatches.test.tsx` | 2 | **F** |
| `packages/web/…/BrandHubView.test.tsx`, `BrandContextRail.test.tsx`, `PostEditorDialog.test.tsx`, `SocialPostList.test.tsx` | 1 each | **D / E** |

Zero errors of any other code or message. The mapper's three appear a second
and third time in `server`'s and `web`'s output through project references;
they are one fix.

**`pnpm typecheck` is green again at the end of Phase C**, which is the first
boundary where a producer exists for every consumer.

## 7. Carried forward

Nothing was deferred *from* this phase — A1–A5 all landed. Two things it makes
visible for the phases that follow:

- **`defaultLibraryFor` now has one caller and needs two.** Until C1 lands, the
  rule is written and unused outside its tests. That is the intended order (the
  vocabulary precedes its speakers), but it means a `library` written today
  would come from nowhere — B and C are what make the column reachable.
- **The SQL mirror is unclosed until B6.** The doc comment states the hazard and
  the test that closes it; the test does not exist yet. B6's fixture must reach
  the table with the column **unset** (raw `pool.query`, then 0010's `CASE` as a
  standalone `UPDATE … WHERE library IS NULL`) — inserting through `createAsset`
  compares the server-side rule against itself and would report the mirror as
  verified when nothing had touched the SQL.

Everything in §12 of the executing plan (`PostEditorDialog`'s picker, the
`Visual guidelines` rename, connected sources, sync, a fourth shelf, type
specimens, bulk re-filing, the agent) remains out of scope and untouched.

## 8. Caveats

- **Nothing is user-visible and nothing was run in a browser.** Correct for this
  phase; Phase G is where that debt is paid.
- **`asset.test.ts`'s `base()` files everything as `identity`,** including
  images, which no derivation rule would do. Harmless — those tests assert on
  `kind`, `role` and `position` and the schema enforces no agreement between
  `library` and `kind` (§3) — but a reader skimming for the convention should
  take it from `library.test.ts`, not there.
