import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { PASSPORT_PROJECTION_TABLES } from './schema/passport'

/**
 * **The projection is read-only, and this test is what enforces it.**
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 2 (decision `D4-b`).
 * Doctrine: `src/schema/passport/schema.ts`.
 *
 * ## Why a test and not a database privilege
 *
 * The canonical control is a privilege:
 * `REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA passport FROM <app_role>`.
 * That guidance comes from consumers where the **browser** holds a Postgres
 * connection through PostgREST, so `authenticated` is an untrusted principal with
 * real table privileges — and without the revoke a client writes the projection
 * directly.
 *
 * BrandFactory has no such principal. Every read and write goes through the Hono
 * server, which is the only thing that connects to Postgres, as one role. So the
 * only writer a revoke could exclude is **our own request path** — which is a
 * developer mistake, not a privilege escalation, and a mistake this test reports
 * with a file and a line at CI time rather than as a runtime error in production.
 *
 * The trade is honest rather than free: a runtime denial would also catch SQL
 * built dynamically at a call site this sweep cannot see. Reopen `D4` if the
 * browser ever talks to Postgres directly, or if the projection ever needs to be
 * readable by a principal that is not this server.
 *
 * ## What a violation actually costs
 *
 * Nothing, on the day it is written. That is the whole problem. A local write into
 * `passport.*` does not error — it fights the version guard on the next delivery,
 * or it wins until the nightly reconciliation overwrites it, so the row disagrees
 * with Passport intermittently and for reasons nobody can reproduce. Rule 7 calls
 * this the most comfortable-feeling mistake in the integration, and it drifts
 * silently from there.
 *
 * ## Two allowlists, because there are two ways in
 *
 * The SQL lives in one file, and the functions that wrap it are callable from
 * anywhere they are imported. So one sweep is not enough:
 *
 *   1. **`ALLOWED_SQL`** — who may write the tables directly, in Drizzle or in a
 *      raw template. Exactly one file.
 *   2. **`ALLOWED_HELPER_CALLERS`** — who may call those wrappers. The `Db` facade
 *      in `packages/server/src/db.ts` deliberately does **not** carry them, so a
 *      route cannot reach them through its deps and would have to import them by
 *      name — which is what this second sweep sees.
 *
 * Some entries name files that do not exist yet. That is deliberate: the guard
 * should protect the tables from the moment they exist, not from the moment a
 * writer arrives.
 *
 * **Every exception is named individually, and a test file is not automatically
 * one.** Exempting `*.test.ts` as a class would be the comfortable fix and the
 * wrong one: a route test could then write the projection to set up a fixture, the
 * production code under test would be shaped around that shortcut, and the guard
 * would have a hole exactly where the mistake it exists to catch would appear.
 */
const ALLOWED_SQL = [
  // Every projection write, in one place, so the version guard has one home.
  'packages/db/src/queries/passport.ts',
  // The live round-trip that proves the version guard BEHAVES — an older
  // redelivery ignored, an equal-version replay re-applied, a tombstone kept. It
  // has to write the tables, and it deletes its own fixtures on the way in and out.
  'packages/db/src/passport-writes.live.test.ts',
]

const ALLOWED_HELPER_CALLERS = [
  ...ALLOWED_SQL,
  // The 17 sync handlers — the primary write path (phase 3).
  'packages/server/src/passport/handlers.ts',
  // The ONE sanctioned local write: our own `identity_link` row, on every login.
  // Passport's copy of that row carries a subject from Passport's project and
  // would resolve to nobody, so the row we need is not the row Passport holds
  // (phase 4).
  'packages/server/src/passport/access.ts',
]

// Nightly reconciliation is NOT listed. It re-applies a snapshot through the sync
// handlers rather than through the write helpers directly (phase 5), which keeps
// the version guard and the tombstone rules in one implementation — a second write
// path would drift from them, and the drift would only show under replay.

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGES = join(HERE, '..', '..')
const REPO_ROOT = join(PACKAGES, '..')
const SELF = 'packages/db/src/passport-write-guard.test.ts'

/** A newline, named so the fixtures below read as one line each. */
const NL = String.fromCharCode(10)

const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage', '.turbo'])

/**
 * The eight projection table identifiers, named **explicitly**.
 *
 * The first version of this guard matched `passport[A-Z]\w*` instead, which reads as
 * tighter than it is: it also matched `passportLoginAttempts` — an **app-owned** table
 * in `public` that holds PKCE state and has nothing to do with the projection. That
 * produced three false positives the moment the login work landed.
 *
 * The instructive part is what the wrong fix would have been. Allowlisting
 * `queries/passport-login-attempts.ts` would have silenced the noise and **blinded the
 * guard to a genuine projection write in that same file** — trading a precision
 * problem for a hole. Narrowing the pattern keeps both properties.
 *
 * An explicit list can go stale, which is why the suite below asserts it still covers
 * every table in `PASSPORT_PROJECTION_TABLES`: adding a ninth aggregate without
 * updating this list fails there rather than silently going unguarded.
 */
