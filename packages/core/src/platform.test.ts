import { afterEach, describe, expect, it } from 'vitest'
import { type Db } from './db'
import {
  everyPolicyRestricts,
  everyTableHasRowRules,
  noCodeRunsOnWrite,
  noFunctionCarriesSettings,
  noFunctionRunsAsItsOwner,
  noImmutableFunctionReadsTheCaller,
  registryIsIntact,
  runtimeRoleIsLimited,
  testVersion,
} from './platform'
import { applyPackMigrations } from './migrate'
import { packProblems } from './pack'
import { pglite } from './runner'
import { freshDb } from './testing'
import { toyPack } from './toy-pack'

const open: Db[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()))
})

const fresh = async (pack = toyPack()) => {
  const { db } = await pglite.fresh(pack)
  open.push(db)
  return db
}

const tested = toyPack('1.0.0', {
  tests: [
    {
      name: 'notes',
      now: '2026-10-06T04:00:00Z',
      as: 'ana',
      cases: [
        {
          name: 'keeps a note, refuses shouting, and hides another person’s note',
          steps: [
            { call: 'note.add', input: { id: 'n1', body: 'basil' } },
            { call: 'note.add', input: { id: 'n2', body: 'BASIL' }, expect: { code: 'SHOUTING' } },
            { call: 'note.list', as: 'ben', input: { nope: 1 }, expect: { code: 'VALIDATION' } },
            { call: 'note.drop', as: 'ben', input: { id: 'n1' }, expect: { code: 'NOT_FOUND' } },
            { call: 'note.give', input: { id: 'n3', to: 'ben' }, expect: { code: 'NOT_FOUND' } },
          ],
        },
      ],
    },
  ],
})

