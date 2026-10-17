import { openPglite, type Db } from './db'
import { migrateCore } from './migrate'
import { hashOf, type PackContent } from './pack'
import { pglite, runPackTests, type RunResult, type Target } from './runner'

/**
 * The tests every version runs beside its own, which no pack can remove or weaken. Each returns
 * the problems it found; a version with any problem fails.
 */

/** The runtime role cannot bypass row rules: not a superuser, no BYPASSRLS, owns nothing. */
export async function runtimeRoleIsLimited(db: Db): Promise<string[]> {
  const [role] = await db.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    `select rolsuper, rolbypassrls from pg_roles where rolname = 'pack_runtime'`,
  )
  const owned = await db.query<{ name: string }>(
    `select c.oid::regclass::text as name from pg_class c
     join pg_roles r on r.oid = c.relowner where r.rolname = 'pack_runtime'`,
  )
  const memberOf = await db.query<{ name: string }>(
    `select g.rolname as name from pg_auth_members m
     join pg_roles g on g.oid = m.roleid join pg_roles u on u.oid = m.member
     where u.rolname = 'pack_runtime'`,
  )
  return [
    ...(role?.rolsuper ? ['pack_runtime is a superuser'] : []),
    ...(role?.rolbypassrls ? ['pack_runtime bypasses row rules'] : []),
    ...owned.map((o) => `pack_runtime owns ${o.name}, so its row rules do not hold for it`),
    ...memberOf.map((m) => `pack_runtime is a member of ${m.name}`),
  ]
}

/**
 * Isolation in the database: every table the runtime role can read or write has row-level
 * security enabled and forced.
 */
export async function everyTableHasRowRules(db: Db): Promise<string[]> {
  const rows = await db.query<{ name: string; enabled: boolean; forced: boolean }>(
    `select distinct c.oid::regclass::text as name, c.relrowsecurity as enabled,
            c.relforcerowsecurity as forced
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p', 'v', 'm')
       and n.nspname not in ('pg_catalog', 'information_schema')
       and (has_table_privilege('pack_runtime', c.oid, 'select')
         or has_table_privilege('pack_runtime', c.oid, 'insert')
         or has_table_privilege('pack_runtime', c.oid, 'update')
         or has_table_privilege('pack_runtime', c.oid, 'delete'))`,
  )
  return rows
    .filter((r) => !r.enabled || !r.forced)
    .map((r) => `${r.name}: row-level security is not ${r.enabled ? 'forced' : 'enabled'}`)
}

/**
 * No function the runtime role can call runs with its owner's rights: a SECURITY DEFINER
 * function made by a pack migration (as the migrator) would read past every row rule.
 */
export async function noFunctionRunsAsItsOwner(db: Db): Promise<string[]> {
  const rows = await db.query<{ name: string }>(
    `select p.oid::regprocedure::text as name from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema')
       and has_function_privilege('pack_runtime', p.oid, 'execute')`,
  )
  return rows.map((r) => `${r.name} runs with its owner's rights and pack_runtime can call it`)
}

/**
 * No function the runtime role can call carries its own settings. A function's SET clause
 * (`set session_authorization = …`, `set role …`, `set search_path …`) applies while it runs, so
 * one could switch to the login role mid-move.
 */
export async function noFunctionCarriesSettings(db: Db): Promise<string[]> {
  const rows = await db.query<{ name: string; config: string[] }>(
    `select p.oid::regprocedure::text as name, p.proconfig as config from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where p.proconfig is not null and n.nspname not in ('pg_catalog', 'information_schema')
       and has_function_privilege('pack_runtime', p.oid, 'execute')`,
  )
  return rows.map((r) => `${r.name} sets ${r.config.join(', ')} while it runs`)
}

/**
 * Nothing a pack made runs on a write: no trigger, rule or column default that calls code
 * outside pg_catalog on a table the runtime role can reach. Such code runs as whoever writes the
 * row, which for a fixture, a seed or a core write is the login role.
 */
export async function noCodeRunsOnWrite(db: Db): Promise<string[]> {
  const reachable = `c.relnamespace not in ('pg_catalog'::regnamespace,
    'information_schema'::regnamespace) and has_table_privilege('pack_runtime', c.oid,
    'select, insert, update, delete, truncate, references, trigger')`
  const triggers = await db.query<{ name: string }>(
    `select c.oid::regclass::text || ': trigger ' || t.tgname as name from pg_trigger t
     join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and ${reachable}`,
  )
  const rules = await db.query<{ name: string }>(
    `select c.oid::regclass::text || ': rule ' || r.rulename as name from pg_rewrite r
     join pg_class c on c.oid = r.ev_class
     where r.rulename <> '_RETURN' and ${reachable}`,
  )
  const defaults = await db.query<{ name: string }>(
    `select distinct c.oid::regclass::text || '.' || a.attname || ': default calls '
            || p.oid::regprocedure::text as name
     from pg_attrdef d
     join pg_class c on c.oid = d.adrelid
     join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_depend dep on dep.classid = 'pg_attrdef'::regclass and dep.objid = d.oid
       and dep.refclassid = 'pg_proc'::regclass
     join pg_proc p on p.oid = dep.refobjid
     join pg_namespace pn on pn.oid = p.pronamespace
     where pn.nspname <> 'pg_catalog' and ${reachable}`,
  )
  return [...triggers, ...rules, ...defaults].map((r) => `${r.name} runs as the writer`)
}

/**
 * Every table with forced row rules has a policy, and none is plainly `true`: forced row
 * security with an open policy isolates nothing.
 */
