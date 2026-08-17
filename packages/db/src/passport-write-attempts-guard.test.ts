import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A source sweep: **nothing but the retry surface may read the failed-write queue.**
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 9c/9g.
 * Doctrine: `./schema/passport_write_attempts.ts`.
 *
 * ## Why this table needs a guard and the other app-owned tables do not
 *
 * `passport_write_attempts` holds *attempted* changes to units — names, addresses,
 * relations. Those are **Passport's facts**, and a table of them is one reader away from
 * being a rule-7 shadow: a second place a brand's name lives.
 *
 * Four properties keep it legitimate, and only one of them can be enforced mechanically:
 * a row exists only after a failure, it is deleted on success, it expires, and **nothing
 * reads it except the retry surface**. The first three are properties of the code that
 * writes it. The fourth is a property of everything that might read it, which is why it
 * gets a sweep.
 *
 * ## The regression this catches, and why it looks like a feature
 *
 * Somebody joins this table to `passport.unit` so the brand list can show "Acme (renaming
 * to Acme Group)". It ships as a nice touch. What it actually does is make a *pending
 * request* into displayed state, so the brand list now has two sources — and once one
 * screen reads it, the next reads it for authorization, and the projection has a shadow
 * beside it.
 *
 * Nothing about that raises. The join works, the label is accurate, and the reviewer sees
 * an improvement.
 *
 * ## What it does NOT check
 *
 * The other three properties. `routes/passport-structure.test.ts` covers deletion on
 * success and recording only on a retryable failure.
 */
const here = dirname(fileURLToPath(import.meta.url))
const PACKAGES = join(here, '../..')
const REPO_ROOT = join(PACKAGES, '..')

const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'build', '.next', 'coverage'])

/**
 * Every file that may name the table or its query helpers.
 *
 * **Adding a file here is a decision, not a formality.** It is a claim that the file is
 * part of the retry surface. A brand list, a workspace page, an authz helper or a
 * projection read is never part of the retry surface, whatever the label it is adding.
 */
const ALLOWED = [
  // The table, its queries, and the barrels that re-export them.
  'packages/db/src/schema/passport_write_attempts.ts',
  'packages/db/src/schema/index.ts',
  'packages/db/src/queries/passport-write-attempts.ts',
  'packages/db/src/index.ts',
  // The retry surface itself: the one router that lists, retries and discards.
  'packages/server/src/routes/passport-structure.ts',
]

/**
 * The identifiers that reach the table.
 *
 * Both the Drizzle table object and the query helpers, because either is a way in — and the
 * helpers are the likelier one, since importing `listWriteAttempts` from `@brandfactory/db`
 * needs no knowledge of the schema at all.
 */
const IDENTIFIERS = [
  'passportWriteAttempts',
  'passport_write_attempts',
  'recordWriteAttempt',
  'listWriteAttempts',
  'getWriteAttempt',
  'bumpWriteAttempt',
  'deleteWriteAttempt',
  'pruneExpiredWriteAttempts',
]

const PATTERN = new RegExp(
  `\\b(${IDENTIFIERS.sort((a, b) => b.length - a.length).join('|')})\\b`,
  'g',
)

/** Strip comments, preserving line numbers — the same shape as the other sweeps here. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')
}

const SELF = 'packages/db/src/passport-write-attempts-guard.test.ts'

interface Violation {
  file: string
  line: number
  identifier: string
}

export function findQueueReaders(file: string, rawSource: string): Violation[] {
  if (file === SELF || ALLOWED.includes(file)) return []
  // A test of an allowed file is allowed too: `passport-structure.test.ts` names the queue
  // methods to assert them. Narrowing this to the `.test.ts` of an allowed file rather than
  // exempting tests as a class — a test that reads the table to build a fixture for a BRAND
  // LIST is exactly the shadow arriving, one step earlier.
  if (ALLOWED.some((a) => file === a.replace(/\.tsx?$/, '.test.ts'))) return []

  const source = stripComments(rawSource)
  const lineOf = (index: number) => source.slice(0, index).split('\n').length
  return [...source.matchAll(PATTERN)].map((m) => ({
    file,
    line: lineOf(m.index),
    identifier: m[0]!,
  }))
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

describe('the failed-write queue is read only by the retry surface', () => {
  describe('the detector itself', () => {
    // This file's real assertion is an ABSENCE, so a broken pattern would pass it while
    // checking nothing. These exercise it on known input instead.
    it('catches a brand list reading the queue', () => {
      const found = findQueueReaders(
        'packages/server/src/routes/brands.ts',
        `const pending = await listWriteAttempts(orgId)\n`,
      )
      expect(found).toEqual([
        { file: 'packages/server/src/routes/brands.ts', line: 1, identifier: 'listWriteAttempts' },
      ])
    })

    it('catches a direct Drizzle read of the table', () => {
      const found = findQueueReaders(
        'packages/web/src/x.ts',
        `db.select().from(passportWriteAttempts)\n`,
      )
      expect(found.map((f) => f.identifier)).toEqual(['passportWriteAttempts'])
    })

    it('catches the raw table name in SQL', () => {
      const found = findQueueReaders(
        'packages/server/src/x.ts',
        `sql\`select * from passport_write_attempts\`\n`,
      )
      expect(found).toHaveLength(1)
    })

    it('ignores a mention in a comment', () => {
      // The doctrine has to be writable. `passport_write_attempts` appears by name in several
      // headers explaining why nothing may read it.
      expect(
        findQueueReaders(
          'packages/server/src/x.ts',
          `// nothing but the retry UI reads listWriteAttempts\n/* passportWriteAttempts */\n`,
        ),
      ).toEqual([])
    })

    it('allows the retry surface and the queries', () => {
      for (const file of ALLOWED) {
        expect(findQueueReaders(file, `listWriteAttempts(orgId)\n`)).toEqual([])
      }
    })
  })

  it('finds no reader outside the retry surface', () => {
    const violations = sourceFiles(PACKAGES).flatMap((full) =>
      findQueueReaders(relative(REPO_ROOT, full).replace(/\\/g, '/'), readFileSync(full, 'utf8')),
    )
    expect(violations).toEqual([])
  })

  it('swept something', () => {
    expect(sourceFiles(PACKAGES).length).toBeGreaterThan(100)
  })
})
