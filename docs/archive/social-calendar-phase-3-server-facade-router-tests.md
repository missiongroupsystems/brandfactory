# Social calendar, Phase 3 — server facade, router, route tests

**Status:** shipped, 2026-08-03. Executes Phase 3 of
[`docs/executing/social-calendar-implementation.md`](../executing/social-calendar-implementation.md)
(proposal §4 of [`docs/executing/social-calendar.md`](../executing/social-calendar.md)).
End of proposal **Stage 1** — the contract, persistence and API exist end to
end; nothing is user-visible, which makes this the plan's first safe stopping
point.

---

## What landed, file by file

### `src/db.ts` — the facade (3.1)

`// Social posts` block: the five queries join the `Db` interface and
`buildDbDeps()`, between the asset block and the blob-reference one.

### `src/test-helpers.ts` — the fake (3.2)

`FakeDbState` gains `socialPosts: Map<string, SocialPost>` (`assetIds`
inline — the fake has no join table). The five fakes mirror the real scoping
exactly, per the plan's warning about a fake looser than production:

- `listSocialPostsByBrand` filters `deletedAt === null` and sorts with the
  shared **`bySchedule`** — the helper *is* the real SQL ordering, so the
  fake borrows it instead of restating it. `sort`'s stability stands in for
  the `createdAt` tie-break (the fake clock never ticks), as the research
  fakes already do with insertion order.
- `assertFakeAssetsInBrand` is the fake half of the query layer's ownership
  gate: same two rules (brand ownership, not-soft-deleted), and it throws
  the **same `AssetNotInBrandError` imported from `@brandfactory/db`**, so
  the route's `instanceof` catch behaves identically against fake and real.
  In `updateSocialPost` it runs before the row lookup, matching the real
  transaction's order — a bad assetId rejects even when the post would miss.
- Write scoping: brand + `deletedAt IS NULL` on patch and delete, `IS NOT
  NULL` on restore; spread-conditional patch keys; `assetIds` full
  replacement.
- `deleteBrand` cascades `socialPosts`, as the real FK does.

### `src/routes/social-posts.ts` (3.3)

`createSocialPostsRouter(deps: { db: Db })`, the assets router's shape:
every handler `c.var.userId` guard → `requireBrandAccess` → `zValidator`
(params from the branded ids, bodies from the shared input schemas). The
proposal §4 table exactly: GET/POST collection, POST `:postId/restore`,
PATCH/DELETE `:postId`.

Error vocabulary: `AssetNotInBrandError` → **400 `ASSET_NOT_IN_BRAND`**
(a bare `HttpError` — `ValidationError`'s code is fixed and this one is its
own); query-miss `null` → **404 `SOCIAL_POST_NOT_FOUND`**. The rethrow
helper narrows on `instanceof` and passes everything else through, so the
patch handler's own `NotFoundError` crosses the `try` untouched.

Router-degradation check, documented in the module: the only siblings under
the prefix are `:postId` and `:postId/restore` — no literal beside a param,
`RegExpRouter` keeps compiling, `/blob-urls/:key{.+}/read-url` stays alive.

### `src/app.ts` — the mount (3.4)

`.route('/brands', createSocialPostsRouter({ db: deps.db }))` directly after
the assets router; `/brands/*` auth middleware already applies.

### `src/routes/social-posts.test.ts` (3.5)

The full `assets.test.ts` matrix, 29 tests: 401 on all five methods; 403
cross-workspace on all five; 404 unknown brand. Validation 400s — missing
platform, bad platform, date-only `scheduledAt`, body over max, duplicate
`assetIds` (real ids, proving the refine), cross-brand and soft-deleted
`assetIds` on create **and** patch (asserting the `ASSET_NOT_IN_BRAND` code,
and that the rejected patch touched nothing). Defaults from platform alone;
attachment order round-trips create → list → patch replacement; list returns
tray-first calendar order, hides soft-deleted rows, and does not leak across
brands. Patch semantics: omitted keys stay, `scheduledAt: null` unschedules,
omitted `assetIds` keeps attachments, `[]` clears, empty patch 400s, and a
patch naming only `deletedAt` 400s (deletion is not a patch). Lifecycle:
cross-brand `postId` 404s with the row untouched; double delete 404s; patch
on a hidden row 404s; restore returns the row with its attachments; replayed
restore 404s.

Attachments in these tests are minted through the real asset routes — the
same path a client takes — so the ownership tests exercise the actual
cross-module contract, not a hand-built state.

## Verification

```
pnpm typecheck                    clean (all 10 packages)
pnpm lint                         clean (whole repo)
pnpm format:check                 clean (whole repo)
pnpm -F @brandfactory/server test 31 files, 343 passed
pnpm test                         1175 passed | 64 skipped (full tree)
pnpm -F @brandfactory/web build   clean
```

The parallel guideline-autofill stream settled during this phase: the 17
web-route failures and 3 lint errors observed at Phase 2's verification are
gone, so unlike Phase 2 this whole-tree number is a real green — though still
entangled with that stream's uncommitted additions, so the delta from 1054
(last commit) is a joint figure, not this stream's alone.

**No live pass**, as throughout (no Docker, no `.env`): the route matrix runs
against the fake; the live-Postgres suites (including Phase 2's twelve) stay
unobserved.

## Notes for the next phases

- **Stage 1 is complete** — Phase 4 (web data layer) starts the client half:
  `brandKeys.socialPosts`, the query/mutation module through the typed RPC
  `api.brands[':id']['social-posts']`, and `applySocialPostToCache` with the
  `bySchedule` re-sort.
- **Still nothing committed** (Phases 1–3 all uncommitted, alongside the
  autofill stream's finished work). The tree is green across both streams
  right now — if the checkout stays quiet, this is the moment to cut the
  per-phase commits the plan prescribes.
