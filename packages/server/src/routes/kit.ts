import { and, desc, eq, max } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Deps } from '../app'
import { type Conn } from '../db/client'
import { brandFiles, brandKits, media, voiceVersions } from '../db/schema'
import { invalid, notFound } from '../errors'
import { body, Id } from '../http'
import { assertSameBrand, assertVersion, bump, IfVersion, type BrandEnv } from './shared'

const Voice = z.object({
  summary: z.string().max(2000),
  words: z.array(z.object({ use: z.string().max(200), avoid: z.string().max(200) })).max(50),
  examples: z.array(z.string().max(1000)).max(50),
})
type Voice = z.infer<typeof Voice>

/** A blank summary keeps the old one, a pair needs both words, a blank line goes (`voiceEdited`). */
export function voiceEdited(old: Voice, draft: Voice): Voice {
  return {
    summary: draft.summary.trim() || old.summary,
    words: draft.words
      .map((w) => ({ use: w.use.trim(), avoid: w.avoid.trim() }))
      .filter((w) => w.use && w.avoid),
    examples: draft.examples.map((l) => l.trim()).filter(Boolean),
  }
}

/** "#d9572b", "d9572b" or "#d52" as "#D9572B"; anything else is null (`hexOf`). */
export function hexOf(input: string): string | null {
  const h = input.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(h)) return `#${[...h].map((c) => c + c).join('')}`.toUpperCase()
  if (/^[0-9a-f]{6}$/i.test(h)) return `#${h}`.toUpperCase()
  return null
}

const KIND_BY_EXT: Record<string, 'pdf' | 'deck' | 'doc' | 'sheet' | 'image'> = {
  pdf: 'pdf',
  ppt: 'deck',
  pptx: 'deck',
  key: 'deck',
  doc: 'doc',
  docx: 'doc',
  txt: 'doc',
  md: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  svg: 'image',
}
const kindOf = (name: string) => KIND_BY_EXT[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'doc'

/** "CV_brand-deck_2025.pdf" → "CV brand deck 2025" (`plainTitle`). */
export function plainTitle(name: string): string {
  const words = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name
}

async function loadKit(db: Conn, brandId: string) {
  // Locked, so two publishes number their versions one after the other.
  const [kit] = await db
    .select()
    .from(brandKits)
    .where(eq(brandKits.brandId, brandId))
    .for('update')
  if (!kit) throw notFound('this brand has no kit yet')
  return kit
}

async function assertMedia(db: Conn, brandId: string, mediaId: string | undefined) {
  if (!mediaId) return
  const [row] = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.brandId, brandId)))
  if (!row) throw invalid('the file is not in this brand', 'BAD_MEDIA')
}

export async function kitOf(db: Conn, brandId: string) {
  const [kit] = await db.select().from(brandKits).where(eq(brandKits.brandId, brandId))
  const [files, versions] = await Promise.all([
    db
      .select()
      .from(brandFiles)
      .where(eq(brandFiles.brandId, brandId))
      .orderBy(desc(brandFiles.updatedAt)),
    db
      .select()
      .from(voiceVersions)
      .where(eq(voiceVersions.brandId, brandId))
      .orderBy(desc(voiceVersions.n)),
  ])
  return { kit: kit ?? null, files, versions }
}

