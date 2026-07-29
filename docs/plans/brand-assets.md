# Brand assets — colours, logos, photos, files

**Status:** proposal, not yet locked. Raised directly out of the 1.7.0 brand-hub
restructure, where the request was *"quickly find related/relevant brand
information (brand colours, logos, assets, images/photos etc etc etc)"* and the
finding was that **none of it exists**.

Revised 2026-07-29 on two points that change the table shape: a brand's assets
are **variable in completeness**, not just in count, and an asset's bytes do not
have to be *ours*. Both are recorded in "The load-bearing mechanism" below.

## The gap

Verified against the codebase on 2026-07-28:

| Claim | Evidence |
| --- | --- |
| A brand is six columns | `packages/db/src/schema/brands.ts` — `id, workspace_id, name, description, created_at, updated_at` |
| Guidelines are text only | `guideline_sections` is `label` + a ProseMirror `body` jsonb. No colour, no image, no file |
| Images and files exist only inside a project | `canvas_blocks.blobKey`, scoped to a canvas → project |
| Nothing is brand-scoped | `grep -rn "asset"` over every `src` returns zero hits |
| The blob transport is already built and generic | `BlobStore` port (`put`/`get`/`delete`/`getSignedReadUrl`/`getSignedWriteUrl`), `/blobs` mount, `BLOB_MAX_BYTES` → 413 |
| The web app already refreshes signed read URLs | `api/queries/blobs.ts` — `fetchReadUrl` on a 4-minute `refetchInterval` |

So the **transport is done**; what is missing is the data model. That is the
whole shape of this pass, and it is why the estimate is "a migration and some
UI" rather than "a subsystem".

Meanwhile `SUGGESTED_SECTIONS` ships a *Visual guidelines* section whose example
body is *"Primary palette: neutral-first, one accent… References: [link]"* — a
brand's colours are currently expected to be **typed as prose**. That is the
thing to fix.

## The load-bearing mechanism (proposed)

**One `brand_assets` table on three orthogonal axes — what it is, where it
lives, how settled it is — and the brand's mark is just an asset with a role.**

```
brand_assets
  id, brand_id → brands(id) ON DELETE CASCADE
  kind      'color' | 'image' | 'file'    -- what it is
  source    'inline' | 'blob' | 'link'    -- where the bytes live
  role      'logo' | 'mark' | 'primary' | null  -- what the app may reach for
  status    'proposed' | 'active'         -- default 'active'
  label     text                          -- "Primary", "Wordmark, dark bg"
  value     text null                     -- source='inline': the hex/oklch string
  blob_key  text null                     -- source='blob'
  url       text null                     -- source='link'
  mime, filename, width, height           -- as canvas_blocks already models them
  position  integer                       -- sparse, rebalance on collision
  deleted_at timestamptz null             -- soft-delete, as canvas_blocks
```

Exactly one of `value | blob_key | url` is non-null, enforced by a CHECK
constraint **and** by the shared zod union — the same belt-and-braces the
`canvas_blocks` per-kind columns already get.

### Why kind and source are two columns and not one

The tempting shortcut is a fourth `kind: 'link'`. It is wrong, because **a
Dropbox-hosted logo is still a logo**: it must still carry `role: 'logo'` and
still be the thing `BrandMark` reaches for. Folding storage into `kind` would
force every consumer to handle two kinds for one concept, forever.

Split, they compose. Every asset resolves through **one accessor returning a
URL** — signed-and-refreshed for `blob`, passed through for `link` — and callers
never branch. Making colour's `source: 'inline'` explicit is what buys that: it
stops colour being a special case and makes the exactly-one-of rule total across
all three kinds rather than a rule about two of them.

### Why status exists

`vision.md:28` — some brands arrive fully defined, others start as rough ideas,
and the guidelines layer fills in **gradually**. A colour that has been floated
but not agreed is precisely that state, and it is the common case for the brands
this product is for. A palette is therefore variable in *completeness*, not just
in count: one brand has a full ramp, another has two proposed primaries and
nothing else.

Cardinality itself needs no mechanism — that is just N rows with a `position`.
`status` is the part that would otherwise have no home, and `deleted_at` is the
other half of it: `vision.md:51`, a colour killed in round two hides rather than
vanishes, and can come back.

There is a real tension to name: `vision.md:28` also calls the guidelines layer
the **finalized** output, so a `proposed` asset sitting in it is a slight stretch
of that framing. The alternative — a staging table, or leaving proposals in
project canvases until blessed — costs a second data model and a promotion path
for a distinction one enum column carries. Taken deliberately, not overlooked.

### The consequences that make it worth doing this way

1. **The profile picture falls out for free.** `BrandMark` (1.7.0) already owns
   the geometry and every call site; an asset with `role: 'logo'` changes only
   the *source* of the fill, from derived to declared. The monogram stays as the
   fallback — most brands will never upload one, and it must keep working.
2. **The per-kind nullable-column shape is already precedented** by
   `canvas_blocks`, including the app-layer validation against a shared
   discriminated union. Copy the pattern rather than inventing a second one.
3. **Colour stops being prose.** A stored swatch is the first brand fact the
   *agent* could read as data rather than as a paragraph — but see non-goals.
4. **Bring-your-own-hosting.** A brand whose assets already live in Drive,
   Dropbox, a CDN or a client's brand portal can be recorded here without moving
   a single byte — which is the `vision.md:94` "bring your own stack" principle
   applied to storage rather than to models.

### What a `link` costs, stated up front

Both of these are Phase-D-or-E traps, and are written here so they are not
discovered there:

