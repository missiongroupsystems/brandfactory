# Four asks from marketing — implementation plan

> **For agentic workers:** use `superpowers:executing-plans` (or `subagent-driven-development` where
> subagents are available). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ship Resources, Decks, Photography sub-categories and pins, and the Marketing Funnel as
four brand-scoped areas of `packages/web-next`.

**Architecture:** each phase is one vertical slice through the same five layers — branded ids and
zod in `@brandfactory/shared`, a generated migration and query helpers in `@brandfactory/db`, a Hono
router chained into `app.ts`, then a `web-next` feature folder reading the real server through
`bf-client.ts`. No new dependency, no new adapter, no vendor named in domain code.

**Tech stack:** TypeScript, zod, Drizzle, Postgres, Hono, Next 16, TanStack Query, vitest.

**Companion document:** `docs/executing/four-asks-from-marketing-plan.md` — the proposal, and the
argument behind every decision below. **Read it first.** This document says *what to type*; that one
says *why*, and the why is where eight review passes went.

---

## How to use this document

**Every phase is independently shippable.** Do one, run the gate, write its completion document,
release it. Nothing below assumes the next phase exists.

**The gate, run at the end of every phase, no exceptions:**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm -F @brandfactory/web build
pnpm -F @brandfactory/web-next lint && pnpm -F @brandfactory/web-next typecheck && pnpm -F @brandfactory/web-next build
```

The root `lint` and `format:check` skip `packages/web-next` on purpose, which is why the third line
exists. A phase checked only by the first two lines has not been checked.

**Seven migrations across the four plans**, and no phase carries more than one: 1A, 2A, 3A, 3B, 4A,
4B, 4C. Every other phase is `No migration`, which is what its changelog entry must say. The
proposal's header says *"five at minimum"* and was counting before Plan 4 grew a platforms table and
a join; seven is the number.

**Two decisions are still open and they change what you type.** Settle both before starting the
phase named:

| Decision | Blocks | Effect if it flips |
| --- | --- | --- |
| **1** — is the resource type set editable? | Phase 1A | Plan 1 gains a `resource_types` table and a management screen, mirroring 3B and 3C. |
| **3** — is the Canva PDF snapshot required? | Phase 2A | The CHECK's second arm becomes nullable and Phase 2F shrinks from a two-part write to a UI prompt. |

Everything below assumes the proposal's recommendation: decision 1 **fixed enum**, decision 3
**required**.

**The proposal lists five open decisions; this plan settles three of them by writing them down.** It
is worth saying which, because the two documents otherwise disagree about what is still open:

| Decision | Settled here as | Where |
| --- | --- | --- |
| **2** — where Decks live | Both: a band on the brand profile *and* a nav row | Phase 2E |
| **4** — photo category required? on delete? | Not required; `ON DELETE SET NULL` | Phase 3B |
| **5** — the six default stages | Written at brand create, and offered from the empty state | 4A, 4D |

None of the three changes a phase boundary, which is why they could be written in rather than left
open. Decisions 1 and 3 change the *size* of a plan and a CHECK arm respectively, so they stay
above.

**Conventions that apply to every phase, and that nothing will remind you about:**

- **Branded ids first.** Add them to `packages/shared/src/ids.ts` before anything imports them.
- **Generate migrations, never hand-number them:** `pnpm -F @brandfactory/db db:generate`.
- **A new zod enum owes a pin test** asserting `Schema.options` against a literal list — see
  `packages/shared/src/influencer/influencer.test.ts`, *"the only place that reads both as data."*
- **A new router must be chained into `packages/server/src/app.ts`** or `web-next` cannot see it.
  `AppType` is inferred from that chain; an unchained router is a missing property on a type, not a
  404.
- **Run `pnpm exec next typegen`** after adding a `web-next` route.
- **A feature folder reads the real server or the fixtures, never both.** All of these are real.
- **One completion document per phase** in `docs/completions/`, and a changelog entry per release
  with the migration number (or `No migration`) and the test count.

---

## File structure

Files created or modified, and what each one owns. Paths are exact.

**`packages/shared`** — the wire contract. One folder per domain, exported from `src/index.ts`.

| Path | Owns |
| --- | --- |
| `src/ids.ts` | Seven new branded ids. Modified by 1A, 2A, 3B, 4A, 4B, 4C. |
| `src/resource/resource.ts` | `BrandResource`, its enum, its field schemas. **1A** |
| `src/resource/resource.test.ts` | The enum pin, and the field bounds. **1A** |
| `src/deck/deck.ts` | `Deck`, `DeckVersion`, the `source` union, the ordering rule. **2A** |
| `src/deck/ordering.ts` | `currentVersion` / `byVersionRecency`. One home for the tie-break. **2A** |
| `src/asset/asset.ts` | Gains `isPinned` / `pinnedAt` on the union, and `categoryId`. **3A**, **3B** |
| `src/asset/photography.ts` | The photography comparator. **Not** `byPosition`. **3A** |
| `src/funnel/funnel.ts` | Stage, platform, activity, status enum. **4A**, **4B**, **4C** |
| `src/funnel/defaults.ts` | The six default stage names. **4A** |

**`packages/db`** — schema, migrations, query helpers. No HTTP, no business rules.

| Path | Owns |
| --- | --- |
| `src/schema/brand_resources.ts` | **1A** |
| `src/schema/decks.ts`, `src/schema/deck_versions.ts` | **2A** |
| `src/schema/photo_categories.ts` | **3B** |
| `src/schema/funnel_stages.ts`, `platforms.ts`, `stage_platforms.ts`, `funnel_activities.ts` | **4A**, **4B**, **4C** |
| `src/schema/index.ts` | Re-export each new table. Easy to forget; nothing fails loudly. |
| `src/queries/resources.ts`, `decks.ts`, `photo-categories.ts`, `funnel.ts` | One file per aggregate. |
| `src/queries/brands.ts:listBlobKeysByBrand` | Gains the deck arm. **2B** |
| `src/queries/brands.ts:createBrand` | Writes a brand's six funnel stages in the same transaction. The only cross-aggregate write in these plans. **4A** |
| `src/queries/workspaces.ts:listBlobKeysByWorkspace` | Gains the deck arm. **2B** |
| `src/queries/blob-refs.ts:listStillReferencedBlobKeys` | Gains the deck arm. **2B** |
| `src/*.live.test.ts` | One per new aggregate. Skips without `DATABASE_URL`. |

**`packages/server`** — one router file per aggregate, mirroring `routes/assets.ts`.

| Path | Owns |
| --- | --- |
| `src/routes/resources.ts` + `.test.ts` | **1B** |
| `src/routes/decks.ts` + `.test.ts` | **2C** |
| `src/routes/photo-categories.ts` + `.test.ts` | **3B** |
| `src/routes/funnel.ts` + `.test.ts` | **4A**–**4C** |
| `src/app.ts` | One `.route('/brands', …)` line per new router. |

**`packages/web-next`** — one feature folder per area, each with `api.ts`, `hooks.ts`, `components/`.

| Path | Owns |
| --- | --- |
| `src/components/layout/nav.ts` | Group rename, then one `BRAND_NAV_ITEMS` row per plan. |
| `src/components/layout/brand-nav.tsx` | The grouping layer. **Phase 0** |
| `src/features/resources/**` | **1C**, **1D** |
| `src/features/decks/**` | **2E**, **2F** |
| `src/lib/blob.ts` | Signed read, upload, download. Shared by decks and photography. **2D** |
| `src/features/photography/**` | **3C**, **3D** |
| `src/features/funnel/**` | **4D** |
| `src/app/(app)/brands/[id]/{resources,decks,photography,funnel}/page.tsx` | Thin route shells. |

---

## Phase 0 — the brand nav learns to group

**No migration. No wire change.** Prerequisite for every screen phase below.

Two rows become six over the four plans, and `brand-nav.tsx` currently renders one unlabelled group
because *"an eyebrow over two rows… would be a section heading for the only section there is."* That
reason expires at six. This phase adds the grouping and moves **no rows** — see the proposal for why
moving them early ships two doors that lie.

**Files:**

- Modify: `packages/web-next/src/components/layout/nav.ts`
- Modify: `packages/web-next/src/components/layout/brand-nav.tsx`
- Test: `packages/web-next/src/components/layout/nav.test.ts`

- [ ] **Step 1: Write the failing test for the group rename**

`NAV_GROUPS` labels a group `Resources` today, holding `/review` and `/marketing-requests`. Plan 1
adds a brand row with that name. Rename the group, not the feature.

```ts
// packages/web-next/src/components/layout/nav.test.ts
it("has no group called Resources — that word belongs to the brand-scoped feature", () => {
  expect(NAV_GROUPS.map((g) => g.label)).not.toContain("Resources");
});

it("files Review and Marketing Requests under Queues, because both are queues", () => {
  const group = NAV_GROUPS.find((g) => g.label === "Queues");
  expect(group?.hrefs).toEqual(["/review", "/marketing-requests"]);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run --project @brandfactory/web-next -t "belongs to the brand-scoped feature"
```

Expected: FAIL — the array still contains `"Resources"`.

- [ ] **Step 3: Rename the group**

One string in `NAV_GROUPS`. The list is keyed by `href`, so nothing else moves.

```ts
{ label: "Queues", hrefs: ["/review", "/marketing-requests"] },
```

- [ ] **Step 4: Run it and watch it pass**

```bash
pnpm vitest run --project @brandfactory/web-next -t "Queues"
```

- [ ] **Step 5: Decide the groups, and accept that Outlets moves**

An earlier draft of this step said *"implement `BRAND_NAV_GROUPS`"* without naming the groups, and
told you not to reorder `BRAND_NAV_ITEMS`. Both halves were wrong, and together they are unwritable.

**Groups must be contiguous slices of the list order**, because grouping only inserts eyebrows — it
does not reorder. So the group membership *is* the order, and the six rows this work produces cannot
be grouped with Outlets sitting second. These are the groups and the final order:

```ts
export const BRAND_NAV_GROUPS: { label: string | null; segments: string[] }[] = [
  { label: null, segments: [""] },        // the brand itself
  { label: "Library", segments: [] },     // 1C, 3D and 2E fill this, in that order
  { label: "Presence", segments: ["outlets"] }, // 4D adds "funnel"
];
```

*Library* is what the brand holds and you go and fetch — Resources, Photography, Decks. *Presence* is
where the brand meets somebody: a physical outlet, or a stage of the journey.

**Declare the groups empty rather than pre-listing the segments those plans will add**, and this is
not tidiness. `never orphans a brand nav row` in the next step checks that every *item* has a group.
Pre-listing `"resources"` in `Library` before the row exists means the test passes the moment 1C adds
it — so the guard fires on nobody, and the first plan to forget its group ships an ungrouped row. An
empty `segments: []` keeps the test armed for all four plans.

The final order the four plans arrive at, once every group is filled:

```
(ungrouped)  Brand profile
Library      Resources · Photography · Decks
Presence     Outlets · Marketing funnel
```

**Outlets moves from second to fifth, and that is fine here in a way it would not be next door.**
`NAV_GROUPS` forbids reordering because its comments argue every adjacency it has — Quotations after
Contracts because a quotation becomes one, Vendors after both because a vendor is the counterparty.
The brand nav has no such argument on record: two rows in the order they were built. Moving one to
make grouping possible costs nothing that was ever reasoned for.

Phase 0 adds only the two rows that exist today, so `Library` is empty until 1C and `Presence` holds
Outlets alone. **A group with no rows must not render an eyebrow** — the same silence `NAV_GROUPS`
keeps for a group whose items are all above `CURRENT_PHASE`.

- [ ] **Step 6: Write the failing tests**

```ts
it("leaves the brand's own page ungrouped", () => {
  expect(BRAND_NAV_GROUPS.find((g) => g.label === null)?.segments).toEqual([""]);
});

it("never orphans a brand nav row", () => {
  const grouped = new Set(BRAND_NAV_GROUPS.flatMap((g) => g.segments));
  for (const item of BRAND_NAV_ITEMS) expect(grouped.has(item.segment)).toBe(true);
});

it("groups in list order, so grouping never reorders", () => {
  const order = BRAND_NAV_ITEMS.map((i) => i.segment);
  const flat = BRAND_NAV_GROUPS.flatMap((g) => g.segments).filter((sgmt) =>
    order.includes(sgmt),
  );
  expect(flat).toEqual(order);
});
```

The second fails the day a plan below adds a row and forgets its group. The third fails the day
somebody groups two rows that are not adjacent — which is the mistake this step was making.

- [ ] **Step 7: Run them, watch them fail, implement, watch them pass**

```bash
pnpm vitest run --project @brandfactory/web-next -t "brand nav"
```

Render `BRAND_NAV_GROUPS` in `BrandNavItems`: a `SidebarGroup` per entry, a `SidebarGroupLabel` only
when `label !== null`, and **nothing at all** for a group whose segments are all absent from
`BRAND_NAV_ITEMS`.

- [ ] **Step 8: Update the docstring**

`BrandNavItems`' comment explains the single unlabelled group. Replace it with the reason it changed:
the argument was about two rows, and four plans below make it six.

- [ ] **Step 9: Run the gate, then commit**

```bash
git add packages/web-next/src/components/layout/
git commit -m "nav: brand sidebar learns to group, and Resources frees its name

The brand nav renders one unlabelled group because an eyebrow over two rows
would head the only section there is. Four brand-scoped features take it to
six, so the grouping arrives before the rows do — and no row moves here, because
BrandNavItem has no tag field and a moved Tools row would read as finished.

NAV_GROUPS' Resources label becomes Queues: both members are queues, and the
word is about to belong to a brand-scoped feature."
```

---

## Phase 1A — `brand_resources`, end to end at the data layer

**Migration: one.** New table, new enum, no existing table touched.

**Files:**

- Modify: `packages/shared/src/ids.ts`
- Create: `packages/shared/src/resource/resource.ts`, `resource.test.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/db/src/schema/brand_resources.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/queries/resources.ts`
- Create: `packages/db/src/resources.live.test.ts`

- [ ] **Step 1: Add the branded id**

```ts
// packages/shared/src/ids.ts — beside BrandAssetIdSchema
export const BrandResourceIdSchema = brandedId('BrandResourceId')
export type BrandResourceId = z.infer<typeof BrandResourceIdSchema>
```

- [ ] **Step 2: Write the failing shared test**

The enum pin comes first because it is the test nothing else will remind you to write.

```ts
// packages/shared/src/resource/resource.test.ts
import { describe, expect, it } from 'vitest'
import { BrandResourceSchema, ResourceTypeSchema } from './resource'

// The member list is duplicated with the pgEnum in `@brandfactory/db`, per the
// zod-⇄-pgEnum convention. This test is the pin: a member added to one side and
// not the other fails here, which is the only place that reads both as data.
describe('the enum', () => {
  it('holds six types, with "other" as the escape hatch', () => {
    expect(ResourceTypeSchema.options).toEqual([
      'font',
      'image',
      'icon',
      'tool',
      'reference',
      'other',
    ])
  })
})

describe('the row', () => {
  it('refuses a non-http url, because the value reaches an href', () => {
    const base = {
      id: 'r1',
      brandId: 'b1',
      type: 'font' as const,
      title: 'Klim',
      note: null,
    }
    expect(BrandResourceSchema.safeParse({ ...base, url: 'javascript:alert(1)' }).success).toBe(
      false,
    )
    expect(BrandResourceSchema.safeParse({ ...base, url: 'https://klim.co.nz' }).success).toBe(true)
  })

  it('accepts a null note, because the note is optional', () => {
    // …
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

```bash
pnpm vitest run packages/shared/src/resource/resource.test.ts
```

Expected: FAIL — `Cannot find module './resource'`.

- [ ] **Step 4: Write the schema**

`AssetLinkUrlSchema` is imported, not restated — it already restricts to `http`/`https` and 2048
characters, which is the rule this field needs and the reason a `javascript:` URL never reaches an
`href`.

```ts
// packages/shared/src/resource/resource.ts
import { z } from 'zod'
import { AssetLinkUrlSchema } from '../asset/asset'
import { BrandIdSchema, BrandResourceIdSchema } from '../ids'

// A named external link a team member has to find fast — a font shop, a stock
// library, an icon set. **Not a `brand_assets` row**, and the near miss is
// worth knowing: that table models a link on somebody else's host too, but its
// `kind` is `color | image | file` and a website is none of the three. The app
// stores no bytes here, ever.
export const ResourceTypeSchema = z.enum(['font', 'image', 'icon', 'tool', 'reference', 'other'])
export type ResourceType = z.infer<typeof ResourceTypeSchema>

export const ResourceTitleSchema = z.string().trim().min(1).max(200)
/** A short reminder of what the link is for, not a description of the site. */
export const ResourceNoteSchema = z.string().trim().max(500)

