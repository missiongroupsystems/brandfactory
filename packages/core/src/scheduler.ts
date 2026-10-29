import { type Conn } from './db'
import { Refused } from './errors'
import { changed } from './events'
import { kindOf, type Op, type PackContent } from './pack'
import { call, type CoreDeps } from './run'

/**
 * Timed moves. A move asks for later calls in its result (a `schedule` column beside `result`:
 * a list of `{ op, input, at, key }`); the core keeps them in `packs.scheduled_calls`. The loop
 * claims one due call at a time in one statement, runs it as the principal who asked, through the
 * same checks as any call, and beats a heartbeat while it runs. A call whose heartbeat stopped for
 * 15 minutes ends `unknown_outcome`: never run again by the loop, and a person is alerted.
 */

export interface PlannedCall {
  op: string
  input: Record<string, unknown>
  at: string
  key: string
  /**
   * The asker's yes to what this effect call sends, given with the asking: stored in the same
   * transaction, so the call is never due without it. Only a person's counts; an agent's asking
   * leaves the call waiting for one.
   */
  approve?: boolean
}

/** A move's requested calls, checked: each names a move of this version and a real time. */
/** The most calls one move may ask for, and the longest key and input. */
const MAX_CALLS = 100
const MAX_KEY = 200
const MAX_INPUT = 16_000

export function plannedCalls(value: unknown, content: PackContent, from: Op): PlannedCall[] {
  const list = typeof value === 'string' ? (JSON.parse(value) as unknown) : value
  if (list === null || list === undefined) return []
  if (!Array.isArray(list)) throw new Error(`${from.name}: schedule is not a list`)
  if (list.length > MAX_CALLS) throw new Error(`${from.name}: more than ${MAX_CALLS} calls`)
  return list.map((item: Partial<PlannedCall>) => {
    if (!item || typeof item.op !== 'string' || !content.ops[item.op]) {
      throw new Error(`${from.name}: schedule names no move of this version`)
    }
    if (typeof item.key !== 'string' || item.key === '' || item.key.length > MAX_KEY) {
      throw new Error(`${from.name}: a scheduled call needs a key`)
    }
    if (!item.input || typeof item.input !== 'object' || Array.isArray(item.input)) {
      throw new Error(`${from.name}: a scheduled call's input is an object`)
    }
    if (JSON.stringify(item.input).length > MAX_INPUT) {
      throw new Error(`${from.name}: a scheduled call's input is too large`)
    }
    if (typeof item.at !== 'string' || Number.isNaN(new Date(item.at).getTime())) {
      throw new Error(`${from.name}: a scheduled call's time is not a time`)
    }
    if (item.approve !== undefined && typeof item.approve !== 'boolean') {
      throw new Error(`${from.name}: approve is true or false`)
    }
    if (item.approve && kindOf(content.ops[item.op]!) !== 'effect') {
      throw new Error(`${from.name}: only an effect call takes a yes`)
    }
    return { op: item.op, input: item.input, at: item.at, key: item.key, approve: item.approve }
  })
}

/**
 * Stores requested calls in the caller's transaction, as the login role. Asking again under a
 * key moves the call and arms it again, unless it is running.
 */
export async function schedule(
  tx: Conn,
  content: PackContent,
  principal: string,
  calls: PlannedCall[],
) {
  if (calls.length === 0) return
  const pack = content.manifest.name
  // Asked for now, refused now: the asker (and an agent's person) must hold the move and the
  // pack's follow-up moves, or the call would only fail later, out of sight.
  const needed = [
    ...new Set([
      ...calls.map((c) => c.op),
      ...Object.values(content.manifest.scheduler ?? {}).filter((op): op is string => !!op),
    ]),
  ]
  const [held] = await tx.query<{ missing: string[] }>(
    `select array(
       select op from unnest($3::text[]) as op
       where not exists (
         select 1 from packs.loadouts l
         where l.pack = $2 and op = any(l.ops) and l.principal = $1)
          or exists (
         select 1 from packs.principals p where p.id = $1 and p.agent_of is not null
           and not exists (select 1 from packs.loadouts l where l.pack = $2
                           and op = any(l.ops) and l.principal = p.agent_of))
     ) as missing`,
    [principal, pack, needed],
  )
  if (held && held.missing.length > 0) {
    throw new Refused(403, 'FORBIDDEN', `${held.missing.join(', ')} not in the loadout`)
  }
  for (const c of calls) {
    await tx.query(
      `insert into packs.scheduled_calls (pack, op, key, input, principal, run_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (pack, op, key) do update set
         input = excluded.input, run_at = excluded.run_at,
         -- A waiting call keeps who asked for it; an ended one belongs to who asks again.
         principal = case when packs.scheduled_calls.status = 'scheduled'
           then packs.scheduled_calls.principal else excluded.principal end,
         status = 'scheduled', attempts = 0, error = null, result = null, updated_at = now()
       where packs.scheduled_calls.status <> 'running'`,
      [pack, c.op, c.key, JSON.stringify(c.input), principal, c.at],
    )
  }
}

