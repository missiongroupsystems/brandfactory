import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Conn, type Db } from './db'
import { definitionProblem, forbiddenFunction, migrationProblem, statements } from './sql'

export interface Migration {
  name: string
  sql: string
}

const CORE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations')

/** The `.sql` files of a folder, in filename order. */
export function readMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), 'utf8') }))
}

const hashOf = (sql: string) => createHash('sha256').update(sql).digest('hex')

/**
 * Core migrations rewritten after they ran, so that a role that is not a superuser can apply them
 * (docs/executing/core-no-superuser-plan.md, phase 3): what they do on a superuser is unchanged, so
 * a database that applied the earlier text is up to date.
 */
const EARLIER: Record<string, string[]> = {
  '0001_registry.sql': ['debeea582024c6d3df3e3581a499ec468357ff122b110075b994d20a31288396'],
  '0009_pack_roles_functions.sql': [
    'a16be915da9db02e383cc675f370efb9c0ec97ffb8b8026f8af326e8921812be',
  ],
  '0010_superuser_functions.sql': [
    'd99a06e636a2c359f6dbf2028fa3ed39d2c60fed26d2a00144ad74cedcb4433e',
  ],
}

/**
 * Applies the migrations of one scope ('core', or a pack's name) that are not yet recorded, each
 * in its own transaction, as the login role. A recorded migration whose text changed is refused:
 * an applied migration is never edited, only followed by a new one.
 */
export async function applyMigrations(db: Db, scope: string, migrations: Migration[]) {
  return apply(db, scope, migrations, null)
}

/**
 * A pack's migrations, run as pack_migrator: what they make, it owns; it has no right in schema
 * `packs` and is not a superuser, so a migration cannot change the registry or its guards.
 */
export function applyPackMigrations(db: Db, pack: string, migrations: Migration[]) {
  for (const m of migrations) {
    const problem = migrationProblem(m.sql)
    if (problem) throw new Error(`migration ${pack}/${m.name}: ${problem}`)
  }
  return apply(db, pack, migrations, 'pack_migrator')
}

async function apply(db: Db, scope: string, migrations: Migration[], role: string | null) {
  const [exists] = await db.query<{ ok: boolean }>(
    `select to_regclass('packs.migrations') is not null as ok`,
  )
  const applied = new Map<string, string>()
  if (exists?.ok) {
    // A pack's through the owner's function: its migrator's login reads no core table (0014).
    const rows = await db.query<{ name: string; hash: string }>(
      role
        ? 'select name, hash from packs.pack_migrations($1)'
        : 'select name, hash from packs.migrations where scope = $1',
      [scope],
    )
    for (const r of rows) applied.set(r.name, r.hash)
  }
  const done: string[] = []
  for (const m of migrations) {
    const hash = hashOf(m.sql)
    const before = applied.get(m.name)
    if (before !== undefined) {
      const same = before === hash || (scope === 'core' && EARLIER[m.name]?.includes(before))
      if (!same) throw new Error(`migration ${scope}/${m.name} changed after it ran`)
      continue
    }
    await db.transaction(async (tx) => {
      if (role) {
        // One statement at a time, through the protocol that runs one statement only: the text
        // was checked at publish (migrationProblem), and nothing here can end this transaction
        // or leave the role.
        // Plain strings take no backslash escapes, whatever the server's default.
        await tx.exec(`set local standard_conforming_strings = on; set local role ${role}`)
        for (const st of statements(m.sql)) {
          await tx.query(st)
          // After every statement, not once at the end: a statement could call a function the
          // one before it made. Still the migrator, and nothing it owns hides a word.
          const [now] = await tx.query<{ ok: boolean }>('select current_user = $1 as ok', [role])
          if (!now?.ok) throw new Error(`migration ${scope}/${m.name} left the role ${role}`)
          await refuseHiddenWords(tx, `${scope}/${m.name}`)
          // From the migrator's login (not the core's owner, nor a superuser in tests), SQL that
          // left pack_migrator could make an object the login owns, which no check reads.
          const [left] = await tx.query<{ owns: boolean }>(
            `select exists (select 1 from pg_class where relowner = r.oid)
               or exists (select 1 from pg_proc where proowner = r.oid)
               or exists (select 1 from pg_namespace where nspowner = r.oid)
               or exists (select 1 from pg_type where typowner = r.oid) as owns
             from pg_roles r where r.rolname = session_user and not r.rolsuper
               and r.oid <> (select nspowner from pg_namespace where nspname = 'packs')`,
          )
          if (left?.owns)
            throw new Error(`migration ${scope}/${m.name} made an object its login owns`)
        }
        await tx.exec('reset role')
      } else {
        await tx.exec(m.sql)
      }
      await tx.query(
        role
          ? 'select packs.pack_migration_done($1, $2, $3)'
          : 'insert into packs.migrations (scope, name, hash) values ($1, $2, $3)',
        [scope, m.name, hash],
      )
    })
    done.push(m.name)
  }
  return done
}

