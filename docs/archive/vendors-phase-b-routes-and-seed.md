# Vendors Phase B — the routes and the seed

**The vendor book is on the wire and in the database. Nothing on screen changed.**

Phase B of [`./vendors-on-real-data-plan.md`](./vendors-on-real-data-plan.md),
on [Phase A](./vendors-phase-a-the-record.md). `/vendors` still renders the Operations Hub screen
over `fixtures/agencies.ts`; `packages/web-next` was not opened. What landed is five routes, five
methods on `createFakeDb`, one gate the fake could not infer, and nine seeded companies.

After this phase: **2353 passed | 140 skipped** (2493 with a database). That is 33 new route tests
and one widened seed assertion. 7 files: 5 modified, 2 new.

---

## 1. Five handlers, one router, no new authz rule

`server/src/routes/vendors.ts` — `createWorkspaceVendorsRouter`, on `routes/influencers.ts`' shape
exactly.

| | |
| --- | --- |
| `GET /workspaces/:workspaceId/vendors` | Exhaustive, name order, no filters |
| `POST /workspaces/:workspaceId/vendors` | 201 with the row; the slug is chosen here, not sent |
| `GET /workspaces/:workspaceId/vendors/:vendorRef` | Slug **or** id |
| `PATCH /workspaces/:workspaceId/vendors/:vendorRef` | Id only |
| `DELETE /workspaces/:workspaceId/vendors/:vendorRef` | Id only; returns the row that went |

**One router under `/workspaces`**, because a vendor is reachable by slug and a slug is unique per
workspace only — so every handler needs the workspace anyway, and an id-scoped half at `/vendors`
would mean a second prefix in the auth gate for no gain.

That also means **no `requireVendorAccess` in `authz.ts`**, and the file was not opened. The gate is
`requireWorkspaceAccess` plus a query layer that is workspace-scoped throughout: a vendor id from
another workspace *misses* rather than being read or written across the boundary. The route test
`cannot reach a vendor through another workspace` asserts that on all three id-taking methods and
then checks the row is untouched.

`RefParam` accepts a slug or an id on the **GET only**. The PATCH and DELETE take `VendorIdSchema`.
A patch is aimed at one record and a caller holding a slug has already read the row it is patching,
so accepting both there would only widen the surface.

### The router-degradation check

The trap `routes/assets.ts` documents: a literal segment where a sibling has a param makes
`RegExpRouter` refuse to compile, `SmartRouter` silently falls back to `TrieRouter` **for the whole
app**, and `/blob-urls/:key{.+}/read-url` starts 404ing in a module the change never opened.

Under `/workspaces`, `:workspaceId/vendors` sits beside `brands`, `projects`, `settings`,
`research`, `outlets` and `influencers` — all literal segments at the same position, none of them a
param — and `:vendorRef` is its only child. That is the permitted shape, and **`app.test.ts` proves
it rather than this note**: it asserts `SmartRouter + RegExpRouter` by name and re-checks the
multi-segment blob key. Both passed unchanged.

---

## 2. The two refusals, and which one is new

`rethrowWriteConflict` runs on the create and on the patch, because both verbs produce both
conditions.

**`BrandNotInWorkspaceError` → 400 `BRAND_NOT_IN_WORKSPACE`.** Reused unchanged from outlets and
influencers. The gate cannot tell a brand in another workspace from one that does not exist — both
are ids the caller's brand list never showed it — so one code covers both. 400 rather than 404: the
*vendor* route is fine; the body named a brand this workspace does not have.

**`VendorUenTakenError` → 409 `VENDOR_UEN_TAKEN`.** The body is well-formed and every id in it is
real; the workspace simply already holds that company. That is a conflict with existing state rather
than a fault in the request, which is what 409 is for and what `INFLUENCER_HANDLE_TAKEN` already
uses.

The message names the UEN and gives a way forward:

> UEN 202144552M is already on a vendor in this workspace. One company, one registration number —
> open that record instead, or clear the UEN if this is a different company.

That wording is load-bearing rather than decoration. `useSubmit` puts an `AppError`'s message
straight on the form, so this sentence is what a person reads while looking at the box they just
typed into. Without the mapping the unique index answers `500 Internal Server Error`, and *that*
sentence is what the form would show — which is exactly the defect 1.40.1 was spent on, one
aggregate over.

**A duplicate *name* cannot reach this path at all**, and the route test says so by name:
`accepts the same name twice, because a name is not an identifier`. Two rows land and the second
takes `northlight-talent-2`. That is the decision that separates this aggregate from influencers,
and it is asserted rather than assumed.

---

## 3. The one trap: `assertFakeUenFree`

The plan named this twice and it earns the repetition.

Every other behaviour in `server/src/test-helpers.ts` mirrors a **query** — the fake can be written
by reading the real function. `vendors_workspace_uen_key` is an **index**. There is nothing to
mirror, so the rule has to be restated in the fake or it does not exist there:

