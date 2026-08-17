import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, pool } from './client'
import {
  deletePassportUnitAppAccess,
  deletePassportUnitRelation,
  replacePassportIdentityLink,
  writePassportIdentityLink,
  writePassportMembership,
  writePassportOrganization,
  writePassportUnitAppAccess,
  writePassportUnitRelation,
} from './queries/passport'
import {
  passportIdentityLink,
  passportMembership,
  passportOrganization,
  passportUnitAppAccess,
  passportUnitRelation,
} from './schema/passport'

// Live-DB test — runs only when DATABASE_URL is set.
//
// `queries/passport-version-guard.test.ts` asserts the SQL we GENERATE. This file
// asserts what Postgres DOES with it, which is a different claim and the one the
// receive contract actually rests on:
//
//   - an out-of-order redelivery must not overwrite a newer row;
//   - an EQUAL-version replay must re-apply, because Passport retries on any
//     non-2xx and replays are ordinary traffic;
//   - a `removed` status must survive as a tombstone.
//
// Every one of those failures is silent. A `<` instead of `<=` produces a
// projection that is correct until the first retry and then permanently missing
// whatever arrived twice, with the receiver still answering 200.
//
// Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 3.

const hasDb = !!process.env.DATABASE_URL

const ORG_ID = '00000000-0000-4000-8000-00000000ff01'
const REL_ID = '00000000-0000-4000-8000-00000000ff02'
const LINK_ID = '00000000-0000-4000-8000-00000000ff03'
const ACCESS_ID = '00000000-0000-4000-8000-00000000ff04'
const MEMBER_ID = '00000000-0000-4000-8000-00000000ff05'
const APP_ID = '00000000-0000-4000-8000-00000000ff06'
const UNIT_ID = '00000000-0000-4000-8000-00000000ff07'
const USER_ID = '00000000-0000-4000-8000-00000000ff08'

async function cleanup(): Promise<void> {
  await db.delete(passportOrganization).where(eq(passportOrganization.id, ORG_ID))
  await db.delete(passportUnitRelation).where(eq(passportUnitRelation.id, REL_ID))
  await db.delete(passportIdentityLink).where(eq(passportIdentityLink.id, LINK_ID))
  await db.delete(passportIdentityLink).where(eq(passportIdentityLink.subject, 'subject-1'))
  await db.delete(passportUnitAppAccess).where(eq(passportUnitAppAccess.id, ACCESS_ID))
  await db.delete(passportMembership).where(eq(passportMembership.id, MEMBER_ID))
}

