import {
  TLDR_SECTION_KEY,
  type Brand,
  type BrandGuidelineSection,
  type BrandId,
  type BrandSummary,
  type GuidelineSectionCreatedBy,
  type ProseMirrorDoc,
  type SectionId,
  type WorkspaceId,
} from '@brandfactory/shared'
import { and, eq, isNotNull, notInArray, sql } from 'drizzle-orm'
import { DEFAULT_FUNNEL_STAGES, FUNNEL_STAGE_POSITION_STEP } from '@brandfactory/shared'
import { db } from '../client'
import { rowToBrand, rowToBrandSummary, rowToGuidelineSection } from '../mappers'
import {
  brandAssets,
  brands,
  canvasBlocks,
  canvases,
  deckVersions,
  decks,
  funnelStages,
  guidelineSections,
  projects,
} from '../schema'

export async function getBrandById(id: BrandId): Promise<Brand | null> {
  const [row] = await db.select().from(brands).where(eq(brands.id, id))
  return row ? rowToBrand(row) : null
}

export async function listBrandsByWorkspace(workspaceId: WorkspaceId): Promise<Brand[]> {
  const rows = await db.select().from(brands).where(eq(brands.workspaceId, workspaceId))
  return rows.map(rowToBrand)
}

/**
 * The `TL;DR` row of the brand being aggregated, as `{label, body}` or SQL
 * `null` — a filtered aggregate over the `guideline_sections` join the query
 * already has, so it costs no extra scan and no extra round trip.
 *
 * **The `where` clause is a prefilter and the mapper is the authority.** The
 * label rule lives in `normaliseSectionLabel`, which cannot run inside
 * Postgres, so the character strip is restated here — the *label* is not, it
 * arrives as `TLDR_SECTION_KEY`. The two can disagree only in the safe
 * direction: `[:alnum:]` is at worst looser than `\p{L}\p{N}`, so this can
 * return a row the shared rule rejects, and `rowToBrandSummary` re-checks with
 * `sameSectionLabel` before believing it. A missed section is impossible; an
 * over-fetched one is discarded.
 *
 * `jsonb_agg(… order by priority) -> 0` rather than `min`/`limit`: a brand may
 * hold two rows labelled `TL;DR`, and `brandTldrSection` documents that the
 * first by priority is *the* one. This picks the same one, and returning label
 * and body as a single jsonb object keeps that pairing atomic — two scalar
 * aggregates could in principle answer from different rows.
 */
const tldrSectionJson = sql<{ label: string; body: unknown } | null>`
  (jsonb_agg(
     jsonb_build_object('label', ${guidelineSections.label}, 'body', ${guidelineSections.body})
     order by ${guidelineSections.priority}
   ) filter (
     where lower(regexp_replace(${guidelineSections.label}, '[^[:alnum:]]', '', 'g'))
           = ${TLDR_SECTION_KEY}
   )) -> 0
`

// One round-trip brand grid for the workspace home: brand row + section and
// project counts + the TL;DR line. Left joins + `count(distinct …)::int` so
// brands with no sections or projects still appear with zeros (and `::int`
// keeps node-pg from returning bigint counts as strings).
export async function listBrandSummariesByWorkspace(
  workspaceId: WorkspaceId,
): Promise<BrandSummary[]> {
  const rows = await db
    .select({
      id: brands.id,
      workspaceId: brands.workspaceId,
      name: brands.name,
      description: brands.description,
      websiteUrl: brands.websiteUrl,
      createdAt: brands.createdAt,
      updatedAt: brands.updatedAt,
      sectionCount: sql<number>`count(distinct ${guidelineSections.id})::int`.mapWith(Number),
      projectCount: sql<number>`count(distinct ${projects.id})::int`.mapWith(Number),
      tldrSection: tldrSectionJson,
    })
    .from(brands)
    .leftJoin(guidelineSections, eq(guidelineSections.brandId, brands.id))
    .leftJoin(projects, eq(projects.brandId, brands.id))
    .where(eq(brands.workspaceId, workspaceId))
    .groupBy(brands.id)
    .orderBy(brands.createdAt)
  return rows.map(rowToBrandSummary)
}

export async function createBrand(input: {
  workspaceId: WorkspaceId
  name: string
  description?: string | null
  websiteUrl?: string | null
}): Promise<Brand> {
  // **One transaction, brand and funnel together.** A brand that commits without
  // its six stages shows an empty funnel that a reader cannot tell apart from
  // "nobody has set this up yet" — and the second one is a state they would
  // act on. This is the only cross-aggregate write in the four marketing
  // features: Plan 4 reaching into the brand create path, deliberately, because
  // the alternative is a `GET` that writes.
  //
  // The names come from `DEFAULT_FUNNEL_STAGES` in `@brandfactory/shared` and are
  // **not** duplicated into SQL — see that constant for why migration 0010's
  // `CASE` is not the precedent it looks like.
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(brands)
      .values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description ?? null,
        websiteUrl: input.websiteUrl ?? null,
      })
      .returning()
    if (!row) throw new Error('createBrand returned no row')

    await tx.insert(funnelStages).values(
      DEFAULT_FUNNEL_STAGES.map((name, index) => ({
        brandId: row.id as BrandId,
        name,
        position: (index + 1) * FUNNEL_STAGE_POSITION_STEP,
      })),
    )

    return rowToBrand(row)
  })
}

