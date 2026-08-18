# Influencers, Phase B — the routes and the seed

The record Phase A created becomes reachable. Five routes under `/workspaces`, five entries on the
`Db` surface, one `.route()` line in `app.ts`, and nineteen creators in the dev seed.

Still nothing on screen. `/influencers` renders `fixtures/influencers.ts` exactly as it did at
1.39.0, because the feature folder still calls `mock.ts`. That is Phase C.

No migration — 0014 landed in Phase A. Test count **2270 passed | 110 skipped**, up from 2246 | 110.

Phase B of [`../executing/influencers-on-real-data-plan.md`](../executing/influencers-on-real-data-plan.md).
`packages/web-next` is untouched. `packages/web` is untouched and still builds, which matters here
because it shares the server's inferred `AppType` — see §5.

---

## 1. The shape that landed

```
packages/server/src/routes/influencers.ts        NEW — createWorkspaceInfluencersRouter
packages/server/src/routes/influencers.test.ts   NEW — 24 assertions
packages/server/src/db.ts                        + 5 surface entries, + 5 concrete
packages/server/src/app.ts                       + 1 import, + 1 .route() line
packages/server/src/test-helpers.ts              + fake state, 5 fake queries, 2 cascades
packages/db/src/seed.ts                          + SEED_INFLUENCERS (19 rows, 17 links)
packages/db/src/seed.test.ts                     + 2 assertions
```

### The wire

```
GET    /workspaces/:workspaceId/influencers                  → Influencer[]  exhaustive, reach order
POST   /workspaces/:workspaceId/influencers                  → Influencer    201
GET    /workspaces/:workspaceId/influencers/:influencerRef   → Influencer    ref = slug or id
PATCH  /workspaces/:workspaceId/influencers/:influencerRef   → Influencer    ref = id
DELETE /workspaces/:workspaceId/influencers/:influencerRef   → Influencer    200 with the row that went
```

`routes/outlets.ts`' shape exactly, including the two decisions that shape encodes:

**One router under `/workspaces`, not two.** Every other aggregate here splits into a
workspace-scoped list/create and an id-scoped read/patch, because a brand or a project id is
globally unique and carries its own parent. A creator is reachable by **slug**, and a slug is
unique per workspace only — so every handler needs the workspace anyway, and putting the id-scoped
half at `/influencers` would mean a second prefix in the auth gate for no gain.

**No `requireInfluencerAccess` in `authz.ts`.** The gate is `requireWorkspaceAccess` plus a query
layer that is workspace-scoped throughout: an influencer id from another workspace *misses* rather
than being read or written across the boundary. One route test proves all three verbs miss it at
once.

**`RefParam` on the GET, `IdParam` on the PATCH and DELETE.** A patch is aimed at one record and a
caller holding a slug has already read the row it is patching, so accepting both would only widen
the surface. The GET accepts both so a link degrades: a row that fetched the whole creator emits
the readable form, and anything holding only an id still resolves.

### The router-degradation check

The trap `routes/assets.ts` documents: `RegExpRouter` refuses to compile when a literal segment
sits where a sibling route has a param, and the whole app then degrades to `TrieRouter`, where
`/blob-urls/:key{.+}/read-url` silently stops matching.

Under `/workspaces`, `:workspaceId/influencers` sits beside `brands`, `projects`, `settings`,
`research` and `outlets` — all literal segments at the same position, none of them a param — and
below it `:influencerRef` is the only child. `app.test.ts` asserts
`app.router.name === 'SmartRouter + RegExpRouter'` and fetches a multi-segment blob key; both still
pass. That test is what proves it, not this paragraph.

---

## 2. The fake `Db` earns its own section

`test-helpers.ts` mirrors the real query layer rather than doing the obvious thing, because a
looser fake lets a route test pass against behaviour the server does not have. Four properties are
load-bearing here and each has an assertion above it that would pass against a looser fake:

- **`brandIds` comes back sorted, from every read and every write.** The real query sorts so two
  reads of one row are byte-identical. A fake that echoed the request order would let
  `accepts brands in the same workspace, and sorts them` pass against a response the server never
  sends.
- **`assertFakeBrandsInWorkspace` reports the first miss only**, exactly as
  `assertBrandsInWorkspace` does. A fake that named every miss would let a test pass against an
  error message the real query never produces.
- **The brand gate runs before the row lookup on a patch**, as the real query runs it before the
  update.
- **`deleteInfluencer` returns the row with its brand ids on it.** The real query reads them inside
  the transaction before the cascade removes the link rows; a fake that returned an empty array
  would make the delete response look right on the id and wrong on everything else.

Two cascades were added to the existing fakes:

- `deleteWorkspace` now deletes the workspace's influencers, because `influencers.workspace_id` is
  `ON DELETE CASCADE`. Nothing there touches `brandIds` — the link rows go with each creator by
  their own cascade.
- `deleteBrand` now **filters that brand out of every creator's `brandIds`** and leaves the
  creator. This is the many-to-many equivalent of the `SET NULL` the same function already applies
  to `outlets.brandId`, and getting it wrong in the other direction — deleting the creator — would
  state that a person stops existing when a brand does. One route test asserts the *other* link
  survives, which is what makes it a link removal rather than a reset.

---

## 3. The seed

Nineteen creators and seventeen link rows, in `SEED_INFLUENCERS`. It is
`packages/web-next`'s `fixtures/influencers.ts` re-pointed at the two demo brands, and the whole
roster is there to exercise the screen Phase C builds:

