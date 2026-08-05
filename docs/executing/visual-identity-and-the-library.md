# Visual identity and the library — implementation plan

**Status:** complete, 2026-08-05. Shipped as 1.22.0 (Phases A–G) and 1.22.1 (the
pre-release review pass). Written against `main` at **1.21.3** (1394 passed | 64
skipped — the skips are the live-Postgres suites), 2026-08-04.

§12's deferrals are still deferrals; 1.22.1 added one more — a colour filed onto
a non-identity shelf renders nowhere — which is unreachable through the UI and
recorded in that entry rather than fixed.

This executes [`docs/plans/visual-identity-and-the-library.md`](../plans/visual-identity-and-the-library.md).
The proposal argues the *why* and is not restated here; this file is the ordered
list of edits, the tests that hold each one, and the checks that say a phase is
done. Where the two disagree, the proposal was verified at 1.21.2 and this file
at 1.21.3 — the deltas are §2, and this file wins.

---

## 1. The seven questions, answered

All seven adopted as recommended. Recorded here so the phases below can be read
without going back for them.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Third shelf's name | **`Collateral`.** `Assets` collides with the word the table uses for all its rows. |
| 2 | A `typeface` role? | **Yes**, in this pass, in its **own migration** (0011) — see §2.5. |
| 3 | Palette leaves the Brand context card? | **Yes.** Phase E. It is the point of the exercise. |
| 4 | Post editor's image picker | **Left unfiltered.** Deferral, not oversight — carried to §8 and the completion note. |
| 5 | Rename `Visual guidelines` (prose) | **No.** A data migration wearing a copy change. Raise separately. |
| 6 | `/brands/:id/apps/visual` | **Permanent redirect**, via the registry. Phase D. |
| 7 | `unit: 'asset'` for three shelves | **Kept.** Three units for one storage concept is vocabulary the registry does not need yet. |

## 2. What reading the tree at 1.21.3 changed

Seven findings the proposal did not have. Five are corrections to its mechanism;
two are work it does not mention at all.

### 2.1 `MiniApp.id` is a closed literal union — **new work**

`miniApps.ts:55` types `id` as
`'copywriting' | 'visual' | 'studio' | 'social' | 'freeform' | 'context'`. Two
rows are being added, so the union grows `'photography' | 'collateral'`. Cheap,
but it is a compile error the proposal never mentions and it is the first thing
Phase D hits.

### 2.2 The registry cannot carry a `path: () => string` — **corrected**

The proposal has the row carry `path?: (brandId: string) => string`. It cannot,
in this codebase, for a reason `NavPrimitives.tsx:57-64` states outright:

> A `to` + `params` pair rather than a formatted string: TanStack's `Link` is
> type-safe over the route tree, and a component that took `href: string` would
> launder every typo in this app's navigation past the compiler — which is
> precisely the class of dead affordance the hub spent 1.7.0 removing.

`NavItemProps.link` is `LinkProps`. Handing it a formatted string is the exact
laundering that comment forbids, and `redirect()` in the `/apps/$appId`
`beforeLoad` wants the same typed pair (every one of the fifteen `redirect({…})`
call sites in `routes/` passes `to` + `params`, never a string).

**So the row carries the router's own props, narrowed:**

```ts
/** Where a non-tile row lives, as the router's own typed props. */
to?: (brandId: string) => Pick<LinkProps, 'to' | 'params'>
```

`Pick<…>` rather than bare `LinkProps` so one value satisfies both consumers:
it is assignable to `NavItemProps.link` (every other `LinkProps` key is
optional) and to `redirect()`'s options, with no cast at either end. The literal
path is written once, inside `miniApps.ts`, where TypeScript checks it against
the route tree.

### 2.3 The row id is `visual`; its shelf is `identity` — **new work**

These cannot be the same string. Q6 needs `/brands/:id/apps/visual` to keep
resolving, and that resolution is `miniAppById('visual')` — rename the row and
the redirect becomes the *Unknown mini-app* page instead, which is the one
outcome Q6 exists to prevent.

So the row keeps `id: 'visual'` and gains an explicit shelf:

