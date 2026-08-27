# Four asks from marketing, and the order they land in

**Status:** proposed. Nothing built.
**Surface:** `packages/web-next` — four new brand-scoped areas, and the brand nav that has to hold them.
**Migrations:** five at minimum. **Wire:** four new route groups. **New dependency:** none.

Not four: Plan 3 ships its two schema changes as two releases, per the seam argued there, and Plan 4
carries three tables of its own. Anything that says "one migration per plan" is counting the plans,
not the phases.

The long form of `docs/plans/feedback.md`, which has held these four lines since the Next shell
arrived:

```
2. Resources (like Font websites)
3. Photography - split by interior, food etc. + top ones at the top (pinned)
4. Marketing Funnel: a bit like sales funnel based around user journey. Each block links to platforms/
6. Decks (PDFs / Canva links) for brands - linked to brand profiles
```

Two of the four already have doors. `/tools/funnel` and `/tools/photography` are `PlaceholderPage`
renders carrying the `Empty` tag, and their titles were taken from that file rather than invented,
for the reason `nav.ts` states: *a placeholder named after nothing teaches the reader that the group
is filler.* The other two have no route at all.

## Which app, and the question that did not need asking

`web-next`. All four.

This looked like a decision and is not one. `scripts/dev.sh` settled it before any of this was
written: *"Next boots on :3000 and **is the frontend to work in**… :5173 is the previous Vite app…
stays until its features have moved to :3000."* The four features are marketing's, marketing reads
:3000, and building any of them at :5173 would be building into the app that is leaving.

It costs one thing and it is worth naming before Plan 3 assumes otherwise. **Ask 3 is not an edit to
a screen you have.** The photography shelf exists — `brand_assets.library = 'photography'`, ordered
by `position`, with server routes — but the UI that renders it, drag order included, is
`packages/web/src/components/brand/AssetLibraryPage.tsx`, in the outgoing app. `web-next` has the
empty door and nothing else. So the categories and the pin are additive to a live table; the grid
and the manual order are a rebuild.

## The order

Resources, Decks, Photography, Funnel. Three rules produced it, applied in this order.

1. **A feature that touches no existing table goes before one that does.** Resources and Decks are
   new tables standing alone. Photography adds two columns and a foreign key to `brand_assets`,
   which is one wide table serving three shelves — the blast radius is every asset surface in both
   apps.
2. **Break new ground where a mistake is cheap.** `web-next` has no blob path at all. `bf-client.ts`
   is the only real client in the package and no feature there reads or writes a blob; the one
   mention of the word is a comment in `outlet-detail.tsx` explaining why the monogram is *not* an
   asset. Decks needs upload. It gets to invent that path on a table with no rows in it, and
   Photography inherits it working.
3. **A feature that depends on records the app does not hold goes last.** That is the Funnel, and
   §4 is the accounting.

This reverses an earlier suggestion that put Decks first. Rule 2 is why: Resources needs no blob, so
it is the smaller of the two, and the smaller one should be the one that proves the pattern.

## Phase 0 — the brand nav has to hold six rows

`BRAND_NAV_ITEMS` holds two rows: *Brand profile* at the brand's own page, and *Outlets*. These four
asks add up to four more. `nav.ts` already wrote the rule that sends them there, about the two Tools
rows specifically:

> They are *workspace* tools by placement: a funnel is the journey into the business and the
> photography library is shared across brands. If either turns out to be brand-scoped, it moves to
> `BRAND_NAV_ITEMS`, which is the whole reason that list exists.

All four turn out to be brand-scoped, and the requirements say so in as many words: *"Each brand
keeps its own Resources list"*, *"The category set must be editable, because subjects differ per
brand"*, *"maps **a brand's** user journey"*, *"belongs to one brand"*. So `/tools/funnel` and
`/tools/photography` leave the workspace nav, the `Tools` group in `NAV_GROUPS` empties and goes,
and the routes move under `/brands/:id/`.

### Phase 0 does not move the rows

The obvious reading — do the whole nav restructure first, since three plans need it — is wrong, and
the type is what says so. **`BrandNavItem` has no `tag` field.** `NavItem` carries one, with a
docstring explaining that `Empty` exists so *"the item does not read as done"*; the brand list has
never needed the equivalent because both its rows are real. So a Tools row cannot *move* to the
brand nav. It is deleted from one list and created in the other, and the honesty marker does not
survive the trip.

Move them in Phase 0 and the two doors that currently admit they are empty become two brand rows
that do not — which is the exact failure `nav.ts` opens by naming: *"a nav item that looks identical
to a working one is how someone files a bug against a feature that was never built."*

**So each plan moves its own row, in its own screen phase, when there is a screen.** What is left
for Phase 0 is the grouping, and only that.

### The grouping, and the reason it is newly needed

`brand-nav.tsx` states why the brand list is one unlabelled group today:

> an eyebrow over two rows in a column whose header already names the brand would be a section
> heading for the only section there is.

That reason is about **two rows** and it expires at six. Phase 0 gives `BrandNavItems` the grouping
layer `NAV_GROUPS` already gives the workspace side: the profile ungrouped at the top, the way
`/dashboard` is, and labelled groups beneath. It does **not** reorder anything, per the constraint
`NAV_GROUPS` states about itself — grouping is presentation over the same list order.