export const BrandResourceSchema = z.object({
  id: BrandResourceIdSchema,
  brandId: BrandIdSchema,
  type: ResourceTypeSchema,
  title: ResourceTitleSchema,
  url: AssetLinkUrlSchema,
  note: ResourceNoteSchema.nullable(),
})
export type BrandResource = z.infer<typeof BrandResourceSchema>

export const CreateBrandResourceInputSchema = BrandResourceSchema.omit({ id: true, brandId: true })
export const UpdateBrandResourceInputSchema = CreateBrandResourceInputSchema.partial()
```

- [ ] **Step 5: Export it and run the test**

Add `export * from './resource/resource'` to `packages/shared/src/index.ts` under a `// Resource`
comment, then:

```bash
pnpm vitest run packages/shared/src/resource/resource.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write the table**

**No `deleted_at` and no `position`** — both were in the first draft by reflex and the proposal
argues each out. Carry the reasoning into the file, because the next reader will wonder.

```ts
// packages/db/src/schema/brand_resources.ts
import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { brands } from './brands'

// Member list duplicated with `ResourceTypeSchema` in `@brandfactory/shared`,
// per the zod-⇄-pgEnum convention; the shared test pins both lists.
export const resourceType = pgEnum('resource_type', [
  'font',
  'image',
  'icon',
  'tool',
  'reference',
  'other',
])

