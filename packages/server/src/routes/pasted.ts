import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Deps } from '../app'
import { pastedLinks } from '../db/schema'
import { body, Id } from '../http'
import { assertSameBrand, Format, type BrandEnv } from './shared'

/** A pasted link as the moodboard shows it: where it is from, and the idea it would seed. */
const Reference = z.object({
  platform: z.enum(['ig', 'tt']),
  account: z.string().max(500),
  // A link's picture, if it has one, from an https address only: teammates load it in their app.
  image: z
    .string()
    .max(2048)
    .regex(/^(https:\/\/\S+)?$/, 'an image is an https address'),
  borrow: z.string().max(2000),
  seed: z.object({
    format: Format,
    pillar: z.string().max(200),
    hook: z.string().max(500),
    angle: z.string().max(5000),
    feature: z.string().max(2000),
    shots: z.array(z.unknown()).max(100),
    sharper: z.array(z.unknown()).max(20),
  }),
})

/**
 * `POST /brands/:id/pasted`: a link pasted onto the moodboard. The id is the client's, so a paste
 * sent twice keeps one link; the state lists them, newest first.
 */
export function pastedRoutes(deps: Deps) {
  const { db } = deps
  return new Hono<BrandEnv>().post('/', async (c) => {
    const brand = c.var.brand
    const { id, ...reference } = await body(c, Reference.extend({ id: Id }))
    const [existing] = await db.select().from(pastedLinks).where(eq(pastedLinks.id, id))
    if (existing) {
      assertSameBrand(existing, brand.id)
      return c.json(existing)
    }
    const [row] = await db
      .insert(pastedLinks)
      .values({ id, brandId: brand.id, reference })
      // Two first pastes at once: the second reads the first's row.
      .onConflictDoNothing()
      .returning()
    if (row) return c.json(row, 201)
    const [raced] = await db.select().from(pastedLinks).where(eq(pastedLinks.id, id))
    assertSameBrand(raced!, brand.id)
    return c.json(raced!)
  })
}
