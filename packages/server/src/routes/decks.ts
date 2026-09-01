import {
  BrandIdSchema,
  CreateDeckInputSchema,
  CreateDeckVersionInputSchema,
  DeckIdSchema,
  currentVersion,
} from '@brandfactory/shared'
import type { Deck } from '@brandfactory/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { BlobStore } from '@brandfactory/adapter-storage'
import { requireBrandAccess } from '../authz'
import { sweepBlobs } from '../blob-sweep'
import type { AppEnv } from '../context'
import type { Db } from '../db'
import { NotFoundError, UnauthorizedError } from '../errors'

export interface DecksDeps {
  db: Db
  // A deck delete is a *hard* delete, so the version PDFs it destroys — the
  // `'canva'` snapshot included — must be swept here. See the delete handler.
  storage: BlobStore
}

/**
 * Brand decks — a named folder a team hangs versions off. Mounted at
 * `/brands` alongside `createBrandResourcesRouter`.
 *
 * **`current` rides on every deck the wire ever sends.** `currentVersion`
 * (`@brandfactory/shared/deck/ordering`) is the one place "which version is
 * current" is decided; a response that sent `versions` alone would leave
 * every caller re-deriving the same sort to answer the same question, and a
 * client doing that on its own is exactly what 2A's plan ruled out. An empty
 * `versions` array with `current: null` is a deck's ordinary starting state,
 * not an error — `currentVersion([])`'s own contract, carried through here
 * rather than dropped at the boundary.
 *
 * **Four handlers, not five.** There is no `PATCH /decks/:id`: `Deck` carries
 * only `name` beyond what the path and the server already own, and 2A's query
 * layer defines no `updateDeck` to route to. There is no
 * `DELETE /decks/:id/versions/:versionId` either — `deck_versions` is
 * append-only by design, so there is nothing a delete route could point at.
 */
export function createDecksRouter(deps: DecksDeps) {
  const BrandParam = z.object({ id: BrandIdSchema })
  const DeckParam = z.object({ id: BrandIdSchema, deckId: DeckIdSchema })

  async function withVersions(deck: Deck) {
    const versions = await deps.db.listVersionsByDeck(deck.id)
    return { ...deck, versions, current: currentVersion(versions) }
  }

  return new Hono<AppEnv>()
    .get('/:id/decks', zValidator('param', BrandParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      const decks = await deps.db.listDecksByBrand(id)
      const rows = await Promise.all(decks.map(withVersions))
      return c.json(rows)
    })
    .post(
      '/:id/decks',
      zValidator('param', BrandParam),
      zValidator('json', CreateDeckInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        const body = c.req.valid('json')
        const deck = await deps.db.createDeck(id, body.name)
        return c.json(await withVersions(deck), 201)
      },
    )
    .delete('/:id/decks/:deckId', zValidator('param', DeckParam), async (c) => {
      const userId = c.var.userId
      if (!userId) throw new UnauthorizedError()
      const { id, deckId } = c.req.valid('param')
      await requireBrandAccess(userId, id, deps.db)
      // Read the version blob keys first — the cascade (2A's FK) destroys the
      // only pointer to them. This is a *hard* delete, unlike an asset's soft
      // delete, so those bytes never become reachable again through a later
      // brand sweep: they must be swept here or they orphan forever.
      const blobKeys = await deps.db.listBlobKeysByDeck(id, deckId)
      const deck = await deps.db.deleteDeck(id, deckId)
      if (!deck) throw new NotFoundError('deck not found', 'DECK_NOT_FOUND')
      // Asked after the cascade: a key another surviving row still points at is
      // not this deck's to destroy. Blob keys are minted per upload, so this is
      // normally empty — the same subtraction the brand and project deletes make.
      const stillReferenced = await deps.db.listStillReferencedBlobKeys(blobKeys)
      await sweepBlobs(
        deps.storage,
        blobKeys,
        c.var.log,
        { resource: 'deck', id: deckId },
        stillReferenced,
      )
      return c.json(deck)
    })
    .post(
      '/:id/decks/:deckId/versions',
      zValidator('param', DeckParam),
      zValidator('json', CreateDeckVersionInputSchema),
      async (c) => {
        const userId = c.var.userId
        if (!userId) throw new UnauthorizedError()
        const { id, deckId } = c.req.valid('param')
        await requireBrandAccess(userId, id, deps.db)
        // `createDeckVersion` takes no `brandId` — it inserts by `deckId`
        // alone — so ownership is checked here, against the brand's own deck
        // list, before a version can land on a deck from another brand. A
        // deck id that is not in this list 404s rather than reaching the
        // insert at all.
        const decks = await deps.db.listDecksByBrand(id)
        const deck = decks.find((d) => d.id === deckId)
        if (!deck) throw new NotFoundError('deck not found', 'DECK_NOT_FOUND')
        const body = c.req.valid('json')
        await deps.db.createDeckVersion(deckId, body)
        // The full stack back, not just the row created — the new version
        // may or may not be `current` (a backdated `versionDate` would not
        // supersede a newer one), and that is exactly the question this
        // response answers instead of leaving to the caller.
        return c.json(await withVersions(deck), 201)
      },
    )
}