```ts
function assertFakeUenFree(state, workspaceId, uen, exceptId?) {
  if (uen === null || uen === undefined) return
  for (const vendor of state.vendors.values()) {
    if (vendor.id === exceptId) continue
    if (vendor.workspaceId === workspaceId && vendor.uen === uen) throw new VendorUenTakenError(uen)
  }
}
```

Without it, **every route test in §5 asserting a 409 would pass against a server answering 500** —
the very failure the mapping exists to remove. `assertFakeHandleFree` sits directly above it and
carries the same warning for the same reason.

Two properties of it are decisions rather than mechanics:

- **`null` is not a value.** A vendor with no UEN never clashes with another that has none, matching
  Postgres, which is why the real index needs no partial predicate. A fake that treated `null` as a
  duplicate would refuse the ordinary case — most rows carry no UEN. The route test
  `lets many rows carry no UEN at all` covers the fake; `vendors.live.test.ts` covers the index.
- **`exceptId` excludes the row being patched.** Otherwise every edit that re-sent the form's own
  values would refuse itself, and `lets a vendor keep its own UEN through an unrelated patch`
  asserts it.

The check runs **after** the row lookup in `updateVendor`, not before. A patch aimed at a vendor
that does not exist is a fact about the **path**: it is a 404 even when the body also names a taken
UEN, because reporting the clash would send the reader to fix the wrong thing. The test that pins
this uses a **uuid-shaped** absent id on purpose — the real query compares the ref against a `uuid`
column, so a non-uuid id raises in Postgres and never reaches the branch, and an assertion written
against `'vendor-nope'` would hold for the fake alone.

The fake also learned two cascades: `deleteWorkspace` drops the workspace's vendors, and
`deleteBrand` strips the brand from every `brandIds` without deleting the vendor — the many-to-many
equivalent of the `SET NULL` outlets chose.

---

## 4. `db.ts` and `app.ts`

Five entries on the `Db` surface and five in the concrete object. One `.route('/workspaces', …)`
line beside influencers. No `storage`, because a vendor holds no blob keys and its delete has
nothing to sweep — the same argument outlets and influencers make.

---

## 5. The route tests

`server/src/routes/vendors.test.ts`, 33 tests in six describes, on `routes/influencers.test.ts`'
shape. The ones worth naming:

| Test | What would break without it |
| --- | --- |
| `409s on a UEN already in the workspace` | The 500 the mapping exists to remove |
| `409s rather than writing a second row` | A refused create leaving a row behind |
| `accepts the same name twice` | A false unique key on `name` |
| `404s rather than 409s when the patch names a taken UEN on a missing row` | A refusal about the body over one about the path |
| `frees the UEN it was holding` | A mistyped vendor locking a registration out of the workspace permanently |
| `keeps the contacts in the order they were sent, and does not sort them` | A silently reordered list somebody arranged |
| `rejects two primary contacts` | The zod refinement is the only enforcement point — nothing else refuses it |
| `replaces contacts wholesale, and swaps the primary in one request` | The reason there is no partial unique index |
| `survives its brand being deleted, with only the link removed` | A cascade that deleted companies with brands |

`frees the UEN it was holding` has no counterpart in the influencers suite and was added here. The
409 is about a *live* row, and a person who mistypes a UEN on a vendor they then delete must be able
to enter it again.

---

## 6. The seed

Nine companies — `packages/web-next`'s six agencies plus the three providers out of
`fixtures/contracts.ts` — re-pointed at the two demo brands and re-categorised.

**Both fixtures stay exactly where they are.** Sixteen fixture agreements name those nine by *their*
ids and `/contracts` is a live nav item, so this is a copy of the roster and not a move of it. Two
vendor books are on screen at once until the contracts conversion closes it; the plan states that as
an accepted cost and Phase G adds the `Sample` tag that makes it visible.

The ids are **not** the fixtures'. `v2000000-…` is not a uuid and the column is, so the seed
continues its own sequence at `…041` through `…049`.

What the nine carry, and why each:

- **Every category state but one.** Four `talent_agency`, one `media_agency`, one `software`, one
  `production`, one `pr_agency`, and one **`null`**.
- **Halcyon is a `media_agency`**, on the strength of its own fixture note — *"Also books the
  out-of-home placements"*. `fixtures/agencies.ts` complained in a docstring about *"a nearly
  monotone column on `/vendors`"*; this vocabulary is what fixes that, so the seed does not hand
  back a column of one value.
- **One `inactive` (Tidewater) and one `blacklisted` (Redpin).** Not the same statement, and the
  blacklisted row carries a note saying why — a decision flag with no reason is unreadable.
- **Contacts on three rows and none on six**, so the detail page's real empty state ships seeded
  rather than only in a test. Northlight has two people with a primary appointed, Halcyon has a
  single primary, and **Loopline has one person with no primary at all** — an ordinary state the
  screen must not read as a fault.
