import { DISPATCH, type SyncHandlers } from '@missiongroupsystems/passport-client'
import { describe, expect, it } from 'vitest'
import { createPassportSyncHandlers, type PassportProjectionWriter } from './handlers'

// Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 3.

/** Records every call, so the wire→row mapping can be asserted with no database. */
function recordingWriter(): {
  writer: PassportProjectionWriter
  calls: Array<{ method: string; arg: unknown }>
} {
  const calls: Array<{ method: string; arg: unknown }> = []
  const record =
    (method: string) =>
    async (arg: unknown): Promise<void> => {
      calls.push({ method, arg })
    }
  return {
    calls,
    writer: {
      writeOrganization: record('writeOrganization'),
      writeUnit: record('writeUnit'),
      writeMembership: record('writeMembership'),
      writeEntitlement: record('writeEntitlement'),
      writeUnitAppMembership: record('writeUnitAppMembership'),
      writeUnitRelation: record('writeUnitRelation'),
      deleteUnitRelation: record('deleteUnitRelation'),
      writeIdentityLink: record('writeIdentityLink'),
      deleteIdentityLink: record('deleteIdentityLink'),
      writeUnitAppAccess: record('writeUnitAppAccess'),
      deleteUnitAppAccess: record('deleteUnitAppAccess'),
    } as PassportProjectionWriter,
  }
}

const ORG = { id: 'o1', name: 'Ebb & Flow', slug: 'ebb-flow', status: 'active', version: 3 }

const UNIT = {
  id: 'u1',
  organization_id: 'o1',
  type: 'brand',
  name: 'Casa Vostra Pte. Ltd.',
  external_ref: 'brandfactory:7',
  status: 'active',
  version: 2,
  uen: null,
  gst_reg_no: null,
  registered_address: null,
  address: null,
  postal: null,
  contact_phone: null,
  kind: null,
}

const MEMBERSHIP = {
  id: 'm1',
  organization_id: 'o1',
  platform_user_id: 'p1',
  role: 'Owner',
  status: 'active',
  version: 5,
  email: 'Bob@Acme.test',
  display_name: 'Bob',
}

const UAM = {
  id: 'r1',
  organization_id: 'o1',
  platform_user_id: 'p1',
  unit_id: 'u1',
  app_id: 'a1',
  role: 'Manager',
  status: 'active',
  version: 4,
}