/** A call whose heartbeat stopped this long ago was cut off. */
export const STUCK_MS = 15 * 60 * 1000
/** How often a running call beats. */
export const HEARTBEAT_MS = 30 * 1000

interface Claimed {
  id: string
  pack: string
  op: string
  input: Record<string, unknown>
  principal: string
}

/** Claims one due call: moved to `running` in the same statement that picks it. */
export async function claim(deps: Pick<CoreDeps, 'db' | 'now'>): Promise<Claimed | null> {
  const [row] = await deps.db.query<Claimed>(
    `update packs.scheduled_calls set status = 'running', attempts = attempts + 1,
       heartbeat_at = $1, updated_at = $1
     where id = (select id from packs.scheduled_calls
                 where status = 'scheduled' and run_at <= $1
                 order by run_at, id limit 1 for update skip locked)
     returning id::text, pack, op, input, principal`,
    [deps.now().toISOString()],
  )
  return row ?? null
}

/** Runs one claimed call to its end: done, refused or failed. */
export async function runClaimed(deps: CoreDeps, job: Claimed) {
  const beat = setInterval(() => {
    void deps.db
      .query(
        `update packs.scheduled_calls set heartbeat_at = $2
         where id = $1::bigint and status = 'running'`,
        [job.id, deps.now().toISOString()],
      )
      .catch((err: unknown) => console.error('heartbeat failed', job.id, err))
  }, deps.heartbeatMs ?? HEARTBEAT_MS)
  // A heartbeat never keeps a process alive on its own.
  beat.unref()
  const end = (status: string, result: unknown, error: string | null) =>
    deps.db.query(
      `update packs.scheduled_calls set status = $2, result = $3, error = $4, updated_at = $5
       where id = $1::bigint and status = 'running'`,
      [job.id, status, JSON.stringify(result ?? null), error, deps.now().toISOString()],
    )
  try {
    const result = await call(deps, {
      authorization: undefined,
      as: job.principal,
      pack: job.pack,
      op: job.op,
      input: job.input,
    })
    await end('done', result, null)
  } catch (err) {
    if (!(err instanceof Refused)) {
      console.error('scheduled call failed', job.id, err)
      await end('failed', null, 'the call failed')
      return
    }
    if (err.code === 'OUTCOME_UNKNOWN') {
      // Sent, but not recorded: the same end as a call cut off mid-send.
      await deps.db.query(
        `update packs.scheduled_calls set status = 'unknown_outcome', error = $2, updated_at = $3
         where id = $1::bigint and status = 'running'`,
        [job.id, err.message, deps.now().toISOString()],
      )
      // The connector's own words when it said what may have happened; the pack's otherwise.
      const said = (err.details as { connector?: boolean } | undefined)?.connector
      await unknown(deps, job, said ? err.message : undefined)
      return
    }
    await end('refused', err.toJSON(), `${err.code}: ${err.message}`)
    await follow(deps, job, 'onRefused', { code: err.code, message: err.message })
  } finally {
    clearInterval(beat)
    changed(job.pack)
  }
}

