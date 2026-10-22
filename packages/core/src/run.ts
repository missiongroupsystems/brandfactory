import { createHash } from 'node:crypto'
import { Ajv, type ValidateFunction } from 'ajv'
import { type AgentTokens } from './agents'
import { type AuthProvider } from './auth'
import { type Conn, type Db, isCoreRefusal, isStalePlan, type Row, type Saved, type Tx } from './db'
import { claimsSql, principalClaimsSql, textLiteral } from './claims'
import { Refused } from './errors'
import { canonical, kindOf, type Manifest, type Op, type PackContent, type Rule } from './pack'
import { liveVersion, pgError, type LiveVersion } from './registry'
import { approveIn, fire } from './effects'
import { type Files, newKey, withUpload } from './files'
import { changed } from './events'
import { plannedCalls, schedule, type PlannedCall } from './scheduler'
import { bind, closes, inline, literal, withoutSemicolon, writes } from './sql'

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
  /** Where uploaded files live (`files.ts`); a core without it refuses upload moves. */
  files?: Files
  /** Signs agents' tokens (`agents.ts`); a core without it starts no agent sessions. */
  agents?: AgentTokens
}

/** The way out of the app for effect moves: a platform, a message, a payment. */
export interface Connector {
  /** Sends one payload; answers what came back (an id on the platform, say). */
  send(input: { pack: string; op: string; payload: unknown }): Promise<unknown>
}

/**
 * Sets the caller's claims and the time limit, as the login role, before a call drops to
 * pack_runtime. The claims go in `claims.calls`, which the pack roles can read for their own
 * transaction but not write, so no statement can name another caller even where the runtime role
 * can call set_config (Supabase). Identity comes from the verified token alone; anything else a
 * policy needs it looks up itself.
 */
export async function setClaims(
  tx: Conn,
  deps: Pick<CoreDeps, 'statementTimeoutMs'>,
  caller: Caller,
) {
  await tx.exec(claimsOf(deps, caller))
}

/** What `setClaims` runs, as one text, for a caller that sends it with its begin. */
export function claimsOf(deps: Pick<CoreDeps, 'statementTimeoutMs'>, caller: Caller) {
  const claims = claimsSql({
    user_id: caller.person,
    agent_id: caller.agent ?? '',
    capability: caller.capability ?? '',
  })
  return `${claims};\n${settingsOf(deps)}`
}

/** The time limit and the zone, for this transaction only. */
function settingsOf(deps: Pick<CoreDeps, 'statementTimeoutMs'>) {
  const ms = deps.statementTimeoutMs ?? 5000
  if (!Number.isSafeInteger(ms) || ms < 0)
    throw new Error(`statement timeout ${ms} is not a number of ms`)
  return `select set_config('statement_timeout', '${ms}', true), set_config('timezone', 'UTC', true)`
}

/**
 * The first trip of a call whose live version this process has seen: the claims, written from
 * the principal's row (none when there is no such principal), the settings, and a check row read
 * back from those claims: the live pointer's hash, whether a claims row exists, the person when
 * the caller is an agent, and how many of the loadouts it needs hold the move (as `authorise`
 * counts them). The move runs under exactly the claims the check judged. Every caller value goes
 * in as a literal.
 */
function checkOf(
  deps: Pick<CoreDeps, 'statementTimeoutMs' | 'environment'>,
  pack: string,
  principal: string,
  opName: string,
) {
  const [env, pk, op] = [deps.environment, pack, opName].map(textLiteral)
  return `${principalClaimsSql(principal)};
     ${settingsOf(deps)};
     select (select v.content_hash from packs.channels ch
             join packs.pack_versions v on v.pack = ch.pack and v.version = ch.version
             where ch.environment = ${env} and ch.pack = ${pk}) as core_check,
       c.xact is not null as known,
       case when c.agent_id <> '' then c.user_id end as agent_of,
       (select count(*)::int from packs.loadouts l
        where l.pack = ${pk} and l.principal in (c.user_id, nullif(c.agent_id, ''))
          and ${op} = any(l.ops)) as held
     from (select 1) one
     left join claims.calls c on c.xact = pg_current_xact_id_if_assigned()`
}