describe('the platform tests', () => {
  it('pass the row rules and the refusal cases, and name each move with no not-found case', async () => {
    // The toy pack's case covers neither isolation for adding, listing or sharing notes, nor a
    // share waiting for a person's yes: the platform names each.
    const run = await testVersion(tested)
    expect(run.results.every((r) => r.ok)).toBe(true)
    expect(run.platform).toEqual([
      'move note.list has no not-found test',
      'move note.add has no not-found test',
      'move note.share has no not-found test',
      "effect note.share has no case that sees it wait for a person's yes",
    ])
  })

  it('fail a version whose rule no case sees refuse a call', async () => {
    const run = await testVersion(toyPack('1.0.1'))
    expect(run.passed).toBe(false)
    expect(run.platform).toContain('rule note.quiet has no refusal test')
  })

  it('fail a table the runtime role can reach without forced row rules', async () => {
    const loose = toyPack('1.0.2', {
      migrations: [
        ...toyPack().migrations,
        {
          name: '0002_loose.sql',
          sql: `create table toy.loose (id text primary key);
                grant select on toy.loose to pack_runtime;`,
        },
      ],
    })
    expect(await everyTableHasRowRules(await fresh(loose))).toEqual([
      'toy.loose: row-level security is not enabled',
    ])
  })

  it('find the runtime role unable to bypass row rules', async () => {
    expect(await runtimeRoleIsLimited(await fresh())).toEqual([])
  })

  // A database with the core and the toy pack's migrations and one more, as pack_migrator.
  const migrated = async (sql: string) => {
    const db = await freshDb()
    open.push(db)
    // As pack_migrator, but past the publish check: what the role alone allows.
    await applyPackMigrations(db, 'toy', toyPack().migrations)
    await db.transaction(async (tx) => {
      await tx.exec('set local role pack_migrator')
      await tx.exec(sql)
    })
    return db
  }

  it.each([
    [
      'switch off a guard of the registry',
      'alter table packs.channels disable trigger channels_promotion',
    ],
    [
      'rewrite a guard of the registry',
      `create or replace function packs.check_promotion() returns trigger language plpgsql
       as $f$ begin return new; end $f$`,
    ],
    ['write the registry', "insert into packs.principals (id) values ('forged')"],
    [
      'give the runtime role a right in the registry',
      'grant select on packs.test_runs to pack_runtime',
    ],
  ])('run a pack migration as a role that cannot %s', async (_what, sql) => {
    await expect(migrated(sql)).rejects.toThrow(/permission denied|must be owner/)
  })

  it.each([
    [
      'a function that runs as its owner',
      'create function toy.f() returns int language sql security definer as $$ select 1 $$',
    ],
    [
      'a role change hidden in a function body',
      "create function toy.f() returns void language plpgsql as $f$ begin execute 'reset role'; end $f$",
    ],
    ['RESET ROLE', 'reset role'],
    [
      'a function that switches the session user',
      "create function toy.f() returns int language sql set session_authorization = 'postgres' as 'select 1'",
    ],
    // The reviewer's escapes: end the transaction that holds the role, or hide a word.
    ['a COMMIT', 'commit; alter table toy.notes add column x int'],
    ['an END', 'end; alter table toy.notes add column x int'],
    ['a SET', 'set search_path = toy'],
    ['SET ROLE split by a line comment', 'select 1;\nset --x\nrole postgres'],
    ['SET ROLE with a quoted word', 'select 1; set "role" = postgres'],
    ['a block comment', 'select /**/ 1'],
    ['RESET ROLE in a DO block', 'do $$ begin reset role; end $$'],
    [
      'a BEGIN ATOMIC body, which the splitter cannot keep whole',
      'create function toy.g() returns int language sql begin atomic select 1; end',
    ],
    ['the core’s schema', 'alter table packs.channels disable trigger channels_promotion'],
    ['a core role', 'grant pack_admin to pack_runtime'],
    [
      'a view over the prepared statements',
      'create view toy.seen as select statement from pg_prepared_statements',
    ],
    [
      'a function body over the prepared statements',
      "create function toy.seen() returns setof text language sql as 'select statement from pg_catalog.pg_prepared_statement()'",
    ],
  ])('refuse at publish a migration with %s', (_what, sql) => {
    const pack = toyPack('1.0.6', {
      migrations: [...toyPack().migrations, { name: '0002_more.sql', sql }],
    })
    expect(packProblems(pack).some((p) => p.startsWith('migration 0002_more.sql'))).toBe(true)
  })

  it('refuse at publish an upload move that is a read, a guest’s, or has no type field', () => {
    const add = toyPack().ops['note.add']!
    const list = toyPack().ops['note.list']!
    const problems = (op: object) =>
      packProblems(toyPack('1.0.7', { ops: { ...toyPack().ops, 'note.add': { ...add, ...op } } }))
    expect(problems({ upload: { type: 'body' } }).filter((p) => p.includes('upload'))).toEqual([])
    expect(problems({ upload: { type: 'kind' } })).toContain(
      "op note.add: an upload move's type is a required string input",
    )
    expect(problems({ upload: { type: 'body' }, guest: { capability: 'body' } })).toContain(
      'op note.add: an upload move is a write for a signed-in caller',
    )
    const read = packProblems(
      toyPack('1.0.7', {
        ops: { ...toyPack().ops, 'note.list': { ...list, upload: { type: 'x' } } },
      }),
    )
    expect(read).toContain('op note.list: an upload move is a write for a signed-in caller')
  })

  it('fail a function the runtime role can call that runs with its owner’s rights', async () => {
    const db = await migrated(
      `create function toy.leak() returns setof toy.notes language sql security definer
       as 'select * from toy.notes'`,
    )
    expect(await noFunctionRunsAsItsOwner(db)).toEqual([
      "toy.leak() runs with its owner's rights and pack_runtime can call it",
    ])
  })

  it('fail a policy that plainly lets every row through', async () => {
    // A lint, not a wall: `using (1 = 1)` reads as restricting and passes.
    const db = await migrated(
      `drop policy own on toy.notes;
       create policy anyone on toy.notes using (true) with check (true);`,
    )
    expect(await everyPolicyRestricts(db)).toEqual([
      'toy.notes: policy anyone lets every row through',
    ])
  })

  it('fail a registry whose guard is off, however it got that way', async () => {
    const db = await fresh()
    await db.exec(`alter table packs.channels disable trigger channels_promotion;
                   grant select on packs.test_runs to pack_runtime;`)
    expect(await registryIsIntact(db)).toEqual([
      "the registry's trigger channels_promotion is off",
      'pack_runtime has a right on packs.test_runs',
    ])
  })

  it('fail a function that carries a setting, which applies while it runs', async () => {
    const db = await migrated(
      `create function toy.leak() returns setof toy.notes language sql
       set session_authorization = 'postgres' as 'select * from toy.notes';
       create function toy.path() returns int language sql set search_path = toy as 'select 1';`,
    )
    expect(await noFunctionCarriesSettings(db)).toEqual([
      'toy.leak() sets session_authorization=postgres while it runs',
      'toy.path() sets search_path=toy while it runs',
    ])
  })

  const mayReadCaller = (fn: string) =>
    `${fn} is immutable but may read the caller (a string body, a table or a call that is not immutable)`

  it.each([
    [
      'naming the claims',
      'create function toy.me() returns text language sql immutable return claims.user_id();',
    ],
    [
      'reading a setting in a string body',
      "create function toy.me() returns text language sql immutable as 'select current_setting(''app.who'', true)';",
    ],
    [
      'a string body calling a stable pack function',
      `create function toy.mine() returns text language sql stable as 'select claims.user_id()';
       create function toy.me() returns text language sql immutable as 'select toy.mine()';`,
    ],
    [
      'a plpgsql body calling a stable pack function',
      `create function toy.mine() returns text language sql stable return claims.user_id();
       create function toy.me() returns text language plpgsql immutable
         as $$ begin return toy.mine(); end $$;`,
    ],
    [
      'a line comment splitting the claims name',
      `create function toy.me() returns text language sql immutable as 'select claims --x
         .user_id()';`,
    ],
    [
      'a RETURN body reading a table whose row rule reads the claims',
      `create table toy.members (user_id text primary key, owner_as text not null);
       alter table toy.members enable row level security;
       alter table toy.members force row level security;
       create policy mine on toy.members using (user_id = claims.user_id());
       grant select on toy.members to pack_runtime;
       create function toy.me() returns text language sql immutable
         return (select owner_as from toy.members);`,
    ],
    [
      'an operator whose function is stable',
      `create function toy.pick(a text, b text) returns text language sql stable
         return coalesce(claims.user_id(), a || b);
       create operator toy.@@ (function = toy.pick, leftarg = text, rightarg = text);
       create function toy.me() returns text language sql immutable return 'x' operator(toy.@@) 'y';`,
    ],
    [
      'a string body under a stable plpgsql function, whose own kept plan would freeze it',
      `create function toy.mine() returns text language sql stable as 'select claims.user_id()';
       create function toy.me() returns text language sql immutable as 'select toy.mine()';
       create function toy.owner_now() returns text language plpgsql stable
         as $$ begin return toy.me(); end $$;`,
    ],
  ])('fail an immutable function that may read the caller: %s', async (_what, sql) => {
    const db = await migrated(
      `${sql}\n grant execute on all functions in schema toy to pack_runtime;`,
    )
    expect(await noImmutableFunctionReadsTheCaller(db)).toEqual([mayReadCaller('toy.me()')])
  })

  it('pass immutable functions with RETURN bodies that call only immutable ones', async () => {
    const db = await migrated(
      `create function toy.upper_of(t text) returns text language sql immutable return upper(t);
       create function toy.twice(t text) returns text language sql immutable
         return toy.upper_of(t) || toy.upper_of(t);
       create function toy.mine() returns text language sql stable return claims.user_id();
       grant execute on all functions in schema toy to pack_runtime;`,
    )
    expect(await noImmutableFunctionReadsTheCaller(db)).toEqual([])
  })

  it('fail the version of a pack whose row rule reads the caller through an immutable function', async () => {
    const frozen = toyPack('1.0.3', {
      migrations: [
        ...toyPack().migrations,
        {
          name: '0002_me.sql',
          sql: `create function toy.me() returns text language sql immutable return claims.user_id();
                drop policy own on toy.notes;
                create policy own on toy.notes using (owner = toy.me()) with check (owner = toy.me());`,
        },
      ],
    })
    const run = await testVersion(frozen)
    expect(run.passed).toBe(false)
    expect(run.platform).toContain(mayReadCaller('toy.me()'))
  })

  it('fail a trigger, a rule or a default that runs pack code on a write', async () => {
    const db = await migrated(
      `create function toy.stamp() returns trigger language plpgsql
         as 'begin return new; end';
       create trigger stamp before insert on toy.notes for each row execute function toy.stamp();
       create rule quiet as on delete to toy.notes do instead nothing;
       create function toy.next() returns text language sql as 'select ''x''';
       alter table toy.notes alter column body set default toy.next();`,
    )
    expect(await noCodeRunsOnWrite(db)).toEqual([
      'toy.notes: trigger stamp runs as the writer',
      'toy.notes: rule quiet runs as the writer',
      'toy.notes.body: default calls toy.next() runs as the writer',
    ])
  })

  it('fail a guard whose body was replaced, and a schema that shadows a role', async () => {
    const db = await fresh()
    await db.exec(`create or replace function packs.check_promotion() returns trigger
                     language plpgsql as $f$ begin return new; end $f$;
                   create schema pack_runtime;`)
    expect(await registryIsIntact(db)).toEqual([
      "schema pack_runtime has a role's name",
      "the registry's function packs.check_promotion() is not the core's",
    ])
  })

  it('find the toy pack and its registry as the core left them', async () => {
    const db = await fresh()
    expect([
      ...(await registryIsIntact(db)),
      ...(await everyPolicyRestricts(db)),
      ...(await noFunctionRunsAsItsOwner(db)),
      ...(await noFunctionCarriesSettings(db)),
      ...(await noCodeRunsOnWrite(db)),
    ]).toEqual([])
  })
})
