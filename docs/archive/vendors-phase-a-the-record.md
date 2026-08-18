# Vendors Phase A — the record

**Nothing on screen changed. The aggregate exists.**

Phase A of [`./vendors-on-real-data-plan.md`](./vendors-on-real-data-plan.md).
`/vendors` still renders nine rows assembled out of `fixtures/agencies.ts` and
`fixtures/contracts.ts`, exactly as it did before this change; not one file in
`packages/web-next` was opened. What landed is the shape underneath: a wire type in
`@brandfactory/shared`, three tables, migration **0015**, a mapper and five queries.

Base: `main` at **1.41.1** — 2292 passed | 115 skipped. After this phase: **2320 passed | 140
skipped**, which is 28 new unit tests in `@brandfactory/shared` and 25 new live tests in
`@brandfactory/db` that skip without a database. All 25 were run against real Postgres — see §8.

18 files: 8 modified, 10 new (2 of them generated).

---

## 1. What a vendor is, and why nothing could be reused

BrandFactory's schema held seventeen tables and **no company record of any kind**. That was the
finding that set this phase's size, and it survives contact with the code:

- `outlets` is a place the brand trades *from*.
- `brands` is the thing the work is for.
- `influencers` is a person the brand engages.

None of the three is a counterparty, and none could be widened into one without carrying a lease
or a follower count beside a UEN. So a vendor is a new noun in this schema, and it arrives with
its own tables rather than as columns on somebody else's.

The `Vendor` type the screen reads today is `S["VendorRead"]` — an alias over
`lib/api/schema.d.ts`, generated from a FastAPI document this repository does not contain, with
`pnpm gen:api` deleted and the file frozen. **It is not ours to extend**, and `AGENTS.md` says so
by name. Those eight aliases in `lib/api/types.ts` were not touched here and are not touched in
Phase B or C either: they still type `features/vendors`, which still serves the live Contracts
screen.

---

## 2. `WebsiteUrlSchema` moved before it was copied

`shared/src/url.ts` is new and holds one export:

```ts
export const WebsiteUrlSchema = z.url({ protocol: /^https?$/ }).max(2048)
```

This is `BrandWebsiteUrlSchema`, moved. **Nothing about the rule changed in the move** — same
protocol filter, same 2048 cap, same acceptances and same refusals — and
`BrandWebsiteUrlSchema` is now a one-line re-export under its own name:

```ts
export const BrandWebsiteUrlSchema = WebsiteUrlSchema
```

Three things follow, and each is why the move is the right shape rather than a copy:

1. **No brand behaviour moves.** `brand/create.ts`, `brand/update.ts`, `BrandSchema`,
   `packages/web-next/src/lib/website-url.ts` and `packages/web/src/lib/website-url.ts` all import
   the alias and all still compile against the same object. Every brand row already in the table
   still passes its own schema.
2. **The protocol filter is not re-argued at the second call site.** The filter is the entire
   point of the schema, not decoration: zod accepts `javascript:alert(1)` as a valid URL, so a
   bare `z.url()` on a vendor's website would be a stored XSS with a nice UI around it. Extracting
   it means a vendor gets that property by construction rather than by somebody remembering.
3. **The precedent already existed.** `shared/src/slug.ts` was extracted out of `outlet/slug.ts`
   the day influencers needed it, on exactly this argument, and the aggregate wrappers stayed. The
   alias here plays the same role `outletSlug` plays there — it names the field at the call site.

`shared/src/index.ts` exports `./url` from the **Primitives** block, beside `./slug`.

---

## 3. The wire

`shared/src/vendor/` — `vendor.ts`, `create.ts`, `update.ts`, `slug.ts`, `vendor.test.ts`.

```ts
Vendor {
  id, workspaceId, slug, name,
  category: VendorCategory | null,
  status: VendorStatus,
  uen: string | null,
  website: string | null,
  brandIds: BrandId[],        // sorted server-side; [] is a fact
  contacts: VendorContact[],  // in position order; [] is a fact
  notes: string | null,
  createdAt, updatedAt
}

VendorContact { name, role, email, phone, isPrimary }
```

