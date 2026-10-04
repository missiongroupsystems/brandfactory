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
