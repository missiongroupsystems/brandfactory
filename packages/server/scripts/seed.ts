/**
 * Loads the demo's static data into an empty database, so a fresh server shows what the demo
 * shows. Reads the data files of `packages/web-next` directly: they import nothing but each
 * other. Development only; it refuses a database that already holds a brand.
 *
 *   pnpm -F @brandfactory/server db:seed            # PGlite in PGLITE_DIR
 *   DATABASE_URL=… pnpm -F @brandfactory/server db:seed
 *
 * It also makes one admin account per `SEED_ADMIN` (an email; the id is the email under dev
 * auth). On Supabase, make the account in Supabase first and insert its `sub` by hand.
 */
import { mkdirSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import type * as KitData from '../../web-next/src/data/brand-kit'
import type * as BrandsData from '../../web-next/src/data/brands'
import type * as ConnectionsData from '../../web-next/src/data/connections'
import type * as DemoData from '../../web-next/src/data/demo'
import { type Post } from '../../web-next/src/data/demo'
import type * as IdeasData from '../../web-next/src/data/ideas'
import { type IdeaCard } from '../../web-next/src/data/ideas'
import type * as InboxData from '../../web-next/src/data/inbox'
import type * as PublishData from '../../web-next/src/data/publish'
import type * as ShootsData from '../../web-next/src/data/shoots'
import { openPglite, openPostgres, type Db } from '../src/db/client'
import * as t from '../src/db/schema'

// `web-next` is not an ES module package, so its files load as CommonJS: the exports arrive on
// the default export.
const load = async <T>(name: string): Promise<T> => {
  const mod = await import(`../../web-next/src/data/${name}`)
  return (mod.default ?? mod) as T
}
const { BRAND_KIT } = await load<typeof KitData>('brand-kit.ts')
const { BRAND_CONTENT } = await load<typeof BrandsData>('brands.ts')
const { CONNECTIONS } = await load<typeof ConnectionsData>('connections.ts')
const { feedsOf } = await load<typeof DemoData>('demo.ts')
const { IDEAS_BY_BRAND } = await load<typeof IdeasData>('ideas.ts')
const { INBOX_BY_BRAND } = await load<typeof InboxData>('inbox.ts')
const { LINKED } = await load<typeof PublishData>('publish.ts')
const { GUEST_COMMENTS, SHOOTS_BY_BRAND } = await load<typeof ShootsData>('shoots.ts')

/** The number a day prints, which the seed's ids carry: "8" for 2026-10-08. */
const dayNumber = (date: string) => String(Number(date.slice(8)))

/** The inbox's fixed "now" (`inbox/model.ts`): ages count back from it. */
const INBOX_NOW = new Date('2026-10-11T07:00:00Z')

const mediaOf = (src: string, duration?: string) => ({
  src: src.replace(/#(video|photo)$/, ''),
  kind: /#video$|\.mp4$/.test(src) ? ('video' as const) : ('photo' as const),
  ...(duration && { duration }),
})

function cardRow(brandId: string, card: IdeaCard, day: string | null, why: string | null) {
  return {
    id: card.id,
    brandId,
    format: card.format,
    pillar: card.pillar,
    hook: card.hook,
    angle: card.angle,
    feature: card.feature,
    image: card.image ?? null,
    source: card.source,
    status: card.status === 'suggested' ? ('suggested' as const) : ('idea' as const),
    day,
    why,
    postId: null as string | null,
    inspiration: card.inspiration,
    shots: card.shots,
    cut: card.cut ?? null,
    sharper: card.sharper,
    builtOn: card.builtOn ?? null,
  }
}

export async function seed(db: Db) {
  const [any] = await db.select().from(t.brands).limit(1)
  if (any) throw new Error('the database already holds brands; seed only an empty one')

  for (const [position, content] of BRAND_CONTENT.entries()) {
    const brand = content.brand
    const id = brand.id
    await db.insert(t.brands).values({
      id,
      name: brand.name,
      handle: brand.handle,
      line: brand.line,
      position,
      linked: LINKED[id],
    })

    const days = content.weeks.flatMap((w) => w.days).filter((d) => !d.outside)
    const dayOfPost = (postId: string) =>
      days.find(
        (d) =>
          feedsOf(d).some((m) => m.kind === 'post' && m.postId === postId) ||
          (d.story.kind === 'post' && d.story.postId === postId),
      )

    // Posts. A stage the demo shows is a hand mark: nothing in the seed was published by us.
    const postRow = (p: Post) => {
      const day = dayOfPost(p.id)
      return {
        id: p.id,
        brandId: id,
        format: p.format,
        hook: p.hook,
        day: day ? day.date : null,
        time: p.slot.split(', ')[1] ?? null,
        caption: content.captions[p.id] ?? '',
        channels: p.channels ?? [],
        media: p.images.map((src) => mediaOf(src, p.duration)),
        fromIdea: p.fromIdea ?? null,
        marked:
          p.stage === 'posted' || p.stage === 'scheduled' ? p.stage : (null as null | 'posted'),
      }
    }
    if (content.posts.length > 0) await db.insert(t.posts).values(content.posts.map(postRow))

    // Stories already out are a count in the demo; here each is a post of its own.
    const stories = days.flatMap((d) =>
      d.story.kind === 'posted'
        ? Array.from({ length: d.story.count }, (_, i) => ({
            id: `${id}-story-${dayNumber(d.date)}-${i + 1}`,
            brandId: id,
            format: 'story' as const,
            hook: `Story ${i + 1}`,
            day: d.date,
            time: `${String(10 + i * 2).padStart(2, '0')}:00`,
            channels: ['ig'],
            media: [mediaOf((d.story as { image: string }).image)],
            marked: 'posted' as const,
          }))
        : [],
    )
    if (stories.length > 0) await db.insert(t.posts).values(stories)

    // Ideas. A calendar tile becomes its idea's day; a tile with no idea gets one, as the demo's
    // `ideaOfTile` makes on first open: from its moment, else from the tile's own words.
    const pack = IDEAS_BY_BRAND[id]
    const rows = new Map<string, ReturnType<typeof cardRow>>()
    for (const card of pack.ideas) {
      rows.set(card.id, cardRow(id, card, card.date ?? null, null))
    }
    for (const day of days) {
      for (const mark of feedsOf(day)) {
        if (mark.kind !== 'idea') continue
        const found = [...rows.values()].find((r) => r.hook === mark.hook)
        if (found) {
          found.day = day.date
          found.why = mark.why
          continue
        }
        const moment = pack.moments.find((m) => m.seed.hook === mark.hook)
        const card: IdeaCard = moment
          ? {
              ...moment.seed,
              id: `${id}-moment-${moment.id}`,
              source: { kind: 'moment', title: moment.title },
              status: 'idea',
            }
          : {
              id: `${id}-tile-${dayNumber(day.date)}`,
              format: mark.format,
              pillar: 'Occasion',
              hook: mark.hook,
              angle: mark.why,
              feature: '',
              inspiration: [],
              shots: [],
              sharper: [],
              source: { kind: mark.suggested ? 'suggested' : 'own' },
              status: mark.suggested ? 'suggested' : 'idea',
            }
        rows.set(card.id, cardRow(id, card, day.date, mark.why))
      }
    }
    // A card that names a post links to it, and leaves the calendar to the post.
    for (const card of pack.ideas) {
      if (card.postId && content.posts.some((p) => p.id === card.postId)) {
        rows.get(card.id)!.postId = card.postId
        rows.get(card.id)!.day = null
      }
    }
    // A millisecond apart, so the ideas read back in the demo's order.
    const base = Date.parse('2026-10-01T00:00:00Z')
    const ordered = [...rows.values()].map((r, i) => ({ ...r, createdAt: new Date(base + i) }))
    if (ordered.length > 0) await db.insert(t.ideas).values(ordered)

    // Shoots and their crew. The seed's shoots stand for the team's own (in Lark).
    for (const s of SHOOTS_BY_BRAND[id]) {
      await db.insert(t.shoots).values({
        id: s.id,
        brandId: id,
        title: s.title,
        day: s.date,
        start: s.start,
        end: s.end,
        place: s.place,
        origin: 'lark',
        ideaIds: s.ideaIds.filter((i) => rows.has(i)),
      })
      if (s.crew.length > 0) {
        await db.insert(t.crew).values(
          s.crew.map((c, i) => ({
            id: `${s.id}-crew-${i + 1}`,
            shootId: s.id,
            ...c,
            position: i,
          })),
        )
      }
    }

    // Inbox.
    const inbox = INBOX_BY_BRAND[id]
    const personId = (name: string) =>
      `${id}-person-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    await db
      .insert(t.inboxPeople)
      .values(
        inbox.people.map((p, i) => ({ id: personId(p.name), brandId: id, ...p, position: i })),
      )
    const ago = (minutes: number) => new Date(INBOX_NOW.getTime() - minutes * 60_000)
    await db.insert(t.inboxMessages).values(
      inbox.messages.map((m) => ({
        id: m.id,
        brandId: id,
        platform: m.platform,
        kind: m.kind,
        fromName: m.from.name,
        fromHandle: m.from.handle,
        text: m.text,
        receivedAt: ago(m.minutes),
        tone: m.tone,
        post: m.post ?? null,
        earlier: (m.earlier ?? []).map(({ minutes, ...e }) => ({
          ...e,
          at: ago(minutes).toISOString(),
        })),
        replies: m.replies,
        sendTo: m.sendTo ? personId(m.sendTo) : null,
      })),
    )

    // Brand kit, its files and two voice versions (as `voice/versions.ts` seeds them).
    const kit = BRAND_KIT[id]
    await db.insert(t.brandKits).values({
      brandId: id,
      voice: kit.voice,
      colours: kit.colours,
      logo: { src: brand.logo, name: null },
    })
    if (kit.files.length > 0) {
      await db.insert(t.brandFiles).values(
        kit.files.map(({ updated: _printed, ...f }) => ({
          ...f,
          id: `${id}-${f.id}`,
          brandId: id,
        })),
      )
    }
    const authors: Record<string, [string, string]> = {
      'casa-vostra': ['Giulia', 'Marco'],
      temper: ['Elise', 'Sam'],
      carlitos: ['Lucía', 'Javier'],
    }
    const [newer, older] = authors[id] ?? ['Team', 'Team']
    await db.insert(t.voiceVersions).values([
      {
        brandId: id,
        n: 3,
        by: older,
        note: 'First pass from the brand book',
        voice: {
          ...kit.voice,
          words: kit.voice.words.slice(0, -1),
          examples: kit.voice.examples.slice(0, 1),
        },
        createdAt: new Date('2026-07-03T02:00:00Z'),
      },
      {
        brandId: id,
        n: 4,
        by: newer,
        note: `Added “${kit.voice.words.at(-1)?.use}”`,
        voice: kit.voice,
        createdAt: new Date('2026-09-12T02:00:00Z'),
      },
    ])

    // Connections. Instagram, Facebook and TikTok are left out: on the API they follow the
    // accounts a brand links, and a seeded "connected" would have no tokens behind it.
    await db.insert(t.connections).values(
      Object.entries(CONNECTIONS[id])
        .filter(([key]) => !['ig', 'fb', 'tt'].includes(key))
        .map(([key, status]) => ({ brandId: id, key, status })),
    )
  }

  // Guest comments, on their shoot or idea.
  for (const [target, list] of Object.entries(GUEST_COMMENTS)) {
    const [kind, targetId] = target.split(':') as ['idea' | 'shoot', string]
    const [owner] =
      kind === 'idea'
        ? await db
            .select({ brandId: t.ideas.brandId })
            .from(t.ideas)
            .where(eq(t.ideas.id, targetId))
        : await db
            .select({ brandId: t.shoots.brandId })
            .from(t.shoots)
            .where(eq(t.shoots.id, targetId))
    if (!owner) continue
    for (const c of list) {
      await db.insert(t.comments).values({
        id: `${owner.brandId}-${c.id}`,
        brandId: owner.brandId,
        kind,
        targetId,
        name: c.name,
        text: c.text,
        done: c.done ?? false,
      })
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL
  let handle
  if (url) {
    handle = openPostgres(url, 1)
  } else {
    const dir = process.env.PGLITE_DIR ?? '.data/pglite'
    mkdirSync(dir, { recursive: true })
    handle = await openPglite(dir)
  }
  try {
    await seed(handle.db)
    const admin = process.env.SEED_ADMIN
    if (admin) await handle.db.insert(t.users).values({ id: admin, email: admin, role: 'admin' })
    console.info('seeded', BRAND_CONTENT.length, 'brands')
  } finally {
    await handle.close()
  }
}

if (process.argv[1]?.endsWith('seed.ts')) await main()