/** What goes with the begin: the drop to pack_runtime too, unless a key is claimed first. */
const firstOf = (claims: string, keyed: boolean) =>
  keyed ? claims : `${claims};\nset local role pack_runtime`

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
  // The principal and the loadouts that hold the move (its own, and an agent's person's), in one
  // statement.
  const [who] = await db.query<{ agent_of: string | null; held: number }>(
    `select p.agent_of, (select count(*)::int from packs.loadouts l
       where l.pack = $2 and l.principal in (p.id, p.agent_of) and $3 = any(l.ops)) as held
     from packs.principals p where p.id = $1`,
    [principal, live.content.manifest.name, opName],
  )
  return admit(who, principal, live, opName)
}

/** Step 3's refusals, from the principal's row and the loadouts that hold the move. */
function admit(
  who: { agent_of: string | null; held: number } | undefined,
  principal: string,
  live: LiveVersion,
  opName: string,
): { op: Op; caller: Caller } {
  if (!who) throw new Refused(403, 'NO_ACCOUNT', 'this account has no access')
  const op = live.content.ops[opName]
  if (!op) throw new Refused(404, 'OP_NOT_FOUND', `no move ${opName}`)
  if (who.held !== (who.agent_of ? 2 : 1)) {
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
  const [row] = await tx.query<{ ok?: unknown; details?: unknown; message?: unknown }>(
    text,
    values,
    { prepare: true },
  )
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
  opts: { key?: string; done?: (tx: Tx) => Promise<void> } = {},
) {
  try {
    // The claims and the time limit go with the begin, in one round trip; so does the drop to
    // pack_runtime when no key is claimed first. The time limit also bounds a wait on another
    // call's key.
    return await deps.db.transaction(
      (tx) => moveIn(tx, deps, content, op, caller, input, opts),
      firstOf(claimsOf(deps, caller), isKeyed(op, opts.key)),
    )
  } catch (err) {
    if (err instanceof Refused) throw err
    throw refusalOf(err, content.manifest) ?? err
  }
}

/** A read changes nothing, so it runs again rather than keep a copy of what it read. */
const isKeyed = (op: Op, key: string | undefined) => key !== undefined && kindOf(op) === 'write'

/** A call in its transaction, after the first trip has set the claims and the settings. */
async function moveIn(
  tx: Tx,
  deps: Pick<CoreDeps, 'now' | 'statementTimeoutMs'>,
  content: PackContent,
  op: Op,
  caller: Caller,
  input: Record<string, unknown>,
  opts: { key?: string; done?: (tx: Tx) => Promise<void> },
) {
  const { key, done } = opts
  if (key !== undefined && !KEY.test(key)) {
    throw new Refused(400, 'VALIDATION', 'an idempotency key is 8-100 letters, digits, - or _')
  }
  const keyed = isKeyed(op, key)
  const claim = [caller.principal, content.manifest.name, op.name, key]
  const params: Record<string, unknown> = paramsOf(deps, caller, input)
  // An upload move's new file gets a key the core makes, never one the client sends.
  if (op.upload) params.file = newKey(content.manifest.name, input[op.upload.type])
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
  if (keyed) await tx.exec('set local role pack_runtime')
  // A replay passes the before-rules again, so a caller who lost access since the first call
  // gets the refusal, not the stored answer.
  for (const id of op.before ?? []) await checkRule(tx, content.rules[id]!, params)
  if (replay) {
    await tx.exec('reset role')
    await done?.(tx)
    return replay.result
  }
  const { text, params: values } = bind(op.sql, params)
  const rows = await tx.query(text, values, { prepare: true })
  for (const id of op.after ?? []) await checkRule(tx, content.rules[id]!, params)
  return answer(tx, deps, content, op, caller, rows, { keyed, claim, done })
}

/** The move's rows as the call's answer, then what follows in the transaction, as pack_runtime. */
async function answer(
  tx: Tx,
  deps: Pick<CoreDeps, 'now' | 'statementTimeoutMs'>,
  content: PackContent,
  op: Op,
  caller: Caller,
  rows: Row[],
  opts: { keyed: boolean; claim: unknown[]; done?: (tx: Tx) => Promise<void> },
) {
  const { keyed, claim, done } = opts
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
  // Back to the login role for what follows; with only `done` left, it goes with the commit.
  if (keyed || later.length > 0) await tx.exec('reset role')
  else if (done) tx.atCommit('reset role')
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
  await db.exec(logSql(entry))
}

/** The statement `log` runs, for a transaction that sends it with its commit (`Tx.atCommit`). */
export function logSql(entry: LogEntry) {
  if (!Number.isSafeInteger(entry.status)) throw new Error(`status ${entry.status} is not a number`)
  const input = loggedInput(entry.input)
  const values = [
    textLiteral(entry.principal === null ? null : clean(entry.principal).slice(0, 200)),
    textLiteral(entry.agentOf),
    textLiteral(entry.pack),
    textLiteral(entry.version),
    textLiteral(entry.op),
    input === null ? 'null' : `${textLiteral(input)}::jsonb`,
    String(entry.status),
    textLiteral(entry.code),
  ]
  return `insert into packs.op_calls (principal, agent_of, pack, version, op, input, status, code)
     values (${values.join(', ')})`
}

/**
 * The live version this process last read, per database, environment and pack: it lets the next
 * call check the pointer in its first trip instead of reading it first. It is never trusted
 * alone; the hash in that trip decides.
 */
const lastLive = new WeakMap<Db, Map<string, LiveVersion>>()

function remember(db: Db, environment: string, pack: string, live: LiveVersion | null) {
  let seen = lastLive.get(db)
  if (!seen) lastLive.set(db, (seen = new Map()))
  const key = JSON.stringify([environment, pack])
  if (live) seen.set(key, live)
  else seen.delete(key)
}

const recalled = (db: Db, environment: string, pack: string) =>
  lastLive.get(db)?.get(JSON.stringify([environment, pack]))

/**
 * The person each principal acted for when this process last admitted it (null for a person
 * acting for itself), per database. Never trusted alone: `packs.judge` refuses the call as STALE
 * when it changed.
 */
const lastWho = new WeakMap<Db, Map<string, string | null>>()

function remembered(db: Db, principal: string, agentOf: string | null) {
  let seen = lastWho.get(db)
  if (!seen) lastWho.set(db, (seen = new Map()))
  seen.set(principal, agentOf)
}

/** The live version moved since this process last read it: the call starts again the long way. */
const STALE = Symbol('stale')

/** The call cannot go in one trip as it stands: it goes the way it went before. */
const SLOW = Symbol('slow')

type Request = Parameters<typeof call>[1]

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
    // A read or a write by a principal, of a version this process has read: one first trip.
    // The scheduler's calls, effects and moves the version lacks go the long way.
    const seen = req.as === undefined ? recalled(deps.db, deps.environment, req.pack) : undefined
    const known = seen && Object.hasOwn(seen.content.ops, req.op) ? seen : undefined
    const kind = known && kindOf(known.content.ops[req.op]!)
    // A read of a principal this process has admitted: the rules and the move go in the first
    // trip too (`inOneRead`).
    const who = lastWho.get(deps.db)?.get(entry.principal)
    let out: Awaited<ReturnType<typeof theLongWay>> | typeof STALE | typeof SLOW =
      known && kind === 'read' && !known.content.ops[req.op]!.upload && who !== undefined
        ? await inOneRead(deps, req, entry, known, who)
        : SLOW
    if (out === SLOW)
      out = known && kind !== 'effect' ? await inOneTrip(deps, req, entry, known) : STALE
    if (out === STALE) out = await theLongWay(deps, req, entry)
    const { op, result } = out
    if (kindOf(op) !== 'read') changed(req.pack)
    return op.upload ? await withUpload(deps.files, req.pack, result) : result
  } catch (err) {
    entry.status = err instanceof Refused ? err.status : 500
    entry.code = err instanceof Refused ? err.code : 'INTERNAL'
    // The refusal is the answer; a log row that cannot be written must not replace it.
    await log(deps.db, entry).catch((logErr: unknown) => console.error('op log failed', logErr))
    throw err
  }
}