```ts
/** Which shelf a `surface: 'library'` row is. Absent on every other row. */
library?: AssetLibrary
```

Two rows out of three have `id === library`; the third is the one that matters.
Nothing may derive one from the other.

### 2.4 `brandNavKey` knows only `/apps/:id` — **new work, not in the proposal**

`lib/nav-active.ts:31-38` resolves three shapes: the hub, `/context`, and
`/apps/:appId`. The three shelves are none of them, so without a fourth arm
every library route returns `null` and **no nav row lights on any of the three
new pages** — the panel would look like you had navigated out of the brand.

The proposal describes the nav group and its counts and does not mention this.
Phase D adds the arm and its cases to `nav-active.test.ts`, which already
asserts `app:visual` at line 15.

### 2.5 Migration numbering is clear, and 0011 is a real constraint

`0009_dear_zeigeist.sql` is the social calendar's, so `library` is **0010** as
the proposal says. Q2's `typeface` role is **0011**.

The two-file split is load-bearing and the reason is subtle:
`packages/db/scripts/migrate.mjs` runs drizzle's node-postgres migrator, which
wraps **the whole pending batch in one transaction**. Postgres 12+ permits
`ALTER TYPE … ADD VALUE` inside a transaction but forbids *using* the new value
in that same transaction. 0011 therefore adds `'typeface'` and backfills
nothing — no `UPDATE` may reference it, in 0011 or in 0010.