// **No `deleted_at`.** Soft delete is `brand_assets`' and `canvas_blocks`' rule
// and it has a reason those two share (`docs/vision.md:51`): a discarded *idea*
// hides rather than vanishes. A link to a font shop is not a discarded idea, and
// the three aggregates built most recently — influencers, vendors, outlets —
// carry no `deleted_at` at all.
//
// **No `position`.** `vendor_brands` refused one and said why. The requirement
// asks for grouping by type and never for ordering inside a group; title order
// is the read order.
export const brandResources = pgTable(
  'brand_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    type: resourceType('type').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  // The read path is the whole list, grouped. No CHECK: no invariant here spans
  // columns, so zod at the route boundary is the single enforcement point — the
  // `brands.website_url` precedent, not `brand_assets_source_exactly_one`.
  (table) => [index('brand_resources_brand_type_idx').on(table.brandId, table.type)],
)
```

- [ ] **Step 7: Re-export and generate the migration**

```bash
echo "export * from './brand_resources'" >> packages/db/src/schema/index.ts
pnpm -F @brandfactory/db db:generate
pnpm -F @brandfactory/db db:migrate
```

Read the generated SQL before committing it. Expect `CREATE TYPE "public"."resource_type"`, one
`CREATE TABLE`, one `CREATE INDEX`, and nothing else.

- [ ] **Step 8: Write the query helpers and their live test**

`packages/db/src/queries/resources.ts` — `listResourcesByBrand`, `createResource`, `updateResource`,
`deleteResource`. Mirror `queries/assets.ts` for shape and `rowTo…` mapping.

The live test is where the cascade is actually exercised:

```ts
// packages/db/src/resources.live.test.ts — skips without DATABASE_URL
it('takes its resources with the brand', async () => {
  // create brand + two resources, delete the brand, expect zero rows.
  // The FK is the thing under test, not the query helper.
})
```

- [ ] **Step 9: Run the gate, then commit**

```bash
pnpm vitest run --project @brandfactory/shared --project @brandfactory/db
git add packages/shared/src/resource packages/shared/src/ids.ts packages/shared/src/index.ts \
        packages/db/src/schema packages/db/src/queries/resources.ts \
        packages/db/src/resources.live.test.ts packages/db/drizzle/
git commit -m "resources: the table, and the two columns it deliberately does not have

A Resource is a named external link — a font shop, a stock library — held per
brand. Not a brand_assets row: that table's kind is color|image|file and a
website is none of them, and the app stores no bytes here.