`VendorIdSchema` joined `shared/src/ids.ts` between the influencer's and the user's.

### The two enums

```
vendor_status    active | inactive | blacklisted
vendor_category  creative_agency | media_agency | talent_agency | pr_agency
                 | production | events | research | software | freelancer | other
```

`vendor_category` **is not `ContractCategory`**, and the vendor form's own hint is the evidence
for why. That hint has read *"The trade they mostly work. Shared with contracts."* since before
1.37.0 gave a contract a marketing vocabulary, and it has been false for four releases because no
gate can see a string.

Reading the two lists beside each other shows they cannot be one list. `ContractCategory` names
**what an agreement buys** — `retainer`, `media_buy`, `production`, `sponsorship`.
`VendorCategory` names **what the counterparty is** — an agency, a studio, a press office, a tool.
One company sells three of those and one agreement buys one, so a media agency on a retainer would
have to be filed under `retainer`, which is a fact about the paperwork rather than about the
company. Two vocabularies over one domain. The hint gets rewritten in Phase F.

It also replaces `ServiceCategory`, thirteen *building trades* — `aircon`, `pest_control`,
`grease_trap` — of which a talent agency could only ever be `other`. Four of the six agency
fixtures carry `other` for exactly that reason, and `fixtures/agencies.ts` recorded the gap in a
docstring as *"a separate decision about a screen nobody has asked to change"*. This is that
decision.

`blacklisted` is kept distinct from `inactive` because they are not the same statement: one is a
company nobody is buying from at the moment, the other is one nobody **may** buy from. Collapsing
them would lose the only field on this record that is a decision rather than a status.

Both member lists are duplicated with the pgEnums, per the zod-⇄-pgEnum convention `outlets.ts`,
`social_posts.ts` and `influencers.ts` already follow. `vendor.test.ts` is the pin — a member added
to one side and not the other fails there, because it is the only place that reads both as data.

### `category` is nullable **and** has an `other` member

Both are load-bearing, and they are different facts: `null` is *nobody has said*, `other` is
*somebody said, and none of these*.

**This is the one place vendors deliberately do the opposite of influencers.**
`InfluencerVerticalSchema` is nullable and has no `other`, because a creator with no vertical is a
genuine generalist and an `other` member would file them beside the unclassified. A company is
always *something*, so `other` there means the list is short — and `null` still means the question
was never asked. `vendor.test.ts` asserts both sides of that contrast on purpose.

### `name` is not unique; `uen` is

The asymmetry is the aggregate's central decision and it is worth stating plainly.

A **company name is not an identifier.** It carries legal suffixes, trading names and
abbreviations, so refusing *"Sunbeam Social"* because *"Sunbeam Social Pte Ltd"* already exists
would refuse a legitimate second record while catching none of the real duplicates. So no unique
key on the name; the slug takes a `-2` and the row lands.

A **UEN is** one company's identifier. So `unique (workspace_id, uen)`, and that index is this
aggregate's 409 — entering a company already in the book is a duplicate rather than a second
record. Postgres treats NULLs as distinct in a unique index, so the many unrecorded rows cost
nothing and **no partial index is needed**. That property is what §8's first live test exists to
prove.

`uen` is **not format-validated** beyond a 50-character length, on `InfluencerHandleSchema`'s
argument: UEN grammar has several national forms, a foreign agency has none at all, and refusing a
whole import over a character class loses the value entirely.

`VendorContactEmailSchema` **is** validated, and the pair of decisions sitting three lines apart
is deliberate rather than inconsistent. An email address has one grammar everywhere where a UEN has
several, and it is rendered into a `mailto:` href — which is `WebsiteUrlSchema`'s argument one
scheme over: a value that reaches an `href` is checked where it is declared rather than at each
surface that renders it. `phone` is unvalidated beyond a length, because numbers arrive with
country codes, extensions, spaces and brackets and there is no normal form worth refusing an entry
over.