- **Share links are usually not hot-linkable.** A Google Drive share URL serves
  an HTML viewer page, not image bytes; Dropbox needs `?raw=1`. So a
  link-sourced logo may be **clickable but not renderable inline**. The graceful
  answer costs nothing: on image load failure `BrandMark` falls back to the
  monogram, which 1.7.0 already built and which is already the no-logo path.
- **Links rot, and links leak.** We control neither a 404 nor a URL that turns
  out to be private to whoever pasted it, and a self-hosted privacy-first app
  (`vision.md:86`) starts making requests to third-party hosts. Hence the rule:
  **`link` is first-class for reference; `blob` is expected for anything the app
  renders as the brand's identity.** Encouraged in the UI, not enforced in the
  schema.

## Open questions — decide before building

1. **Does the agent see assets?** `packages/agent` builds its system prompt from
   guidelines. Colours-as-data is genuinely useful there; images are not, until
   there is a vision path. Proposed: **colours yes, images no**, in a later pass.
2. **Where do assets render on the hub?** 1.7.0 deliberately shipped *no* empty
   assets zone. The rail is the natural home for a colour row; a photo grid is
   not rail-shaped and probably belongs on the *Visual identity* mini-app page —
   which is already a `Soon` tile with a stub route and no reason to exist yet.
   **This may be what turns Visual identity on.**
3. **Does `Visual guidelines` (the text section) survive alongside a colour
   swatch list?** Two places to say what the brand's colours are is the failure
   mode this whole product exists to prevent.
4. **Deletion.** 0.9.0 shipped blob cleanup on project delete. A brand cascade
   now has to take blobs with it, and the cascade is currently pure SQL — and it
   must now skip `source: 'link'` rows, which own no bytes to clean up.
5. **Quota.** `BLOB_MAX_BYTES` bounds one upload, nothing bounds a brand.
6. **Do colours need named collections?** "Primary palette" vs "Dark-mode ramp".
   For the three-or-four-colour brand, `role: 'primary'` plus `position` covers
   it; collections only start earning their keep at full ramps. Proposed:
   **leave out of the first cut** — a nullable `collection` column is cheap to
   add later and expensive to unpick if it turns out nobody groups anything.
7. **Does a `proposed` asset reach the agent, or the `BrandMark`?** Consistent
   answer: **no** — proposed is a note to the humans, and an unfinalised colour
   leaking into generated copy is worse than it being absent. Means every
   read path filters on `status`, so decide it before Phase A, not after.
8. **Can a `link` be promoted to a `blob`?** Fetch once, store, flip `source`.
   Obvious and useful, and it is also the thing that quietly turns us into a
   crawler of third-party URLs. Proposed: **not in this pass.**

## Phases (sketch, not costed)

- **A — shared + db.** `BrandAsset` schema and zod union over `kind` × `source`,
  the exactly-one-of CHECK, migration, query helpers (status-filtered by
  default), cascade-aware delete that skips link rows. Live-Postgres coverage
  (needs Docker).
- **B — server.** `GET/POST/PATCH/DELETE /brands/:id/assets`, reusing the
  existing signed-write-URL flow so the server stays out of the byte path. One
  **resolver** returning a URL per asset — signed for `blob`, passed through for
  `link` — so no client ever branches on `source`.
- **C — colours.** Swatch row in the rail: add, label, reorder, delete, copy hex,
  mark proposed. All `source: 'inline'`, so no upload and no link path — it
  lands first and alone, and it is where `status` gets its first UI.
- **D — logo.** `role: 'logo'` by **upload or by link**, `BrandMark` prefers it,
  monogram fallback intact and now doing double duty as the broken-link path.
  Includes the signed-read-URL refresh the hub does not do yet.
- **E — the library.** Photos and files, drag-and-drop onto a real surface,
  paste-a-URL beside it, grid, delete with blob cleanup. Decide question 2
  before starting.
- **F — verification, including a live browser pass.** Non-skippable, and it can
  discharge the two passes already owed (1.6.0's switcher check and
  `brand-research-onboarding` Phase G).

## Non-goals

- Extracting a palette from an uploaded logo. Plausible, and a different pass.
- Any vision-model path over brand images.
- Figma / Drive / Dropbox **sync**. `vision.md:76` — specialist depth is an
  integration, not a native rebuild. Storing a URL to a file in one of them is
  not sync; it is a bookmark with a role, and that is the whole point.
- **Rewriting share URLs** into their hot-linkable forms (`?raw=1` and friends).
  Per-provider guesswork that breaks silently when a provider changes it. Show
  the user that the image did not render and let them paste a direct URL.
- **Link health-checking.** No background crawler proving URLs still resolve.
- **Proxying external bytes** through the server. Links go straight from the
  browser to wherever they live, or they do not render.
- Versioning assets. Last write wins, as everywhere else in this repo.

## Interaction with work already in flight

`docs/executing/brand-research-onboarding.md` proposes a research job that
returns a cited report plus draft guideline **sections**. If that ships first, a
brand's *visual* research findings still have nowhere structured to land — the
two passes meet at question 3, and whichever lands second inherits it.

**Both are now gated on a front-end pass.**
[`brand-hub-fe-mockup.md`](brand-hub-fe-mockup.md) renders this proposal and that
one as one clickable hub over mock data, precisely so questions 2, 3 and 6 are
answered by looking rather than by argument. Its fixtures are typed against the
`BrandAsset` union above, which makes them a review of this schema: a brand state
the fixtures cannot express is a finding to fold back in here. **Phase A should
not be written until that pass records its decisions.**
