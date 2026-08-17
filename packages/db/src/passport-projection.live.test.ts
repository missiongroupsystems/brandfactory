import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db, pool } from './client'

// Live-DB test — runs only when DATABASE_URL is set, matching the convention in
// `seed.test.ts` and `queries.live.test.ts`.
//
// **This file exists because "the migration is written" and "the migration is
// applied" are different claims**, and the second one is the one the receiver
// depends on. A consumer whose database is behind its code has a receiver that
// answers 500 to every delivery while every other check reports success — the
// projection tables simply are not there. Nothing in a unit test can see that.
//
// Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 2.

const hasDb = !!process.env.DATABASE_URL

const EXPECTED_TABLES = [
  'entitlement',
  'identity_link',
  'membership',
  'organization',
  'unit',
  'unit_app_access',
  'unit_app_membership',
  'unit_relation',
]

describe.skipIf(!hasDb)('passport projection, in the database', () => {
  afterAll(async () => {
    if (hasDb) await pool.end()
  })

  it('has all eight tables in the `passport` schema', async () => {
    const rows = await db.execute(sql`
      select table_name
        from information_schema.tables
       where table_schema = 'passport'
       order by table_name
    `)
    expect(rows.rows.map((r) => r.table_name)).toEqual(EXPECTED_TABLES)
  })

  // The structural property the whole receive contract rests on. Asserted against
  // the DATABASE rather than the schema definition, because a constraint could
  // also arrive from a hand-edited migration or a manual `ALTER`.
  it('has no foreign key and no constraint beyond the primary key', async () => {
    const rows = await db.execute(sql`
      select t.relname as table_name, c.conname, c.contype
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'passport'
         and c.contype <> 'p'
    `)
    // A foreign key here would reject an out-of-order delivery, the receiver would
    // answer 500, and Passport's worker would retry it forever.
    expect(rows.rows).toEqual([])
  })

  it('keys every table on a Passport UUID, with no local default', async () => {
    const rows = await db.execute(sql`
      select table_name, data_type, column_default
        from information_schema.columns
       where table_schema = 'passport' and column_name = 'id'
       order by table_name
    `)
    expect(rows.rows).toHaveLength(8)
    for (const row of rows.rows) {
      expect(row.data_type, `${row.table_name}.id`).toBe('uuid')
      // `defaultRandom()` here would mint a local id and silently diverge from
      // Passport's — rule 5 says adopt theirs verbatim.
      expect(row.column_default, `${row.table_name}.id must not default`).toBeNull()
    }
  })

  it('indexes the columns the request path resolves identity by', async () => {
    const rows = await db.execute(sql`
      select indexname from pg_indexes where schemaname = 'passport'
    `)
    const names = rows.rows.map((r) => String(r.indexname))
    // Identity linking matches a verified email; derivation keys on the platform
    // user; the session's subject resolves through the link.
    expect(names).toContain('passport_membership_email_idx')
    expect(names).toContain('passport_membership_platform_user_idx')
    expect(names).toContain('passport_identity_link_subject_idx')
  })
})