No deleted_at (soft delete is for discarded ideas; the three newest aggregates
have none) and no position (grouping by type is the ask, ordering inside a
group is not). Migration 00NN."
```

---

## Phase 1B — the routes

**No migration.** Four handlers — list, create, patch, delete — mirroring `routes/assets.ts`.
There is no fifth: `assets.ts`' reorder and restore routes both exist for columns this table does
not have.

**Files:**

- Create: `packages/server/src/routes/resources.ts`, `resources.test.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Write the failing route tests**

Build the app with fakes via `createApp(deps)`; no vendor is named in a test any more than in domain
code. Four cases, and the third is the one that is usually missed:

```ts
it("lists a brand's resources", async () => { /* 200, array */ })
it('creates one and returns it', async () => { /* 201 */ })
it('404s for a brand the caller cannot reach', async () => {
  // requireBrandAccess throws NotFoundError, and middleware/error.ts maps it.
  // Not 403 — a brand you cannot see does not exist to you.
})
it('400s on a javascript: url', async () => {
  // The schema is the enforcement point. This test is what proves it is wired.
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm vitest run packages/server/src/routes/resources.test.ts
```

- [ ] **Step 3: Write the router**

`createBrandResourcesRouter({ db })`, mounted at `/brands`, paths `/:id/resources` and
`/:id/resources/:resourceId`. Every handler calls `requireBrandAccess(userId, id, deps.db)` first.
No reorder route — there is no `position`.

- [ ] **Step 4: Chain it into `app.ts`**

```ts
.route('/brands', createBrandResourcesRouter({ db: deps.db }))
```

**This step is the one that fails silently if skipped.** `AppType` is inferred from this chain, so an
unchained router is a property that does not exist on a type in `web-next`, not a 404.

- [ ] **Step 5: Run the tests and the typecheck**

```bash
pnpm vitest run packages/server/src/routes/resources.test.ts && pnpm typecheck
```

- [ ] **Step 6: Run the gate, then commit**

```bash
git add packages/server/src/routes/resources.ts packages/server/src/routes/resources.test.ts \
        packages/server/src/app.ts
git commit -m "resources: four routes behind requireBrandAccess

Mounted at /brands, chained into app.ts so AppType carries them into web-next.
No reorder route: the table has no position column and the proposal says why."
```

---

## Phase 1C — the screen

**No migration.** The first brand-scoped feature folder in `web-next` that this work adds, and the
pattern 2E, 3D and 4D copy.

**Files:**

- Create: `packages/web-next/src/features/resources/{api.ts,hooks.ts,components/resources-view.tsx}`
- Create: `packages/web-next/src/app/(app)/brands/[id]/resources/page.tsx`
- Modify: `packages/web-next/src/components/layout/nav.ts`
- Test: `packages/web-next/src/features/resources/components/resources-view.test.tsx`

- [ ] **Step 1: Add the nav row and watch Phase 0's orphan test fail**

Add to `BRAND_NAV_ITEMS`:

```ts
// `Bookmark`, not `Link` or `ExternalLink`. Every row on this screen is an
// outbound link, so a link glyph labels the whole list with what each item is
// and distinguishes nothing — and `Link` is also the name `next/link` occupies
// wherever this list is rendered. A bookmark is *a place someone saved on
// purpose*, which is what a Resource is.
{
  title: "Resources",
  segment: "resources",
  icon: Bookmark,
  description: "The sites this brand buys fonts, images and tools from",
},
```

Import it suffix-free, as `nav.ts` imports every other glyph, and keep the comment — that file
justifies each icon choice in place and the next reader will look for the reason.

```bash
pnpm vitest run --project @brandfactory/web-next -t "never orphans a brand nav row"
```

Expected: FAIL — `Library` is `segments: []` and this row belongs to no group. Phase 0 left it empty
for exactly this moment. Add `"resources"` to `Library` and watch it pass.

- [ ] **Step 2: Write `api.ts` against `bf-client.ts`**

The typed client, not `lib/api/client.ts` — this feature reads the real server, and a feature folder
reads one source or the other, never both.

- [ ] **Step 3: Write the failing view test**

Three assertions — the grouping, the empty case, and the one property every row here has to carry:

```tsx
it("groups by type, in the enum's declared order", () => {})
it("renders an empty state rather than a heading over nothing", () => {})
it("opens each link in a new tab, with rel=noreferrer", () => {})
```

That third one is not ceremony: every row here is a user-supplied URL pointing off-origin.

- [ ] **Step 4: Implement the view, run the tests**

- [ ] **Step 5: Add the route shell and run typegen**

```bash
pnpm exec next typegen
```

`params` is a Promise in Next 16 and must be awaited — copy `brands/[id]/page.tsx`.

- [ ] **Step 6: Run the gate — including web-next's own — then commit**

---

## Phase 1D — the form and the delete

**No migration.** Plan 1 becomes writable.

The `Empty` tag never applies to this row, and the reason belongs to 1C rather than here: that phase
shipped a screen reading the real server, and `nav.ts` reserves `Empty` for *"a page deliberately
holding nothing yet."* A read-only screen over real data is not that. Drop the tag when the data
becomes real, not when the screen looks finished — which is why *Brand profile* never carried one.

**Files:**

- Create: `packages/web-next/src/features/resources/components/resource-form.tsx`
- Modify: `resources-view.tsx`, `hooks.ts`

- [ ] **Step 1: Write the failing form tests**

```tsx
it("refuses to submit an empty title", () => {})
it("shows the server's own refusal rather than blaming the network", () => {})
it("removes the row optimistically and restores it if the delete fails", () => {})
```

The middle one is a defect this codebase has shipped and fixed before (1.33.1) — write the test that
prevents its third occurrence.

- [ ] **Step 2: Implement the form**, and run the tests until they pass.

- [ ] **Step 3: Wire the mutations**, and confirm each one invalidates the list query — a create that
      does not is a row that appears only after a reload.

- [ ] **Step 4: Run the gate.**

- [ ] **Step 5: Write `docs/completions/resources-phase-d-the-form.md`**, add the changelog entry
      naming Phase 1A's migration number and the test count, commit, release.

Changelog entry: migration number from 1A, and the test count.

---

## Phase 2A — `decks` and `deck_versions`

**Migration: one.** Two tables and the CHECK that is the whole argument for them existing.

**Settle decision 3 first** — it is the second arm of the CHECK below, and a CHECK is not a thing to
loosen after rows exist.

**Files:**

- Modify: `packages/shared/src/ids.ts`
- Create: `packages/shared/src/deck/{deck.ts,ordering.ts,deck.test.ts,ordering.test.ts}`
- Create: `packages/db/src/schema/{decks.ts,deck_versions.ts}`
- Create: `packages/db/src/queries/decks.ts`, `packages/db/src/decks.live.test.ts`

- [ ] **Step 1: Add `DeckIdSchema` and `DeckVersionIdSchema`**

- [ ] **Step 2: Write `deck.ts` — the types the ordering test needs to exist**

`Deck` (`id`, `brandId`, `name`) and `DeckVersion` (`id`, `deckId`, `source`, `label`, `versionDate`,
`author`, `pdfBlobKey`, `canvaUrl`, `createdAt`). `source` is a two-member zod enum and **owes a pin
test** against the `pgEnum` in Step 5.

