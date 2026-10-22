import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { devAuth } from './auth'
import { dumpPglite, openPglite, openPgliteFrom, openPostgres, type Db } from './db'
import { Refused } from './errors'
import { applyPackMigrations, migrateCore } from './migrate'
import { hashOf, type PackContent, type PackTest } from './pack'
import { addPrincipal, promote, publish, recordTestRun, setLoadout } from './registry'
import { approve, simulatedConnector } from './effects'
import { type Files } from './files'
import { callGuest, MIN_CAPABILITY } from './guest'
import { call, type Connector } from './run'
import { claim, tick } from './scheduler'

/**
 * Runs a pack version's own tests, each case on a throwaway database: the core's migrations, the
 * pack's migrations and its fixture, then the case's steps through the same call path as a
 * screen's (`run.ts`), as the callers the case names.
 *
 * A test file: `{ name, now, as, cases: [{ name, steps }] }`. A step is one of
 * - `{ call, input, as?, key?, now?, expect? }`: a move; `expect` holds `status`, `code`,
 *   `message`, `details`, `result` (matched as a subset), `length`, or `same` (the answer equals
 *   the previous call's);
 * - `{ sql, expect? }`: a statement as the login role, to set up or look; `expect.rows`, or
 *   `expect.error` for a statement the database must refuse;
 * - `{ parallel: [calls], expect: { codes } }`: moves at once; the codes (null for success) in
 *   any order;
 * - `{ approve, input, as?, expect? }`: a person's yes to what an effect move would send now;
 * - `{ tick: 'run' | 'abandon', now?, connector?, failOn?, answer? }` and `{ claim: true, now? }`:
 *   the scheduler, as above;
 * - `{ guest, input, expect? }`: a guest's move, with no sign-in.
 */

interface CallStep {
  call: string
  input?: unknown
  as?: string
  key?: string
  now?: string
  /** The connector an effect move uses for this call, as in a tick step. */
  connector?: TickStep['connector']
  failOn?: string[]
  answer?: unknown
  expect?: Expect
}
interface SqlStep {
  sql: string
  /** `rows` the statement returns, or `error`: text its error message must contain. */
  expect?: { rows?: unknown[]; error?: string }
}
interface ApproveStep {
  approve: string
  input?: unknown
  as?: string
  now?: string
  expect?: Expect
}
/**
 * The scheduler, as the test's clock says: `run` waits for one pass; `abandon` starts a pass and
 * leaves it, as a process killed mid-send would. `connector` makes the sends of this pass fail
 * for `failOn` channels, hang, or answer with something the app cannot store (`garbled`).
 * `answer` is what every connector answers in this pass instead (a read's canned page).
 */
interface TickStep {
  tick: 'run' | 'abandon'
  now?: string
  connector?: 'ok' | 'fails' | 'hangs' | 'garbled'
  failOn?: string[]
  answer?: unknown
}
/** A guest's move, with no sign-in: the capability is in its input. */
interface GuestStep {
  guest: string
  input?: unknown
  expect?: Expect
}
/** Claims one due call and drops it, as a process killed right after the claim would. */
interface ClaimStep {
  claim: true
  now?: string
}
interface ParallelStep {
  parallel: CallStep[]
  expect: { codes: (string | null)[] }
}
type Step = CallStep | SqlStep | ParallelStep | ApproveStep | TickStep | ClaimStep | GuestStep

interface Expect {
  status?: number
  code?: string
  message?: string
  details?: unknown
  result?: unknown
  length?: number
  same?: boolean
}

interface TestFile extends PackTest {
  now?: string
  as?: string
  /** Callers that are agents, by name, with the person each acts for. */
  agents?: Record<string, string>
  cases: { name: string; steps: Step[] }[]
}

export interface CaseResult {
  file: string
  name: string
  ok: boolean
  error?: string
}

export interface RunResult {
  passed: boolean
  results: CaseResult[]
  /** Every rule some case saw refuse a call. */
  refused: string[]
  /** Every move some case saw answer not-found. */
  notFound: string[]
  /** Every effect move some case saw refused for want of a person's yes. */
  needsApproval: string[]
  /** Every guest move some case saw answer not-found to a capability that opens nothing. */
  guestRefused: string[]
}

/** What the cases saw, gathered across them. */
export interface Seen {
  refused: Set<string>
  notFound: Set<string>
  needsApproval: Set<string>
  guestRefused: Set<string>
}

