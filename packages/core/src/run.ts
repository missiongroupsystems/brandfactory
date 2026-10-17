import { createHash } from 'node:crypto'
import { Ajv, type ValidateFunction } from 'ajv'
import { type AuthProvider } from './auth'
import { type Conn, type Db, type Row } from './db'
import { Refused } from './errors'
import { canonical, kindOf, type Manifest, type Op, type PackContent, type Rule } from './pack'
import { liveVersion, pgError, type LiveVersion } from './registry'
import { approveIn, fire } from './effects'
import { changed } from './events'
import { plannedCalls, schedule, type PlannedCall } from './scheduler'
import { bind } from './sql'

export interface CoreDeps {
  db: Db
  auth: AuthProvider
  /** Which pointer this core reads: 'local', 'staging', 'production'. */
  environment: string
  /** The clock every move reads as `:now`; tests pin it. */
  now: () => Date
  /** Longest a move's statement may run. Not enforced by PGlite. */
  statementTimeoutMs?: number
  /** Where effect moves send what they send, by the name a move gives. */
  connectors?: Record<string, Connector>
  /** How often a running scheduled call beats (`scheduler.ts`); 30 s unless set. */
  heartbeatMs?: number
}

/** The way out of the app for effect moves: a platform, a message, a payment. */
export interface Connector {
  /** Sends one payload; answers what came back (an id on the platform, say). */
  send(input: { pack: string; op: string; payload: unknown }): Promise<unknown>
}

/**
 * Sets the caller's claims and the time limit, as the login role, before a call drops to
 * pack_runtime (which cannot call set_config, reset the role or read the registry). Identity
 * comes from the verified token alone; anything else a policy needs it looks up itself.
 */
export async function setClaims(
  tx: Conn,
  deps: Pick<CoreDeps, 'statementTimeoutMs'>,
  caller: Caller,
) {
  await tx.query(
    `select set_config('app.user_id', $1, true), set_config('app.agent_id', $2, true),
            set_config('statement_timeout', $3, true), set_config('timezone', 'UTC', true),
            set_config('app.capability', $4, true)`,
    [
      caller.person,
      caller.agent ?? '',
      String(deps.statementTimeoutMs ?? 5000),
      caller.capability ?? '',
    ],
  )
}

/** The parameters every statement of a call may read: the input and the core's own. */
export function paramsOf(
  deps: Pick<CoreDeps, 'now'>,
  caller: Caller,
  input: Record<string, unknown>,
) {
  return {
    ...input,
    now: deps.now().toISOString(),
    actor: caller.person,
    agent: caller.agent,
    fields: input,
  }
}

/** Who is calling: a person, or an agent and the person it acts for. */
export interface Caller {
  principal: string
  /** The person whose data the call reaches: the principal, or the agent's person. */
  person: string
  agent: string | null
  /**
   * A guest's capability (a link's token): what a guest move's row rules key on. Set for guest
   * calls only (`guest.ts`), which have no person.
   */
  capability?: string
}

// 1. Who are you.
export async function authenticate(auth: AuthProvider, header: string | undefined) {
  const match = header ? /^Bearer\s+(.+)$/i.exec(header) : null
  if (!match) throw new Refused(401, 'UNAUTHORIZED', 'missing bearer token')
  try {
    return (await auth.verifyToken(match[1]!.trim())).userId
  } catch {
    throw new Refused(401, 'UNAUTHORIZED', 'invalid token')
  }
}

// 2. Which version is live.
export async function resolve(db: Conn, environment: string, pack: string) {
  const live = await liveVersion(db, environment, pack)
  if (!live) throw new Refused(404, 'PACK_NOT_LIVE', `${pack} has no live version`)
  return live
}

// 3. May you call this move. An agent needs the move in its own loadout and in its person's, read
// on every call, so a right taken from the person is gone from the agent at once.
export async function authorise(
  db: Conn,
  principal: string,
  live: LiveVersion,
  opName: string,
): Promise<{ op: Op; caller: Caller }> {
  const [who] = await db.query<{ agent_of: string | null }>(
    'select agent_of from packs.principals where id = $1',
    [principal],
  )
  if (!who) throw new Refused(403, 'NO_ACCOUNT', 'this account has no access')
  const op = live.content.ops[opName]
  if (!op) throw new Refused(404, 'OP_NOT_FOUND', `no move ${opName}`)
  const holders = who.agent_of ? [principal, who.agent_of] : [principal]
  const rows = await db.query<{ principal: string }>(
    `select principal from packs.loadouts
     where pack = $1 and principal = any($2) and $3 = any(ops)`,
    [live.content.manifest.name, holders, opName],
  )
  if (rows.length !== holders.length) {
    throw new Refused(403, 'FORBIDDEN', `${opName} is not in the loadout`)
  }
  return {
    op,
    caller: {
      principal,
      person: who.agent_of ?? principal,
      agent: who.agent_of ? principal : null,
    },
  }
}

