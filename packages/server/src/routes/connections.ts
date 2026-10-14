import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Deps } from '../app'
import { connections } from '../db/schema'
import { body } from '../http'
import { type BrandEnv } from './shared'

/**
 * The UI's connection keys (`data/connections.ts`), plus the moodboard's sources: Pinterest, the
 * posts DM'd to the moodboard account and the brand's TikTok saves.
 */
export const CONNECTION_KEYS = [
  'ig',
  'tt',
  'fb',
  'drive',
  'lark',
  'web',
  'gbp',
  'res',
  'pinterest',
  'moodboard-dm',
  'moodboard-tt',
] as const

/**
 * A brand's connections. The status is set here by the connect sheet; the real OAuth for Meta,
 * Pinterest and TikTok lives in `packages/connect`, which is not wired to this table yet (see
 * the plan).
 */
export function connectionRoutes(deps: Deps) {
  const { db } = deps
  return new Hono<BrandEnv>()
    .get('/', async (c) =>
      c.json(await db.select().from(connections).where(eq(connections.brandId, c.var.brand.id))),
    )
    .put('/:key', async (c) => {
      const brand = c.var.brand
      const key = z.enum(CONNECTION_KEYS).parse(c.req.param('key'))
      const { status } = await body(c, z.object({ status: z.enum(['connected', 'off']) }))
      const [row] = await db
        .insert(connections)
        .values({ brandId: brand.id, key, status })
        .onConflictDoUpdate({
          target: [connections.brandId, connections.key],
          set: { status, updatedAt: new Date() },
        })
        .returning()
      return c.json(row!)
    })
}
