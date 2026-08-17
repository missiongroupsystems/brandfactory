import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A source sweep: **a brand's structure is read through the resolver, never by joining
 * `passport.unit` by hand.**
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 8c. Decision: proposal §8 `D1-b`.
 *
 * ## The bug this exists for, and why nothing catches it
 *
 * Under `D1-b` a brand may have no Passport unit — it was created while Passport was
 * unreachable, and it is fully usable. So the join in `queries/structure.ts` is a **LEFT**
 * join.
 *
 * The next person needing a brand's legal name writes the obvious query:
 *
 * ```ts
 * db.select().from(brands).innerJoin(passportUnit, eq(passportUnit.id, brands.passportUnitId))
 * ```
 *
 * It compiles. It typechecks. It passes every test written against seeded, linked data. And
 * it **silently drops every locally created brand** — the list renders an empty page while
 * the brand exists, works, and is visible on the next screen over. There is no error to find
 * it by, and the natural diagnosis is "the brand wasn't saved", which is false.
 *
 * A `.leftJoin` written by hand is no better: it duplicates the three resolution rules
 * (`structure.ts`), and duplicating them is how `legalName ?? displayName` gets written.
 *
 * ## The rule
 *
 * `passportUnit` may be named only by the projection's own modules, the sync path, and the
 * one query module that owns the join. Anything else reads `createStructureResolver`.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGES = join(HERE, '..', '..')
const REPO_ROOT = join(PACKAGES, '..')
const SELF = 'packages/server/src/structure-read-guard.test.ts'

const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage', '.turbo'])

/**
 * Where naming the projection's unit table is legitimate.
 *
 * **Adding a file here is a claim, not a formality**: either "this file IS the projection" or
 * "this file owns the join". A route, a service or a component is never either.
 */
const ALLOWED = [
  // The projection itself, and its own barrels.
  'packages/db/src/schema/passport/mutable.ts',
  'packages/db/src/schema/passport/immutable.ts',
  'packages/db/src/schema/passport/index.ts',
  'packages/db/src/schema/passport/schema.ts',
  // The projection's writers and readers — the sync path.
  'packages/db/src/queries/passport.ts',
  'packages/db/src/queries/passport-read.ts',
  // The ONE module that owns the LEFT JOIN.
  'packages/db/src/queries/structure.ts',
  // The projection's OWN guards. Each names the table as the subject of its assertions —
  // one lists it among the identifiers a write must never target, the other renders its
  // version-guard SQL. Neither reads brand structure, which is what this sweep is about.
  'packages/db/src/passport-write-guard.test.ts',
  'packages/db/src/queries/passport-version-guard.test.ts',
]

/** Strip comments, keeping line numbers — the same shape as the repo's other sweeps. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => '\n'.repeat((block.match(/\n/g) ?? []).length))
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')
}

/**
 * `passportUnit` as a whole word, so `passportUnitRelation`, `passportUnitAppAccess` and
 * `passportUnitAppMembership` do not match. Those are different tables with different rules,
 * and flagging them here would train people to allow-list files to silence noise.
 */
const PATTERN = /\bpassportUnit\b/g

interface Violation {
  file: string
  line: number
}

export function findDirectUnitReads(file: string, rawSource: string): Violation[] {
  if (file === SELF || ALLOWED.includes(file)) return []
  // A test of an allowed file may name it. Narrowed to the exact `.test.ts` sibling rather
  // than exempting tests as a class: a test that hand-joins to build a brand-list fixture is
  // the same bug one step earlier.
  if (ALLOWED.some((a) => file === a.replace(/\.tsx?$/, '.test.ts'))) return []

  const source = stripComments(rawSource)
  return source
    .split('\n')
    .map((line, i) => ({ line: i + 1, hit: PATTERN.test(line) }))
    .filter(({ hit }) => hit)
    .map(({ line }) => ({ file, line }))
}

function sourceFiles(dir = PACKAGES): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    out.push({
      path: relative(REPO_ROOT, full).replace(/\\/g, '/'),
      text: readFileSync(full, 'utf8'),
    })
  }
  return out
}

describe('brand structure is read through the resolver', () => {
  describe('the detector itself', () => {
    // The real assertion is an absence, so a broken pattern would pass it while checking
    // nothing. These exercise it on known input.
    it('catches an inner join in a route', () => {
      const found = findDirectUnitReads(
        'packages/server/src/routes/brands.ts',
        'db.select().from(brands).innerJoin(passportUnit, eq(passportUnit.id, brands.passportUnitId))\n',
      )
      expect(found).toEqual([{ file: 'packages/server/src/routes/brands.ts', line: 1 }])
    })

    it('does NOT match the other three unit tables', () => {
      // Different tables, different rules. Flagging them would produce noise, and noise is
      // what gets a guard allow-listed into uselessness.
      expect(
        findDirectUnitReads(
          'packages/server/src/x.ts',
          'from(passportUnitRelation)\nfrom(passportUnitAppAccess)\nfrom(passportUnitAppMembership)\n',
        ),
      ).toEqual([])
    })

    it('ignores a mention in a comment', () => {
      // Several headers explain, by name, why nothing may read this table directly.
      expect(
        findDirectUnitReads(
          'packages/server/src/x.ts',
          '// never join passportUnit by hand\n/* passportUnit */\n',
        ),
      ).toEqual([])
    })

    it('allows the projection and the join’s owner', () => {
      for (const file of ALLOWED) {
        expect(findDirectUnitReads(file, 'from(passportUnit)\n')).toEqual([])
      }
    })
  })

  it('finds no hand-rolled unit read anywhere else', () => {
    const violations = sourceFiles().flatMap((f) => findDirectUnitReads(f.path, f.text))
    expect(violations).toEqual([])
  })

  it('swept something', () => {
    expect(sourceFiles().length).toBeGreaterThan(100)
  })
})
