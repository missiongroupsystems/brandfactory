import type {
  BrandId,
  CreateFunnelActivityInput,
  CreateFunnelStageInput,
  CreatePlatformInput,
  FunnelActivity,
  FunnelActivityId,
  FunnelStage,
  FunnelStageId,
  FunnelStageWithDetail,
  Platform,
  PlatformId,
  UpdateFunnelActivityInput,
  UpdateFunnelStageInput,
} from '@brandfactory/shared'
import { FUNNEL_STAGE_POSITION_STEP } from '@brandfactory/shared'
import { and, asc, eq, inArray, max } from 'drizzle-orm'
import { db } from '../client'
import { rowToFunnelActivity, rowToFunnelStage, rowToPlatform } from '../mappers'
import { funnelActivities, funnelStages, platforms, stagePlatforms } from '../schema'

/**
 * A brand's whole funnel: every stage in journey order, each with the platforms
 * serving it and the activities running there.
 *
 * **Exhaustive, no cursor.** Six stages and a handful of activities each; the
 * screen is one view of all of it, which is what the request asks for.
 */
export async function listFunnelByBrand(brandId: BrandId): Promise<FunnelStageWithDetail[]> {
  const stageRows = await db
    .select()
    .from(funnelStages)
    .where(eq(funnelStages.brandId, brandId))
    .orderBy(asc(funnelStages.position), asc(funnelStages.id))
  if (stageRows.length === 0) return []

  const stageIds = stageRows.map((row) => row.id)

  // Scoped to this brand's stages rather than selecting the table — the same
  // mistake `listDecksByBrand` had to fix: an unfiltered read answers a question
  // about one brand by scanning every other brand's rows forever.
  const links = await db
    .select()
    .from(stagePlatforms)
    .where(inArray(stagePlatforms.stageId, stageIds))
  const platformRows = await db
    .select()
    .from(platforms)
    .where(eq(platforms.brandId, brandId))
    .orderBy(asc(platforms.name), asc(platforms.id))
  const activityRows = await db
    .select()
    .from(funnelActivities)
    .where(inArray(funnelActivities.stageId, stageIds))
    .orderBy(asc(funnelActivities.title), asc(funnelActivities.id))

  const platformById = new Map(platformRows.map((row) => [row.id, rowToPlatform(row)]))

  return stageRows.map((row) => ({
    ...rowToFunnelStage(row),
    platforms: links
      .filter((link) => link.stageId === row.id)
      .map((link) => platformById.get(link.platformId))
      .filter((platform): platform is Platform => platform !== undefined),
    activities: activityRows
      .filter((activity) => activity.stageId === row.id)
      .map(rowToFunnelActivity),
  }))
}

/** Every platform a brand has named, whether or not any stage uses it yet. */
export async function listPlatformsByBrand(brandId: BrandId): Promise<Platform[]> {
  const rows = await db
    .select()
    .from(platforms)
    .where(eq(platforms.brandId, brandId))
    .orderBy(asc(platforms.name), asc(platforms.id))
  return rows.map(rowToPlatform)
}

export async function createFunnelStage(
  brandId: BrandId,
  input: CreateFunnelStageInput,
): Promise<FunnelStage> {
  // From the current maximum, never from a count: a count is wrong the moment
  // anything has been deleted and would collide two stages onto one slot.
  const [{ value: highest } = { value: null }] = await db
    .select({ value: max(funnelStages.position) })
    .from(funnelStages)
    .where(eq(funnelStages.brandId, brandId))
  const [row] = await db
    .insert(funnelStages)
    .values({
      brandId,
      name: input.name,
      position: (highest ?? 0) + FUNNEL_STAGE_POSITION_STEP,
    })
    .returning()
  return rowToFunnelStage(row!)
}

export async function updateFunnelStage(
  brandId: BrandId,
  stageId: FunnelStageId,
  input: UpdateFunnelStageInput,
): Promise<FunnelStage | null> {
  const [row] = await db
    .update(funnelStages)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(funnelStages.id, stageId), eq(funnelStages.brandId, brandId)))
    .returning()
  return row ? rowToFunnelStage(row) : null
}

/** Deleting a stage takes its activities and its platform links, not the platforms. */
export async function deleteFunnelStage(
  brandId: BrandId,
  stageId: FunnelStageId,
): Promise<FunnelStage | null> {
  const [row] = await db
    .delete(funnelStages)
    .where(and(eq(funnelStages.id, stageId), eq(funnelStages.brandId, brandId)))
    .returning()
  return row ? rowToFunnelStage(row) : null
}

export async function createPlatform(
  brandId: BrandId,
  input: CreatePlatformInput,
): Promise<Platform> {
  const [row] = await db
    .insert(platforms)
    .values({ brandId, name: input.name, url: input.url ?? null })
    .returning()
  return rowToPlatform(row!)
}

export async function deletePlatform(
  brandId: BrandId,
  platformId: PlatformId,
): Promise<Platform | null> {
  const [row] = await db
    .delete(platforms)
    .where(and(eq(platforms.id, platformId), eq(platforms.brandId, brandId)))
    .returning()
  return row ? rowToPlatform(row) : null
}

/**
 * Attach a platform to a stage. Idempotent by the primary key — the pair *is*
 * the row, so a second attach is a no-op rather than a duplicate.
 */
export async function attachPlatformToStage(
  stageId: FunnelStageId,
  platformId: PlatformId,
): Promise<void> {
  await db.insert(stagePlatforms).values({ stageId, platformId }).onConflictDoNothing()
}

export async function detachPlatformFromStage(
  stageId: FunnelStageId,
  platformId: PlatformId,
): Promise<void> {
  await db
    .delete(stagePlatforms)
    .where(and(eq(stagePlatforms.stageId, stageId), eq(stagePlatforms.platformId, platformId)))
}

export async function createFunnelActivity(
  stageId: FunnelStageId,
  input: CreateFunnelActivityInput,
): Promise<FunnelActivity> {
  const [row] = await db
    .insert(funnelActivities)
    .values({
      stageId,
      title: input.title,
      status: input.status,
      platformId: input.platformId ?? null,
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
      note: input.note ?? null,
    })
    .returning()
  return rowToFunnelActivity(row!)
}

export async function updateFunnelActivity(
  stageId: FunnelStageId,
  activityId: FunnelActivityId,
  input: UpdateFunnelActivityInput,
): Promise<FunnelActivity | null> {
  const [row] = await db
    .update(funnelActivities)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      // Nullable keys: absent leaves the column alone, `null` clears it.
      ...(input.platformId !== undefined ? { platformId: input.platformId ?? null } : {}),
      ...(input.startsOn !== undefined ? { startsOn: input.startsOn ?? null } : {}),
      ...(input.endsOn !== undefined ? { endsOn: input.endsOn ?? null } : {}),
      ...(input.note !== undefined ? { note: input.note ?? null } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(funnelActivities.id, activityId), eq(funnelActivities.stageId, stageId)))
    .returning()
  return row ? rowToFunnelActivity(row) : null
}

export async function deleteFunnelActivity(
  stageId: FunnelStageId,
  activityId: FunnelActivityId,
): Promise<FunnelActivity | null> {
  const [row] = await db
    .delete(funnelActivities)
    .where(and(eq(funnelActivities.id, activityId), eq(funnelActivities.stageId, stageId)))
    .returning()
  return row ? rowToFunnelActivity(row) : null
}
