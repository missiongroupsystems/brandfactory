# Influencers, Phase A — the record

A creator becomes an aggregate. Nothing on screen changes and nothing is served: `/influencers`
still renders nineteen rows out of `fixtures/influencers.ts`, because no route exists yet to read
what this phase created.

What landed is the record itself — a wire shape in `@brandfactory/shared`, two tables in
`@brandfactory/db`, a mapper, five queries and eighteen live-database assertions. Migration
**0014**. Test count **2246 passed | 110 skipped**, up from 2211 | 92 at 1.39.0.

Phase A of [`../executing/influencers-on-real-data-plan.md`](../executing/influencers-on-real-data-plan.md).
`packages/server` and `packages/web-next` are untouched; so is `packages/web`, which serves
production and has no influencer surface.

---

## 1. The shape that landed

```
packages/shared/src/ids.ts                    + InfluencerIdSchema
packages/shared/src/slug.ts                   NEW — slugify · uniqueSlug · SlugSchema
packages/shared/src/slug.test.ts              NEW — moved from outlet/slug.test.ts
packages/shared/src/outlet/slug.ts            rewritten as two wrappers
packages/shared/src/outlet/outlet.ts          OutletSlugSchema → SlugSchema
packages/shared/src/outlet/slug.test.ts       DELETED — moved, every case kept
packages/shared/src/influencer/               NEW — influencer.ts · slug.ts · create.ts ·
                                                    update.ts · influencer.test.ts
packages/db/src/schema/influencers.ts         NEW — three pgEnums, one table
packages/db/src/schema/influencer_brands.ts   NEW — the join table
packages/db/drizzle/0014_shocking_turbo.sql   NEW — generated, not hand-numbered
packages/db/src/mappers.ts                    + rowToInfluencer
packages/db/src/mappers.test.ts               + 5 assertions, the numeric one first
packages/db/src/queries/influencers.ts        NEW — five queries, two private helpers
packages/db/src/influencers.live.test.ts      NEW — 18 assertions
```

Both barrels updated (`shared/src/index.ts`, `db/src/index.ts`, `db/src/schema/index.ts`).

---

## 2. The slug rule moved before anything used it

`shared/src/outlet/slug.ts` held `outletSlug` and `uniqueOutletSlug`, and the plan's instruction
was to generalise rather than copy. That happened first, because a second copy of the rule would
have been the one thing in this phase that could break something already shipped.

`shared/src/slug.ts` now holds `slugify(source, fallback)` and `uniqueSlug(base, taken)`. The
outlet pair are two-line wrappers over them, so **every outlet URL already written still
resolves** — the functions produce byte-identical output, and `slug.test.ts` moved with the rule
and kept every case it had, stated in outlet names, plus a `describe` block per wrapper.

Two decisions inside the move:

- **`fallback` is a parameter, not a constant.** `OUTLET_SLUG_FALLBACK` is `outlet` and
  `INFLUENCER_SLUG_FALLBACK` is `creator`. A shared constant would have put `outlet-2` in a
  creator's URL, and a caller that passed its own would have made the word a caller's decision.
  The wrappers exist so only one file per aggregate gets to say it.
- **`OutletSlugSchema` is now `SlugSchema`, re-exported under its old name.** One generator writes
  every slug in the repo, so two regexes would be two chances for a schema to reject what
  `slugify` emits. The name stays so a reader of `OutletSchema` still finds the word `Outlet` on
  every field.

---

## 3. The record, and the six things about it that are decisions

`shared/src/influencer/influencer.ts` is the shape `packages/web-next` declared in
`lib/api/types.ts` and said was safe there *only* because no server existed to refuse a field.
It is camelCase now — `engagementRate`, `brandIds`, `createdAt` — and it is where a route will
parse against.

The snake_case copy in `lib/api/types.ts` is **still there**. It is deleted in Phase C, with the
fixture that feeds it, because the screen still compiles against it.

| | |
| --- | --- |
| **`followers` is not nullable** | What makes the reach-tier grouping *total*. Every row lands in exactly one band, so the band counts always sum to the rows — the property that lets the group headers carry counts honestly. `features/influencers/tiers.ts` is written against this promise, and a nullable column would have needed an unknown bucket beside five real ones. |
| **`engagementRate` is `numeric(5,2)`** | A rate is quoted to two decimals and a float renders 3.8 as 3.7999999. It arrives from the driver as a string; see §5. |
| **`status` defaults to `prospect`** | A creator somebody has just entered is on a shortlist. Nobody has booked them yet, and defaulting to `active` would state a booking that never happened. |
| **`(workspace_id, platform, handle)` is unique** | One row per creator per platform. Two platforms means two follower counts and two engagement rates, and one row would have to pick one number to show. The same handle twice on one platform is a duplicate import. |
| **No `agency_id`, no `email`, no `phone`** | 1.39.0's decisions, unchanged. A creator is reached at their handle; the mobile number is their agent's business; an agency is a company you hold an agreement with, which is what `/vendors` and `/contracts` are for. |
| **No CHECK constraints** | No invariant here spans columns, so zod at the route boundary is the single enforcement point — the `brands.website_url` precedent, not the `brand_assets_source_exactly_one` one. |