/** Steps 2 to 7, each read in its own trip: the pointer, then the principal, then the move. */
async function theLongWay(deps: CoreDeps, req: Request, entry: LogEntry) {
  const live = await resolve(deps.db, deps.environment, req.pack).catch((err: unknown) => {
    remember(deps.db, deps.environment, req.pack, null)
    throw err
  })
  remember(deps.db, deps.environment, req.pack, live)
  entry.version = live.version
  const { op, caller } = await authorise(deps.db, entry.principal!, live, req.op)
  entry.agentOf = caller.agent ? caller.person : null
  remembered(deps.db, caller.principal, entry.agentOf)
  const input = validate(live, op, req.input)
  // Before the move runs: a record whose file has nowhere to go is not made.
  if (op.upload && !deps.files) throw new Refused(501, 'NO_FILES', 'this core keeps no files')
  const done = async (tx: Tx) => tx.atCommit(logSql(entry))
  const result =
    kindOf(op) === 'effect'
      ? await fire(deps, live.content, op, caller, input, done)
      : await execute(deps, live.content, op, caller, input, { key: req.key, done })
  return { op, result }
}

/**
 * Steps 2 to 7 with the pointer, the principal and the loadouts read in the first trip, beside
 * the claims. Each refusal comes in the same order as the long way's; any refusal rolls back.
 */
