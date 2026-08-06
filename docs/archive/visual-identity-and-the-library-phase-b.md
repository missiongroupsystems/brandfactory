# Phase B — db: the column, and two migrations

**Status:** complete, 2026-08-04. Written against `main` at **1.21.3** + Phase A.

Executes §4 of
[`docs/executing/visual-identity-and-the-library.md`](../executing/visual-identity-and-the-library.md).
Phase A wrote the vocabulary; this phase gives it a column, a backfill, and the
one thing neither of the two planning documents could do — **evidence from a
real Postgres**.

**Migrations 0010 and 0011.** 4 source files modified, 4 test files touched,
+2 unit tests and +4 live tests. `pnpm typecheck` still fails in `server` and
`web`, by design, until Phase C.

---

## 1. What landed

| | |
| --- | --- |
| `asset_library` enum | `identity \| photography \| collateral` |
| `brand_assets.library` | `NOT NULL`, **no DB default** |
| `brand_assets_brand_library_position_active_idx` | `(brand_id, library, position) WHERE deleted_at IS NULL` |
| `asset_role` | grows `typeface` (0011, its own file) |
| `CreateAssetInput.library` | **required** — the route always resolves one |
| `UpdateAssetPatch.library` | optional — this is Move to… |
| `rowToBrandAsset` | carries `library`, on all three arms |

Read order is **unchanged**: `listAssetsByBrand` and `reorderAssets` still order
by `(kind, position)`, per §2.6 of the plan. The client sections the list and
sorts within a section, so the query's order is not load-bearing for any
renderer, and leaving it alone keeps every existing assertion about list order
true. The new index is there for the per-shelf counts (D5) and any future
server-side filter.

## 2. `drizzle-kit generate` emitted a migration that cannot run

Worth recording exactly, because the plan predicted the *shape* of the problem
and the generated file was worse than predicted. In full:

```sql
CREATE TYPE "public"."asset_library" AS ENUM('identity', 'photography', 'collateral');
ALTER TABLE "brand_assets" ADD COLUMN "library" "asset_library" NOT NULL;
CREATE INDEX IF NOT EXISTS "brand_assets_brand_library_position_active_idx" …
```

That second statement **aborts on any table that already has rows**: `NOT NULL`,
no `DEFAULT`, nothing to fill the existing rows with. It succeeds on an empty
table, which is precisely why it would have passed a lazy local check and failed
in production — where the table is the one thing guaranteed not to be empty.

The plan said drizzle "will not produce the `UPDATE`". It also produced an
`ADD COLUMN` that has to be split, which is a second edit and the one that
matters. Hand-authored into the three-step form:

```sql
ALTER TABLE "brand_assets" ADD COLUMN "library" "asset_library";   -- nullable
UPDATE "brand_assets" SET "library" = CASE … END::"asset_library"; -- fill
ALTER TABLE "brand_assets" ALTER COLUMN "library" SET NOT NULL;    -- tighten
```

The column is never briefly `NOT NULL` and empty, and it is `NOT NULL` by the
end of the migration. **A `DEFAULT` is still not the answer** — it would be a
fourth home for a rule that already lives in `defaultLibraryFor` and the `CASE`,
and it would be wrong for two of the three shelves.

## 3. The `typeface` role diverges from the CASE, deliberately

**A deviation from the plan, and the one decision in this phase worth
challenging.**

The plan's `defaultLibraryFor` has three branches and Q2 adds a `typeface` role
in the same pass. Those two facts were settled separately, and together they
produce a bug: a font is a `file`, so the rule as written files **the brand's
own typeface onto the collateral shelf** — in the very pass that builds the
Typefaces section for it. Nothing in either document notices.

So `defaultLibraryFor` grew a fourth case:

```ts
if (a.role === 'logo' || a.role === 'mark' || a.role === 'typeface') return 'identity'
```

and 0010's `CASE` did **not**. That is a real divergence between two copies of
one rule, which the whole of Phase A's doc comment warns about, so the reason
has to be exact:

> The mirror must agree **at the moment the backfill runs**. 0010 runs before
> 0011 adds `'typeface'` to `asset_role`, so no row in the table can carry that
> value when the `CASE` executes. The branch is unreachable at backfill time and
> reachable forever after.

