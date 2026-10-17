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
    if (actor !== undefined) await tx.query(`select set_config('app.actor', $1, true)`, [actor])
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

/** The version live for a pack in an environment, or null. Read on every call. */
export async function liveVersion(
  db: Conn,
  environment: string,
  pack: string,
): Promise<LiveVersion | null> {
  const [row] = await db.query<{ version: string; hash: string; content: PackContent }>(
    `select v.version, v.content_hash as hash, v.content
     from packs.channels c
     join packs.pack_versions v on v.pack = c.pack and v.version = c.version
     where c.environment = $1 and c.pack = $2`,
    [environment, pack],
  )
  return row ?? null
}

/** Adds a person, or an agent acting for one. */
export async function addPrincipal(db: Conn, id: string, agentOf: string | null = null) {
  await db.query(
    `insert into packs.principals (id, agent_of) values ($1, $2) on conflict (id) do nothing`,
    [id, agentOf],
  )
}

/** Sets the moves a principal may call in a pack; an empty list takes every move away. */
export async function setLoadout(db: Conn, principal: string, pack: string, ops: string[]) {
  await db.query(
    `insert into packs.loadouts (principal, pack, ops) values ($1, $2, $3)
     on conflict (principal, pack) do update set ops = excluded.ops`,
    [principal, pack, ops],
  )
}
