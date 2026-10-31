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

/**
 * Migration 0015 on a 1.6.0 database: a Pinterest connection the pretend sign-in stored has no
 * account behind it, so it goes off; the brand's other connections stay as they were.
 */
describe('migration 0015 on a 1.6.0 database', () => {
  it('turns off a Pinterest connection with no account, and keeps the row rules forced', async () => {
    const db = openPglite()
    try {
      await migrateCore(db)
      await applyPackMigrations(
        db,
        'brandbase',
        content.migrations.filter((m) => m.name < '0015'),
      )
      await db.exec(`
        insert into brandbase.organizations (id, name) values ('co', 'Co');
        insert into brandbase.brands (id, name, handle, org_id) values ('one', 'One', '@one', 'co');
        insert into brandbase.connections (brand_id, key, status) values
          ('one', 'pinterest', 'connected'), ('one', 'lark', 'connected');
      `)
      await applyPackMigrations(db, 'brandbase', content.migrations)
      expect(await db.query('select key, status from brandbase.connections order by key')).toEqual([
        { key: 'lark', status: 'connected' },
        { key: 'pinterest', status: 'off' },
      ])
      expect(await everyTableHasRowRules(db)).toEqual([])
    } finally {
      await db.close()
    }
  })
})

/**
 * Migrations 0019 and 0020 on a 1.10.0 database, in one migrate (1.11.0 is never promoted on its
 * own): the one board a brand picked becomes its list of boards, Pinterest stays connected, a brand
 * with an account but no board stays off, and a pretend Instagram connection goes off.
 */
describe('migrations 0019 and 0020 on a 1.10.0 database', () => {
  it('moves the picked board into the list and keeps each connection as it was', async () => {
    const db = openPglite()
    try {
      await migrateCore(db)
      await applyPackMigrations(
        db,
        'brandbase',
        content.migrations.filter((m) => m.name < '0019'),
      )
      await db.exec(`
        insert into brandbase.organizations (id, name) values ('co', 'Co');
        insert into brandbase.brands (id, name, handle, org_id) values
          ('one', 'One', '@one', 'co'), ('two', 'Two', '@two', 'co');
        insert into brandbase.accounts (brand_id, platform, account_id, username, tokens, details, connected_by) values
          ('one', 'pinterest', 'p1', 'one.pins', 'sealed', '{"board": "b1"}', 'u'),
          ('two', 'pinterest', 'p2', 'two.pins', 'sealed', '{}', 'u');
        insert into brandbase.connections (brand_id, key, status) values
          ('one', 'pinterest', 'connected'), ('two', 'pinterest', 'off'), ('one', 'ig', 'connected');
      `)
      await applyPackMigrations(db, 'brandbase', content.migrations)
      expect(
        await db.query('select brand_id, details from brandbase.accounts order by brand_id'),
      ).toEqual([
        { brand_id: 'one', details: { board: 'b1', boards: ['b1'] } },
        { brand_id: 'two', details: {} },
      ])
      // 0020's wrapper keeps 0019's rule for Pinterest's boards.
      for (const fn of ['account_keys', 'account_connections']) {
        expect(
          await db.query(
            `select a.brand_id, x.linked from brandbase.accounts a,
               brandbase.${fn}(a.platform, a.details) x order by a.brand_id`,
          ),
        ).toEqual([
          { brand_id: 'one', linked: true },
          { brand_id: 'two', linked: false },
        ])
      }
      expect(
        await db.query(
          `select linked from brandbase.account_connections('pinterest', '{"boards": ["b3"]}'::jsonb)`,
        ),
      ).toEqual([{ linked: true }])
      // Between this migration and the promote, 1.10.0's account.board writes only the old key:
      // that board still turns Pinterest on.
      expect(
        await db.query(
          `select linked from brandbase.account_keys('pinterest', '{"board": "b2"}'::jsonb)`,
        ),
      ).toEqual([{ linked: true }])
      expect(
        await db.query(
          'select brand_id, key, status from brandbase.connections order by brand_id, key',
        ),
      ).toEqual([
        { brand_id: 'one', key: 'ig', status: 'off' },
        { brand_id: 'one', key: 'pinterest', status: 'connected' },
        { brand_id: 'two', key: 'pinterest', status: 'off' },
      ])
      expect(await everyTableHasRowRules(db)).toEqual([])
    } finally {
      await db.close()
    }
  })
})

