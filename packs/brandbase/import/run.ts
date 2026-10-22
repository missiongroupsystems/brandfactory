/**
 * Brings each brand's own Instagram and TikTok posts into BrandBase, in two steps.
 *
 *   pnpm -F @brandfactory/pack-brandbase import-posts scrape <brand|all> <dir> [--limit 150]
 *     [--budget 4.50] [--yes]
 *
 * runs Apify's scrapers for the accounts in `accounts.json` and writes `<dir>/<brand>-<ig|tt>.json`.
 * It prints what each run's posts cost at the actor's price, and the cap each run takes
 * (`maxTotalChargeUsd`): that cost, or the smallest cap Apify takes for the actor when that is
 * more. The caps are the most Apify can charge. It runs nothing without `--yes`, or when the caps
 * add to more than `--budget`. The token is read from the macOS Keychain (`apify` / `token`)
 * and goes nowhere but Apify's Authorization header.
 *
 *   CORE_URL=http://localhost:3013 CORE_TOKEN=admin@local \
 *     pnpm -F @brandfactory/pack-brandbase import-posts load <brand> <file> [--yes-production]
 *
 * reads one scrape and, as the signed-in person, uploads each new post's cover through
 * `media.create` and its signed write URL, then calls `post.import`. A post already brought in
 * gets its caption and counts refreshed and keeps its cover, so a second load of a newer scrape
 * is safe. CORE_TOKEN defaults to the core CLI's session (`~/.config/brandbase-core/session.json`).
 * A core that is not on this machine needs `--yes-production`.
 *
 * Covers are copied, not linked: the platforms' image addresses expire within days.
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { coverAddresses, postsOf, type Imported } from './apify'

type Channel = 'ig' | 'tt'
const here = path.dirname(fileURLToPath(import.meta.url))
const ACCOUNTS = JSON.parse(readFileSync(path.join(here, 'accounts.json'), 'utf8')) as Record<
  string,
  Partial<Record<Channel, string>>
>

/**
 * Each scraper, what one result costs on Apify's Free plan (pay per event, Oct 2026), and the
 * smallest cap Apify lets one of its runs take (`minimalMaxTotalChargeUsd`).
 */
const ACTORS: Record<
  Channel,
  {
    id: string
    perItem: number
    perRun: number
    least: number
    input: (h: string, n: number) => object
  }
> = {
  ig: {
    id: 'apify~instagram-post-scraper',
    least: 0.005,
    // A post ($0.0017) and its detailed data ($0.001): the views of a reel come only with it.
    perItem: 0.0027,
    perRun: 0,
    input: (handle, limit) => ({
      username: [handle],
      resultsLimit: limit,
      dataDetailLevel: 'detailedData',
    }),
  },
  tt: {
    id: 'clockworks~tiktok-scraper',
    least: 0.5,
    perItem: 0.0037,
    perRun: 0.001,
    input: (handle, limit) => ({
      profiles: [handle],
      resultsPerPage: limit,
      profileScrapeSections: ['videos'],
      profileSorting: 'latest',
    }),
  },
}

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const option = (name: string) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const positional = args.filter(
  (a, i) => !a.startsWith('--') && !['--limit', '--budget'].includes(args[i - 1] ?? ''),
)