export async function everyPolicyRestricts(db: Db): Promise<string[]> {
  const bare = await db.query<{ name: string }>(
    `select c.oid::regclass::text as name from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where c.relrowsecurity and n.nspname not in ('pg_catalog', 'information_schema')
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`,
  )
  const open = await db.query<{ name: string; policy: string }>(
    `select schemaname || '.' || tablename as name, policyname as policy from pg_policies
     where permissive = 'PERMISSIVE'
       and (qual is null or btrim(qual, '() ') = 'true')
       and (with_check is null or btrim(with_check, '() ') = 'true')
       and (qual is not null or with_check is not null)`,
  )
  return [
    ...bare.map((t) => `${t.name} has row-level security and no policy`),
    ...open.map((t) => `${t.name}: policy ${t.policy} lets every row through`),
  ]
}

/** The triggers that guard the registry, and that a pack migration must leave as they are. */
const REGISTRY_TRIGGERS = [
  'principals_agent_of_person',
  'pack_versions_frozen',
  'test_runs_frozen',
  'test_runs_hash',
  'channels_promotion',
]

/**
 * The registry is as the core's migrations left it: every guard trigger there and enabled, and
 * no right in schema `packs` for either pack role. Pack migrations run as pack_migrator, which
 * cannot change the registry; this checks that it stayed so.
 */
export async function registryIsIntact(db: Db): Promise<string[]> {
  const triggers = await db.query<{ name: string; enabled: string }>(
    `select t.tgname as name, t.tgenabled as enabled from pg_trigger t
     join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'packs' and not t.tgisinternal`,
  )
  const out = [
    ...REGISTRY_TRIGGERS.filter((t) => !triggers.some((r) => r.name === t)).map(
      (t) => `the registry's trigger ${t} is gone`,
    ),
    ...triggers
      .filter((t) => t.enabled !== 'O')
      .map((t) => `the registry's trigger ${t.name} is off`),
  ]
  // Neither pack role may reach the registry: the runtime role runs moves, pack_migrator runs
  // a pack's migrations.
  for (const role of ['pack_runtime', 'pack_migrator']) {
    const [r] = await db.query<{ rolsuper: boolean; rolbypassrls: boolean; usable: boolean }>(
      `select rolsuper, rolbypassrls, has_schema_privilege($1, 'packs', 'usage, create') as usable
       from pg_roles where rolname = $1`,
      [role],
    )
    const rights = await db.query<{ name: string }>(
      `select c.oid::regclass::text as name from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'packs' and (
         has_table_privilege($1, c.oid, 'select, insert, update, delete, truncate, references, trigger')
         or (c.relkind = 'S' and has_sequence_privilege($1, c.oid, 'usage, select, update')))`,
      [role],
    )
    if (r?.rolsuper || r?.rolbypassrls) out.push(`${role} can bypass row rules`)
    if (r?.usable) out.push(`${role} can use schema packs`)
    out.push(...rights.map((x) => `${role} has a right on ${x.name}`))
  }
  // A schema named after a role comes first in that role's search path ("$user").
  const shadows = await db.query<{ name: string }>(
    `select n.nspname as name from pg_namespace n join pg_roles r on r.rolname = n.nspname`,
  )
  out.push(...shadows.map((x) => `schema ${x.name} has a role's name`))
  // The registry's functions are the core's: a pack cannot have replaced a guard's body.
  const defs = await registryFunctions(db)
  const core = await coreFunctions()
  for (const [name, def] of core) {
    if (defs.get(name) !== def) out.push(`the registry's function ${name} is not the core's`)
  }
  for (const name of defs.keys()) {
    if (!core.has(name)) out.push(`the registry holds a function the core did not make: ${name}`)
  }
  return out
}

async function registryFunctions(db: Db) {
  const rows = await db.query<{ name: string; def: string }>(
    `select p.oid::regprocedure::text as name, pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'packs'`,
  )
  return new Map(rows.map((r) => [r.name, r.def]))
}

let coreDefs: Promise<Map<string, string>> | null = null

/** The registry's functions on a database that holds the core's migrations and nothing else. */
function coreFunctions() {
  coreDefs ??= (async () => {
    const db = openPglite()
    try {
      await migrateCore(db)
      return await registryFunctions(db)
    } finally {
      await db.close()
    }
  })()
  return coreDefs
}

/** Every rule a move uses has a case that sees it refuse a call. */
export function everyRuleHasARefusalTest(content: PackContent, run: RunResult): string[] {
  const used = new Set(
    Object.values(content.ops).flatMap((o) => [...(o.before ?? []), ...(o.after ?? [])]),
  )
  return [...used]
    .filter((id) => !run.refused.includes(id))
    .map((id) => `rule ${id} has no refusal test`)
}

/** Isolation in the tests: every move has a case where it answers not-found. */
export function everyMoveHasANotFoundTest(content: PackContent, run: RunResult): string[] {
  return Object.keys(content.ops)
    .filter((op) => !run.notFound.includes(op))
    .map((op) => `move ${op} has no not-found test`)
}

/** A version's own tests, then the platform's; the result `core test` records. */
export async function testVersion(content: PackContent, target: Target = pglite) {
  const run = await runPackTests(content, target)
  const { db, dispose } = await target.fresh(content)
  let platform: string[]
  try {
    platform = [
      ...(await runtimeRoleIsLimited(db)),
      ...(await registryIsIntact(db)),
      ...(await everyTableHasRowRules(db)),
      ...(await everyPolicyRestricts(db)),
      ...(await noFunctionRunsAsItsOwner(db)),
      ...(await noFunctionCarriesSettings(db)),
      ...(await noCodeRunsOnWrite(db)),
      ...everyRuleHasARefusalTest(content, run),
      ...everyMoveHasANotFoundTest(content, run),
    ]
  } finally {
    await dispose()
  }
  return { ...run, hash: hashOf(content), platform, passed: run.passed && platform.length === 0 }
}