/**
 * What Postgres stores, decoded, for every object pack_migrator owns: function sources, views,
 * row rules, defaults, checks, indexes, triggers and rules. Each must pass `definitionProblem`, so
 * a word the migration's raw text hid in escapes is refused before the migration commits.
 */
const PACK_DEFINITIONS = `
  select 'function ' || p.oid::regprocedure::text as what, pg_get_functiondef(p.oid) as def
    from pg_proc p where p.proowner = 'pack_migrator'::regrole and p.prokind in ('f', 'p')
  union all
  select 'view ' || c.oid::regclass::text, pg_get_viewdef(c.oid)
    from pg_class c where c.relowner = 'pack_migrator'::regrole and c.relkind in ('v', 'm')
  union all
  select 'policy ' || pol.polname || ' on ' || pol.polrelid::regclass::text,
    concat_ws(' ', pg_get_expr(pol.polqual, pol.polrelid), pg_get_expr(pol.polwithcheck, pol.polrelid))
    from pg_policy pol join pg_class c on c.oid = pol.polrelid
    where c.relowner = 'pack_migrator'::regrole
  union all
  select 'default on ' || d.adrelid::regclass::text, pg_get_expr(d.adbin, d.adrelid)
    from pg_attrdef d join pg_class c on c.oid = d.adrelid
    where c.relowner = 'pack_migrator'::regrole
  union all
  select 'constraint ' || con.conname, pg_get_constraintdef(con.oid)
    from pg_constraint con join pg_class c on c.oid = con.conrelid
    where c.relowner = 'pack_migrator'::regrole and con.contype = 'c'
  union all
  select 'domain check ' || con.conname, pg_get_constraintdef(con.oid)
    from pg_constraint con join pg_type ty on ty.oid = con.contypid
    where ty.typowner = 'pack_migrator'::regrole and con.contype = 'c'
  union all
  select 'index ' || i.indexrelid::regclass::text, pg_get_indexdef(i.indexrelid)
    from pg_index i join pg_class c on c.oid = i.indrelid
    where c.relowner = 'pack_migrator'::regrole
  union all
  select 'trigger ' || t.tgname, pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relowner = 'pack_migrator'::regrole and not t.tgisinternal
  union all
  select 'rule ' || r.rulename, pg_get_ruledef(r.oid)
    from pg_rewrite r join pg_class c on c.oid = r.ev_class
    where c.relowner = 'pack_migrator'::regrole and r.rulename <> '_RETURN'`

async function refuseHiddenWords(tx: Conn, migration: string) {
  for (const { what, def } of await tx.query<{ what: string; def: string }>(PACK_DEFINITIONS)) {
    const problem = definitionProblem(def ?? '')
    if (problem) throw new Error(`migration ${migration}: ${what} holds ${problem}`)
  }
}

/**
 * The core's migrations, as the role that installs and owns the core (never the server's login).
 * On a superuser, 0001 also takes risky functions (`set_config`, the `*_to_xml` family, large
 * objects…) from PUBLIC, which only their owner can do, and that is checked below. Without one
 * (Supabase) the revokes are skipped: the core's walls since migrations 0011 to 0013 hold without
 * them (docs/executing/core-no-superuser-plan.md).
 */