// `undefined` leaves a column alone; `null` clears it. That distinction is the
// whole patch semantics of `UpdateBrandInputSchema` and it has to survive the
// trip down here — a `?? null` on any of these keys would turn "don't touch the
// website" into "delete the website" on every rename.
export async function updateBrand(
  id: BrandId,
  input: { name?: string; description?: string | null; websiteUrl?: string | null },
): Promise<Brand | null> {
  const [row] = await db
    .update(brands)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(brands.id, id))
    .returning()
  return row ? rowToBrand(row) : null
}

// Cascades projects → canvases → blocks / messages via FK onDelete.
// Blobs referenced by those blocks live in object storage, outside the FK
// graph — callers must collect `listBlobKeysByBrand` *before* deleting and
// sweep them, or the bytes are orphaned forever.
export async function deleteBrand(id: BrandId): Promise<Brand | null> {
  const [row] = await db.delete(brands).where(eq(brands.id, id)).returning()
  return row ? rowToBrand(row) : null
}

/**
 * Storage keys held by everything under this brand. Read before the row delete
 * cascades them away — this is the *only* place brand bytes are swept, because
 * a soft-deleted block or asset can come back and destroying its bytes would
 * make "hidden" mean "gone".
 *
 * Three arms, and all three are load-bearing:
 *
 * - **canvas blocks**, via project → canvas. This was the whole query until 2A.
 * - **brand assets**, filtered to `source = 'blob'`. Without this arm every
 *   uploaded logo and photo leaks its bytes on brand delete, silently and
 *   permanently. The `source` filter is not an optimisation: a `link` row's
 *   `url` is somebody else's host, and sweeping it would mean issuing a delete
 *   against a key that is not ours. The column is null for `link` and `inline`
 *   rows anyway — the filter says *why* rather than relying on that.
 * - **deck versions**, via brand → deck, filtered by `isNotNull(pdfBlobKey)` —
 *   **not** by `source`. On `deck_versions` the source does not say where the
 *   bytes are: `deck_versions_source_shape` requires a `'canva'` row to carry
 *   `pdfBlobKey` too, because that is the frozen snapshot the version records
 *   alongside the live Canva link. A `source = 'pdf'` filter would silently
 *   skip every Canva version's PDF, which is exactly the leak this arm exists
 *   to close. `canvaUrl` is never collected here — it is somebody else's host,
 *   same reasoning as the assets arm's `link` rows.
 *
 * Soft-deleted rows are deliberately **included**: the brand is going away, so
 * every byte it ever owned goes with it.
 */
export async function listBlobKeysByBrand(brandId: BrandId): Promise<string[]> {
  const blockRows = await db
    .select({ blobKey: canvasBlocks.blobKey })
    .from(canvasBlocks)
    .innerJoin(canvases, eq(canvases.id, canvasBlocks.canvasId))
    .innerJoin(projects, eq(projects.id, canvases.projectId))
    .where(and(eq(projects.brandId, brandId), isNotNull(canvasBlocks.blobKey)))

  const assetRows = await db
    .select({ blobKey: brandAssets.blobKey })
    .from(brandAssets)
    .where(
      and(
        eq(brandAssets.brandId, brandId),
        eq(brandAssets.source, 'blob'),
        isNotNull(brandAssets.blobKey),
      ),
    )

  const deckVersionRows = await db
    .select({ blobKey: deckVersions.pdfBlobKey })
    .from(deckVersions)
    .innerJoin(decks, eq(decks.id, deckVersions.deckId))
    .where(and(eq(decks.brandId, brandId), isNotNull(deckVersions.pdfBlobKey)))

  return [...blockRows, ...assetRows, ...deckVersionRows]
    .map((r) => r.blobKey)
    .filter((k): k is string => k !== null)
}

export async function listSectionsByBrand(brandId: BrandId): Promise<BrandGuidelineSection[]> {
  const rows = await db
    .select()
    .from(guidelineSections)
    .where(eq(guidelineSections.brandId, brandId))
    .orderBy(guidelineSections.priority)
  return rows.map(rowToGuidelineSection)
}