An earlier draft listed this file and then never wrote it, which left Step 3's test importing a type
from nowhere.

- [ ] **Step 3: Write the failing ordering test — before the schema**

This is the phase's real content. `version_date` is what the team typed; `created_at` is when the row
arrived. They disagree exactly when a team enters a backlog of old decks in one sitting.

```ts
// packages/shared/src/deck/ordering.test.ts
it('orders by the typed date, because that is what the reader recognises', () => {})

it('breaks a tie on created_at, so the last thing uploaded wins', () => {
  // Two versions, same version_date, different created_at.
  // Without the tie-break the "current" deck is whichever row the database
  // happened to return first — stable-looking, and wrong on a re-read.
})

it('is total: no two distinct versions compare equal', () => {
  // created_at is monotonic and server-set, so this holds by construction.
  // The test is here so that a future edit cannot quietly drop the second key.
})
```

- [ ] **Step 4: Implement `byVersionRecency` and `currentVersion` in `ordering.ts`**

One home for the rule. Not in each route, and never in the client.

- [ ] **Step 5: Write the two tables, with the two-arm CHECK**

`decks` is small and the plan owes it explicitly: `id`, `brand_id` FK **cascade**, `name`,
timestamps. **No `position`** — nothing orders decks against each other, per `vendor_brands`' rule.
`deck_versions` takes `deck_id` FK **cascade**, so deleting a deck takes its stack with it; there is
nothing left to describe.

```ts
// packages/db/src/schema/deck_versions.ts — the CHECK is the point
export const deckSource = pgEnum('deck_source', ['pdf', 'canva'])

// **The snapshot is not a second source.** The requirement says "each version is
// one source" and then puts a PDF beside a Canva link; both are right. The
// source is where the design lives and stays editable, and the PDF beside a
// Canva link is a frozen copy of it.
//
// This row holds a url AND a blob_key, which is precisely what
// `brand_assets_source_exactly_one` forbids — and that constraint is why decks
// cannot live in `brand_assets` at all.
check(
  'deck_versions_source_shape',
  sql`(
    (${table.source} = 'pdf'   AND ${table.pdfBlobKey} IS NOT NULL AND ${table.canvaUrl} IS NULL) OR
    (${table.source} = 'canva' AND ${table.canvaUrl}   IS NOT NULL AND ${table.pdfBlobKey} IS NOT NULL)
  )`,
)
```

`author` is **text, not a FK to `users`** — the author of a brand deck is frequently an agency that
will never hold a row in `users`, and a FK would write `null` into the one field the history column
is read for. `decks` gets **no `position`**: nothing orders decks against each other.

- [ ] **Step 6: Write the live tests — the CHECK, and both cascades**

```ts
it('refuses a canva version with no snapshot', async () => {
  // Insert a violating row directly, bypassing the route. Expect a rejection.
  // `brand_assets` sets the standard: a CHECK nobody has seen fail is a CHECK
  // that may not exist.
})

it('takes a deck's versions with the deck', async () => {})
it('takes a brand's decks with the brand', async () => {})
```

- [ ] **Step 7: Generate the migration and read the SQL before committing it**

```bash
pnpm -F @brandfactory/db db:generate && pnpm -F @brandfactory/db db:migrate
```

Expect two `CREATE TABLE`, one `CREATE TYPE`, and the CHECK. If the CHECK is missing from the
generated SQL, stop — the rest of this plan assumes the database enforces it.

- [ ] **Step 8: Run the gate, then commit**

---

## Phase 2B — the sweep gains an arm, in three places

**No migration.** The single largest hazard in all four plans, and its own phase so it cannot be
missed inside a table definition.

`deck_versions` is the first blob-holding table added since the sweep was designed, and the sweep is
a hand-maintained list of arms. `listBlobKeysByBrand` calls itself *"the only place brand bytes are
swept"* and its second arm's docstring says: *"Without this arm every uploaded logo, photo and deck
leaks its bytes on brand delete, silently and permanently."* It says *deck* because a deck PDF today
is a `brand_assets` row. Phase 2A moved them out.

**Files:**

- Modify: `packages/db/src/queries/brands.ts` → `listBlobKeysByBrand`
- Modify: `packages/db/src/queries/workspaces.ts` → `listBlobKeysByWorkspace`
- Modify: `packages/db/src/queries/blob-refs.ts` → `listStillReferencedBlobKeys`
- Modify: `packages/db/src/queries.live.test.ts`

- [ ] **Step 1: Write three failing live tests, one per helper**

```ts
it('collects a deck PDF when the brand is deleted', async () => {})
it('collects a deck PDF when the workspace is deleted', async () => {})
it('counts a surviving deck version as a reference, so its bytes are not swept', async () => {})
```

Run them and watch all three fail. **Do not skip this** — each one fails silently in production, in
object storage, on a delete nobody watches.

- [ ] **Step 2: Add the third arm to each helper — and do not filter it on `source`**

**This is the trap, and it is set by the arm you are copying.** The assets arm filters
`source = 'blob'`, because on `brand_assets` the source says where the bytes are. On `deck_versions`
it does not: the `'canva'` arm of the CHECK requires a `pdf_blob_key` too, because that is what the
snapshot *is*. So:

```ts
// Right — catches the PDF on both arms.
where(isNotNull(deckVersions.pdfBlobKey))

// Wrong — silently skips every Canva version's snapshot, which is the exact
// leak this phase exists to prevent.
where(eq(deckVersions.source, 'pdf'))
```

An implementer copying the assets arm reaches for the second one, and nothing fails: the query runs,
the sweep succeeds, and half the deck PDFs in the workspace quietly outlive their brand. `canva_url`
is never swept — it is somebody else's host, and deleting it would mean issuing a delete against a
key that is not ours.

**Make one of Step 1's three tests a Canva version specifically**, or this defect passes a suite that
only ever inserted a `'pdf'` row.

- [ ] **Step 3: Run the three tests, then update the two docstrings that now lie**

`listBlobKeysByBrand` says "two arms, and both are load-bearing"; `listBlobKeysByWorkspace` pins
itself to *"the same two arms."* Both say three now, and the pinning sentence stays — it is what
keeps them drifting as a pair.

- [ ] **Step 4: Run the gate, commit**

```bash
git commit -m "decks: the blob sweep learns about deck_versions, in all three places

listBlobKeysByBrand's docstring warned that without its assets arm 'every
uploaded logo, photo and deck leaks its bytes on brand delete'. Decks left that
table last phase, so the warning was about to come true through the gap it
described. Three helpers, three live tests. No migration."
```

---

## Phase 2C — the routes

**No migration.** Mirrors 1B, plus one thing that must not leak to the client: the current-version
derivation lives here, so no caller decides for itself which version is current.

- [ ] **Step 1: Write the failing route tests.** Three cases worth naming: a deck with no versions
      (an empty stack is a real state, not an error); a version create that supersedes the last
      **without deleting it**; and 404 on a deck belonging to another brand.

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Write the router**, resolving current through `currentVersion` from 2A — the client
      never decides which version is current.

