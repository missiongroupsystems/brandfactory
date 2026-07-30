# Stage 2B — the asset routes

**Status:** shipped, 2026-07-29. Executes Stage 2B of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
on top of [Stage 2A](stage-2a-brand-assets-schema.md).

**No migration.** Four routes over the table 2A landed, mounted at `/brands`
beside the existing brand routers, all four behind `requireBrandAccess`.

**Still nothing user-visible.** Stage 2 releases at 2F as 1.10.0; the changelog
is untouched by this pass.

Test baseline: **610** (581 passed, 29 skipped) → **640** (611 passed, 29
skipped). **+30**, all in `packages/server`, none skipped — this phase's
verification is the in-memory harness plus a live end-to-end pass, and neither
needs a `DATABASE_URL` at `pnpm test` time.

---

## The route module never sees a file, and takes no `BlobStore`

```
client ──► POST /blob-urls/upload-url   (ALLOWED_UPLOAD_MIMES gates here)
       ──► PUT  <signed url>            (bytes go straight to storage)
       ──► POST /brands/:id/assets      { source: 'blob', blobKey, sizeBytes… }
```

Uploads reuse the transport that already existed; `routes/assets.ts` only ever
handles the row. The more deliberate half is the dependency:

```ts
export interface AssetsDeps {
  db: Db
}
```

**`DELETE /brands/:id/assets/:assetId` is a soft delete and must not sweep
bytes** — a soft-deleted asset can come back (`vision.md:51`), and sweeping
would make "hidden" mean "destroyed". Its two sibling deletes (`/brands/:id`,
`/projects/:id`) both sweep, so this is the one place the pattern inverts. Not
taking a `BlobStore` at all is what stops the next edit from restoring the
symmetry by reflex, and `app.ts` says so at the mount:

```ts
// No `storage`: asset delete is a soft delete and must not sweep bytes.
.route('/brands', createBrandAssetsRouter({ db: deps.db }))
```

Both halves of the rule have a test: `del` is never called on asset delete, and
`del` **is** called with exactly `['brands/mark.svg']` — the soft-deleted blob,
not the link — when the brand itself is deleted.

## The exactly-one-of rule at the wire is two mechanisms, not one

The plan says the create body being the shared union means *"the exactly-one-of
rule is enforced at the wire before the CHECK ever sees it."* Measured against
the running server, that is true, and it is true in **two different ways** —
which the phase found by writing a test that failed:

| body | outcome |
| --- | --- |
| `{ source: 'inline' }` — no `value` | **400**, with a field path |
| `{ source: 'blob' }` — no `blobKey` | **400** |
| `{ source: 'ipfs', … }` | **400** |
| `{ source: 'inline', value, blobKey, url }` | **201 — the strays are stripped** |

The last row was written as an expected 400 and came back 201. Zod objects drop
unknown keys rather than failing on them, so the stray column never reaches the
insert and the row that lands is a well-formed `inline` asset.

**That is the right outcome, and `.strict()` was considered and rejected.** A
strict wire schema turns "a newer client sent a field this server has not
shipped yet" into a 400, and the identical stripping is what makes `PATCH` safe
against a body trying to rewrite `source` — being strict on create and lenient
on patch would be two answers to one question. The invariant that matters holds
either way: **the row that lands can only carry the column its own `source`
names.** The test now asserts the strip and says why, rather than asserting a
rejection that does not happen.

## `UpdateBrandAssetInputSchema` omits five fields on purpose

`label`, `position`, `role`, `status`, `alt` — and **not** `source`, `kind`,
`value`, `blobKey` or `url`. Changing where an asset's bytes live is not an edit
to that asset, and a patch that could set the source columns one at a time is
the one shape that walks a row past `brand_assets_source_exactly_one` a column
at a time. Swapping means creating a new row and soft-deleting the old one,
which also keeps the old one recoverable.

A bare `{}` is a 400, matching `UpdateBrandInputSchema`'s rule, so an empty
patch is rejected at the wire rather than becoming a no-op write that still
bumps `updated_at`.

## `position` is optional, and the server appends

This is the one thing 2B added that the plan did not specify.

Requiring `position` means every client reads the brand's assets before adding
one, just to learn the current maximum — the same query, over the network, by
the party least able to do it atomically. 2E drops several files on the library
at once; that would be several of them.

**The append is scoped to the asset's own `kind`.** A single counter would put a
new colour at position 1300 behind twelve photos, which sorts it to the front of
the palette it meant to join the end of. Colours and images each start their own
run at 100, stepping by 100 — the sparse-integer convention
`guideline_sections.priority` already uses. A client that cares about placement
(a drag-reorder) still sends the value it wants, and there is a test for that.

---

## Verification

```
pnpm typecheck                             9/9 workspaces
pnpm lint / format:check                   clean
pnpm test                                  611 passed | 29 skipped (640)
```

**A note on that typecheck line.** An earlier run of this pass was checked by
counting `typecheck: Done` and reported clean at a glance; the count was 7 of 9,
and two real errors in the new test file were sitting under it — a TS2589
(`ReturnType<typeof seedBrand>['app']` asks TypeScript to re-derive the composed
Hono type through an inferred async return) and a tuple index into an untyped
`vi.fn()`. Both are fixed, with the reason written next to each; the line above
was re-run grepping for `error`.

