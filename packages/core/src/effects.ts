import { createHash } from 'node:crypto'
import { type Conn } from './db'
import { Refused } from './errors'
import { canonical, kindOf, type Op, type PackContent } from './pack'
import {
  authenticate,
  authorise,
  checkRule,
  type Caller,
  type CoreDeps,
  log,
  type LogEntry,
  PATH_PART,
  paramsOf,
  refusalOf,
  resolve,
  setClaims,
  unwrap,
  validate,
} from './run'
import { bind } from './sql'

/**
 * Effect moves: the only way out of the app. Each needs a person's yes for exactly what goes
 * out (the move's payload), checked again when it fires, used once. An edit to what goes out
 * changes its hash, so it voids the yes.
 */

/** A connector that sends nothing, for tests and the demo: every payload goes through. */
export const simulatedConnector = {
  async send({ payload }: { payload: unknown }) {
    const id = createHash('sha256').update(canonical(payload)).digest('hex').slice(0, 12)
    return { externalId: `simulated-${id}` }
  },
}

/** What a yes binds: the payload and where it goes. A new connector needs a new yes. */
const hashOf = (connector: string, payload: unknown) =>
  createHash('sha256').update(canonical({ connector, payload })).digest('hex')

/** Longest a connector may take before the send counts as failed, its outcome unknown. */
const SEND_TIMEOUT_MS = 30_000

/** What a move would send now, for this caller, under their row rules and its before-rules. */
async function payloadOf(
  tx: Conn,
  deps: Pick<CoreDeps, 'now' | 'statementTimeoutMs'>,
  content: PackContent,
  op: Op,
  caller: Caller,
  input: Record<string, unknown>,
) {
  const params = paramsOf(deps, caller, input)
  await setClaims(tx, deps, caller)
  await tx.exec('set local role pack_runtime')
  for (const id of op.before ?? []) await checkRule(tx, content.rules[id]!, params)
  const { text, params: values } = bind(op.payload!, params)
  const rows = await tx.query(text, values)
  await tx.exec('reset role')
  if (rows.length !== 1) throw new Refused(404, 'NOT_FOUND', 'nothing to send')
  const payload = JSON.parse(JSON.stringify(unwrap(rows[0]!))) as unknown
  return { payload, hash: hashOf(op.connector!, payload) }
}

/**
 * Stores a person's yes to what an effect move would send now, in the caller's transaction, as
 * the login role. A yes already waiting for the same thing is not stored twice.
 */
export async function approveIn(
  tx: Conn,
  deps: Pick<CoreDeps, 'now' | 'statementTimeoutMs'>,
  content: PackContent,
  op: Op,
  caller: Caller,
  input: Record<string, unknown>,
) {
  const { payload, hash } = await payloadOf(tx, deps, content, op, caller, input)
  // A send of exactly this that used its yes and has not answered yet is on its way: a second
  // yes now would send it twice (two presses, two tabs).
  const [sending] = await tx.query(
    `select 1 from packs.approvals
     where pack = $1 and op = $2 and payload_hash = $3 and used_at is not null
       and outcome is null and used_at > now() - interval '2 minutes'`,
    [content.manifest.name, op.name, hash],
  )
  if (sending) throw new Refused(409, 'SENDING', 'this is on its way already')
  const [row] = await tx.query<{ id: string }>(
    `with open as (
       select id from packs.approvals
       where pack = $1 and op = $2 and payload_hash = $3 and approved_by = $4 and used_at is null
       limit 1)
     , made as (
       insert into packs.approvals (pack, op, payload_hash, approved_by)
       select $1, $2, $3, $4 where not exists (select 1 from open)
       returning id)
     select id::text from made union all select id::text from open`,
    [content.manifest.name, op.name, hash, caller.principal],
  )
  return { approval: row!.id, payload }
}

/**
 * `POST /approve/:pack/:op`: a person says yes to what this move would send now. The person
 * must hold the move in their loadout; an agent is refused here and by the database.
 */