// 4. Is the input valid.
const ajv = new Ajv({ allErrors: true, strict: true })
const validators = new Map<string, ValidateFunction>()

export function validate(live: LiveVersion, op: Op, input: unknown) {
  const key = `${live.hash}:${op.name}`
  let check = validators.get(key)
  if (!check) {
    check = ajv.compile(op.input)
    validators.set(key, check)
  }
  if (!check(input)) {
    throw new Refused(400, 'VALIDATION', 'validation failed', { details: check.errors })
  }
  return input as Record<string, unknown>
}

/**
 * Turns a database error into the refusal the pack named for its constraint or trigger, or a
 * generic one. Anything else is a fault and is thrown on.
 */
export function refusalOf(err: unknown, manifest: Manifest): Refused | null {
  const e = pgError(err)
  const named = e.constraint ? manifest.errors?.[e.constraint] : undefined
  if (named) return new Refused(named.status, named.code, named.message)
  // A row the caller's row rules do not let them write: the same answer as a row that is not
  // there, so a guess learns nothing.
  if (e.code === '42501' && /row-level security/.test(e.message)) {
    return new Refused(404, 'NOT_FOUND', 'not found')
  }
  if (e.code === '23505') return new Refused(409, 'CONFLICT', 'this conflicts with another row')
  if (e.code === '57014') return new Refused(503, 'TIMEOUT', 'the move took too long')
  if (e.code?.startsWith('22')) return new Refused(400, 'BAD_INPUT', e.message)
  return null
}

export async function checkRule(tx: Conn, rule: Rule, params: Record<string, unknown>) {
  const { text, params: values } = bind(rule.sql, params)
  const [row] = await tx.query<{ ok?: unknown; details?: unknown; message?: unknown }>(text, values)
  if (row?.ok !== true) {
    // A rule may word its refusal for the case at hand in a `message` column.
    const message = typeof row?.message === 'string' ? row.message : rule.message
    throw new Refused(rule.status, rule.code, message, {
      rule: rule.id,
      ...(row?.details != null && { details: row.details }),
    })
  }
}

const KEY = /^[A-Za-z0-9_-]{8,100}$/

/** A row of one column named `result` answers with that value; any other row as it is. */
export const unwrap = (row: Row) => {
  const keys = Object.keys(row)
  return keys.length === 1 && keys[0] === 'result' ? row.result : row
}

// 5–7. Do the before-rules pass, run the statement under row-level security, do the after-rules
// pass. One transaction: a refusal at any step undoes the whole call. `done` runs last in the
// same transaction, back as the login role, so a write and its log row commit together.
//
// With an idempotency `key`, the call first claims the key. A second call under the same key
// waits for the first to commit, then gets its answer; under the same key with other input it is
// refused. A first call that was refused leaves no claim, so the key can be used again.
export async function execute(
  deps: Pick<CoreDeps, 'db' | 'now' | 'statementTimeoutMs'>,
  content: PackContent,
  op: Op,
  caller: Caller,
  input: Record<string, unknown>,
  opts: { key?: string; done?: (tx: Conn) => Promise<void> } = {},
) {
  const { key, done } = opts
  if (key !== undefined && !KEY.test(key)) {
    throw new Refused(400, 'VALIDATION', 'an idempotency key is 8-100 letters, digits, - or _')
  }
  // A read changes nothing, so it runs again rather than keep a copy of what it read.
  const keyed = key !== undefined && kindOf(op) === 'write'
  const claim = [caller.principal, content.manifest.name, op.name, key]
  const params = paramsOf(deps, caller, input)
  try {
    return await deps.db.transaction(async (tx) => {
      // The time limit is set first, so it also bounds a wait on another call's key.
      await setClaims(tx, deps, caller)
      let replay: { result: unknown } | null = null
      if (keyed) {
        const hash = createHash('sha256').update(canonical(input)).digest('hex')
        const [fresh] = await tx.query(
          `insert into packs.idempotency (principal, pack, op, key, input_hash)
           values ($1, $2, $3, $4, $5) on conflict do nothing returning key`,
          [...claim, hash],
        )
        if (!fresh) {
          const [seen] = await tx.query<{ input_hash: string; result: unknown }>(
            `select input_hash, result from packs.idempotency
             where principal = $1 and pack = $2 and op = $3 and key = $4`,
            claim,
          )
          if (seen?.input_hash !== hash) {
            throw new Refused(409, 'KEY_REUSED', 'this key was used for another call')
          }
          replay = { result: seen.result }
        }
      }
      await tx.exec('set local role pack_runtime')
      // A replay passes the before-rules again, so a caller who lost access since the first call
      // gets the refusal, not the stored answer.
      for (const id of op.before ?? []) await checkRule(tx, content.rules[id]!, params)
      if (replay) {
        await tx.exec('reset role')
        await done?.(tx)
        return replay.result
      }
      const { text, params: values } = bind(op.sql, params)
      const rows = await tx.query(text, values)
      for (const id of op.after ?? []) await checkRule(tx, content.rules[id]!, params)
      let later: PlannedCall[] = []
      let result: unknown
      if (op.returns === 'many') {
        result = rows.map(unwrap)
      } else if (rows.length === 0) {
        const e = op.empty ?? { status: 404, code: 'NOT_FOUND', message: 'not found' }
        throw new Refused(e.status, e.code, e.message)
      } else if (rows.length > 1) {
        throw new Error(`${op.name} returned ${rows.length} rows, not one`)
      } else {
        const row = rows[0]!
        // A `schedule` column beside `result` asks for later calls (`scheduler.ts`).
        if ('schedule' in row) {
          later = plannedCalls(row.schedule, content, op)
          delete row.schedule
        }
        result = unwrap(row)
      }
      if (keyed || done || later.length > 0) await tx.exec('reset role')
      await schedule(tx, content, caller.principal, later)
      // A person's yes, given with the asking (`PlannedCall.approve`).
      if (!caller.agent) {
        for (const c of later.filter((c) => c.approve)) {
          await approveIn(tx, deps, content, content.ops[c.op]!, caller, c.input)
        }
      }
      if (keyed) {
        await tx.query(
          `update packs.idempotency set result = $5
           where principal = $1 and pack = $2 and op = $3 and key = $4`,
          [...claim, JSON.stringify(result ?? null)],
        )
      }
      await done?.(tx)
      return result
    })
  } catch (err) {
    if (err instanceof Refused) throw err
    throw refusalOf(err, content.manifest) ?? err
  }
}

