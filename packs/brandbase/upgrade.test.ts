import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { openPglite, type Db } from '../../packages/core/src/db'
import { applyPackMigrations, migrateCore } from '../../packages/core/src/migrate'
import { readPack } from '../../packages/core/src/pack'
import { everyTableHasRowRules } from '../../packages/core/src/platform'

/**
 * Migration 0013 on a database that 1.4.0 already holds brands in: the pack's own tests start
 * from an empty database, so they never see its backfill. Brands made on 1.4.0 go to one company,
 * Mission Group; an admin by users.role becomes its owner and a person with a members row its
 * member, so everyone who reached a brand before reaches it after.
 */
const content = readPack(path.dirname(fileURLToPath(import.meta.url)))
const before = content.migrations.filter((m) => m.name < '0013')

/** Rows a statement returns to `user` under the runtime role and the row rules; nothing kept. */
async function as(db: Db, user: string, sql: string) {
  let rows: unknown[] = []
  await db
    .transaction(async (tx) => {
      await tx.query('insert into claims.calls (user_id) values ($1)', [user])
      await tx.exec('set local role pack_runtime')
      rows = await tx.query(sql)
      throw new Error('roll back')
    })
    .catch((err: Error) => {
      if (err.message !== 'roll back') throw err
    })
  return rows
}

const ids = (db: Db, user: string) =>
  as(db, user, 'select id from brandbase.brands order by id').then((r) =>
    (r as { id: string }[]).map((x) => x.id),
  )

describe('migration 0013 on a 1.4.0 database', () => {
  it('keeps every brand for its admin and its member, and nothing for anyone else', async () => {
    const db = openPglite()
    try {
      await migrateCore(db)
      await applyPackMigrations(db, 'brandbase', before)
      await db.exec(`
        insert into brandbase.brands (id, name, handle) values ('one', 'One', '@one'), ('two', 'Two', '@two');
        insert into brandbase.brand_kits (brand_id, voice, colours, logo) values
          ('one', '{"summary": "", "words": [], "examples": []}', '[]', '{"src": null, "name": null}');
        insert into brandbase.users (id, email, role, deactivated_at) values
          ('admin', 'admin@example.com', 'admin', null), ('member', 'member@example.com', 'member', null),
          ('admin-on-one', 'aoo@example.com', 'admin', null), ('nobody', 'nobody@example.com', 'member', null),
          ('gone', 'gone@example.com', 'admin', now());
        insert into brandbase.members (user_id, brand_id) values ('member', 'one'), ('admin-on-one', 'one');
      `)
      expect(await ids(db, 'admin')).toEqual(['one', 'two'])
      expect(await ids(db, 'member')).toEqual(['one'])
      // The migration runs as the tables' owner, as on production: pack_migrator, which is no
      // superuser and cannot bypass row rules, so the forced rules hold it unless 0013 lifts them.
      expect(
        await db.query(
          `select distinct t.tableowner as owner, r.rolsuper as super, r.rolbypassrls as bypass
           from pg_tables t join pg_roles r on r.rolname = t.tableowner where t.schemaname = 'brandbase'`,
        ),
      ).toEqual([{ owner: 'pack_migrator', super: false, bypass: false }])

      await applyPackMigrations(db, 'brandbase', content.migrations)

      expect(await db.query('select id, name from brandbase.organizations')).toEqual([
        { id: 'mission-group', name: 'Mission Group' },
      ])
      expect(
        await db.query('select user_id, org_id, role from brandbase.org_members order by user_id'),
      ).toEqual([
        { user_id: 'admin', org_id: 'mission-group', role: 'owner' },
        { user_id: 'admin-on-one', org_id: 'mission-group', role: 'owner' },
        { user_id: 'gone', org_id: 'mission-group', role: 'owner' },
        { user_id: 'member', org_id: 'mission-group', role: 'member' },
      ])
      expect(await db.query('select id, org_id from brandbase.brands order by id')).toEqual([
        { id: 'one', org_id: 'mission-group' },
        { id: 'two', org_id: 'mission-group' },
      ])
      expect(await ids(db, 'admin')).toEqual(['one', 'two'])
      expect(await ids(db, 'member')).toEqual(['one', 'two'])
      expect(await ids(db, 'nobody')).toEqual([])
      expect(await ids(db, 'gone')).toEqual([])
      expect(await ids(db, 'stranger')).toEqual([])
      // The kit made on 1.4.0 takes its brand's company and stays the brand's for its people.
      expect(await as(db, 'member', 'select brand_id, org_id from brandbase.brand_kits')).toEqual([
        { brand_id: 'one', org_id: 'mission-group' },
      ])
      // The row rules are forced again, and members is gone.
      expect(await everyTableHasRowRules(db)).toEqual([])
      expect(await db.query(`select to_regclass('brandbase.members') as t`)).toEqual([{ t: null }])
    } finally {
      await db.close()
    }
  })

  it('makes no company on a database with no brand', async () => {
    const db = openPglite()
    try {
      await migrateCore(db)
      await applyPackMigrations(db, 'brandbase', before)
      await db.exec(
        `insert into brandbase.users (id, email, role) values ('admin', 'a@example.com', 'admin')`,
      )
      await applyPackMigrations(db, 'brandbase', content.migrations)
      expect(await db.query('select count(*)::int as n from brandbase.organizations')).toEqual([
        { n: 0 },
      ])
      expect(await db.query('select count(*)::int as n from brandbase.org_members')).toEqual([
        { n: 0 },
      ])
    } finally {
      await db.close()
    }
  })
})