- [ ] **Step 4: Chain it into `app.ts`.** The silent one; see 1B Step 4.

- [ ] **Step 5: Run the tests and `pnpm typecheck`.**

- [ ] **Step 6: Run the gate, then commit.**

---

## Phase 2D — the blob path in `web-next`

**No migration.** The new ground, and **three things, not one.**

**Files:**

- Create: `packages/web-next/src/lib/blob.ts` + test

- [ ] **Step 1: Signed read.** Port `packages/web/src/api/queries/blobs.ts`'s constraints rather than
      rediscovering them: URLs minted at `/blob-urls/:key/read-url`, refreshed at four minutes
      against a five-minute TTL, on a raw `fetch` because Hono's typed client will not round-trip
      the multi-segment `:key{.+}` param.
- [ ] **Step 2: Upload**, via signed write URL, so the server stays out of the byte path.
- [ ] **Step 3: Download.** The leg most easily forgotten — a deck exists to be handed to somebody.
      Port `packages/web/src/lib/download.ts`'s rule with it: *"One definition of what is
      downloadable, two readers… two definitions would produce a button that fails on click."*
- [ ] **Step 4: Gate, commit.** Phase 3D reuses all three.

---

## Phase 2E — the deck list and the version history

**No migration.** Adds the `Decks` brand-nav row and a band on the brand profile.

The band follows `visual-identity-band.tsx`'s rule exactly: render nothing when the brand has
nothing, so a brand that has not started does not get a heading over an empty rectangle.

**Files:**

- Create: `packages/web-next/src/features/decks/{api.ts,hooks.ts,components/}`
- Create: `packages/web-next/src/app/(app)/brands/[id]/decks/page.tsx`
- Create: `packages/web-next/src/features/brand-profile/components/decks-band.tsx`
- Modify: `packages/web-next/src/components/layout/nav.ts`, `profile-contents.tsx`

- [ ] **Step 1: Add the `Decks` brand-nav row**, watch the orphan test fail, add `"decks"` to the
      `Library` group, watch it pass.

- [ ] **Step 2: Write the failing tests for the list and the history**

```tsx
it("shows the newest version by default", () => {})
it("keeps older versions reachable rather than deleted", () => {})
it("renders a deck with no versions as an empty stack, not an error", () => {})
it("labels a Canva version as opening in Canva, and a PDF version as downloading", () => {})
```

The fourth is what the `source` discriminator was added for in 2A — if the screen cannot tell the
two apart, that column bought nothing.

- [ ] **Step 3: Implement the list and the version history.**

- [ ] **Step 4: Write the failing band test, then the band**

```tsx
it("renders nothing for a brand with no decks", () => {})
```

`visual-identity-band.tsx`'s rule exactly: a brand that has not started does not get a heading over
an empty rectangle. Register the band in `profile-contents.tsx` so it joins the *On this page* nav.

- [ ] **Step 5: Run `pnpm exec next typegen`, then the gate.**

- [ ] **Step 6: Commit.**

---

## Phase 2F — the Canva snapshot

**No migration.** The `'canva'` arm end to end, and **its size is decision 3.**

Required (the recommendation): one create, ordered by the server so a half-failure leaves no row
pointing at bytes that are not there. Upload first, insert second; a failed insert sweeps the key it
just wrote.

- [ ] **Step 1: Write the failing tests for the half-failure**

This is the only phase in the four plans where a partial write is reachable, so it is the only one
that owes these:

```ts
it('sweeps the uploaded key when the row insert fails', async () => {})
it('never leaves a version row pointing at bytes that are not there', async () => {})
```

The order is upload first, insert second — because the reverse leaves a row whose PDF never arrived,
and the CHECK cannot catch that: it constrains the column, not the object store.

- [ ] **Step 2: Implement the ordered create**, with the sweep on failure.

- [ ] **Step 3: Write the failing UI test**, then the add-version form: a Canva version asks for both
      the link and the export in one submit, and says why it wants the PDF.

- [ ] **Step 4: Run the gate.**

- [ ] **Step 5: Write `docs/completions/decks-phase-f-the-canva-snapshot.md`**, add the changelog
      entry naming 2A's migration number and the test count, commit, release.

---

## Phase 3A — the pin, alone

**Migration: one.** Two columns, and **fourteen files.**

**Files:**

- Modify: `packages/db/src/schema/brand_assets.ts`
- Modify: `packages/shared/src/asset/asset.ts`
- Create: `packages/shared/src/asset/photography.ts` + test
- Modify: the 14 files that construct a `BrandAsset` literal

**The order below is not the obvious one, and the reason is that the obvious one does not compile.**
An earlier draft opened with *"write the comparator test before touching anything"* — but that test
constructs an asset with `isPinned`, which does not exist on the union until Step 2, and it calls a
`makeAsset` factory that Step 4 was going to introduce. The type and the factory come first; the
test is still written before the comparator, which is where the discipline actually matters.

- [ ] **Step 1: Add `isPinned` / `pinnedAt` to the shared `BrandAsset` union.** Required, not
      optional: the field is always present on a row.

- [ ] **Step 2: Fix the fallout, and land the factory while you are there.** `pnpm typecheck` names
      every file — expect fourteen, most of them tests in `packages/web`, the app that is leaving.
      Where a file constructs several assets, replace the literals with a `makeAsset` factory; the
      next two steps need one and so will 3B.

- [ ] **Step 3: Write the failing comparator test — and the one that guards `byPosition`**

```ts
it('puts pinned photos first, then position order', () => {})

it('does not change byPosition — logoAsset must keep its resolution rule', () => {
  // byPosition has three callers: assetsOfKind, assetsOfLibrary, logoAsset.
  // Its docstring fixes the rule as "First by position among active, which is
  // the resolution rule for every non-unique role." A pin-aware byPosition
  // silently rewrites which image is the brand's logo on any brand where
  // somebody pinned a photograph.
  const pinned = makeAsset({ kind: 'image', role: 'logo', position: 9, isPinned: true })
  const plain = makeAsset({ kind: 'image', role: 'logo', position: 1, isPinned: false })
  expect(logoAsset([pinned, plain])).toBe(plain)
})
```

The second test is the phase. It must be red before `photography.ts` exists and green after, and it
must **stay** green for the life of the file.

- [ ] **Step 4: Implement the comparator in `packages/shared/src/asset/photography.ts`.**
      `byPosition` is not touched.

- [ ] **Step 5: Add the columns**, copying the pair `canvas_blocks` already carries. **No index** —
      `listAssetsByBrand` reads the whole brand and the client sections it, so the pin sorts a list
      already in memory. Generate the migration and read the SQL.

- [ ] **Step 6: Write the failing route test for pin/unpin**, then the route, mirroring
      `POST /brands/:id/assets/:assetId/restore`. Every other route in this plan is written
      test-first and this one is no exception.

