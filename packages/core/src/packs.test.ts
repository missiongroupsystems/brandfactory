import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { packProblems, readPack } from './pack'
import {
  everyPolicyRestricts,
  everyTableHasRowRules,
  noCodeRunsOnWrite,
  noFunctionCarriesSettings,
  noFunctionRunsAsItsOwner,
  registryIsIntact,
  runtimeRoleIsLimited,
} from './platform'
import { casesOf, pglite, postgres, type Seen } from './runner'

/** Every pack in the repository's `packs/` folder: its checks, then each of its test cases. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../packs')
const dirs = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())

for (const dir of dirs) {
  const content = readPack(path.join(root, dir.name))
  describe(`pack ${dir.name}`, () => {
    it('passes the checks a version must pass to be published', () => {
      expect(packProblems(content)).toEqual([])
    })
    it('gives every table the runtime role reaches forced row rules, and the role no way past them', async () => {
      const { db, dispose } = await pglite.fresh(content)
      try {
        expect([
          ...(await everyTableHasRowRules(db)),
          ...(await runtimeRoleIsLimited(db)),
          ...(await registryIsIntact(db)),
          ...(await everyPolicyRestricts(db)),
          ...(await noFunctionRunsAsItsOwner(db)),
          ...(await noFunctionCarriesSettings(db)),
          ...(await noCodeRunsOnWrite(db)),
        ]).toEqual([])
      } finally {
        await dispose()
      }
    })
    const seen: Seen = { refused: new Set(), notFound: new Set() }
    for (const c of casesOf(content)) {
      it(`${c.file}: ${c.name}`, () => c.run(seen), 30_000)
    }
    // Vitest runs a file's tests in order, so these see every case above.
    it('has a case that sees each rule refuse a call', () => {
      const used = Object.values(content.ops).flatMap((o) => [
        ...(o.before ?? []),
        ...(o.after ?? []),
      ])
      expect([...new Set(used)].filter((id) => !seen.refused.has(id))).toEqual([])
    })
    it('has a case where each move answers not-found', () => {
      expect(Object.keys(content.ops).filter((op) => !seen.notFound.has(op))).toEqual([])
    })
  })

  // The same cases on a real Postgres, where moves sent at once run at once (see postgres.test.ts).
  const url = process.env.CORE_TEST_PG_URL
  describe.skipIf(!url)(`pack ${dir.name} on Postgres`, () => {
    const target = url ? postgres(url) : undefined
    const seen: Seen = { refused: new Set(), notFound: new Set() }
    for (const c of casesOf(content, target)) {
      it(`${c.file}: ${c.name}`, () => c.run(seen), 60_000)
    }
    afterAll(() => target?.close())
  })
}