/** Where a value differs from what was expected, or null. Objects match on the keys expected. */
export function mismatch(actual: unknown, expected: unknown, at = '$'): string | null {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${at}: expected an array, got ${JSON.stringify(actual)}`
    if (actual.length !== expected.length) {
      return `${at}: expected ${expected.length} items, got ${actual.length}: ${JSON.stringify(actual)}`
    }
    for (let i = 0; i < expected.length; i++) {
      const m = mismatch(actual[i], expected[i], `${at}[${i}]`)
      if (m) return m
    }
    return null
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') {
      return `${at}: expected an object, got ${JSON.stringify(actual)}`
    }
    for (const [k, v] of Object.entries(expected)) {
      const m = mismatch((actual as Record<string, unknown>)[k], v, `${at}.${k}`)
      if (m) return m
    }
    return null
  }
  return isDeepStrictEqual(actual, expected)
    ? null
    : `${at}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
}

const RUNNER = 'core-test-runner'

/** Makes the version live in a throwaway database, so its moves can be called there. */
async function prepare(db: Db, content: PackContent) {
  await migrateCore(db)
  await applyPackMigrations(db, content.manifest.name, content.migrations)
  if (content.fixture) await db.exec(content.fixture)
  await addPrincipal(db, RUNNER)
  const { pack, version, hash } = await publish(db, content, RUNNER)
  await recordTestRun(db, { pack, version, hash, passed: true, results: 'test database' })
  await promote(db, { actor: RUNNER, environment: 'test', pack, version })
}

/** Where cases run: a fresh database per case, and a way to throw it away. */
export interface Target {
  fresh(content: PackContent): Promise<{ db: Db; dispose(): Promise<void> }>
  /** Drops what the target made for every case; call once when the run is over. */
  close(): Promise<void>
}

const prepared = new Map<string, Promise<Blob>>()

/** PGlite: the prepared database is made once per version and cloned per case. */
export const pglite: Target = {
  async fresh(content) {
    const hash = hashOf(content)
    let dump = prepared.get(hash)
    if (!dump) {
      dump = (async () => {
        const db = openPglite()
        try {
          await prepare(db, content)
          return await dumpPglite(db)
        } finally {
          await db.close()
        }
      })()
      prepared.set(hash, dump)
    }
    const db = await openPgliteFrom(await dump)
    return { db, dispose: () => db.close() }
  },
  async close() {},
}

/**
 * A Postgres server (superuser URL, throwaway server): a template database per version, and a
 * copy of it per case, so moves at once really run at once.
 */
export function postgres(url: string): Target {
  const templates = new Map<string, Promise<string>>()
  const dbUrl = (name: string) => {
    const u = new URL(url)
    u.pathname = `/${name}`
    return u.toString()
  }
  const admin = async <T>(fn: (db: Db) => Promise<T>) => {
    const db = openPostgres(url, 1)
    try {
      return await fn(db)
    } finally {
      await db.close()
    }
  }
  return {
    async fresh(content) {
      const hash = hashOf(content)
      let template = templates.get(hash)
      if (!template) {
        template = (async () => {
          const name = `packtpl_${randomUUID().replaceAll('-', '')}`
          await admin((a) => a.exec(`create database ${name}`))
          const db = openPostgres(dbUrl(name), 1)
          try {
            await prepare(db, content)
          } finally {
            await db.close()
          }
          return name
        })()
        templates.set(hash, template)
      }
      const name = `packcase_${randomUUID().replaceAll('-', '')}`
      const from = await template
      await admin((a) => a.exec(`create database ${name} template ${from}`))
      // Named statements, as a core with DATABASE_PREPARE=on runs them.
      const db = openPostgres(dbUrl(name), 5, { prepare: true })
      return {
        db,
        async dispose() {
          await db.close()
          await admin((a) => a.exec(`drop database if exists ${name} with (force)`))
        },
      }
    },
    async close() {
      for (const name of await Promise.all(templates.values())) {
        await admin((a) => a.exec(`drop database if exists ${name} with (force)`))
      }
      templates.clear()
    },
  }
}

type Answer = { status: number; body: unknown }

/** Files for a test pass: signed addresses that name the key, and no storage behind them. */
const testFiles: Files = {
  store: {
    signedWriteUrl: async (key, type) => ({
      url: `https://files.test/put/${key}`,
      headers: { 'content-type': type },
    }),
    signedReadUrl: async (key) => `https://files.test/get/${key}`,
  },
  secret: 'test-files-secret-for-pack-tests-only',
  publicUrl: 'https://core.test',
}

