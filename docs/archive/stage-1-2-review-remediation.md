# Stages 1–2 — review remediation

**Status:** shipped, 2026-07-30. Not a phase of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md) —
a remediation pass over Stages 1 and 2 (1A–1B, 2A–2F) run against the shipped
code at the request of a pre-production review, while Stage 3 was mid-flight.

**No migration.** Nine findings, eight fixed here and one fixed by Stage 3G
before this pass reached it. Test baseline **817 → 887 (+70)**, zero skipped
with a `DATABASE_URL`.

---

## What the review was actually looking for

Stages 1 and 2 were asked one question — *is this 9/10, and can it go to
production* — and the answer split in two. The code was 9/10: the schema/route/
view layering held, `applyAssetToCache`'s two-place contract was right, the
`undefined` ≠ `[]` distinction was carried consistently through four layers, and
Stage 1A's protocol filter was the correct call for the correct reason.

The production answer was different, and it had nothing to do with code quality.

## 1 — the finding that would have shipped broken

**`fly.toml` sets `STORAGE_PROVIDER = "supabase"`. Every Stage 2 live pass ran
on `local-disk`.**

`app.ts` mounts `/blobs` only when the provider is `local-disk`. So 2D's
content-type fix — the one that stopped an uploaded SVG logo from silently
falling back to the monogram — and the `default-src 'none'; sandbox` + `nosniff`
headers beside it live on a route production never loads. Stage 2 is the first
feature whose primary content is *bytes*, and its byte path had been exercised
only on the provider production does not use.

Reading the two providers side by side turned a deployment gap into a concrete
defect:

```
local-disk   serves a blob from the KEY'S EXTENSION      (routes/blobs.ts)
supabase     serves a blob from the CLIENT'S PUT HEADER  (which this server mints)
```

Both inputs come from the same request, and `POST /blob-urls/upload-url` never
compared them. `{ filename: 'logo.svg', contentType: 'image/png' }` mints a key
ending `.svg` — so local-disk serves `image/svg+xml`, **a document**, and
Supabase serves `image/png`, for one set of bytes.

The fix removes the disagreement at the source rather than patching either
reader. The server mints the key, so it can guarantee the extension matches the
type it is about to authorise:

```ts
keyWithCanonicalExtension('uploads/…/logo.svg', 'image/png')  // → '…/logo.svg.png'
keyWithCanonicalExtension('uploads/…/logo',     'image/svg+xml') // → '…/logo.svg'
keyWithCanonicalExtension('uploads/…/logo.svg', 'image/svg+xml') // → unchanged
```

**Appending rather than rejecting** is deliberate: a file named `logo` with a
correct `image/png` is the ordinary case, not an attack, and refusing it would
be a UX regression enforcing a rule the user cannot see. The mismatched case is
not refused either — it is *disarmed*, served as the type
`ALLOWED_UPLOAD_MIMES` actually checked.

### What this still does not fix, and cannot from here

The Supabase path has no equivalent of `routes/blobs.ts`'s CSP and `nosniff`
headers, because on that path the server serving the bytes **is Supabase**. The
exposure is narrower than same-origin — script inside an SVG would run on the
storage origin, not the app's — but it is a real difference between the two
deployments and it belongs in the bucket's configuration.

**This remains the one item that needs a human before production:** one upload →
render → brand-delete cycle against a Supabase-backed deploy, with an SVG among
the files. No test in this repo can stand in for it.

## 2 — a colour value that was never checked to be a colour

`value` was `z.string().min(1).max(255)`. The UI could not produce a bad one —
`<input type="color">` emits `#rrggbb` and nothing else — so nothing surfaced
it. The API accepted anything, and the palette row rendered the stored string
through the **`background` shorthand**, which includes `background-image`:

```
value: 'url(https://tracker.example/p.png)'  →  the row paints as an outbound request
```

On a product whose vision says no data goes anywhere the user did not authorise,
a stored string that can originate a request is the wrong shape regardless of
who can write it. Today only the workspace owner can — `requireWorkspaceAccess`
is a single-owner check — so this was never a cross-tenant hole, and it is
reported here as the guard that must already exist on the day workspaces gain a
second member.

Fixed on three sides at once, because they cost nothing together:

- `AssetColorValueSchema` — an allowlist of *forms* (hex · named colour
  functions · bare keyword), not a CSS parser. The argument character class
  excludes `(`, `)`, quotes and semicolons, so no branch can nest a call, close
  the declaration or carry a URL. `url` and `image-set` are off the function
  list *and* unreachable through the arguments.
- `AssetLibraryView` moves to `backgroundColor`, the longhand, which cannot take
  an image at all. `ColorSwatches` was already on it.
- The inline arm of both the row schema and the create schema takes
  `AssetColorValueSchema` rather than a bare string.

## 3 — `kind` and `source` were orthogonal in the table and not in reality

