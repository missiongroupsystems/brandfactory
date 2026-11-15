/**
 * People's loadouts across a promotion, for the release workflow (.github/workflows/production.yml).
 *
 *   tsx scripts/loadouts.ts before <pack>          prints the live version's moves as JSON
 *   tsx scripts/loadouts.ts after <pack> <file>    each person whose loadout held every move in
 *                                                  <file> gets every move of the version live now
 *
 * A person given `core loadout <id> <pack> all` before keeps "all" through the release, so a new
 * move (an internal one included) reaches them. An agent, and a person with a shorter list, keep
 * their own list. Reads DATABASE_URL and CORE_ENVIRONMENT as the CLI does.
 */
import { readFileSync } from 'node:fs'

import { openPostgres } from '../src/db'
import { liveVersion, setLoadout } from '../src/registry'

const [mode, pack, file] = process.argv.slice(2)
const url = process.env.DATABASE_URL
const environment = process.env.CORE_ENVIRONMENT ?? 'local'
if (!url || !pack || (mode !== 'before' && mode !== 'after') || (mode === 'after' && !file)) {
  throw new Error(
    'usage: loadouts.ts before <pack> | after <pack> <file>; DATABASE_URL is required',
  )
}

const db = openPostgres(url, 1)
try {
  const live = await liveVersion(db, environment, pack)
  if (!live) throw new Error(`${pack} has no live version in ${environment}`)
  const now = Object.keys(live.content.ops).sort()
  if (mode === 'before') {
    process.stdout.write(JSON.stringify(now))
  } else {
    const before = JSON.parse(readFileSync(file!, 'utf8')) as string[]
    const rows = await db.query<{ principal: string; ops: string[] }>(
      `select l.principal, l.ops from packs.loadouts l
       join packs.principals p on p.id = l.principal
       where l.pack = $1 and p.agent_of is null`,
      [pack],
    )
    let widened = 0
    for (const row of rows) {
      const held = new Set(row.ops)
      if (!before.every((op) => held.has(op))) continue
      if (now.every((op) => held.has(op))) continue
      await setLoadout(db, row.principal, pack, now)
      widened++
    }
    console.info(
      `${pack} ${live.version}: ${widened} of ${rows.length} people's loadouts follow it`,
    )
  }
} finally {
  await db.close()
}
