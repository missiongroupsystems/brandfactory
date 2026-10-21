import { writeClaims } from './claims'
import { type Conn, type Db } from './db'
import { Refused } from './errors'
import { hashOf, packProblems, type PackContent } from './pack'

/** A database error's SQLSTATE and constraint, from pg or PGlite. */
export function pgError(err: unknown): { code?: string; constraint?: string; message: string } {
  const e = err as { code?: string; constraint?: string; message?: string }
  return { code: e?.code, constraint: e?.constraint, message: e?.message ?? String(err) }
}

/** Runs `fn` as `pack_admin`, the only role that writes versions, test runs and the pointer. */
function asAdmin<T>(db: Db, fn: (tx: Conn) => Promise<T>, actor?: string): Promise<T> {
  return db.transaction(async (tx) => {
    if (actor !== undefined) await writeClaims(tx, { actor })
    await tx.exec('set local role pack_admin')
    return fn(tx)
  })
}

/** Freezes a version. Refused when any move or rule fails the checks, or the version exists. */
export async function publish(db: Db, content: PackContent, publishedBy: string) {
  const problems = packProblems(content)
  if (problems.length > 0) {
    throw new Refused(400, 'INVALID_PACK', problems[0]!, { details: problems })
  }
  const hash = hashOf(content)
  const { name: pack, version } = content.manifest
  try {
    await asAdmin(db, (tx) =>
      tx.query(
        `insert into packs.pack_versions (pack, version, content, content_hash, published_by)
         values ($1, $2, $3, $4, $5)`,
        [pack, version, JSON.stringify(content), hash, publishedBy],
      ),
    )
  } catch (err) {
    if (pgError(err).code === '23505') {
      throw new Refused(409, 'VERSION_EXISTS', `${pack} ${version} is already published`)
    }
    throw err
  }
  return { pack, version, hash }
}

/** Records a run; the database refuses a hash that is not the version's own. */
export async function recordTestRun(
  db: Db,
  run: { pack: string; version: string; hash: string; passed: boolean; results: unknown },
) {
  await asAdmin(db, (tx) =>
    tx.query(
      `insert into packs.test_runs (pack, version, version_hash, passed, results)
       values ($1, $2, $3, $4, $5)`,
      [run.pack, run.version, run.hash, run.passed, JSON.stringify(run.results)],
    ),
  )
}

/**
 * Moves the live pointer. The database refuses unless the version has a passing test run for its
 * exact content and `actor` is a person; `actor` must come from a verified token.
 */
export async function promote(
  db: Db,
  input: { actor: string; environment: string; pack: string; version: string },
) {
  try {
    await asAdmin(
      db,
      (tx) =>
        tx.query(
          `insert into packs.channels (environment, pack, version, promoted_by)
           values ($1, $2, $3, '')
           on conflict (environment, pack) do update set version = excluded.version`,
          [input.environment, input.pack, input.version],
        ),
      input.actor,
    )
  } catch (err) {
    const e = pgError(err)
    if (e.constraint === 'promotion_needs_passing_run') {
      throw new Refused(409, 'NO_PASSING_RUN', e.message)
    }
    if (e.constraint === 'promotion_needs_person') throw new Refused(403, 'NOT_A_PERSON', e.message)
    if (e.constraint === 'promotion_needs_version') throw new Refused(404, 'NO_VERSION', e.message)
    throw err
  }
}

export interface LiveVersion {
  version: string
  hash: string
  content: PackContent
}

/**
 * Versions' content by hash. A published version never changes (`pack_versions_frozen`) and its
 * hash is unique, so a hash always names the same content: nothing here can go stale.
 */
const contents = new Map<string, PackContent>()
const CONTENTS_MAX = 32

function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) frozen(v)
    Object.freeze(value)
  }
  return value
}

/**
 * The version live for a pack in an environment, or null. The pointer is read on every call, so
 * a promotion or a rollback is seen by the next call on every instance; only the content, which
 * the hash names, is kept in memory.
 */
export async function liveVersion(
  db: Conn,
  environment: string,
  pack: string,
): Promise<LiveVersion | null> {
  const [row] = await db.query<{ version: string; hash: string }>(
    `select v.version, v.content_hash as hash
     from packs.channels c
     join packs.pack_versions v on v.pack = c.pack and v.version = c.version
     where c.environment = $1 and c.pack = $2`,
    [environment, pack],
  )
  if (!row) return null
  let content = contents.get(row.hash)
  if (!content) {
    const [v] = await db.query<{ content: PackContent }>(
      'select content from packs.pack_versions where content_hash = $1',
      [row.hash],
    )
    if (!v) throw new Error(`no content for ${pack} ${row.version}`)
    if (contents.size >= CONTENTS_MAX) contents.clear()
    // Shared by every call that reads this version, so no call can change it for the next.
    content = frozen(v.content)
    contents.set(row.hash, content)
  }
  return { version: row.version, hash: row.hash, content }
}

/**
 * Adds a person, or an agent acting for one. Adding one that exists is a no-op; asking for it
 * as the other kind is refused, so a person never quietly stays a person when an agent was meant.
 */
export async function addPrincipal(db: Conn, id: string, agentOf: string | null = null) {
  await db.query(
    `insert into packs.principals (id, agent_of) values ($1, $2) on conflict (id) do nothing`,
    [id, agentOf],
  )
  const [row] = await db.query<{ agent_of: string | null }>(
    'select agent_of from packs.principals where id = $1',
    [id],
  )
  if ((row?.agent_of ?? null) !== agentOf) {
    throw new Refused(409, 'PRINCIPAL_EXISTS', `${id} exists as another kind of principal`)
  }
}

/** Sets the moves a principal may call in a pack; an empty list takes every move away. */
export async function setLoadout(db: Conn, principal: string, pack: string, ops: string[]) {
  await db.query(
    `insert into packs.loadouts (principal, pack, ops) values ($1, $2, $3)
     on conflict (principal, pack) do update set ops = excluded.ops`,
    [principal, pack, ops],
  )
}