### The contact is a value object

`VendorContact` carries **no id and no timestamps**. The write replaces the whole list, so a
`createdAt` would reset on every unrelated edit of the vendor and read as a lie about when somebody
joined. The array's index is the position and the vendor is the record the list hangs off.

**At most one primary, enforced in zod and not by a partial unique index.** The repo's stated rule
— no CHECK constraints, zod at the route boundary as the single enforcement point — and here it
also *removes* work rather than only moving it: a partial index would refuse whichever half of a
primary swap landed first, while a full-replacement write satisfies the rule in one request. That
is precisely what the current Ops form's `replaceContacts` docstring was built to work around.

`VendorContactsSchema` caps the list at 20 and `VendorBrandIdsSchema` at 50. Both bounds exist so
one body cannot write an unbounded number of child rows.

**This is not the Operations Hub's `ContactRead`.** That row is the address book's: standalone, with
its own id, edited from the tenancy sheet and the review queue, outliving any single vendor write.
Two records that both describe a person, in two services, and neither is the other with extra
columns. The address book is untouched by this phase and by this plan.

### Create asks for a name and nothing else

`CreateVendorInputSchema` requires **only `name`** — one field fewer than an outlet and four fewer
than an influencer. That is the shape of the record: a company you have just heard of has a name
and nothing else confirmed. The UEN is on a document nobody has opened, the category is a guess
until somebody asks what they actually sell, and the contact is the person who has not replied yet.

The contrast with influencers is the argument. A creator with no follower count would fall out of a
*total* tier grouping, which is the one thing a total grouping may not do — so four fields are
required there and the cost of looking a figure up is accepted. **Nothing on the vendors screen is
derived from a vendor's own columns**, so nothing breaks when they are empty.

`status` defaults to `active`, not to a prospect state: a vendor somebody enters is one the
business is already buying from, which is the opposite of a creator on a shortlist.

`UpdateVendorInputSchema` is a partial patch with at least one key, and has **no `slug`**. The slug
is frozen at create so a link written today survives a rename; `name` is patchable and the slug
does not follow it, which is the same trade every renamed outlet already makes. `brandIds` and
`contacts` are full replacements, because what a person means by ticking brands is *these are the
brands*.

### The slug

From the **name** — there is no handle to prefer, unlike a creator. `VENDOR_SLUG_FALLBACK` is
`'vendor'`, because the screen, the nav item and the route all say vendor and `/vendors/vendor-3`
reads as a record rather than as a category. `vendorSlug` and `uniqueVendorSlug` are two-line
wrappers over `slugify` and `uniqueSlug`; **`shared/src/slug.ts` is unchanged**.

`byVendorName` sorts `name asc, id asc`. Alphabetical and not by anything derived, because this
screen is read as a **directory** — you arrive knowing the company's name and looking for its row.
That is the opposite of `byInfluencerReach`, which leads with the largest number because that list
is read as a budget conversation. `id` breaks a tie because two companies may legitimately carry
one name.

---

## 4. The tables

`db/src/schema/vendors.ts`, `vendor_brands.ts`, `vendor_contacts.ts`, all three exported from
`schema/index.ts`. Migration **0015** (`0015_slow_hellfire_club.sql`) was generated, not
hand-written, and applied to the dev database before the live tests ran.

```
vendors            11 columns, 2 unique constraints, 1 index, 1 fk
vendor_brands       2 columns, composite pk, 1 index, 2 fks
vendor_contacts     7 columns, composite pk, 1 fk
```

- `vendors_workspace_slug_key` is what makes `/vendors/northlight-talent` resolve to exactly one
  row, and what `uniqueVendorSlug` picks a free value against.