/** Calls the move a pack names for a call's end (its manifest's `scheduler`), as its principal. */
async function follow(
  deps: CoreDeps,
  job: Claimed,
  which: 'onRefused' | 'onUnknown',
  extra: Record<string, unknown>,
) {
  const [live] = await deps.db.query<{ follow: string | null }>(
    `select v.content -> 'manifest' -> 'scheduler' ->> $3 as follow
     from packs.channels c join packs.pack_versions v on v.pack = c.pack and v.version = c.version
     where c.environment = $1 and c.pack = $2`,
    [deps.environment, job.pack, which],
  )
  if (!live?.follow) return
  await call(deps, {
    authorization: undefined,
    as: job.principal,
    pack: job.pack,
    op: live.follow,
    input: { call: job.op, input: job.input, ...extra },
  }).catch(async (err: unknown) => {
    // The job keeps waiting in the pack's tables; a person must look.
    console.error(`${which} failed`, job.id, err)
    await alert(deps, job, `${job.op} ended badly and ${live.follow} could not record it`)
  })
}

/**
 * Ends every call whose heartbeat stopped: `unknown_outcome`, an alert to its principal, and the
 * pack's `onUnknown` move. The loop never runs these again.
 */
export async function markStuck(deps: CoreDeps) {
  const now = deps.now()
  const stuck = await deps.db.query<Claimed>(
    `update packs.scheduled_calls set status = 'unknown_outcome', updated_at = $1,
       error = 'cut off while it ran: check before anyone tries again'
     where status = 'running' and heartbeat_at < $2
     returning id::text, pack, op, input, principal`,
    [now.toISOString(), new Date(now.getTime() - STUCK_MS).toISOString()],
  )
  for (const job of stuck) await unknown(deps, job)
  return stuck.length
}

/**
 * A call whose outcome is unknown: an alert to its principal, and the pack's `onUnknown`, with the
 * connector's words when it gave some.
 */
async function unknown(deps: CoreDeps, job: Claimed, message?: string) {
  await alert(deps, job, `${job.op} was cut off; it may or may not have gone out`)
  await follow(deps, job, 'onUnknown', message ? { message } : {})
  changed(job.pack)
}

async function alert(deps: CoreDeps, job: Claimed, message: string) {
  await deps.db.query(
    `insert into packs.alerts (principal, pack, call_id, message) values ($1, $2, $3::bigint, $4)`,
    [job.principal, job.pack, job.id, message],
  )
}

/** One pass of the loop: stuck calls first, then due calls one at a time. */
export async function tick(deps: CoreDeps, limit = 10) {
  await markStuck(deps)
  let ran = 0
  while (ran < limit) {
    const job = await claim(deps)
    if (!job) break
    await runClaimed(deps, job)
    ran++
  }
  return ran
}

/** The most calls the loop runs at once: a long send does not hold the others. */
export const MAX_RUNNING = 10
/** How long `stop()` waits for running calls before it gives up on them. */
export const STOP_WAIT_MS = 4 * 60 * 1000

/**
 * Runs the loop every `intervalMs` until stopped: stuck calls, then due calls, up to
 * `MAX_RUNNING` at once, each claimed in one statement as `tick` does. `stop()` claims nothing
 * more and waits for the running calls, up to `STOP_WAIT_MS`; a call still running after that ends
 * `unknown_outcome` when its heartbeat stops.
 */
export function startScheduler(deps: CoreDeps, intervalMs = 5000, stopWaitMs = STOP_WAIT_MS) {
  const running = new Set<Promise<void>>()
  let claiming: Promise<void> | null = null
  let stopped = false

  const pass = async () => {
    await markStuck(deps)
    while (!stopped && running.size < MAX_RUNNING) {
      const job = await claim(deps)
      if (!job) break
      const run = runClaimed(deps, job)
        .catch((err: unknown) => console.error('scheduled call', job.id, err))
        .finally(() => running.delete(run))
      running.add(run)
    }
  }
  const timer = setInterval(() => {
    if (claiming || stopped) return
    claiming = pass()
      .catch((err: unknown) => console.error('scheduler', err))
      .finally(() => (claiming = null))
  }, intervalMs)

  return async () => {
    stopped = true
    clearInterval(timer)
    await claiming
    let timeout: NodeJS.Timeout | undefined
    await Promise.race([
      Promise.all(running),
      new Promise((done) => (timeout = setTimeout(done, stopWaitMs))),
    ]).finally(() => clearTimeout(timeout))
  }
}