async function inOneTrip(deps: CoreDeps, req: Request, entry: LogEntry, live: LiveVersion) {
  const principal = entry.principal!
  const keyed = isKeyed(live.content.ops[req.op]!, req.key)
  try {
    return await deps.db.transaction(
      async (tx, [check]) => {
        if (check?.core_check !== live.hash) throw STALE
        // Only now is this the version the call runs: a first trip that failed logs none.
        entry.version = live.version
        const who = check.known
          ? { agent_of: check.agent_of as string | null, held: check.held as number }
          : undefined
        const { op, caller } = admit(who, principal, live, req.op)
        entry.agentOf = caller.agent ? caller.person : null
        remembered(deps.db, principal, entry.agentOf)
        const input = validate(live, op, req.input)
        if (op.upload && !deps.files) throw new Refused(501, 'NO_FILES', 'this core keeps no files')
        const done = async (t: Tx) => t.atCommit(logSql(entry))
        const result = await moveIn(tx, deps, live.content, op, caller, input, {
          key: req.key,
          done,
        })
        return { op, result }
      },
      firstOf(checkOf(deps, req.pack, principal, req.op), keyed),
    )
  } catch (err) {
    if (err === STALE) {
      entry.version = null
      return STALE
    }
    if (err instanceof Refused) throw err
    throw refusalOf(err, live.content.manifest) ?? err
  }
}

/**
 * Whether a move's statements may go among the core's own in one text, per version and move:
 * each closes every quote it opens (`closes`), and no rule writes, since a rule goes inside a
 * sub-select there, where Postgres refuses a statement that writes before the check has run.
 */
const fitting = new Map<string, boolean>()

function fits(live: LiveVersion, op: Op) {
  const key = `${live.hash}:${op.name}`
  let ok = fitting.get(key)
  if (ok === undefined) {
    const rules = [...(op.before ?? []), ...(op.after ?? [])].map((id) => live.content.rules[id]!)
    ok = closes(op.sql) && rules.every((r) => closes(r.sql) && !writes(r.sql))
    fitting.set(key, ok)
  }
  return ok
}

/**
 * Whether a refusal the database raised came from `fn` itself (migration 0008), named with its
 * argument types as Postgres names it in the error's context, in any message language. A pack's
 * own function that raises the same error is named with its own schema there, and a name that
 * spells `fn` inside it needs quotes, which `fn`'s own line never has.
 */
const raisedIn = (err: unknown, fn: string) => {
  const innermost = ((err as { where?: string }).where ?? '').split('\n')[0]!
  return innermost.includes(` ${fn} `) && !innermost.includes('"')
}

/**
 * Steps 2 to 7 of a read in one trip, and the commit in a second: the claims, the check
 * (`packs.judge`), the drop to pack_runtime, the before-rules (`claims.rule_ok`), the move and the
 * after-rules; then the log row with the commit. The database stops the first trip at the first
 * refusal, so nothing runs after it and nothing commits; the refusals come in the order of
 * `inOneTrip`. With saved statements (`Db.saves`) each rule and the move keep a plan per
 * connection.
 */