const PROJECTION_IDENTIFIERS = [
  'passportOrganization',
  'passportUnit',
  'passportMembership',
  'passportEntitlement',
  'passportUnitAppMembership',
  'passportUnitRelation',
  'passportIdentityLink',
  'passportUnitAppAccess',
] as const

/**
 * A Drizzle write whose target is a projection table: `.insert(passportUnit)`,
 * `.update(passportMembership)`, `.delete(passportIdentityLink)`.
 *
 * `passportUnit` must not also match `passportUnitRelation`, so the alternation is
 * ordered longest-first and closed with a non-word boundary.
 */
const DRIZZLE_WRITE = new RegExp(
  `\\.\\s*(insert|update|delete)\\s*\\(\\s*(${[...PROJECTION_IDENTIFIERS]
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
  'g',
)

/** A raw SQL write naming the schema directly, which the pattern above misses. */
const RAW_WRITE =
  /(insert\s+into|update|delete\s+from)\s+"?passport"?\s*\.\s*"?(organization|unit|unit_relation|membership|entitlement|identity_link|unit_app_access|unit_app_membership)"?/gi

/**
 * A call to one of the projection's write wrappers —
 * `writePassportUnit`, `deletePassportUnitRelation`, `replacePassportIdentityLink`.
 *
 * The `(write|delete|replace)Passport…` naming is load-bearing for exactly this
 * reason: it is one distinctive pattern that cannot be hit by accident, so the
 * second way into the projection is as greppable as the first.
 */
const HELPER_CALL = /\b(write|delete|replace)Passport[A-Z]\w*/g

/** Strip block comments and whole-line `//` comments — see `signout-scope.test.ts`. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')
}

export interface Violation {
  file: string
  line: number
  what: string
}