- `vendors_workspace_uen_key` is the 409.
- `vendors_workspace_name_idx` is the read path and the table's own order — **ascending**, and
  pointedly not the `desc` that `influencers_workspace_followers_idx` carries.

`vendor_brands` is `influencer_brands`' shape exactly, including the argument for it. An array
cannot carry a foreign key: delete a brand and every `uuid[]` holding its id keeps holding it. The
vendors table resolves those ids against a cached brand index whose rule is that *a cached index
that has not arrived is a pending request, never a missing fact* — so an unresolvable id renders as
`…`, and a dangling id and a request in flight would look identical, permanently, in the one cell
that rule exists to protect.

Both sides cascade. Deleting a brand removes the **link** and keeps the vendor: the relationship
outlives the branding, and the vendor is the record the next brand gets attached to.

The join table also changes what the Brands column *means*. It used to be
`fixtures/contracts.ts`' `brand_ids_covered` — which brands the company happens to hold live
agreements for. This table answers a different question, *which brands the company works on*, and
it is the one a person can actually enter.

`vendor_contacts` is keyed on `(vendor_id, position)`, dense from 0, and carries no CHECK
constraint on `is_primary` for the reason in §3. `brand_assets.position` and
`canvas_blocks.position` are the precedent for an ordered child row.

---

## 5. `assertBrandsInWorkspace` moved rather than being copied

The plan called this out and it is the one structural edit to an existing aggregate.

`assertBrandsInWorkspace` was a private helper in `queries/influencers.ts`. `vendor_brands` needs
the identical gate, so the helper moved to **`db/src/queries/brand-scope.ts`** and both aggregates
import it. **Nothing about it changed in the move** — same query, same error, same name-the-first-
miss behaviour — and moving it is what stopped a second copy existing, which is the thing that
would drift.

`BrandNotInWorkspaceError` **stays in `queries/outlets.ts`**, unmoved. It is imported from the
package root (`@brandfactory/db`) by `routes/outlets.ts` and `routes/influencers.ts`, and by two
live tests from the file path; moving it would have been churn in four files for no gain.
`brand-scope.ts` imports it from `./outlets`, which is not a cycle: outlets does not import
brand-scope.

`db/src/index.ts` exports `./queries/brand-scope` and `./queries/vendors`.

The gate is not the foreign key's job, and that is worth restating because the foreign key looks
like it covers this. Nothing in `vendor_brands`' key stops a vendor in workspace A being linked to
a brand in workspace B, and the screen resolves those ids against *its own* workspace's brands — so
the row would render an unresolvable id with no explanation.

---

## 6. The mappers

`rowToVendorContact(row)` drops `position` and `vendorId` on purpose: the array's index *is* the
position, and sending either would let a client believe it can address a contact on its own, which
the full-replacement write is specifically built not to offer.

`rowToVendor(row, brandIds, contacts)` takes both relations as **parameters rather than reading
them**, which is what lets one mapper serve the list (batched joins, two in-memory maps) and the
detail read (two single-row queries) without a second wire shape existing. `rowToInfluencer`'s call,
one relation further. Neither array is re-sorted here, because a mapper that re-derived the order
would be a second place the ordering is decided.

---

## 7. The queries

`db/src/queries/vendors.ts` — `listVendorsByWorkspace`, `getVendorByRef`, `createVendor`,
`updateVendor`, `deleteVendor`, plus `VendorUenTakenError` and `isUenUniqueViolation`.

**The list is three queries and two in-memory maps, not a `json_agg`.** The influencers argument,
one relation further: the set is exhaustive and small, array-shaped columns would have to be
unpacked differently here than on the detail read (a second mapper for one wire shape), and a
`json_agg` over *two* relations would multiply the row count before it collapsed it.

**The list is exhaustive — no cursor, no server-side filters.** It replaces a `useSWRInfinite` page
loop that was paginating nine fixture rows and sending `q` and `status` to a server that did not
exist. The tripwire moves with the screen: past roughly 150 rows, a keyset cursor on `(name, id)`
and the SQL filters land **together**, because a paginated list with client-side filters is the
failure `AGENTS.md` bans by name.

