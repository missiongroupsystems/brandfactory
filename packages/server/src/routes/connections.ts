import { and, eq, notInArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Deps } from '../app'
import { connections } from '../db/schema'
import { body } from '../http'
import { type BrandEnv } from './shared'

/**
 * The UI's connection keys (`data/connections.ts`), plus the moodboard's sources: the posts DM'd
 * to the moodboard account and the brand's TikTok saves. The accounts with tokens are not here:
 * `ig`, `fb` and `tt` follow the linked accounts (`routes/accounts.ts`), and a brand's Pinterest
 * board is set by `routes/pinterest.ts`, so none is connected without its tokens.
 */
export const CONNECTION_KEYS = [
  'drive',
  'lark',
  'web',
  'gbp',
  'res',
  'moodboard-dm',
  'moodboard-tt',
] as const

/**
 * A brand's connections. The status of the tools without a sign-in yet (Drive, Lark, the website,
 * Google Business Profile, bookings) is set here by the connect sheet.
 */
export function connectionRoutes(deps: Deps) {
  const { db } = deps
  return (
    new Hono<BrandEnv>()
      // Without Instagram, Facebook and TikTok: the state reads those from the linked accounts.
      .get('/', async (c) =>
        c.json(
          await db
            .select()
            .from(connections)
            .where(
              and(
                eq(connections.brandId, c.var.brand.id),
                notInArray(connections.key, ['ig', 'fb', 'tt']),
              ),
            ),
        ),
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
  )
}
