# Visual identity, and the library behind it

**Status:** proposal, not locked. Raised off a screenshot of Temper's brand hub
on 2026-08-04, where `Visual identity` sits in the Workspace grid between
`Copywriting` and `Social calendar`. Three asks, in the order they were made:

> Visual Identity, which ought to contain logos, fonts etc, should be separated
> from Assets/Collaterals. In fact, perhaps we can add a Photography
> section/page, as well as an Assets/Collaterals one (for things like printable
> menus and so on). And then Visual Identity could become a separate righthand
> side block instead of an "App" because it's arguably the more immutable
> identity of the brand.

The third is the one that carries the other two. Everything below follows from
taking it literally.

**Decided 2026-08-04, before this was written up:** all three asset surfaces are
**libraries**, not tiles — none of them is a thing you *start*. Together they are
one small native Drive, kept deliberately plain, with the seam for connected
external sources (Google Drive, Dropbox) left visible rather than built. See
[One Drive, three shelves](#one-drive-three-shelves).

## What is there today

Verified against the tree on 2026-08-04, at 1.21.2.

| Claim | Evidence |
| --- | --- |
| There is exactly one asset surface | `MINI_APPS` has one `unit: 'asset'` row, `visual` — `components/brand/miniApps.ts:110` |
| It is a tile in the Workspace grid, beside four categories of creative work | `TILE_APPS`, rendered by `BrandHubView` — `BrandHubView.tsx:232` |
| It holds everything: colours, marks, photos, files | `AssetLibraryView` draws four sections off one list — `AssetLibraryView.tsx:106-110` |
| Those four sections are **derived**, not stored | `logos = images.filter(role === 'logo' \|\| 'mark')`, `photos = images.filter(role !== …)`, `files = kind 'file'` |
| The brand's palette renders in the Brand context card | `BrandContextRail.tsx:476-501`, under its own `border-t` |
| A brand asset has three axes and no fourth | `kind` × `source` × `status` — `shared/src/asset/asset.ts:5-24` |
| Nothing else reads an asset's *placement* | `logoAsset` is a `role` lookup; the agent reads no assets at all |
| Font files cannot be uploaded | `ALLOWED_UPLOAD_MIMES` — `shared/src/blob/upload.ts:6-16` — has no `font/*` |

So the split the ask describes is **half-present and unstable**: photography is
already a section on the Visual identity page, and it is defined as *"an image
that is not the logo"*. That definition holds only until a brand uploads a
printable menu as a PNG, which is the exact example in the ask.

## What the ask is actually claiming

Three separate claims, worth naming separately because they have different
costs and different blast radii.

### 1. Visual identity is not a category of creative work

The Workspace grid is headed **Start something**, and four of its five tiles are
things you start: a copywriting thread, a studio canvas, a week of posts, a
freeform split-screen. `Visual identity` is not one of them. It is a place the
brand's facts already live, and 2E had to write a whole `unit` axis onto the
registry precisely because that row is not a collection of threads
(`miniApps.ts:62-88`). The tile has been the odd one out since the day it turned
on, and the registry says so in a comment.

There is a second tell, in the layout. `BrandHubView` comments its grid as
*"four tiles into a column this wide"* and *"a 2×2 block squares up against the
rail"* (`BrandHubView.tsx:228`) — written when there were four. There are five,
and the fifth is this one. **Removing it restores the layout the file already
describes.**

### 2. One library is doing three jobs

A brand's marks, its photography and its printable collateral answer different
questions, change on different clocks, and are looked for at different moments.
The current page stacks all three because the underlying table has no way to
tell them apart — and the derivation it uses instead misfiles at least three
ordinary cases:

| The thing | Where it lands today | Where it belongs |
| --- | --- | --- |
| A printable menu exported as PNG | Photography (an image with no role) | Collateral |
| A `.woff2` of the brand's typeface | Nowhere — the upload is refused | Visual identity |
| A logo lockup delivered as a PDF | Files (`kind: 'file'`) | Visual identity |

None of these is exotic. The first is the ask's own example.

### 3. The immutable half belongs beside the brand's other facts

The right rail already holds one card that answers *what do we know?* — the
brand's written sections. Marks, palette and typefaces answer the same question
in a different medium, and they are the half of the asset library that a brand
*settles* rather than *accumulates*. The palette is already there, as a block
inside the Brand context card with its own hairline. So the shape being asked
for partly exists; it is one block that never got the card it belongs to.

## The load-bearing mechanism

**A fourth orthogonal axis on `brand_assets`: `library`.**

```
library   'identity' | 'photography' | 'collateral'   -- which shelf it is on
```

Read alongside the three that exist:

```
kind      what it is        color | image | file
source    where it lives    inline | blob | link
status    how settled       proposed | active
library   where it is filed identity | photography | collateral   ← new
```

The axes stay independent, which is the property `asset.ts` already argues for
and the reason a Dropbox-hosted logo is still a logo. A brand mark is
`{ kind: 'image', source: 'blob', status: 'active', library: 'identity',
role: 'logo' }`, and every one of those five words is answering a different
question.

### Why a column and not a derivation

The current derivation is a rule about `kind` and `role` that *approximates*
filing. The three rows in §2's table are the cases where it is simply wrong, and
none of them has a fix that stays inside derivation: a PNG menu and a PNG
storefront photo are byte-for-byte the same kind of thing. Filing is a human
judgement about purpose, and the only place a judgement can live is a column.

The column is also what makes **Move to…** possible, and a misfile with no way
back is the failure mode this repo has already paid for once (1.10.0 shipped a
delete with no undo and named it in the changelog).

### Why not another `role` value

`role` means *what the app may reach for* — the thing `BrandMark` resolves, the
thing a future `@font-face` injection would resolve. It is nullable, it is
explicitly non-unique in every value it can take, and most assets have none.
Filing is the opposite on all three counts: every asset is on exactly one shelf,
always. Folding them together would mean `role: 'photo'` competing with
`role: 'logo'` for the same column on an image that is both a photo and the
brand's mark — which is a real combination, and unrepresentable.

### The backfill rule, written once

```ts
// packages/shared/src/asset/library.ts
export function defaultLibraryFor(a: { kind: AssetKind; role: AssetRole }): AssetLibrary {
  if (a.kind === 'color') return 'identity'
  if (a.role === 'logo' || a.role === 'mark') return 'identity'
  return a.kind === 'image' ? 'photography' : 'collateral'
}
```

This function has exactly two callers and they are the two that matter:

1. **The migration's backfill**, mirrored as a `CASE` expression in SQL.
2. **`POST /brands/:id/assets` when the body omits `library`** — so every
   existing client keeps working unchanged, and the wire field is optional
   rather than required.

The mirror is a real hazard and worth stating: the SQL `CASE` and the TypeScript
must agree *at the moment the backfill runs*, after which they are free to
diverge harmlessly. A live-Postgres test that inserts one row of each shape,
runs the SQL rule, and compares against `defaultLibraryFor` is cheap and closes
it.

**No DB-level `DEFAULT`.** A default would be a fourth place the rule lives, and
it would be wrong for two of the three shelves. The column is `NOT NULL` and the
server always supplies it.

### Migration 0010

Ordered so the column is never briefly `NOT NULL` and empty:

```sql
CREATE TYPE "public"."asset_library" AS ENUM('identity', 'photography', 'collateral');
ALTER TABLE "brand_assets" ADD COLUMN "library" "asset_library";
UPDATE "brand_assets" SET "library" = CASE
  WHEN "kind" = 'color'            THEN 'identity'
  WHEN "role" IN ('logo', 'mark')  THEN 'identity'
  WHEN "kind" = 'image'            THEN 'photography'
  ELSE 'collateral'
END::"asset_library";
ALTER TABLE "brand_assets" ALTER COLUMN "library" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "brand_assets_brand_library_position_active_idx"
  ON "brand_assets" ("brand_id", "library", "position")
  WHERE "deleted_at" IS NULL;
```

The `role` branch must precede the `kind` branch, or every mark files as
photography.

Two notes for whoever writes it:

- `drizzle-kit generate` will not produce the `UPDATE`. Hand-author it into the
  generated file — the repo already describes migrations as *"generated +
  hand-authored SQL"* (`architecture.md:130`).
- **`CREATE TYPE` is transaction-safe; `ALTER TYPE … ADD VALUE` is not usable in
  the same transaction that adds it.** The migrator runs the batch inside one
  (`packages/db/scripts/migrate.mjs` → drizzle's node-postgres migrator), so if
  the typeface question below is answered with a new `asset_role` value, that
  value cannot be written by a backfill in the same migration. A brand-new enum
  has no such restriction, which is why `library` is safe here.

## The information architecture that follows

### The registry stops calling it an app

`MiniApp.surface` is `'tile' | 'hidden'` today, where `'hidden'` means *reached
from its own surface elsewhere* and has exactly one member: `context`. That is
not "hidden", it is a surface that lives somewhere else — and there are now two
somewhere-elses. The value becomes the nav group it renders in, and the row
carries its own path:

```ts
surface: 'tile' | 'library' | 'brand'
/** Where a non-tile row lives. `'tile'` rows are `/apps/$id`. */
path?: (brandId: string) => string
```

Three values because there are three destinations, and `surface` is already the
field that answers *where is this presented* — the registry's own comment calls
that the point of keeping classification and display in one list. A row can now
be presented in three places instead of two, and it still cannot be presented
without being classified.

The `/apps/$appId` route's `beforeLoad` already redirects any non-tile row; it
currently hard-codes `/context` as the destination, and would read `path` off
the row instead. That keeps `/brands/:id/apps/visual` working as a redirect to
`/brands/:id/identity` rather than 404-ing bookmarks and the two `visualHref`
call sites.

### The rows, after

| Row | `surface` | `unit` | Where |
| --- | --- | --- | --- |
| `copywriting` | tile | thread | Apps |
| `studio` | tile | canvas | Apps |
| `social` | tile | post | Apps |
| `freeform` | tile | thread | Apps |
| `visual` → *Visual identity* | library | asset | Library → `/brands/$id/identity` |
| `photography` → *Photography* | library | asset | Library → `/brands/$id/photography` |
| `collateral` → *Collateral* | library | asset | Library → `/brands/$id/collateral` |
| `context` | brand | thread | Brand → `/brands/$id/context` |

Four tiles. The 2×2 the grid comment describes.

**Why none of the three is a tile.** The grid says *Start something*, and every
card in it produces something new — a thread, a canvas, a post. You do not start
a photography library any more than you start a visual identity; you file into
it and later go looking. Making Photography a tile would put the odd-one-out
problem back with two of them instead of one.

### The side nav grows a `Library` group

`BrandNavPanel` derives its groups from the registry, so this is a third
`NavGroup` between `Apps` and `Brand`:

```
Overview
Apps        Copywriting · Studio · Social calendar · Open canvas
Library     Visual identity · Photography · Collateral
              └─ (a connected source would be a fourth row here — not built)
Brand       Brand context
```

Singular. It is **one** library with three shelves, not three libraries — which
is the whole framing below, and the reason the group can later grow a fourth row
that is somebody else's drive without the label becoming a lie.

Counts come from the same `useBrandAssets` query already mounted, filtered by
library rather than counting the whole list (`BrandNavPanel.tsx:80-88`).

<a id="one-drive-three-shelves"></a>

### One Drive, three shelves

The three shelves are **one component over one table, filtered three ways**. That
is the simplicity claim, and it is worth stating as a constraint rather than an
outcome: if a shelf ever needs its own component, the shelf is wrong.

```
brand_assets                     one table, one query, one intake path
   └── library                   three values, three headings, three empty states
          identity   marks · palette · typefaces
          photography  one grid
          collateral   files and printable things
```

What makes this a *Drive* rather than three galleries is that it already answers
"where do the bytes live" on an axis of its own. `source` is
`inline | blob | link`, and `link` is explicitly bring-your-own-hosting — a
Dropbox-hosted logo is recorded, rendered and role-assigned exactly like an
uploaded one, because `assetUrl` is the single accessor and no caller branches
(`asset.ts:191-197`, `brand-assets.md:59-70`). The Drive is native and small; it
has always been able to point at somebody else's.

**The seam for connected sources, and what we build of it now: nothing.**
A Google Drive or Dropbox integration would be a fourth `source` value plus a
`connections` table holding the OAuth grant, resolved by the same accessor. That
is a real pass with a real cost — token storage, refresh, revocation, a
`vision.md:86` self-hoster who has neither — and it is not this one. What this
pass owes it is that the model does not have to change shape to accept it, which
is already true.

**What does show, and why it is copy rather than a button.** The intake zone
gains one quiet line under its two existing slots:

```
┌──────────────────────┐  ┌──────────────────────┐
│  Drop images or      │  │  …or paste a URL to  │
│  files here          │  │  something hosted    │
│    [ Choose files ]  │  │  elsewhere  [ Add ]  │
└──────────────────────┘  └──────────────────────┘
  Anything hosted elsewhere can be linked today. Connected sources —
  Google Drive, Dropbox — are a later pass.
```

A sentence, not a `Connect a source` button with a `Soon` pill. This repo has
spent two passes removing affordances that go nowhere — 1.7.0's dead tiles, and
the rule `BrandContextRail` states as *"a link from the one surface that shows
you your colours to a page that says 'later' is worse than no link"*. A line of
copy tells the user the direction of travel and also tells them the thing they
can do **right now**, which is paste a URL. A disabled button tells them only
the first.

The same reasoning applies to the fourth nav row sketched above: it exists
**only** once there is something behind it. It is drawn to show where a
connected source would land, not to be built here.

### The hub's right rail holds two cards

```
┌─ Brand context ─────────────┐
│ 3 written · 4 suggested     │   unchanged, minus the palette
│ TL;DR / Overview            │
│ ──────────────────────────  │
│ Voice & tone / …            │
│ Talk it through             │
│ Research …                  │
└─────────────────────────────┘
┌─ Visual identity ───────────┐   new
│ ▣  Wordmark                 │   the declared mark, or the monogram
│ ▪▪▪▪▪  Palette · 5 colours  │   moved out of the card above
│ Aa  Satoshi · Söhne         │   typefaces, when there are any
│ ──────────────────────────  │
│ Photography · 24            │   two quiet links, the hub's way into
│ Collateral · 6              │   the other two shelves
└─────────────────────────────┘
```

**The palette moves, and that is the point of the exercise.** It is in the Brand
context card because in 1.8.0 there was nowhere else on the hub for it — the
card's own doc comment concedes it is not really a member of the list
(*"the section list above is the meter … a swatch row inside it would be
neither"*, `BrandContextRail.tsx:476`). It has always been a guest under its own
hairline. This gives it a card where it is the main tenant, and lets the Brand
context card go back to one rule with no exception: **written sections and
unwritten suggestions, one list, and that list is the meter.**

Two consequences to check when writing it:

- `BrandContextRail` loses `colors` and `paletteHref`. Only the hub ever passed
  them (`brands.$brandId.context.tsx:126` passes neither), so the context page
  is untouched.
- The card renders **nothing at all** for a brand with no mark, no colours and
  no typefaces, on the same `undefined` ≠ `[]` rule the palette block already
  follows. A brand with an empty identity is a legitimate brand
  (`vision.md:28`), and an empty card telling it so is the scolding 1.7.0 spent
  a pass removing.

## The three shelves

One component, parameterised by library — not three files, and per the
constraint above, not ever. `AssetLibraryView` already takes a list and sections
it; what changes is that the sectioning is chosen by the library rather than
hard-coded, and the intake zone stamps the library onto whatever it creates.

The header, the intake zone (both slots plus the connected-sources line), the
`Uploaded`/`Linked` pill, delete-with-Undo and Move to… are **identical on all
three**. Only the section list below the intake differs.

**Visual identity** — `/brands/$brandId/identity`

- **Marks** — the existing role-toggling grid, unchanged.
- **Palette** — the existing swatch rows, drag-reorder, proposed/settled,
  unchanged.
- **Typefaces** — new, and deliberately thin: a labelled list of font files or
  links, with a usage note ("Satoshi — headings"). No specimen rendering, no
  `@font-face`, no live preview. See the caveat below.
- **Identity files** — brand-guideline PDFs, logo lockup archives.

**Photography** — `/brands/$brandId/photography`

One grid and the intake zone. The `AssetGrid` that exists, at full page width,
with the empty state saying what belongs here. No new mechanism whatsoever —
this page is a filter and a heading.

**Collateral** — `/brands/$brandId/collateral`

The file list that exists, plus an image grid for collateral that happens to be
an image (the PNG menu). Both are already-written renderers.

Per the ask, Photography and Collateral ship as **real but sparse**: they hold
what gets filed there, and nothing is invented for them. The work in this pass
is the shelf, not the contents.

### Fonts, stated honestly

A `.woff2` cannot be uploaded today: `ALLOWED_UPLOAD_MIMES` has no `font/*`
entries, so the signed write URL is refused before any of this is reached. Two
small, contained changes make the Typefaces section real:

1. Add `font/woff2`, `font/woff`, `font/otf`, `font/ttf` to
   `ALLOWED_UPLOAD_MIMES`.
2. Leave `CONTENT_TYPE_BY_EXTENSION` **alone**. That map exists to name types a
   browser may render *inline* from user bytes (`content-type.ts:43`), and a
   font is not one — it is a download, exactly as `text/plain` and the Word
   types already are. Serving it as `application/octet-stream` is correct.

Rendering a specimen in the brand's own typeface would need the bytes served
with a real font content-type and an injected `@font-face`, on an origin whose
CSP allows it. That is a genuinely separate pass and it is a non-goal here.

## What does not change

Worth listing, because the blast radius reads larger than it is:

- `BrandMark`, `logoAsset`, and the monogram fallback. The mark is a `role`, and
  `role` is untouched.
- The blob transport, signed-URL refresh, soft-delete, and Undo.
- Research, auto-fill, and the `Visual guidelines` prose section — which keeps
  its job of holding the *rationale* the swatches cannot ("the tiled floor, the
  awning at dusk"), settled in 2E and still right.
- The agent, which reads no assets today. Question 1 of
  [`brand-assets.md`](brand-assets.md) stays open and stays out of this pass.
- Every existing asset row's `kind`, `source`, `status`, `role` and `position`.

## Phases

- **A — shared.** `AssetLibrarySchema`, the `library` field on the row, create
  and patch schemas, `defaultLibraryFor`, `assetsOfLibrary`. Unit tests on the
  derivation rule, including the role-before-kind ordering.
- **B — db.** Schema column, migration 0010 with the hand-authored backfill, the
  new index, `library` through `CreateAssetInput` and `UpdateAssetPatch`.
  Live-Postgres test asserting the SQL `CASE` and `defaultLibraryFor` agree on
  one row of every shape.
- **C — server.** `library` accepted on create (defaulted when absent) and on
  patch — patch is what makes **Move to…** work. Scope the `POSITION_STEP`
  append to `(library, kind)` rather than `kind`; cosmetic rather than a
  correctness fix, but it stops a new photo taking a number from the collateral
  shelf.
- **D — registry and routes.** `surface: 'tile' | 'library' | 'brand'` + `path`,
  the two new rows, three routes, the `/apps/visual` redirect, the `Library` nav
  group and its per-library counts.
- **E — the rail card.** `VisualIdentityCard`; palette out of `BrandContextRail`
  and into it; the hub's right column becomes two cards; the grid becomes 2×2.
  This is the phase the ask is actually about, and it is deliberately last of the
  UI phases so it lands on a model that already supports it.
- **F — the shelves.** `AssetLibraryView` parameterised by library, three
  headings, three empty states, Move to…, font MIMEs, and the one-line
  connected-sources note in the intake zone.
- **G — a live browser pass.** Non-skippable. 1.21.0–1.21.2 each shipped with a
  standing *"not seen in a browser"* caveat and this pass moves a card, a grid
  and three routes; it is the wrong one to make it four in a row.

## Non-goals

- Rendering type specimens or injecting `@font-face` from an uploaded font.
- **Connected external sources.** No `connections` table, no OAuth grant, no
  token refresh, no fourth `source` value, no Google Drive or Dropbox client.
  The plan states where they would attach and stops there; a self-hoster with no
  third-party account must lose nothing by their absence
  (`vision.md:86`). Linking a URL by hand already covers the 80% case today.
- **Sync**, in any direction, with anything. `brand-assets.md` settled this and
  it does not reopen: *"storing a URL to a file in one of them is not sync; it is
  a bookmark with a role, and that is the whole point."* A future connected
  source is a nicer way to pick the bookmark, not a mirror of a folder.
- A fourth shelf, or user-defined shelves. Three are the ask; a nullable
  `collection` inside a library stays as cheap to add later as
  `brand-assets.md` question 6 says it is.
- Moving `Visual guidelines` (the prose section) out of Brand context. It is a
  guideline section and belongs with the guideline sections.
- Extracting a palette from an uploaded logo, vision-model paths, Figma/Drive
  sync, link health-checking — all still non-goals of
  [`brand-assets.md`](brand-assets.md), all still non-goals here.
- Bulk re-filing UI. Move to… is one row at a time.
- Any change to how the agent consumes brand context.

---

## Settled before the questions

**Libraries, not tiles — all three.** Asked and answered on 2026-08-04: none of
the three is a thing you start, so none belongs in *Start something*. Recorded
here rather than left as a question because two later decisions lean on it (the
`Library` nav group, and the Visual identity card being the hub's only entrance
to the shelves).

The one cost, stated plainly: **discoverability**. A tile is on screen the moment
you open a brand; a shelf is one click, from the nav group that is on every page
of the brand or from the rail card's footer. If the live pass finds that too
quiet, promoting one shelf to a tile is a one-word registry change — which is
the property that makes this safe to decide now.

**`Library` in the UI; "our own Drive" as the framing in comments and docs.**
Also settled 2026-08-04, after weighing `Drive` on its merits — it is the
mental model that explains why three shelves are one thing, and it is the word
that would make a future `Google Drive` row obvious. Three things decided it the
other way:

1. **Colours are not files.** The first shelf holds `source: 'inline'` swatches —
   a hex string in a row, no bytes anywhere — and a typeface entry may be a usage
   note with nothing attached. A surface called Drive promises a place bytes
   live, and the very first thing on it has none. *Library* carries mixed media
   without promising storage.
2. **The codebase already says library.** `AssetLibraryView` is the component;
   `BrandContextRail` explains the palette split as *"the rail shows the palette;
   the library owns it"*. Choosing `Drive` means renaming that component or
   shipping a UI whose vocabulary disagrees with its source.
3. **Drive imports expectations we deliberately refuse** — folders, nesting,
   rename, arbitrary move, search, and above all sync, which is a permanent
   non-goal. Three fixed shelves and no hierarchy is the design; the name should
   not invite every one of those questions on day one.

**What would reverse it:** if a connected source is ever meant to *replace*
uploading rather than supplement it — external storage primary, ours the
fallback — then `Drive` is the right vocabulary and it should be set before
anything ships on top of it. On this plan it supplements.

## Open questions, with recommendations

**1. What is the third shelf called?**
`Collateral` (proposed), `Assets & collateral`, or `Files`. "Assets" is the word
the schema uses for *all four thousand rows in the table*, so a shelf named
Assets means something narrower than the same word one layer down — a
vocabulary collision the repo would then have to keep explaining.
**Recommendation: `Collateral`.** Singular, unambiguous, and it names the job
(menus, one-pagers, decks, templates). The nav row's description carries the
examples.

**2. Do typefaces need a `role`, or is the identity library enough?**
A font file in the identity library is distinguishable from a brand-guidelines
PDF only by mime-sniffing today. Adding `'typeface'` to `AssetRoleSchema` makes
it explicit and is the value a future `@font-face` injection would resolve —
which is precisely what `role` means.
**Recommendation: add it, in the same pass but a separate migration.** The enum
value cannot be *used* in the transaction that adds it (see 0010's note), so it
wants its own file; and retrofitting a role onto rows a user has already
uploaded is worse than adding it now while the shelf is being built.

**3. Should the palette really leave the Brand context card?**
It is the most visible change in the proposal and the one a user might not have
asked for. Against: it is where people have learned to find it since 1.8.0. For:
the card's own doc comment already concedes it is not a member of the list, and
leaving it behind means the new card opens with "everything the brand looks
like, except the colours".
**Recommendation: move it.** Both cards are in the same column, ~200px apart,
and the move is what buys the Brand context card back its one clean rule.

**4. Does the social post editor's image picker follow the split?**
`PostEditorDialog` offers `assetsOfKind(assets, 'image')` — after this it would
be photography *and* identity marks *and* image collateral, undifferentiated.
**Recommendation: leave it unfiltered in this pass, grouped by library later.**
A post legitimately wants the logo sometimes; filtering to photography would
remove a real choice to fix a cosmetic one. Worth a line in the completion note
so it is a deferral rather than an oversight.

**5. Does `Visual guidelines` (prose) need renaming now that `Visual identity`
is a card two inches away?**
The two names are close enough to read as the same thing, and they are not: one
is rationale, one is artefacts. `Art direction` would separate them cleanly.
**Recommendation: not in this pass.** It is a canonical label in
`SUGGESTED_SECTIONS`, it appears in user data as a section label on existing
brands, and `sameSectionLabel` would treat the renamed one as a different
section — so it is a data migration wearing a copy change. Raise it separately.

**6. What happens to `/brands/:id/apps/visual`?**
**Recommendation: redirect, permanently, via the registry's `path`.** The route
has been live since 1.10.0, `paletteHref` points at it from the rail, and the
redirect is three lines in a `beforeLoad` that already redirects non-tile rows.

**7. Does `unit: 'asset'` stay one word for three shelves?**
The tile and nav count pluralise from `unit`, so all three would read
"24 assets". `'photo'` and `'file'` would read better.
**Recommendation: keep `'asset'` for now.** The nav row is the only survivor
that shows a count (the tiles pass `null`), and three units for one storage
concept is vocabulary the registry does not need yet. Revisit if the counts move
back onto anything tile-shaped.
