import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { type Brand } from '../authz'
import { type AppEnv } from '../context'
import { conflict, invalid } from '../errors'

export type BrandEnv = { Variables: AppEnv['Variables'] & { brand: Brand } }

export const Channel = z.enum(['ig', 'tt', 'yt', 'li', 'fb'])
export const Format = z.enum(['reel', 'carousel', 'story'])

/**
 * A media item. A `blob:` URL dies on reload and no platform can fetch it, so the server refuses
 * one: a file is uploaded first and named by its media id.
 */
export const MediaItem = z.object({
  src: z
    .string()
    .min(1)
    .max(2048)
    .refine((s) => !s.startsWith('blob:'), 'upload the file first; a blob: URL dies on reload'),
  kind: z.enum(['photo', 'video']),
  mediaId: z.string().max(80).optional(),
  duration: z.string().max(10).optional(),
})

export const IfVersion = z.number().int().positive().optional()

/** The columns every write sets: one more version and a fresh timestamp. */
export const bump = <T extends { version: unknown }>(table: T) => ({
  version: sql`${table.version} + 1`,
  updatedAt: new Date(),
})

/** A lost update is refused with the row as it is now, so the client can start from it. */
export function assertVersion(row: { version: number }, ifVersion: number | undefined) {
  if (ifVersion !== undefined && row.version !== ifVersion) {
    throw conflict('this changed since you opened it', 'STALE', row)
  }
}

/**
 * A create with an id the store already has: the same brand's row is returned (a double click,
 * a second tab), another brand's is refused.
 */
export function assertSameBrand(row: { brandId: string | null }, brandId: string) {
  if (row.brandId !== brandId) throw conflict('this id is taken', 'ID_TAKEN')
}

export function nonEmpty(field: string) {
  return z.string().trim().min(1, `${field} is required`).max(2000)
}

export function requireNonEmpty(value: string, field: string) {
  if (value.trim() === '') throw invalid(`${field} is required`)
}