async function scrape() {
  const [, which, dir] = positional
  if (!which || !dir)
    throw new Error('usage: scrape <brand|all> <dir> [--limit 150] [--budget 4.50] [--yes]')
  const limit = Number(option('--limit') ?? 150)
  if (!Number.isInteger(limit) || limit < 1 || args.some((a) => a.startsWith('--limit='))) {
    throw new Error('--limit takes a whole number of posts, as --limit 150')
  }
  const brands = which === 'all' ? Object.keys(ACCOUNTS) : [which]
  const runs = brands.flatMap((brand) => {
    const accounts = ACCOUNTS[brand]
    if (!accounts) throw new Error(`no accounts for ${brand} in accounts.json`)
    return (Object.entries(accounts) as [Channel, string][]).map(([channel, handle]) => {
      const actor = ACTORS[channel]
      return {
        brand,
        channel,
        handle,
        actor,
        most: +(limit * actor.perItem + actor.perRun).toFixed(4),
      }
    })
  })
  const cap = (r: (typeof runs)[number]) => Math.max(r.most, r.actor.least)
  for (const r of runs) {
    const capped = cap(r) > r.most ? ` (capped at Apify's least, $${cap(r)})` : ''
    console.log(
      `${r.brand.padEnd(14)} ${r.channel} @${r.handle.padEnd(18)} at most $${r.most}${capped}`,
    )
  }
  const cost = runs.reduce((s, r) => s + r.most, 0)
  const capped = runs.reduce((s, r) => s + cap(r), 0)
  console.log(
    `$${cost.toFixed(2)} for at most ${limit} posts each; the caps, the most Apify can charge: $${capped.toFixed(2)}`,
  )
  if (args.some((a) => a.startsWith('--budget=')))
    throw new Error('--budget takes a number, as --budget 4.50')
  const budget = Number(option('--budget') ?? Infinity)
  if (!(capped <= budget))
    throw new Error(`the caps add to $${capped.toFixed(2)}, over the budget of $${budget}`)
  if (!flag('--yes')) return console.log('nothing ran: add --yes to run these scrapes')
  // Before any run: a scrape that cannot be saved is money spent for nothing.
  mkdirSync(dir, { recursive: true })

  const token = execFileSync(
    'security',
    ['find-generic-password', '-s', 'apify', '-a', 'token', '-w'],
    {
      encoding: 'utf8',
    },
  ).trim()
  const apify = async (url: string, init?: RequestInit) => {
    const r = await fetch(`https://api.apify.com/v2${url}`, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    })
    if (!r.ok) throw new Error(`Apify ${url.split('?')[0]}: ${r.status}`)
    return (await r.json()) as ApifyRun & Record<string, unknown>[]
  }
  for (const r of runs) {
    const started = await apify(`/acts/${r.actor.id}/runs?maxTotalChargeUsd=${cap(r)}`, {
      method: 'POST',
      body: JSON.stringify(r.actor.input(r.handle, limit)),
    })
    let run = started.data!
    // The run goes on at Apify if this script stops; its id finds its dataset there.
    console.log(`${r.brand} ${r.channel}: run ${run.id} started`)
    while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
      run = (await apify(`/actor-runs/${run.id}?waitForFinish=60`)).data!
    }
    if (run.status !== 'SUCCEEDED')
      throw new Error(`${r.brand} ${r.channel}: the run ${run.status}`)
    const items = await apify(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json`)
    const file = path.join(dir, `${r.brand}-${r.channel}.json`)
    writeFileSync(file, JSON.stringify(items, null, 1))
    console.log(
      `${r.brand} ${r.channel}: ${items.length} items of at most ${limit} (fewer: the account has fewer, or the cap ended the run), $${run.usageTotalUsd ?? '?'} → ${file}`,
    )
  }
}

const TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface ApifyRun {
  data?: { id: string; status: string; defaultDatasetId: string; usageTotalUsd?: number }
}
interface Made {
  upload: { url: string; headers: Record<string, string> }
  src: string
}

async function load() {
  const [, brand, file] = positional
  if (!brand || !file) throw new Error('usage: load <brand> <file> [--yes-production]')
  const core = (process.env.CORE_URL ?? 'http://localhost:3013').replace(/\/$/, '')
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(core) && !flag('--yes-production')) {
    throw new Error(`${core} is not on this machine: add --yes-production to load into it`)
  }
  const token =
    process.env.CORE_TOKEN ??
    JSON.parse(readFileSync(`${homedir()}/.config/brandbase-core/session.json`, 'utf8')).token
  const call = async (op: string, input: object) => {
    const r = await fetch(`${core}/ops/brandbase/${op}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    })
    const body = await r.json()
    if (!r.ok) throw new Error(`${op} ${r.status} ${JSON.stringify(body).slice(0, 200)}`)
    return body
  }

  const channel: Channel = /-tt\.json$/.test(file) ? 'tt' : 'ig'
  const handle = ACCOUNTS[brand]?.[channel]
  if (!handle) throw new Error(`no ${channel} account for ${brand} in accounts.json`)
  const posts = postsOf(JSON.parse(readFileSync(file, 'utf8')), channel, handle)
  const listed = (await call('post.list', { brand })) as { id: string; permalink: string | null }[]
  const known = new Set(listed.filter((p) => p.permalink).map((p) => p.id))

  const tally = { added: 0, refreshed: 0, skipped: [] as string[] }
  for (const post of posts) {
    const id = `${brand}-${post.channel}-${post.externalId}`
    try {
      const media = known.has(id) ? [] : [await uploadCover(call, brand, id, post)]
      await call('post.import', {
        brand,
        channel: post.channel,
        externalId: post.externalId,
        format: post.format,
        hook: post.hook,
        caption: post.caption,
        at: post.at,
        permalink: post.permalink,
        metrics: post.metrics,
        media,
      })
      tally[known.has(id) ? 'refreshed' : 'added']++
    } catch (err) {
      tally.skipped.push(`${id}: ${(err as Error).message}`)
    }
  }
  console.log(
    `${brand} ${channel}: ${posts.length} posts; ${tally.added} added, ${tally.refreshed} refreshed, ${tally.skipped.length} skipped`,
  )
  for (const s of tally.skipped) console.log(`  skipped ${s}`)
  if (tally.skipped.length > 0) process.exitCode = 1
}

/** Copies a post's cover into the brand's files; answers the media item the post keeps. */
async function uploadCover(
  call: (op: string, input: object) => Promise<unknown>,
  brand: string,
  id: string,
  post: Imported,
) {
  let got: Response | undefined
  let failure = 'no address'
  for (const address of coverAddresses(post.cover)) {
    try {
      got = await fetch(address)
      if (got.ok) break
      failure = `cover ${got.status}`
    } catch (err) {
      failure = `cover ${(err as Error).message}`
    }
    got = undefined
  }
  if (!got) throw new Error(failure)
  const mime = (got.headers.get('content-type') ?? '').split(';')[0]!.trim()
  if (!TYPES.includes(mime)) throw new Error(`cover is ${mime || 'of no type'}`)
  const bytes = Buffer.from(await got.arrayBuffer())
  // A new id each try: storage never overwrites a key, so a load that stopped after an upload
  // leaves that file unused rather than in the way.
  const mediaId = `${id}-${randomUUID().slice(0, 8)}`
  const made = (await call('media.create', {
    brand,
    id: mediaId,
    mime,
    name: `${id}.${mime.split('/')[1]}`,
    bytes: bytes.length,
  })) as Made
  const put = await fetch(made.upload.url, {
    method: 'PUT',
    headers: made.upload.headers,
    body: bytes,
  })
  if (!put.ok) throw new Error(`upload ${put.status}`)
  return {
    src: `${made.src}#photo`,
    kind: 'photo',
    mediaId,
    ...(post.duration ? { duration: post.duration } : {}),
  }
}

const command = positional[0]
if (command === 'scrape') await scrape()
else if (command === 'load') await load()
else throw new Error('usage: scrape <brand|all> <dir> … | load <brand> <file> …')
