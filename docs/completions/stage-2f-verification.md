# Stage 2F — verification, the live pass, and the debts

**Status:** shipped, 2026-07-29. Executes Stage 2F of
[`docs/executing/brand-hub-implementation.md`](../executing/brand-hub-implementation.md),
on top of [2E](stage-2e-the-library.md). **Stage 2 ships as 1.10.0**, and Stage 1
— held back since 1B — ships as **1.9.0** in the same pass.

**No new feature.** This phase exists because Stage 2 contains a migration, a new
table and four routes, and the plan wrote it down as *not skippable*. What it
changes is four things the live pass found or the plan owed: the 900px rail, the
palette rows on the library, an unnamed control in the tab order, and the demo's
asset scenarios.

Test baseline: **694** (665 passed, 29 skipped) → **688 passed, 0 skipped**.
The count went *down* by six and the skips went to zero; both are explained
below.

---

## Zero skips, because the skips were the point

Every prior phase in this plan reported "29 skipped" and said the same thing
about them — the live-Postgres suites need a `DATABASE_URL`. 2F is the phase that
supplies one:

```
pnpm test                                      665 passed | 29 skipped (694)
DATABASE_URL=… pnpm test                       688 passed |  0 skipped (688)
```

**All 29 ran and all 29 passed.** That is the first time `brand_assets`'
round-trip, its CHECK constraint, the widened `listBlobKeysByBrand` and 1A's
`website_url` have been exercised against Postgres in one run since they landed.

### The migration path, which is what broke releases v7 and v8

Both migrators, each from an **empty** database, plus the two orderings that a
real deploy can produce:

| run | result |
| --- | --- |
| `drizzle-kit migrate` on a fresh db | 0000→0004 applied |
| `node scripts/migrate.mjs` on a fresh db | applied, plain node, no tsx |
| `scripts/migrate.mjs` again | no-op, idempotent |
| `scripts/migrate.mjs` over the drizzle-kit db | no-op — the journals agree |

and the schema was read back rather than assumed:

```
brands.website_url                     text, nullable                    (0003)
brand_assets                           20 columns, 2 partial indexes     (0004)
brand_assets_source_exactly_one        CHECK present, three-branch
```

**Rollback is still free at the image level.** 0003 is one nullable column and
0004 is a new table; the previous image tolerates both. This is the release-note
claim the plan's risk table asked for, made after looking.

---

## The 900px rail, third pass — fixed by measurement