### Three additions the plan did not specify

Each is a hole the plan's shape left open, found while writing the schema against it.

**`InfluencerHandleSchema` rejects a leading `@` rather than stripping it.** Every surface adds
the sigil, so a row carrying one would render `@@priyaskin` on screen and `-priyaskin` in the
slug. Stripping was the tempting fix and is the wrong one: it accepts two spellings of one handle,
and both pass `influencers_workspace_platform_handle_key` as different values. Rejecting means the
column holds one spelling and the unique key means what it says.

**`InfluencerBrandIdsSchema` rejects duplicate ids, and caps the array at 50.**
`influencer_brands` is keyed on `(influencer_id, brand_id)`, so a repeated id in one body takes a
unique violation *inside the write transaction* — which reaches the client as a 500 for what is
really a malformed body. Two identical `brandId`s are not a stronger statement and the
multi-select cannot produce one. The cap is what stops one body writing an unbounded number of
link rows.

**`handle` and `platform` are patchable, and the slug still does not follow.** A typo in a handle
is exactly what a patch is for, and a creator who moves an account between platforms is a real
correction. So `/influencers/priyaskin` can end up pointing at `@priyaskincare` — the same trade
every renamed outlet already makes, and the alternative is a URL that rots each time somebody
fixes a spelling.

---

## 4. Why the brand link is a join table

This is the one place the shape departs from outlets, and the reason is a rendering one rather
than a purity one.

`brandIds` is multi-valued: a creator can work for two of the group's brands, and an empty array
is a fact ("not engaged yet") rather than a gap. A `uuid[]` column cannot carry a foreign key —
delete a brand and every array holding its id keeps holding it. The influencers table resolves
those ids through a cached brand index, and its standing rule is that *a cached index that has not
arrived is a pending request, never a missing fact*, so an unresolvable id renders as `…`. A
dangling id and a request in flight would then look identical, permanently, in the one cell that
rule exists to protect.

So `influencer_brands (influencer_id, brand_id)`, **both sides `ON DELETE CASCADE`**. Deleting a
brand removes the *link* and keeps the creator, which is the many-to-many equivalent of the
`ON DELETE SET NULL` outlets chose for `brand_id` and holds for the same reason: the relationship
outlives the branding, and the creator is the record the next brand gets attached to.

Two things it deliberately does not have:

- **No `position` column**, unlike `social_post_assets`. The wire sorts `brandIds` server-side so
  two reads of one row are byte-identical, and nothing about a creator's brands has an order a
  person chose. A set of ticked boxes is a set.
- **No workspace column.** Nothing in the key stops a creator in workspace A being linked to a
  brand in workspace B, and that gate is `assertBrandsInWorkspace` in the query layer rather than
  a third column — the same division `outlets.brand_id` already has.

---

## 5. `numeric` arrives as a string, and that is the whole risk

The plan named this twice and it earned it. `engagement_rate` is `numeric(5,2)`;
`node-postgres` returns numeric as **text** because it is arbitrary precision and a float cannot
hold every value it can. So the driver hands back `'3.80'`, not `3.8`.

It type-checks clean either way — drizzle types the column as `string`, and the only thing that
would object is `InfluencerSchema`, which no route parses its own response against. The symptom on
screen is one row reading `3.80%` in a column of `3.8%`.

`rowToInfluencer` converts it, at the same boundary `rowToResearchJob` converts `cost_usd`. It is
pinned twice, on purpose:

- `mappers.test.ts` hands the mapper the string the driver really returns and asserts both
  `InfluencerSchema.safeParse(...).success` and `typeof === 'number'`. It also asserts that an
  unmeasured rate stays `null` — `Number(null)` is `0`, which would state that nobody engages with
  this creator where the truth is that nobody has measured.
- `influencers.live.test.ts` writes 3.8 through real Postgres and reads it back. This is the half a
  unit test cannot prove, because a hand-written row is whatever the test typed.

The write direction needed the same care: `numeric` takes a string going in as well, so
`createInfluencer` and `updateInfluencer` both `String(...)` the value. A live assertion covers
what that costs — 3.456 comes back as **3.46**, rounded to the column's scale rather than refused.
A measurement is an estimate, and losing a third decimal is better than losing the figure.

---

## 6. The query layer