/**
 * Migration 0020 after 0019: an Instagram or Facebook connection the pretend sign-in stored has no
 * account behind it, so it goes off; Mission Group goes on the operator's list for Make, and no
 * other company does.
 */
describe('migration 0020 after 0019', () => {
  it('turns off ig and fb with no account, and lists Mission Group alone for Make', async () => {
    const db = openPglite()
    try {
      await migrateCore(db)
      await applyPackMigrations(
        db,
        'brandbase',
        content.migrations.filter((m) => m.name < '0020'),
      )
      await db.exec(`
        insert into brandbase.organizations (id, name) values
          ('mission-group', 'Mission Group'), ('other', 'Other');
        insert into brandbase.brands (id, name, handle, org_id) values ('one', 'One', '@one', 'mission-group');
        insert into brandbase.connections (brand_id, key, status) values
          ('one', 'ig', 'connected'), ('one', 'fb', 'connected'), ('one', 'lark', 'connected');
      `)
      await applyPackMigrations(db, 'brandbase', content.migrations)
      expect(await db.query('select key, status from brandbase.connections order by key')).toEqual([
        { key: 'fb', status: 'off' },
        { key: 'ig', status: 'off' },
        { key: 'lark', status: 'connected' },
      ])
      expect(await db.query('select org_id from brandbase.make_orgs')).toEqual([
        { org_id: 'mission-group' },
      ])
      expect(await everyTableHasRowRules(db)).toEqual([])
    } finally {
      await db.close()
    }
  })
})

/**
 * Migration 0022 on a 1.12.1 database: the posts already there keep everything and read no story
 * end; a post Brand Base sent is found by its job's id; the readings are walled per company like
 * the posts they belong to.
 */