describe.skipIf(!hasDb)('passport projection writes', () => {
  beforeEach(cleanup)

  afterAll(async () => {
    if (!hasDb) return
    await cleanup()
    await pool.end()
  })

  const org = (version: number, name: string) => ({
    id: ORG_ID,
    name,
    slug: 'guard-test',
    status: 'active',
    version,
  })

  const read = async () => {
    const [row] = await db
      .select()
      .from(passportOrganization)
      .where(eq(passportOrganization.id, ORG_ID))
    return row
  }

  describe('the version guard', () => {
    it('applies a newer version', async () => {
      await writePassportOrganization(org(1, 'first'))
      await writePassportOrganization(org(2, 'second'))

      expect(await read()).toMatchObject({ name: 'second', version: 2 })
    })

    // Out-of-order delivery is normal: the contract only promises at-least-once,
    // not in-order. Without the guard, a retried older event overwrites a newer
    // row and the projection is quietly stale until the next change.
    it('IGNORES an older version, without erroring', async () => {
      await writePassportOrganization(org(5, 'current'))
      await writePassportOrganization(org(4, 'stale'))

      expect(await read()).toMatchObject({ name: 'current', version: 5 })
    })

    // THE reason the comparison is `<=` and not `<`. Passport retries on any
    // non-2xx, so the same version arrives twice routinely — after a 500 from a
    // transient database error, for instance. With `<` the redelivery is dropped
    // and whatever the first attempt failed to write is lost for good.
    it('RE-APPLIES an equal version, so a replay is idempotent', async () => {
      await writePassportOrganization(org(7, 'original'))
      // Same version, corrected content — exactly what a redelivery looks like.
      await writePassportOrganization(org(7, 'redelivered'))

      expect(await read()).toMatchObject({ name: 'redelivered', version: 7 })
    })

    it('is idempotent under a byte-identical replay', async () => {
      await writePassportOrganization(org(3, 'same'))
      await writePassportOrganization(org(3, 'same'))

      const rows = await db
        .select()
        .from(passportOrganization)
        .where(eq(passportOrganization.id, ORG_ID))
      // One row, not two — the conflict target is the Passport UUID.
      expect(rows).toHaveLength(1)
    })
  })

  // `membership.removed` carries the final aggregate. Deleting the row instead
  // loses the tombstone, and nightly reconciliation then resurrects the membership
  // from the snapshot — which reads as a revoked user regaining access.
  it('keeps a removed membership as a tombstone', async () => {
    const member = (status: string, version: number) => ({
      id: MEMBER_ID,
      organizationId: ORG_ID,
      platformUserId: USER_ID,
      role: 'Member',
      status,
      version,
      email: 'bob@acme.test',
      displayName: 'Bob',
    })

    await writePassportMembership(member('active', 1))
    await writePassportMembership(member('removed', 2))

    const [row] = await db
      .select()
      .from(passportMembership)
      .where(eq(passportMembership.id, MEMBER_ID))
    expect(row).toMatchObject({ status: 'removed', version: 2 })
  })

  describe('the immutable aggregates', () => {
    it('inserts if absent and ignores a redelivery', async () => {
      const relation = {
        id: REL_ID,
        organizationId: ORG_ID,
        fromUnitId: UNIT_ID,
        toUnitId: ORG_ID,
        relation: 'belongs_to_brand',
      }

      await writePassportUnitRelation(relation)
      // No version to guard on, so idempotency is `ON CONFLICT DO NOTHING`.
      await expect(writePassportUnitRelation(relation)).resolves.toBeUndefined()

      const rows = await db
        .select()
        .from(passportUnitRelation)
        .where(eq(passportUnitRelation.id, REL_ID))
      expect(rows).toHaveLength(1)
    })

    it('deletes if present, and a repeated delete is not an error', async () => {
      await writePassportUnitAppAccess({
        id: ACCESS_ID,
        organizationId: ORG_ID,
        unitId: UNIT_ID,
        appId: APP_ID,
      })
      await deletePassportUnitAppAccess(ACCESS_ID)
      await expect(deletePassportUnitAppAccess(ACCESS_ID)).resolves.toBeUndefined()

      const rows = await db
        .select()
        .from(passportUnitAppAccess)
        .where(eq(passportUnitAppAccess.id, ACCESS_ID))
      expect(rows).toEqual([])
    })

    it('deletes a relation by id', async () => {
      await writePassportUnitRelation({
        id: REL_ID,
        organizationId: ORG_ID,
        fromUnitId: UNIT_ID,
        toUnitId: ORG_ID,
        relation: 'belongs_to_brand',
      })
      await deletePassportUnitRelation(REL_ID)

      const rows = await db
        .select()
        .from(passportUnitRelation)
        .where(eq(passportUnitRelation.id, REL_ID))
      expect(rows).toEqual([])
    })
  })

  // The one row this app writes itself, on every login. Replace rather than
  // update, because `identity_link` rows are immutable per row in Passport's
  // model — and replacing is what self-heals a row written with a wrong
  // `platform_user_id` before that was understood.
  describe('replacing our own identity link', () => {
    const link = (id: string, platformUserId: string) => ({
      id,
      platformUserId,
      appId: APP_ID,
      subject: 'subject-1',
      linkedVia: 'email_match',
    })

    it('leaves exactly one row per (subject, app), with the newest values', async () => {
      await writePassportIdentityLink(link(LINK_ID, USER_ID))
      await replacePassportIdentityLink(link('00000000-0000-4000-8000-00000000ff09', ORG_ID))

      const rows = await db
        .select()
        .from(passportIdentityLink)
        .where(eq(passportIdentityLink.subject, 'subject-1'))

      // A wrong `platform_user_id` is worse than a missing row: it looks linked and
      // resolves to nobody, forever, with nothing erroring. So the replace must
      // leave no trace of the old one.
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ platformUserId: ORG_ID })
    })

    it('is safe to call when no link exists yet', async () => {
      await expect(replacePassportIdentityLink(link(LINK_ID, USER_ID))).resolves.toBeUndefined()

      const rows = await db
        .select()
        .from(passportIdentityLink)
        .where(eq(passportIdentityLink.subject, 'subject-1'))
      expect(rows).toHaveLength(1)
    })
  })
})