// 8. Write it to the log: every call, refused or not.
export interface LogEntry {
  principal: string | null
  agentOf: string | null
  pack: string
  version: string | null
  op: string
  input: unknown
  status: number
  code: string | null
}

/** The most input text a log row keeps; past it the row says how long the input was. */
const LOG_INPUT_MAX = 16_000

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g

/** Text jsonb can hold: no NUL, and no half of a surrogate pair. */
const clean = (text: string) => text.replaceAll('\u0000', '').replace(LONE_SURROGATE, '\ufffd')

function cleaned(value: unknown): unknown {
  if (typeof value === 'string') return clean(value)
  if (Array.isArray(value)) return value.map(cleaned)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [clean(k), cleaned(v)]))
  }
  return value
}

/** Input as the log keeps it: every string cleaned before it is serialized, and capped. */
function loggedInput(input: unknown): string | null {
  const text = JSON.stringify(cleaned(input))
  if (text === undefined) return null
  return text.length > LOG_INPUT_MAX ? JSON.stringify({ truncated: text.length }) : text
}

/** A pack or move name as the log keeps it; anything else is logged as `?`. */
export const PATH_PART = /^[a-z][a-z0-9_.]{0,99}$/

export async function log(db: Conn, entry: LogEntry) {
  await db.query(
    `insert into packs.op_calls (principal, agent_of, pack, version, op, input, status, code)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.principal === null ? null : clean(entry.principal).slice(0, 200),
      entry.agentOf,
      entry.pack,
      entry.version,
      entry.op,
      loggedInput(entry.input),
      entry.status,
      entry.code,
    ],
  )
}

/** One call through the eight checks. Answers the result, or throws a `Refused`; logs both. */
export async function call(
  deps: CoreDeps,
  req: {
    authorization: string | undefined
    pack: string
    op: string
    input: unknown
    /** An idempotency key: the same call sent again under it runs once. */
    key?: string
    /**
     * The scheduler's own calls only: who asked for this call, already checked when it was
     * asked for. Never set from a request.
     */
    as?: string
  },
) {
  const entry: LogEntry = {
    principal: null,
    agentOf: null,
    // A path part that is not a name is logged as one, never as what was sent.
    pack: PATH_PART.test(req.pack) ? req.pack : '?',
    version: null,
    op: PATH_PART.test(req.op) ? req.op : '?',
    input: req.input,
    status: 200,
    code: null,
  }
  try {
    entry.principal = req.as ?? (await authenticate(deps.auth, req.authorization))
    const live = await resolve(deps.db, deps.environment, req.pack)
    entry.version = live.version
    const { op, caller } = await authorise(deps.db, entry.principal, live, req.op)
    entry.agentOf = caller.agent ? caller.person : null
    const input = validate(live, op, req.input)
    const done = (tx: Conn) => log(tx, entry)
    const kind = kindOf(op)
    const result =
      kind === 'effect'
        ? await fire(deps, live.content, op, caller, input, done)
        : await execute(deps, live.content, op, caller, input, { key: req.key, done })
    if (kind !== 'read') changed(req.pack)
    return result
  } catch (err) {
    entry.status = err instanceof Refused ? err.status : 500
    entry.code = err instanceof Refused ? err.code : 'INTERNAL'
    // The refusal is the answer; a log row that cannot be written must not replace it.
    await log(deps.db, entry).catch((logErr: unknown) => console.error('op log failed', logErr))
    throw err
  }
}
