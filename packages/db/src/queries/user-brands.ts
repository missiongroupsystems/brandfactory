import type { BrandId, BrandRole, UserId } from '@brandfactory/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../client'
import { brands, userBrands } from '../schema'

export type UserBrand = typeof userBrands.$inferSelect

/**
 * This person's role on this brand, or `null` for no grant.
 *
 * **The read on the authorization path**, so it is one indexed lookup by the
 * `(user_id, brand_id)` unique key rather than a list filtered in memory. An
 * admin never reaches it: `isAdmin` short-circuits first, which is why no row
 * exists for one.
 */
export async function getBrandRoleForUser(
  userId: UserId,
  brandId: BrandId,
): Promise<BrandRole | null> {
  const [row] = await db
    .select({ role: userBrands.role })
    .from(userBrands)
    .where(and(eq(userBrands.userId, userId), eq(userBrands.brandId, brandId)))
  return row?.role ?? null
}

/** Every grant this person holds, for the member screen and for a brand list. */
export async function listBrandGrantsForUser(
  userId: UserId,
): Promise<Array<{ brandId: BrandId; brandName: string; role: BrandRole }>> {
  const rows = await db
    .select({ brandId: userBrands.brandId, brandName: brands.name, role: userBrands.role })
    .from(userBrands)
    .innerJoin(brands, eq(brands.id, userBrands.brandId))
    .where(eq(userBrands.userId, userId))
  return rows.map((r) => ({
    brandId: r.brandId as BrandId,
    brandName: r.brandName,
    role: r.role,
  }))
}

/**
 * Makes this person's grants exactly `wanted`, by **diff** — insert what is
 * new, update what changed role, delete what is gone.
 *
 * ⚠️ **Not delete-all-then-insert**, and Launchpad's note is the reason:
 *
 * > *"`users.update` used to delete every row and re-insert. … a burst of
 * > writes, and a window in which a concurrent read sees them on no team
 * > project at all."*
 *
 * Here the window is smaller and worse-shaped: a concurrent request from the
 * person being edited would be refused access to a brand they keep, because
 * for a moment the grant did not exist. Saving a profile must not log somebody
 * out of a brand.
 *
 * Returns what changed, so the caller can write one audit row per act rather
 * than one per save.
 */
export async function setBrandGrants(
  userId: UserId,
  wanted: ReadonlyArray<{ brandId: BrandId; role: BrandRole }>,
): Promise<{
  granted: Array<{ brandId: BrandId; role: BrandRole }>
  changed: Array<{ brandId: BrandId; from: BrandRole; to: BrandRole }>
  revoked: Array<{ brandId: BrandId; from: BrandRole }>
}> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ brandId: userBrands.brandId, role: userBrands.role })
      .from(userBrands)
      .where(eq(userBrands.userId, userId))

    const have = new Map(existing.map((r) => [r.brandId as BrandId, r.role]))
    const want = new Map(wanted.map((r) => [r.brandId, r.role]))

    const granted: Array<{ brandId: BrandId; role: BrandRole }> = []
    const changed: Array<{ brandId: BrandId; from: BrandRole; to: BrandRole }> = []
    const revoked: Array<{ brandId: BrandId; from: BrandRole }> = []

    for (const [brandId, role] of want) {
      const current = have.get(brandId)
      if (current === undefined) {
        await tx.insert(userBrands).values({ userId, brandId, role })
        granted.push({ brandId, role })
      } else if (current !== role) {
        await tx
          .update(userBrands)
          .set({ role, updatedAt: new Date().toISOString() })
          .where(and(eq(userBrands.userId, userId), eq(userBrands.brandId, brandId)))
        changed.push({ brandId, from: current, to: role })
      }
    }
    for (const [brandId, role] of have) {
      if (want.has(brandId)) continue
      await tx
        .delete(userBrands)
        .where(and(eq(userBrands.userId, userId), eq(userBrands.brandId, brandId)))
      revoked.push({ brandId, from: role })
    }
    return { granted, changed, revoked }
  })
}
