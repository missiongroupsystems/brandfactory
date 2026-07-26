import type {
  Brand,
  BrandGuidelineSection,
  BrandId,
  BrandSummary,
  GuidelineSectionCreatedBy,
  ProseMirrorDoc,
  SectionId,
  WorkspaceId,
} from '@brandfactory/shared'
import { and, eq, isNotNull, notInArray, sql } from 'drizzle-orm'
import { db } from '../client'
import { rowToBrand, rowToBrandSummary, rowToGuidelineSection } from '../mappers'
import { brands, canvasBlocks, canvases, guidelineSections, projects } from '../schema'

export async function getBrandById(id: BrandId): Promise<Brand | null> {
  const [row] = await db.select().from(brands).where(eq(brands.id, id))
  return row ? rowToBrand(row) : null
}

export async function listBrandsByWorkspace(workspaceId: WorkspaceId): Promise<Brand[]> {
  const rows = await db.select().from(brands).where(eq(brands.workspaceId, workspaceId))
  return rows.map(rowToBrand)
}

// One round-trip brand grid for the workspace home: brand row + section and
// project counts. Left joins + `count(distinct …)::int` so brands with no
// sections or projects still appear with zeros (and `::int` keeps node-pg
// from returning bigint counts as strings).
export async function listBrandSummariesByWorkspace(
  workspaceId: WorkspaceId,
): Promise<BrandSummary[]> {
  const rows = await db
    .select({
      id: brands.id,
      workspaceId: brands.workspaceId,
      name: brands.name,
      description: brands.description,
      createdAt: brands.createdAt,
      updatedAt: brands.updatedAt,
      sectionCount: sql<number>`count(distinct ${guidelineSections.id})::int`.mapWith(Number),
      projectCount: sql<number>`count(distinct ${projects.id})::int`.mapWith(Number),
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
}): Promise<Brand> {
  const [row] = await db
    .insert(brands)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description ?? null,
    })
    .returning()
  if (!row) throw new Error('createBrand returned no row')
  return rowToBrand(row)
}

export async function updateBrand(
  id: BrandId,
  input: { name?: string; description?: string | null },
): Promise<Brand | null> {
  const [row] = await db
    .update(brands)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
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

// Storage keys held by every block on every canvas under this brand. Read
// before the row delete cascades them away.
export async function listBlobKeysByBrand(brandId: BrandId): Promise<string[]> {
  const rows = await db
    .select({ blobKey: canvasBlocks.blobKey })
    .from(canvasBlocks)
    .innerJoin(canvases, eq(canvases.id, canvasBlocks.canvasId))
    .innerJoin(projects, eq(projects.id, canvases.projectId))
    .where(and(eq(projects.brandId, brandId), isNotNull(canvasBlocks.blobKey)))
  return rows.map((r) => r.blobKey).filter((k): k is string => k !== null)
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