describe('migration 0022 on a 1.12.1 database', () => {
  it('keeps every post as it was and walls the readings by company', async () => {
    const db = openPglite()
    try {
      await migrateCore(db)
      await applyPackMigrations(
        db,
        'brandbase',
        content.migrations.filter((m) => m.name < '0022'),
      )
      await db.exec(`
        insert into brandbase.organizations (id, name) values ('co', 'Co'), ('other', 'Other');
        insert into brandbase.brands (id, name, handle, org_id) values
          ('one', 'One', '@one', 'co'), ('two', 'Two', '@two', 'other');
        insert into brandbase.users (id, email, role) values
          ('a', 'a@example.com', 'member'), ('b', 'b@example.com', 'member');
        insert into brandbase.org_members (user_id, org_id, role) values ('a', 'co', 'owner'), ('b', 'other', 'owner');
        insert into brandbase.posts (id, brand_id, format, hook, day, time, channels, marked, permalink, metrics, measured_at) values
          ('sent', 'one', 'reel', 'Sent', '2026-10-28', '18:00', '{ig}', null, 'https://www.instagram.com/reel/x/', null, null),
          ('one-ig-DAbc', 'one', 'reel', 'Imported', '2026-10-20', '10:00', '{ig}', 'posted', 'https://www.instagram.com/p/DAbc/', '{"views": 9}', '2026-10-22T00:00:00Z'),
          ('two-post', 'two', 'carousel', 'Theirs', '2026-10-20', '10:00', '{ig}', 'posted', null, null, null);
        insert into brandbase.post_jobs (id, post_id, brand_id, channel, status, run_at, external_id) values
          ('sent:ig', 'sent', 'one', 'ig', 'live', '2026-10-28T10:00:00Z', '17890000000000001');
      `)
      await applyPackMigrations(db, 'brandbase', content.migrations)

      expect(
        await db.query(
          `select id, brandbase.post_json(p) ->> 'expiresAt' as ends, brandbase.post_json(p) -> 'metrics' as metrics,
             brandbase.post_json(p) ->> 'measuredAt' as measured from brandbase.posts p order by id`,
        ),
      ).toEqual([
        {
          id: 'one-ig-DAbc',
          ends: null,
          metrics: { views: 9 },
          measured: '2026-10-22T00:00:00.000Z',
        },
        { id: 'sent', ends: null, metrics: null, measured: null },
        { id: 'two-post', ends: null, metrics: null, measured: null },
      ])
      // The new index serves the sync's look-up of a sent post.
      expect(
        await db.query(
          `select indexdef like '%(brand_id, channel, external_id)%' as fits from pg_indexes
           where schemaname = 'brandbase' and indexname = 'post_jobs_external'`,
        ),
      ).toEqual([{ fits: true }])

      await db.exec(`
        insert into brandbase.post_readings (brand_id, channel, external_id, read_at, post_id, metrics) values
          ('one', 'ig', '17890000000000001', '2026-10-29T05:00:00Z', 'sent', '{"reach": 10}'),
          ('two', 'ig', '17890000000000009', '2026-10-29T05:00:00Z', 'two-post', '{"likes": 1}');
      `)
      const readings = 'select post_id from brandbase.post_readings order by post_id'
      expect(await as(db, 'a', readings)).toEqual([{ post_id: 'sent' }])
      expect(await as(db, 'b', readings)).toEqual([{ post_id: 'two-post' }])
      expect(await as(db, 'stranger', readings)).toEqual([])
      // A post deleted takes its readings with it.
      await db.exec(`delete from brandbase.posts where id = 'sent'`)
      expect(await db.query(readings)).toEqual([{ post_id: 'two-post' }])
      expect(await everyTableHasRowRules(db)).toEqual([])
    } finally {
      await db.close()
    }
  })
})

describe('migration 0023 on a 1.13.0 database', () => {
  it("keeps each reading, gives a post each channel's latest counts, and no link it never read", async () => {
    const db = openPglite()
    try {
      await migrateCore(db)
      await applyPackMigrations(
        db,
        'brandbase',
        content.migrations.filter((m) => m.name < '0023'),
      )
      await db.exec(`
        insert into brandbase.organizations (id, name) values ('co', 'Co'), ('other', 'Other');
        insert into brandbase.brands (id, name, handle, org_id) values
          ('one', 'One', '@one', 'co'), ('two', 'Two', '@two', 'other');
        insert into brandbase.users (id, email, role) values ('a', 'a@example.com', 'member');
        insert into brandbase.org_members (user_id, org_id, role) values ('a', 'co', 'owner');
        insert into brandbase.posts (id, brand_id, format, hook, day, time, channels, marked, permalink, metrics, measured_at) values
          ('sent', 'one', 'carousel', 'Sent', '2026-10-28', '18:00', '{ig,fb}', null, 'https://www.instagram.com/p/x/', '{"likes": 9}', '2026-10-29T05:00:00Z'),
          ('quiet', 'one', 'carousel', 'Quiet', '2026-10-27', '18:00', '{ig}', 'posted', null, null, null),
          ('theirs', 'two', 'carousel', 'Theirs', '2026-10-27', '18:00', '{ig}', 'posted', null, null, null);
        insert into brandbase.post_readings (brand_id, channel, external_id, read_at, post_id, metrics) values
          ('one', 'ig', '1', '2026-10-28T05:00:00Z', 'sent', '{"likes": 4}'),
          ('one', 'ig', '1', '2026-10-29T05:00:00Z', 'sent', '{"likes": 9}'),
          ('one', 'fb', '1_2', '2026-10-29T05:00:00Z', 'sent', '{"likes": 2}'),
          ('two', 'ig', '3', '2026-10-29T05:00:00Z', 'theirs', '{"likes": 1}');
      `)
      await applyPackMigrations(db, 'brandbase', content.migrations)

      const readings = `select id, brandbase.post_json(p) -> 'readings' as readings from brandbase.posts p order by id`
      // Readings from before have no address: the post's own still covers its first account.
      expect(await db.query(readings)).toEqual([
        { id: 'quiet', readings: {} },
        {
          id: 'sent',
          readings: {
            fb: { metrics: { likes: 2 }, readAt: '2026-10-29T05:00:00.000Z' },
            ig: { metrics: { likes: 9 }, readAt: '2026-10-29T05:00:00.000Z' },
          },
        },
        {
          id: 'theirs',
          readings: { ig: { metrics: { likes: 1 }, readAt: '2026-10-29T05:00:00.000Z' } },
        },
      ])
      // Under the row rules a person sees only their own company's readings in a post's JSON.
      expect(await as(db, 'a', readings)).toEqual([
        { id: 'quiet', readings: {} },
        {
          id: 'sent',
          readings: {
            fb: { metrics: { likes: 2 }, readAt: '2026-10-29T05:00:00.000Z' },
            ig: { metrics: { likes: 9 }, readAt: '2026-10-29T05:00:00.000Z' },
          },
        },
      ])
      expect(await db.query('select count(*)::int as n from brandbase.post_readings')).toEqual([
        { n: 4 },
      ])
      expect(await everyTableHasRowRules(db)).toEqual([])
    } finally {
      await db.close()
    }
  })
})