| | |
| --- | --- |
| Mega holds **exactly one** row | Priya Raman at 1.24M, so the count badge and the collapse toggle correctly vanish on that band and render on the other four |
| Every platform, every vertical | Six and ten respectively, so no filter option leads to an empty table |
| **Two** creators with no vertical | A photographer who shoots whatever the brief is, and a B2B voice on LinkedIn. The em dash on screen rather than only in a test |
| **Three** with no engagement rate | Prospects nobody has run a campaign with — the state the column is nullable for |
| **Five** with no brand | An empty set reads as "Not engaged yet", never as a gap |
| **Three** naming two brands | What the join table exists for, and what the brand cell has to render more than one name into |
| Engagement falls as reach rises | A nano at 14.2% and a mega at 1.1% is how the columns actually relate. A roster where the rate wandered would make the one number arguing *against* the top band look like noise |

**What did not survive the move**, and the plan predicted it: *"three rows name the retired
brand"*. Eastside Kitchens was retired and still had creators against it — retiring a brand does
not un-run the campaigns made for it — and there is no retired brand in this workspace to say that
with. Those three rows point at Acme or Northwind instead. Everything else in the list above is
preserved and is stated in the seed's docstring rather than only here.

Three mechanical points:

- **The row is inserted before its links**, and the influencers block runs after the brands. Every
  `influencer_brands` foreign key is strict in both directions, so a link written before its
  creator or its brand fails loudly. The plan listed that as a risk worth confirming; the ordering
  is what avoids it, and it was confirmed by running the seed.
- **`engagementRate` is written as a string** — `'1.10'`, not `1.1` — because that is what the
  `numeric` column takes as well as what it hands back. Two decimals, so the seeded figure and the
  figure read back are the same one.
- **`slug` is written out rather than derived**, the call `SEED_OUTLETS` already makes: the seed
  inserts directly and never calls `createInfluencer`, so nothing here would pick one, and a fixed
  slug keeps a screenshot's URL stable across reseeds. Each slug is its handle, which is what
  `influencerSlug` would have produced.

`seed.test.ts` gained two assertions: 19 creators and **17 link rows**. The number is asserted
rather than described because this is the one insert in the seed whose conflict target is a
composite key — a reseed re-offers every pair, and `ON CONFLICT DO NOTHING` on the wrong target
would either raise or double the count, with nothing on screen to say so.

The names are invented. None is a real person and none of the handles resolves to a real account.

---

## 4. The `curl` check the plan asked for

Against the seeded dev database, through the running server:

```
GET /workspaces/…/influencers                  200 — 19 rows
  order          priyaskin, nikhilreviews, devonang … jonaswidjaja, biancareyes
  engagementRate number | null on every row — never a string
  brandIds       3 rows with two, 5 rows with none
GET /workspaces/…/influencers/ameliaeats       200 — resolves by slug
GET /workspaces/…/influencers/nobody           404
GET /workspaces/…/influencers   (no token)     401
```

The reach ordering is visible end to end: biggest first, smallest last, which is the opposite of
every other list this server serves.

**One thing to carry into Phase C.** `'2.00'` in the column becomes `2` on the wire, because
`Number('2.00')` is `2` and JSON has one number type. The wire is correct and `InfluencerSchema`
accepts it; the screen is what has to decide whether that renders as `2%` or `2.0%`. That is a
formatting decision for `influencers-browser.tsx`, not a shape problem — but it is the kind of
thing that looks like a data fault when it appears in one row of a column.

---

## 5. Why `packages/web` was rebuilt for a change it does not contain

`packages/web/src/api/client.ts` builds its client with `hc<AppType>`, and `AppType` is inferred
from the chained `.route()` calls in `app.ts`. Adding a route therefore changes a type the Vite app
compiles against, even though that app has no influencer surface and imports nothing added here.

`pnpm -F @brandfactory/web build` is clean, so the new router widened `AppType` without disturbing
anything already reading it. That is the check, and it is the reason it runs in this phase rather
than only in Phase C.

---

## 6. Verification

```
pnpm typecheck                                     clean (11 packages)
pnpm lint                                          clean (whole repo)
pnpm format:check                                  clean
pnpm test                                          2270 passed | 110 skipped (187 files)
pnpm -F @brandfactory/web build                    clean
pnpm -F @brandfactory/db db:seed                   19 creators, 17 links; run twice, idempotent
DATABASE_URL=… pnpm vitest run --project @brandfactory/db
                                                   149 passed — every live test, nothing skipped
curl against the seeded database                   see §4
```

The count moves by **24**, all in `routes/influencers.test.ts`. The two `seed.test.ts` assertions
are inside a test that already existed, so they add coverage without adding a count.

The `web-next` gate was not re-run: that package did not change in this phase. It runs in Phase C,
which is where it does.

---

## 7. What Phase C needs from this

- `GET /workspaces/:workspaceId/influencers` returns the whole roster in reach order. The client
  sorts nothing and pages nothing — `useCursorPages`, `LoadMore`, `PAGE_LIMIT` and
  `Page<Influencer>` all go, and so does the honesty note above the table, which was built in order
  to be deleted here.
- The wire is camelCase and `@brandfactory/shared` is the only place the type lives once
  `lib/api/types.ts`' copy goes.
- The seeded `brandIds` point at **real workspace brands**, so `useBrandIndex` has to become
  `useWorkspaceBrands` on this screen — and `BrandNamesCell` has to be *widened* rather than
  re-pointed, because contracts and vendors still hold Ops fixture ids.
- A creator's `engagementRate` can arrive as an integer (`2`, not `2.0`). Format it; do not test
  it for a decimal point.
