import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { devAuth } from './auth'
import { dumpPglite, openPglite, openPgliteFrom, openPostgres, type Db } from './db'
import { Refused } from './errors'
import { applyPackMigrations, migrateCore } from './migrate'
import { hashOf, type PackContent, type PackTest } from './pack'
import { addPrincipal, promote, publish, recordTestRun, setLoadout } from './registry'
import { call } from './run'

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
 *   any order.
 */

interface CallStep {
  call: string
  input?: unknown
  as?: string
  key?: string
  now?: string
  expect?: Expect
}
interface SqlStep {
  sql: string
  /** `rows` the statement returns, or `error`: text its error message must contain. */
  expect?: { rows?: unknown[]; error?: string }
}
interface ParallelStep {
  parallel: CallStep[]
  expect: { codes: (string | null)[] }
}
type Step = CallStep | SqlStep | ParallelStep

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
}

/** What the cases saw, gathered across them. */
export interface Seen {
  refused: Set<string>
  notFound: Set<string>
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
      const db = openPostgres(dbUrl(name))
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
    const deps = { db, auth: devAuth(), environment: 'test', now: () => now }
    const callers = new Map<string, Promise<void>>()
    let previous: Answer | null = null

    const callOnce = async (step: CallStep): Promise<Answer> => {
      const who = step.as ?? file.as ?? 'member'
      // One promise per caller, so moves sent at once wait for the same setup.
      if (!callers.has(who)) {
        callers.set(
          who,
          addPrincipal(db, who).then(() =>
            setLoadout(db, who, content.manifest.name, Object.keys(content.ops)),
          ),
        )
      }
      await callers.get(who)
      if (step.now) now = new Date(step.now)
      try {
        const result = await call(deps, {
          authorization: `Bearer ${who}`,
          pack: content.manifest.name,
          op: step.call,
          input: step.input ?? {},
          key: step.key,
        })
        return { status: 200, body: JSON.parse(JSON.stringify(result ?? null)) }
      } catch (err) {
        if (!(err instanceof Refused)) throw err
        if (err.rule) seen.refused.add(err.rule)
        if (err.code === 'NOT_FOUND') seen.notFound.add(step.call)
        return { status: err.status, body: JSON.parse(JSON.stringify(err.toJSON())) }
      }
    }

    for (const [i, step] of steps.entries()) {
      const where = `step ${i + 1}`
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
        const answer = await callOnce(step)
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
        if (problems.length > 0) throw new Error(`${where} (${step.call}): ${problems[0]}`)
        previous = answer
      }
    }
  } finally {
    await dispose()
  }
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
  const seen: Seen = { refused: new Set(), notFound: new Set() }
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
  }
}