- [ ] **Step 7: Gate, commit, release alone.** A shared-table change wants its own release to be
      wrong in.

---

## Phase 3B — the categories

**Migration: one.** A brand-scoped table and a nullable FK.

**This phase touches the same fourteen files 3A did, and an earlier draft was silent about it.**
`categoryId` is nullable, but a nullable field is still a *present* one on the shared union, so every
literal typed as a `BrandAsset` gains it. If 3A landed the `makeAsset` factory as instructed, this is
a one-line change per factory instead of fourteen edits — which is the whole reason that step says
to land it.

- [ ] **Step 1: Add `PhotoCategoryIdSchema` to `packages/shared/src/ids.ts`.** Nothing fails until
      two ids of different kinds meet, so it goes first.

- [ ] **Step 2: Write `photo_categories`** — `brand_id` cascade, `name`, `position`. Not a `pgEnum`:
      the set is editable per brand, and an enum makes every edit a migration.

- [ ] **Step 3: Add a nullable `category_id` to `brand_assets`,** `ON DELETE SET NULL`. Nullable is
      not laziness — every photo today has none and no rule could derive one; nothing recovers
      *interior* from a PNG.

- [ ] **Step 4: No CHECK against `library`.** A stray category on an identity asset is invisible
      rather than corrupting, and only the photography screen writes one — the `brands.website_url`
      precedent, not the `brand_assets_source_exactly_one` one. Record the decision in the file.

- [ ] **Step 5: Add `categoryId` to the shared union and fix the fallout.** See the note above.

- [ ] **Step 6: Write the failing route tests**, then the routes: list, create, rename, delete a
      category.

- [ ] **Step 7: Write the live tests** — the brand cascade, and that deleting a category leaves its
      photos with `category_id IS NULL` rather than deleting them.

- [ ] **Step 8: Generate the migration, read the SQL, run the gate, commit.**

---

## Phase 3C — the category management UI

**No migration.** The set is editable, so something has to edit it — and an earlier draft of this
phase was two sentences and no steps, which is not an executable phase.

**Files:**

- Create: `packages/web-next/src/features/photography/components/category-manager.tsx` + test
- Modify: `packages/web-next/src/features/photography/hooks.ts`

- [ ] **Step 1: Write the failing tests.** Four, and the last two are the ones a form like this
      usually ships without:

```tsx
it("renames a category in place", () => {})
it("refuses an empty name", () => {})
it("warns before deleting a category that has photos, and says how many", () => {})
it("leaves those photos in place, uncategorised, rather than deleting them", () => {})
```

The third is not politeness. `ON DELETE SET NULL` means a delete here silently uncategorises photos
somewhere else on the screen, and a reader who is not told will read the result as data loss.

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement the manager**, reusing 1D's form shape rather than inventing a second one.

- [ ] **Step 4: Run the tests, then the gate, then commit.**

---

## Phase 3D — the photography screen

**No migration.** Grid, filter by category, pinned first, then manual order, plus upload on 2D's
path. **Requires Phase 2D** — the blob path is the upload.

Adds the `Photography` brand-nav row and deletes the `/tools/photography` workspace row. As in 4D:
remove the `Tools` entry from `NAV_GROUPS` **only if this leaves it with no `hrefs`**, because
whichever of the two ships second is the one that empties it.

- [ ] **Step 1: Write the test that pins the read assumption**

```tsx
it("filters and sorts client-side, which is correct only while the read is whole", () => {})
```

`listAssetsByBrand` has no cursor today, so the filter and the sort are correct. They are correct *by
accident of that read*. `list-every.ts` records what happens otherwise: *"a row stranded on page two
is silently absent… an absence a reader takes as fact rather than as truncation."* If that read ever
gains a cursor, filter and sort move server-side in the same change.

- [ ] **Step 2: the grid**, reading `listAssetsByBrand` and sectioning client-side.
- [ ] **Step 3: the category filter**, over the list already in memory.
- [ ] **Step 4: the nav row swap** — add the brand row, delete the workspace row, mind the `Tools`
      group rule above.
- [ ] **Step 5: gate, completion document, changelog, release.**

---

## Phase 4A — stages

**Migration: one.** `funnel_stages`: `brand_id` cascade, `name`, `position`. **`position` earns its
column here**, unlike Plans 1 and 2 — the requirement's whole subject is *"ordered stages."*

**Files:**

- Modify: `packages/shared/src/ids.ts`
- Create: `packages/shared/src/funnel/{funnel.ts,defaults.ts,funnel.test.ts}`
- Create: `packages/db/src/schema/funnel_stages.ts`, `packages/db/src/queries/funnel.ts`
- **Modify: `packages/db/src/queries/brands.ts`** — `createBrand` gains the stage write
- Create: `packages/db/src/funnel.live.test.ts`

- [ ] **Step 1: Add `FunnelStageIdSchema` to `ids.ts`.** Nothing fails until two ids of different
      kinds meet, so it goes first.

- [ ] **Step 2: Put the six defaults in `packages/shared/src/funnel/defaults.ts`** as a constant —
      Awareness, Interest, Consideration, Conversion, Loyalty, Advocacy — and write the test that
      pins the list and its order. A journey read out of order is not a journey.

- [ ] **Step 3: Write `funnel.ts`** — `FunnelStage`, and the name/position field schemas.

- [ ] **Step 4: Write `funnel_stages`**, generate the migration, read the SQL.

      **No backfill in it.** Migration 0010's `CASE` is not the precedent it looks like: that one
      *derived* a value already implied by `kind` and `role`. Six stage names in SQL derive nothing —
      they are product copy, written a second time, in the one language that cannot import the
      constant. What covers existing brands is 4D's empty state, not this file.

- [ ] **Step 5: Write the failing live test for the transactional create**

```ts
it('gives a new brand its six stages', async () => {})
it('leaves no stages behind when the brand insert rolls back', async () => {})
```

The second one is the phase's real risk. A brand that commits without its stages shows an empty
funnel indistinguishable from *"nobody has set this up yet."*

- [ ] **Step 6: Write the stages beside `createBrand` — in the same transaction.**

      In `packages/db/src/queries/brands.ts`, not in the route, using
      `db.transaction(async (tx) => …)` with the local `type Tx` alias — the shape
      `queries/influencers.ts` already uses for multi-table writes. **This is the only
      cross-aggregate write in these four plans**, Plan 4 reaching into the brand create path, which
      is why it is called out in the file list above.

- [ ] **Step 7: Write the failing route tests, then the stage routes** — list, create, rename,
      reorder, delete.

- [ ] **Step 8: Run the gate, then commit.**

---

## Phase 4B — platforms, and the join to stages

**Migration: one.** A brand-scoped `platforms` table and a `stage_platforms` join.

**Not a platform per stage.** Instagram serves Awareness and Loyalty; as per-stage rows it is typed
twice, linked twice, and corrected once. That is the failure `vendor_brands` and `influencer_brands`
were both built to avoid, and both left a docstring saying why an array or a duplicate would not do.

