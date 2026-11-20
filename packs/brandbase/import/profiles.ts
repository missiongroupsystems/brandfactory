/**
 * Brings Instagram profiles read through Business Discovery into a company's roster: each
 * picture is copied into our files by the server (Meta's addresses expire within days), the
 * followers are kept, and a name fills only an account that has none (a researched or a team name
 * stays). The profiles are a Business Discovery read made on the server, one JSON object a line
 * (a `PROFILE ` prefix is dropped): {handle, name, followers_count, profile_picture_url}.
 *
 *   CORE_URL=http://localhost:3013 CORE_TOKEN=admin@local \
 *     pnpm -F @brandfactory/pack-brandbase import-profiles --org <company> --file <profiles.jsonl>
 *     [--yes-production]
 *
 * It sends them to the server (`POST /roster/profiles`, packages/connect), 25 at a time, as the
 * signed-in person (an owner or admin of the company), and prints counts only. Run it soon after the read: an old picture address no
 * longer answers, and its account keeps its initials until the next read.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const value = (name: string) => {
  const at = args.indexOf(name)
  const v = at === -1 ? undefined : args[at + 1]
  return v && !v.startsWith('--') ? v : undefined
}
const org = value('--org')
const file = value('--file')
if (!org || !file) {
  throw new Error(
    'usage: import-profiles --org <company> --file <profiles.jsonl> [--yes-production]',
  )
}
const core = (process.env.CORE_URL ?? 'http://localhost:3013').replace(/\/$/, '')
if (
  !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(core) &&
  !args.includes('--yes-production')
) {
  throw new Error(`${core} is not on this machine: add --yes-production to import into it`)
}
const token =
  process.env.CORE_TOKEN ??
  JSON.parse(readFileSync(`${homedir()}/.config/brandbase-core/session.json`, 'utf8')).token

const profiles = readFileSync(file, 'utf8')
  .split('\n')
  .map((line) => line.replace(/^.*?PROFILE /, '').trim())
  .filter((line) => line.startsWith('{'))
  .map((line) => JSON.parse(line) as Record<string, unknown>)
  .map((p) => ({
    handle: p.handle,
    name: p.name,
    followers: p.followers_count,
    picture: p.profile_picture_url,
  }))

const total = { read: 0, pictures: 0, noPicture: 0, skipped: 0, failed: 0 }
for (let i = 0; i < profiles.length; i += 25) {
  const res = await fetch(`${core}/roster/profiles?org=${encodeURIComponent(org)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ profiles: profiles.slice(i, i + 25) }),
  })
  const body = (await res.json().catch(() => null)) as typeof total & { code?: string }
  if (!res.ok) throw new Error(`the server answered ${res.status} ${body?.code ?? ''}`)
  for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += body[k] ?? 0
}
console.info(`${profiles.length} profiles: ${JSON.stringify(total)}`)
