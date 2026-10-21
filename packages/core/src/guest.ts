import { Refused } from './errors'
import { changed } from './events'
import { kindOf } from './pack'
import {
  execute,
  log,
  logSql,
  type CoreDeps,
  type LogEntry,
  PATH_PART,
  resolve,
  validate,
} from './run'

/**
 * Guests: people with no account, holding a capability (a share link's token). A pack marks the
 * moves a guest may call (`Op.guest`); each runs with no person, the capability as the call's
 * `claims.capability()`, as pack_runtime under the same row rules as any call, so the pack's policies
 * decide what a token opens. No loadout applies: the capability is the right.
 */

/** Guest calls and guest writes per address per minute (all packs), and the shortest capability. */
const LIMIT = 30
const WRITE_LIMIT = 10
export const MIN_CAPABILITY = 32
const hits = new Map<string, number[]>()

/**
 * Counts a guest call. In memory: the core runs as one instance, and a restart forgetting the
 * counts is harmless.
 */
function limit(key: string, most: number) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000)
  if (recent.length >= most) throw new Refused(429, 'TOO_MANY', 'too many requests; wait a minute')
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 10_000) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= 60_000)) hits.delete(k)
  }
}

/** Forgets every count: tests only. */
export function resetGuestLimits() {
  hits.clear()
}

/** One guest call. `address` is where it came from, as the platform reports it. */
export async function callGuest(
  deps: CoreDeps,
  req: { address: string; pack: string; op: string; input: unknown },
) {
  const entry: LogEntry = {
    principal: null,
    agentOf: null,
    pack: PATH_PART.test(req.pack) ? req.pack : '?',
    version: null,
    op: PATH_PART.test(req.op) ? req.op : '?',
    // The capability is a right like a password: the log keeps none of the input until it knows
    // which field holds it, then keeps only its start.
    input: null,
    status: 200,
    code: null,
  }
  try {
    // Per address, not per pack: a made-up pack name in the path is no new allowance.
    limit(req.address, LIMIT)
    const live = await resolve(deps.db, deps.environment, req.pack)
    entry.version = live.version
    const op = live.content.ops[req.op]
    // A move that is not a guest's answers as one that is not there.
    if (!op?.guest) throw new Refused(404, 'OP_NOT_FOUND', `no move ${req.op}`)
    const field = op.guest.capability
    if (req.input && typeof req.input === 'object') {
      const given = (req.input as Record<string, unknown>)[field]
      entry.input = {
        ...req.input,
        [field]: typeof given === 'string' ? `${given.slice(0, 4)}…` : given,
      }
    }
    if (kindOf(op) !== 'read') limit(`${req.address}|write`, WRITE_LIMIT)
    const input = validate(live, op, req.input)
    const capability = input[field]
    if (typeof capability !== 'string' || capability.length < MIN_CAPABILITY) {
      throw new Refused(404, 'NOT_FOUND', 'not found')
    }
    const result = await execute(
      deps,
      live.content,
      op,
      { principal: '', person: '', agent: null, capability },
      input,
      { done: async (tx) => tx.atCommit(logSql(entry)) },
    )
    // A guest's comment or edit reaches the team's open screens, as any write does.
    if (kindOf(op) !== 'read') changed(req.pack)
    return result
  } catch (err) {
    entry.status = err instanceof Refused ? err.status : 500
    entry.code = err instanceof Refused ? err.code : 'INTERNAL'
    await log(deps.db, entry).catch((logErr: unknown) => console.error('op log failed', logErr))
    throw err
  }
}
