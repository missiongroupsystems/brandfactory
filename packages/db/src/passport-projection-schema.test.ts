import { getTableName, getTableColumns, is } from 'drizzle-orm'
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import {
  PASSPORT_IMMUTABLE_TABLES,
  PASSPORT_MUTABLE_TABLES,
  PASSPORT_PROJECTION_TABLES,
} from './schema/passport'

// Definition-level assertions on the Passport read model. No database: these
// guard the SHAPE of the schema, which is where the contract lives, and they
// would otherwise be checked by nothing — `tsc` is satisfied by any table.
//
// Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 2.
//
// **This file lives in `src/`, not in `src/schema/passport/`, and that is not
// tidiness.** `drizzle.config.ts` globs `./src/schema/**/*.ts`, and drizzle-kit loads
// every match with `require()` — so a test file under that tree makes `db:generate`
// die with "Vitest cannot be imported in a CommonJS module using require()". The
// schema directory holds schema and nothing else.

const EXPECTED_TABLES = [
  'organization',
  'unit',
  'membership',
  'entitlement',
  'unit_app_membership',
  'unit_relation',
  'identity_link',
  'unit_app_access',
] as const

describe('passport projection', () => {
  // Rule 2: all eight, not a subset. The four `unit_app_*` / relation tables are
  // the ones most easily skipped, and omitting `unit_app_access` or
  // `unit_app_membership` means no app switches or no roles ever land — so access
  // derivation returns an empty map forever, with nothing erroring.
  it('projects all eight aggregates and no others', () => {
    expect(PASSPORT_PROJECTION_TABLES).toHaveLength(8)
    expect(PASSPORT_PROJECTION_TABLES.map(getTableName).sort()).toEqual([...EXPECTED_TABLES].sort())
  })

  it('puts every table in the `passport` schema, not a `passport_` prefix', () => {
    for (const table of PASSPORT_PROJECTION_TABLES) {
      const config = getTableConfig(table)
      expect(config.schema, `${config.name} is not in the passport schema`).toBe('passport')
      // A prefix would defeat the point: the schema is what makes foreign data
      // obvious in every query and what a future REVOKE attaches to.
      expect(config.name).not.toMatch(/^passport_/)
    }
  })

  // The version guard only exists where there is a version. Getting this split
  // wrong means either applying a `>=` comparison against a column that is not
  // there, or silently overwriting an immutable row on redelivery.
  it('carries `version` on exactly the five mutable aggregates', () => {
    expect(PASSPORT_MUTABLE_TABLES).toHaveLength(5)
    for (const table of PASSPORT_MUTABLE_TABLES) {
      expect(getTableColumns(table), `${getTableName(table)} must carry version`).toHaveProperty(
        'version',
      )
    }
  })

  it('has no `version` on any of the three immutable aggregates', () => {
    expect(PASSPORT_IMMUTABLE_TABLES).toHaveLength(3)
    for (const table of PASSPORT_IMMUTABLE_TABLES) {
      expect(
        getTableColumns(table),
        `${getTableName(table)} is immutable and must not carry version`,
      ).not.toHaveProperty('version')
    }
  })

  // Rule 5. A serial primary key, or a `passport_*_id` side column beside a local
  // id, is a shadow table with extra steps.
  it('adopts the Passport UUID as the primary key, verbatim', () => {
    for (const table of PASSPORT_PROJECTION_TABLES) {
      const columns = getTableColumns(table)
      const id = columns.id
      expect(id, `${getTableName(table)} has no id column`).toBeDefined()
      expect(id.dataType).toBe('string')
      expect(id.columnType).toBe('PgUUID')
      expect(id.primary, `${getTableName(table)}.id must be the primary key`).toBe(true)
      expect(id.hasDefault, `${getTableName(table)}.id must not generate its own id`).toBe(false)
    }
  })

  // The single most important structural property, and the one most likely to be
  // "fixed" by a well-meaning reviewer. Sync events are replay- and
  // out-of-order-safe by contract: a `unit.upserted` may arrive before the
  // `org.upserted` that would satisfy an FK. A constraint would reject the event,
  // the receiver would answer 500, and Passport's worker would retry it forever.
  it('declares no foreign keys, and no constraint beyond the primary key', () => {
    for (const table of PASSPORT_PROJECTION_TABLES) {
      const config = getTableConfig(table)
      expect(config.foreignKeys, `${config.name} must declare no foreign key`).toHaveLength(0)
      expect(config.uniqueConstraints, `${config.name} must declare no unique`).toHaveLength(0)
      expect(config.checks, `${config.name} must declare no check`).toHaveLength(0)
    }
  })

  // Named individually rather than counted, because the read path depends on each
  // one and a missing index is a slow query nobody notices until the projection
  // is large.
  it('indexes what the request path actually looks up', () => {
    const indexed = (table: PgTable) =>
      getTableConfig(table).indexes.map((i) =>
        (i.config.columns ?? []).map((c) => ('name' in c ? String(c.name) : String(c))).join(','),
      )

    const membership = PASSPORT_MUTABLE_TABLES[2]
    // Identity resolution is by verified email; access derivation is by platform
    // user; every query is org-scoped (rule 9).
    expect(indexed(membership)).toEqual(
      expect.arrayContaining(['email', 'platform_user_id', 'organization_id']),
    )

    const identityLink = PASSPORT_IMMUTABLE_TABLES[1]
    // The request-path lookup: a session's subject -> a platform user.
    expect(indexed(identityLink)).toEqual(
      expect.arrayContaining(['subject,platform_user_id', 'platform_user_id']),
    )
  })

  it('exposes every table as a real Drizzle pg table', () => {
    // Guards against a future refactor turning one of these into a view helper or
    // a plain object, which would typecheck and then fail at query time.
    for (const table of PASSPORT_PROJECTION_TABLES) {
      expect(is(table, PgTable)).toBe(true)
    }
  })
})