Adding it to the SQL would be dead code that reads as a rule — worse than the
divergence, because a future reader would have no way to tell it was never
needed. Instead the divergence is **observed by a test** (§5), in the same
spirit as the CHECK tests that already sit in that file.

**What would reverse this:** if 0010 and 0011 were ever merged, or reordered.
Both files say so in their own comments.

## 4. A finding the plan did not have: the CHECK stopped being observed

`brand-assets.live.test.ts` has four cases that insert deliberately malformed
rows through raw SQL and assert `brand_assets_source_exactly_one` fires. They
name their columns explicitly:

```sql
insert into brand_assets (brand_id, kind, source, label, position, value, blob_key, url)
```

With `library` `NOT NULL` and no default, **every one of those inserts now fails
on the not-null constraint before the CHECK is ever evaluated.** The assertion
is `.rejects.toThrow(/brand_assets_source_exactly_one/)`, so the tests would
have gone red — but had the regex been looser, or the assertion just
`.rejects`, all four would have stayed green while testing nothing at all. The
file's own comment says the point is that *"a constraint nobody has watched fire
is a constraint that may not exist"*; this is the same hazard one level up.

`library` is now in the column list, with a comment saying why it has to be.

## 5. The mirror test, done differently from the plan — and mutation-verified

The plan's B6 says: insert rows via raw `pool.query` **omitting `library`**, run
0010's `CASE` as a standalone `UPDATE … WHERE library IS NULL`, compare against
`defaultLibraryFor`. It also correctly warns that the *easy* version of this test
— inserting through `createAsset` — compares the server-side rule against itself
and proves nothing.

That recipe cannot run as written: `library` is `NOT NULL` with no default, so
there is no way to get a row past the insert with the column unset, and dropping
the constraint to manufacture one is a DDL in a test for no gain.

**What it does instead is stronger.** The test:

1. **Reads the `CASE` out of `drizzle/0010_*.sql`** and executes that text. A
   test that retyped the expression would pass while the migration said
   something else, which is the entire failure it exists to catch.
2. Evaluates it over a `VALUES` list of all nine `(kind, role)` shapes that
   could have existed when 0010 ran, aliased as `brand_assets(kind, role)` so
   the extracted SQL binds unchanged.
3. Compares the nine results to `shapes.map(defaultLibraryFor)`.

**Confirmed to fail when it should.** The `CASE`'s `role` branch was temporarily
moved below its `kind` branch — the one inversion the whole rule turns on — and
the test went red; restored, green. That inversion is the mistake that files
every brand mark in the table as a photograph, and it is now caught by a test
rather than by a comment asking someone to be careful.

A second test asserts the `typeface` divergence of §3 directly: 0010's text does
not mention `typeface`, 0011's adds it, and `defaultLibraryFor` returns
`identity` for one. The claim "unreachable at backfill time" is checked, not
asserted.

## 6. The two live checkpoints §2.5 asked for

Both run against `postgres:16` from `docker/compose.yaml`. Docker Desktop was not
running at the start of this phase and was started for it.

**Checkpoint 1 — a clean database, 0000–0011 in one migrator batch.** This is the
one the plan flagged as a risk, since the migrator wraps the whole pending batch
in a single transaction and 0011 is an `ALTER TYPE … ADD VALUE`.

```
$ createdb mig_clean && DATABASE_URL=…/mig_clean node packages/db/scripts/migrate.mjs
migrations applied from …/packages/db/drizzle
```

**No refusal.** The fallback the plan held in reserve — defer 0011 and Q2 to a
follow-up — was not needed.

**Checkpoint 2 — the backfill against rows, which checkpoint 1 does not test.**
A clean database has nothing to backfill, so the `UPDATE` is a no-op there and
the migration would pass with the `CASE` deleted. So: a second scratch database
migrated to **0009 only** (a copy of `drizzle/` with 0010–0011 removed and the
journal truncated), seeded with one row of every shape through raw SQL, then
migrated the rest of the way.

| label | kind | role | → library |
| --- | --- | --- | --- |
| colour, no role | color | — | `identity` |
| colour, primary | color | primary | `identity` |
| image, logo | image | logo | `identity` |
| image, mark | image | mark | `identity` |
| image, primary | image | primary | `photography` |
| image, no role | image | — | `photography` |
| link, no role | image | — | `photography` |
| file, logo | file | logo | `identity` |
| file, mark | file | mark | `identity` |
| file, no role | file | — | `collateral` |