1.7.0 warned about it, 1.8.0 measured it (*"a section row is ~830px with its
chevron at the far right of its own label"*), 2C narrowed it (*"the palette block
is the best-behaved row in that column; this is about the section list"*), and
this pass had to fix it.

**The diagnosis is in `BrandContextRail`'s own doc comment.** It says the rail
replaced 1.4.0's `BrandContextBar` because a full-width card meant *"one small
chip marooned in a 130px band, with `Edit` a thousand pixels away"*. Below `lg`
the hub's two columns stack — and the rail went back to being exactly that card.
The rows were not wrong; the container was.

```
BrandHubView.tsx
  before   className="lg:w-80 lg:shrink-0"
  after    className="sm:max-w-[calc(50%-0.375rem)] lg:w-80 lg:max-w-none lg:shrink-0"
```

`calc(50% - 0.375rem)` is **one column of the tile grid above it** — `gap-3` is
12px, so half the row minus half the gap. Measured in the browser at 900px:

```
rail 420px · first tile 420px      right edges land on each other
```

Below `sm` the tiles collapse to one column and so does the rail (552px at a
600px viewport, i.e. full width) — the stacked rail is never wider than the
content it stacks under, at any breakpoint.

**No test pins this.** The repo asserts no Tailwind classes anywhere, and a test
that did would pin the mechanism rather than the property. The property is a
number, it was measured, and the number is written above.

---

## The demo's asset scenarios are gone

The plan: *"Delete the assets scenarios from the demo picker. `demo.brand.assets.tsx`
goes — the real page exists now. `demo.brand.tsx` stays for the research states."*

| deleted | why |
| --- | --- |
| `routes/demo.brand.assets.tsx` | the real Visual identity page ships |
| scenarios `palette-proposed`, `palette-full`, `logo-blob`, `logo-link-ok`, `logo-link-dead` | each existed to settle a schema or rendering question; all are settled and all are now reachable on a real brand |
| fixtures `PALETTE_PROPOSED`, `LOGO_LINK_OK`, `LOGO_LINK_DEAD`, `logo-wordmark.svg` | nothing left builds them |
| `demoHref` | it carried `?scenario=` across the one hop that existed |
| the `tiles` / `tileHref` override on `/demo/brand` | 2E earned the registry flip, so `Visual identity` behaves like every other tile |

**Eight scenarios remain**, and the test that counts them says why: what is left
is what the real app *cannot* show on demand — the five research states — plus
`rich` and `long-names`, the crowding and truncation tests Stage 3 renders into.
`rich` keeps its twelve colours, its mark, its photos and its files, so the rail
block and the tile count stay in the picture Stage 3 is reviewed against.

The build grep still holds: **zero occurrences of `demo` in the built assets**,
and no fixture string in `dist`.

---

## What the live pass found

Playwright over the real routes, signed in, against `vite dev` and a restarted
server. Six brands seeded through the real API — one per state the plan names —
then deleted. 20 screenshots, both themes at 1600×900/1000, plus 900px and 600px
passes, a reduced-motion pass and a keyboard walk. **No console or page errors in
any of them.**

### It discharged 2E's owed check, and 2D's

- **A file went through the real drop zone in a browser.** 2E fixed the
  four-version-old CORS bug and could not observe the fix, because the running
  dev server had not reread `.env`. Restarted: `logo-mark.svg` uploads, renders,
  and promotes to the brand mark — after which the hub renders the **uploaded**
  mark instead of the monogram. That is 2D's *"only the source of the fill
  changes from derived to declared"*, end to end, from a file picker.
- **The dead link stays quiet on the hub and honest in the library.** A `link`
  logo pointing at a 404 — seeded through the API, because 2D's record-time
  validation makes it unreachable from the form, which is precisely how a real
  link rots — renders the monogram on the hub with no scolding, and `Did not
  render` on the library card. Both halves of 2D's resolution, confirmed against
  a genuinely broken row rather than a fixture.
- **Brand delete swept the asset blobs.** After deleting the six seeded brands:
  `brand_assets` back to 0 rows, `packages/server/.data/blobs` back to **0
  files**. 2A's `listBlobKeysByBrand` widening had never been exercised through
  the cascade with real bytes in it.

### It changed the code twice more

**1. The palette rows were the 900px rail again, at full width.** On a 1600px
screen an editable colour row put a 26-character label in an **810px** field,
with its hex, its status toggle and its delete at the far end. Same defect class
the rail fix went to fix, found on the page 2E shipped.

```
AssetLibraryView.tsx   the palette card gains `max-w-2xl`   → label field 410px
```

The grids below it keep the full measure, and the comment says why: a palette is
a list of short strings, a photo grid is not, and more width is *for* more
columns of images.

**2. An unnamed file input sat in the tab order.** The first keyboard walk any
pass in this plan has run:

```
before   … → Theme toggle → input:(unnamed) → Choose files → …
after    … → Theme toggle → Choose files → …
```

`sr-only` hides a control from the eye and **not** from a screen reader, which is
the wrong half for something a visible button already proxies. `tabIndex={-1}` +
`aria-hidden`, with a test that pins both — and the upload flow was re-run in the
browser afterwards, because a change to the upload control is not shipped on the
strength of the run that preceded it.

### It answered the two questions the plan left open here

- **The rail's `Palette` heading link earns its place.** The plan named the
  alternative (no link; the tile is the only door) and sent it here to be looked
  at. Clicked: it reaches Visual identity, and it is the only affordance on the
  hub that goes from *seeing* your colours to *changing* them without going back
  through the tile grid. Kept.
- **Asset delete still has no confirmation, and this pass leaves it that way.**
  Observed: one click takes a row from 1 to 0 with no dialog in between. The
  reason for leaving it is that a dialog is the *wrong* fix — the row is
  soft-deleted and fully recoverable in the database, so the missing piece is a
  way back (an Undo in the toast, or a `Deleted` filter), not a way to be asked
  twice. Both cost more than 2F should spend and neither is in the plan.
  **Named, not buried** — see Caveats.

### And one thing that is deliberately not identical to 1.7.0

The plan asks for a brand with no assets to be *"byte-identical to 1.7.0"*. The
rail is: no palette block, no empty state, no placeholder. The **tile** is not —
it reads `0 assets` where 1.7.0 rendered a `Soon` badge, because 2E turned it on.
That is the intended change and the count is honest (`Copywriting` reads
`0 threads` on the same brand); it is recorded here so the next reader does not
have to re-derive whether it was a regression.

---

## Verification

```
pnpm typecheck                                 9/9 workspaces
pnpm lint / format:check                       clean
pnpm test                                      659 passed | 29 skipped (688)
DATABASE_URL=… pnpm test                       688 passed |  0 skipped
db:migrate from empty · migrate.mjs from empty · both idempotent
pnpm --filter @brandfactory/web build          ok · grep -c demo dist → 0
```

### Where the −6 went

| file | Δ | what changed |
| --- | --- | --- |
| `demo/fixtures.test.ts` | −7, +1 | the palette-states and logo-states describes go with their scenarios; the surviving dead-link fixture keeps its same-origin assertion. The accessor rules those tests asserted (`logoAsset` refuses a proposed or soft-deleted mark) moved into `@brandfactory/shared`'s own suite in 2A and are **not** lost |
| `demo/demoParams.test.ts` | −1 | `demoHref` has no caller |
| `AssetLibraryView.test.tsx` | +1 | the hidden file input is out of the tab order |

No other test body changed.

---

## Caveats

- **The dev database was written to and cleaned up.** Six `2F …` brands, their
  assets and two uploaded blobs; all deleted through `DELETE /brands/:id`, and
  the state was read back (3 brands, 0 asset rows, 0 blob files). The three
  pre-existing brands were not touched.
- **`.env` is still the 2E one-liner** (`BLOB_PUBLIC_BASE_URL=/blobs`). Reverting
  it re-breaks browser uploads in dev.
- **Split-origin deploys remain untested**, as in 2E. They need the absolute
  `BLOB_PUBLIC_BASE_URL` plus `CORS_ALLOWED_ORIGINS`, and nothing in Stage 2
  exercised that path.
- **Asset delete has no confirmation and no way back.** The recommendation above
  is an Undo, not a dialog. Until one exists, a misclick on a row is a
  disappearance that only an API call can reverse.
- **No `alt` editing.** The column exists (2A, finding 2) and the library renders
  it with a `label` fallback; nothing sets it. Unchanged since 2E.
- **The dnd-kit keyboard sensor is still unexercised.** The walk *reaches* every
  `Reorder …` button; it does not drag one. Reduced motion was screenshotted, not
  audited.
- **Two brands' worth of screenshots, not a design review.** The pass verifies
  that each state renders what it claims; nobody has argued about the result.

**Untouched:** `packages/shared`, `db`, `server`, `agent`, `adapters/*`, the
migration set (still 0004), `miniApps.ts`, `ColorSwatches.tsx`,
`BrandContextRail.tsx` and `routes/brands.$brandId.tsx`.

**Next in the plan:** Stage 3 — brand research — beginning with **3A, the live
spike**, which measures what a real Perplexity report costs before a line of the
adapter is written. 3A is also the plan's named decision point for whether
3B–3G happen at all.