async function inOneRead(
  deps: CoreDeps,
  req: Request,
  entry: LogEntry,
  live: LiveVersion,
  agentOf: string | null,
) {
  const principal = entry.principal!
  const { content } = live
  const op = content.ops[req.op]!
  if (!fits(live, op)) return SLOW
  // Input that is not valid goes the other way, where a caller without the move is refused first.
  let input: Record<string, unknown>
  try {
    input = validate(live, op, req.input)
  } catch {
    return SLOW
  }
  const caller: Caller = {
    principal,
    person: agentOf ?? principal,
    agent: agentOf ? principal : null,
  }
  const params = paramsOf(deps, caller, input)
  // A NUL byte cannot go in a statement's text, only in a parameter, which Postgres refuses as
  // bad input: such a call goes the other way, to get that answer.
  if (Object.values(params).some((v) => typeof v === 'string' && v.includes('\u0000'))) {
    return SLOW
  }
  const saved: Saved[] = []
  // A statement with its values: run by name where the server keeps statements, inline otherwise.
  const run = (sql: string, wrap: (text: string) => string = (t) => t) => {
    if (!deps.db.saves) return wrap(withoutSemicolon(inline(sql, params)))
    const { text, params: values } = bind(withoutSemicolon(sql), params)
    const full = wrap(text)
    const name = `one_${createHash('sha256').update(full).digest('hex').slice(0, 40)}`
    if (!saved.some((s) => s.name === name)) saved.push({ name, text: full })
    return values.length ? `execute ${name}(${values.map(literal).join(', ')})` : `execute ${name}`
  }
  const rule = (id: string) =>
    run(
      content.rules[id]!.sql,
      (text) => `select claims.rule_ok(to_jsonb(r), ${textLiteral(id)}) as ok
        from (select 1) as one left join lateral (select * from (${text}) as rule limit 1) as r on true`,
    )
  const before = (op.before ?? []).map(rule)
  const [env, pk, name, hash, of] = [deps.environment, req.pack, req.op, live.hash, agentOf].map(
    textLiteral,
  )
  const first = [
    principalClaimsSql(principal),
    settingsOf(deps),
    `select packs.judge(${env}, ${pk}, ${name}, ${hash}, ${of}) as core_check`,
    'set local role pack_runtime',
    ...before,
    run(op.sql),
    ...(op.after ?? []).map(rule),
  ]
  const moveAt = 4 + before.length
  try {
    return await deps.db.transaction(
      async (tx, _check, results) => {
        entry.version = live.version
        entry.agentOf = agentOf
        const done = async (t: Tx) => t.atCommit(logSql(entry))
        const result = await answer(tx, deps, content, op, caller, results[moveAt] ?? [], {
          keyed: false,
          claim: [],
          done,
        })
        return { op, result }
      },
      first.join(';\n'),
      saved,
    )
  } catch (err) {
    // A saved statement planned before its table changed shape: this call goes as before.
    if (saved.length > 0 && isStalePlan(err)) return SLOW
    if (isCoreRefusal(err) && raisedIn(err, 'packs.judge(text,text,text,text,text)')) {
      const { code } = JSON.parse((err as { detail?: string }).detail ?? '{}') as { code?: string }
      if (code === 'STALE') return STALE
      entry.version = live.version
      if (code === 'NO_ACCOUNT') throw new Refused(403, 'NO_ACCOUNT', 'this account has no access')
      throw new Refused(403, 'FORBIDDEN', `${req.op} is not in the loadout`)
    }
    entry.version = live.version
    entry.agentOf = agentOf
    if (isCoreRefusal(err) && raisedIn(err, 'claims.rule_ok(jsonb,text)')) {
      const d = JSON.parse((err as { detail?: string }).detail ?? '{}') as {
        rule?: string
        message?: unknown
        details?: unknown
      }
      const r =
        d.rule !== undefined && Object.hasOwn(content.rules, d.rule)
          ? content.rules[d.rule]
          : undefined
      if (r) {
        const message = typeof d.message === 'string' ? d.message : r.message
        throw new Refused(r.status, r.code, message, {
          rule: r.id,
          ...(d.details != null && { details: d.details }),
        })
      }
    }
    if (err instanceof Refused) throw err
    throw refusalOf(err, content.manifest) ?? err
  }
}