**Checkpoint, not an assumption:** Phase B runs both migrations against a live
Postgres from a clean database (all of 0000–0011 in one transaction, including
`asset_role`'s own `CREATE TYPE` in 0000) before Phase C starts. If the migrator
refuses, the fallback is to defer 0011 and Q2 to a follow-up — `library` alone
carries every other phase, and no other phase depends on the role existing.

### 2.6 The list order is `(kind, position)` in three places

`queries/assets.ts:29`, `:222` and the `brand_assets_brand_kind_position_active_idx`
index all order by `kind` then `position`. The proposal adds a
`(brand_id, library, position)` index but does not say whether the read order
changes. **It does not** — the client sections the list and sorts within a
section (`assetsOfKind` sorts `byPosition` itself), so the query's order is not
load-bearing for any renderer. Leaving it alone keeps Phase B to one added
column and one added index, and keeps every existing assertion about list order
true. The new index serves the count queries and any future server-side filter.

### 2.7 Three existing assertions break

Known before starting, so they are edits rather than surprises:

- `BrandHubView.test.tsx:156` — expects the tile href `/brands/b-1/apps/visual`.
  Phase D removes the tile (5 → 4).
- `nav-active.test.ts:15` — `brandNavKey('/brands/b-1/apps/visual/')` is
  `app:visual`. Still true after D (the *path* still resolves, then redirects);
  the case stays and gains three siblings.
- `BrandContextRail.test.tsx` — the palette-block cases. Phase E moves them to
  the new card's test file rather than deleting them.

---

## 3. Phase A — shared

`packages/shared/src/asset/`. No behaviour change anywhere; this phase is the
vocabulary the other six use.

### A1 — `library.ts` (new)

```ts
export const AssetLibrarySchema = z.enum(['identity', 'photography', 'collateral'])
export type AssetLibrary = z.infer<typeof AssetLibrarySchema>

export function defaultLibraryFor(a: { kind: AssetKind; role: AssetRole }): AssetLibrary {
  if (a.kind === 'color') return 'identity'
  if (a.role === 'logo' || a.role === 'mark') return 'identity'
  return a.kind === 'image' ? 'photography' : 'collateral'
}

export function assetsOfLibrary(assets: readonly BrandAsset[], library: AssetLibrary): BrandAsset[]
```

`assetsOfLibrary` mirrors `assetsOfKind` exactly — `deletedAt === null`, sorted
`byPosition`. Same file gets a doc comment naming the two callers of
`defaultLibraryFor` (0010's `CASE`, and `POST /brands/:id/assets` when `library`
is absent) and stating that the SQL mirror must agree **at backfill time only**.

### A2 — the row schema

`asset.ts`: `library: AssetLibrarySchema` joins `BrandAssetBaseShape`.
**Required and non-nullable** — every asset is on exactly one shelf, always,
which is the property §"Why not another `role` value" turns on. The file's
axes comment (`asset.ts:16-21`) grows its fourth line.

### A3 — create and patch

- `create.ts`: `library: AssetLibrarySchema.optional()` on
  `CreateBrandAssetBaseShape`. **Optional at the wire**, so every existing
  client keeps working; the server defaults it. The comment says so and points
  at `defaultLibraryFor`.
- `update.ts`: `library: AssetLibrarySchema.optional()` on the patch object,
  **and a sixth clause in the `.refine`** — miss that and a lone
  `{ library }` patch is rejected as empty, which is precisely the Move to…
  call. The refusal message grows the word.

### A4 — exports

`shared/src/index.ts` gains `export * from './asset/library'` in the
`// Brand assets` block.

### A5 — tests (`asset/library.test.ts`, new)

- `defaultLibraryFor`, one case per branch, **including the ordering case**: a
  `{ kind: 'image', role: 'logo' }` is `identity`, not `photography`. That is
  the one rule 0010's `CASE` can get wrong.
- A `{ kind: 'file', role: 'logo' }` → `identity` (the PDF lockup from the
  proposal's §2 table).
- `assetsOfLibrary`: filters, excludes soft-deleted, sorts by position.
- Schema tests in `asset.test.ts` / an update test: the row requires `library`;
  create accepts its absence; a `{ library: 'photography' }`-only patch passes
  the refine; `{}` still fails.

**Done when:** `pnpm -F @brandfactory/shared test` and `pnpm typecheck` are
clean. `typecheck` will fail in `db`/`server`/`web` — expected, A2 made
`library` required on the row and nothing produces it yet. Do not paper over
this; B and C are what fix it.

---

## 4. Phase B — db

### B1 — schema

`schema/brand_assets.ts`:

```ts
export const assetLibrary = pgEnum('asset_library', ['identity', 'photography', 'collateral'])
…
library: assetLibrary('library').notNull(),
```

**No `.default()`.** A DB default would be a fourth home for the rule and wrong
for two of the three shelves; the column is `NOT NULL` and the server always
supplies it.

New index alongside the two that exist:

```ts
index('brand_assets_brand_library_position_active_idx')
  .on(table.brandId, table.library, table.position)
  .where(sql`${table.deletedAt} IS NULL`)
```

### B2 — migration 0010

`pnpm --filter @brandfactory/db db:generate`, then **hand-author the `UPDATE`
into the generated file** — `drizzle-kit` emits the `CREATE TYPE`, the
`ADD COLUMN` and the index but never a backfill. Final order, which is what
keeps the column from ever being briefly `NOT NULL` and empty:

```sql
CREATE TYPE "public"."asset_library" AS ENUM('identity', 'photography', 'collateral');
ALTER TABLE "brand_assets" ADD COLUMN "library" "asset_library";
UPDATE "brand_assets" SET "library" = CASE
  WHEN "kind" = 'color'            THEN 'identity'
  WHEN "role" IN ('logo', 'mark')  THEN 'identity'
  WHEN "kind" = 'image'            THEN 'photography'
  ELSE 'collateral'
END::"asset_library";
ALTER TABLE "brand_assets" ALTER COLUMN "library" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "brand_assets_brand_library_position_active_idx"
  ON "brand_assets" ("brand_id", "library", "position")
  WHERE "deleted_at" IS NULL;
```

The `role` branch **must** precede the `kind` branch. A comment in the file says
so, because the two orderings differ only in that every brand mark files as
photography.

### B3 — migration 0011 (`typeface` role)

Generated from adding `'typeface'` to `assetRole` in the schema **and** to
`AssetRoleSchema` in shared (A2's file, folded in here so the enum members stay
in step). One statement, no backfill, per §2.5.

### B4 — queries

`queries/assets.ts`:

- `CreateAssetInput` gains `library: AssetLibrary` — **required**, not optional.
  The server is the only caller and it always resolves a value; making it
  optional here would put a second copy of the default rule in the query layer.
- `createAsset`'s `shared` object carries `library: input.library`.
- `UpdateAssetPatch` gains `library?: AssetLibrary`; `updateAsset`'s `.set()`
  gains the spread-conditional key, in the same `undefined` leaves-alone idiom
  as its five siblings.
- Read order unchanged, per §2.6.

### B5 — mapper

`mappers.ts`: `library: row.library` in `rowToBrandAsset`'s `base`. One line,
and without it every row fails `BrandAssetSchema` at the wire.

### B6 — tests

`brand-assets.live.test.ts` gains the case the proposal asks for and names the
hazard it closes: **the SQL `CASE` and `defaultLibraryFor` must agree.** Insert
one row of each shape — inline colour; image with `role: 'logo'`; image with
`role: 'mark'`; image with `role: null`; file with `role: 'logo'`; file with
`role: null` — then assert each stored `library` equals `defaultLibraryFor(row)`.

The rows are inserted through `createAsset`, so what is actually compared is the
*server-side* rule against itself. To test the **SQL** rule the fixture must
reach the table with the column unset — insert via raw `pool.query` omitting
`library`, run 0010's `CASE` as a standalone `UPDATE … WHERE library IS NULL`,
then compare. Stated explicitly because the easy version of this test passes
without touching the `CASE` at all and would report the mirror as verified when
it is not.

Also: the column round-trips through `BrandAssetSchema.safeParse`, and a
`library` patch lands.

**Done when:** `pnpm -F @brandfactory/db test` clean; `docker compose -f
docker/compose.yaml up -d` + `DATABASE_URL=… pnpm -F @brandfactory/db test`
green including the live suite; **§2.5's clean-database migration checkpoint
passes** (drop the scratch DB, run 0000–0011 in one batch).

---

## 5. Phase C — server

`packages/server/src/routes/assets.ts` and its fake.

### C1 — create defaults the library

```ts
const library = body.library ?? defaultLibraryFor({ kind: body.kind, role: body.role ?? null })
```

This is the second of `defaultLibraryFor`'s two callers, and the comment says
which the other is. Passed into `deps.db.createAsset` beside `position` and
`role`.

### C2 — the append scope becomes `(library, kind)`

`assets.ts:76-82` currently appends within `kind`:

```ts
const sameKind = existing.filter((a) => a.kind === body.kind)
```

becomes a filter on `library` **and** `kind`. Cosmetic rather than a
correctness fix — positions are only compared within a rendered section — but a
new photo taking its number from the collateral shelf produces an ordering
nobody chose. The comment above it grows the second clause.

### C3 — patch carries `library`

Nothing to write: `UpdateBrandAssetInputSchema` (A3) is already what the route
validates and `deps.db.updateAsset` (B4) already accepts the key. **This is
Move to…** — worth naming in the route comment so the next reader knows the
one-line patch is a product feature and not a stray column.

### C4 — the fake

`test-helpers.ts`: `createAsset`'s `base` and `updateAsset`'s patch handling
gain `library`, mirroring the real query exactly. The file's own rule — *"Every
one of these mirrors the real query rather than doing something simpler"* —
applies: a fake that defaults `library` itself would let a route test pass with
C1 deleted.

### C5 — tests

`routes/assets.test.ts`:

- Create **without** `library`: one case per `defaultLibraryFor` branch, asserted
  on the returned row. This is what pins C1 to the shared rule.
- Create **with** an explicit `library` that disagrees with the default — it
  wins.
- Create with an invalid `library` → 400.
- Patch `{ library: 'collateral' }` alone → 200, row moved (Move to…).
- Patch `{ library }` on another brand's asset → 404 (the existing scoping,
  re-asserted through the new key).
- Append scope: with a collateral asset at position 500 and no photography
  assets, a new photography image lands at 100, not 600.

**Done when:** `pnpm typecheck` clean across all 10 packages for the first time
since A2; `pnpm test` green.

---

## 6. Phase D — registry, routes, nav

The first user-visible phase. Everything in it lands in **one commit** — the
registry rows, the routes they point at, the redirect off the old one and the
nav group that shows them are four halves of one change, and any split ships a
row that points nowhere.

### D1 — the registry

`components/brand/miniApps.ts`:

- `MiniApp.id` grows `'photography' | 'collateral'` (§2.1).
- `MiniApp.surface` becomes `'tile' | 'library' | 'brand'`. The doc comment is
  rewritten: `'hidden'` was never *hidden*, it was *presented somewhere else*,
  and there are now two somewhere-elses. `surface` is the nav group.
- `MiniApp.to?: (brandId: string) => Pick<LinkProps, 'to' | 'params'>` (§2.2),
  documented as: absent on `'tile'` rows, which live at `/apps/$id`.
- `MiniApp.library?: AssetLibrary` (§2.3), documented as: the shelf, which is
  **not** derivable from `id` — `visual` is `identity`.
- The `visual` row: `surface: 'library'`, `library: 'identity'`, `to`, and a
  description narrowed to what the shelf now holds ("Marks, palette, typefaces
  and identity files"). `create`/`match` stay, for classification only, with
  the comment they already carry.
- Two new rows, `photography` and `collateral`. Neither has a template, so both
  carry `create: { kind: 'standardized', templateId: … }`? **No** — nothing has
  ever created such a thread and there is no legacy id to classify. Give both
  `match: () => false` and a `create` that is never reached, with a comment
  saying why they differ from `visual` here: `visual` retains a real
  `templateId` because a 1.4.0-era thread may exist under it; these two ids have
  never existed.
- The `context` row: `surface: 'brand'`, plus its `to`.
- `TILE_APPS` unchanged in definition (`surface === 'tile'`), now yielding four.
- New: `LIBRARY_APPS = MINI_APPS.filter((a) => a.surface === 'library')`, the
  same derived-view discipline, so the nav group cannot drift from the registry.

Icons: `Palette` stays on `visual`; `Camera` and `Files` (lucide) for the other
two.

### D2 — the routes

New `routes/brands.$brandId.library.tsx`, holding **three route objects over one
component**. One file rather than three because the three differ only in a path
literal and a `library` constant, and three files would be three copies of the
same `beforeLoad`. The file's header comment says so — the repo's convention is
one route per file and this is a deliberate exception.

```
/brands/$brandId/identity      → <AssetLibraryPage brandId library="identity" />
/brands/$brandId/photography   → …library="photography"
/brands/$brandId/collateral    → …library="collateral"
```

Each with the standard `beforeLoad` auth guard. Registered in `router.tsx`'s
`appRoutes`.

`components/brand/AssetLibraryPage.tsx` — **`VisualIdentityPage` renamed and
given a `library` prop.** Rename rather than a new file: it is the same data
half doing the same job for a parameterised shelf, and a second copy is the
thing §"One Drive, three shelves" forbids. Its `app: MiniApp` prop goes (the
route no longer has one); the `Shell` fallback takes a title string instead.

Its three creators stamp the library:

- `handleUploadFiles` → `library` (the page's prop).
- `handleRecordLink` → `library`.
- `handleAddColor` → `'identity'` **always**, not the prop. A colour is identity
  wherever you happen to be standing, and the Add-colour row only renders on the
  identity shelf anyway (Phase F) — passing the prop here would make a
  photography-shelf colour representable the moment that changes.

And it filters: `assetsOfLibrary(assets ?? [], library)` is what reaches the
view. `blobKeys` is computed from the **filtered** list — three shelves each
re-signing every blob in the brand is three times the work for one page's worth
of pictures.

`VisualIdentityPage.test.tsx` is renamed with the component and gains a
library-filtering case.

### D3 — the `/apps/visual` redirect

`routes/brands.$brandId.apps.$appId.tsx`'s `beforeLoad`, which today hard-codes
`/context` for every non-tile row:

```ts
const app = miniAppById(params.appId)
if (app && app.surface !== 'tile' && app.to) throw redirect(app.to(params.brandId))
```

Q6, answered generically: `/apps/visual` → `/identity`, `/apps/context` →
`/context`, and any future non-tile row is covered by having been given a `to`.
The `&& app.to` guard is what keeps a row with no `to` from silently rendering
the second unintended surface the original comment warns about — if that ever
happens it should be caught in review, so the type makes `to` required on
non-tile rows if it can be expressed cheaply, and a test covers it if it cannot.

The dispatch below (`unit === 'asset'` → `VisualIdentityPage`) is now
**unreachable** — no `surface: 'tile'` row has `unit: 'asset'`. It goes, along
with the import. The header comment drops from four shapes to three.

### D4 — `brandNavKey`

`lib/nav-active.ts` (§2.4), a fourth arm returning `library:identity` etc.
Matched off a literal alternation of the three segments rather than `([^/]+)`,
so an unknown `/brands/:id/anything` stays `null` instead of lighting a row that
does not exist.

### D5 — the nav group

`components/nav/BrandNavPanel.tsx`:

- A third `NavGroup label="Library"` between `Apps` and `Brand`, over
  `LIBRARY_APPS`, using `app.to(brandId)` for the link and
  `activeKey === \`library:${app.library}\`` for active.
- `countOf` learns the library case **before** its `unit === 'asset'` arm:
  `if (app.library) return assets ? assetsOfLibrary(assets, app.library).length : null`.
  Without the ordering, all three rows read the whole brand's asset count.
- No nested children — a shelf has no threads. The `Apps` group's
  `unit === 'thread'` guard already covers this; the library rows are rendered
  by their own map and simply do not have the branch.
- The `Brand` group's hand-written `context` link may now come off the row's
  `to` for consistency. Optional; note it and do it if it stays a simplification.

The fourth "connected source" row of the proposal's sketch is **not built**.

### D6 — the hub

`BrandHubView.tsx` needs no code change here — `tiles = TILE_APPS` now yields
four and the grid's `sm:grid-cols-2` becomes the 2×2 its own comment has
described since it was written. Delete the stale *"four tiles"* framing only if
it is now wrong; it is now right, which is the point.

`visualHref`/`paletteHref` stay until Phase E. Between D and E the rail's
`Palette` heading links to `/apps/visual`, which now redirects to `/identity` —
correct, just one hop long. No half-state.

### D7 — tests

- `miniApps.test.ts` — the three library rows: `surface`, `library`, `to`
  output, and `TILE_APPS.length === 4`.
- `nav-active.test.ts` — three new cases plus a trailing-slash case; the
  existing `app:visual` case stays.
- `BrandNavPanel.test.tsx` — the Library group renders three rows; each count is
  its own shelf's, asserted with a fixture holding assets in two libraries (the
  case that fails if D5's ordering is wrong).
- `brands.$brandId.apps.$appId.test.tsx` — `/apps/visual` redirects to
  `/identity`; `/apps/context` still redirects to `/context`; the `unit:
  'asset'` dispatch case is retired.
- `BrandHubView.test.tsx:156` — the Visual identity tile is gone (§2.7).
- New route test for the three shelves rendering their filtered lists.

**Done when:** all four checks green; `/brands/:id/identity`,
`/photography`, `/collateral` render, the nav lights on each, `/apps/visual`
redirects.

---

## 7. Phase E — the rail card

The phase the ask is actually about, deliberately after D so it lands on a model
that already supports it.

### E1 — `VisualIdentityCard.tsx` (new, pure)

Same card idiom as `BrandContextRail` — `rounded-xl border bg-card
shadow-elevation-1`, hairline-separated blocks, neutral throughout.

```
▣  Wordmark              the declared mark (logoAsset), or the monogram
▪▪▪▪▪ Palette · 5 colours moved out of the Brand context card
Aa Satoshi · Söhne       typefaces, when there are any
──────────────────────
Photography · 24         two quiet links into the other two shelves
Collateral · 6
```

Props: `brand`, `assets?`, `logoSrc?`, and nothing else — the shelf links are
built from `brand.id` against the typed routes. Every block follows the
`undefined` ≠ `[]` rule the palette block already carries.

**The card renders `null`** for a brand with no mark, no colours and no
typefaces. An empty identity is a legitimate brand (`vision.md:28`) and a card
saying so is the scolding 1.7.0 spent a pass removing. The two shelf links go
with it — they are the card's footer, not a fifth block, and a footer with no
card is a floating pair of counts.

Typefaces are read as `role === 'typeface'` (Q2/0011), falling back to nothing.
No specimen, no `@font-face` — non-goal, and the file says so.

### E2 — `BrandContextRail` loses the palette

Delete the `colors` prop, the `paletteHref` prop, the block at `:476-501`, and
the `ColorSwatches`/`paletteSummary` import. The card's doc comment gets its
exception removed: **written sections and unwritten suggestions, one list, and
that list is the meter** — no "except the palette" clause.

Only `BrandHubView` ever passed either prop (`brands.$brandId.context.tsx:126`
passes neither), so the context page is untouched. Verified at 1.21.3 by the
grep in §2.7's third bullet.

### E3 — the hub's right column

`BrandHubView.tsx`: `colors` and `visualHref` go; the rail is followed by
`<VisualIdentityCard>` in the same column, at the same width, `gap-3` between
them. `assets` stays on the rail's sibling rather than being narrowed — it feeds
the new card.

### E4 — tests

- `VisualIdentityCard.test.tsx` (new) — the palette cases **moved** from
  `BrandContextRail.test.tsx` rather than rewritten, so what they proved is not
  quietly lost; plus the renders-nothing case, the mark-vs-monogram case, and
  the two shelf links with their counts.
- `BrandContextRail.test.tsx` — the palette cases are gone; add one asserting no
  swatches render even when the brand has colours, so a re-added block is caught.
- `BrandHubView.test.tsx` — both cards present; the card is absent for an
  identity-less brand.

---

## 8. Phase F — the shelves

`AssetLibraryView` parameterised. **One component, three configurations** — if a
shelf needs its own component the shelf is wrong, and that constraint goes in
the file's header comment.

### F1 — the view takes a `library`

New required prop. The header's title and standfirst come from a small
`SHELF_COPY` record keyed by library, next to the component — three headings and
three empty states, which is the only thing that differs above the fold.

The intake zone, the `Uploaded`/`Linked` pill, delete-with-Undo and Move to… are
**identical on all three**.

### F2 — the section lists

| Shelf | Sections |
| --- | --- |
| `identity` | Marks (existing role-toggling grid) · Palette (existing swatch rows, drag-reorder, proposed/settled) · **Typefaces** (new) · Identity files |
| `photography` | One `AssetGrid`, full width |
| `collateral` | The file list, plus an `AssetGrid` for image collateral (the PNG menu) |

Every renderer already exists except Typefaces. The derivations that misfiled
things (`role !== 'logo'` ⇒ photography) are **deleted, not adjusted** — that
rule is what Phase A–C replaced, and leaving it as a secondary sort is how it
comes back.

`AddColorRow` renders only on `identity`. `onAddColor` is already the gate
(D2 passes it from the page); the view's `(colors.length > 0 || onAddColor)`
condition holds with no change, and the page simply does not pass the callback
on the other two shelves.

### F3 — Typefaces

Deliberately thin: a labelled list of font files or links with a usage note
("Satoshi — headings"). Reuses the file-list renderer with a `Type` icon and a
`role === 'typeface'` toggle in place of the grid's `Use as mark`. **No
specimen rendering, no `@font-face`, no live preview** — non-goal, stated in the
file.

### F4 — Move to…

A `DropdownMenu` (the primitive exists; `SocialPostList` is the model) on every
asset card and file row: *Move to Visual identity / Photography / Collateral*,
current shelf omitted. One `onUpdateAsset(id, { library })` — the whole feature,
because C3 already made it work.

One row at a time; no bulk UI (non-goal). It follows the delete idiom: fire and
show a toast naming the destination, with an Undo that moves it back. A misfile
with no way back is the failure mode this repo has already paid for once.

Follows `SocialPostList`'s `deferUntilMenuClosed` — a Radix menu that unmounts
mid-handler drops focus, which that helper exists to prevent.

### F5 — font MIMEs

`shared/src/blob/upload.ts`: `font/woff2`, `font/woff`, `font/otf`, `font/ttf`
join `ALLOWED_UPLOAD_MIMES`.

**`CONTENT_TYPE_BY_EXTENSION` is left alone**, and the reason goes in a comment
next to it: that map names types a browser may render *inline* from user bytes,
and a font is a download — exactly as `text/plain` and the Word types already
are. `application/octet-stream` is the correct answer.

Test: the new MIMEs are accepted by `POST /blob-urls/upload-url`; a
`font/collection` is still refused.

### F6 — the connected-sources line

One sentence under the intake zone's two slots, on all three shelves:

> Anything hosted elsewhere can be linked today. Connected sources — Google
> Drive, Dropbox — are a later pass.

Copy, **not** a disabled `Connect a source` button with a `Soon` pill. A line
tells the user the direction of travel *and* the thing they can do right now; a
disabled button tells them only the first. This repo has spent two passes
removing affordances that go nowhere.

### F7 — tests

`AssetLibraryView.test.tsx`, per shelf: the right sections render and the wrong
ones do not; each empty state; a PNG filed as collateral appears under
Collateral and **not** under Photography (the proposal's §2 table, as an
assertion); Move to… offers two destinations and calls `onUpdateAsset` with the
library; the connected-sources line is present; `onAddColor` absent ⇒ no
Add-colour row.

---

## 9. Phase G — the live browser pass

**Non-skippable.** 1.21.0, 1.21.2 and 1.21.3 each shipped with a standing
*"not seen in a browser"* caveat; this pass moves a card, removes a tile and
adds three routes, and it is the wrong one to make four in a row.

Run against a seeded brand with assets in all three libraries.

1. The hub: the 2×2 tile grid; both rail cards; the card absent on an
   identity-less brand.
2. All three shelves: the nav row lights, the counts are per-shelf, the empty
   states read right.
3. `/brands/:id/apps/visual` redirects.
4. Upload a `.woff2` → it lands under Typefaces on the identity shelf.
5. Move a PNG from Photography to Collateral, and Undo it.
6. Light and dark; keyboard walk of the Move to… menu (the 2F precedent —
   that walk is what found the unnamed file input).

Screenshots into the changelog entry's verification section.

---

## 10. Verification, every phase

```
pnpm typecheck                    all 10 packages
pnpm lint / format:check          whole repo
pnpm test                         live-Postgres suites skip without DATABASE_URL
pnpm -F @brandfactory/web build
```

Phase B additionally: `docker compose -f docker/compose.yaml up -d` and
`DATABASE_URL=… pnpm -F @brandfactory/db test`, plus §2.5's clean-database
migration checkpoint.

Between A and C `pnpm typecheck` is expected to fail — see A5. Every other phase
boundary is green.

## 11. Commits

Seven, one per phase, except that **D is one commit and cannot be split** (§6).
E and F may each be split if they get long; nothing in either leaves a
half-state. Changelog entry with the real test delta lands with G.

## 12. Noted, not done

Carried to the completion note so each is a deferral rather than an oversight:

- **`PostEditorDialog`'s image picker** (Q4) — `assetsOfKind(assets, 'image')`
  at `PostEditorDialog.tsx:428` is now photography *and* identity marks *and*
  image collateral, undifferentiated. Left unfiltered: a post legitimately wants
  the logo sometimes. Group it by library later.
- **Renaming `Visual guidelines`** (prose) to `Art direction` (Q5) — a data
  migration wearing a copy change.
- Connected external sources: no `connections` table, no OAuth, no fourth
  `source` value. The seam is stated and not built.
- Sync, in any direction, with anything.
- A fourth shelf, or user-defined shelves; a nullable `collection` within a
  library stays as cheap to add as it is today.
- Type specimens / `@font-face` injection from an uploaded font.
- Bulk re-filing.
- Any change to how the agent consumes brand context — it still reads no assets.