2A's three axes are independent by design, and the CHECK pins `source` against
its three value columns — but nothing said which *kinds* may take which sources.
Both of these passed the schema, the CHECK and the route:

```
{ kind: 'color', source: 'link'   }  → an empty swatch with aria-label "Copy "
{ kind: 'image', source: 'inline' }  → a permanent "No preview" tile
```

Neither is reachable from the UI. Both were reachable from the API.
`checkKindSourceAgreement` enforces the biconditional — **a colour is inline and
an inline asset is a colour** — on the create schema, where requests are
actually parsed, and on the row schema so the two cannot drift.

**Deliberately not a fourth CHECK.** The `source` CHECK earned its SQL because
it spans three columns a direct writer could walk past one at a time; this is
two columns set together at insert, the only writers are `createAsset` and the
route above it, and adding a migration mid-Stage-3 would renumber one that stage
has already claimed. Worth revisiting when the next migration lands anyway.

## 4 — the blob sweep could destroy bytes it did not own

`POST /brands/:id/assets` takes `blobKey` from the client and checks neither
that the key exists nor that the caller minted it. That is tolerable for a
*read* — holding a key already grants one, via `GET /blob-urls/:key/read-url`,
and the transport is built so the server stays out of the byte path. Stage 2
made a stored key into something the **brand cascade deletes**, so a row
pointing at bytes it does not own turned a delete of your own brand into a
delete of another brand's file.

Not reachable in practice: keys embed a v4 UUID and workspaces are single-owner.
Which is exactly why it needed a test rather than a live repro.

The fix does not depend on either of those staying true. `listStillReferencedBlobKeys`
is asked **after** the cascade, so anything still pointing at one of the
collected keys is by definition a row outside the resource just deleted:

```
collect keys → delete rows → subtract what still points at them → sweep the rest
```

Soft-deleted rows count as references — a hidden asset can come back, and
destroying its bytes would make "hidden" mean "gone". Applied to the project
cascade too, which had the same shape.

## 5 — the undo 1.10.0 asked for

1.10.0 shipped asset delete with no confirmation and no way back, and named the
right fix in its own caveats: *"a misclick is a disappearance. The fix is an
Undo, not a dialog."* A dialog taxes every deliberate delete to catch the rare
accidental one. The row was always recoverable — nothing sweeps its bytes, by
design — and simply had no caller.

`restoreAsset` is that caller, as its own verb rather than a field on
`UpdateBrandAssetInput`: `deletedAt` is the one column a patch must not be able
to set, or a client could resurrect a row as a side effect of renaming it. The
toast names the asset, because a grid of thumbnails gives no other clue which
row just left.

Three `where` clauses came with it, all of which had been missing:

| writer | now also requires | so that |
| --- | --- | --- |
| `updateAsset` | `deletedAt IS NULL` | a patch cannot edit a row no read path returns |
| `softDeleteAsset` | `deletedAt IS NULL` | a second delete cannot move `deletedAt` forward under an Undo still on screen |
| `restoreAsset` | `deletedAt IS NOT NULL` | a replayed Undo is inert rather than a write on a live row |

## 6 — a transactional reorder that production could not reach

`reorderAssets` had been in the db layer since 2A, live-tested, transactional
and reachable from **nothing** — 2B declined to ship a route with no caller, and
2E's drag handler settled for N independent `PATCH`es of `{ position }`.

That pair is worse than it looks. Dragging one swatch renumbers every row after
it, so a nine-colour palette fired eight concurrent requests whose interleaving
decided the final order, and any one failing left the ramp half-renumbered under
a toast that named no row. The transaction was already written; it needed a door.

### The door had to be spelled carefully, and this is the part worth reading

The obvious spelling was `POST /brands/:id/assets/reorder`. It cost an
afternoon and broke a module it never touched.

A literal segment sitting where a sibling route has a parameter —
`/:id/assets/reorder` beside `/:id/assets/:assetId/restore` — is a shape Hono's
`RegExpRouter` refuses to compile, so `SmartRouter` silently falls back to
`TrieRouter` **for the whole application**. `TrieRouter` cannot match a
multi-segment `:key{.+}`. The visible symptom was:

```
GET /blob-urls/uploads/2024/04/uuid-photo.jpg/read-url   200 → 404
```

in `blobs-auth.ts`, a file this change did not open. **Its existing test caught
it**, which is the entire argument for the suite that already existed.

The route is `PATCH /brands/:id/assets` — a patch on the collection. No
literal-versus-parameter collision at any position, and the more honest verb
anyway: the body is a partial update of many rows.

The fake `reorderAssets` in `test-helpers.ts` was corrected in the same pass. It
mutated row by row and threw mid-list, so it reported a half-applied reorder as
correct — the one property the batch route exists to provide. It now resolves
every row before writing any.

## 7 — a count that could exceed its own denominator