### End to end, through the real server and real Postgres

The in-memory fake mirrors the real queries, but a fake that agrees with a
broken implementation is the failure mode it has — so the routes were also run
against live Postgres.

Port 3001 was already held by a running dev server, so this pass started **its
own server on `PORT=3999`** rather than killing somebody else's process. (An
earlier attempt silently exercised the pre-existing process instead; caught by
reading the log, and redone.)

| check | result |
| --- | --- |
| `POST` inline / blob / link | 201 each, stored |
| `POST` `javascript:alert(1)` as a link url | **400** |
| `POST` inline with no `value`, blob with no `blobKey` | **400** both |
| Server-appended `position` | colour → 100, image → 100, second image → 200 |
| `GET` list | 3 rows, **`proposed` included**, kind-then-position order |
| `PATCH { status }` only | 200; `role` and `label` both survive |
| `PATCH {}` | **400** |
| `PATCH { label, source, url }` | 200; `source` still `inline`, label applied |
| `DELETE` an asset | 200; list drops to 2 |
| The row after that delete | **still in the table**, `deleted_at` set, `blob_key` intact |
| `DELETE` the brand | 200; assets cascade to 0, no sweep errors logged |

The scratch brand and every row it owned were deleted afterwards; the dev
database is back to zero `brand_assets` rows and its three brands.

### Where the +30 tests went

| file | Δ | what it pins |
| --- | --- | --- |
| `server/src/routes/assets.test.ts` | +30 (new) | 401 unauthenticated · 403 across all four verbs for a brand in a workspace the caller does not own · 404 for an unknown brand · one create per source · five malformed bodies rejected with nothing written · the strip · four hostile link URLs · `status`/`role` defaults · kind-scoped append and an explicit position · `proposed` in the list and soft-deleted out · no cross-brand leak · patch semantics including omit-vs-null · source/kind immutable through patch · empty patch 400 · cross-brand patch 404 with the original intact · soft delete keeps the row · **no sweep on asset delete** · **sweep on brand delete, blob only** · 404 unknown asset |

**No existing test body changed.** `test-helpers.ts` gained an `assets` map and
five fake query helpers — each mirroring the real query rather than doing the
obvious thing, including `updateAsset`'s `undefined`-vs-`null` rule and
`listAssetsByBrand`'s kind-then-position order — and its `listBlobKeysByBrand`
gained the same second arm the real one got in 2A. The existing 147 server tests
pass untouched.

---

## Judgement calls this pass made

- **`position` is optional and appended server-side, per kind.** Reasoned above.
  The plan specified neither.
- **Not `.strict()` on the create body.** Reasoned above.
- **`PATCH`/`DELETE` return the row; a cross-brand id is a 404, not a 403.**
  `requireBrandAccess` has already passed at that point — the caller genuinely
  owns the brand in the path — so the only thing separating the two brands is
  `updateAsset`'s brand scoping, and from the caller's side that asset does not
  exist in that brand. 403 would leak that the id exists somewhere.
- **No `PUT /brands/:id/assets/reorder` route.** `reorderAssets` exists in the db
  layer and is wired into the `Db` facade, but nothing calls it until 2E builds
  drag-reorder. Shipping a route with no caller is a surface to maintain and no
  behaviour to verify.

## Left for later, named rather than buried

- **Nothing enforces that `kind` and `source` agree.** `kind: 'color'` with
  `source: 'blob'` is accepted by the wire, the CHECK and the union, and renders
  as an image with no colour value — `colorValue` returns `null` for it, so
  `ColorSwatches` skips it silently. The schema, the constraint and the mockup
  all call the axes orthogonal, so 2B did not invent a cross-axis rule; **it is
  the open question to settle in 2E**, where a real editor produces these
  combinations or does not.
- **`ALLOWED_UPLOAD_MIMES` still gates only `/blob-urls/upload-url`.** A `blob`
  asset row can name any `mime` string, because the row does not re-check what
  the write URL already allowed. Nothing uploads an asset until 2E.
- **`GET /brands/:id/assets` is unpaginated.** A brand with a thousand photos
  returns a thousand rows. Fine at the cardinality the mockup argued about
  (twelve colours, four photos); worth revisiting if the library ever grows a
  scroll.
- **No realtime broadcast on asset writes.** Canvas ops fan out over the
  `RealtimeBus`; assets do not. Two tabs on the same brand will disagree until
  one refetches. Not in the plan, and not obviously wanted before 2E.
- **No live browser pass.** This phase ships no UI. 2F's live pass is where the
  asset surfaces get looked at, and the plan marks it not skippable.

**Untouched:** `packages/web`, `packages/agent`, `adapters/*`, `packages/db`
(2A's queries needed nothing), the migration set (still 0004), `miniApps.ts`,
`.env.example` (no new env keys), and `docs/changelog.md`.

**Next in the plan:** 2C — the first UI. `useBrandAssets`, the route feeding
`colors` for real, `railVariant` deleted, and the rail's palette block gaining
its heading link.