Five exported functions in `queries/influencers.ts`, on `queries/outlets.ts`' shape, plus three
private helpers.

```
listInfluencersByWorkspace   exhaustive, followers desc · name asc · id asc
getInfluencerByRef           slug or id, workspace-scoped — the access gate
createInfluencer             one transaction: brand gate → row → link rows
updateInfluencer             partial patch; brandIds is a full replacement
deleteInfluencer             hard delete, returns the row that went
```

**The list is exhaustive, with no cursor and no server-side filters.** Outlets' call, and it pays
off harder here because this screen carries counts on its group headers: a client filtering a
*page* would render "3 in Micro" over a tier holding nine. Past roughly 150 rows the keyset cursor
on `(followers desc, name, id)` and the SQL filters land **together** — one without the other is
the "Zephyr alone on page one" failure `packages/web-next`'s AGENTS.md bans.

**Reach descending is the opposite of every other list in this schema**, which sort alphabetically
because they are read as directories. This one is read as a budget conversation: the few expensive
names at the top, the long tail below. `name` breaks the tie rather than `id`, because 10,000
followers is a common round number and ordering ties by id would reorder the table on every read.
The index is `(workspace_id, followers desc)` to match.

**The join is a second query and an in-memory map, not a `json_agg`.** The set is exhaustive and
small, and an array-shaped column would have to be unpacked differently in the list read than in
the detail read — a second mapper for one wire shape. `listSocialPostsByBrand` reads its
attachments the same way.

**`assertBrandsInWorkspace` is the array-taking sibling of `assertBrandInWorkspace`** and reuses
`BrandNotInWorkspaceError` unchanged, imported from `queries/outlets.ts`. It names the **first**
missing id rather than all of them: the error carries one id because an outlet only ever has one,
and reporting `["a","b"]` for one aggregate and `"a"` for the other would be two error shapes for
one condition. The first miss is enough to fix the body.

**The gate runs before the row lookup** on a patch, so a brand from another workspace rejects the
whole patch even when the creator itself would miss. `updateOutlet` and `updateSocialPost` order it
the same way, for the same reason: a 400 about the body is more useful than a 404 about the path
when both are true.

**`deleteInfluencer` reads the brand ids before it deletes**, inside the transaction, because after
the delete there is nothing to read them from. The route hands the row back as the last copy
anything will see, so it has to be the whole record. It is a hard delete and not a soft one, on
`deleteOutlet`'s argument: soft delete exists in this schema for recoverable creative work, and
somebody you stopped working with is `status: 'past'` — which is a thing you look up, not a thing
you hide. What is left for delete is a row entered by mistake.

---

## 7. Migration 0014

Generated with `db:generate`, not hand-numbered. Three `CREATE TYPE`, two `CREATE TABLE`, three
foreign keys, two indexes.

It was **applied against the seeded dev database**, which the plan listed as a risk worth
confirming here rather than discovering in Phase B. It applied clean. The join table's foreign
keys are strict in the direction that matters: a Phase B seed that inserts links before brands
will fail loudly, which is the correct behaviour.

---

## 8. Verification

```
pnpm typecheck                                     clean (11 packages)
pnpm lint                                          clean (whole repo)
pnpm format:check                                  clean
pnpm test                                          2246 passed | 110 skipped (186 files)
pnpm -F @brandfactory/db db:migrate                0014 applied to the seeded dev database
DATABASE_URL=… pnpm vitest run --project @brandfactory/db
                                                   149 passed — every live test, nothing skipped
```

The count moves by **35 passed** and **18 skipped**. The 18 are `influencers.live.test.ts`, which
skips without `DATABASE_URL` like every other `*.live.test.ts`; they were run against real
Postgres and all pass. The 35 are 27 in `influencer.test.ts`, 5 in `mappers.test.ts`, and 3 net in
the slug tests — `slug.test.ts` holds the 11 cases `outlet/slug.test.ts` had, plus the fallback
parameter, plus a block per wrapper.

**Nothing shipped to a user.** `pnpm -F @brandfactory/web build` and the `web-next` gate were not
re-run for this phase, because neither package changed and neither imports anything added here.
They run in Phase C, where `web-next` does.

---

## 9. What Phase B needs from this

- `createWorkspaceInfluencersRouter` parses `CreateInfluencerInputSchema` and
  `UpdateInfluencerInputSchema`, and turns `BrandNotInWorkspaceError` into a 400
  `BRAND_NOT_IN_WORKSPACE` — the same mapping `routes/outlets.ts` already has.
- The five `Db` surface entries are the five exported queries, unchanged in signature.
- The seed writes brands **before** link rows. The foreign key will say so if it does not.
- The seed's engagement rates should be two-decimal figures. A third decimal is not an error, but
  it will read back rounded and a fixture that disagrees with the database is a confusing one.
