import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openPostgres, type Db } from './db'
import { loadEnv } from './env'
import { Refused } from './errors'
import { applyPackMigrations, migrateCore, setupLogin } from './migrate'
import { readPack, type PackContent } from './pack'
import { testVersion } from './platform'
import { addPrincipal, liveVersion, promote, publish, recordTestRun, setLoadout } from './registry'
import { authenticate } from './run'

const USAGE = `core <command>

  migrate [<pack> <version>]        the core's migrations, then a tested version's
  setup-login <role>                as the installing superuser: the login a deployed core runs
                                    as; the password is read from CORE_LOGIN_PASSWORD
  login --dev <userId>              local sign-in: the token is the user id
  login <email>                     Supabase sign-in; the password is read from CORE_PASSWORD
  publish <packDir>                 freezes the pack's version
  test <pack> <version>             runs its tests and the platform tests, records the run
  promote <pack> <version> [--env <name>]
                                    moves the live pointer (a person only)
  principal <id> [--agent-of <id>]  adds a person, or an agent acting for one
  loadout <principal> <pack> <op...|all>

DATABASE_URL names the database. Commands that act for someone read the session from
\`core login\` (or CORE_TOKEN) and check it as the server does. Whoever holds DATABASE_URL can
also add principals and loadouts: the database credential is the root of trust.`

const SESSION = path.join(homedir(), '.config', 'brandbase-core', 'session.json')

function readToken(): string {
  if (process.env.CORE_TOKEN) return process.env.CORE_TOKEN
  try {
    return (JSON.parse(readFileSync(SESSION, 'utf8')) as { token: string }).token
  } catch {
    throw new Error('not signed in: run `core login` first')
  }
}

function saveToken(token: string) {
  mkdirSync(path.dirname(SESSION), { recursive: true, mode: 0o700 })
  writeFileSync(SESSION, JSON.stringify({ token }), { mode: 0o600 })
  // A file that existed keeps its old mode through writeFileSync.
  chmodSync(SESSION, 0o600)
}

async function supabaseLogin(email: string) {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const anon = process.env.SUPABASE_ANON_KEY
  const password = process.env.CORE_PASSWORD
  if (!url || !anon || !password) {
    throw new Error('Supabase sign-in needs SUPABASE_URL, SUPABASE_ANON_KEY and CORE_PASSWORD')
  }
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`sign-in refused (${res.status})`)
  return ((await res.json()) as { access_token: string }).access_token
}

/** The person (or agent) the session belongs to, verified as the server verifies a call. */
async function actor(token = readToken()) {
  return authenticate(loadEnv().auth, `Bearer ${token}`)
}

async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  const db = openPostgres(url, 2)
  try {
    return await fn(db)
  } finally {
    await db.close()
  }
}

async function versionContent(db: Db, pack: string, version: string) {
  const [row] = await db.query<{ content: PackContent }>(
    'select content from packs.pack_versions where pack = $1 and version = $2',
    [pack, version],
  )
  if (!row) throw new Error(`no version ${version} of ${pack}`)
  return row.content
}

function option(args: string[], name: string) {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const value = args[i + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`)
  args.splice(i, 2)
  return value
}

export async function main(argv: string[]) {
  const [command, ...args] = argv
  switch (command) {
    case 'migrate':
      return withDb(async (db) => {
        console.info('core:', (await migrateCore(db)).join(', ') || 'up to date')
        const [pack, version] = args
        if (!pack) return
        if (!version) throw new Error(USAGE)
        // A pack's migrations reach this database only from a published version with a passing
        // run: they run as the migrator, and the platform tests checked what they did.
        const [row] = await db.query<{ content: PackContent }>(
          `select v.content from packs.pack_versions v
           where v.pack = $1 and v.version = $2 and exists (
             select 1 from packs.test_runs r where r.version_hash = v.content_hash and r.passed)`,
          [pack, version],
        )
        if (!row) throw new Error(`${pack} ${version} has no passing test run`)
        const done = await applyPackMigrations(db, pack, row.content.migrations)
        console.info(`${pack}:`, done.join(', ') || 'up to date')
      })
    case 'setup-login':
      return withDb(async (db) => {
        const password = process.env.CORE_LOGIN_PASSWORD
        if (!args[0] || !password) throw new Error(USAGE)
        const n = await setupLogin(db, args[0], password)
        console.info(`${args[0]} logs in, holds the pack roles and owns the core's ${n} objects`)
      })
    case 'login': {
      const dev = option(args, '--dev')
      const token = dev ?? (args[0] ? await supabaseLogin(args[0]) : undefined)
      if (!token) throw new Error(USAGE)
      // Checked as any call is before it is kept: under AUTH_PROVIDER=supabase a bare id fails.
      const who = await actor(token)
      saveToken(token)
      console.info('signed in as', who)
      return
    }
    case 'publish':
      return withDb(async (db) => {
        if (!args[0]) throw new Error(USAGE)
        const out = await publish(db, readPack(args[0]), await actor())
        console.info(`published ${out.pack} ${out.version} (${out.hash.slice(0, 12)})`)
      })
    case 'test':
      return withDb(async (db) => {
        const [pack, version] = args
        if (!pack || !version) throw new Error(USAGE)
        const content = await versionContent(db, pack, version)
        const run = await testVersion(content)
        await recordTestRun(db, { pack, version, hash: run.hash, passed: run.passed, results: run })
        for (const r of run.results.filter((r) => !r.ok))
          console.info(`FAIL ${r.file}: ${r.name}\n  ${r.error}`)
        for (const p of run.platform) console.info(`PLATFORM ${p}`)
        const ok = run.results.filter((r) => r.ok).length
        console.info(
          `${pack} ${version}: ${run.passed ? 'passed' : 'failed'}, ${ok}/${run.results.length} cases`,
        )
        if (!run.passed) process.exitCode = 1
      })
    case 'promote':
      return withDb(async (db) => {
        const environment = option(args, '--env') ?? loadEnv().environment
        const [pack, version] = args
        if (!pack || !version) throw new Error(USAGE)
        await promote(db, { actor: await actor(), environment, pack, version })
        console.info(`${pack} ${version} is live in ${environment}`)
      })
    case 'principal':
      return withDb(async (db) => {
        const agentOf = option(args, '--agent-of') ?? null
        if (!args[0]) throw new Error(USAGE)
        await addPrincipal(db, args[0], agentOf)
        console.info(agentOf ? `${args[0]} acts for ${agentOf}` : `${args[0]} is a person`)
      })
    case 'loadout':
      return withDb(async (db) => {
        const [principal, pack, ...ops] = args
        if (!principal || !pack || ops.length === 0) throw new Error(USAGE)
        let names = ops
        if (ops.length === 1 && ops[0] === 'all') {
          // Every move of the version live in this environment, and none when nothing is live.
          const environment = loadEnv().environment
          const live = await liveVersion(db, environment, pack)
          if (!live) throw new Error(`${pack} has no live version in ${environment}`)
          names = Object.keys(live.content.ops)
        }
        await setLoadout(db, principal, pack, names)
        console.info(`${principal} may call ${names.length} moves of ${pack}`)
      })
    default:
      throw new Error(USAGE)
  }
}

// Node runs a module by its real path; in the image the CLI is reached through a symlink
// (node_modules/@brandfactory/core), so the path given is resolved the same way.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Refused ? `${err.code}: ${err.message}` : (err as Error).message)
    process.exitCode = 1
  })
}
