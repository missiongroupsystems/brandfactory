/**
 * Loads the demo's static data into a database the brandbase pack has migrated, so a fresh core
 * shows what the demo shows. Reads the data files of `packages/web-next` directly: they import
 * nothing but each other. Development only; it refuses a database that already holds a brand.
 * Ported from the old server's seed (`scripts/seed.ts` on `feat/brandbase-backend`).
 *
 *   DATABASE_URL=… SEED_ADMIN=admin@local pnpm -F @brandfactory/pack-brandbase seed
 *
 * `SEED_ADMIN` makes one admin account (an email; the id is the email under the dev sign-in).
 * It writes as the login role, past the row rules, as a migration does.
 */
import pg from 'pg'
import type * as KitData from '../../../packages/web-next/src/data/brand-kit'
import type * as BrandsData from '../../../packages/web-next/src/data/brands'
import type * as ConnectionsData from '../../../packages/web-next/src/data/connections'
import type * as DemoData from '../../../packages/web-next/src/data/demo'
import { type Post } from '../../../packages/web-next/src/data/demo'
import type * as IdeasData from '../../../packages/web-next/src/data/ideas'
import { type IdeaCard } from '../../../packages/web-next/src/data/ideas'
import type * as InboxData from '../../../packages/web-next/src/data/inbox'
import type * as PublishData from '../../../packages/web-next/src/data/publish'
import type * as ShootsData from '../../../packages/web-next/src/data/shoots'

// `web-next` is not an ES module package, so its files load as CommonJS: the exports arrive on
// the default export.
const load = async <T>(name: string): Promise<T> => {
  const mod = await import(`../../../packages/web-next/src/data/${name}`)
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

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/**
 * Inserts rows into a `brandbase` table: each key is its column in snake case, and a column a
 * row leaves out keeps its default. Postgres reads each value as its column's type.
 */
async function into(db: pg.Client, table: string, rows: object | object[]) {
  const list = (Array.isArray(rows) ? rows : [rows]).map((r) =>
    Object.fromEntries(
      Object.entries(r)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [snake(k), v]),
    ),
  )
  if (list.length === 0) return
  const cols = [...new Set(list.flatMap((r) => Object.keys(r)))].map((c) => `"${c}"`).join(', ')
  await db.query(
    `insert into brandbase.${table} (${cols})
     select ${cols} from jsonb_populate_recordset(null::brandbase.${table}, $1::jsonb)`,
    [JSON.stringify(list)],
  )
}

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

async function seed(db: pg.Client) {
  const [any] = (await db.query('select 1 from brandbase.brands limit 1')).rows
  if (any) throw new Error('the database already holds brands; seed only an empty one')
  const insert = (table: string, rows: object | object[]) => into(db, table, rows)
  const ownerOf = new Map<string, string>()

  for (const [position, content] of BRAND_CONTENT.entries()) {
    const brand = content.brand
    const id = brand.id
    await insert('brands', {
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
    if (content.posts.length > 0) await insert('posts', content.posts.map(postRow))

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
    if (stories.length > 0) await insert('posts', stories)

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
    if (ordered.length > 0) await insert('ideas', ordered)
    for (const r of ordered) ownerOf.set(`idea:${r.id}`, id)

    // Shoots and their crew. The seed's shoots stand for the team's own (in Lark).
    for (const s of SHOOTS_BY_BRAND[id]) {
      ownerOf.set(`shoot:${s.id}`, id)
      await insert('shoots', {
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
        await insert(
          'crew',
          s.crew.map((c, i) => ({
            id: `${s.id}-crew-${i + 1}`,
            shootId: s.id,
            brandId: id,
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
    await insert(
      'inbox_people',
      inbox.people.map((p, i) => ({ id: personId(p.name), brandId: id, ...p, position: i })),
    )
    const ago = (minutes: number) => new Date(INBOX_NOW.getTime() - minutes * 60_000)
    await insert(
      'inbox_messages',
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
    await insert('brand_kits', {
      brandId: id,
      voice: kit.voice,
      colours: kit.colours,
      logo: { src: brand.logo, name: null },
    })
    if (kit.files.length > 0) {
      await insert(
        'brand_files',
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
    await insert('voice_versions', [
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

    // Connections.
    await insert(
      'connections',
      Object.entries(CONNECTIONS[id]).map(([key, status]) => ({ brandId: id, key, status })),
    )
  }

  // Guest comments, on their shoot or idea.
  for (const [target, list] of Object.entries(GUEST_COMMENTS)) {
    const [kind, targetId] = target.split(':') as ['idea' | 'shoot', string]
    const owner = ownerOf.get(target)
    if (!owner) continue
    for (const c of list) {
      await insert('comments', {
        id: `${owner}-${c.id}`,
        brandId: owner,
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
  if (!url) throw new Error('set DATABASE_URL to the database the pack migrated')
  const db = new pg.Client({ connectionString: url })
  await db.connect()
  try {
    await db.query('begin')
    await seed(db)
    const admin = process.env.SEED_ADMIN
    if (admin) await into(db, 'users', { id: admin, email: admin, role: 'admin' })
    await db.query('commit')
    console.info('seeded', BRAND_CONTENT.length, 'brands')
  } finally {
    await db.end()
  }
}

await main()