// Upsert semantics: if `id` is supplied, update that section; otherwise
// insert a new one. No business rules — the caller owns ownership checks
// and priority allocation.
export async function upsertSection(input: {
  id?: SectionId
  brandId: BrandId
  label: string
  body: ProseMirrorDoc
  priority: number
  createdBy: GuidelineSectionCreatedBy
}): Promise<BrandGuidelineSection> {
  if (input.id) {
    const [row] = await db
      .update(guidelineSections)
      .set({
        label: input.label,
        body: input.body,
        priority: input.priority,
        createdBy: input.createdBy,
        updatedAt: sql`now()`,
      })
      .where(and(eq(guidelineSections.id, input.id), eq(guidelineSections.brandId, input.brandId)))
      .returning()
    if (!row) throw new Error(`Section ${input.id} not found in brand ${input.brandId}`)
    return rowToGuidelineSection(row)
  }

  const [row] = await db
    .insert(guidelineSections)
    .values({
      brandId: input.brandId,
      label: input.label,
      body: input.body,
      priority: input.priority,
      createdBy: input.createdBy,
    })
    .returning()
  if (!row) throw new Error('upsertSection insert returned no row')
  return rowToGuidelineSection(row)
}

export async function reorderSections(
  brandId: BrandId,
  updates: Array<{ id: SectionId; priority: number }>,
): Promise<BrandGuidelineSection[]> {
  return db.transaction(async (tx) => {
    for (const { id, priority } of updates) {
      const result = await tx
        .update(guidelineSections)
        .set({ priority, updatedAt: sql`now()` })
        .where(and(eq(guidelineSections.id, id), eq(guidelineSections.brandId, brandId)))
        .returning({ id: guidelineSections.id })
      if (result.length === 0) {
        throw new Error(`Section ${id} not found in brand ${brandId}`)
      }
    }
    const rows = await tx
      .select()
      .from(guidelineSections)
      .where(eq(guidelineSections.brandId, brandId))
      .orderBy(guidelineSections.priority)
    return rows.map(rowToGuidelineSection)
  })
}

// Atomic upsert + reorder for the guidelines PATCH endpoint. Loops the
// inputs inside a single tx so a mid-list failure leaves the brand intact
// instead of half-updated. Returns the final section list ordered by
// priority — same shape as `listSectionsByBrand`.
export interface UpdateBrandGuidelinesSectionInput {
  id?: SectionId
  label: string
  body: ProseMirrorDoc
  priority: number
  createdBy: GuidelineSectionCreatedBy
}

/**
 * Replaces a brand's guideline sections with `sections`, which is the complete
 * desired state — not a partial patch. Rows carrying an `id` are updated in
 * place, rows without one are inserted, and **any row the payload omits is
 * deleted**: removing a section in the editor is only a removal if it survives
 * the round trip. The sole caller is `PATCH /brands/:id/guidelines`, which
 * forwards the editor's full list.
 */
export async function updateBrandGuidelines(
  brandId: BrandId,
  sections: UpdateBrandGuidelinesSectionInput[],
): Promise<BrandGuidelineSection[]> {
  return db.transaction(async (tx) => {
    const keptIds: SectionId[] = []
    for (const section of sections) {
      if (section.id) {
        const [row] = await tx
          .update(guidelineSections)
          .set({
            label: section.label,
            body: section.body,
            priority: section.priority,
            createdBy: section.createdBy,
            updatedAt: sql`now()`,
          })
          .where(and(eq(guidelineSections.id, section.id), eq(guidelineSections.brandId, brandId)))
          .returning({ id: guidelineSections.id })
        if (!row) {
          throw new Error(`Section ${section.id} not found in brand ${brandId}`)
        }
        // `section.id` rather than `row.id`: same value (the update matched on
        // it) and already branded, so no cast.
        keptIds.push(section.id)
      } else {
        const [row] = await tx
          .insert(guidelineSections)
          .values({
            brandId,
            label: section.label,
            body: section.body,
            priority: section.priority,
            createdBy: section.createdBy,
          })
          .returning({ id: guidelineSections.id })
        if (!row) throw new Error('updateBrandGuidelines: insert returned no row')
        keptIds.push(row.id as SectionId) // same idiom as `rowToGuidelineSection`
      }
    }

    // Sections the payload dropped were removed in the editor. Without this the
    // upsert loop above is write-only: the section stays in the table, comes
    // back in the select below, and the editor's own success handler reseeds it
    // straight back into the form. `notInArray` on an empty list is invalid
    // SQL, so an empty payload clears the brand outright.
    await tx
      .delete(guidelineSections)
      .where(
        keptIds.length > 0
          ? and(eq(guidelineSections.brandId, brandId), notInArray(guidelineSections.id, keptIds))
          : eq(guidelineSections.brandId, brandId),
      )

    const rows = await tx
      .select()
      .from(guidelineSections)
      .where(eq(guidelineSections.brandId, brandId))
      .orderBy(guidelineSections.priority)
    return rows.map(rowToGuidelineSection)
  })
}