export async function approve(
  deps: CoreDeps,
  req: { authorization: string | undefined; pack: string; op: string; input: unknown },
) {
  const entry: LogEntry = {
    principal: null,
    agentOf: null,
    pack: PATH_PART.test(req.pack) ? req.pack : '?',
    version: null,
    op: PATH_PART.test(req.op) ? req.op : '?',
    input: req.input,
    status: 200,
    code: 'APPROVED',
  }
  try {
    entry.principal = await authenticate(deps.auth, req.authorization)
    const live = await resolve(deps.db, deps.environment, req.pack)
    entry.version = live.version
    const { op, caller } = await authorise(deps.db, entry.principal, live, req.op)
    entry.agentOf = caller.agent ? caller.person : null
    if (caller.agent) throw new Refused(403, 'NOT_A_PERSON', 'only a person can approve')
    if (kindOf(op) !== 'effect') throw new Refused(400, 'NOT_AN_EFFECT', `${op.name} sends nothing`)
    const input = validate(live, op, req.input)
    return await deps.db.transaction(async (tx) => {
      const made = await approveIn(tx, deps, live.content, op, caller, input)
      await log(tx, entry)
      return made
    })
  } catch (err) {
    const refused =
      err instanceof Refused ? err : (refusalOf(err, { name: req.pack, version: '' }) ?? null)
    entry.status = refused?.status ?? 500
    entry.code = refused?.code ?? 'INTERNAL'
    await log(deps.db, entry).catch((logErr: unknown) => console.error('op log failed', logErr))
    throw refused ?? err
  }
}

/**
 * Fires an effect move: works out what goes out now, uses up a person's yes for exactly that,
 * sends it, then records the answer with the move's statement (`:outcome`). The yes is used
 * before the send, so a send whose outcome is unknown can never go again without a new yes.
 */
export async function fire(
  deps: CoreDeps,
  content: PackContent,
  op: Op,
  caller: Caller,
  input: Record<string, unknown>,
  done: (tx: Conn) => Promise<void>,
) {
  const connectors = deps.connectors ?? {}
  const connector = Object.hasOwn(connectors, op.connector!) ? connectors[op.connector!] : null
  if (!connector) throw new Refused(503, 'NO_CONNECTOR', `no connector ${op.connector}`)
  const { payload, hash, approval } = await deps.db
    .transaction(async (tx) => {
      const out = await payloadOf(tx, deps, content, op, caller, input)
      // A yes counts while its person is a person who still holds the move: a right taken away
      // takes the yeses given under it too.
      const [used] = await tx.query<{ id: string }>(
        `update packs.approvals set used_at = now(), used_by = $4
         where id = (select a.id from packs.approvals a
                     join packs.principals p on p.id = a.approved_by and p.agent_of is null
                     join packs.loadouts l on l.principal = a.approved_by and l.pack = a.pack
                       and a.op = any(l.ops)
                     where a.pack = $1 and a.op = $2 and a.payload_hash = $3 and a.used_at is null
                     order by a.id limit 1 for update of a skip locked)
         returning id::text`,
        [content.manifest.name, op.name, out.hash, caller.principal],
      )
      if (!used) {
        throw new Refused(403, 'NEEDS_APPROVAL', 'a person has not approved what this sends', {
          details: { payload: out.payload, payloadHash: out.hash },
        })
      }
      return { ...out, approval: used.id }
    })
    .catch((err: unknown) => {
      throw err instanceof Refused ? err : (refusalOf(err, content.manifest) ?? err)
    })

  let outcome: unknown
  try {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('the connector did not answer')), SEND_TIMEOUT_MS)
    })
    outcome = await Promise.race([
      connector.send({ pack: content.manifest.name, op: op.name, payload }),
      timeout,
    ]).finally(() => clearTimeout(timer))
  } catch (err) {
    console.error('connector failed', op.name, hash, err)
    // Marked, so the yes it used no longer reads as a send on its way.
    await deps.db
      .query('update packs.approvals set outcome = $2 where id = $1::bigint', [
        approval,
        JSON.stringify({ failed: String((err as Error)?.message ?? err) }),
      ])
      .catch((markErr: unknown) => console.error('could not mark a failed send', markErr))
    throw new Refused(502, 'SEND_FAILED', 'the send failed; a person checks before another try')
  }
  // From here the platform has it. Anything that goes wrong now leaves the outcome unknown to the
  // app, never a plain failure: a job left waiting could be sent again under a new yes.
  try {
    // The answer is kept on the approval at once: if recording it with the move fails, the
    // platform's id is not lost.
    await deps.db.query('update packs.approvals set outcome = $2 where id = $1::bigint', [
      approval,
      JSON.stringify(outcome ?? null),
    ])
    const params = { ...paramsOf(deps, caller, input), outcome, payload }
    return await deps.db.transaction(async (tx) => {
      await setClaims(tx, deps, caller)
      await tx.exec('set local role pack_runtime')
      const { text, params: values } = bind(op.sql, params)
      const rows = await tx.query(text, values)
      await tx.exec('reset role')
      await done(tx)
      return op.returns === 'many' ? rows.map(unwrap) : rows[0] ? unwrap(rows[0]) : null
    })
  } catch (err) {
    console.error('sent, then failed to record', op.name, hash, err)
    throw new Refused(500, 'OUTCOME_UNKNOWN', 'it was sent, but the app could not record it', {
      details: { approval },
    })
  }
}