/** The detector, as a pure function so it can be tested on fixtures below. */
export function findProjectionWrites(file: string, rawSource: string): Violation[] {
  if (file === SELF) return []

  const source = stripComments(rawSource)
  const lineOf = (index: number) => source.slice(0, index).split('\n').length
  const found: Violation[] = []

  if (!ALLOWED_HELPER_CALLERS.includes(file)) {
    for (const m of source.matchAll(HELPER_CALL)) {
      found.push({ file, line: lineOf(m.index), what: `calls ${m[0]}` })
    }
  }

  if (ALLOWED_SQL.includes(file)) return found

  for (const m of source.matchAll(DRIZZLE_WRITE)) {
    found.push({ file, line: lineOf(m.index), what: `${m[1]}(${m[2]})` })
  }
  for (const m of source.matchAll(RAW_WRITE)) {
    found.push({ file, line: lineOf(m.index), what: `raw ${m[1]} passport.${m[2]}` })
  }
  return found
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('passport projection is written only by the sync path', () => {
  // The detector's own test. This file cannot assert "we found some writes" the
  // way the sign-out sweep does — zero writes is the CORRECT state until phase 3
  // adds the handlers — so the guard against a vacuously-passing pattern is to
  // exercise it on known input instead.
  describe('the detector itself', () => {
    it('catches a Drizzle write to a projection table', () => {
      const found = findProjectionWrites(
        'packages/server/src/routes/brands.ts',
        `await db.insert(passportUnit).values({ id })\n`,
      )
      expect(found).toHaveLength(1)
      expect(found[0]).toMatchObject({ line: 1, what: 'insert(passportUnit)' })
    })

    it('catches update and delete too, not only insert', () => {
      const found = findProjectionWrites(
        'packages/server/src/routes/x.ts',
        `db.update(passportMembership).set({})\ndb.delete(passportUnitAppAccess)\n`,
      )
      expect(found.map((f) => f.what)).toEqual([
        'update(passportMembership)',
        'delete(passportUnitAppAccess)',
      ])
    })

    // The obvious way around the pattern above, and the reason this file greps two
    // shapes rather than one.
    it('catches a raw SQL write naming the schema', () => {
      const found = findProjectionWrites(
        'packages/server/src/routes/x.ts',
        'await db.execute(sql`update passport.unit set name = ${n}`)\n',
      )
      expect(found).toHaveLength(1)
      expect(found[0]?.what).toBe('raw update passport.unit')
    })

    it('allows raw SQL only in the one file that owns it', () => {
      const write = `await db.insert(passportUnit).values({ id })\n`
      for (const writer of ALLOWED_SQL) {
        expect(findProjectionWrites(writer, write), `${writer} must be allowed`).toEqual([])
      }
      // The handlers may CALL the wrappers but must not write SQL themselves —
      // otherwise the version guard would have a second implementation to drift
      // from.
      expect(findProjectionWrites('packages/server/src/passport/handlers.ts', write)).toHaveLength(
        1,
      )
    })

    // The second way in: the wrappers are exported from `@brandfactory/db` and
    // callable from anywhere that imports them, so the SQL sweep alone is a
    // loophole.
    it('catches a call to a write wrapper from outside the sync path', () => {
      const found = findProjectionWrites(
        'packages/server/src/routes/brands.ts',
        'await writePassportUnit({ id, name })\n',
      )
      expect(found).toHaveLength(1)
      expect(found[0]?.what).toBe('calls writePassportUnit')
    })

    it('catches the delete and replace wrappers too', () => {
      const found = findProjectionWrites(
        'packages/server/src/routes/x.ts',
        'deletePassportUnitAppAccess(id)\nreplacePassportIdentityLink(row)\n',
      )
      expect(found.map((f) => f.what)).toEqual([
        'calls deletePassportUnitAppAccess',
        'calls replacePassportIdentityLink',
      ])
    })

    it('allows the wrapper callers on the sync and login paths', () => {
      const call = 'await writePassportMembership(row)\n'
      for (const caller of ALLOWED_HELPER_CALLERS) {
        expect(findProjectionWrites(caller, call), `${caller} must be allowed`).toEqual([])
      }
    })

    it('does not flag reads, which are the entire point of the projection', () => {
      const reads = [
        'await db.select().from(passportUnit)',
        'db.select({ role: passportMembership.role }).from(passportMembership)',
        'sql`select * from passport.unit where id = ${id}`',
      ].join('\n')
      expect(findProjectionWrites('packages/server/src/routes/x.ts', reads)).toEqual([])
    })

    it('does not flag prose that merely discusses a write', () => {
      const prose = [
        '/** Never call db.insert(passportUnit) from a request path. */',
        '// a raw `update passport.unit` here would fight the version guard',
        'const ok = 1',
      ].join('\n')
      expect(findProjectionWrites('packages/server/src/routes/x.ts', prose)).toEqual([])
    })

    // The list of eight identifiers is explicit, so it can go stale. This is what
    // makes that fail LOUDLY rather than leaving a new aggregate unguarded.
    it('covers every table in the projection, so the list cannot go stale', () => {
      expect(PROJECTION_IDENTIFIERS).toHaveLength(PASSPORT_PROJECTION_TABLES.length)

      // Every physical table name must also appear in the raw-SQL alternation.
      for (const table of PASSPORT_PROJECTION_TABLES) {
        expect(RAW_WRITE.source, `${getTableName(table)} missing from RAW_WRITE`).toContain(
          getTableName(table),
        )
      }
    })

    it('flags a write to every one of the eight, and not one fewer', () => {
      const source = PROJECTION_IDENTIFIERS.map((t) => `db.insert(${t}).values({})`).join(NL)
      const found = findProjectionWrites('packages/server/src/routes/x.ts', source)
      expect(found).toHaveLength(PROJECTION_IDENTIFIERS.length)
    })

    // The regression that produced three false positives when the login work landed.
    // `passportLoginAttempts` is app-owned PKCE state in `public`; the projection has
    // nothing to do with it. The wrong fix — allowlisting that file — would have
    // blinded the guard to a real projection write in the same file.
    it('does not flag an app-owned table whose name merely starts with `passport`', () => {
      const source = [
        'await db.insert(passportLoginAttempts).values(row)',
        'await db.delete(passportLoginAttempts).where(eq(x, y))',
      ].join(NL)
      expect(
        findProjectionWrites('packages/db/src/queries/passport-login-attempts.ts', source),
      ).toEqual([])
    })

    it('does not flag a write to an app-owned table with a similar name', () => {
      // `brand_profile` and friends are app-owned refinements and stay writable.
      expect(
        findProjectionWrites(
          'packages/server/src/routes/x.ts',
          'await db.insert(brandProfile).values({ unitId })\n',
        ),
      ).toEqual([])
    })
  })

  it('finds no violation anywhere in the repository', () => {
    const violations = sourceFiles(PACKAGES).flatMap((full) =>
      findProjectionWrites(
        relative(REPO_ROOT, full).replace(/\\/g, '/'),
        readFileSync(full, 'utf8'),
      ),
    )

    expect(
      violations.map((v) => `${v.file}:${v.line} — ${v.what}`),
      'The Passport projection is a read model: only the sync receiver, the nightly ' +
        'reconciliation and the identity-link writer may write it. A write from a ' +
        'request path does not error — it fights the version guard on the next ' +
        'delivery, or wins until reconciliation overwrites it, so the row disagrees ' +
        'with Passport intermittently and for reasons nobody can reproduce. Read the ' +
        'row instead; if you need a fact Passport does not model, put it in an ' +
        'app-owned table keyed BY the Passport UUID.',
    ).toEqual([])
  })

  it('sweeps a plausible number of files, so a broken walk cannot pass silently', () => {
    // If `sourceFiles` ever returns nothing — a renamed directory, a thrown
    // `statSync` swallowed by a refactor — the assertion above passes vacuously.
    expect(sourceFiles(PACKAGES).length).toBeGreaterThan(100)
  })
})
