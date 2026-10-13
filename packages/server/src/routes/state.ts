import { asc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { type Deps } from '../app'
import { comments, connections, crew, ideas, posts, shareLinks, shoots } from '../db/schema'
import { postViews } from '../domain/posts'
import { todayIn } from '../time'
import { inboxOf } from './inbox'
import { kitOf } from './kit'
import { type BrandEnv } from './shared'

/**
 * Everything one brand's screens read, in one answer: the stores load from it on open and on
 * focus. A brand is small (hundreds of rows), so one read beats a request per store.
 */
export function stateRoute(deps: Deps) {
  const { db } = deps
  return new Hono<BrandEnv>().get('/', async (c) => {
    const brand = c.var.brand
    const [postRows, ideaRows, shootRows] = await Promise.all([
      db
        .select()
        .from(posts)
        .where(eq(posts.brandId, brand.id))
        .orderBy(asc(posts.day), asc(posts.time)),
      db
        .select()
        .from(ideas)
        .where(eq(ideas.brandId, brand.id))
        .orderBy(asc(ideas.createdAt), asc(ideas.id)),
      db.select().from(shoots).where(eq(shoots.brandId, brand.id)).orderBy(asc(shoots.day)),
    ])
    const people =
      shootRows.length === 0
        ? []
        : await db
            .select()
            .from(crew)
            .where(
              inArray(
                crew.shootId,
                shootRows.map((s) => s.id),
              ),
            )
            .orderBy(asc(crew.position))
    const [inbox, kit, links, notes, linked] = await Promise.all([
      inboxOf(db, brand.id),
      kitOf(db, brand.id),
      db.select().from(shareLinks).where(eq(shareLinks.brandId, brand.id)),
      db
        .select()
        .from(comments)
        .where(eq(comments.brandId, brand.id))
        .orderBy(asc(comments.createdAt), asc(comments.id)),
      db.select().from(connections).where(eq(connections.brandId, brand.id)),
    ])
    return c.json({
      brand,
      today: todayIn(brand.timezone, deps.now()),
      posts: await postViews(db, postRows),
      ideas: ideaRows,
      shoots: shootRows.map((s) => ({ ...s, crew: people.filter((p) => p.shootId === s.id) })),
      inbox,
      ...kit,
      shareLinks: links,
      comments: notes,
      connections: linked,
    })
  })
}