async function runCase(
  target: Target,
  content: PackContent,
  file: TestFile,
  steps: Step[],
  seen: Seen,
) {
  const { db, dispose } = await target.fresh(content)
  try {
    let now = new Date(file.now ?? '2026-01-01T00:00:00Z')
    // The connector this pass uses; a tick step may swap it.
    let connector: Connector = simulatedConnector
    const deps = {
      db,
      auth: devAuth(),
      environment: 'test',
      now: () => now,
      // Every connector a pack names goes to the one this pass uses.
      connectors: Object.fromEntries(
        [
          ...new Set([
            'simulated',
            'lark',
            ...Object.values(content.ops).flatMap((o) => (o.connector ? [o.connector] : [])),
          ]),
        ].map((name) => [
          name,
          { send: (i: Parameters<Connector['send']>[0]) => connector.send(i) },
        ]),
      ),
      files: testFiles,
    }
    const callers = new Map<string, Promise<void>>()
    let previous: Answer | null = null

    // Each case its own address, so cases never share a guest's rate limit.
    const address = `case-${randomUUID()}`
    const guestOnce = async (step: GuestStep): Promise<Answer> => {
      try {
        const result = await callGuest(deps, {
          address,
          pack: content.manifest.name,
          op: step.guest,
          input: step.input ?? {},
        })
        return { status: 200, body: JSON.parse(JSON.stringify(result ?? null)) }
      } catch (err) {
        if (!(err instanceof Refused)) throw err
        if (err.rule) seen.refused.add(err.rule)
        // Only a token long enough to reach the pack's rules: a short one the core refuses itself.
        const field = content.ops[step.guest]?.guest?.capability
        const token = field ? (step.input as Record<string, unknown> | undefined)?.[field] : null
        const reaches = typeof token === 'string' && token.length >= MIN_CAPABILITY
        if (err.code === 'NOT_FOUND' && reaches) seen.guestRefused.add(step.guest)
        return { status: err.status, body: JSON.parse(JSON.stringify(err.toJSON())) }
      }
    }
    const callOnce = async (step: CallStep | ApproveStep): Promise<Answer> => {
      const op = 'call' in step ? step.call : step.approve
      const who = step.as ?? file.as ?? 'member'
      // One promise per caller, so moves sent at once wait for the same setup.
      if (!callers.has(who)) {
        const person = file.agents?.[who]
        const ops = Object.keys(content.ops)
        callers.set(
          who,
          (async () => {
            if (person) {
              await addPrincipal(db, person)
              await setLoadout(db, person, content.manifest.name, ops)
            }
            await addPrincipal(db, who, person ?? null)
            await setLoadout(db, who, content.manifest.name, ops)
          })(),
        )
      }
      await callers.get(who)
      if (step.now) now = new Date(step.now)
      try {
        const request = {
          authorization: `Bearer ${who}`,
          pack: content.manifest.name,
          op,
          input: step.input ?? {},
        }
        if ('call' in step && (step.connector || step.answer !== undefined)) {
          connector = connectorFor(step)
        }
        const result =
          'call' in step
            ? await call(deps, { ...request, key: step.key })
            : await approve(deps, request)
        connector = simulatedConnector
        return { status: 200, body: JSON.parse(JSON.stringify(result ?? null)) }
      } catch (err) {
        if (!(err instanceof Refused)) throw err
        connector = simulatedConnector
        if (err.rule) seen.refused.add(err.rule)
        if (err.code === 'NOT_FOUND') seen.notFound.add(op)
        if (err.code === 'NEEDS_APPROVAL') seen.needsApproval.add(op)
        return { status: err.status, body: JSON.parse(JSON.stringify(err.toJSON())) }
      }
    }

    for (const [i, step] of steps.entries()) {
      const where = `step ${i + 1}`
      if ('tick' in step || 'claim' in step) {
        if (step.now) now = new Date(step.now)
        if ('claim' in step) {
          await claim(deps)
          continue
        }
        connector = connectorFor(step)
        if (step.tick === 'run') {
          await tick(deps)
        } else {
          // A killed process beats no more: this pass never beats again.
          // Its later steps fail once the case's database is closed, as a killed process's would
          // never run: those errors are the point, not a fault.
          tick({ ...deps, heartbeatMs: 2 ** 30 }).catch((err: unknown) => {
            if (!/the database is closed/.test(String(err))) console.error('abandoned pass', err)
          })
          // Long enough for the pass to claim a call and reach the connector.
          await new Promise((r) => setTimeout(r, 300))
        }
        connector = simulatedConnector
        continue
      }
      if ('sql' in step) {
        if (step.expect?.error !== undefined) {
          const err = await db.query(step.sql).then(
            () => null,
            (e: unknown) => (e as Error).message,
          )
          if (!err?.includes(step.expect.error)) {
            throw new Error(
              `${where} (sql): expected an error with ${step.expect.error}, got ${err}`,
            )
          }
          continue
        }
        const rows = await db.query(step.sql)
        if (step.expect?.rows) {
          const m = mismatch(JSON.parse(JSON.stringify(rows)), step.expect.rows)
          if (m) throw new Error(`${where} (sql): ${m}`)
        }
      } else if ('parallel' in step) {
        // Every call ends before the step does, so a fault in one never leaves another running
        // on a database that is about to be closed.
        const settled = await Promise.allSettled(step.parallel.map(callOnce))
        const fault = settled.find((r) => r.status === 'rejected')
        if (fault) throw fault.reason
        const answers = settled.map((r) => (r as PromiseFulfilledResult<Answer>).value)
        const codes = answers.map((a) =>
          a.status === 200 ? null : (a.body as { code: string }).code,
        )
        const sort = (c: (string | null)[]) =>
          [...c].sort((a, b) => (a ?? '').localeCompare(b ?? ''))
        const m = mismatch(sort(codes), sort(step.expect.codes))
        if (m) throw new Error(`${where} (parallel): ${m}`)
      } else {
        const answer = 'guest' in step ? await guestOnce(step) : await callOnce(step)
        const e = step.expect ?? {}
        const body = answer.body as Record<string, unknown> | null
        const wanted = e.status ?? (e.code ? undefined : 200)
        const problems = [
          wanted !== undefined && answer.status !== wanted
            ? `status ${answer.status}, expected ${wanted}: ${JSON.stringify(body)}`
            : null,
          e.code !== undefined ? mismatch(body?.code, e.code, '$.code') : null,
          e.message !== undefined ? mismatch(body?.message, e.message, '$.message') : null,
          e.details !== undefined ? mismatch(body?.details, e.details, '$.details') : null,
          e.result !== undefined ? mismatch(body, e.result) : null,
          e.length !== undefined
            ? mismatch((body as unknown as unknown[])?.length, e.length)
            : null,
          e.same && !isDeepStrictEqual(answer, previous)
            ? `not the previous answer: ${JSON.stringify(previous)}`
            : null,
        ].filter(Boolean)
        const name =
          'call' in step
            ? step.call
            : 'guest' in step
              ? `guest ${step.guest}`
              : `approve ${step.approve}`
        if (problems.length > 0) throw new Error(`${where} (${name}): ${problems[0]}`)
        previous = answer
      }
    }
  } finally {
    await dispose()
  }
}