The rail's header read `${sections.length} of ${SUGGESTED_SECTIONS.length}
suggested sections`. A brand may write as many sections of its own as it likes,
so six custom sections announced **"6 of 5 suggested sections"** — and none of
those six was a section the suggestions had ever proposed.

Now it counts what the list below it actually shows: `N written · M suggested`,
dropping the second half once every suggestion is written. Still no percentage,
no bar, no "incomplete" — the D2 register, only true. (Introduced in 1.7.0, so
outside Stages 1–2 strictly; fixed here because it is on the same surface and is
wrong.)

## 8 — the untested half

`AssetLibraryView` shipped 2E with 24 tests. `VisualIdentityPage` — its data
half, holding the sequential upload loop, the reorder arithmetic, and the
routing of which failure becomes a toast and which becomes inline text — shipped
with **none**. It was the only Stage 2E component without a suite.

It now has twelve. `AssetLibraryView` is stubbed rather than rendered: its own
suite covers the layout, what was untested is *the callbacks it is handed*, and
a stub exposing one button per callback tests those directly rather than through
a drag gesture jsdom cannot perform. That is also the second consumer the pure
view was built for — the seam outlived the mockup that motivated it.

## 9 — already fixed

Two comments still described `routes/demo.brand.assets.tsx` as a live second
consumer. **Stage 3G deleted the file and the comments before this pass reached
them**, which is recorded here because the review reported it as open and it was
not.

---

## Where the +70 went

| file | Δ | what it pins |
| --- | --- | --- |
| `shared/src/asset/color.test.ts` | +25 | thirteen accepted colour forms · ten refusals including `url()`, `image-set()`, a declaration break-out and a call nested inside an allowed function · the length cap · both directions of the kind↔source biconditional |
| `server/src/routes/assets.test.ts` | +12 | reorder applies and returns the full list · a bad id rolls the whole batch back · empty batch 400s · non-owner 403s · restore round-trips and is inert when replayed · double delete 404s · patching a hidden row 404s · **a key another brand still points at is not swept** · and the key *is* swept once the last reference goes |
| `server/src/content-type.test.ts` | +14 | extension → type · the octet-stream default · and the four `keyWithCanonicalExtension` cases, including a real SVG left alone |
| `web/…/VisualIdentityPage.test.tsx` | +12 | both loading gates and both error gates · the blob resolver · sparse positions from 100 · a row that did not move is not written · the Undo names the asset and calls restore · a failed delete offers no Undo |
| `db/src/brand-assets.live.test.ts` | +3 | the three new `where` clauses against real Postgres · the reference filter across both tables, hidden rows included · the empty-list short circuit |
| `web/…/BrandContextRail.test.tsx` | +4 net | the corrected copy · six custom sections claim no suggestions · the suggestion half disappears when every suggestion is written |

## Verification

```
pnpm typecheck                                 10/10 workspaces
pnpm lint / format:check                       clean
DATABASE_URL=<clean db> pnpm test              887 passed | 0 skipped
release migrator, from empty                   applied; idempotent on re-run
  CHECK · both partial indexes · FK cascade    read back off the fresh database
pnpm --filter @brandfactory/web build          ok · occurrences of "demo" in dist → 0
```

**On the dev database, one test fails and it is not a defect.**
`listRecentProjectsByWorkspace computes lastActivityAt and orders by it` asserts
an exact count of distinct brands, and the local database carries two
hand-created brands (`Casa Vostra`, `Ebb & Flow Group`) left over from manual
use. The same suite is **887/887 against a freshly migrated database**, which is
how that was established rather than assumed. The test is correct; asserting
exact counts against a shared dev database is a durability weakness in it, and
deliberately not changed here — it is not this pass's, and the data is the
user's.

## Caveats

- **The Supabase byte path is still unverified**, which is finding 1's
  irreducible half. `keyWithCanonicalExtension` makes the two providers agree
  about the *type*; nothing here proves Supabase stores and returns it as
  expected, and nothing here gives that path the CSP and `nosniff` headers.
  One live cycle on a Supabase deploy, with an SVG, before production.
- **The dnd-kit keyboard sensor is still wired and unexercised** — unchanged
  from 1.10.0. The reorder *arithmetic* is now tested; the *gesture* is not.
- **`blobKey` ownership is still unverified at create.** The destructive
  consequence is closed by the sweep subtraction; a row can still name a key it
  did not mint, and `GET /blob-urls/:key/read-url` still grants a read to any
  authenticated holder of a key. That is pre-existing (0.7.1) and out of Stages
  1–2, but it is the reason the sweep fix was written to be independent of it.
- **Nothing sets `alt`** — unchanged.
- **No migration**, so nothing to roll back. Every change is a schema
  refinement, a `where` clause, a route, or a test.

**Untouched:** `packages/agent`, the migration set (still 0005, Stage 3C's), the
research adapter and every Stage 3 surface.