export async function migrateCore(db: Db) {
  const migrations = readMigrations(CORE_DIR)
  const [me] = await db.query<{ rolsuper: boolean }>(
    'select rolsuper from pg_roles where rolname = current_user',
  )
  // Without a superuser (Supabase) 0001's revokes from PUBLIC do not take: Postgres skips them
  // with a warning. The core no longer relies on them (phases 0 to 3 of
  // docs/executing/core-no-superuser-plan.md); where a superuser installs, they are a second wall
  // and are checked below.
  const done = await applyMigrations(db, 'core', migrations)
  // Postgres's own rule, which 0001 broke for roles it found (0010): only a superuser reads or
  // writes server files or reloads the configuration. Without a superuser only the core's roles
  // and their members are the core's to answer for: Supabase itself gives `postgres`
  // pg_reload_conf, and no role but its superuser can take it back.
  const servers = await db.query<{ role: string; proname: string }>(
    `select distinct r.rolname as role, p.proname
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace, pg_roles r
     where n.nspname = 'pg_catalog' and not r.rolsuper and r.rolname not like 'pg\\_%'
       and p.proname in ('lo_import', 'lo_export', 'pg_read_file', 'pg_read_binary_file',
         'pg_ls_dir', 'pg_stat_file', 'pg_reload_conf')
       and has_function_privilege(r.oid, p.oid, 'execute')
       and ($1 or r.rolname like 'pack\\_%' or (r.rolname <> current_user and exists (
         select 1 from pg_auth_members m join pg_roles g on g.oid = m.roleid
         where m.member = r.oid and g.rolname like 'pack\\_%')))`,
    [me?.rolsuper ?? false],
  )
  if (servers.length > 0) {
    const named = [...new Set(servers.map((r) => `${r.role} ${r.proname}`))].sort()
    throw new Error(
      `a role that is not a superuser can call a superuser's function (${named.join(', ')}): ` +
        'revoke it as the superuser (migration 0010 took them back once, at install)',
    )
  }
  // What 0001 and 0009 are for, checked on every run: a database installed some other way, or a
  // function granted back since, is refused before a pack's SQL or migrations can reach it.
  const callable = await db.query<{ role: string; proname: string }>(
    `select distinct r.role, p.proname
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
       unnest(array['pack_runtime', 'pack_admin', 'pack_migrator', 'pack_server']) as r(role)
     where n.nspname = 'pg_catalog' and has_function_privilege(r.role, p.oid, 'execute')`,
  )
  const risky = callable.filter((r) => forbiddenFunction(r.proname))
  if (risky.length > 0 && !me?.rolsuper) {
    console.warn(
      `core migrate: not a superuser, so the pack roles keep ${new Set(risky.map((r) => r.proname)).size} ` +
        'functions 0001 takes from PUBLIC elsewhere; the walls of migrations 0011 to 0013 hold without them',
    )
  } else if (risky.length > 0) {
    const named = [...new Set(risky.map((r) => `${r.role} ${r.proname}`))].sort()
    throw new Error(
      `a pack role can call a function 0001 takes away (${named.join(', ')}): the core was not ` +
        'installed by a superuser, or a grant brought them back (packages/core/src/migrate.ts)',
    )
  }
  return done
}

/** A login role's name: lowercase, so it needs no quotes in SQL. */
const ROLE = /^[a-z_][a-z0-9_]{0,62}$/

/**
 * A SCRAM-SHA-256 verifier for `password`, as Postgres stores it: what the server keeps, from which
 * the password cannot be read back. Sent in its place, so the password itself reaches no server
 * log; the verifier may, where DDL is logged, and allows guessing offline, so the password is long
 * and random.
 */
export function scramVerifier(password: string, salt = randomBytes(16), iterations = 4096) {
  const salted = pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256')
  const hmac = (key: Buffer, text: string) => createHmac('sha256', key).update(text).digest()
  const stored = createHash('sha256').update(hmac(salted, 'Client Key')).digest()
  const server = hmac(salted, 'Server Key')
  const b64 = (b: Buffer) => b.toString('base64')
  return `SCRAM-SHA-256$${iterations}:${b64(salt)}$${b64(stored)}:${b64(server)}`
}

/** The pack roles each kind of login holds, and nothing else. */
export const LOGIN_ROLES = {
  server: ['pack_runtime', 'pack_server'],
  migrator: ['pack_migrator', 'pack_recorder'],
} as const

/**
 * The login a deployed core runs as, made by whoever installed the core (`core setup-login`): a
 * superuser on Fly, or on Supabase a role with CREATEROLE (docs/executing/core-no-superuser-plan.md,
 * phase 3). Not a superuser, and owns nothing: every escape a review found ends at the session
 * user, so that user may do only what one call may. It holds pack_runtime (to run a pack's SQL)
 * and pack_server (to call the core's functions, migration 0013) and nothing else, has no right on
 * any core table, and keeps no role settings of its own. Where the installer is a superuser it
 * may also call `set_config`, the one function migration 0001 took from PUBLIC that the core
 * uses. Run again, it resets the password, the attributes, the settings and the memberships.
 * Roles belong to the server: one database per server.
 *
 * With `kind` 'migrator' (`core setup-migrator`), the login a pack's migrations run from: it holds
 * pack_migrator and pack_recorder (migration 0014) instead, so SQL in a migration that leaves
 * pack_migrator lands on a role with no more rights.
 */
