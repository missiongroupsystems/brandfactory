import { and, eq } from 'drizzle-orm'
import { type User } from './context'
import { type Conn } from './db/client'
import { brands, members } from './db/schema'
import { notFound } from './errors'

export type Brand = typeof brands.$inferSelect

/**
 * The only access rule: an admin reaches every brand, a member the brands they hold a row for.
 * A brand the caller cannot reach answers 404, the same as one that does not exist, so a guess
 * learns nothing.
 */
export async function requireBrand(db: Conn, user: User, brandId: string): Promise<Brand> {
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId))
  if (!brand) throw notFound('brand not found')
  if (user.role === 'admin') return brand
  const [grant] = await db
    .select()
    .from(members)
    .where(and(eq(members.userId, user.id), eq(members.brandId, brandId)))
  if (!grant) throw notFound('brand not found')
  return brand
}

/** The brands a user reaches, in the switcher's order. */
export async function brandsOf(db: Conn, user: User): Promise<Brand[]> {
  if (user.role === 'admin') return db.select().from(brands).orderBy(brands.position)
  const rows = await db
    .select({ brand: brands })
    .from(members)
    .innerJoin(brands, eq(brands.id, members.brandId))
    .where(eq(members.userId, user.id))
    .orderBy(brands.position)
  return rows.map((r) => r.brand)
}
