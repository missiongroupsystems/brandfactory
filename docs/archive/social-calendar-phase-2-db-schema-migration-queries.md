# Social calendar, Phase 2 — DB schema, migration 0009, queries

**Status:** shipped, 2026-08-03. Executes Phase 2 of
[`docs/executing/social-calendar-implementation.md`](../executing/social-calendar-implementation.md)
(proposal §1 + §3 of [`docs/executing/social-calendar.md`](../executing/social-calendar.md)).

**The migration gate, resolved:** the user first chose to wait for autofill's
0008; it landed the same day (`0008_sour_mister_sinister.sql`), so this phase
generated as **0009** exactly as the proposal planned. `db:generate` was run
with a placeholder `DATABASE_URL` — `drizzle.config.ts` demands one even for
generation, which never connects.

Only `packages/db` and one shared schema (see the deviation below) were
touched. Nothing imports the new queries yet — Phase 3's facade does that.

---

## What landed, file by file

### `src/schema/social_posts.ts` — the aggregate (2.1, 2.2)

- `socialPlatform` / `socialPostStatus` pgEnums, member lists duplicated with
  the zod schemas per convention (the shared tests pin both).
- `social_posts` per proposal §1: nullable `scheduled_at`, `body` default
  `''`, `status` default `'draft'`, soft-delete `deleted_at`, all timestamps
  `{ withTimezone: true, mode: 'string' }`; partial index
  `(brand_id, scheduled_at) WHERE deleted_at IS NULL`. No CHECKs — no
  invariant spans columns (the `brands.website_url` precedent).
- `social_post_assets`: PK `(post_id, asset_id)`, `position integer not null`,
  index on `asset_id`, both FKs cascade. Posts hold no `blobKey`s, so the
  blob-sweep queries needed no changes.

### `drizzle/0009_dear_zeigeist.sql` (2.4)

Generated, never hand-numbered; reviewed against §1: both enums, composite
PK, three cascading FKs, the `asset_id` index, and the partial index with its
`WHERE deleted_at IS NULL` — all present and correct.

### `src/mappers.ts` — `rowToSocialPost(row, assetIds)` (2.5)

Every timestamp through `toIsoTimestamp` / `toIsoTimestampOrNull` (the
normalisation that makes `bySchedule`'s string comparison valid). `assetIds`
come from the caller: only the query layer has both halves of the aggregate.
Two unit tests joined `mappers.test.ts` — Postgres-format timestamps
normalise and the result parses as `SocialPostSchema`; nulls stay null —
because the live suite skips in CI and the mapper deserved a runnable proof.

### `src/queries/social-posts.ts` (2.6, 2.7)

Modeled on `queries/assets.ts`, exported from `db/src/index.ts`:

- `listSocialPostsByBrand` — active rows,
  `scheduled_at asc nulls first, created_at asc` (drizzle's `asc()` cannot
  spell `nulls first`, so that term is a `sql` fragment); one second select
  over the join rows for all listed posts, ordered `(post_id, position)`,
  grouped in JS via a `Map`.
- `createSocialPost(brandId, input)` / `updateSocialPost(brandId, id, patch)`
  take the **shared input types directly** — the row's field names match the
  wire's, so a parallel db-side input type would only be a place for the two
  to drift (the asset slice needed its own because of the source union;
  this table doesn't).
- Both writes are one transaction: ownership check → row write → join rows.
  `assertAssetsInBrand` requires every id to be this brand's and not
  soft-deleted, and throws the exported **`AssetNotInBrandError`** — the
  typed error Phase 3's route converts to 400 `ASSET_NOT_IN_BRAND`. Join
  rows are written `position = (i + 1) * 100`; a patch's `assetIds` is
  delete-and-reinsert (full replacement, add/remove/reorder one verb).
- `softDeleteSocialPost` / `restoreSocialPost` — the asset pair's scoping
  verbatim: delete matches `deletedAt IS NULL` (double delete → null → 404),
  restore matches `IS NOT NULL` (replayed Undo inert). Join rows untouched,
  so restore returns the post with its attachments intact.

### `src/social-posts.live.test.ts` (2.8)

`describe.skipIf(!DATABASE_URL)`, own pool, scratch brands swept in
`afterAll` — the `brand-assets.live.test.ts` mold. Twelve tests: wire-shape
round-trip incl. null `scheduledAt`; the `nulls first` list order; column
defaults; attachment order + sparse positions (asserted via raw SQL);
cross-brand `assetId` rejected **and the create rolled back whole**;
soft-deleted `assetId` rejected on create and patch; patch semantics
(omitted keys stay, full replacement, `scheduledAt: null` unschedules);
wrong-brand writes miss; the hidden-row lifecycle (no patch, no re-delete,
restore once with attachments, replay inert); brand-delete cascade through
to join rows; asset hard-delete cascade leaving the post standing; unknown
id misses rather than throws.

## One deviation, discovered here, fixed in `shared`

`SocialPostAssetIdsSchema` gained a no-duplicates `.refine` (+1 shared test).
The join table's PK is `(post_id, asset_id)`: a duplicate attachment is
unrepresentable, and without the refine `assetIds: [a, a]` would pass the
wire and surface as a unique-violation 500 from the insert instead of a 400
at the boundary. Phase 1 didn't see it because the constraint lives in this
phase's table.

## Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint / format:check          clean on db + shared (see caveat)
pnpm -F @brandfactory/shared test 79 passed  (78 → 79, the refine test)
pnpm -F @brandfactory/db test     27 passed | 64 skipped (live suites; +2
                                  mapper tests, +12 live tests among the skips)
pnpm -F @brandfactory/web build   clean
```

**Shared-checkout caveat, again observed directly:** the full-tree run showed
17 failing web tests and 3 lint errors, all in
`routes/brands.$brandId.context.tsx` and the project-route tests — files the
parallel guideline-autofill stream was actively editing during this phase
(the lint error count changed between two consecutive runs). Nothing in this
phase touches those files; db and shared are green in isolation. A clean
whole-tree number is unmeasurable until that stream settles.

**No live pass** (no Docker, no `.env`): the twelve live tests are written
but unobserved. The `nulls first` fragment, the transaction rollback, and
both cascades are the items that most want a real run once
`docker/compose.yaml` is up.

## Notes for Phase 3

- The facade needs exactly the five exported queries; the typed error to
  map is `AssetNotInBrandError` → 400 `ASSET_NOT_IN_BRAND`.
- The in-memory fake must mirror `assertAssetsInBrand`'s two rules (brand
  ownership **and** not-soft-deleted) and the duplicate-ids refine already
  rejects at the wire, so the fake needs no duplicate handling.
- **Phase 2 is not yet committed.** The plan prescribes commit-per-phase,
  but the shared checkout carries the autofill stream's uncommitted,
  in-flight work (including staged files) — a commit cut now would either
  sweep that in or require path-surgery against a moving tree. Commit this
  phase's files as soon as the checkout is quiet.