`VendorUenTakenError` is narrowed on the **constraint name**, not on `23505` alone. Any other
unique violation reaching that line is a bug, and answering it with a friendly message about a
duplicate UEN would hide it. `vendors_workspace_slug_key` is deliberately **not** matched: that one
is the create race — two concurrent creates of one name both settling on the same free slug — which
is a different fact (nothing is taken, two writers collided, a retry succeeds) and it keeps its
500.

### The one deviation from the plan, stated

The plan said `updateVendor` should read the row **before** it writes when the patch touches `uen`,
so the error can name the value. **It does not, and the read would have been dead code.**

`updateInfluencer` needs its pre-read because that unique key is a *pair*: a patch may move the
handle and leave the platform, and a failed transaction cannot be read from afterwards to find out
what the other half was. This key is **one column**, so the value that collided is `patch.uen` and
it is already in hand at the `catch`. A pre-read here would issue a query whose result nothing
could use.

The plan's intent — *the error names the value the person typed* — is met, and the live test
`names the UEN it refused` asserts it. The docstring on `updateVendor` records the difference so
the next reader does not take it for an oversight against the influencers precedent.

---

## 8. Verification

```
pnpm typecheck                             clean (11 packages)
pnpm lint                                  clean (whole repo)
pnpm format:check                          clean
pnpm test                                  2320 passed | 140 skipped (191 files)
pnpm test  (with DATABASE_URL)             2460 passed | 0 skipped
pnpm -F @brandfactory/web build            clean
pnpm -F @brandfactory/web-next lint        clean
pnpm -F @brandfactory/web-next build       clean — static/dynamic split unchanged
```

2292 → 2320 is 28 new unit tests in `shared/src/vendor/vendor.test.ts`. 115 → 140 skipped is the 25
new live tests, and **all 25 were run against real Postgres** with migration 0015 applied. The
plan's stated risk was that `unique (workspace_id, uen)` on mostly-NULL data is untestable through
the screen and that the live test is the only proof, so it was written before the queries were
finished rather than after.

The five properties only real Postgres can settle, each with a test:

| Property | Test |
| --- | --- |
| NULLs are distinct in the unique index | `lets many rows carry no UEN at all` — three rows, no UEN, one workspace |
| The 409 narrows on the constraint *name* | `refuses the same UEN twice in one workspace, by name` — fails if the index is renamed |
| The key is scoped to the workspace | `lets the same UEN exist in another workspace` |
| `ON DELETE CASCADE` on the link | `keeps the vendor when its brand is deleted, and drops the link` |
| `ON DELETE CASCADE` on the contacts | `deletes once…` asserts no orphan rows remain in `vendor_contacts` |

Two more worth naming because they pin decisions rather than mechanics:
`suffixes a slug that is already taken, because a name is not unique` asserts all three outcomes
(`sunbeam-social`, `sunbeam-social-2`, `sunbeam-social-pte-ltd`), and `renumbers position densely`
reads `vendor_contacts` directly to prove a removed contact leaves no gap.

**`packages/web` was not opened**, which the plan named as a risk: a change there would be a sign
`@brandfactory/shared` had grown something the Vite app now compiles. It has not.
`packages/web-next` was not opened either — this phase ships nothing visible, exactly as stated.

---

## 9. What Phase B inherits

The routes, the seed, and one trap the plan names twice: **`createFakeDb` has to learn the UEN
rule.** Every other behaviour in `server/src/test-helpers.ts` mirrors a query, but this one is an
*index* — there is nothing to mirror, so the rule has to be restated as `assertFakeUenFree` beside
`assertFakeHandleFree`. Without it the 409 route tests pass against the very 500 the mechanism
exists to remove. That is 1.40.1 §4 verbatim, and it is the one trap in the next phase.