Ten rows, zero nulls afterwards, and the column ends `is_nullable: NO` with
`column_default: (none)` — the three things the three-statement split is for.
Every row matches `defaultLibraryFor`.

## 7. The files

| File | Change |
| --- | --- |
| `packages/db/src/schema/brand_assets.ts` | `assetLibrary` enum; `library` column (no default, with the reason); the third index; `typeface` on `assetRole`; header three axes → four |
| `packages/db/drizzle/0010_lumpy_fixer.sql` | **new** — hand-authored into add-nullable / backfill / tighten, + index |
| `packages/db/drizzle/0011_minor_stellaris.sql` | **new** — one `ALTER TYPE … ADD VALUE`, no backfill, with the transaction note |
| `packages/db/drizzle/meta/*` | regenerated snapshots + journal (idx 10, 11) |
| `packages/db/src/queries/assets.ts` | `CreateAssetInput.library` required; `UpdateAssetPatch.library` optional; both wired through |
| `packages/db/src/mappers.ts` | `library: row.library` |
| `packages/db/src/mappers.test.ts` | fixture gains `library`; +1 test — the mapper carries it on all three arms, asserted through `BrandAssetSchema` |
| `packages/db/src/brand-assets.live.test.ts` | 20 fixtures filed honestly; `library` into the raw CHECK insert (§4); +4 tests |
| `packages/db/src/social-posts.live.test.ts` | one fixture |
| `packages/shared/src/asset/asset.ts` | `typeface` on `AssetRoleSchema` (B3 folds the shared half in, so the enums stay in step) |
| `packages/shared/src/asset/library.ts` | the `typeface` branch and the divergence note (§3) |
| `packages/shared/src/asset/library.test.ts` | +1 test |

The 20 live fixtures were filed by the rule rather than all set to one value —
colours and marks to `identity`, plain images to `photography`, files to
`collateral` — so nothing in that file reads as a shelf nobody chose.

## 8. Verification

```
pnpm -F @brandfactory/db typecheck        clean
pnpm -F @brandfactory/db lint             clean
pnpm -F @brandfactory/shared lint         clean
prettier --check  (db + shared)           clean
pnpm test                                 1409 passed | 68 skipped (135 files)

docker compose -f docker/compose.yaml up -d
DATABASE_URL=… pnpm -F @brandfactory/db test
                                          96 passed (9 files) — every live suite runs
```

Tests **1407 → 1409 (+2)** without a database; skipped **64 → 68 (+4)**, which
is the four new live cases. With `DATABASE_URL` set, `brand-assets.live.test.ts`
goes 17 → 21 and the whole db package is green.

### `pnpm typecheck` still fails, and the list is shorter

Phase A left 16 sites. Ten remain, all still the same *Property `library` is
missing*, all in packages this phase does not touch:

| Site | Count | Fixed by |
| --- | --- | --- |
| `packages/server/src/routes/assets.ts` | 1 | **C1** — the route must resolve a default |
| `packages/server/src/test-helpers.ts` | 3 | **C4** — the fake mirrors the real query |
| `packages/web/…` test fixtures (6 files) | 6 | **D / E / F** |

`packages/db` and `packages/shared` both typecheck clean. Green everywhere at
the end of Phase C.

## 9. Carried forward

- **The `POSITION_STEP` append scope** is still `kind` only — C2's work, not
  this phase's. A new photograph can still take its number from the collateral
  shelf until then; cosmetic, and stated so in the plan.
- **`defaultLibraryFor` still has one caller.** C1 is the second. The rule is
  reachable from the query layer's type but nothing resolves it yet.
- **Nothing writes a `typeface` role.** 0011 adds the value and the identity
  shelf's toggle is F3. Until then it is an enum member with no producer — which
  is the correct order (retrofitting a role onto rows a user has already uploaded
  is worse), but worth naming so it is not mistaken for a gap.

## 10. Caveats

- **The scratch databases were not dropped.** `mig_clean` and `mig_backfill`
  still exist in the local dev Postgres. Harmless, and useful if Phase C wants
  to re-run either checkpoint; `dropdb` them at any point.
- **Docker Desktop was started by this phase** and left running.
- **The main dev database has been migrated to 0011.** Anything running against
  it now expects the column.
