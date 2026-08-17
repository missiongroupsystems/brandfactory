import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { buildVersionGuard } from './passport'
import {
  passportEntitlement,
  passportMembership,
  passportOrganization,
  passportUnit,
  passportUnitAppMembership,
} from '../schema/passport'

// The version guard, rendered to SQL and asserted. No database — `PgDialect` can
// render a fragment on its own, which is what makes this checkable at all.
//
// **These few lines are the most dangerous code in the integration**, and both of
// their failure modes are silent:
//
//   - `<` instead of `<=` drops every equal-version replay. Passport retries on any
//     non-2xx, so replays are ordinary traffic; the projection then quietly misses
//     whatever arrived twice.
//   - a column missing from `set` stops updating while every other field stays
//     fresh — a row that is correct everywhere except the one place you are
//     looking.
//
// Neither shows up in a round-trip test that applies one event and reads it back.
//
// Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 3.

const dialect = new PgDialect()
const render = (fragment: Parameters<typeof dialect.sqlToQuery>[0]) => dialect.sqlToQuery(fragment)

const MUTABLE = [
  ['organization', passportOrganization] as const,
  ['unit', passportUnit] as const,
  ['membership', passportMembership] as const,
  ['entitlement', passportEntitlement] as const,
  ['unit_app_membership', passportUnitAppMembership] as const,
]

describe('passport version guard', () => {
  describe.each(MUTABLE)('%s', (_name, table) => {
    it('compares with <=, so an equal-version replay re-applies', () => {
      const { setWhere } = buildVersionGuard(table, table.version)
      const { sql: rendered } = render(setWhere)

      expect(rendered).toContain('<=')
      // Guard the guard: `<` would also satisfy a naive `toContain('<')`.
      expect(rendered).not.toMatch(/<(?!=)/)
      expect(rendered).toContain('excluded.version')
    })

    it('sets every column from `excluded`, and never the primary key', () => {
      const { set } = buildVersionGuard(table, table.version)

      // `id` is the conflict target. Assigning it would be a no-op at best and is
      // excluded deliberately.
      expect(Object.keys(set)).not.toContain('id')

      for (const [key, fragment] of Object.entries(set)) {
        const { sql: rendered, params } = render(fragment)
        expect(rendered, `${key} must read from excluded`).toMatch(/^excluded\."[a-z_]+"$/)
        // A parameter here would mean a literal value was captured instead of a
        // reference to the incoming row.
        expect(params, `${key} must bind no parameter`).toEqual([])
      }
    })
  })

  // The reason `set` is derived rather than hand-listed: this is the table where a
  // forgotten column is most likely and least visible.
  it('covers all 13 updatable columns of `passport.unit`', () => {
    const { set } = buildVersionGuard(passportUnit, passportUnit.version)
    expect(Object.keys(set).sort()).toEqual(
      [
        'address',
        'contactPhone',
        'externalRef',
        'gstRegNo',
        'kind',
        'name',
        'organizationId',
        'postal',
        'registeredAddress',
        'status',
        'type',
        'uen',
        'version',
      ].sort(),
    )
  })

  // The physical column name, not the model key — `excluded."gst_reg_no"`, not
  // `excluded."gstRegNo"`. Getting this wrong is a runtime error rather than a
  // silent one, but only on the first delivery carrying that column.
  it('references physical column names, not model keys', () => {
    const { set } = buildVersionGuard(passportUnit, passportUnit.version)
    expect(render(set.gstRegNo!).sql).toBe('excluded."gst_reg_no"')
    expect(render(set.organizationId!).sql).toBe('excluded."organization_id"')
  })
})
