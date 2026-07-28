# Brand assets — colours, logos, photos, files

**Status:** proposal, not yet locked. Raised directly out of the 1.7.0 brand-hub
restructure, where the request was *"quickly find related/relevant brand
information (brand colours, logos, assets, images/photos etc etc etc)"* and the
finding was that **none of it exists**.

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

**One `brand_assets` table, discriminated by kind, and the brand's mark is just
an asset with a role.**

```
brand_assets
  id, brand_id → brands(id) ON DELETE CASCADE
  kind      'color' | 'image' | 'file'
  role      'logo' | 'mark' | null      -- what the app is allowed to reach for
  label     text                        -- "Primary", "Wordmark, dark bg"
  value     text null                   -- kind='color': the hex/oklch string
  blob_key  text null                   -- kind='image'|'file'
  mime, filename, width, height         -- as canvas_blocks already models them
  position  integer                     -- sparse, rebalance on collision
```

Three consequences, which are the reason to do it this way:

1. **The profile picture falls out for free.** `BrandMark` (1.7.0) already owns
   the geometry and every call site; an asset with `role: 'logo'` changes only
   the *source* of the fill, from derived to declared. The monogram stays as the
   fallback — most brands will never upload one, and it must keep working.
2. **The per-kind nullable-column shape is already precedented** by
   `canvas_blocks`, including the app-layer validation against a shared
   discriminated union. Copy the pattern rather than inventing a second one.
3. **Colour stops being prose.** A stored swatch is the first brand fact the
   *agent* could read as data rather than as a paragraph — but see non-goals.

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
   now has to take blobs with it, and the cascade is currently pure SQL.
5. **Quota.** `BLOB_MAX_BYTES` bounds one upload, nothing bounds a brand.

## Phases (sketch, not costed)

- **A — shared + db.** `BrandAsset` schema and zod union, migration, query
  helpers, cascade-aware delete. Live-Postgres coverage (needs Docker).
- **B — server.** `GET/POST/PATCH/DELETE /brands/:id/assets`, reusing the
  existing signed-write-URL flow so the server stays out of the byte path.
- **C — colours.** Swatch row in the rail: add, label, reorder, delete, copy hex.
  No upload path, so it lands first and alone.
- **D — logo.** Upload → `role: 'logo'` → `BrandMark` prefers it, monogram
  fallback intact. Includes the signed-read-URL refresh the hub does not do yet.
- **E — the library.** Photos and files, drag-and-drop onto a real surface,
  grid, delete with blob cleanup. Decide question 2 before starting.
- **F — verification, including a live browser pass.** Non-skippable, and it can
  discharge the two passes already owed (1.6.0's switcher check and
  `brand-research-onboarding` Phase G).

## Non-goals

- Extracting a palette from an uploaded logo. Plausible, and a different pass.
- Any vision-model path over brand images.
- Figma / Drive / Dropbox sync. `vision.md:76` — specialist depth is an
  integration, not a native rebuild.
- Versioning assets. Last write wins, as everywhere else in this repo.

## Interaction with work already in flight

`docs/executing/brand-research-onboarding.md` proposes a research job that
returns a cited report plus draft guideline **sections**. If that ships first, a
brand's *visual* research findings still have nowhere structured to land — the
two passes meet at question 3, and whichever lands second inherits it.