**Do not reuse `social_platform`.** It is an eight-member *social* enum; a funnel names Google Ads,
email, SEO, a review site, the shop window. Reusing it files three quarters of a brand's funnel under
`other` — and a brand-scoped row settles the vocabulary question without a migration.

**Files:**

- Modify: `packages/shared/src/ids.ts`, `packages/shared/src/funnel/funnel.ts`
- Create: `packages/db/src/schema/{platforms.ts,stage_platforms.ts}`
- Modify: `packages/db/src/queries/funnel.ts`, `packages/db/src/funnel.live.test.ts`

- [ ] **Step 1: Add `PlatformIdSchema` to `ids.ts`.**

- [ ] **Step 2: Write `platforms`** — `brand_id` cascade, `name`, `url` using `AssetLinkUrlSchema`'s
      rule at the wire. The URL is user-supplied and reaches an `href`.

- [ ] **Step 3: Write `stage_platforms`** — a composite primary key on `(stage_id, platform_id)`,
      both cascading, and a second index on `platform_id` for the reverse read. This is
      `vendor_brands`' shape exactly; copy it, including the reasoning about why the pair is the row.

- [ ] **Step 4: Write the failing live tests**

```ts
it('lets one platform serve two stages', async () => {})
it('refuses the same pair twice', async () => {})
it('drops the link but keeps the platform when a stage is deleted', async () => {})
```

The first is the phase's entire justification — make it fail before the join table exists.

- [ ] **Step 5: Generate the migration, read the SQL, then the routes and their failing tests.**

- [ ] **Step 6: Run the gate, then commit.**

---

## Phase 4C — activities

**Migration: one.** `funnel_activities`: a stage, a `platform_id` into 4B's table, a `status` enum,
**two dates**, and free text.

**Files:**

- Modify: `packages/shared/src/ids.ts`, `packages/shared/src/funnel/funnel.ts` + test
- Create: `packages/db/src/schema/funnel_activities.ts`
- Modify: `packages/db/src/queries/funnel.ts`, `packages/server/src/routes/funnel.ts`

- [ ] **Step 1: Add `FunnelActivityIdSchema` to `ids.ts`.**

- [ ] **Step 2: Write the failing status pin test**

```ts
it('holds four statuses, and none of them measures anything', () => {
  expect(FunnelActivityStatusSchema.options).toEqual(['planned', 'running', 'paused', 'done'])
})
```

Small, closed, stated by the requirement, and explicitly bounded away from performance: *"not
performance; the deep platforms measure that."* `social_post_status` is the precedent, and the pin is
the convention every new enum owes.

- [ ] **Step 3: Write the activity schema and table.**

      `platform_id` and **not** a platform name — a string here reintroduces, one level down, the
      duplication 4B exists to remove.

      **Two dates, both nullable**, though the requirement says only "dates": a Planned activity
      often has neither, a Running one has a start and no end, a Done one has both. One date cannot
      express the middle case, which is the state most activities are in when anybody looks.

      **No CHECK tying dates to status.** A Done activity with no end date is a record somebody has
      not finished filling in, not a corrupt row, and this screen is for planning rather than
      bookkeeping.

- [ ] **Step 4: Generate the migration, read the SQL.**

- [ ] **Step 5: Write the failing route tests, then the routes.** One case worth naming: deleting a
      platform that an activity points at — cascade, or refuse? **Refuse.** An activity whose
      platform vanished is an activity that ran nowhere, and 4B's platforms are cheap to keep.

- [ ] **Step 6: Run the gate, then commit.**

---

## Phase 4D — the screen

**No migration.** One view of what a brand runs and where in the journey.

**Files:**

- Create: `packages/web-next/src/features/funnel/{api.ts,hooks.ts,components/}`
- Create: `packages/web-next/src/app/(app)/brands/[id]/funnel/page.tsx`
- Modify: `packages/web-next/src/components/layout/nav.ts`

- [ ] **Step 1: Add the `Marketing funnel` brand-nav row**, watch the orphan test fail, add `"funnel"`
      to the `Presence` group, watch it pass.

- [ ] **Step 2: Delete the `/tools/funnel` workspace row.**

      **The `Tools` group goes with whichever of 3D and 4D ships second, not necessarily this one.**
      An earlier draft removed it unconditionally, which is right only if Photography already
      shipped — and the execution order deliberately permits Plan 4 first. So: delete the row, then
      delete the `Tools` entry from `NAV_GROUPS` **only if it has no `hrefs` left.** Phase 3D carries
      the mirror of this sentence.

- [ ] **Step 3: Write the failing view tests**

```tsx
it("renders the stages in position order", () => {})
it("shows each stage's platforms as links", () => {})
it("offers the six defaults to a brand with no stages, and writes them on accept", () => {})
it("says a stage is empty rather than rendering a bare heading", () => {})
```

**The third test is 4A's other half**, and it lives here because it needs a screen — an earlier draft
put it in 4A, which has no UI to put a button on. It is what covers every brand that already exists:
the seven the 1.44.0 seed writes, and everything in production. The six defaults are a suggestion the
requirement calls editable, so a brand that wants five stages should not have to delete a row the
database gave it unasked — the shape `suggested-categories.ts` already uses, offered rather than
installed.

- [ ] **Step 4: Implement the view**, then the stage editor and the activity rows.

- [ ] **Step 5: Run `pnpm exec next typegen`, then the gate — including web-next's own.**

- [ ] **Step 6: Write the completion document, add the changelog entry** naming migrations from 4A,
      4B and 4C and the test count, commit, release.

---

## Phase 4E — deferred: the link to a held record

**Not in v1, and written down so the shape is on record.**

Of the three targets the requirement names, one is real and unreachable from this app
(`social_posts`, rendered only at :5173), one does not exist (there is no influencer *program*
record), and one is a 647-line fixture whose own docstring says *"there is no server."*

This phase opens when contracts becomes an aggregate — a stated intention, not a hypothetical:
`nav.ts` says *"Drop the tag when the contracts conversion lands."* Until then an activity's free
text is the link, which the requirement explicitly permits: *"otherwise it is plain text."*

---

## Order of execution

```
Phase 0 ─┬─ 1A → 1B → 1C → 1D                    release: Resources
         │
         ├─ 2A → 2B → 2C → 2D → 2E → 2F          release: Decks
         │              │
         ├─ 3A          │                        release: the pin, alone
         │   └─ 3B → 3C─┴─→ 3D                   release: Photography
         │
         └─ 4A → 4B → 4C → 4D                    release: Funnel   (4E deferred)
```

**Two couplings, and only two.** Phase 0 gates every phase that adds a nav row — 1C, 2E, 3D, 4D.
Phase 2D gates 3D, because the blob path is Photography's upload.

Everything else is free. 3A ships alone by design; Plan 4 depends on none of the three before it;
and 1A, 2A and 4A can start the day Phase 0 lands.

**One rule spans two branches:** whichever of 3D and 4D ships second removes the emptied `Tools`
group from `NAV_GROUPS`. Both phases carry the conditional, so neither needs to know it is last.
