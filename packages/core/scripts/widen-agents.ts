/**
 * Adds moves to the loadouts of the agents that already hold one move, for the release workflow
 * (.github/workflows/production.yml, task `agent-loadout`). An agent's loadout never follows a
 * release on its own (`loadouts.ts`); a person runs this on purpose, naming the moves.
 *
 *   tsx scripts/widen-agents.ts <pack> <held-op> <op...>
 *
 * Prints how many agents changed, never who. Reads DATABASE_URL and CORE_ENVIRONMENT as the CLI
 * does; each op must be a move of the version live now.
 */
import { openPostgres } from '../src/db'
import { liveVersion, setLoadout } from '../src/registry'

const [pack, held, ...ops] = process.argv.slice(2)
const url = process.env.DATABASE_URL
const environment = process.env.CORE_ENVIRONMENT ?? 'local'
if (!url || !pack || !held || ops.length === 0) {
  throw new Error('usage: widen-agents.ts <pack> <held-op> <op...>; DATABASE_URL is required')
}

const db = openPostgres(url, 1)
try {
  const live = await liveVersion(db, environment, pack)
  if (!live) throw new Error(`${pack} has no live version in ${environment}`)
  const unknown = ops.filter((op) => !Object.hasOwn(live.content.ops, op))
  if (unknown.length > 0)
    throw new Error(`not moves of ${pack} ${live.version}: ${unknown.join(' ')}`)
  const rows = await db.query<{ principal: string; ops: string[] }>(
    `select l.principal, l.ops from packs.loadouts l
     join packs.principals p on p.id = l.principal
     where l.pack = $1 and p.agent_of is not null and $2 = any (l.ops)`,
    [pack, held],
  )
  let widened = 0
  for (const row of rows) {
    const next = [...new Set([...row.ops, ...ops])].sort()
    if (next.length === row.ops.length) continue
    await setLoadout(db, row.principal, pack, next)
    widened++
  }
  console.info(
    `${pack} ${live.version}: ${widened} of ${rows.length} agents holding ${held} widened`,
  )
} finally {
  await db.close()
}