export async function setupLogin(
  db: Db,
  role: string,
  password: string,
  kind: keyof typeof LOGIN_ROLES = 'server',
) {
  const roles = LOGIN_ROLES[kind]
  if (!ROLE.test(role))
    throw new Error(`a login role is lowercase letters, digits and _, not ${role}`)
  if (role.startsWith('pack_') || role.startsWith('pg_')) throw new Error(`${role} is reserved`)
  // Letters, digits, - and _: the same before and after Postgres prepares it (SASLprep), and it
  // goes in DATABASE_URL as it is.
  if (!/^[A-Za-z0-9_-]{24,}$/.test(password)) {
    throw new Error('the password is 24 or more letters, digits, - or _ (openssl rand -hex 24)')
  }
  return db.transaction(async (tx) => {
    const [me] = await tx.query<{ rolsuper: boolean; owner: boolean }>(
      `select rolsuper, (select nspowner = r.oid from pg_namespace where nspname = 'packs') as owner
       from pg_roles r where rolname = current_user`,
    )
    if (!me?.rolsuper && !me?.owner) {
      throw new Error('setup-login runs as the role that installed the core')
    }
    // Only the core's own login is made or reset: never the role running this, a superuser, a
    // role that owns anything, or one the core did not make for this use (not a member of
    // pack_runtime, or pack_migrator for the migrator's).
    const [found] = await tx.query<{
      me: boolean
      rolsuper: boolean
      ours: boolean
      owns: boolean
    }>(
      `select rolname = current_user as me, rolsuper,
         exists (select 1 from pg_auth_members m
           where m.member = r.oid and m.roleid = $2::regrole) as ours,
         exists (select 1 from pg_class where relowner = r.oid)
           or exists (select 1 from pg_proc where proowner = r.oid)
           or exists (select 1 from pg_namespace where nspowner = r.oid)
           or exists (select 1 from pg_type where typowner = r.oid) as owns
       from pg_roles r where rolname = $1`,
      [role, roles[0]],
    )
    if (found && (found.me || found.rolsuper || !found.ours || found.owns)) {
      throw new Error(`${role} exists and is not the core's login: choose another name`)
    }
    const verifier = scramVerifier(password).replaceAll("'", "''")
    if (found) {
      // Run again (a new password): only a superuser may restate SUPERUSER and the rest, so the
      // attributes are checked instead.
      const [attrs] = await tx.query<{ ok: boolean }>(
        `select not (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)
           as ok from pg_roles where rolname = $1`,
        [role],
      )
      if (!attrs?.ok) throw new Error(`${role} has an attribute the core's login may not have`)
      await tx.exec(`alter role ${role} with login password '${verifier}'`)
    } else {
      await tx.exec(
        `create role ${role} with login nosuperuser nocreatedb nocreaterole noreplication ` +
          `nobypassrls password '${verifier}'`,
      )
    }
    // A role's own settings outlive every reset a session makes, those for one database too; the
    // login keeps none.
    await tx.exec(`alter role ${role} reset all`)
    const perDatabase = await tx.query<{ name: string }>(
      `select d.datname as name from pg_db_role_setting s join pg_database d on d.oid = s.setdatabase
       where s.setrole = $1::regrole`,
      [role],
    )
    for (const { name } of perDatabase) {
      await tx.exec(`alter role ${role} in database "${name.replaceAll('"', '""')}" reset all`)
    }
    const held = await tx.query<{ name: string }>(
      `select m.roleid::regrole::text as name from pg_auth_members m
       where m.member = $1::regrole and m.roleid::regrole::text <> all ($2::text[])`,
      [role, [...roles]],
    )
    for (const { name } of held) await tx.exec(`revoke ${name} from ${role}`)
    await tx.exec(`grant ${roles.join(', ')} to ${role}`)
    if (me.rolsuper) {
      // A login that existed when 0001 ran got every function on its list back; it keeps only
      // set_config.
      const granted = await tx.query<{ fn: string; proname: string }>(
        `select p.oid::regprocedure::text as fn, p.proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'pg_catalog' and has_function_privilege($1, p.oid, 'execute')`,
        [role],
      )
      for (const { fn } of granted.filter((g) => forbiddenFunction(g.proname))) {
        await tx.exec(`revoke execute on function ${fn} from ${role}`)
      }
      // A migration needs no function; a call sets its time limit with set_config.
      if (kind === 'server') {
        await tx.exec(
          `grant execute on function pg_catalog.set_config(text, text, boolean) to ${role}`,
        )
      }
    }
    return held.length
  })
}