export function kitRoutes(deps: Deps) {
  const { db } = deps

  /**
   * Makes a voice the brand's, as a new version numbered in the same transaction, on top of the
   * kit as it is now (`publishVoice`). `UNIQUE(brand, n)` refuses a second publish racing for
   * the same number instead of keeping both.
   */
  const publish = (brandId: string, by: string, draft: Voice, note: string) =>
    db.transaction(async (tx) => {
      const kit = await loadKit(tx, brandId)
      const voice = voiceEdited(kit.voice as Voice, draft)
      const [{ n }] = (await tx
        .select({ n: max(voiceVersions.n) })
        .from(voiceVersions)
        .where(eq(voiceVersions.brandId, brandId))) as [{ n: number | null }]
      const [version] = await tx
        .insert(voiceVersions)
        .values({ brandId, n: (n ?? 0) + 1, by, note: note.trim(), voice })
        .returning()
      const [next] = await tx
        .update(brandKits)
        .set({ voice, ...bump(brandKits) })
        .where(eq(brandKits.brandId, brandId))
        .returning()
      return { kit: next!, version: version! }
    })

  return (
    new Hono<BrandEnv>()
      .get('/', async (c) => c.json(await kitOf(db, c.var.brand.id)))

      .put('/voice', async (c) => {
        const input = await body(
          c,
          z.object({ voice: Voice, note: z.string().max(500).default('') }),
        )
        const user = c.var.user
        return c.json(
          await publish(c.var.brand.id, user.name || user.email, input.voice, input.note),
          201,
        )
      })

      /** Bring back: an old voice published as a new version, never a rewind. */
      .post('/voice/restore', async (c) => {
        const { n } = await body(c, z.object({ n: z.number().int().positive() }))
        const brand = c.var.brand
        const [old] = await db
          .select()
          .from(voiceVersions)
          .where(and(eq(voiceVersions.brandId, brand.id), eq(voiceVersions.n, n)))
        if (!old) throw notFound('version not found')
        const user = c.var.user
        return c.json(
          await publish(
            brand.id,
            user.name || user.email,
            old.voice as Voice,
            `Brought back v${n}`,
          ),
          201,
        )
      })

      /** A colour that is not a hex is never saved; a blank name is "Untitled". */
      .put('/colours', async (c) => {
        const input = await body(
          c,
          z.object({
            colours: z
              .array(z.object({ name: z.string().max(100), hex: z.string().max(20) }))
              .max(30),
            ifVersion: IfVersion,
          }),
        )
        const colours = input.colours.map((col) => {
          const hex = hexOf(col.hex)
          if (!hex) throw invalid(`${col.hex} is not a colour`, 'BAD_HEX')
          return { name: col.name.trim() || 'Untitled', hex }
        })
        const next = await db.transaction(async (tx) => {
          const kit = await loadKit(tx, c.var.brand.id)
          assertVersion(kit, input.ifVersion)
          const [row] = await tx
            .update(brandKits)
            .set({ colours, ...bump(brandKits) })
            .where(eq(brandKits.brandId, kit.brandId))
            .returning()
          return row!
        })
        return c.json(next)
      })

      .put('/logo', async (c) => {
        const input = await body(
          c,
          z.object({ src: z.string().min(1).max(2048), name: z.string().max(300).nullable() }),
        )
        if (input.src.startsWith('blob:')) throw invalid('upload the logo first')
        const kit = await loadKit(db, c.var.brand.id)
        const [next] = await db
          .update(brandKits)
          .set({ logo: input, ...bump(brandKits) })
          .where(eq(brandKits.brandId, kit.brandId))
          .returning()
        return c.json(next!)
      })

      /** A new file goes first, titled from its name; the team renames it for AI to read. */
      .post('/files', async (c) => {
        const brand = c.var.brand
        const input = await body(
          c,
          z.object({ id: Id, name: z.string().trim().min(1).max(300), mediaId: Id.optional() }),
        )
        const [existing] = await db.select().from(brandFiles).where(eq(brandFiles.id, input.id))
        if (existing) {
          assertSameBrand(existing, brand.id)
          return c.json(existing)
        }
        await assertMedia(db, brand.id, input.mediaId)
        const [file] = await db
          .insert(brandFiles)
          .values({
            ...input,
            brandId: brand.id,
            title: plainTitle(input.name),
            kind: kindOf(input.name),
          })
          .returning()
        return c.json(file!, 201)
      })

      /** A rename. A blank title keeps the old one: a file AI cannot name is one it cannot use. */
      .patch('/files/:id', async (c) => {
        const brand = c.var.brand
        const { title } = await body(c, z.object({ title: z.string().max(300) }))
        const [file] = await db
          .select()
          .from(brandFiles)
          .where(and(eq(brandFiles.id, c.req.param('id')), eq(brandFiles.brandId, brand.id)))
        if (!file) throw notFound('file not found')
        if (!title.trim()) return c.json(file)
        const [next] = await db
          .update(brandFiles)
          .set({ title: title.trim() })
          .where(eq(brandFiles.id, file.id))
          .returning()
        return c.json(next!)
      })

      /** A new version: the team's title stays, the file and its date change. */
      .put('/files/:id/version', async (c) => {
        const brand = c.var.brand
        const input = await body(
          c,
          z.object({ name: z.string().trim().min(1).max(300), mediaId: Id.optional() }),
        )
        await assertMedia(db, brand.id, input.mediaId)
        const [next] = await db
          .update(brandFiles)
          .set({
            name: input.name,
            kind: kindOf(input.name),
            mediaId: input.mediaId ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(brandFiles.id, c.req.param('id')), eq(brandFiles.brandId, brand.id)))
          .returning()
        if (!next) throw notFound('file not found')
        return c.json(next)
      })

      .delete('/files/:id', async (c) => {
        const brand = c.var.brand
        await db
          .delete(brandFiles)
          .where(and(eq(brandFiles.id, c.req.param('id')), eq(brandFiles.brandId, brand.id)))
        return c.json({ deleted: c.req.param('id') })
      })
  )
}