/**
 * Migration 0024 on a 1.13.1 database: the imported brands that are there start with the venues
 * they are known to have, every other brand with none, and no brand is made for a seed whose
 * brand is absent. The file runs again with nothing changed, and a member of another company sees
 * none of a brand's locations.
 */
describe('migration 0024 on a 1.13.1 database', () => {
  it('seeds only the brands that exist, once, under the row rules', async () => {
    const db = openPglite()
    try {
      await migrateCore(db)
      await applyPackMigrations(
        db,
        'brandbase',
        content.migrations.filter((m) => m.name < '0024'),
      )
      await db.exec(`
        insert into brandbase.organizations (id, name) values ('co', 'Co'), ('other', 'Other');
        insert into brandbase.brands (id, name, handle, org_id) values
          ('casa-vostra', 'Casa Vostra', '@casavostrasg', 'co'), ('temper', 'Temper', '@temper.sg', 'co'),
          ('carlitos', 'Carlitos', '@carlitos', 'other');
        insert into brandbase.users (id, email, role) values
          ('a', 'a@example.com', 'member'), ('b', 'b@example.com', 'member');
        insert into brandbase.org_members (user_id, org_id, role) values ('a', 'co', 'member'), ('b', 'other', 'owner');
      `)
      await applyPackMigrations(db, 'brandbase', content.migrations)

      const all = 'select id, locations from brandbase.brands order by id'
      const seeded = [
        { id: 'carlitos', locations: [] },
        {
          id: 'casa-vostra',
          locations: [
            'Casa Vostra, Raffles City',
            'Casa Vostra, JEM',
            'Casa Vostra, Tampines Mall',
          ],
        },
        { id: 'temper', locations: ['Temper, Duxton'] },
      ]
      expect(await db.query(all)).toEqual(seeded)
      expect(await everyTableHasRowRules(db)).toEqual([])

      // Again, after the team changed temper's list: nothing is added twice or put back.
      await db.exec(
        `update brandbase.brands set locations = '{"Temper, Neil Road"}' where id = 'temper'`,
      )
      await db.exec(content.migrations.find((m) => m.name.startsWith('0024'))!.sql)
      expect(await db.query(all)).toEqual([
        seeded[0],
        seeded[1],
        { id: 'temper', locations: ['Temper, Neil Road'] },
      ])
      expect(await everyTableHasRowRules(db)).toEqual([])

      expect(await as(db, 'b', 'select id, locations from brandbase.brands')).toEqual([
        { id: 'carlitos', locations: [] },
      ])
    } finally {
      await db.close()
    }
  })
})
