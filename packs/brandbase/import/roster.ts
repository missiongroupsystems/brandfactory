/**
 * Brings the old BrandFactory influencer roster into a company's roster on the core, through the
 * pack's moves, as the signed-in person (an owner or admin of the company).
 *
 *   CORE_URL=http://localhost:3013 CORE_TOKEN=admin@local \
 *     pnpm -F @brandfactory/pack-brandbase import-roster --org <company> --csv <dir>
 *     [--names <handle-names.csv>] [--workspace <old workspace uuid>] [--dry-run] [--yes-production]
 *
 * `<dir>` holds the old Supabase project's own exports: `influencers.csv`,
 * `influencer_accounts.csv`, `brands.csv` (id,name) and, if there is one, `influencer_brands.csv`.
 * They hold private notes: keep them out of git. Each person is written by their slug and each
 * account by its platform and handle, in mode update: each field the export holds is written over
 * the stored one, notes included, so a second run changes nothing.
 *
 * Brands: an old link (`influencer_brands.csv`) is mapped to our brand by the old brand's name
 * (Casa Vostra → casa-vostra), and a brand we do not have is skipped. Beside those, a person is
 * linked to each of the company's brands whose saved collaborators (Collaborators on the post
 * page) hold their Instagram or TikTok handle. No other link is made.
 *
 * With `--names`, the names researched for the brands' saved Instagram collaborators that no one on
 * the roster holds (`namesOf`: high and medium confidence only) are given to those accounts where
 * they have no name yet, so a name the team gave stays and a second run changes nothing.
 *
 * `--dry-run` reads the company's brands and prints what it would write, writing nothing.
 * CORE_TOKEN defaults to the core CLI's session (`~/.config/brandbase-core/session.json`). A core
 * that is not on this machine needs `--yes-production`. It prints counts only, never a person's
 * name or notes.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  type Collaborators,
  linkByCollaborators,
  namesOf,
  type OldTables,
  parseCsv,
  peopleOfTables,
} from './roster-data'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const value = (name: string) => {
  const at = args.indexOf(name)
  const v = at === -1 ? undefined : args[at + 1]
  return v && !v.startsWith('--') ? v : undefined
}

const org = value('--org')
const csvDir = value('--csv')
if (!org || !csvDir) {
  throw new Error(
    'usage: import-roster --org <company> --csv <dir> [--names <file>] [--workspace <uuid>] [--dry-run] [--yes-production]',
  )
}
const dryRun = flag('--dry-run')
const core = (process.env.CORE_URL ?? 'http://localhost:3013').replace(/\/$/, '')
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(core) && !flag('--yes-production')) {
  throw new Error(`${core} is not on this machine: add --yes-production to import into it`)
}
const token =
  process.env.CORE_TOKEN ??
  JSON.parse(readFileSync(`${homedir()}/.config/brandbase-core/session.json`, 'utf8')).token

async function call<T>(op: string, input: object): Promise<T> {
  const r = await fetch(`${core}/ops/brandbase/${op}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })
  const body = (await r.json().catch(() => null)) as { code?: string } | null
  // The refusal's code only: a message can quote the input.
  if (!r.ok) throw new Error(`${op} answered ${r.status} ${body?.code ?? ''}`)
  return body as T
}

const brands = (await call<{ id: string; orgId: string }[]>('brand.list', {})).filter(
  (b) => b.orgId === org,
)
if (brands.length === 0) throw new Error(`no brand of ${org} reaches this account`)

const read = (name: string, optional = false) => {
  const file = path.join(csvDir, name)
  if (!existsSync(file)) {
    if (optional) return []
    throw new Error(`${file} is missing`)
  }
  return parseCsv(readFileSync(file, 'utf8'))
}
const tables: OldTables = {
  influencers: read('influencers.csv'),
  accounts: read('influencer_accounts.csv'),
  links: read('influencer_brands.csv', true),
  brands: read('brands.csv'),
}
const { people, skipped } = peopleOfTables(
  tables,
  new Set(brands.map((b) => b.id)),
  value('--workspace'),
)
const oldLinks = people.reduce((n, p) => n + (p.brands?.length ?? 0), 0)

// The brands' saved collaborators, as each brand's state holds them.
const saved: Record<string, Collaborators> = {}
for (const b of brands) {
  const state = await call<{ brand: { collaborators?: Collaborators } }>('brand.state', {
    brand: b.id,
  })
  saved[b.id] = state.brand.collaborators ?? {}
}
const matched = linkByCollaborators(people, saved)

const unmatched = Object.values(skipped.brands).reduce((a, b) => a + b, 0)
console.info(
  `csv: ${people.length} people, ${people.reduce((n, p) => n + p.accounts.length, 0)} accounts, ` +
    `${people.filter((p) => p.notes).length} with notes, ${oldLinks} old brand links`,
)
console.info(
  `skipped: ${unmatched} old links to brands we do not have (${Object.keys(skipped.brands).join(', ') || 'none'}), ` +
    `${skipped.accounts} accounts, ${skipped.orphans} rows of no person, ${skipped.workspace} people of another workspace`,
)
console.info(
  `links from saved collaborators: ${
    Object.entries(matched)
      .map(([b, n]) => `${b} ${n}`)
      .join(', ') || 'none'
  }`,
)
const namesFile = value('--names')
const named = namesFile
  ? namesOf(
      parseCsv(readFileSync(namesFile, 'utf8')),
      new Set(
        people.flatMap((p) =>
          p.accounts.filter((a) => a.platform === 'instagram').map((a) => a.handle.toLowerCase()),
        ),
      ),
    )
  : null
if (named) {
  console.info(
    `names: ${named.names.size} Instagram handles to name; left: ${named.skipped.unsure} unsure or blank, ` +
      `${named.skipped.platform} on another platform, ${named.skipped.roster} on the roster`,
  )
}
if (dryRun) {
  console.info(`dry run: nothing written into ${org}`)
  process.exit(0)
}

const counts = { made: 0, kept: 0, accounts: 0, links: 0, failed: 0 }
for (const p of people) {
  try {
    const done = await call<{ id: string; made: boolean; accounts: number }>('influencer.import', {
      org,
      slug: p.slug,
      name: p.name,
      category: p.category,
      status: p.status,
      mode: 'update',
      notes: p.notes ?? null,
      accounts: p.accounts,
    })
    counts[done.made ? 'made' : 'kept']++
    counts.accounts += done.accounts
    for (const brand of p.brands ?? []) {
      await call('influencer.brand_link', { id: done.id, brand })
      counts.links++
    }
  } catch (err) {
    counts.failed++
    console.error(`person ${counts.made + counts.kept + counts.failed}:`, (err as Error).message)
  }
}
let namesGiven = 0
for (const [handle, name] of named?.names ?? []) {
  try {
    const got = await call<{ name: string | null }>('influencer.profile_name', {
      org,
      handle,
      name,
      fill: true,
    })
    if (got.name === name) namesGiven++
  } catch (err) {
    counts.failed++
    console.error('name:', (err as Error).message)
  }
}
if (named) console.info(`${namesGiven} handles carry the researched name`)
console.info(
  `${counts.made} people added, ${counts.kept} already there, ${counts.accounts} accounts written, ` +
    `${counts.links} brand links kept, ${counts.failed} failed`,
)
if (counts.failed > 0) process.exitCode = 1