describe('passport sync handlers', () => {
  // The #1 trap in the contract, and nothing else in this repo can catch it.
  //
  // `applyEvent` resolves a handler by property lookup and SKIPS an absent one —
  // that tolerance is what makes unknown event types forward-compatible, and it is
  // exactly why a MISNAMED or missing handler is indistinguishable from a
  // deliberately unhandled event. It does not raise. It silently drops every event
  // of that type while the route keeps answering 200.
  //
  // `tsc` cannot help: `SyncHandlers` declares every method optional, so omitting
  // one — or spelling it `upsertOrganization` — is well-typed. So this reads the
  // SDK's own DISPATCH table (the wire contract) and asserts we answer every entry.
  it('the wire contract still has exactly 17 event types', () => {
    // Asserts this test's own premise. If Passport adds an event type, this fails
    // and the right response is to implement it — not to relax the number.
    expect(Object.keys(DISPATCH)).toHaveLength(17)
  })

  it('implements a correctly-named handler for every dispatched event type', () => {
    const handlers = createPassportSyncHandlers(recordingWriter().writer) as unknown as Record<
      string,
      unknown
    >

    const missing: string[] = []
    for (const [eventType, entry] of Object.entries(DISPATCH)) {
      if (typeof handlers[entry.method] !== 'function')
        missing.push(`${eventType} -> ${entry.method}`)
    }

    // Named rather than counted, so a failure says which event silently stopped
    // projecting.
    expect(missing).toEqual([])
  })

  // The regression that shipped broken in the reference consumer and was found by
  // driving a running receiver, not by a test. `applyEvent` does
  // `const h = handlers[method]; await h(payload)` — so a class whose handlers
  // delegate through `this.` throws `Cannot read properties of undefined`.
  //
  // Closures have no `this` to lose, so this cannot fail here. It is asserted
  // anyway, because the property that matters is "survives a detached call", and a
  // future refactor to a class would reintroduce the trap invisibly to `tsc`.
  it('survives being called DETACHED from the object, as applyEvent calls it', async () => {
    const { writer, calls } = recordingWriter()
    const handlers = createPassportSyncHandlers(writer) as unknown as Record<
      string,
      (p: unknown) => Promise<void>
    >

    // The five that reuse another handler are the ones a `this.` would break.
    for (const [method, payload] of [
      ['archiveOrg', ORG],
      ['archiveUnit', UNIT],
      ['removeMembership', MEMBERSHIP],
      ['removeUnitAppMembership', UAM],
      [
        'resyncOrg',
        {
          organizations: [ORG],
          units: [],
          unit_relations: [],
          memberships: [],
          identity_links: [],
          entitlements: [],
          unit_app_accesses: [],
          unit_app_memberships: [],
        },
      ],
    ] as const) {
      const detached = handlers[method]!
      await expect(detached(payload)).resolves.toBeUndefined()
    }

    expect(calls.map((c) => c.method)).toEqual([
      'writeOrganization',
      'writeUnit',
      'writeMembership',
      'writeUnitAppMembership',
      'writeOrganization',
    ])
  })

  describe('the three handlers that do not do what their names suggest', () => {
    it('membership.removed is an UPSERT keeping the tombstone, not a delete', async () => {
      const { writer, calls } = recordingWriter()
      const handlers = createPassportSyncHandlers(writer)

      await handlers.removeMembership!({ ...MEMBERSHIP, status: 'removed', version: 6 })

      // Deleting instead loses the tombstone, and reconciliation then resurrects
      // the membership from the snapshot — a revoked user regaining access.
      expect(calls).toHaveLength(1)
      expect(calls[0]?.method).toBe('writeMembership')
      expect(calls[0]?.arg).toMatchObject({ status: 'removed', version: 6 })
    })

    it('unit_app_membership.removed is the same upsert', async () => {
      const { writer, calls } = recordingWriter()
      const handlers = createPassportSyncHandlers(writer)

      await handlers.removeUnitAppMembership!({ ...UAM, status: 'removed', version: 5 })

      expect(calls[0]?.method).toBe('writeUnitAppMembership')
      expect(calls[0]?.arg).toMatchObject({ status: 'removed' })
    })

    it('entitlement revocation arrives as an upsert and is never filtered out', async () => {
      const { writer, calls } = recordingWriter()
      const handlers = createPassportSyncHandlers(writer)

      // The org-level kill switch. There is no entitlement-remove event.
      await handlers.upsertEntitlement!({
        id: 'e1',
        organization_id: 'o1',
        app_id: 'a1',
        status: 'suspended',
        tier: null,
        source: 'admin',
        version: 2,
      })

      expect(calls[0]?.arg).toMatchObject({ status: 'suspended' })
    })
  })

  describe('only the three immutable aggregates delete anything', () => {
    it('deletes a relation, an identity link and a unit-app-access row', async () => {
      const { writer, calls } = recordingWriter()
      const handlers = createPassportSyncHandlers(writer)

      await handlers.removeRelation!({
        id: 'rel1',
        organization_id: 'o1',
        from_unit_id: 'u2',
        to_unit_id: 'u1',
        relation: 'belongs_to_brand',
      })
      await handlers.removeIdentityLink!({
        id: 'l1',
        platform_user_id: 'p1',
        app_id: 'a1',
        subject: 's1',
        linked_via: 'email_match',
      })
      await handlers.removeUnitAppAccess!({
        id: 'x1',
        organization_id: 'o1',
        unit_id: 'u1',
        app_id: 'a1',
      })

      expect(calls.map((c) => c.method)).toEqual([
        'deleteUnitRelation',
        'deleteIdentityLink',
        'deleteUnitAppAccess',
      ])
      // Deletes take an id, not a row.
      expect(calls.map((c) => c.arg)).toEqual(['rel1', 'l1', 'x1'])
    })
  })

  describe('the wire mapping', () => {
    // Every field name here is load-bearing and a wrong one is SILENT: the SDK's
    // payload schemas strip unknown keys, so `p.unitId` would simply be undefined.
    it('maps every unit field, including the sparse profile columns', async () => {
      const { writer, calls } = recordingWriter()
      const handlers = createPassportSyncHandlers(writer)

      await handlers.upsertUnit!({
        ...UNIT,
        type: 'outlet',
        address: '1 Test Road',
        postal: '123456',
        contact_phone: '+65 0000 0000',
        kind: 'restaurant',
      })

      expect(calls[0]?.arg).toEqual({
        id: 'u1',
        organizationId: 'o1',
        type: 'outlet',
        name: 'Casa Vostra Pte. Ltd.',
        externalRef: 'brandfactory:7',
        status: 'active',
        version: 2,
        uen: null,
        gstRegNo: null,
        registeredAddress: null,
        address: '1 Test Road',
        postal: '123456',
        contactPhone: '+65 0000 0000',
        kind: 'restaurant',
      })
    })

    it('maps membership using platform_user_id and keeps the embedded email verbatim', async () => {
      const { writer, calls } = recordingWriter()
      const handlers = createPassportSyncHandlers(writer)

      await handlers.upsertMembership!(MEMBERSHIP)

      expect(calls[0]?.arg).toEqual({
        id: 'm1',
        organizationId: 'o1',
        // NOT `user_id` — that field does not exist on the wire.
        platformUserId: 'p1',
        role: 'Owner',
        status: 'active',
        version: 5,
        // Stored as sent. Case-insensitive matching is the reader's job, so that
        // the projection stays byte-equal to the snapshot.
        email: 'Bob@Acme.test',
        displayName: 'Bob',
      })
    })

    it('stores both role vocabularies verbatim, and never conflates them', async () => {
      const { writer, calls } = recordingWriter()
      const handlers = createPassportSyncHandlers(writer)

      await handlers.upsertMembership!({ ...MEMBERSHIP, role: 'Admin' })
      await handlers.upsertUnitAppMembership!({ ...UAM, role: 'Staff' })

      // `Owner|Admin|Member` governs Passport; `Manager|Staff` governs this app.
      expect(calls[0]?.arg).toMatchObject({ role: 'Admin' })
      expect(calls[1]?.arg).toMatchObject({ role: 'Staff' })
    })
  })

  it('projects nothing for user.upserted, deliberately', async () => {
    const { writer, calls } = recordingWriter()
    const handlers = createPassportSyncHandlers(writer)

    // `passport.membership` already embeds email + display_name, and the snapshot
    // has no `users` collection to reconcile a mirror against. The handler exists
    // so that "no table" is a decision rather than an absent-handler no-op.
    await handlers.upsertUser!({
      id: 'p1',
      email: 'bob@acme.test',
      display_name: 'Bob',
      status: 'active',
      version: 1,
    })

    expect(calls).toEqual([])
  })

  describe('org.resync', () => {
    const bundle = {
      app_id: 'a1',
      org_id: 'o1',
      resync_id: 'rs1',
      triggered_by: null,
      organizations: [ORG],
      units: [UNIT],
      unit_relations: [
        {
          id: 'rel1',
          organization_id: 'o1',
          from_unit_id: 'u2',
          to_unit_id: 'u1',
          relation: 'belongs_to_brand',
        },
      ],
      memberships: [MEMBERSHIP],
      identity_links: [
        {
          id: 'l1',
          platform_user_id: 'p1',
          app_id: 'a1',
          subject: 's1',
          linked_via: 'email_match',
        },
      ],
      entitlements: [
        {
          id: 'e1',
          organization_id: 'o1',
          app_id: 'a1',
          status: 'active',
          tier: null,
          source: 'admin',
          version: 1,
        },
      ],
      unit_app_accesses: [{ id: 'x1', organization_id: 'o1', unit_id: 'u1', app_id: 'a1' }],
      unit_app_memberships: [UAM],
    }

    it('applies the whole bundle in FK-safe order', async () => {
      const { writer, calls } = recordingWriter()
      const handlers = createPassportSyncHandlers(writer)

      await handlers.resyncOrg!(bundle)

      // Order matters for coherence at every intermediate point, not for
      // constraints — there are deliberately none between these tables.
      expect(calls.map((c) => c.method)).toEqual([
        'writeOrganization',
        'writeUnit',
        'writeUnitRelation',
        'writeMembership',
        'writeIdentityLink',
        'writeEntitlement',
        'writeUnitAppAccess',
        'writeUnitAppMembership',
      ])
    })

    it('never deletes — a resync is upsert-only', async () => {
      const { writer, calls } = recordingWriter()
      const handlers = createPassportSyncHandlers(writer)

      await handlers.resyncOrg!(bundle)

      // The bundle's `identity_links` are a per-org SUBSET and never
      // authoritative, so a resync must never feed a pruning path. A single
      // delete here would drop rows Passport simply did not mention.
      expect(calls.filter((c) => c.method.startsWith('delete'))).toEqual([])
    })

    it('applies an empty bundle without touching anything', async () => {
      const { writer, calls } = recordingWriter()
      const handlers = createPassportSyncHandlers(writer)

      await handlers.resyncOrg!({
        ...bundle,
        organizations: [],
        units: [],
        unit_relations: [],
        memberships: [],
        identity_links: [],
        entitlements: [],
        unit_app_accesses: [],
        unit_app_memberships: [],
      })

      expect(calls).toEqual([])
    })
  })

  it('lets a writer error PROPAGATE, so the route can answer 500', async () => {
    // A swallowed error acks an event that was never applied, and the projection
    // loses it forever. Passport only retries on a non-2xx.
    const handlers: SyncHandlers = createPassportSyncHandlers({
      ...recordingWriter().writer,
      writeOrganization: async () => {
        throw new Error('constraint violation')
      },
    })

    await expect(handlers.upsertOrg!(ORG)).rejects.toThrow('constraint violation')
  })
})
