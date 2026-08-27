import type { BrandId, Deck, DeckId, DeckVersion } from '@brandfactory/shared'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '../client'
import { rowToDeck, rowToDeckVersion } from '../mappers'
import { deckVersions, decks } from '../schema'

/**
 * Every deck a brand holds, in directory order (`name asc, id asc` — the
 * `listResourcesByBrand` idiom). No `position` column to order by; see
 * `decks.ts`.
 */
export async function listDecksByBrand(brandId: BrandId): Promise<Deck[]> {
  const rows = await db
    .select()
    .from(decks)
    .where(eq(decks.brandId, brandId))
    .orderBy(asc(decks.name), asc(decks.id))
  return rows.map(rowToDeck)
}

export async function createDeck(brandId: BrandId, name: string): Promise<Deck> {
  const [row] = await db.insert(decks).values({ brandId, name }).returning()
  if (!row) throw new Error('createDeck returned no row')
  return rowToDeck(row)
}

/**
 * Hard delete. Scoped by brand as well as id, so an id from another brand
 * misses rather than being deleted across the boundary — `deleteResource`'s
 * idiom. The deck's versions go with it, by cascade.
 */
export async function deleteDeck(brandId: BrandId, id: DeckId): Promise<Deck | null> {
  const [row] = await db
    .delete(decks)
    .where(and(eq(decks.id, id), eq(decks.brandId, brandId)))
    .returning()
  return row ? rowToDeck(row) : null
}

/**
 * The insert shape for one new version — deliberately not a single flat
 * object, so a `'pdf'` create cannot be typed with a `canvaUrl` and a
 * `'canva'` create cannot omit the required snapshot. `createBlock`'s
 * `CreateBlockInput` in `queries/canvas.ts` is the same move for the same
 * reason: the discriminated shape belongs on the write path, not only on the
 * read path `DeckVersionSchema` already covers.
 */
export type CreateDeckVersionInput = (
  | { source: 'pdf'; pdfBlobKey: string }
  | { source: 'canva'; canvaUrl: string; pdfBlobKey: string }
) & {
  label: string
  versionDate: string
  author: string
}

/**
 * Adds one version to a deck's stack. **Append-only** — there is no update or
 * delete here, because a new version supersedes the last without erasing it
 * (Phase 2C); which version is "current" is `currentVersion`'s question, not
 * this table's.
 */
export async function createDeckVersion(
  deckId: DeckId,
  input: CreateDeckVersionInput,
): Promise<DeckVersion> {
  const [row] = await db
    .insert(deckVersions)
    .values({
      deckId,
      source: input.source,
      label: input.label,
      versionDate: input.versionDate,
      author: input.author,
      pdfBlobKey: input.pdfBlobKey,
      canvaUrl: input.source === 'canva' ? input.canvaUrl : null,
    })
    .returning()
  if (!row) throw new Error('createDeckVersion returned no row')
  return rowToDeckVersion(row)
}

/**
 * A deck's full stack, newest-typed first — the same ordering
 * `byVersionRecency` computes in `@brandfactory/shared`, expressed in SQL so
 * the common read does not sort in memory. `currentVersion(rows)` still
 * decides which one is "current"; this only orders the list.
 */
export async function listVersionsByDeck(deckId: DeckId): Promise<DeckVersion[]> {
  const rows = await db
    .select()
    .from(deckVersions)
    .where(eq(deckVersions.deckId, deckId))
    .orderBy(desc(deckVersions.versionDate), desc(deckVersions.createdAt))
  return rows.map(rowToDeckVersion)
}
