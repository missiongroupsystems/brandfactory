import { devAuth } from './auth'
import { dumpPglite, openPglite, openPgliteFrom, type Db } from './db'
import { applyMigrations, migrateCore } from './migrate'
import { hashOf, type PackContent } from './pack'
import { addPrincipal, promote, publish, recordTestRun, setLoadout } from './registry'
import { type CoreDeps } from './run'

let migrated: Promise<Blob> | null = null

/** A database with the core's migrations applied, cloned from one migrated copy per worker. */
export async function freshDb(): Promise<Db> {
  migrated ??= (async () => {
    const db = openPglite()
    await migrateCore(db)
    const dump = await dumpPglite(db)
    await db.close()
    return dump
  })()
  return openPgliteFrom(await migrated)
}

/** The person who publishes and promotes in tests. */
export const OWNER = 'owner'

/**
 * Publishes a pack version, records a passing run for it and makes it live, as the owner. For
 * tests of the call path only: the pack's own tests are not run here.
 */
export async function goLive(db: Db, content: PackContent, environment = 'local') {
  await addPrincipal(db, OWNER)
  await applyMigrations(db, content.manifest.name, content.migrations)
  const { pack, version } = await publish(db, content, OWNER)
  await recordTestRun(db, { pack, version, hash: hashOf(content), passed: true, results: [] })
  await promote(db, { actor: OWNER, environment, pack, version })
}

/** A person with every move of the pack in their loadout. */
export async function person(db: Db, id: string, content: PackContent) {
  await addPrincipal(db, id)
  await setLoadout(db, id, content.manifest.name, Object.keys(content.ops))
}

export function deps(db: Db, now = new Date('2026-10-06T04:00:00Z')): CoreDeps {
  return { db, auth: devAuth(), environment: 'local', now: () => now }
}