Phase 0 therefore lands with the brand nav still holding two rows, and each group fills as its plan
ships. That is a smaller Phase 0 than it first looked and it is the only version that does not ship
a lie.

### One name collides, and it is ours

`NAV_GROUPS` already has a group labelled **`Resources`**, holding `/review` and
`/marketing-requests`. Plan 1 adds a brand row also called *Resources*. Both render in the same
sidebar component, one as a section eyebrow over two workspace queues and one as a brand row
pointing at a list of links — and neither is wrong about its own name in isolation.

**Rename the group, not the feature.** *Resources* is marketing's word for the thing they asked for
and it is the word on the row they will look for. The group's two members are `Records the migration
could not confirm` and `What the business is asking marketing for — one inbox, one request form`:
both are queues, neither is a resource, and the label was only ever a place to put the leftovers.
`Queues` is what they are. One string in `NAV_GROUPS`, and it is keyed by `href`, so nothing else
moves.

---

## Plan 1 — Resources

The smallest complete slice, and the one the other three copy: shared schema → migration → query
helpers → a route group behind `requireBrandAccess` → a feature folder that reads the real server.

### The decision this plan turns on

**A Resource is not a `brand_assets` row, and the near miss is worth writing down** because the next
reader will find it too. That table already models a link on somebody else's host: `source='link'`,
a `url`, a `label`, a `position`, brand scope, soft delete, and `AssetLinkUrlSchema` restricting the
value to `http`/`https` and 2048 characters so a `javascript:` URL never reaches an `href`. A fourth
value on `assetLibrary` would appear to cost one migration.

It does not fit, and `assetKind` is where it fails. The three values are `color | image | file`, and
a website is none of them. `library.ts` names what the shelves hold — *what a brand settles*, *what
a brand accumulates*, *printable things and files* — and a shop you buy fonts from is not a thing
the brand holds at all. The requirement says so directly: *"the app does not store the file."*

So: a new table. `AssetLinkUrlSchema` is still the URL rule, imported rather than restated.

**One overlap to state in the UI, not just here.** `assetRole='typeface'` is the font *file* on the
identity shelf, added by migration 0011 for the `@font-face` injection it will one day resolve. The
site the team buys that font from is a different row in a different place. Unstated, the team will
file one as the other, and the font ask is the first example in the requirement.

### Phases

- **A — the table.** `brand_resources`: `brand_id` FK cascade, `title`, `url`, `note` nullable,
  `type`, timestamps. One index on `(brand_id, type)` — the read path is the whole list, grouped.

  **No `deleted_at`, and no `position`.** Both were in the first draft of this plan by reflex, and
  the codebase argues against each.

  Soft delete is `brand_assets`' and `canvas_blocks`' rule, and it has a reason those two share:
  `docs/vision.md:51`, *discarded ideas aren't gone, just hidden*. A link to a font shop is not a
  discarded idea. The three aggregates built most recently — `influencers`, `vendors`, `outlets` —
  carry no `deleted_at` at all, and they are the closer precedent in both age and kind.

  `position` is the `vendor_brands` rule: that table refused one and said why — *"a set of ticked
  boxes is a set."* The requirement asks for **grouping** by type, never for ordering within a
  group. Sort by title inside each type. Adding a nullable int and a reorder route later is cheap;
  a drag handle nobody asked for is not.
- **B — the routes.** `createBrandResourcesRouter` mounted at `/brands`, paths `/:id/resources` and
  `/:id/resources/:resourceId`, exactly the shape `routes/assets.ts` uses. List, create, patch,
  delete. No reorder route — see Phase A.
- **C — the screen.** `/brands/:id/resources`, grouped by type, each row a link that opens in a new
  tab. Empty state, and the brand nav row this plan adds.
- **D — the form and the delete.**

### Open decision 1 — is the type set editable?

**Proposed: a fixed `pgEnum` — `font, image, icon, tool, reference, other`.**

The requirement says the Photography category set *"must be editable, because subjects differ per
brand"* and says nothing of the sort about Resources. Read that contrast as deliberate: a resource
type is a shape of link, and the shapes of link are the same for every brand, while the subjects a
brand photographs are not. `key-dates` is the precedent CLAUDE.md already sets — *not every fact
needs a table*.

**The cost, stated so the reversal is a decision and not a surprise**, and it is worse than "one
migration" in two distinct ways.

*Adding a value* to a live enum is the hazard migration 0011 exists to document. The migrator runs
the whole pending batch in one transaction, and Postgres permits `ALTER TYPE … ADD VALUE` there but
forbids *using* the new value in that same transaction. So a seventh resource type is its own
migration file that does nothing else, and no `UPDATE` anywhere in that batch may mention it. 0011
is the worked example and should be copied rather than rediscovered.

*Replacing the enum* with a brand-scoped table is a migration with a backfill, not a column add.

If marketing wants to type their own type names, say so before Phase A and Plan 1 gains the two
phases Plan 3 has. That is a much cheaper answer than either reversal.

---

## Plan 2 — Decks

### The decision this plan turns on

**The Canva rule proves Decks cannot reuse `brand_assets`, and it is a proof rather than a
preference.** The requirement: *"the team attaches the PDF export of that moment beside the live
link, so the link opens the current design and the PDF preserves what the team saw."* One version
holds a `url` **and** a `blob_key`. That table carries a CHECK named
`brand_assets_source_exactly_one` whose entire purpose is to forbid exactly that row, and whose
docstring says there is a test that inserts a violating row and expects it to fire.

So Decks is two tables of its own, and the constraint is the argument.

**Which leaves decks owing an invariant of their own, and the requirement contradicts itself about
what it is.** *"Each version is one source — a PDF file or a Canva link"* is an exactly-one rule.
*"A Canva version snapshots on add: the team attaches the PDF export of that moment beside the live
link"* puts two artefacts on one row. Both sentences are right, and the resolution is that **the
snapshot is not a second source.** The source is where the design lives and stays editable; the PDF
beside a Canva link is a frozen copy of it. So `deck_versions` carries a `source` discriminator with
two values, and a CHECK with two arms rather than three:

```
source = 'pdf'    → pdf_blob_key NOT NULL, canva_url NULL
source = 'canva'  → canva_url NOT NULL, pdf_blob_key <per decision 3>
```

Written this way the discriminator answers the question the UI actually asks — *does this version
open in Canva or download* — and the PDF column means "the bytes" on one arm and "the snapshot" on
the other without either being ambiguous. Decision 3 fills the second arm's blank: `NOT NULL` if the
snapshot is required, nullable if it is encouraged. **That is the whole of decision 3's cost**, and
it is a CHECK rather than a phase, which is a good reason to settle it before Phase A rather than
after.

### Phases

- **A — two tables.** `decks` (`brand_id` cascade, `name`) and `deck_versions` (`deck_id` cascade,
  `source`, `label`, `version_date`, `author`, `pdf_blob_key`, `canva_url`), with the two-arm CHECK
  argued above.

  **`author` is text, not a FK to `users`**, and the first draft of this plan had it the other way
  round with an `ON DELETE SET NULL` borrowed from `outlets.brand_id`. That was solving the wrong
  problem. A FK answers *which signed-in account uploaded this file*; the requirement lists the
  author beside a label and a date as something the team enters about the version, and the author of
  a brand deck is very often an agency that will never hold a row in `users`. A FK would force every
  such version to record `null` for the one field the history column is read for.

  The reversal cost is worth knowing, because it is not symmetric: text → FK is a migration plus a
  matching exercise no rule can perform, so if the team wants deck authorship to *link* somewhere,
  say so before Phase A rather than after.

  **No `position` on `decks`**, for the reason `vendor_brands` gives for refusing one: nothing in
  the requirement orders decks against each other. Order by name.

  **No `is_current` column.** The newest version is derived, and the codebase already argues this
  case under `AssetRoleSchema`: no role is unique, so no singular accessor may exist, and a caller
  that wants one takes the head of the list *at the call site, where the arbitrariness is visible*.
  A stored current flag is a second writer disagreeing with the rows.

  **Newest by what, and what breaks the tie.** The draft said "derive the newest" and stopped, which
  is not a rule — it is the name of one. There are two candidate keys and they disagree in the case
  that actually happens: `version_date` is what the team typed, so a deck exported last Tuesday and
  uploaded today carries Tuesday; `created_at` is when the row arrived. A team catching up on three
  old versions in one sitting enters three past dates in whatever order the files are to hand, and
  ordering by `version_date` alone then makes the *last thing they uploaded* not current.

  **Order by `version_date DESC`, then `created_at DESC`.** The typed date leads because it is the
  one the reader recognises in the history column, and `created_at` breaks the tie because it is
  monotonic, server-set and cannot collide. Both columns exist for this reason and neither is
  redundant. The rule belongs in one query helper in `packages/db`, not in each route and certainly
  not in the client.

- **B — the sweep gains an arm, in three places.** The single largest hazard in all four plans, and
  it is hoisted out of Phase A because burying it under a table definition is how it gets missed.
  `deck_versions` is the first blob-holding table added since the sweep was designed, and the sweep
  is a hand-maintained list of arms rather than anything derived from the schema.

  `listBlobKeysByBrand` calls itself *"the only place brand bytes are swept"*, and names its second
  arm's purpose in a sentence this plan is about to falsify:

  > **brand assets**, filtered to `source = 'blob'`. Without this arm every uploaded logo, photo and
  > **deck** leaks its bytes on brand delete, silently and permanently.

  It says *deck* because a deck PDF today would be a `brand_assets` file row. Plan 2 moves decks out
  of that table, so that arm stops covering them. Three helpers need the new one:

  - `listBlobKeysByBrand` — miss it and every deck PDF orphans on brand delete.
  - `listBlobKeysByWorkspace` — the same query one join up, and its docstring pins itself to *"the
    same two arms as `listBlobKeysByBrand`"*, so the two drift as a pair or not at all.
  - `listStillReferencedBlobKeys` — the protective half. The sweep collects keys, deletes, then
    subtracts what a surviving row still names. A table absent from this list is a table whose rows
    cannot protect their own bytes.

  All three take a `packages/db` live test. That is not diligence for its own sake: a missing arm
  fails silently, in object storage, on a delete nobody watches.

- **C — the routes**, including that derivation, so the client is never the thing that decides which
  version is current.

- **D — the blob path in `web-next`.** The new ground, and the reason this plan is second rather
  than first. **It is three things, not one:** upload, signed read, and download.

  *Read* has a working reference in `packages/web/src/api/queries/blobs.ts` — URLs minted at
  `/blob-urls/:key/read-url`, refreshed at four minutes against a five-minute TTL, on a raw `fetch`
  because Hono's typed client will not round-trip the multi-segment `:key{.+}` param. Those
  constraints are load-bearing and should be carried across rather than rediscovered.

  *Download* is the leg the draft omitted, and a deck exists to be handed to somebody, so every row
  in Phase E's history needs a way out. `packages/web/src/lib/download.ts` is the repo's only
  implementation — in the outgoing app, written against `BrandAsset` and `SocialPost` — and it
  carries a rule worth porting with it: *"One definition of what is downloadable, two readers…
  two definitions would produce a button that fails on click."*

- **E — the deck list and the version history.** Newest version current and shown; older versions
  behind a history control. A new version supersedes the last, and no version is ever deleted to
  make room for one.

- **F — the Canva snapshot.** The `'canva'` arm end to end: the PDF export uploaded beside the live
  link, in one create the server orders so a half-failure leaves no row pointing at bytes that are
  not there. **The size of this phase is decision 3**, and only that — a `NOT NULL` second arm makes
  it a two-part write with an ordering rule and an orphan sweep; a nullable one makes it a prompt in
  the UI over the same create.

### Open decision 2 — where do Decks live?

**Proposed: a band on the brand profile, plus its own nav row.** The requirement says *"on the brand
profile"*, and the profile already has the band vocabulary for it — `visual-identity-band.tsx`,
`tldr-band.tsx`, `pillars-band.tsx`, each rendering nothing when the brand has nothing, so a brand
that has not started does not get a heading over an empty rectangle. A Decks band follows that rule
exactly. Managing versions needs more room than a band, which is what the nav row is for.

### Open decision 3 — is the PDF required on a Canva version?

*"A Canva version snapshots on add"* reads as required, and the plan is written that way — because
that is what the sentence says, and because a snapshot nobody took is a snapshot that is not there
on the day it is wanted.

It is cheap to state and not cheap to change, because it lands in two places at once: the second arm
of the CHECK above, and the size of Phase F. Required makes the create a two-part write with an
ordering rule and an orphan sweep. Encouraged makes it a prompt over a single insert. **Settle it
before Phase A**, since a CHECK arm is not a thing to loosen after rows exist.

---

## Plan 3 — Photography

Two independent asks that the requirement states as one, and they should ship as two. *"The pin is a
separate mark on the photo, not the manual drag order the library already supports"* — that sentence
is also the seam.

### Phases

- **A — the pin, alone.** `is_pinned` boolean not null default false, plus `pinned_at`, the pair
  `canvas_blocks` already carries.

  **The sort is a new comparator, and it must not be a change to `byPosition`.** This is the one
  place in Plan 3 where the obvious edit is a defect. `byPosition` has three callers —
  `assetsOfKind`, `assetsOfLibrary` and `logoAsset` — so teaching it about the pin would reorder
  every shelf, and `logoAsset` is the one that matters: its docstring fixes the resolution rule as
  *"First by `position` among active, which is the resolution rule for every non-unique role."* A
  pin-aware `byPosition` silently rewrites which image is the brand's logo, on a brand where
  somebody pinned a photograph. Photography gets its own comparator; `byPosition` is not touched.

  **This phase adds no index**, and the first draft of this plan claimed it did. There is no
  per-shelf query to serve: `listAssetsByBrand` selects every non-deleted row of a brand ordered by
  `(kind, position)` and the client sections it, which the table's own docstring says is why the
  library index exists for counts rather than for reads. The pin sorts a list already in memory. If
  a server-side per-shelf read ever arrives, the index it wants is
  `(brand_id, library, is_pinned DESC, position)` — one composite serving the whole sort — and not
  the partial `WHERE is_pinned = true` shape, which finds pinned rows rather than ordering them.

  **It is not a two-column migration, and the count is 14.** `isPinned` is always present on a row,
  so it is required on the shared `BrandAsset` union — and `pnpm typecheck` covers all packages, so
  every object literal typed as one has to gain the field. Fourteen files construct them today, and
  most are tests in `packages/web`, the app that is leaving. That work is real, it is unavoidable
  while both apps compile against one `shared`, and it is the reason this phase is bigger than its
  migration.

  It ships alone because it is useful alone, and because it touches a shared table, and a
  shared-table change wants its own release to be wrong in.

- **B — the categories.** A brand-scoped `photo_categories` table (`brand_id`, `name`, `position`)
  and a **nullable** FK on `brand_assets`. A `pgEnum` is not available here: the set is editable per
  brand, and an enum turns every edit into a migration — see the note at the top of
  `brand_assets.ts` about what `ALTER TYPE … ADD VALUE` costs inside a transaction the migrator runs
  as one batch.

  **The column is unconstrained against `library`, and that is a decision.** Nothing in the FK stops
  a photography category attaching to a logo on the identity shelf. `brand_assets` does reach for a
  CHECK when an invariant spans columns — `brand_assets_source_exactly_one` is one — and it also
  says when not to: `brands.website_url` has none, because the rule has *"one enforcement point and
  no second writer."* This is the second case, not the first. Only the photography screen writes a
  category, and a stray one is invisible rather than corrupting — an identity asset with a category
  renders exactly as it does today. **Proposed: no CHECK, and this paragraph as the record that it
  was considered.** Revisit if a second writer ever appears.

  **Nullable is not laziness.** Every photo in the table today has no category, and there is no rule
  that could assign one — `defaultLibraryFor` could derive a shelf from `kind` and `role` because
  purpose was recoverable from the bytes, and nothing recovers *interior* from a PNG. A backfill
  here would be a guess written into a column, which is the failure `library.ts` documents in its
  own opening paragraph.

- **C — the category management UI.** The set is editable, so something has to edit it.

  **The filter and the sort both assume the whole library is in memory, and today it is.**
  `listAssetsByBrand` returns every non-deleted asset of a brand in one response — no cursor, no
  limit — so a client-side category filter and a pin-first sort are correct. They are correct *by
  accident of that read*, and this plan is the reason it now matters: sub-categories exist because
  the library is expected to grow.

  `web-next` already learned this failure mode and wrote it down. `list-every.ts` exists because
  three index hooks built a map from a paginated list, and *"a row stranded on page two is silently
  absent from it — an absence a reader takes as fact rather than as truncation."* A category filter
  over a truncated library says **no interior photos** to a brand that has forty. So: if
  `listAssetsByBrand` ever gains a cursor, the filter and the sort move server-side in the same
  change, and this paragraph is the link between the two facts.

- **D — the screen.** Grid, filter by category, pinned first, then manual order, plus upload on the
  path Plan 2 opened.

### The cost worth admitting

`brand_assets` is one wide table on four orthogonal axes, and every column added for one shelf is
null on the other two. Category is a fifth axis meaningful on exactly one shelf. That is a real
argument for splitting photography into its own table, and the counter-argument is the one the
table's own docstring makes: *nullable per-variant columns beat table-per-variant when the read path
wants all of them at once*, and `listAssetsByBrand` returns the whole brand and lets the client
section it. **The split is the larger change and it is not this quarter's.** Phase B takes the
nullable column and this paragraph is the marker for whoever revisits it.

### Open decision 4

Is a category **required** on a new photo? And when a category is deleted, are its photos blocked
from deletion, or set to none? Proposed: not required on create, and `ON DELETE SET NULL` on the
category — which the column already has to tolerate, since it is nullable by construction for every
photo that predates Phase B.

(An earlier draft justified this by pointing at Plan 2's author column. That reference is dead:
`deck_versions.author` became text and has no delete behaviour to be consistent with.)

---

## Plan 4 — Funnel

The largest of the four, and the only one blocked on something other than effort.

### Three link targets, one of which exists

*"An activity may link to a record the app already holds — a social-calendar push, an influencer
program, or a contract."* The accounting:

| Target | State |
|---|---|
| Social-calendar push | **Real.** `social_posts` is a table with routes, brand-scoped. But **no `web-next` screen renders it** — the calendar is at :5173. A link would leave this app. |
| Influencer program | **Does not exist.** There are `influencers` and `influencer_brands`. There is no program record, and nothing in the schema is one under another name. |
| Contract | **A fixture.** `packages/web-next/src/fixtures/contracts.ts`, 647 lines, no table, no route. Its own docstring: *"there is no server."* The nav row carries the `Sample` tag for this reason. |

One of three is real and unreachable from this app. One is a noun with no referent. One is 647 lines
of TypeScript that a reload of any real thing would not survive.

**So the link is cut from v1**, and the requirement already permits it: *"otherwise it is plain
text."* It returns when contracts becomes an aggregate — which is a stated intention, not a
hypothetical: `nav.ts` says *"Drop the tag when the contracts conversion lands."* Phase E is written
and deferred rather than omitted, so the shape it will take is on record.

### `platform` is overloaded, and the enum is a trap

`social_platform` is an eight-member `pgEnum` — instagram, facebook, tiktok, linkedin, x, youtube,
pinterest, other — and it is a **social** list. A funnel stage names Google Ads, email, SEO, a
review site, the shop window. Reusing it files three quarters of a brand's funnel under `other`.

**No enum, then, and no free text either.** Phase B settles it with a brand-scoped `platforms` table
for the reason argued there, and that choice answers this section too: a row can be named *the shop
window* without a migration, and it is named that *once*.

`status` is the opposite case and should be an enum. *"Planned, Running, Paused, Done"* is small,
closed, stated by the requirement and explicitly bounded away from performance: *"not performance;
the deep platforms measure that."* `social_post_status` is the precedent.

### Phases

- **A — stages.** `funnel_stages`: `brand_id` cascade, `name`, `position`. Ordered and editable —
  `position` earns its column here, unlike in Plans 1 and 2, because the requirement's whole subject
  is *"ordered stages"* and a journey read out of order is not a journey. Written at brand create
  from the constant, and offered from the empty state for a brand that has none; see decision 5.
- **B — platforms, and the join to stages.** The draft called this phase *platforms per stage*,
  which is the shape it then argues against. **The shape was a question this plan had not asked.** Instagram serves Awareness and it serves Loyalty. If a platform is a row belonging to one
  stage, Instagram is typed twice, its link is typed twice, and a corrected URL is corrected in one
  of the two places. That is the failure `vendor_brands` and `influencer_brands` were both built to
  avoid, and both left a docstring explaining why an array or a duplicate would not do.

  So: a brand-scoped `platforms` table (name, url) and a join to stages — the third many-to-many in
  this schema, and it earns it for the same reason as the first two. This is also what settles the
  enum question raised above, by construction rather than by choosing between an enum and free
  text.

  The cost is that Phase B stops being a list of text fields on a stage and becomes a picker over a
  brand's platforms plus a way to add one. That is a real increase, and it is smaller than
  discovering the duplication after the team has entered six stages.
- **C — activities**: a stage, a **`platform_id`** into Phase B's table, a `status` enum, two dates
  and free text.

  `platform_id` and not a platform name, now that B makes platforms rows — an activity naming a
  platform by string would reintroduce, one level down, exactly the duplication B exists to remove.

  **Two dates, and the requirement says only "dates".** A start and an end, both nullable: a Planned
  activity often has neither, a Running one has a start and no end, and a Done one has both. One
  date could not express the middle case, which is the state most activities are in when anybody
  looks.
- **D — the screen.** One view of what a brand runs and where in the journey.
- **E — deferred.** The link to a held record.

### Open decision 5 — the six defaults

*"Awareness, Interest, Consideration, Conversion, Loyalty, and Advocacy by default, editable per
brand."* Editable per brand means rows, not a constant — a constant cannot be renamed. So something
writes six rows, and the question is when.

Three candidates, and the middle one is a trap.

- **At brand create.** Clean, and it does nothing for **any brand that already exists** — which is
  every brand in the product today, including the seven the 1.44.0 seed writes and the ones in
  production. A default that arrives only for brands created after the migration is a default most
  readers will never see.
- **A backfill in the migration.** The obvious fix for that, and it should be refused. Migration
  0010's `CASE` is not the precedent it looks like: that backfill *derived* a value already implied
  by `kind` and `role`, and its docstring still calls the duplication of `defaultLibraryFor` in SQL
  *"a real hazard"* closed only by a live-Postgres test comparing the two. Six stage names inserted
  from SQL derive nothing. They are product copy, written a second time, in the one language that
  cannot import the constant.
- **Lazily on first read.** Makes a `GET` a write, with two tabs racing it.

**Proposed: a constant in `shared` holding the six, written at brand create, and an empty state on
the screen offering to write them for a brand that has none.** The empty state is the backfill, and
it is a better one: the six defaults are a suggestion the requirement calls editable, so a brand
that wants five stages should not have to delete a row the database gave it unasked. This is the
shape `suggested-categories.ts` already uses — curated starters that guide the first touch *"without
locking the taxonomy"*, offered rather than installed.

---

## What is not in any of these plans

- **No deck branches, diffs or merges.** The requirement rules them out and the rule is kept:
  *"A new version supersedes the last… the stack does not branch, diff, or merge."*
- **No performance data on funnel activities.** Status is tracking, not measurement.
- **No file storage for a Resource.** It is a link to somebody else's site, always.
- **No automated Canva export.** The team attaches the PDF; nothing fetches it.
- **No split of photography out of `brand_assets`.** Argued above, deferred on purpose.

## What these four features deliberately do not touch

Three paths run around this work rather than through it. Each was checked, and each is left alone on
purpose — recorded here so the next reader does not "fix" a silence that is a decision.

**Realtime.** Nothing here publishes. `deps.realtime.publish` has exactly three call sites — two
canvas ops and the agent's event stream — and every one addresses a `project:` channel. No
brand-level aggregate publishes today: not assets, not social posts, not outlets, influencers or
vendors. Four more that do not publish is consistency, not an omission, and the one-server-instance
commitment in `adapters.ts` is a reason not to grow that surface casually.

**The agent's brand context.** `buildSystemPrompt` takes `BrandWithSections` — the brand's name, its
description and its guideline sections, and nothing else. No colours, no typefaces, no assets. Three
of these four features belong nowhere near it: a font shop's URL, a category vocabulary and a PDF
the model cannot read do not make a caption sound more like the brand.

**The Funnel is the exception, and it is deferred rather than unconsidered.** *"The one view of what
a brand runs and where in the journey — for planning, alignment"* is exactly what the Post Planner
would want to know before proposing a month of posts, and that planner already reads brand sections.
So there is a real feature here later. It is out of Plan 4 because widening `BrandWithSections` is
not a free addition: `system-prompt.ts` renders four numbered parts whose default output is pinned
byte-for-byte by a test, and its longest comment is about what happens when the prompt is handed two
competing answers to one question. A fifth part is its own change, with its own argument.

**Export.** There is no export route, and `docs/vision.md` promises *"exportable at any time"*. That
gap predates this work and is not widened meaningfully by it — but four new tables are four more
things an export would owe, and this is the note that says so.

## The five open decisions, collected

1. Resource type — fixed enum, or brand-editable table? *(Proposed: enum.)*
2. Decks — profile band, nav row, or both? *(Proposed: both.)*
3. Canva PDF snapshot — required, or encouraged? *(Written as required.)* This one is now a CHECK
   arm rather than a phase, so it wants settling before Plan 2 Phase A.
4. Photo category — required on create? Behaviour on category delete? *(Proposed: no, and set null.)*
5. Funnel default stages — written at create, and offered from the empty state rather than
   backfilled? *(Proposed: yes, and yes.)*

Each is answerable without changing the order above. Four of the five change one phase; decision 1
changes the size of Plan 1.

---

## What each plan owes the gate

The draft said nothing about tests, in a repository whose changelog records a test count for every
release. Four things are true of all four plans and are written here once.

- **Every phase runs the full gate before it is called done**: `pnpm typecheck`, `pnpm lint`,
  `pnpm format:check`, `pnpm test`, both frontend builds. `lint` and `format:check` at the root skip
  `packages/web-next` on purpose, so each screen phase also owes
  `pnpm -F @brandfactory/web-next lint && … typecheck && … build`. A plan phase that only ran the
  root gate has not been checked.
- **A new table's query helpers get a `*.live.test.ts` in `packages/db`.** Those need a real
  `DATABASE_URL` and skip without one, which is most of the skipped count the changelog reports.
  They are also the only place a cascade, a `SET NULL` or a CHECK is actually exercised — and
  `brand_assets`' own docstring sets the standard: *a CHECK nobody has seen fail is a CHECK that may
  not exist.* Plan 2's two-part Canva write is the one that most needs it.
- **A new route group gets a route test** built against `createApp(deps)` with fakes, per the
  dependency rule. No vendor is named in a test any more than in domain code.
- **`web-next` tests the logic a browser pass cannot see, and not the screens.** That is the stated
  scope of that project's suite. For these four plans the logic worth asserting is: the version
  ordering rule in Plan 2, the pin comparator in Plan 3 — including that `byPosition` is unchanged —
  and the stage ordering in Plan 4.

### Four conventions each plan owes before its first row exists

- **Branded ids, in `packages/shared/src/ids.ts`.** Every aggregate in this schema has one, so a
  `BrandId` cannot be passed where a `DeckId` belongs. These four plans add seven:
  `BrandResourceId`, `DeckId`, `DeckVersionId`, `PhotoCategoryId`, `FunnelStageId`, `PlatformId`,
  `FunnelActivityId`. It is the first file each plan touches and the easiest to skip, because
  nothing fails until two ids of different kinds meet.
- **The zod ⇄ pgEnum pin.** Two new enums arrive — Plan 1's resource type and Plan 4's activity
  status — and each one's member list is written twice, once in `shared` and once as a `pgEnum`. The
  convention closes that with a test asserting `Schema.options` against a literal list, described in
  `influencer.test.ts` as *"the only place that reads both as data."* A member added to one side and
  not the other fails there and nowhere else.
- **One completion document per phase**, in `docs/completions/`, never two phases in one file, moved
  to `docs/archive/` when the feature is done.
- **A changelog entry per release**: the one-line index entry, the full entry below it, the
  migration number or `No migration`, and the test count.

### Three wiring steps that are easy to miss

Not obvious from any one file, and each one fails in a way that looks like something else.

1. **A new route group must be added to the chained `.route()` calls in `packages/server/src/app.ts`
   or `web-next` cannot see it.** `AppType` is inferred from that chain, and `bf-client.ts` builds
   on `hc<AppType>`. A router that exists but is not chained is not a 404 in the client — it is a
   property that does not exist on a type.
2. **Run `pnpm exec next typegen` after adding a route.** `PageProps<"/brands/[id]">` is generated,
   and Next 16 makes `params` a Promise that must be awaited. The brand page's docstring says both.
3. **A feature folder reads the fixtures or the real server, never both.** That is `bf-client.ts`'s
   stated boundary, and all four of these are real-server features. None of them may reach for
   `lib/api/mock.ts`.

Dev data is worth one line: `db:seed` was rewritten in 1.44.0 to describe Mission Group rather than
an imaginary coffee chain. Four new tables that seed nothing give four screens whose empty state is
the only state anyone sees while building them.

---

## What this plan corrects about itself

Eight review passes. The first six each ran the same direction — the draft was tidier than the code
allows. The seventh ran a different one, and found more than the two before it combined. They are kept rather than quietly edited away, because each one is a shape of mistake this
plan's implementation could repeat.

**Pass one, over `nav.ts`:**

- **Phase 0 was going to move the two Tools rows.** `BrandNavItem` has no `tag` field, so the move
  converts two honest empty doors into two rows that read as finished. Phase 0 now ships the
  grouping only, and each plan moves its own row when it has a screen behind it.
- **`Resources` was already taken.** `NAV_GROUPS` labels a group with that word today. The group is
  renamed, because the feature's name came from marketing and the group's name came from having
  nowhere else to put two queues.
- **The header said four migrations.** Plan 3 ships two, by this plan's own argument.
- **Migration 0010 was the wrong precedent for the funnel defaults.** It *derived* a value; six
  stage names in SQL derive nothing.

**Pass two, over `asset.ts`, `queries/assets.ts` and the three newest schemas:**

- **The pin was going to be taught to `byPosition`.** It has three callers, and one of them is
  `logoAsset`, which fixes the resolution rule for every non-unique role. A pinned photograph would
  have changed which image is the brand's logo. Plan 3A now takes its own comparator.
- **Plan 3A claimed an index it does not need.** `listAssetsByBrand` reads the whole brand and the
  client sections it; the pin sorts a list already in memory.
- **`brand_resources` had a `deleted_at` and a `position` by reflex.** Soft delete belongs to
  discarded *ideas*; `influencers`, `vendors` and `outlets` carry none. Nothing orders a resource
  inside its type.
- **`deck_versions.author` was a FK to `users`.** The author of a brand deck is frequently an agency
  with no account, and the FK would write `null` into the field the history is read for.

**Pass three, over `authz.ts`, `app.ts`, migration 0011 and the gate:**

- **"The newest version is current" was the name of a rule, not a rule.** No ordering key, no
  tiebreak, and the two candidates disagree exactly when a team enters a backlog of old versions in
  one sitting. Now `version_date DESC, created_at DESC`, in one query helper.
- **Decision 1's reversal cost was understated.** Adding a value to a live enum is migration 0011's
  documented hazard, not a column add.
- **Plan 3A was described as a two-column migration.** A required field on the shared `BrandAsset`
  union reaches 14 files that construct one, most of them tests in the outgoing app.
- **The plan owed the gate nothing.** In this repository that is the omission that shows up in the
  changelog.

**Pass four, over `blob-refs.ts`, `queries/brands.ts` and the requirement text itself:**

- **Plan 2 was going to leak every deck PDF ever uploaded.** Three blob-reference helpers are
  hand-maintained lists of arms, and `deck_versions` is the first blob-holding table added since
  they were written. `listBlobKeysByBrand`'s docstring already names *deck* in the arm that is about
  to stop covering decks.
- **`deck_versions` had no invariant of its own.** The plan proved decks cannot reuse
  `brand_assets`' CHECK and then specified no replacement. It now carries a `source` discriminator
  and a two-arm CHECK, which is also where decision 3 lands.
- **Funnel platforms were rows on a stage.** A platform serving two stages would be typed twice —
  the exact duplication `vendor_brands` and `influencer_brands` each refused.
- **The photo category is unconstrained against the shelf.** Now a stated decision rather than an
  oversight.

**Pass five, over `agent/`, the realtime call sites and `download.ts`:**

- **Plan 2's blob path was named as upload only.** A deck exists to be handed to somebody; download
  is the third leg and its only implementation is in the app that is leaving.
- **The agent's brand context had not been considered at all.** Three of four correctly stay out of
  it. The Funnel has a genuine claim and is now deferred with a reason rather than unmentioned.
- **Realtime and export were silences.** Both are now stated decisions.

This pass is thinner than the one before it, and the reason is worth recording: it found no defect
in the schema, only in what the plan had failed to say about the paths around it.

**Pass six, over `ids.ts`, the enum pin tests and `list-every.ts`:**

- **Seven branded ids and two enum pins were unwritten.** Conventions rather than defects, but both
  are load-bearing and neither fails loudly.
- **Plan 3's filter and sort depend on `listAssetsByBrand` having no cursor.** True today, unstated
  until now, and `list-every.ts` is the file that already records what breaks when it stops being
  true.
- **No completion or changelog obligation was written down**, in a repo that keeps one document per
  phase and a test count per release.

Six passes. The last two found no defect in the schema or the phase order — only conventions the
plan had not named and couplings it had not stated. Treat that as convergence: the remaining risk is
now in the execution, not in this document.

**Pass eight, re-reading what pass seven had edited:**

- **Plan 2 buried its own headline.** The item labelled *the single largest hazard in all four
  plans* was the sixth sub-point of Phase A, thirty-five lines down, while Phase B was two lines.
  It is now Phase B in its own right — and it is different work anyway: three existing `packages/db`
  helpers and three live tests, not a table definition.
- **Plan 4's Phase B was titled *platforms per stage*** — the exact shape its body argues against.

Pass eight found two, both structural, both introduced by pass seven. The floor is not zero, but it
is close, and every finding from six onward has been about this document rather than about the
work it describes.

**Pass seven — the first reading of this document end to end:**

Six passes had each spliced findings into a document nobody had re-read whole, and the splices had
been quietly disagreeing with each other. Nine defects, none of them in the codebase:

- **`deck_versions`' column list omitted the `source` discriminator** the paragraph above it spends
  a page arguing for.
- **Phase 2C had two paragraphs welded into one sentence**, so the download rule and the signed-read
  reference ran together.
- **Phase 2E was a five-word stub** while decision 3 described it as owning an ordering rule and an
  orphan sweep — and the Plan 2 preamble, added later, said decision 3 was *"a CHECK rather than a
  phase"*. Three statements, three different sizes for one phase.
- **The `platform` section deferred to Phase B** for a decision Phase B had since made, and Phase B
  pointed at that section as being *below* it when it is above.
- **Phase 4C still gave an activity a platform *name*** after Phase B turned platforms into rows —
  reintroducing one level down the duplication B exists to remove. It also still said "dates".
- **Decision 4 justified itself by pointing at Plan 2's author column**, which pass three had turned
  from a FK into text, leaving the reference dead.
- **Decision 5 said brands "already exist" and "none exist yet" in one sentence**, and the false
  half was load-bearing: seven brands ship in the seed and more are in production, which is the
  whole reason a create-time default is not enough.
- **Two sections doing the same job** — what is excluded, and what is untouched — sat separated by
  the decisions list. Now adjacent.

The lesson generalises past this document: **six passes of adding are not one pass of reading.**
Every defect here was introduced by a correct edit made without re-reading what it landed beside.

The pattern is worth naming for whoever executes this: **the near-miss precedent is the dangerous
one.** Every defect above came from copying a real rule from a real file — soft delete, a position
column, a `SET NULL` FK, a partial index, a shared comparator — into a place whose reason for
existing was different. Check what a precedent was *for* before taking its shape.