- **Two rows hold no brand** (Sunbeam, Tidewater); one row names both (Northlight).
- **Two rows carry a UEN** (Loopline, Bellweather), so the unique index has something to be about on
  a seeded database.

`slug` is written out rather than derived, the call `SEED_OUTLETS` and `SEED_INFLUENCERS` already
make: the seed inserts directly and never calls `createVendor`, so nothing would pick one, and a
hard-coded slug keeps a screenshot's URL stable across reseeds.

### The deviation from the plan, stated

The plan asked for **six `talent_agency`** and, two sentences later, for **one row with no
category**. With nine rows those cannot both hold. It was resolved toward the screen states: four
`talent_agency`, one `media_agency`, one `null`.

The `null` row is **Sunbeam Social**, whose fixture already carried `category: null` and whose
docstring said *"a two-person management shop has no trade at all"*. `null` means *nobody has said*,
which is a different fact from `other` — Phase A's `VendorCategorySchema` makes that distinction
load-bearing and this is the seeded proof of it.

**`other` is deliberately not seeded.** It means *somebody said, and none of these*, and none of
these nine is genuinely that. Filling the enum by declaring a row `other` would be a false record
about a decision nobody made. The Phase G browser pass will see nine of the ten glyphs, and that is
the honest count.

### The insert ordering

**The row before both of its children.** Every `vendor_brands` and `vendor_contacts` foreign key is
strict, so a link or a contact written before its vendor fails loudly. That is correct behaviour,
and the plan asked for it to be confirmed in this phase rather than discovered in Phase D — it was,
by running the seed against a database carrying migration 0015.

`vendor_contacts` is the **second composite-key insert in this seed**, and its conflict target is
`(vendor_id, position)` rather than an id, because the row has no id at all. `seed.test.ts` asserts
the exact counts — 9 vendors, 8 link rows, 4 contact rows — for the reason its influencer assertion
already gives: a reseed re-offers every pair, a wrong `target` would either raise or double the
count, and nothing on any screen would say so.

---

## 7. Verification

```
pnpm typecheck                             clean (11 packages)
pnpm lint                                  clean (whole repo)
pnpm format:check                          clean
pnpm test                                  2353 passed | 140 skipped (192 files)
pnpm test  (with DATABASE_URL)             2493 passed | 0 skipped
pnpm -F @brandfactory/web build            clean
pnpm -F @brandfactory/web-next lint        clean
pnpm -F @brandfactory/web-next typecheck   clean
pnpm -F @brandfactory/web-next build       clean — static/dynamic split unchanged
```

2320 → 2353 is the 33 route tests. The skipped count does not move: this phase added no live test.

### The ship criterion, met

The plan's Phase B ships when *"`curl` against a seeded database returns the vendor book"*. The
migration was applied, the seed run, and `pnpm -F @brandfactory/server dev` brought the real server
up against real Postgres:

```
GET /workspaces/…0002/vendors                     → 9 vendors, name order
  bellweather-pr-pte-ltd      pr_agency      active       uen=201933718E  brands=1 contacts=0
  fieldnote-studio            production     active       uen=None        brands=1 contacts=0
  halcyon-media-group         media_agency   active       uen=None        brands=1 contacts=1
  kite-co-creator-management  talent_agency  active       uen=None        brands=1 contacts=0
  loopline-software-pte-ltd   software       active       uen=202144552M  brands=1 contacts=1
  northlight-talent-pte-ltd   talent_agency  active       uen=None        brands=2 contacts=2
  redpin-creators             talent_agency  blacklisted  uen=None        brands=1 contacts=0
  sunbeam-social              None           active       uen=None        brands=0 contacts=0
  tidewater-talent-llp        talent_agency  inactive     uen=None        brands=0 contacts=0

GET  …/vendors/northlight-talent-pte-ltd          → 200, contacts in position order, primary first
POST …/vendors  {uen: "202144552M"}               → 409 VENDOR_UEN_TAKEN, message names the UEN
POST …/vendors  {name, category, contacts}        → 201, slug derived, status defaulted to active
DELETE …/vendors/<id>                             → 200, then 404
```

**The 409 there came from the real unique index, not from `assertFakeUenFree`.** That is the one
thing the route suite alone cannot prove, and it is why the curl pass is recorded rather than
described. The test vendor was deleted afterwards, so the database holds the nine seeded rows.

`packages/web` and `packages/web-next` were not opened.

---

## 8. What Phase C inherits

The rename. `features/vendors/` moves to `features/registry-vendors/` whole and unedited, twelve
import sites are re-pointed, and `lib/api/cache.ts`' `vendors` / `vendor` scopes become
`registryVendors` / `registryVendor`.

The risk there is not the imports — a missed one is a type error. It is the **cache scope strings**:
a missed string is neither a type error nor a runtime surprise, and `cache.test.ts` pinning every
value as distinct is the only thing that catches it.