function connectorFor(step: Pick<TickStep, 'connector' | 'failOn' | 'answer'>): Connector {
  if (step.answer !== undefined) return { send: async () => step.answer }
  if (step.connector === 'hangs') return { send: () => new Promise(() => {}) }
  // Takes the send, then answers with something the app cannot store.
  if (step.connector === 'garbled') return { send: async () => ({ externalId: 1n }) }
  if (step.connector === 'fails') {
    return {
      async send(input) {
        const channel = (input.payload as { channel?: string } | null)?.channel ?? ''
        if (step.failOn === undefined || step.failOn.includes(channel)) {
          throw new Error(`${channel} refused it`)
        }
        return simulatedConnector.send(input)
      },
    }
  }
  return simulatedConnector
}

/** The cases of a version, by file, for a caller that runs them one at a time (Vitest). */
export function casesOf(content: PackContent, target: Target = pglite) {
  return (content.tests as TestFile[]).flatMap((file) =>
    file.cases.map((c) => ({
      file: file.name,
      name: c.name,
      run: (seen: Seen) => runCase(target, content, file, c.steps, seen),
    })),
  )
}

/** Runs every case of a version; passed only when all pass. */
export async function runPackTests(
  content: PackContent,
  target: Target = pglite,
): Promise<RunResult> {
  const seen: Seen = {
    refused: new Set(),
    notFound: new Set(),
    needsApproval: new Set(),
    guestRefused: new Set(),
  }
  const results: CaseResult[] = []
  for (const c of casesOf(content, target)) {
    try {
      await c.run(seen)
      results.push({ file: c.file, name: c.name, ok: true })
    } catch (err) {
      results.push({ file: c.file, name: c.name, ok: false, error: (err as Error).message })
    }
  }
  return {
    passed: results.every((r) => r.ok),
    results,
    refused: [...seen.refused].sort(),
    notFound: [...seen.notFound].sort(),
    needsApproval: [...seen.needsApproval].sort(),
    guestRefused: [...seen.guestRefused].sort(),
  }
}
